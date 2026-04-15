import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { signupClientIp } from "@/lib/signup-client-ip";
import { hashIp } from "@/lib/ip-hash";
import {
  hasConsent,
  isHoneypotTriggered,
  validateMembership,
} from "@/lib/signup-validation";

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

  const ipHash = hashIp(ip);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    try {
      await client.query(
        `INSERT INTO memberships
           (vorname, nachname, strasse, nr, plz, stadt, email,
            newsletter_opt_in, consent_at, ip_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8, NOW(), $9)`,
        [
          payload.vorname,
          payload.nachname,
          payload.strasse,
          payload.nr,
          payload.plz,
          payload.stadt,
          payload.email,
          payload.newsletter_opt_in,
          ipHash,
        ],
      );
    } catch (err) {
      await client.query("ROLLBACK");
      if (isUniqueViolation(err)) return alreadyRegistered();
      throw err;
    }

    if (payload.newsletter_opt_in) {
      // ON CONFLICT DO NOTHING: existing subscriber stays untouched, no duplicate.
      await client.query(
        `INSERT INTO newsletter_subscribers
           (vorname, nachname, woher, email, consent_at, ip_hash, source)
         VALUES ($1, $2, '', $3, NOW(), $4, 'membership')
         ON CONFLICT (email) DO NOTHING`,
        [payload.vorname, payload.nachname, payload.email, ipHash],
      );
    }

    await client.query("COMMIT");
    return NextResponse.json({ ok: true });
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
}
