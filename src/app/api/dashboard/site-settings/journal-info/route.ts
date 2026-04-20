import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireAuth, parseBody, internalError } from "@/lib/api-helpers";
import { validateContent } from "@/lib/journal-validation";
import type { JournalContent } from "@/lib/journal-types";
import { isJournalInfoEmpty, type JournalInfoI18n } from "@/lib/journal-info-shared";

const SETTINGS_KEY = "journal_info_i18n";

function readStored(raw: string | null | undefined): JournalInfoI18n {
  if (typeof raw !== "string" || !raw.trim()) return { de: null, fr: null };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { de: null, fr: null };
    }
    const record = parsed as Record<string, unknown>;
    return {
      de: Array.isArray(record.de) ? (record.de as JournalContent) : null,
      fr: Array.isArray(record.fr) ? (record.fr as JournalContent) : null,
    };
  } catch {
    return { de: null, fr: null };
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { rows } = await pool.query<{ value: string | null }>(
      "SELECT value FROM site_settings WHERE key = $1",
      [SETTINGS_KEY],
    );
    const data = rows.length === 0 ? { de: null, fr: null } : readStored(rows[0].value);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return internalError("site-settings/journal-info/GET", err);
  }
}

export async function PUT(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const body = await parseBody<unknown>(req);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }
  // Require both locale keys to be present so a malformed client (or a
  // stray `{}`) can't silently wipe saved content by omitting fields. Each
  // value must be either `null` or an array (JournalContent shape).
  const record = body as Record<string, unknown>;
  if (!("de" in record) || !("fr" in record)) {
    return NextResponse.json(
      { success: false, error: "Body muss beide Locales (de, fr) enthalten" },
      { status: 400 },
    );
  }
  for (const loc of ["de", "fr"] as const) {
    const raw = record[loc];
    if (raw !== null && !Array.isArray(raw)) {
      return NextResponse.json(
        { success: false, error: `Ungültiges Format (${loc}): muss null oder Array sein` },
        { status: 400 },
      );
    }
  }

  const normalized: JournalInfoI18n = { de: null, fr: null };
  for (const loc of ["de", "fr"] as const) {
    const raw = record[loc] as JournalContent | null;
    if (raw === null) continue;
    const err = validateContent(raw);
    if (err) {
      return NextResponse.json(
        { success: false, error: `Ungültiges Format (${loc}): ${err}` },
        { status: 400 },
      );
    }
    normalized[loc] = isJournalInfoEmpty(raw) ? null : raw;
  }

  try {
    await pool.query(
      `INSERT INTO site_settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_at = NOW()`,
      [SETTINGS_KEY, JSON.stringify(normalized)],
    );
    return NextResponse.json({ success: true, data: normalized });
  } catch (err) {
    return internalError("site-settings/journal-info/PUT", err);
  }
}
