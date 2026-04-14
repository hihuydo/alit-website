import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireAuth, parseBody, validateId, validLength, internalError } from "@/lib/api-helpers";
import { buildUsageIndex } from "@/lib/media-usage";

// Same rule as the upload handler: only safe filename characters,
// anything else becomes "_". Keeps the filename usable in
// Content-Disposition without needing RFC 5987 encoding.
function sanitizeFilename(raw: string): string {
  return raw.trim().replace(/[^a-zA-Z0-9._-]/g, "_");
}

// Extract the last `.<ext>` from a filename, if any. Case-preserving.
// Returns "" for files with no extension (or a leading-dot-only name).
function extensionOf(filename: string): string {
  const idx = filename.lastIndexOf(".");
  if (idx <= 0 || idx === filename.length - 1) return "";
  return filename.slice(idx);
}

// Fallback extension when the stored filename has none — derived from
// mime type so a PDF uploaded without a suffix (e.g. "my-document")
// still downloads with a usable .pdf extension after rename.
function extensionFromMime(mimeType: string): string {
  if (mimeType === "application/pdf") return ".pdf";
  if (mimeType === "application/zip" || mimeType === "application/x-zip-compressed") return ".zip";
  return "";
}

// Renames must preserve the original file extension — the filename is
// threaded into Content-Disposition on download, so losing or changing
// the extension would produce a misleading/unusable saved file.
// If the admin-supplied name already ends in the right extension, keep
// it; if they omit or use a different one, append the original (or one
// derived from mime_type when the original was extensionless).
function applyRename(original: string, mimeType: string, userInput: string): string {
  const clean = sanitizeFilename(userInput);
  if (!clean) return "";
  // Require at least one alphanumeric character somewhere — rejects inputs
  // like "." or "__" that otherwise pass the char allowlist but produce
  // nonsense filenames.
  if (!/[a-zA-Z0-9]/.test(clean)) return "";
  const ext = extensionOf(original) || extensionFromMime(mimeType);
  if (!ext) return clean; // nothing to preserve or derive (e.g. images)
  if (clean.toLowerCase().endsWith(ext.toLowerCase())) return clean;
  // Drop any extension the user typed (likely a different/typo one) and
  // append the authoritative extension.
  const base = clean.replace(/\.[^.]+$/, "");
  return `${base || clean}${ext}`;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  const { id: raw } = await params;
  const id = validateId(raw);
  if (!id) {
    return NextResponse.json(
      { success: false, error: "Invalid id" },
      { status: 400 }
    );
  }

  const body = await parseBody<{ filename?: string }>(req);
  if (!body || typeof body.filename !== "string") {
    return NextResponse.json(
      { success: false, error: "filename required" },
      { status: 400 }
    );
  }

  if (!validLength(body.filename, 255)) {
    return NextResponse.json(
      { success: false, error: "filename too long" },
      { status: 400 }
    );
  }

  try {
    // Look up the existing filename + mime first. Mime is needed to derive
    // a fallback extension when the stored filename has none (e.g. uploads
    // that came in with a bare name).
    const { rows: existingRows } = await pool.query(
      "SELECT filename, mime_type FROM media WHERE id = $1",
      [id]
    );
    if (existingRows.length === 0) {
      return NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404 }
      );
    }
    const finalName = applyRename(existingRows[0].filename, existingRows[0].mime_type, body.filename);
    if (!finalName) {
      return NextResponse.json(
        { success: false, error: "filename must contain at least one safe character" },
        { status: 400 }
      );
    }

    const { rows, rowCount } = await pool.query(
      "UPDATE media SET filename = $1 WHERE id = $2 RETURNING id, public_id, filename, mime_type, size, created_at",
      [finalName, id]
    );
    if (!rowCount) {
      return NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, data: rows[0] });
  } catch (err) {
    return internalError("media/PUT", err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  const { id: raw } = await params;
  const id = validateId(raw);
  if (!id) {
    return NextResponse.json(
      { success: false, error: "Invalid id" },
      { status: 400 }
    );
  }

  try {
    // Look up public_id for reference check
    const { rows: mediaRows } = await pool.query(
      "SELECT public_id FROM media WHERE id = $1",
      [id]
    );
    if (mediaRows.length === 0) {
      return NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404 }
      );
    }

    // Check references via shared registry so journal + agenda (and any future
    // source) are covered uniformly. Same source of truth as the GET listing.
    const findUsage = await buildUsageIndex();
    const usage = findUsage(mediaRows[0].public_id);
    if (usage.length > 0) {
      const refList = usage.map((u) => u.label).join(", ");
      return NextResponse.json(
        { success: false, error: `Medium wird noch verwendet in: ${refList}` },
        { status: 409 }
      );
    }

    const { rowCount } = await pool.query(
      "DELETE FROM media WHERE id = $1",
      [id]
    );
    if (!rowCount) {
      return NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return internalError("media/DELETE", err);
  }
}
