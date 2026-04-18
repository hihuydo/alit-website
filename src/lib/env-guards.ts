/**
 * Pure guard helpers for boot-time environment validation.
 *
 * Used by src/instrumentation.ts to fail-fast at container startup when a
 * required env var is missing or too short — instead of silently degrading
 * and surfacing a cryptic error on the first request. Pattern:
 * patterns/nextjs.md (eager env-validation für Salts/Secrets/Keys).
 */

/**
 * Assert that an env value is defined, non-empty (after trim), and at least
 * `minLength` characters long. Throws a diagnostic error otherwise.
 *
 * Uses TypeScript assertion-return-type: after a successful call, the value
 * is narrowed to `string` without requiring `!` or `?? ""` at the call site.
 *
 * @param name      — env var name for the error message (e.g. `"JWT_SECRET"`)
 * @param value     — the raw `process.env.NAME` read
 * @param minLength — minimum character count after `.trim()`
 * @param purpose   — short description of why this env var matters
 *                    (appears in the error, helps ops diagnose)
 *
 * @example
 *   assertMinLengthEnv(
 *     "JWT_SECRET",
 *     process.env.JWT_SECRET,
 *     32,
 *     "JWT sign/verify",
 *   );
 */
export function assertMinLengthEnv(
  name: string,
  value: string | undefined,
  minLength: number,
  purpose: string,
): asserts value is string {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length < minLength) {
    throw new Error(
      `[instrumentation] FATAL: ${name} must be set and at least ${minLength} chars — required for ${purpose}`,
    );
  }
}
