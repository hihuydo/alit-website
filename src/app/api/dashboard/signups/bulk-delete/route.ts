import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import { verifySession } from "@/lib/auth";
import { getClientIp } from "@/lib/client-ip";
import { auditLog } from "@/lib/audit";
import { SIGNUPS_BULK_DELETE_MAX } from "@/lib/signups-limits";

const TABLE: Record<string, "memberships" | "newsletter_subscribers"> = {
  memberships: "memberships",
  newsletter: "newsletter_subscribers",
};

export async function POST(req: NextRequest) {
  const authErr = await requireAuth(req);
  if (authErr) return authErr;

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
  const { type, ids } = body as { type?: unknown; ids?: unknown };

  // Own-property check so prototype keys like "toString" / "__proto__"
  // never slip through and produce a malformed SQL identifier.
  if (typeof type !== "string" || !Object.hasOwn(TABLE, type)) {
    return NextResponse.json(
      { success: false, error: "invalid_input" },
      { status: 400 },
    );
  }
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.length > SIGNUPS_BULK_DELETE_MAX ||
    !ids.every((n) => Number.isInteger(n) && (n as number) > 0)
  ) {
    return NextResponse.json(
      { success: false, error: "invalid_input" },
      { status: 400 },
    );
  }

  const table = TABLE[type];
  const idList = ids as number[];

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
    // DELETE … RETURNING id gives us the *actually deleted* rows, so audit
    // entries reflect real state instead of every request-id (idempotent
    // semantics stay consistent with the single-id DELETE route).
    const { rows } = await pool.query<{ id: number }>(
      `DELETE FROM ${table} WHERE id = ANY($1::int[]) RETURNING id`,
      [idList],
    );
    const ip = getClientIp(req.headers);
    for (const { id } of rows) {
      auditLog("signup_delete", {
        ip,
        actor_email: actorEmail,
        type: type as "memberships" | "newsletter",
        row_id: id,
      });
    }
    return NextResponse.json({ success: true, deleted: rows.length });
  } catch (err) {
    console.error("[dashboard/signups bulk-delete POST]", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
