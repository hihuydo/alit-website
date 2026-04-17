import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import pool from "./db";
import { normalizeEmail } from "./email";
import { parseBcryptRounds } from "./bcrypt-rounds";
import { auditLog } from "./audit";

const { rounds: parsedRounds, warning: roundsWarning } = parseBcryptRounds(
  process.env.BCRYPT_ROUNDS,
);
if (roundsWarning) {
  console.warn(`[auth] ${roundsWarning}`);
}
export const BCRYPT_ROUNDS = parsedRounds;

// Timing-oracle dummy: computed at module load with the same cost as the
// configured rounds, so bcrypt.compare on a not-found user takes the same
// time as bcrypt.compare on a real user's hash. Hardcoding the dummy to a
// cost that diverges from BCRYPT_ROUNDS would reopen the timing oracle.
const DUMMY_HASH = bcrypt.hashSync(
  "dummy-password-for-timing-oracle-protection",
  BCRYPT_ROUNDS,
);

const BCRYPT_COST_REGEX = /^\$2[aby]\$(\d{2})\$/;

/**
 * Parse the cost factor out of a bcrypt hash string.
 * Returns null for anything that isn't a bcrypt hash with a 2-digit cost
 * segment (argon2, plain text, malformed-but-dollar-rich, etc.) so the
 * rehash-on-login branch skips cleanly instead of misreading foreign cost
 * bytes.
 */
export function parseCost(hash: string): number | null {
  if (typeof hash !== "string" || hash.length === 0) return null;
  const match = BCRYPT_COST_REGEX.exec(hash);
  if (!match) return null;
  const cost = parseInt(match[1], 10);
  return Number.isInteger(cost) ? cost : null;
}

/**
 * Decide whether a login path should fire a rehash. Extracted so the
 * branch logic can be structurally tested without a live DB.
 * Narrows `currentCost` to `number` on the true branch.
 */
export function shouldRehash(
  currentCost: number | null,
  targetCost: number,
): currentCost is number {
  return (
    currentCost !== null && Number.isFinite(currentCost) && currentCost < targetCost
  );
}

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function login(
  email: string,
  password: string,
  ip: string,
): Promise<string | null> {
  if (password.length > 128) return null;
  const normalized = normalizeEmail(email);
  const { rows } = await pool.query(
    "SELECT id, password FROM admin_users WHERE email = $1",
    [normalized],
  );

  if (rows.length === 0) {
    // Dummy compare to prevent timing oracle
    await bcrypt.compare(password, DUMMY_HASH);
    return null;
  }

  const userId: number = rows[0].id;
  const currentHash: string = rows[0].password;
  const valid = await verifyPassword(password, currentHash);
  if (!valid) return null;

  // Rehash-on-Login: fire-and-forget so login latency stays bounded. The
  // WHERE-password guard is the race gate — a second concurrent login for
  // the same user sees the already-rehashed hash, matches rowCount=0, and
  // skips the duplicate audit emit.
  const currentCost = parseCost(currentHash);
  if (shouldRehash(currentCost, BCRYPT_ROUNDS)) {
    const oldCost = currentCost;
    const newCost = BCRYPT_ROUNDS;
    bcrypt
      .hash(password, BCRYPT_ROUNDS)
      .then(async (newHash) => {
        const result = await pool.query(
          "UPDATE admin_users SET password = $1 WHERE id = $2 AND password = $3",
          [newHash, userId, currentHash],
        );
        if (result.rowCount === 1) {
          auditLog("password_rehashed", {
            ip,
            user_id: userId,
            old_cost: oldCost,
            new_cost: newCost,
          });
        }
      })
      .catch((err) => {
        console.error("[login] rehash_failed:", err);
        try {
          auditLog("rehash_failed", {
            ip,
            user_id: userId,
            reason: err instanceof Error ? err.message : String(err),
          });
        } catch {
          // last-line swallow: audit must not re-throw and mask the original error
        }
      });
  }

  const token = await new SignJWT({ sub: String(userId) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(getJwtSecret());

  return token;
}

export async function verifySession(token: string): Promise<{ sub: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), {
      algorithms: ["HS256"],
    });
    return payload as { sub: string };
  } catch {
    return null;
  }
}

export async function bootstrapAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!email || !hash) return;

  const normalized = normalizeEmail(email);
  await pool.query(
    `INSERT INTO admin_users (email, password) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING`,
    [normalized, hash],
  );
}
