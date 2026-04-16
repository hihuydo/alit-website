import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireAuth, validateId } from "@/lib/api-helpers";
import { getClientIp } from "@/lib/client-ip";
import { auditLog } from "@/lib/audit";
import { resolveActorEmail } from "@/lib/signups-audit";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const authErr = await requireAuth(req);
  if (authErr) return authErr;

  const { id: idStr } = await ctx.params;
  const id = validateId(idStr);
  if (id === null) {
    return NextResponse.json(
      { success: false, error: "invalid_input" },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "invalid_input" },
      { status: 400 },
    );
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { success: false, error: "invalid_input" },
      { status: 400 },
    );
  }
  const { paid } = body as { paid?: unknown };
  if (typeof paid !== "boolean") {
    return NextResponse.json(
      { success: false, error: "invalid_input" },
      { status: 400 },
    );
  }

  const actorEmail = await resolveActorEmail(req);

  try {
    // Preserve the original payment timestamp across duplicate/retried
    // PATCHes: only stamp paid_at on the actual false→true transition.
    // false-flip always clears it. This keeps exports + audit context
    // accurate for members who were already marked paid (Codex PR #54 R1 [P2]).
    const { rows } = await pool.query<{ id: number; paid: boolean; paid_at: string | null }>(
      `UPDATE memberships
          SET paid = $1,
              paid_at = CASE
                WHEN $1 AND NOT paid THEN NOW()   -- flip to paid: stamp
                WHEN NOT $1          THEN NULL    -- flip to unpaid: clear
                ELSE paid_at                       -- already paid: preserve
              END
        WHERE id = $2
        RETURNING id, paid, paid_at`,
      [paid, id],
    );
    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "not_found" },
        { status: 404 },
      );
    }
    auditLog("membership_paid_toggle", {
      ip: getClientIp(req.headers),
      actor_email: actorEmail,
      row_id: id,
      paid,
    });
    return NextResponse.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error("[dashboard/signups memberships paid PATCH]", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
