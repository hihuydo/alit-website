/**
 * Edge-safe cookie + JWT helpers for the admin session flow.
 *
 * Pflicht-Invariante: dieses Modul läuft in der Edge Runtime
 * (`src/proxy.ts`) und darf deshalb keine Node-only-Module
 * importieren (pg, bcryptjs, ./db, ./audit, ./auth, ./session-version).
 * Ein regex-Grep über den Dateiinhalt in `auth-cookie.test.ts` fängt
 * Regression.
 *
 * Cookie-Namen sind env-conditional: prod nutzt `__Host-session` /
 * `__Host-csrf` (Path=/ + Secure Pflicht), dev nutzt `session` / `csrf`
 * weil `__Host-` HTTPS-only ist und localhost-DX bricht. Der Migrations-
 * Scaffold zwischen alt-`session` und neu-`__Host-session` wurde mit
 * Sprint C (PR #112, 2026-04-25) abgebaut — alle 24h-JWT-TTL-Cookies
 * aus der Sprint-B-Übergangsphase sind längst expired.
 *
 * Sprint T1-S: JWT claim trägt `tv` (token_version). `verifySession`
 * gibt es zurück damit die Node-runtime Callers (`requireAuth`,
 * `(authed)/layout.tsx`, logout route) gegen den env-scoped DB-Wert
 * vergleichen können. Legacy-JWTs ohne `tv`-Claim validieren als
 * `tv=0` und matchen damit den `admin_session_version` missing-row
 * Default — bestehende Sessions bleiben gültig bis zum nächsten
 * Logout-Bump.
 */

import type { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { JWT_ALGORITHMS } from "./jwt-algorithms";

export const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production" ? "__Host-session" : "session";
export const CSRF_COOKIE_NAME =
  process.env.NODE_ENV === "production" ? "__Host-csrf" : "csrf";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24;

function getJwtSecret(): Uint8Array | null {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

/**
 * JWT-Standard `sub` ist ein String. Admin-IDs sind serial integers.
 * Strict validieren (`/^[0-9]+$/`) damit ein bad `sub` nicht silent
 * via parseInt zu `NaN` oder einer truncated id wird (siehe
 * patterns/typescript.md parseInt permissive-Trap).
 */
function validateSub(sub: unknown): number | null {
  if (typeof sub !== "string") return null;
  if (!/^[0-9]+$/.test(sub)) return null;
  const n = parseInt(sub, 10);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * JWTs vor Sprint T1-S haben keinen `tv`-Claim. Treat als 0 damit sie
 * den `admin_session_version` missing-row Default (auch 0) matchen
 * und gültig bleiben bis zum nächsten Logout-Bump. Nach T1-S ist `tv`
 * immer ein non-negative integer; alles andere wird rejectet.
 */
function validateTv(tv: unknown): number | null {
  if (tv === undefined) return 0;
  if (typeof tv !== "number") return null;
  if (!Number.isInteger(tv) || tv < 0) return null;
  return tv;
}

export type SessionReadResult = {
  userId: number;
  tokenVersion: number;
};

/**
 * Verify the session cookie. Single-cookie-read post-Sprint-C.
 *
 * Bei fehlendem `JWT_SECRET` wird fail-closed `null` zurückgegeben
 * (kein Throw — Edge-Runtime-kompatibel). Ein fehlendes Secret ist ein
 * P0-Ops-Incident; der Boot-Check in `instrumentation.ts` soll das vor
 * Requests abfangen.
 */
export async function verifySession(
  req: NextRequest,
): Promise<SessionReadResult | null> {
  const secret = getJwtSecret();
  if (!secret) return null;

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: [...JWT_ALGORITHMS],
    });
    const typed = payload as { sub?: unknown; tv?: unknown };
    const userId = validateSub(typed.sub);
    if (userId === null) return null;
    const tokenVersion = validateTv(typed.tv);
    if (tokenVersion === null) return null;
    return { userId, tokenVersion };
  } catch {
    return null;
  }
}

/**
 * `sameSite: "lax"` (nicht "strict"): Strict produzierte einen iOS
 * Safari Pull-to-Refresh-Bug — nach dem ersten Login loggte Pull-to-
 * Refresh den User aus weil Safari das Strict-Cookie bei dem Reload-
 * Request in bestimmten iOS-Versionen nicht mitschickt. Lax ist der
 * moderne Browser-Default und blockiert den wesentlichen CSRF-Vektor
 * (Cross-Site-POST), erlaubt aber Session-Cookies bei normaler
 * Same-Site-Navigation + Page-Reload. Siehe patterns/auth.md
 * "samesite-strict-on-session-cookie-breaks-ios-safari-pull-to-refresh".
 */
export function setSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/**
 * Set the CSRF cookie. Non-HttpOnly so the client can read it for the
 * `x-csrf-token` header (double-submit pattern). `SameSite=Strict` keeps
 * it out of cross-site-request context. `Path=/` + `Secure` are required
 * by `__Host-` prefix in prod.
 */
export function setCsrfCookie(res: NextResponse, token: string): void {
  res.cookies.set(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/**
 * Logout clears session + CSRF cookies. `__Host-`-prefixed cookies
 * require the clear-Set-Cookie to match the original attributes
 * (Secure + Path=/) — `.delete()` alone does not satisfy that and the
 * browser silently keeps the cookie alive until TTL (siehe
 * patterns/auth.md: `__Host-` cookie clear via `.set(...)` not
 * `.delete()`).
 */
export function clearSessionCookies(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  res.cookies.set(CSRF_COOKIE_NAME, "", {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}
