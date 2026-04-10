import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "./auth";

/** Verify session cookie and return 401 if invalid. Returns null on success. */
export async function requireAuth(req: NextRequest): Promise<NextResponse | null> {
  const token = req.cookies.get("session")?.value;
  if (!token) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const payload = await verifySession(token);
  if (!payload) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  return null;
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
