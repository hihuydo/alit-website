import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireAuth, validateId } from "@/lib/api-helpers";
import { verifySession } from "@/lib/auth";
import { getClientIp } from "@/lib/client-ip";
import { auditLog } from "@/lib/audit";

const TABLE: Record<string, "memberships" | "newsletter_subscribers"> = {
  memberships: "memberships",
  newsletter: "newsletter_subscribers",
};

type RouteContext = { params: Promise<{ type: string; id: string }> };

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const authErr = await requireAuth(req);
  if (authErr) return authErr;

  const { type, id: idStr } = await ctx.params;
  const table = TABLE[type];
  if (!table) {
    return NextResponse.json(
      { success: false, error: "invalid_input" },
      { status: 400 },
    );
  }
  const id = validateId(idStr);
  if (id === null) {
    return NextResponse.json(
      { success: false, error: "invalid_input" },
      { status: 400 },
    );
  }

  // Resolve actor email for audit (best-effort: never block the delete).
  let actorEmail: string | undefined;
  try {
    const token = req.cookies.get("session")?.value;
    if (token) {
      const payload = await verifySession(token);
      if (payload) {
        const { rows } = await pool.query(
          "SELECT email FROM admin_users WHERE id = $1",
          [payload.sub],
        );
        actorEmail = rows[0]?.email;
      }
    }
  } catch {
    /* audit is informational, never blocks the delete */
  }

  try {
    await pool.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
    auditLog("signup_delete", {
      ip: getClientIp(req.headers),
      actor_email: actorEmail,
      type: type as "memberships" | "newsletter",
      row_id: id,
    });
    // Idempotent: existing or already-gone row → 204. UI stays consistent.
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("[dashboard/signups DELETE]", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
