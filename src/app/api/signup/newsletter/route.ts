import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

export const runtime = "nodejs";
import { checkRateLimit } from "@/lib/rate-limit";
import { signupClientIp } from "@/lib/signup-client-ip";
import { hashIp } from "@/lib/ip-hash";
import {
  hasConsent,
  isHoneypotTriggered,
  validateNewsletter,
} from "@/lib/signup-validation";
import { sendSignupMails } from "@/lib/signup-mail";

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

/**
 * Sprint M2a — see mitgliedschaft/route.ts for parseLocale rationale.
 */
function parseLocale(body: Record<string, unknown>): "de" | "fr" {
  const raw =
    typeof body.locale === "string" ? body.locale.trim().toLowerCase() : "";
  return raw === "fr" ? "fr" : "de";
}

/**
 * Sprint M2a — see mitgliedschaft/route.ts for resolveAdminRecipient rationale.
 */
function resolveAdminRecipient(): string | null {
  return (
    process.env.MEMBERSHIP_NOTIFY_RECIPIENT?.trim() ||
    process.env.SMTP_FROM?.trim() ||
    null
  );
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

  const locale = parseLocale(body);
  let newSubscriberId: number | null = null;
  try {
    const result = await pool.query<{ id: number }>(
      `INSERT INTO newsletter_subscribers
         (vorname, nachname, woher, email, consent_at, ip_hash, source)
       VALUES ($1, $2, $3, $4, NOW(), $5, 'form')
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      [
        payload.vorname,
        payload.nachname,
        payload.woher,
        payload.email,
        hashIp(ip),
      ],
    );
    // RETURNING with ON CONFLICT DO NOTHING returns inserted rows ONLY.
    // Empty rows = email already subscribed = no mail (Anti-Enum: bot can't
    // distinguish first-signup vs repeat via mail-receipt).
    newSubscriberId = result.rows[0]?.id ?? null;
  } catch (err) {
    console.error("[signup/newsletter]", err);
    return serverError();
  }

  // Sprint M2a — post-INSERT fire-and-forget mail-fan-out. Conditional on
  // rowCount=1 (newSubscriberId !== null) to preserve Anti-Enum semantics.
  if (newSubscriberId !== null) {
    void sendSignupMails({
      signupKind: "newsletter",
      locale,
      formData: payload,
      userEmail: payload.email,
      adminRecipient: resolveAdminRecipient(),
      rowId: newSubscriberId,
    });
  }
  // Idempotent: existing email → DO NOTHING, same 200 response (no oracle).
  return NextResponse.json({ ok: true });
}
