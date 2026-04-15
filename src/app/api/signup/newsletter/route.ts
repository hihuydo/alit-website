import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { signupClientIp } from "@/lib/signup-client-ip";
import { hashIp } from "@/lib/ip-hash";
import {
  hasConsent,
  isHoneypotTriggered,
  validateNewsletter,
} from "@/lib/signup-validation";

const RL_MAX = 5;
const RL_WINDOW_MS = 15 * 60 * 1000;

function invalid() {
  return NextResponse.json({ error: "invalid_input" }, { status: 400 });
}
function rateLimited() {
  return NextResponse.json({ error: "rate_limited" }, { status: 429 });
}
function serverError() {
  return NextResponse.json({ error: "server_error" }, { status: 500 });
}

export async function POST(req: NextRequest) {
  const ip = signupClientIp(req.headers);
  if (!ip) return invalid();

  const { allowed } = checkRateLimit(
    `signup:newsletter:${ip}`,
    RL_MAX,
    RL_WINDOW_MS,
  );
  if (!allowed) return rateLimited();

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return invalid();
  }

  // Honeypot: already counted toward rate-limit above, silent 200 w/ no insert.
  if (isHoneypotTriggered(body)) {
    return NextResponse.json({ ok: true });
  }

  if (!hasConsent(body)) return invalid();

  const payload = validateNewsletter(body);
  if (!payload) return invalid();

  try {
    await pool.query(
      `INSERT INTO newsletter_subscribers
         (vorname, nachname, woher, email, consent_at, ip_hash, source)
       VALUES ($1, $2, $3, $4, NOW(), $5, 'form')
       ON CONFLICT (email) DO NOTHING`,
      [
        payload.vorname,
        payload.nachname,
        payload.woher,
        payload.email,
        hashIp(ip),
      ],
    );
    // Idempotent: existing email → DO NOTHING, same 200 response (no oracle).
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[signup/newsletter]", err);
    return serverError();
  }
}
