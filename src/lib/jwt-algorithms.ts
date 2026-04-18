/**
 * Shared JWT algorithm pin. Imported by both `auth.ts` (Node) and
 * `auth-cookie.ts` (Edge). Keeps sign/verify in sync so a later rotate
 * to a new alg only requires a single change, and middleware cannot
 * accept a token the signer would never emit. See patterns/auth.md:71.
 */
export const JWT_ALGORITHMS = ["HS256"] as const;
