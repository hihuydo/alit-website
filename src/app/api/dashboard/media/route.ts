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
    return NextResponse.json({ success: true, data: rows });
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
