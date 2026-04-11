import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

const COMMON_HEADERS = {
  "Cache-Control": "public, max-age=86400, must-revalidate",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "sandbox; default-src 'none';",
};

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
      "SELECT data, mime_type FROM media WHERE public_id = $1",
      [publicId]
    );
    if (rows.length === 0) {
      return new NextResponse("Not found", { status: 404 });
    }

    const { data, mime_type } = rows[0];
    const buf: Buffer = data;
    const total = buf.length;

    // Handle Range requests (needed for video seeking)
    const range = req.headers.get("range");
    if (range) {
      // Suffix range: bytes=-N (last N bytes)
      const suffixMatch = range.match(/^bytes=-(\d+)$/);
      if (suffixMatch) {
        const suffix = parseInt(suffixMatch[1], 10);
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
      },
    });
  } catch (err) {
    console.error("[media/GET]", err);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
