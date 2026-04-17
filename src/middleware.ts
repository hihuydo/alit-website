import { NextRequest, NextResponse } from "next/server";
import { verifySessionDualRead } from "./lib/auth-cookie";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const loginUrl = new URL("/dashboard/login/", req.url);

  // Allow login page and auth API routes through
  if (
    pathname === "/dashboard/login" ||
    pathname === "/dashboard/login/" ||
    pathname.startsWith("/api/auth/")
  ) {
    return NextResponse.next();
  }

  // Dual-verify (Sprint B cookie migration): primary `__Host-session`
  // first, fallback to legacy `session`. Edge-Runtime-safe — no Node
  // imports. Counter-bump happens in Node-side helpers, not here.
  const result = await verifySessionDualRead(req);
  if (!result) return NextResponse.redirect(loginUrl);
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard", "/dashboard/", "/dashboard/:path*"],
};
