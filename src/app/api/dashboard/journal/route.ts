import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireAuth, parseBody, internalError, validLength } from "@/lib/api-helpers";
import { validateContent } from "@/lib/journal-validation";
import { validateHashtagsI18n } from "@/lib/agenda-hashtags";
import { hasLocale, type TranslatableField } from "@/lib/i18n-field";
import type { JournalContent } from "@/lib/journal-types";
import { isCanonicalDatum } from "@/lib/agenda-datetime";

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
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { rows } = await pool.query(
      // Auto-sort by event date descending. `datum` (canonical DD.MM.YYYY)
      // drives the order; legacy/NULL datum rows fall back per-row to
      // `created_at::date` via COALESCE so they interleave chronologically
      // with canonical rows instead of being pinned at the bottom (Codex
      // R7 [P2]). Regex + TO_CHAR-roundtrip guards against PG TO_DATE
      // silent overflow on impossible civil dates (Codex R4 [P2]).
      `SELECT * FROM journal_entries
       ORDER BY
         COALESCE(
           CASE
             WHEN datum ~ '^\\d{2}\\.\\d{2}\\.\\d{4}$'
                  AND TO_CHAR(TO_DATE(datum, 'DD.MM.YYYY'), 'DD.MM.YYYY') = datum
               THEN TO_DATE(datum, 'DD.MM.YYYY')
           END,
           created_at::date
         ) DESC,
         id DESC`
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
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const body = await parseBody<{
    date?: string;
    datum?: string | null;
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

  const { date, datum, author, title_border, images, title_i18n, content_i18n, footer_i18n, hashtags } = body;

  // `datum` is now the canonical sort-anchor AND the sole UI-facing date
  // field (Freitext `date` removed from the editor). On POST it's required
  // and must be strict canonical DD.MM.YYYY.
  if (typeof datum !== "string" || !isCanonicalDatum(datum)) {
    return NextResponse.json(
      { success: false, error: "datum is required (canonical DD.MM.YYYY)" },
      { status: 400 },
    );
  }
  const datumNormalized: string = datum;

  // Legacy `date` column is NOT NULL in the DB. The editor no longer
  // submits it — auto-mirror from datum so fresh inserts satisfy the
  // constraint without UI churn. Admin-API callers may still override
  // by passing `date` explicitly; mirroring only kicks in on absence.
  const dateForDb: string = typeof date === "string" && date.length > 0 ? date : datumNormalized;
  if (!validLength(dateForDb, 100) || !validLength(author, 200)) {
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
      `INSERT INTO journal_entries (date, datum, author, title_border, images, hashtags, sort_order, title_i18n, content_i18n, footer_i18n)
       VALUES ($1, $2, $3, $4, $5, $6, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM journal_entries), $7, $8, $9)
       RETURNING *`,
      [
        dateForDb,
        datumNormalized,
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
