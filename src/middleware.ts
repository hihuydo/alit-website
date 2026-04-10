import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) return new Uint8Array();
  return new TextEncoder().encode(secret);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow login page and auth API routes through
  if (
    pathname === "/dashboard/login" ||
    pathname === "/dashboard/login/" ||
    pathname.startsWith("/api/auth/")
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get("session")?.value;

  if (!token) {
    return NextResponse.redirect(new URL("/dashboard/login/", req.url));
  }

  try {
    await jwtVerify(token, getJwtSecret(), { algorithms: ["HS256"] });
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL("/dashboard/login/", req.url));
  }
}

export const config = {
  matcher: ["/dashboard", "/dashboard/", "/dashboard/:path*"],
};
