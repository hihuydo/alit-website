/**
 * Edge-safe cookie + JWT helpers for the session migration (Sprint B).
 *
 * Pflicht-Invariante: dieses Modul läuft in der Edge Runtime
 * (`src/middleware.ts`) und darf deshalb keine Node-only-Module
 * importieren (pg, bcryptjs, ./db, ./audit, ./auth). Ein regex-Grep
 * über den Dateiinhalt in `auth-cookie.test.ts` fängt Regression.
 *
 * Phase B des Cookie-Migrations-Sprints: `__Host-session` ist der neue
 * Name in prod, Legacy `session` bleibt lesbar bis Sprint C. `setSessionCookie`
 * schreibt nur den neuen Namen und cleart den alten atomar mit, damit
 * nach einem Re-Login keine zwei Cookies nebeneinander übrig bleiben.
 */

import type { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { JWT_ALGORITHMS } from "./jwt-algorithms";

export const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production" ? "__Host-session" : "session";
export const LEGACY_COOKIE_NAME = "session";

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

async function tryVerify(
  token: string | undefined,
  secret: Uint8Array,
): Promise<number | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: [...JWT_ALGORITHMS],
    });
    return validateSub((payload as { sub?: unknown }).sub);
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
export async function verifySessionDualRead(
  req: NextRequest,
): Promise<{ userId: number; source: "primary" | "legacy" } | null> {
  const secret = getJwtSecret();
  if (!secret) return null;

  const primaryToken = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const primaryUserId = await tryVerify(primaryToken, secret);
  if (primaryUserId !== null) {
    return { userId: primaryUserId, source: "primary" };
  }

  if (SESSION_COOKIE_NAME !== LEGACY_COOKIE_NAME) {
    const legacyToken = req.cookies.get(LEGACY_COOKIE_NAME)?.value;
    const legacyUserId = await tryVerify(legacyToken, secret);
    if (legacyUserId !== null) {
      return { userId: legacyUserId, source: "legacy" };
    }
  }

  return null;
}

/**
 * Schreibt den neuen Primary-Cookie und cleart gleichzeitig einen
 * vorhandenen Legacy-Cookie (nur wenn die Namen unterschiedlich sind —
 * im dev-mode würde ein zweiter Set-Call den gerade gesetzten Cookie
 * wieder löschen).
 */
export function setSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
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

/** Logout clears both cookie names to close the dual-read window. */
export function clearSessionCookies(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  if (SESSION_COOKIE_NAME !== LEGACY_COOKIE_NAME) {
    res.cookies.set(LEGACY_COOKIE_NAME, "", {
      path: "/",
      maxAge: 0,
    });
  }
}
