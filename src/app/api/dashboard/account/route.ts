import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { verifySession, hashPassword, verifyPassword } from "@/lib/auth";
import { normalizeEmail } from "@/lib/email";
import { parseBody, internalError, validLength } from "@/lib/api-helpers";
import { getClientIp } from "@/lib/client-ip";
import { checkRateLimit } from "@/lib/rate-limit";
import { auditLog } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const token = req.cookies.get("session")?.value;
  if (!token) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const payload = await verifySession(token);
  if (!payload) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const { rows } = await pool.query("SELECT id, email, created_at FROM admin_users WHERE id = $1", [payload.sub]);
    if (!rows.length) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: rows[0] });
  } catch (err) {
    return internalError("account/GET", err);
  }
}

export async function PUT(req: NextRequest) {
  const ip = getClientIp(req.headers);
  const { allowed } = checkRateLimit(`account:${ip}`, 10, 15 * 60 * 1000);
  if (!allowed) {
    auditLog("rate_limit", { ip, reason: "account_change" });
    return NextResponse.json({ success: false, error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const token = req.cookies.get("session")?.value;
  if (!token) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const payload = await verifySession(token);
  if (!payload) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const body = await parseBody<{
    email?: string;
    current_password?: string;
    new_password?: string;
  }>(req);

  if (!body) {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const { email, current_password, new_password } = body;

  // Require current password for any account change
  if (!current_password) {
    return NextResponse.json({ success: false, error: "Aktuelles Passwort erforderlich" }, { status: 400 });
  }

  if (current_password.length > 128 || (new_password && new_password.length > 128)) {
    return NextResponse.json({ success: false, error: "Passwort zu lang" }, { status: 400 });
  }

  if (email && !validLength(email, 200)) {
    return NextResponse.json({ success: false, error: "E-Mail zu lang" }, { status: 400 });
  }

  try {
    // Verify current password
    const { rows } = await pool.query("SELECT password FROM admin_users WHERE id = $1", [payload.sub]);
    if (!rows.length) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

    const valid = await verifyPassword(current_password, rows[0].password);
    if (!valid) {
      auditLog("login_failure", { ip, reason: "account_change_wrong_password" });
      return NextResponse.json({ success: false, error: "Aktuelles Passwort ist falsch" }, { status: 401 });
    }

    // Validate new password before any DB writes
    if (new_password && new_password.length < 8) {
      return NextResponse.json({ success: false, error: "Neues Passwort muss mindestens 8 Zeichen lang sein" }, { status: 400 });
    }

    // Wrap updates in a transaction to prevent partial mutations
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      if (email) {
        const normalized = normalizeEmail(email);
        await client.query("UPDATE admin_users SET email = $1 WHERE id = $2", [normalized, payload.sub]);
      }

      if (new_password) {
        const hash = await hashPassword(new_password);
        await client.query("UPDATE admin_users SET password = $1 WHERE id = $2", [hash, payload.sub]);
      }

      await client.query("COMMIT");
    } catch (txErr) {
      await client.query("ROLLBACK");
      throw txErr;
    } finally {
      client.release();
    }

    const changed = [email ? "email" : null, new_password ? "password" : null].filter(Boolean).join("+");
    auditLog("account_change", { ip, email: email ?? undefined, reason: changed });
    return NextResponse.json({ success: true });
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err && err.code === "23505") {
      return NextResponse.json({ success: false, error: "E-Mail bereits vergeben" }, { status: 409 });
    }
    return internalError("account/PUT", err);
  }
}
