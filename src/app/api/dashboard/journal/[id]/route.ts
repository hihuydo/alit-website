import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireAuth, parseBody, internalError, validateId, validLength } from "@/lib/api-helpers";
import { validateContent } from "@/lib/journal-validation";
import { validateHashtagsI18n } from "@/lib/agenda-hashtags";
import { hasLocale, type TranslatableField, type Locale } from "@/lib/i18n-field";
import type { JournalContent } from "@/lib/journal-types";

type I18nString = TranslatableField<string>;
type I18nContent = TranslatableField<JournalContent>;

function pickLegacyString(field: I18nString, locales: Locale[] = ["de", "fr"]): string | null {
  for (const l of locales) {
    const v = field[l];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
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
    date?: string;
    author?: string | null;
    title_border?: boolean;
    images?: { src: string; afterLine: number }[] | null;
    sort_order?: number;
    title_i18n?: I18nString;
    content_i18n?: I18nContent;
    footer_i18n?: I18nString;
    hashtags?: { tag_i18n?: { de?: string; fr?: string | null }; projekt_slug?: string }[];
  }>(req);

  if (!body) {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const { date, author, title_border, images, sort_order, title_i18n, content_i18n, footer_i18n, hashtags } = body;

  if (!validLength(date, 100) || !validLength(author, 200)) {
    return NextResponse.json({ success: false, error: "Field too long" }, { status: 400 });
  }

  if (!validateI18nString(title_i18n, 500)) {
    return NextResponse.json({ success: false, error: "Invalid title_i18n" }, { status: 400 });
  }
  if (!validateI18nString(footer_i18n, 500)) {
    return NextResponse.json({ success: false, error: "Invalid footer_i18n" }, { status: 400 });
  }
  if (!validateI18nContent(content_i18n)) {
    return NextResponse.json({ success: false, error: "Invalid content_i18n" }, { status: 400 });
  }

  if (content_i18n) {
    for (const loc of ["de", "fr"] as const) {
      const blocks = content_i18n[loc];
      if (Array.isArray(blocks) && blocks.length > 0) {
        const err = validateContent(blocks);
        if (err) {
          return NextResponse.json({ success: false, error: `Invalid content_i18n.${loc}: ${err}` }, { status: 400 });
        }
      }
    }
  }

  if (title_border !== undefined && typeof title_border !== "boolean") {
    return NextResponse.json({ success: false, error: "title_border must be boolean" }, { status: 400 });
  }
  if (sort_order !== undefined && typeof sort_order !== "number") {
    return NextResponse.json({ success: false, error: "sort_order must be number" }, { status: 400 });
  }

  const hashtagValidation = await validateHashtagsI18n(hashtags);
  if (!hashtagValidation.ok) {
    return NextResponse.json({ success: false, error: hashtagValidation.error }, { status: 400 });
  }

  // Build dynamic SET clauses. undefined = skip. For i18n fields also dual-write
  // to legacy columns for rollback safety.
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (date !== undefined) { setClauses.push(`date = $${paramIndex++}`); values.push(date); }
  if (author !== undefined) { setClauses.push(`author = $${paramIndex++}`); values.push(author); }
  if (title_border !== undefined) { setClauses.push(`title_border = $${paramIndex++}`); values.push(title_border); }
  if (images !== undefined) { setClauses.push(`images = $${paramIndex++}`); values.push(images ? JSON.stringify(images) : null); }
  if (title_i18n !== undefined) {
    setClauses.push(`title_i18n = $${paramIndex++}`); values.push(JSON.stringify(title_i18n));
    setClauses.push(`title = $${paramIndex++}`); values.push(pickLegacyString(title_i18n));
  }
  if (content_i18n !== undefined) {
    setClauses.push(`content_i18n = $${paramIndex++}`); values.push(JSON.stringify(content_i18n));
    setClauses.push(`content = $${paramIndex++}`);
    const legacy = pickLegacyContent(content_i18n);
    values.push(legacy ? JSON.stringify(legacy) : null);
  }
  if (footer_i18n !== undefined) {
    setClauses.push(`footer_i18n = $${paramIndex++}`); values.push(JSON.stringify(footer_i18n));
    setClauses.push(`footer = $${paramIndex++}`); values.push(pickLegacyString(footer_i18n));
  }
  if (sort_order !== undefined) { setClauses.push(`sort_order = $${paramIndex++}`); values.push(sort_order); }
  if (hashtags !== undefined) { setClauses.push(`hashtags = $${paramIndex++}`); values.push(JSON.stringify(hashtagValidation.value)); }

  if (setClauses.length === 0) {
    return NextResponse.json({ success: false, error: "No fields to update" }, { status: 400 });
  }

  setClauses.push("updated_at = NOW()");
  values.push(numId);

  try {
    const { rows, rowCount } = await pool.query(
      `UPDATE journal_entries SET ${setClauses.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
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
    return internalError("journal/PUT", err);
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
    const { rowCount } = await pool.query("DELETE FROM journal_entries WHERE id = $1", [numId]);

    if (!rowCount) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return internalError("journal/DELETE", err);
  }
}
