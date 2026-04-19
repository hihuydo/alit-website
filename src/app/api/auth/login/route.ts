import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { login } from "@/lib/auth";
import { setSessionCookie, setCsrfCookie } from "@/lib/auth-cookie";
import { getClientIp } from "@/lib/client-ip";
import { checkRateLimit } from "@/lib/rate-limit";
import { auditLog } from "@/lib/audit";
import { buildCsrfToken } from "@/lib/csrf";
import { JWT_ALGORITHMS } from "@/lib/jwt-algorithms";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  const { allowed } = checkRateLimit(`login:${ip}`);

  if (!allowed) {
    auditLog("rate_limit", { ip, reason: "login" });
    return NextResponse.json(
      { success: false, error: "Too many attempts. Try again later." },
      { status: 429 }
    );
  }

  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body" },
      { status: 400 }
    );
  }

  const { email, password } = body;

  if (!email || !password || typeof email !== "string" || typeof password !== "string") {
    return NextResponse.json(
      { success: false, error: "Email and password are required" },
      { status: 400 }
    );
  }

  if (password.length > 128) {
    return NextResponse.json(
      { success: false, error: "Invalid credentials" },
      { status: 401 }
    );
  }

  try {
    const token = await login(email, password, ip);

    if (!token) {
      auditLog("login_failure", { ip, email });
      return NextResponse.json(
        { success: false, error: "Invalid credentials" },
        { status: 401 }
      );
    }

    auditLog("login_success", { ip, email });

    // Sprint T1-S: issue CSRF cookie + embed token in response body so
    // the client's first mutation doesn't need an extra GET /api/auth/csrf
    // round-trip. The token is bound to (userId, tokenVersion) — the
    // same values the freshly-signed JWT carries in its claims.
    const secret = process.env.JWT_SECRET;
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret!),
      { algorithms: [...JWT_ALGORITHMS] },
    );
    const userId = parseInt(payload.sub as string, 10);
    const tv =
      typeof payload.tv === "number" && Number.isInteger(payload.tv)
        ? payload.tv
        : 0;
    const csrfToken = await buildCsrfToken(secret!, userId, tv);

    const res = NextResponse.json({ success: true, csrfToken });
    setSessionCookie(res, token);
    setCsrfCookie(res, csrfToken);
    return res;
  } catch (err) {
    console.error("[login] Internal error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
