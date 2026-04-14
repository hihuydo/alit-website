import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

const COMMON_HEADERS = {
  "Cache-Control": "public, max-age=31536000, immutable",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "sandbox; default-src 'none';",
};

// Browsers render PDFs inline in the tab, ZIPs as a forced download.
// Images + videos get no Content-Disposition (default inline, but letting
// the browser decide keeps `<img>`/`<video>` embedding working cleanly).
// When `forceDownload` is true (caller passed ?download=1), every mime type
// is served as an attachment — used by the admin "Download" button.
// Filename is pulled from DB where it was sanitized at upload (safe chars only).
function dispositionFor(mimeType: string, filename: string, forceDownload: boolean): string | null {
  if (forceDownload) return `attachment; filename="${filename}"`;
  if (mimeType === "application/pdf") return `inline; filename="${filename}"`;
  if (mimeType === "application/zip" || mimeType === "application/x-zip-compressed") {
    return `attachment; filename="${filename}"`;
  }
  return null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: publicId } = await params;
  // Validate UUID format
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(publicId)) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const { rows } = await pool.query(
      "SELECT data, mime_type, filename FROM media WHERE public_id = $1",
      [publicId]
    );
    if (rows.length === 0) {
      return new NextResponse("Not found", { status: 404 });
    }

    const { data, mime_type, filename } = rows[0];
    const buf: Buffer = data;
    const total = buf.length;
    const forceDownload = req.nextUrl.searchParams.has("download");
    const disposition = dispositionFor(mime_type, filename, forceDownload);

    // Handle Range requests (needed for video seeking)
    const range = req.headers.get("range");
    if (range) {
      // Suffix range: bytes=-N (last N bytes)
      const suffixMatch = range.match(/^bytes=-(\d+)$/);
      if (suffixMatch) {
        const suffix = parseInt(suffixMatch[1], 10);
        if (suffix === 0) {
          return new NextResponse(null, {
            status: 416,
            headers: { "Content-Range": `bytes */${total}` },
          });
        }
        const start = Math.max(0, total - suffix);
        const end = total - 1;
        return new NextResponse(new Uint8Array(buf.subarray(start, end + 1)), {
          status: 206,
          headers: {
            ...COMMON_HEADERS,
            "Content-Type": mime_type,
            "Content-Range": `bytes ${start}-${end}/${total}`,
            "Content-Length": String(end - start + 1),
            "Accept-Ranges": "bytes",
            ...(disposition ? { "Content-Disposition": disposition } : {}),
          },
        });
      }
      const match = range.match(/^bytes=(\d+)-(\d*)$/);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? Math.min(parseInt(match[2], 10), total - 1) : total - 1;
        if (start >= total || start > end) {
          return new NextResponse(null, {
            status: 416,
            headers: { "Content-Range": `bytes */${total}` },
          });
        }
        return new NextResponse(new Uint8Array(buf.subarray(start, end + 1)), {
          status: 206,
          headers: {
            ...COMMON_HEADERS,
            "Content-Type": mime_type,
            "Content-Range": `bytes ${start}-${end}/${total}`,
            "Content-Length": String(end - start + 1),
            "Accept-Ranges": "bytes",
            ...(disposition ? { "Content-Disposition": disposition } : {}),
          },
        });
      }
    }

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        ...COMMON_HEADERS,
        "Content-Type": mime_type,
        "Content-Length": String(total),
        "Accept-Ranges": "bytes",
        ...(disposition ? { "Content-Disposition": disposition } : {}),
      },
    });
  } catch (err) {
    console.error("[media/GET]", err);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
