import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireAuth, parseBody, internalError, validLength } from "@/lib/api-helpers";
import { validateContent } from "@/lib/journal-validation";
import { validateHashtagsI18n } from "@/lib/agenda-hashtags";
import { hasLocale, type TranslatableField } from "@/lib/i18n-field";
import type { JournalContent } from "@/lib/journal-types";

type I18nString = TranslatableField<string>;
type I18nContent = TranslatableField<JournalContent>;

function completion(content: I18nContent | null | undefined): { de: boolean; fr: boolean } {
  return { de: hasLocale(content, "de"), fr: hasLocale(content, "fr") };
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

export async function GET(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  try {
    const { rows } = await pool.query(
      "SELECT * FROM journal_entries ORDER BY sort_order DESC"
    );
    const data = rows.map((r) => ({
      ...r,
      completion: completion(r.content_i18n),
    }));
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return internalError("journal/GET", err);
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  const body = await parseBody<{
    date?: string;
    author?: string;
    title_border?: boolean;
    images?: { src: string; afterLine: number }[];
    title_i18n?: I18nString;
    content_i18n?: I18nContent;
    footer_i18n?: I18nString;
    hashtags?: { tag_i18n?: { de?: string; fr?: string | null }; projekt_slug?: string }[];
  }>(req);

  if (!body) {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const { date, author, title_border, images, title_i18n, content_i18n, footer_i18n, hashtags } = body;

  if (!date) {
    return NextResponse.json({ success: false, error: "date is required" }, { status: 400 });
  }
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

  // Content schema-validate both locales (only if present and non-empty).
  for (const loc of ["de", "fr"] as const) {
    const blocks = content_i18n?.[loc];
    if (Array.isArray(blocks) && blocks.length > 0) {
      const err = validateContent(blocks);
      if (err) {
        return NextResponse.json({ success: false, error: `Invalid content_i18n.${loc}: ${err}` }, { status: 400 });
      }
    }
  }

  // Require at least one locale to have content (DE or FR).
  const hasAnyContent =
    (Array.isArray(content_i18n?.de) && content_i18n.de.length > 0) ||
    (Array.isArray(content_i18n?.fr) && content_i18n.fr.length > 0);
  if (!hasAnyContent) {
    return NextResponse.json({ success: false, error: "content_i18n must have DE or FR content" }, { status: 400 });
  }

  const hashtagValidation = await validateHashtagsI18n(hashtags);
  if (!hashtagValidation.ok) {
    return NextResponse.json({ success: false, error: hashtagValidation.error }, { status: 400 });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO journal_entries (date, author, title_border, images, hashtags, sort_order, title_i18n, content_i18n, footer_i18n)
       VALUES ($1, $2, $3, $4, $5, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM journal_entries), $6, $7, $8)
       RETURNING *`,
      [
        date,
        author ?? null,
        title_border ?? false,
        images ? JSON.stringify(images) : null,
        JSON.stringify(hashtagValidation.value),
        JSON.stringify(title_i18n ?? {}),
        JSON.stringify(content_i18n ?? {}),
        JSON.stringify(footer_i18n ?? {}),
      ]
    );
    return NextResponse.json({ success: true, data: { ...rows[0], completion: completion(rows[0].content_i18n) } }, { status: 201 });
  } catch (err) {
    return internalError("journal/POST", err);
  }
}
