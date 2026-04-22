import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireAuth, parseBody, internalError, validateId, validLength } from "@/lib/api-helpers";
import { validateHashtagsI18n } from "@/lib/agenda-hashtags";
import { validateImages } from "@/lib/agenda-images";
import { hasLocale, type TranslatableField } from "@/lib/i18n-field";
import type { JournalContent } from "@/lib/journal-types";
import { isCanonicalDatum, isCanonicalZeit } from "@/lib/agenda-datetime";

type I18nString = TranslatableField<string>;
type I18nContent = TranslatableField<JournalContent>;

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
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const numId = validateId(id);
  if (!numId) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
  }

  const body = await parseBody<{
    datum?: string;
    zeit?: string;
    ort_url?: string;
    title_i18n?: I18nString;
    lead_i18n?: I18nString;
    ort_i18n?: I18nString;
    content_i18n?: I18nContent;
    hashtags?: { tag_i18n?: { de?: string; fr?: string | null }; projekt_slug?: string }[];
    images?: { public_id?: string; orientation?: string; width?: number; height?: number; alt?: string | null }[];
  }>(req);

  if (!body) {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const { datum, zeit, ort_url, title_i18n, lead_i18n, ort_i18n, content_i18n, hashtags, images } = body;

  if (!validLength(datum, 50) || !validLength(zeit, 50) || !validLength(ort_url, 500)) {
    return NextResponse.json({ success: false, error: "Field too long" }, { status: 400 });
  }
  // Partial-PUT-safe format gate: only validate when the key is actually
  // present in the body. Missing keys = caller didn't change this field.
  if (datum !== undefined && !isCanonicalDatum(datum)) {
    return NextResponse.json({ success: false, error: "Ungültiges Datumsformat, erwartet DD.MM.YYYY" }, { status: 400 });
  }
  if (zeit !== undefined && !isCanonicalZeit(zeit)) {
    return NextResponse.json({ success: false, error: "Ungültiges Zeitformat, erwartet HH:MM Uhr" }, { status: 400 });
  }
  if (!validateI18nString(title_i18n, 500)) {
    return NextResponse.json({ success: false, error: "Invalid title_i18n" }, { status: 400 });
  }
  if (!validateI18nString(lead_i18n, 1000)) {
    return NextResponse.json({ success: false, error: "Invalid lead_i18n" }, { status: 400 });
  }
  if (!validateI18nString(ort_i18n, 200)) {
    return NextResponse.json({ success: false, error: "Invalid ort_i18n" }, { status: 400 });
  }
  if (!validateI18nContent(content_i18n)) {
    return NextResponse.json({ success: false, error: "Invalid content_i18n" }, { status: 400 });
  }

  const hashtagValidation = await validateHashtagsI18n(hashtags);
  if (!hashtagValidation.ok) {
    return NextResponse.json({ success: false, error: hashtagValidation.error }, { status: 400 });
  }

  const imageValidation = await validateImages(images);
  if (!imageValidation.ok) {
    return NextResponse.json({ success: false, error: imageValidation.error }, { status: 400 });
  }

  // Build dynamic SET clauses. undefined = skip. For i18n fields we also
  // mirror to legacy columns for dual-write rollback safety.
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (datum !== undefined) { setClauses.push(`datum = $${paramIndex++}`); values.push(datum); }
  if (zeit !== undefined) { setClauses.push(`zeit = $${paramIndex++}`); values.push(zeit); }
  if (ort_url !== undefined) {
    // Empty / whitespace-only ort_url persists as NULL (optional field).
    setClauses.push(`ort_url = $${paramIndex++}`);
    values.push(ort_url && ort_url.trim() ? ort_url.trim() : null);
  }
  if (title_i18n !== undefined) {
    setClauses.push(`title_i18n = $${paramIndex++}`); values.push(JSON.stringify(title_i18n));
  }
  if (lead_i18n !== undefined) {
    setClauses.push(`lead_i18n = $${paramIndex++}`); values.push(JSON.stringify(lead_i18n));
  }
  if (ort_i18n !== undefined) {
    setClauses.push(`ort_i18n = $${paramIndex++}`); values.push(JSON.stringify(ort_i18n));
  }
  if (content_i18n !== undefined) {
    setClauses.push(`content_i18n = $${paramIndex++}`); values.push(JSON.stringify(content_i18n));
  }
  if (hashtags !== undefined) { setClauses.push(`hashtags = $${paramIndex++}`); values.push(JSON.stringify(hashtagValidation.value)); }
  if (images !== undefined) { setClauses.push(`images = $${paramIndex++}`); values.push(JSON.stringify(imageValidation.value)); }

  if (setClauses.length === 0) {
    return NextResponse.json({ success: false, error: "No fields to update" }, { status: 400 });
  }

  setClauses.push("updated_at = NOW()");
  values.push(numId);

  try {
    const { rows, rowCount } = await pool.query(
      `UPDATE agenda_items SET ${setClauses.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
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
    return internalError("agenda/PUT", err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const numId = validateId(id);
  if (!numId) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
  }

  try {
    const { rowCount } = await pool.query("DELETE FROM agenda_items WHERE id = $1", [numId]);

    if (!rowCount) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return internalError("agenda/DELETE", err);
  }
}
