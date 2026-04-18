import { assertMinLengthEnv } from "./lib/env-guards";

// Connection-level errors that justify a retry (DB still booting / network race).
// Permanent errors (bad SQL, missing env, auth) bubble up immediately.
function isTransientDbError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  const transientCodes = new Set([
    "ECONNREFUSED",
    "ENOTFOUND",
    "ETIMEDOUT",
    "ECONNRESET",
    "08006", // pg: connection_failure
    "08001", // pg: sqlclient_unable_to_establish_sqlconnection
    "57P03", // pg: cannot_connect_now
  ]);
  if (e.code && transientCodes.has(e.code)) return true;
  return /ECONN(REFUSED|RESET)|ETIMEDOUT|ENOTFOUND|terminating connection/i.test(
    e.message ?? "",
  );
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Validate required env vars at startup, not lazily on first request.
  // DATABASE_URL stays warn-only: test envs and ad-hoc CLI invocations
  // legitimately run without a DB, and bootstrap short-circuits anyway.
  if (!process.env.DATABASE_URL) {
    console.warn("[instrumentation] DATABASE_URL not set — skipping bootstrap");
    return;
  }

  // Secrets get fail-fast: silent-degrade would surface as cryptic runtime
  // errors on first login/signup, hours after boot. Better to refuse to start.
  // Static import (top of file): TypeScript `asserts` return types require
  // the call target to have an explicit declared type at the call site.
  assertMinLengthEnv(
    "JWT_SECRET",
    process.env.JWT_SECRET,
    32,
    "JWT sign/verify",
  );

  // Signup-Flow DSGVO: IP hashing needs a stable salt.
  const salt = process.env.IP_HASH_SALT;
  if (!salt || salt.trim().length < 16) {
    throw new Error(
      "[instrumentation] FATAL: IP_HASH_SALT must be set and at least 16 chars — signup flow requires a stable IP hash salt",
    );
  }

  // BCRYPT_ROUNDS observability — warn but do not crash. Below-OWASP rounds
  // must stay deployable for emergency rollback. Uses the same parser as
  // src/lib/auth.ts so both code paths agree on the effective value and
  // warning text.
  const { parseBcryptRounds } = await import("./lib/bcrypt-rounds");
  const { rounds, warning } = parseBcryptRounds(process.env.BCRYPT_ROUNDS);
  if (warning) console.warn(`[instrumentation] ${warning}`);
  if (process.env.NODE_ENV !== "test" && rounds < 12) {
    console.warn(
      `[instrumentation] BCRYPT_ROUNDS=${rounds} is below OWASP 2026 Tier-0 minimum (12). Only acceptable in test env or emergency rollback.`,
    );
  }

  // Retry only transient DB connection errors to bridge ~30s reboot race.
  // 5 attempts with exponential backoff (2s, 4s, 8s, 16s, 30s).
  const delays = [2000, 4000, 8000, 16000, 30000];
  let lastErr: unknown;

  for (let attempt = 0; attempt < delays.length; attempt++) {
    try {
      const { ensureSchema } = await import("./lib/schema");
      const { seedIfEmpty } = await import("./lib/seed");
      const { bootstrapAdmin, adjustDummyHashForLegacyRounds } = await import(
        "./lib/auth"
      );

      await ensureSchema();
      await seedIfEmpty();
      await bootstrapAdmin();

      // Mixed-cost timing-leak mitigation (Codex PR #69 [P2]): after
      // bootstrap, query the minimum bcrypt cost in admin_users and
      // lower the DUMMY_HASH cost to match if any legacy hashes linger.
      // Best-effort — a DB hiccup here must not abort bootstrap.
      try {
        const { default: pool } = await import("./lib/db");
        const { rows } = await pool.query(
          "SELECT MIN(CAST(substring(password FROM 5 FOR 2) AS int)) AS min_cost " +
            "FROM admin_users WHERE password LIKE '$2_$__$%'",
        );
        const observed = rows[0]?.min_cost;
        if (Number.isInteger(observed) && observed < rounds) {
          adjustDummyHashForLegacyRounds(observed);
        }
      } catch (err) {
        console.warn(
          "[instrumentation] could not check admin_users for legacy hash costs:",
          err instanceof Error ? err.message : err,
        );
      }

      console.log("[instrumentation] Bootstrap complete");
      return;
    } catch (err) {
      lastErr = err;
      if (!isTransientDbError(err)) {
        console.error(
          "[instrumentation] FATAL: non-transient bootstrap error, failing fast.",
          "Likely causes: JWT_SECRET missing/short, broken migration, or seed/auth config error.",
          err,
        );
        throw err;
      }
      const delay = delays[attempt];
      console.warn(
        `[instrumentation] transient DB error on attempt ${attempt + 1}/${delays.length}, retrying in ${delay}ms`,
        err instanceof Error ? err.message : err,
      );
      if (attempt < delays.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  console.error(
    "[instrumentation] FATAL: bootstrap failed after all retries",
    lastErr,
  );
  throw lastErr;
}
