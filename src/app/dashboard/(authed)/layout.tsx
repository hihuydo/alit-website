import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify } from "jose";
import { JWT_ALGORITHMS } from "@/lib/jwt-algorithms";
import {
  SESSION_COOKIE_NAME,
  LEGACY_COOKIE_NAME,
} from "@/lib/auth-cookie";
import { getTokenVersion } from "@/lib/session-version";
import { deriveEnv } from "@/lib/runtime-env";

/**
 * Authed route-group layout (Sprint T1-S).
 *
 * Runs on every authed dashboard page load as a Server Component. The
 * proxy.ts (Edge Runtime) already did a JWT-verify for this pathname
 * and redirected unauthenticated requests to /dashboard/login/. This
 * layout adds the env-scoped token_version check that proxy.ts cannot
 * perform (the Edge runtime has no DB access).
 *
 * On tv-mismatch we redirect to `/api/auth/session-expired/` — a Route
 * Handler that clears cookies (session + legacy + CSRF) and then
 * re-redirects to /dashboard/login/. Cookie writes are NOT allowed in
 * Server Components (Next.js runtime error); only Route Handlers /
 * Server Actions can `cookies().set(...)`. Without the clear, the
 * browser keeps sending the stale cookie and the next nav hits this
 * layout, detects mismatch, redirects — loop (Codex PR #96 R1 [P1]).
 *
 * The login route lives OUTSIDE this group (src/app/dashboard/login/)
 * so there is no chicken-and-egg / circular redirect.
 */

async function validateSessionOrRedirect() {
  const store = await cookies();
  const secret = process.env.JWT_SECRET;
  if (!secret) redirect("/dashboard/login/");

  // Same dual-verify order as proxy.ts — primary first, legacy fallback.
  const primary = store.get(SESSION_COOKIE_NAME)?.value;
  const legacy =
    SESSION_COOKIE_NAME !== LEGACY_COOKIE_NAME
      ? store.get(LEGACY_COOKIE_NAME)?.value
      : undefined;
  const candidates = [primary, legacy].filter(
    (c): c is string => typeof c === "string" && c.length > 0,
  );

  type Claim = { userId: number; tokenVersion: number };
  let claim: Claim | null = null;
  for (const token of candidates) {
    try {
      const { payload } = await jwtVerify(
        token,
        new TextEncoder().encode(secret),
        { algorithms: [...JWT_ALGORITHMS] },
      );
      const sub = (payload as { sub?: unknown }).sub;
      if (typeof sub !== "string" || !/^[0-9]+$/.test(sub)) continue;
      const userId = parseInt(sub, 10);
      if (!Number.isSafeInteger(userId) || userId <= 0) continue;

      const rawTv = (payload as { tv?: unknown }).tv;
      const tv =
        rawTv === undefined
          ? 0
          : typeof rawTv === "number" && Number.isInteger(rawTv) && rawTv >= 0
            ? rawTv
            : null;
      if (tv === null) continue;

      claim = { userId, tokenVersion: tv };
      break;
    } catch {
      // Try next candidate
    }
  }

  if (claim === null) {
    // Shouldn't happen — proxy.ts already gated this. Defense-in-depth:
    // if the layout somehow runs with no valid session, route through
    // session-expired so any lingering cookies are cleared.
    redirect("/api/auth/session-expired/?next=/dashboard/login/");
  }

  const dbTv = await getTokenVersion(claim.userId, deriveEnv());
  if (dbTv === claim.tokenVersion) return; // OK

  // Mismatch — another tab's logout-bump invalidated this session.
  // Route through session-expired (Route Handler) so cookies can be
  // cleared legally; Server Components cannot `cookies().set(...)`.
  redirect("/api/auth/session-expired/?next=/dashboard/login/");
}

export default async function AuthedDashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  await validateSessionOrRedirect();
  return children;
}
