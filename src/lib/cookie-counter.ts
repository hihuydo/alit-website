/**
 * Observability counter for the cookie migration (Sprint B).
 *
 * Fire-and-forget DB write per authenticated request. Node-only — holds
 * `pg` and must never be imported from Edge-runtime code. Callers hit
 * this from `requireAuth` and from the account handlers' inline verify;
 * see `tasks/spec.md` §Requirements 3 for the single-bump rule.
 *
 * Die Metrik entscheidet später den Flip auf `__Host-session` only
 * (Sprint C). Sie MUSS daher unter DB-Outage nicht silent verloren
 * gehen — stdout-Fallback via strukturiertem JSON-Log spiegelt das
 * `auditLog`-Pattern (`src/lib/audit.ts`).
 */

import pool from "./db";

export type CookieSource = "primary" | "legacy";
export type CookieEnv = "prod" | "staging";

/**
 * Derive `prod` or `staging` from the container's SITE_URL hostname.
 * Evaluated at module load — SITE_URL is hard-set per compose file
 * and does not change during the process lifetime.
 */
export function deriveEnv(siteUrl: string | undefined = process.env.SITE_URL): CookieEnv {
  const raw = siteUrl?.trim();
  if (!raw) return "prod";
  try {
    const host = new URL(raw).hostname;
    return host.startsWith("staging.") ? "staging" : "prod";
  } catch {
    return "prod";
  }
}

const COUNTER_ENV: CookieEnv = deriveEnv();

function stdoutFallback(
  source: CookieSource,
  env: CookieEnv,
  err: unknown,
): void {
  const timestamp = new Date().toISOString();
  const isoDate = timestamp.slice(0, 10);
  console.error(
    "[cookie-counter] bump failed, emitting stdout fallback:",
    err instanceof Error ? err.message : err,
  );
  console.log(
    JSON.stringify({
      type: "cookie_bump_fallback",
      date: isoDate,
      source,
      env,
      timestamp,
    }),
  );
}

/**
 * Fire-and-forget increment of `auth_method_daily`. The caller must
 * invoke as `void bumpCookieSource(source)` so a DB hiccup cannot
 * block the auth path. Any error is absorbed and mirrored to stdout
 * so log aggregation can reconstruct counts during DB outages.
 */
export function bumpCookieSource(source: CookieSource): void {
  void pool
    .query(
      `INSERT INTO auth_method_daily (date, source, env, count)
       VALUES (CURRENT_DATE, $1, $2, 1)
       ON CONFLICT (date, source, env)
       DO UPDATE SET count = auth_method_daily.count + 1`,
      [source, COUNTER_ENV],
    )
    .catch((err) => stdoutFallback(source, COUNTER_ENV, err));
}
