import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { setCsrfCookie } from "@/lib/auth-cookie";
import { buildCsrfToken } from "@/lib/csrf";

/**
 * GET /api/auth/csrf — issue a CSRF token bound to the caller's session.
 *
 * Called by the client-side `dashboardFetch` on:
 *   1. First mutation attempt (if no token is cached in module scope).
 *   2. 403 retry when the server rejects with `code: "csrf_invalid"` —
 *      typically after a logout-bump on another tab invalidated the
 *      previous (userId, tokenVersion)-bound token.
 *
 * Authentication via `requireAuth`: GET skips the CSRF sub-gate (there
 * is no state-change to protect), so the chicken-and-egg "need a CSRF
 * token to fetch a CSRF token" never arises. The tv-check still applies,
 * keeping stale sessions out.
 *
 * The login flow also seeds the `dashboardFetch`-cache from its response
 * body so the first mutation after login never reaches this endpoint.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // Defense-in-depth: instrumentation.ts already eager-checks this,
    // but refuse to mint an unsigned token if the env somehow drifted.
    return NextResponse.json(
      { success: false, error: "Server misconfigured" },
      { status: 500 },
    );
  }

  const csrfToken = await buildCsrfToken(
    secret,
    auth.userId,
    auth.tokenVersion,
  );

  const res = NextResponse.json({ success: true, csrfToken });
  setCsrfCookie(res, csrfToken);
  return res;
}
