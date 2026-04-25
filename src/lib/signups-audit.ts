import pool from "@/lib/db";

/**
 * Resolve the email of the admin performing a signups action (single or
 * bulk delete, paid-toggle) from an already-authenticated user-ID.
 *
 * The session-cookie verification lives in `requireAuth`, which calls
 * `verifySession` exactly once per request. Routes pass `auth.userId`
 * here so this helper stays a simple email-lookup.
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
