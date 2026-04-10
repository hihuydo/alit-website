import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/client-ip";
import { auditLog } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  auditLog("logout", { ip });

  const res = NextResponse.json({ success: true });
  res.cookies.set("session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return res;
}
