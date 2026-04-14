import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireAuth, validateId, internalError } from "@/lib/api-helpers";
import { buildUsageIndex } from "@/lib/media-usage";

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
