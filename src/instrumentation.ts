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

  // Validate required env vars at startup, not lazily on first request
  if (!process.env.DATABASE_URL) {
    console.warn("[instrumentation] DATABASE_URL not set — skipping bootstrap");
    return;
  }
  if (!process.env.JWT_SECRET) {
    console.warn("[instrumentation] JWT_SECRET not set — auth will not work");
  }

  // Signup-Flow DSGVO: IP hashing needs a stable salt. Fail fast at boot
  // rather than silently falling back to an empty salt on the first request.
  const salt = process.env.IP_HASH_SALT;
  if (!salt || salt.trim().length < 16) {
    throw new Error(
      "[instrumentation] FATAL: IP_HASH_SALT must be set and at least 16 chars — signup flow requires a stable IP hash salt",
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
      const { bootstrapAdmin } = await import("./lib/auth");

      await ensureSchema();
      await seedIfEmpty();
      await bootstrapAdmin();

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
