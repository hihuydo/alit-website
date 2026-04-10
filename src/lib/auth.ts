import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import pool from "./db";
import { normalizeEmail } from "./email";

const DUMMY_HASH = "$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWX.Y";

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function login(email: string, password: string): Promise<string | null> {
  const normalized = normalizeEmail(email);
  const { rows } = await pool.query(
    "SELECT id, password FROM admin_users WHERE email = $1",
    [normalized]
  );

  if (rows.length === 0) {
    // Dummy compare to prevent timing oracle
    await bcrypt.compare(password, DUMMY_HASH);
    return null;
  }

  const valid = await verifyPassword(password, rows[0].password);
  if (!valid) return null;

  const token = await new SignJWT({ sub: String(rows[0].id) })
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
    [normalized, hash]
  );
}
