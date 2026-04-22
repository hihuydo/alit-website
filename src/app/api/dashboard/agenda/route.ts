import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireAuth, parseBody, internalError, validLength } from "@/lib/api-helpers";
import { validateHashtagsI18n } from "@/lib/agenda-hashtags";
import { validateImages } from "@/lib/agenda-images";
import { hasLocale, type TranslatableField, type Locale } from "@/lib/i18n-field";
import { isCanonicalDatum, isCanonicalZeit } from "@/lib/agenda-datetime";
import type { JournalContent } from "@/lib/journal-types";

type I18nString = TranslatableField<string>;
type I18nContent = TranslatableField<JournalContent>;

function completion(content: I18nContent | null | undefined): { de: boolean; fr: boolean } {
  return { de: hasLocale(content, "de"), fr: hasLocale(content, "fr") };
}

function pickLegacyString(field: I18nString | undefined, locales: Locale[] = ["de", "fr"]): string {
  if (!field) return "";
  for (const l of locales) {
    const v = field[l];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return "";
}

function pickLegacyContent(field: I18nContent | undefined): JournalContent | null {
  if (!field) return null;
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

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { rows } = await pool.query(
      // Auto-sort by event date descending (newest/farthest-future first).
      // Regex + TO_CHAR-roundtrip guard (Codex R4 [P2]): Postgres TO_DATE
      // silently normalizes impossible civil dates (31.02.2026 → 03.03.2026)
      // instead of failing, so an admin-inserted SQL or legacy pre-migration
      // value with an off-spec datum would otherwise sort as if it were a
      // valid date. Comparing the parsed date back to the original string
      // forces unparseable/impossible values into the NULLS-LAST fallback.
      `SELECT * FROM agenda_items
       ORDER BY
         CASE
           WHEN datum ~ '^\\d{2}\\.\\d{2}\\.\\d{4}$'
                AND TO_CHAR(TO_DATE(datum, 'DD.MM.YYYY'), 'DD.MM.YYYY') = datum
             THEN TO_DATE(datum, 'DD.MM.YYYY')
         END DESC NULLS LAST,
         zeit DESC,
         id DESC`
    );
    const data = rows.map((r) => ({
      ...r,
      completion: completion(r.content_i18n),
    }));
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return internalError("agenda/GET", err);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

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

  if (!datum || !zeit) {
    return NextResponse.json({ success: false, error: "Missing required fields (datum, zeit)" }, { status: 400 });
  }
  if (!validLength(datum, 50) || !validLength(zeit, 50) || !validLength(ort_url, 500)) {
    return NextResponse.json({ success: false, error: "Field too long" }, { status: 400 });
  }
  if (!isCanonicalDatum(datum)) {
    return NextResponse.json({ success: false, error: "Ungültiges Datumsformat, erwartet DD.MM.YYYY" }, { status: 400 });
  }
  if (!isCanonicalZeit(zeit)) {
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

  // i18n-Felder müssen mindestens DE oder FR enthalten.
  if (!pickLegacyString(title_i18n)) {
    return NextResponse.json({ success: false, error: "title_i18n.de or title_i18n.fr is required" }, { status: 400 });
  }
  if (!pickLegacyString(ort_i18n)) {
    return NextResponse.json({ success: false, error: "ort_i18n.de or ort_i18n.fr is required" }, { status: 400 });
  }

  const hashtagValidation = await validateHashtagsI18n(hashtags);
  if (!hashtagValidation.ok) {
    return NextResponse.json({ success: false, error: hashtagValidation.error }, { status: 400 });
  }

  const imageValidation = await validateImages(images);
  if (!imageValidation.ok) {
    return NextResponse.json({ success: false, error: imageValidation.error }, { status: 400 });
  }

  try {
    const { rows } = await pool.query(
      // sort_order column still exists (NOT NULL DEFAULT 0) but no reader
      // references it anymore after PR #103 switched agenda to auto-sort
      // by datum. Omit from INSERT so the next DDL sprint can DROP the
      // column safely without any writer path breaking.
      `INSERT INTO agenda_items (datum, zeit, ort_url, hashtags, images, title_i18n, lead_i18n, ort_i18n, content_i18n)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        datum,
        zeit,
        // Empty / missing ort_url persists as NULL (optional field).
        ort_url && ort_url.trim() ? ort_url.trim() : null,
        JSON.stringify(hashtagValidation.value),
        JSON.stringify(imageValidation.value),
        JSON.stringify(title_i18n ?? {}),
        JSON.stringify(lead_i18n ?? {}),
        JSON.stringify(ort_i18n ?? {}),
        JSON.stringify(content_i18n ?? {}),
      ]
    );
    return NextResponse.json({ success: true, data: { ...rows[0], completion: completion(rows[0].content_i18n) } }, { status: 201 });
  } catch (err) {
    return internalError("agenda/POST", err);
  }
}
