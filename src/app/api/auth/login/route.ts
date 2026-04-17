import { NextRequest, NextResponse } from "next/server";
import { login } from "@/lib/auth";
import { getClientIp } from "@/lib/client-ip";
import { checkRateLimit } from "@/lib/rate-limit";
import { auditLog } from "@/lib/audit";

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
    const res = NextResponse.json({ success: true });
    res.cookies.set("session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 24, // 24h
    });

    return res;
  } catch (err) {
    console.error("[login] Internal error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
