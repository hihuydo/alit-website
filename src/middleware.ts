import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

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

  // Fail-closed: no secret configured → redirect to login
  // (Duplicated from lib/auth.ts because middleware runs in Edge Runtime
  // where Node-only modules can't be imported. auth.ts throws on missing
  // secret; here we redirect instead.)
  const secret = process.env.JWT_SECRET;
  if (!secret) return NextResponse.redirect(loginUrl);

  const token = req.cookies.get("session")?.value;
  if (!token) return NextResponse.redirect(loginUrl);

  try {
    await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ["HS256"] });
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: ["/dashboard", "/dashboard/", "/dashboard/:path*"],
};
