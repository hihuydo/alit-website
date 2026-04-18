import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireAuth, validateId } from "@/lib/api-helpers";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { id: idStr } = await ctx.params;
  const id = validateId(idStr);
  if (id === null) {
    return NextResponse.json(
      { success: false, error: "invalid_input" },
      { status: 400 },
    );
  }

  try {
    // Hard LIMIT 100: a membership row realistically has few toggle events;
    // going past 100 likely indicates noise or a bug, not missing history.
    const { rows } = await pool.query(
      `SELECT id, event, actor_email, details, created_at
         FROM audit_events
        WHERE entity_type = 'memberships' AND entity_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT 100`,
      [id],
    );
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    console.error("[dashboard/audit memberships GET]", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
