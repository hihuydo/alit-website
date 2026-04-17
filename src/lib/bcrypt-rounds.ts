/**
 * Shared parser for the BCRYPT_ROUNDS env var. Used by both src/lib/auth.ts
 * (runtime hashing) and src/instrumentation.ts (boot-time warning) so both
 * code paths agree on the same effective value and the same warning text.
 *
 * Edge-safe: no pg, bcryptjs, or audit imports — pure logic only.
 */

export const BCRYPT_ROUNDS_DEFAULT = 12;
export const BCRYPT_ROUNDS_MIN = 4;
export const BCRYPT_ROUNDS_MAX = 15;

export function parseBcryptRounds(
  input: string | undefined,
): { rounds: number; warning: string | null } {
  if (input === undefined || input.trim() === "") {
    return { rounds: BCRYPT_ROUNDS_DEFAULT, warning: null };
  }

  const trimmed = input.trim();
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed)) {
    return {
      rounds: BCRYPT_ROUNDS_DEFAULT,
      warning: `BCRYPT_ROUNDS="${input}" is not an integer; defaulting to ${BCRYPT_ROUNDS_DEFAULT}`,
    };
  }

  if (parsed < BCRYPT_ROUNDS_MIN) {
    return {
      rounds: BCRYPT_ROUNDS_MIN,
      warning: `BCRYPT_ROUNDS=${parsed} is below minimum ${BCRYPT_ROUNDS_MIN}; clamped`,
    };
  }

  if (parsed > BCRYPT_ROUNDS_MAX) {
    return {
      rounds: BCRYPT_ROUNDS_MAX,
      warning: `BCRYPT_ROUNDS=${parsed} exceeds sanity maximum ${BCRYPT_ROUNDS_MAX} (login-flood DoS risk); clamped`,
    };
  }

  return { rounds: parsed, warning: null };
}
