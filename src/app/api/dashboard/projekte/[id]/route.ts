import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireAuth, parseBody, internalError, validateId, validLength } from "@/lib/api-helpers";
import { hasLocale, type TranslatableField, type Locale } from "@/lib/i18n-field";
import type { JournalContent } from "@/lib/journal-types";

type I18nString = TranslatableField<string>;
type I18nContent = TranslatableField<JournalContent>;

function pickLegacy(field: TranslatableField<string>, locales: Locale[] = ["de", "fr"]): string {
  for (const l of locales) {
    const v = field[l];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return "";
}

function pickLegacyContent(field: I18nContent): JournalContent | null {
  const de = field.de;
  if (Array.isArray(de) && de.length > 0) return de;
  return null;
}

function validateI18nString(field: unknown, max: number): field is I18nString {
  if (field === undefined) return true;
  if (field === null) return false;
  if (typeof field !== "object") return false;
  const f = field as Record<string, unknown>;
  for (const key of Object.keys(f)) {
    if (key !== "de" && key !== "fr") return false;
    const v = f[key];
    if (v === null || v === undefined) continue;
    if (typeof v !== "string") return false;
    if (v.length > max) return false;
  }
  return true;
}

function validateI18nContent(field: unknown): field is I18nContent {
  if (field === undefined) return true;
  if (field === null) return false;
  if (typeof field !== "object") return false;
  const f = field as Record<string, unknown>;
  for (const key of Object.keys(f)) {
    if (key !== "de" && key !== "fr") return false;
    const v = f[key];
    if (v === null || v === undefined) continue;
    if (!Array.isArray(v)) return false;
  }
  return true;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  const { id } = await params;
  const numId = validateId(id);
  if (!numId) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
  }

  const body = await parseBody<{
    slug?: string;
    title_i18n?: I18nString;
    kategorie_i18n?: I18nString;
    content_i18n?: I18nContent;
    external_url?: string | null;
    archived?: boolean;
    sort_order?: number;
  }>(req);

  if (!body) {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const { slug, title_i18n, kategorie_i18n, content_i18n, external_url, archived, sort_order } = body;

  if (!validLength(slug, 100) || !validLength(external_url, 500)) {
    return NextResponse.json({ success: false, error: "Field too long" }, { status: 400 });
  }
  if (!validateI18nString(title_i18n, 300)) {
    return NextResponse.json({ success: false, error: "Invalid title_i18n" }, { status: 400 });
  }
  if (!validateI18nString(kategorie_i18n, 200)) {
    return NextResponse.json({ success: false, error: "Invalid kategorie_i18n" }, { status: 400 });
  }
  if (!validateI18nContent(content_i18n)) {
    return NextResponse.json({ success: false, error: "Invalid content_i18n" }, { status: 400 });
  }

  // Build dynamic SET clauses. undefined = skip (preserve DB value),
  // value = SET value. For i18n fields we also mirror to legacy columns.
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (slug !== undefined) { setClauses.push(`slug = $${paramIndex++}`); values.push(slug); }
  if (title_i18n !== undefined) {
    setClauses.push(`title_i18n = $${paramIndex++}`);
    values.push(JSON.stringify(title_i18n));
    setClauses.push(`titel = $${paramIndex++}`);
    values.push(pickLegacy(title_i18n));
  }
  if (kategorie_i18n !== undefined) {
    setClauses.push(`kategorie_i18n = $${paramIndex++}`);
    values.push(JSON.stringify(kategorie_i18n));
    setClauses.push(`kategorie = $${paramIndex++}`);
    values.push(pickLegacy(kategorie_i18n));
  }
  if (content_i18n !== undefined) {
    setClauses.push(`content_i18n = $${paramIndex++}`);
    values.push(JSON.stringify(content_i18n));
    setClauses.push(`content = $${paramIndex++}`);
    const legacy = pickLegacyContent(content_i18n);
    values.push(legacy ? JSON.stringify(legacy) : null);
  }
  if (external_url !== undefined) { setClauses.push(`external_url = $${paramIndex++}`); values.push(external_url); }
  if (archived !== undefined) { setClauses.push(`archived = $${paramIndex++}`); values.push(archived); }
  if (sort_order !== undefined) { setClauses.push(`sort_order = $${paramIndex++}`); values.push(sort_order); }

  if (setClauses.length === 0) {
    return NextResponse.json({ success: false, error: "No fields to update" }, { status: 400 });
  }

  setClauses.push("updated_at = NOW()");
  values.push(numId);

  try {
    const { rows, rowCount } = await pool.query(
      `UPDATE projekte SET ${setClauses.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (!rowCount) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        ...rows[0],
        completion: { de: hasLocale(rows[0].content_i18n, "de"), fr: hasLocale(rows[0].content_i18n, "fr") },
      },
    });
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err && err.code === "23505") {
      return NextResponse.json({ success: false, error: "Slug already exists" }, { status: 409 });
    }
    return internalError("projekte/PUT", err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  const { id } = await params;
  const numId = validateId(id);
  if (!numId) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
  }

  try {
    const { rowCount } = await pool.query("DELETE FROM projekte WHERE id = $1", [numId]);

    if (!rowCount) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return internalError("projekte/DELETE", err);
  }
}
