/**
 * Env-scoped session-version helpers (Sprint T1-S).
 *
 * Storage: `admin_session_version(user_id, env, token_version, updated_at)`
 * with composite PK `(user_id, env)`. Env-scope prevents a staging-logout
 * from invalidating prod sessions (staging + prod share admin_users).
 *
 * Node-only — imports `pg`. Callers who need the current env come from
 * Node-runtime surfaces: `requireAuth` (api-helpers.ts), `login()`
 * (auth.ts), `bumpTokenVersionForLogout()` caller (logout route),
 * `layout.tsx` (Dashboard server-component). The pure env-derivation is
 * in `runtime-env.ts` (Edge-safe).
 */

import pool from "./db";
import type { RuntimeEnv } from "./runtime-env";

/**
 * Read the current `token_version` for the given (user, env) pair.
 * Missing row = treated as 0 so:
 *   - Fresh DB after migration matches legacy JWTs that have no `tv`
 *     claim (validateTv returns 0 in auth-cookie.ts).
 *   - No backfill required — the first logout lazily inserts a row.
 */
export async function getTokenVersion(
  userId: number,
  env: RuntimeEnv,
): Promise<number> {
  const { rows } = await pool.query<{ token_version: number }>(
    `SELECT token_version FROM admin_session_version
     WHERE user_id = $1 AND env = $2`,
    [userId, env],
  );
  return rows.length === 0 ? 0 : rows[0].token_version;
}

/**
 * Bump `token_version` for the given (user, env) pair atomically.
 *
 * Two-shape upsert:
 *   - Missing row (first logout after deploy) → INSERT with tv=1. The
 *     INSERT path ignores `expectedTv` because there is nothing to
 *     compare against — the caller's invariant is "after this call, all
 *     JWTs with tv <= returned value are invalid", which holds for any
 *     returned value ≥ 1.
 *   - Existing row → CAS via `WHERE token_version = $expectedTv`. Dual-
 *     tab concurrent logouts match only once; the second call's
 *     `DO UPDATE ... WHERE` returns 0 rows, so `RETURNING` is empty and
 *     the helper returns `null`.
 *
 * The caller (logout route) treats `null` the same as success + emits
 * `200 + clear cookies` either way (idempotent logout).
 *
 * Orphan-row acceptance: no admin-existence check. A logout after an
 * admin has been DELETEd creates an orphan row; harmless, prune-bar via
 * `DELETE FROM admin_session_version WHERE user_id NOT IN
 * (SELECT id FROM admin_users)`.
 */
export async function bumpTokenVersionForLogout(
  userId: number,
  env: RuntimeEnv,
  expectedTv: number,
): Promise<number | null> {
  const { rows } = await pool.query<{ token_version: number }>(
    `INSERT INTO admin_session_version (user_id, env, token_version)
     VALUES ($1, $2, 1)
     ON CONFLICT (user_id, env)
     DO UPDATE SET token_version = admin_session_version.token_version + 1,
                   updated_at = NOW()
     WHERE admin_session_version.token_version = $3
     RETURNING token_version`,
    [userId, env, expectedTv],
  );
  return rows.length === 0 ? null : rows[0].token_version;
}
