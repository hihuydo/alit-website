import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

export const runtime = "nodejs";
import { checkRateLimit } from "@/lib/rate-limit";
import { signupClientIp } from "@/lib/signup-client-ip";
import { hashIp } from "@/lib/ip-hash";
import {
  hasConsent,
  isHoneypotTriggered,
  validateMembership,
} from "@/lib/signup-validation";
import { sendSignupMails } from "@/lib/signup-mail";

const RL_MAX = 3;
const RL_WINDOW_MS = 15 * 60 * 1000;

function invalid() {
  return NextResponse.json({ error: "invalid_input" }, { status: 400 });
}
function rateLimited() {
  return NextResponse.json({ error: "rate_limited" }, { status: 429 });
}
function alreadyRegistered() {
  return NextResponse.json(
    { error: "already_registered" },
    { status: 409 },
  );
}
function serverError() {
  return NextResponse.json({ error: "server_error" }, { status: 500 });
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "23505"
  );
}

/**
 * Sprint M2a — locale parsing inline in route. Silent default to "de" for any
 * non-"fr" value (case-insensitive trim). Region-tagged "fr-CH" defaults to
 * "de" — alit's frontend forms send "de" or "fr" literal from dictionary,
 * not browser-locale (M2b can extend to prefix-match if needed).
 */
function parseLocale(body: Record<string, unknown>): "de" | "fr" {
  const raw =
    typeof body.locale === "string" ? body.locale.trim().toLowerCase() : "";
  return raw === "fr" ? "fr" : "de";
}

/**
 * Sprint M2a — adminRecipient resolution: single ||-chain (NOT ?? — empty
 * strings would slip through). Empty MEMBERSHIP_NOTIFY_RECIPIENT falls back
 * to SMTP_FROM. Both empty → null (admin-notify skipped via signup-mail.ts).
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
    `signup:mitgliedschaft:${ip}`,
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

  if (isHoneypotTriggered(body)) {
    return NextResponse.json({ ok: true });
  }

  if (!hasConsent(body)) return invalid();

  const payload = validateMembership(body);
  if (!payload) return invalid();

  const locale = parseLocale(body);
  const ipHash = hashIp(ip);
  const client = await pool.connect();
  let membershipRowId: number | null = null;
  try {
    await client.query("BEGIN");
    try {
      const insertResult = await client.query<{ id: number }>(
        `INSERT INTO memberships
           (vorname, nachname, strasse, nr, plz, stadt, email,
            newsletter_opt_in, consent_at, ip_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7, TRUE, NOW(), $8)
         RETURNING id`,
        [
          payload.vorname,
          payload.nachname,
          payload.strasse,
          payload.nr,
          payload.plz,
          payload.stadt,
          payload.email,
          ipHash,
        ],
      );
      membershipRowId = insertResult.rows[0]?.id ?? null;
    } catch (err) {
      await client.query("ROLLBACK");
      if (isUniqueViolation(err)) return alreadyRegistered();
      throw err;
    }

    // Membership signups are always added to the newsletter — customer
    // explicitly asked to bundle the two (membership consent implies
    // newsletter subscription). ON CONFLICT DO NOTHING protects pre-
    // existing subscribers from duplicate-insert errors.
    await client.query(
      `INSERT INTO newsletter_subscribers
         (vorname, nachname, woher, email, consent_at, ip_hash, source)
       VALUES ($1, $2, '', $3, NOW(), $4, 'membership')
       ON CONFLICT (email) DO NOTHING`,
      [payload.vorname, payload.nachname, payload.email, ipHash],
    );

    await client.query("COMMIT");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* connection may already be aborted */
    }
    console.error("[signup/mitgliedschaft]", err);
    return serverError();
  } finally {
    client.release();
  }

  // Sprint M2a — post-COMMIT fire-and-forget mail-fan-out. NEVER inside the
  // transaction (HTTP-side-effects after COMMIT, see patterns/database-concurrency.md).
  // Errors are swallowed inside sendSignupMails — caller does NOT await + does
  // NOT .catch() because the function guarantees `Promise<void>` resolution.
  if (membershipRowId !== null) {
    void sendSignupMails({
      signupKind: "membership",
      locale,
      formData: payload,
      userEmail: payload.email,
      adminRecipient: resolveAdminRecipient(),
      rowId: membershipRowId,
    });
  }
  return NextResponse.json({ ok: true });
}
