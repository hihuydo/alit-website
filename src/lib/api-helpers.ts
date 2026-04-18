import { NextRequest, NextResponse } from "next/server";
import { verifySessionDualRead } from "./auth-cookie";
import { bumpCookieSource } from "./cookie-counter";

export type AuthContext = {
  userId: number;
  source: "primary" | "legacy";
};

/**
 * Verify the session cookie and return the authenticated user context.
 *
 * Return-shape (Sprint B — Cookie-Migration):
 *   - On success: `{ userId, source }` — userId is already validated as
 *     a positive integer inside `verifySessionDualRead`, so callers can
 *     use it directly in WHERE clauses.
 *   - On failure: a 401 `NextResponse` that the caller should `return`
 *     immediately.
 *
 * Call pattern:
 *   const auth = await requireAuth(req);
 *   if (auth instanceof NextResponse) return auth;
 *   // auth.userId is available here
 *
 * Side effect: bumps the cookie-source counter once per successful
 * request (used to trigger the Sprint C flip). Never bumps on 401 — a
 * stuck counter would poison the flip metric.
 */
export async function requireAuth(
  req: NextRequest,
): Promise<NextResponse | AuthContext> {
  const result = await verifySessionDualRead(req);
  if (result === null) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }
  bumpCookieSource(result.source);
  return { userId: result.userId, source: result.source };
}

const MAX_BODY_SIZE = 256 * 1024; // 256 KB

/** Safe JSON parse with body size limit — returns null on failure. */
export async function parseBody<T>(req: NextRequest): Promise<T | null> {
  try {
    const contentLength = req.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) return null;
    const text = await req.text();
    if (text.length > MAX_BODY_SIZE) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** Validate that id is a positive integer. */
export function validateId(id: string): number | null {
  const n = parseInt(id, 10);
  if (isNaN(n) || n <= 0 || String(n) !== id) return null;
  return n;
}

/** Validate string field max length. Returns true if valid. */
export function validLength(value: unknown, max: number): boolean {
  return typeof value !== "string" || value.length <= max;
}

/** Generic internal error response — never leak err.message to client. */
export function internalError(context: string, err: unknown): NextResponse {
  console.error(`[${context}] Internal error:`, err);
  return NextResponse.json(
    { success: false, error: "Internal server error" },
    { status: 500 }
  );
}
