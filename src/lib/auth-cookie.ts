/**
 * Edge-safe cookie + JWT helpers for the session migration (Sprint B)
 * and session-version rotation (Sprint T1-S).
 *
 * Pflicht-Invariante: dieses Modul läuft in der Edge Runtime
 * (`src/proxy.ts`) und darf deshalb keine Node-only-Module
 * importieren (pg, bcryptjs, ./db, ./audit, ./auth, ./session-version,
 * ./cookie-counter). Ein regex-Grep über den Dateiinhalt in
 * `auth-cookie.test.ts` fängt Regression.
 *
 * Phase B des Cookie-Migrations-Sprints: `__Host-session` ist der neue
 * Name in prod, Legacy `session` bleibt lesbar bis Sprint C. `setSessionCookie`
 * schreibt nur den neuen Namen und cleart den alten atomar mit, damit
 * nach einem Re-Login keine zwei Cookies nebeneinander übrig bleiben.
 *
 * Sprint T1-S: JWT claim gains `tv` (token_version). `verifySessionDualRead`
 * returns it so the Node-runtime callers (`requireAuth`, `layout.tsx`,
 * logout route) can compare against the env-scoped DB value. Legacy JWTs
 * issued before Sprint T1-S had no `tv` claim — those validate as `tv=0`
 * which matches the `admin_session_version` missing-row default, keeping
 * live sessions valid until the next logout-bump.
 */

import type { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { JWT_ALGORITHMS } from "./jwt-algorithms";

export const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production" ? "__Host-session" : "session";
export const LEGACY_COOKIE_NAME = "session";
export const CSRF_COOKIE_NAME =
  process.env.NODE_ENV === "production" ? "__Host-csrf" : "csrf";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24;

function getJwtSecret(): Uint8Array | null {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

/**
 * JWT-Standard `sub` is a string. Admin IDs are serial integers. Validate
 * strictly (`/^[0-9]+$/`) to keep a bad `sub` from silently producing
 * `NaN` or a truncated id via parseInt (see patterns/typescript.md
 * parseInt permissive-Trap).
 */
function validateSub(sub: unknown): number | null {
  if (typeof sub !== "string") return null;
  if (!/^[0-9]+$/.test(sub)) return null;
  const n = parseInt(sub, 10);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * JWTs issued before Sprint T1-S have no `tv` claim. Treat as 0 so they
 * match the `admin_session_version` missing-row default (also 0) and
 * stay valid until the next logout-bump. After T1-S, `tv` is always a
 * non-negative integer; reject anything else.
 */
function validateTv(tv: unknown): number | null {
  if (tv === undefined) return 0;
  if (typeof tv !== "number") return null;
  if (!Number.isInteger(tv) || tv < 0) return null;
  return tv;
}

async function tryVerify(
  token: string | undefined,
  secret: Uint8Array,
): Promise<{ userId: number; tokenVersion: number } | null> {
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
 * Dual-verify: primary cookie first, legacy as fallback.
 *
 * Falls primary fehlt, nicht verifiziert oder einen invaliden `sub`
 * liefert, wird der Legacy-Cookie mit derselben Pipeline probiert. So
 * bleibt ein Admin mit einem noch gültigen Legacy-Cookie eingeloggt,
 * selbst wenn `__Host-session` aus irgendeinem Grund kaputt ist
 * (Secret-Rotation, Browser-Corruption, Expiry).
 *
 * Bei fehlendem `JWT_SECRET` wird fail-closed `null` zurückgegeben
 * (kein Throw — Edge-Runtime-kompatibel). Ein fehlendes Secret ist ein
 * P0-Ops-Incident; der Boot-Check in `instrumentation.ts` soll das vor
 * Requests abfangen.
 */
export type SessionReadResult = {
  userId: number;
  tokenVersion: number;
  source: "primary" | "legacy";
};

export async function verifySessionDualRead(
  req: NextRequest,
): Promise<SessionReadResult | null> {
  const secret = getJwtSecret();
  if (!secret) return null;

  const primaryToken = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const primary = await tryVerify(primaryToken, secret);
  if (primary !== null) {
    return { ...primary, source: "primary" };
  }

  if (SESSION_COOKIE_NAME !== LEGACY_COOKIE_NAME) {
    const legacyToken = req.cookies.get(LEGACY_COOKIE_NAME)?.value;
    const legacy = await tryVerify(legacyToken, secret);
    if (legacy !== null) {
      return { ...legacy, source: "legacy" };
    }
  }

  return null;
}

/**
 * Schreibt den neuen Primary-Cookie und cleart gleichzeitig einen
 * vorhandenen Legacy-Cookie (nur wenn die Namen unterschiedlich sind —
 * im dev-mode würde ein zweiter Set-Call den gerade gesetzten Cookie
 * wieder löschen).
 *
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
  if (SESSION_COOKIE_NAME !== LEGACY_COOKIE_NAME) {
    res.cookies.set(LEGACY_COOKIE_NAME, "", {
      path: "/",
      maxAge: 0,
    });
  }
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
 * Logout clears session + legacy + CSRF cookies. `__Host-`-prefixed
 * cookies require the clear-Set-Cookie to match the original attributes
 * (Secure + Path=/) — `.delete()` alone does not satisfy that and the
 * browser silently keeps the cookie alive until TTL (see
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
  if (SESSION_COOKIE_NAME !== LEGACY_COOKIE_NAME) {
    res.cookies.set(LEGACY_COOKIE_NAME, "", {
      path: "/",
      maxAge: 0,
    });
  }
  res.cookies.set(CSRF_COOKIE_NAME, "", {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}
