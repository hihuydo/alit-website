import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "./auth-cookie";
import { getTokenVersion } from "./session-version";
import { deriveEnv } from "./runtime-env";
import { validateCsrfPair, classifyCsrfFailure } from "./csrf";

export type AuthContext = {
  userId: number;
  tokenVersion: number;
};

const STATE_CHANGING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

/**
 * Verify the session cookie + token_version + CSRF and return the
 * authenticated user context.
 *
 * Three-gate pipeline (Sprint T1-S):
 *   1. JWT-verify via verifySession (Edge-safe).
 *   2. env-scoped token_version check — JWT `tv` claim must equal the
 *      current `admin_session_version(user_id, env).token_version`. A
 *      mismatch means another session (same shared admin) logged out
 *      and bumped the counter; the current session is invalidated.
 *   3. CSRF double-submit + HMAC verification on state-changing methods
 *      (POST, PATCH, PUT, DELETE). GET/HEAD/OPTIONS skip CSRF — there
 *      is no state-change to protect.
 *
 * Return shape:
 *   - On success: `{ userId, tokenVersion }` — userId is already
 *     validated as a positive integer, safe for WHERE clauses.
 *   - On failure: a JSON NextResponse the caller must `return`:
 *       401 `{success:false, error:"Unauthorized"}`            — no session
 *       401 `{success:false, error:"Session expired"}`         — tv mismatch
 *       403 `{success:false, error:"CSRF token missing",   code:"csrf_missing"}`
 *       403 `{success:false, error:"Invalid CSRF token", code:"csrf_invalid"}`
 */
export async function requireAuth(
  req: NextRequest,
): Promise<NextResponse | AuthContext> {
  const result = await verifySession(req);
  if (result === null) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  // env-scoped token_version check — mismatch = another session's logout
  // already invalidated this cookie. 401 so the client-side
  // `dashboardFetch` 401-handler triggers a login redirect.
  const env = deriveEnv();
  const currentTv = await getTokenVersion(result.userId, env);
  if (currentTv !== result.tokenVersion) {
    return NextResponse.json(
      { success: false, error: "Session expired" },
      { status: 401 },
    );
  }

  // CSRF gate only on state-changing methods. GET/HEAD/OPTIONS skip.
  if (STATE_CHANGING_METHODS.has(req.method)) {
    const secret = process.env.JWT_SECRET;
    const valid = await validateCsrfPair(
      req,
      secret,
      result.userId,
      result.tokenVersion,
    );
    if (!valid) {
      const reason = classifyCsrfFailure(req);
      if (reason === "csrf_missing") {
        return NextResponse.json(
          { success: false, error: "CSRF token missing", code: "csrf_missing" },
          { status: 403 },
        );
      }
      return NextResponse.json(
        { success: false, error: "Invalid CSRF token", code: "csrf_invalid" },
        { status: 403 },
      );
    }
  }

  return {
    userId: result.userId,
    tokenVersion: result.tokenVersion,
  };
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
