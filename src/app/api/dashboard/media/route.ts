import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireAuth, internalError } from "@/lib/api-helpers";

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);
const ALLOWED_VIDEO_TYPES = new Set(["video/mp4", "video/webm"]);
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50 MB

export async function GET(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  try {
    const { rows } = await pool.query(
      "SELECT id, public_id, filename, mime_type, size, created_at FROM media ORDER BY created_at DESC"
    );

    // Find references for each media item across journal AND agenda.
    // Journal: content (rich-text JSON with /api/media/<uuid>/ paths) +
    //   legacy images column (paths).
    // Agenda: content (same rich-text), plus the new images column which
    //   stores raw public_ids in JSON like {"public_id":"<uuid>",...}.
    const [{ rows: journalEntries }, { rows: agendaEntries }] = await Promise.all([
      pool.query(
        "SELECT id, date, title, content::text as content_text, images::text as images_text FROM journal_entries"
      ),
      pool.query(
        "SELECT id, datum, titel, content::text as content_text, images::text as images_text FROM agenda_items"
      ),
    ]);

    const data = rows.map((media: { public_id: string; [key: string]: unknown }) => {
      const mediaPath = `/api/media/${media.public_id}`;
      const publicId = media.public_id;
      const usedIn: { kind: "journal" | "agenda"; id: number; label: string }[] = [];

      for (const e of journalEntries as { id: number; date: string; title: string | null; content_text: string | null; images_text: string | null }[]) {
        if (
          (e.content_text && e.content_text.includes(mediaPath)) ||
          (e.images_text && e.images_text.includes(mediaPath))
        ) {
          usedIn.push({ kind: "journal", id: e.id, label: e.title ? `${e.date}: ${e.title}` : e.date });
        }
      }
      for (const e of agendaEntries as { id: number; datum: string; titel: string; content_text: string | null; images_text: string | null }[]) {
        // images_text is JSON with raw public_ids; content_text contains
        // /api/media/<uuid>/ paths from the rich-text editor.
        if (
          (e.content_text && e.content_text.includes(mediaPath)) ||
          (e.images_text && e.images_text.includes(publicId))
        ) {
          usedIn.push({ kind: "agenda", id: e.id, label: `${e.datum}: ${e.titel}` });
        }
      }

      return { ...media, used_in: usedIn };
    });

    return NextResponse.json({ success: true, data });
  } catch (err) {
    return internalError("media/GET", err);
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  // Pre-check Content-Length before buffering body (generous margin for multipart overhead)
  const contentLength = parseInt(req.headers.get("content-length") ?? "0", 10);
  if (contentLength > MAX_VIDEO_SIZE * 1.1) {
    return NextResponse.json(
      { success: false, error: `File too large. Max ${MAX_VIDEO_SIZE / (1024 * 1024)} MB` },
      { status: 413 }
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 }
      );
    }

    const mimeType = file.type;
    const isImage = ALLOWED_IMAGE_TYPES.has(mimeType);
    const isVideo = ALLOWED_VIDEO_TYPES.has(mimeType);

    if (!isImage && !isVideo) {
      return NextResponse.json(
        { success: false, error: "File type not allowed. Allowed: JPEG, PNG, GIF, WebP, MP4, WebM" },
        { status: 400 }
      );
    }

    const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
    if (file.size > maxSize) {
      const limitMb = maxSize / (1024 * 1024);
      return NextResponse.json(
        { success: false, error: `File too large. Max ${limitMb} MB` },
        { status: 413 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const publicId = crypto.randomUUID();

    const { rows } = await pool.query(
      `INSERT INTO media (public_id, filename, mime_type, size, data)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, public_id, filename, mime_type, size, created_at`,
      [publicId, filename, mimeType, file.size, buffer]
    );

    return NextResponse.json({ success: true, data: rows[0] }, { status: 201 });
  } catch (err) {
    return internalError("media/POST", err);
  }
}
