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
 * On tv-mismatch (and on defense-in-depth no-claim) we redirect to
 * `/dashboard/login/` WITHOUT attempting to clear cookies. Two reasons:
 *   1. Server Components may not call `cookies().set(...)` — Next.js
 *      reserves that for Route Handlers and Server Actions (Codex R1).
 *   2. A dedicated "clear cookies + redirect" Route Handler would be a
 *      force-logout DoS vector if reachable via cross-site top-level
 *      navigation (Codex R2). Guarding it with `Sec-Fetch-Site` adds
 *      complexity and a 403-UX regression for URL-bar bookmarks.
 *
 * Stale cookies after tv-mismatch are harmless: `requireAuth` rejects
 * every API call (tv-check fires), this layout rejects every /dashboard
 * page nav (same check), and the CSRF cookie is HMAC-bound to the old
 * tv so it verifies nothing. The login flow's `setSessionCookie` +
 * `setCsrfCookie` atomically overwrite them on next successful login.
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
    // Shouldn't happen — proxy.ts already gated this. Defense-in-depth.
    redirect("/dashboard/login/");
  }

  const dbTv = await getTokenVersion(claim.userId, deriveEnv());
  if (dbTv === claim.tokenVersion) return; // OK

  // Mismatch — another tab's logout-bump invalidated this session.
  // Stale cookies stay; next successful login overwrites them.
  redirect("/dashboard/login/");
}

export default async function AuthedDashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  await validateSessionOrRedirect();
  return children;
}
