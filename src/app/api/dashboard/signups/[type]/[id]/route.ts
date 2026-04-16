import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireAuth, validateId } from "@/lib/api-helpers";
import { getClientIp } from "@/lib/client-ip";
import { auditLog } from "@/lib/audit";
import { resolveActorEmail } from "@/lib/signups-audit";
import { SIGNUPS_TABLE } from "@/lib/signups-bulk-delete-validation";

type RouteContext = { params: Promise<{ type: string; id: string }> };

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const authErr = await requireAuth(req);
  if (authErr) return authErr;

  const { type, id: idStr } = await ctx.params;
  // Own-property check so prototype keys never reach the SQL identifier.
  if (!Object.hasOwn(SIGNUPS_TABLE, type)) {
    return NextResponse.json(
      { success: false, error: "invalid_input" },
      { status: 400 },
    );
  }
  const table = SIGNUPS_TABLE[type];
  const id = validateId(idStr);
  if (id === null) {
    return NextResponse.json(
      { success: false, error: "invalid_input" },
      { status: 400 },
    );
  }

  const actorEmail = await resolveActorEmail(req);

  try {
    // DELETE … RETURNING id so the audit event fires only when a row was
    // actually removed — matches the bulk-delete invariant so downstream
    // audit readers see one consistent semantic across both routes.
    const { rows } = await pool.query<{ id: number }>(
      `DELETE FROM ${table} WHERE id = $1 RETURNING id`,
      [id],
    );
    if (rows.length > 0) {
      auditLog("signup_delete", {
        ip: getClientIp(req.headers),
        actor_email: actorEmail,
        type: type as "memberships" | "newsletter",
        row_id: id,
      });
    }
    // Idempotent: deleted-now or already-gone → 204. UI stays consistent.
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("[dashboard/signups DELETE]", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
