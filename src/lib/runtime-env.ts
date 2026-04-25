/**
 * Edge-safe runtime environment derivation.
 *
 * Pure function so leaf modules (session-version.ts, csrf.ts, etc.) can
 * share it without dragging `pg` into Edge-runtime code paths. Originally
 * extracted from cookie-counter.ts during the Sprint-B migration scaffold;
 * kept as a standalone helper after Sprint C retired that module.
 *
 * Resolution order (first non-empty wins):
 *   1. explicit `siteUrl` argument (callers can inject a fixture)
 *   2. `process.env.SITE_URL`  (prod/staging compose sets this)
 *
 * Host starting with `staging.` → "staging"; everything else → "prod".
 * Deliberately no "dev" bucket — local-dev inherits "prod" for DB writes
 * so that multi-env tests stay deterministic, and dev uses the same DB
 * as prod (host.docker.internal:5432).
 */

export type RuntimeEnv = "prod" | "staging";

export function deriveEnv(
  siteUrl: string | undefined = process.env.SITE_URL,
): RuntimeEnv {
  const raw = siteUrl?.trim();
  if (!raw) return "prod";
  try {
    const host = new URL(raw).hostname;
    return host.startsWith("staging.") ? "staging" : "prod";
  } catch {
    return "prod";
  }
}
