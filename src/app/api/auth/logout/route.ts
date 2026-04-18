import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookies } from "@/lib/auth-cookie";
import { getClientIp } from "@/lib/client-ip";
import { auditLog } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  auditLog("logout", { ip });

  const res = NextResponse.json({ success: true });
  clearSessionCookies(res);
  return res;
}
