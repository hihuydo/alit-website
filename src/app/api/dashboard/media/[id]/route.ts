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

    // Check if media is referenced by any journal entry (content blocks or legacy images)
    const mediaPath = `/api/media/${mediaRows[0].public_id}/`;
    const { rows: refs } = await pool.query(
      `SELECT id, title, date FROM journal_entries
       WHERE content::text LIKE $1
          OR images::text LIKE $1`,
      [`%${mediaPath}%`]
    );
    if (refs.length > 0) {
      const refList = refs.map((r: { date: string; title: string | null }) =>
        r.title ? `${r.date}: ${r.title}` : r.date
      ).join(", ");
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
