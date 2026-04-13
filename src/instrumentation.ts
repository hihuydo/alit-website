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

  // Retry to bridge ~30s reboot race when DB starts after the app container.
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
      const delay = delays[attempt];
      console.warn(
        `[instrumentation] bootstrap attempt ${attempt + 1}/${delays.length} failed, retrying in ${delay}ms`,
        err instanceof Error ? err.message : err,
      );
      if (attempt < delays.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  console.error("[instrumentation] FATAL: bootstrap failed after all retries", lastErr);
  throw lastErr;
}
