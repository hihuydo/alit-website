import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireAuth, validateId, internalError } from "@/lib/api-helpers";

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
