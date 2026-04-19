import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify } from "jose";
import { JWT_ALGORITHMS } from "@/lib/jwt-algorithms";
import {
  SESSION_COOKIE_NAME,
  LEGACY_COOKIE_NAME,
  CSRF_COOKIE_NAME,
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
 * On tv-mismatch we CLEAR all three cookies (session + legacy + CSRF)
 * via `cookies().set("", {maxAge:0, ...same-attrs-as-set})` — using
 * `.delete()` on `__Host-` prefixed cookies silently fails because the
 * emitted Set-Cookie lacks the required Secure+Path=/ attributes, so
 * the browser would keep the stale cookie alive and the user would land
 * in a redirect loop.
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
    // if the layout somehow runs with no valid session, redirect.
    redirect("/dashboard/login/");
  }

  const dbTv = await getTokenVersion(claim.userId, deriveEnv());
  if (dbTv === claim.tokenVersion) return; // OK

  // Mismatch — another tab's logout-bump invalidated this session.
  // Clear cookies with same-attrs-as-set then redirect. Without the
  // clear, the browser keeps sending the stale cookie, the next nav
  // hits this layout, detects mismatch, redirects — loop.
  const secureFlag = process.env.NODE_ENV === "production";
  store.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: secureFlag,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  if (SESSION_COOKIE_NAME !== LEGACY_COOKIE_NAME) {
    store.set(LEGACY_COOKIE_NAME, "", { path: "/", maxAge: 0 });
  }
  store.set(CSRF_COOKIE_NAME, "", {
    httpOnly: false,
    secure: secureFlag,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
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
