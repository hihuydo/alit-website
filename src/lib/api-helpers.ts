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

/** Safe JSON parse — returns null on failure instead of throwing. */
export async function parseBody<T>(req: NextRequest): Promise<T | null> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

/** Generic internal error response — never leak err.message to client. */
export function internalError(context: string, err: unknown): NextResponse {
  console.error(`[${context}] Internal error:`, err);
  return NextResponse.json(
    { success: false, error: "Internal server error" },
    { status: 500 }
  );
}
