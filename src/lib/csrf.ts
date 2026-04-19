/**
 * CSRF signed double-submit token (Sprint T1-S).
 *
 * Token = `HMAC-SHA256(JWT_SECRET, "csrf-v1:" + userId + ":" + tokenVersion)`,
 * base64url-encoded (43 chars). The domain-separator prefix `"csrf-v1:"`
 * lets us safely reuse `JWT_SECRET` — a JWT signature can never be forged
 * as a CSRF token because JWT payloads don't start with that prefix.
 *
 * Edge-safe: uses only Web-Crypto (`crypto.subtle`) so this module can be
 * imported from `src/proxy.ts` / middleware-adjacent code if we ever need
 * to validate at the edge. `node:crypto.timingSafeEqual` is Node-only,
 * hence the manual XOR accumulator below.
 *
 * Invalidation: CSRF tokens are stateless — no DB storage, no revocation
 * table. They invalidate implicitly when `tokenVersion` bumps at logout,
 * because the HMAC input changes and the old token no longer verifies.
 */

import type { NextRequest } from "next/server";

export const CSRF_COOKIE_NAME =
  process.env.NODE_ENV === "production" ? "__Host-csrf" : "csrf";
export const CSRF_HEADER_NAME = "x-csrf-token";

const DOMAIN_SEPARATOR = "csrf-v1:";
const HMAC_ALGORITHM = { name: "HMAC", hash: "SHA-256" } as const;

/**
 * Constant-time byte comparison. Required because `crypto.subtle` does
 * not expose a `timingSafeEqual` and Edge runtime has no `node:crypto`.
 * Early-returning on length-mismatch is safe when the expected length is
 * fixed (base64url(SHA-256) is always 43 chars / 32 bytes — an attacker
 * cannot use length as a side channel).
 */
export function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

function base64urlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function computeHmac(
  secret: string,
  message: string,
): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    HMAC_ALGORITHM,
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    HMAC_ALGORITHM,
    key,
    encoder.encode(message),
  );
  return new Uint8Array(sig);
}

/**
 * Build a CSRF token bound to (userId, tokenVersion). Returns the
 * base64url-encoded HMAC output (43 chars).
 */
export async function buildCsrfToken(
  secret: string,
  userId: number,
  tokenVersion: number,
): Promise<string> {
  const message = `${DOMAIN_SEPARATOR}${userId}:${tokenVersion}`;
  const hmac = await computeHmac(secret, message);
  return base64urlEncode(hmac);
}

/**
 * Validate the CSRF header + cookie pair against (userId, tokenVersion).
 *
 * All three checks must pass:
 *   1. Both header and cookie present (missing either → reject).
 *   2. Header byte-equals cookie (classic double-submit protection).
 *   3. Either one, when validated as an HMAC of the expected payload,
 *      matches the recomputed token (signature protection — prevents an
 *      attacker from choosing their own value for both header and
 *      cookie).
 *
 * Returns `false` on any failure, including secret misconfiguration
 * (missing `JWT_SECRET`). The caller decides the user-facing error code
 * (`csrf_missing` vs `csrf_invalid`).
 */
export async function validateCsrfPair(
  req: NextRequest,
  secret: string | undefined,
  userId: number,
  tokenVersion: number,
): Promise<boolean> {
  if (!secret) return false;
  const headerToken = req.headers.get(CSRF_HEADER_NAME);
  const cookieToken = req.cookies.get(CSRF_COOKIE_NAME)?.value;
  if (!headerToken || !cookieToken) return false;

  const encoder = new TextEncoder();
  const headerBytes = encoder.encode(headerToken);
  const cookieBytes = encoder.encode(cookieToken);
  if (!timingSafeEqualBytes(headerBytes, cookieBytes)) return false;

  const expected = await buildCsrfToken(secret, userId, tokenVersion);
  const expectedBytes = encoder.encode(expected);
  return timingSafeEqualBytes(headerBytes, expectedBytes);
}

/**
 * Result of the missing vs invalid distinction the API route needs to
 * return. Kept as an enum-like union so error-response generation stays
 * centralized and the client-side `dashboardFetch` can match on the
 * stable `code` string.
 */
export type CsrfFailureReason = "csrf_missing" | "csrf_invalid";

export function classifyCsrfFailure(
  req: NextRequest,
): CsrfFailureReason | null {
  const headerToken = req.headers.get(CSRF_HEADER_NAME);
  const cookieToken = req.cookies.get(CSRF_COOKIE_NAME)?.value;
  if (!headerToken || !cookieToken) return "csrf_missing";
  return "csrf_invalid";
}
