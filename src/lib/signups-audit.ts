import pool from "@/lib/db";

/**
 * Resolve the email of the admin performing a signups action (single or
 * bulk delete, paid-toggle) from an already-authenticated user-ID.
 *
 * Sprint B refactor: this helper used to verify the session cookie
 * itself. That path now lives in `requireAuth`, which calls
 * `verifySessionDualRead` exactly once per request and bumps the
 * cookie-source counter. Routes pass `auth.userId` here so we do not
 * double-bump the observability counter.
 *
 * Best-effort — returns `undefined` on any lookup failure so audit code
 * paths never block the delete itself.
 */
export async function resolveActorEmail(
  userId: number,
): Promise<string | undefined> {
  try {
    const { rows } = await pool.query(
      "SELECT email FROM admin_users WHERE id = $1",
      [userId],
    );
    return rows[0]?.email;
  } catch {
    return undefined;
  }
}
