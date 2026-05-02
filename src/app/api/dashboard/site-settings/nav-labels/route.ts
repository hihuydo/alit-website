import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import pool from "@/lib/db";
import { requireAuth, parseBody, internalError } from "@/lib/api-helpers";
import {
  NAV_LABELS_KEY,
  NAV_FIELD_KEYS,
  type NavLabels,
  type NavLabelsI18n,
} from "@/lib/nav-labels-shared";

const MAX_LABEL_LENGTH = 200;

function readStored(raw: string | null | undefined): NavLabelsI18n {
  if (typeof raw !== "string" || !raw.trim()) return { de: null, fr: null };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { de: null, fr: null };
    }
    const record = parsed as Record<string, unknown>;
    return {
      de: coerceLabels(record.de),
      fr: coerceLabels(record.fr),
    };
  } catch {
    return { de: null, fr: null };
  }
}

function coerceLabels(raw: unknown): NavLabels | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const result = {} as NavLabels;
  for (const k of NAV_FIELD_KEYS) {
    const v = r[k];
    result[k] = typeof v === "string" ? v : "";
  }
  return result;
}

function validateLocaleLabels(
  raw: unknown,
  locale: "de" | "fr",
): { ok: true; value: NavLabels | null } | { ok: false; error: string } {
  if (raw === null) return { ok: true, value: null };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: `Ungültiges Format (${locale}): muss null oder Object sein` };
  }
  const r = raw as Record<string, unknown>;
  const sanitized = {} as NavLabels;
  for (const k of NAV_FIELD_KEYS) {
    const v = r[k];
    if (typeof v !== "string") {
      return {
        ok: false,
        error: `Ungültiges Format (${locale}.${k}): muss string sein`,
      };
    }
    const trimmed = v.trim();
    if (trimmed.length > MAX_LABEL_LENGTH) {
      return {
        ok: false,
        error: `Feld ${locale}.${k} zu lang (max ${MAX_LABEL_LENGTH} Zeichen)`,
      };
    }
    sanitized[k] = trimmed;
  }
  return { ok: true, value: sanitized };
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { rows } = await pool.query<{ value: string | null }>(
      "SELECT value FROM site_settings WHERE key = $1",
      [NAV_LABELS_KEY],
    );
    const data = rows.length === 0 ? { de: null, fr: null } : readStored(rows[0].value);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return internalError("site-settings/nav-labels/GET", err);
  }
}

export async function PUT(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const body = await parseBody<unknown>(req);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }
  const record = body as Record<string, unknown>;
  if (!("de" in record) || !("fr" in record)) {
    return NextResponse.json(
      { success: false, error: "Body muss beide Locales (de, fr) enthalten" },
      { status: 400 },
    );
  }

  const normalized: NavLabelsI18n = { de: null, fr: null };
  for (const loc of ["de", "fr"] as const) {
    const result = validateLocaleLabels(record[loc], loc);
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }
    normalized[loc] = result.value;
  }

  try {
    await pool.query(
      `INSERT INTO site_settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_at = NOW()`,
      [NAV_LABELS_KEY, JSON.stringify(normalized)],
    );
    revalidatePath("/de", "layout");
    revalidatePath("/fr", "layout");
    return NextResponse.json({ success: true, data: normalized });
  } catch (err) {
    return internalError("site-settings/nav-labels/PUT", err);
  }
}
