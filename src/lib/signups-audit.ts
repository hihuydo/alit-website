import type { NextRequest } from "next/server";
import pool from "@/lib/db";
import { verifySession } from "@/lib/auth";

/**
 * Resolve the email of the admin performing a signups action (single or
 * bulk delete) from the session cookie. Best-effort: returns undefined on
 * any lookup failure so audit code paths never block the delete itself.
 *
 * Shared between `/api/dashboard/signups/[type]/[id]` (single DELETE) and
 * `/api/dashboard/signups/bulk-delete` (bulk POST). Keep the try/catch
 * fallback — audit is informational, not a correctness gate.
 */
export async function resolveActorEmail(
  req: NextRequest,
): Promise<string | undefined> {
  try {
    const token = req.cookies.get("session")?.value;
    if (!token) return undefined;
    const payload = await verifySession(token);
    if (!payload) return undefined;
    const { rows } = await pool.query(
      "SELECT email FROM admin_users WHERE id = $1",
      [payload.sub],
    );
    return rows[0]?.email;
  } catch {
    return undefined;
  }
}
