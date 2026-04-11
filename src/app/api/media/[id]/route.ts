import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: raw } = await params;
  const id = parseInt(raw, 10);
  if (isNaN(id) || id <= 0 || String(id) !== raw) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const { rows } = await pool.query(
      "SELECT data, mime_type FROM media WHERE id = $1",
      [id]
    );
    if (rows.length === 0) {
      return new NextResponse("Not found", { status: 404 });
    }

    const { data, mime_type } = rows[0];
    return new NextResponse(data, {
      headers: {
        "Content-Type": mime_type,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    console.error("[media/GET]", err);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
