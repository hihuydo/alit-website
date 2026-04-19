/**
 * Edge-safe runtime environment derivation.
 *
 * Pure function extracted from cookie-counter.ts (Sprint B) so that
 * session-version.ts + other leaf modules can share it without dragging
 * `pg` into Edge-runtime code paths.
 *
 * Resolution order (first non-empty wins):
 *   1. explicit `siteUrl` argument (callers can inject a fixture)
 *   2. `process.env.SITE_URL`  (prod/staging compose sets this)
 *
 * Host starting with `staging.` → "staging"; everything else → "prod".
 * Deliberately no "dev" bucket — local-dev inherits "prod" for DB writes
 * so that multi-env tests stay deterministic; cookie-counter already does
 * this and nothing breaks in dev because dev uses the same DB as prod
 * (host.docker.internal:5432).
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
