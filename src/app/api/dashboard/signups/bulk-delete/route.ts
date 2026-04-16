import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import { getClientIp } from "@/lib/client-ip";
import { auditLog } from "@/lib/audit";
import { resolveActorEmail } from "@/lib/signups-audit";
import { validateBulkDeletePayload } from "@/lib/signups-bulk-delete-validation";

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

  const validation = validateBulkDeletePayload(body);
  if (!validation.valid) {
    return NextResponse.json(
      { success: false, error: validation.error },
      { status: 400 },
    );
  }
  const { type, ids } = validation.payload;
  const table = validation.table;

  const actorEmail = await resolveActorEmail(req);

  try {
    // DELETE … RETURNING id gives us the *actually deleted* rows, so audit
    // entries reflect real state instead of every request-id (idempotent
    // semantics stay consistent with the single-id DELETE route).
    const { rows } = await pool.query<{ id: number }>(
      `DELETE FROM ${table} WHERE id = ANY($1::int[]) RETURNING id`,
      [ids],
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
