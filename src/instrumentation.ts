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

  try {
    const { ensureSchema } = await import("./lib/schema");
    const { seedIfEmpty } = await import("./lib/seed");
    const { bootstrapAdmin } = await import("./lib/auth");
    await ensureSchema();
    await seedIfEmpty();
    await bootstrapAdmin();
    console.log("[instrumentation] Bootstrap complete");
  } catch (err) {
    console.error("[instrumentation] FATAL: bootstrap failed", err);
    throw err;
  }
}
