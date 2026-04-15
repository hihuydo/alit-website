import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireAuth, parseBody, internalError, validLength } from "@/lib/api-helpers";
import { hasLocale, type TranslatableField, type Locale } from "@/lib/i18n-field";
import type { JournalContent } from "@/lib/journal-types";

type I18nString = TranslatableField<string>;
type I18nContent = TranslatableField<JournalContent>;

function completion(content: I18nContent | null | undefined): { de: boolean; fr: boolean } {
  return {
    de: hasLocale(content, "de"),
    fr: hasLocale(content, "fr"),
  };
}

function pickLegacy<T extends string>(field: TranslatableField<T> | undefined, locales: Locale[] = ["de", "fr"]): T | "" {
  if (!field) return "" as T | "";
  for (const l of locales) {
    const v = field[l];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return "" as T | "";
}

function pickLegacyContent(field: I18nContent | undefined): JournalContent | null {
  if (!field) return null;
  const de = field.de;
  if (Array.isArray(de) && de.length > 0) return de;
  return null;
}

function validateI18nString(field: unknown, max: number): field is I18nString {
  if (field === undefined || field === null) return true;
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
  if (field === undefined || field === null) return true;
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
      "SELECT * FROM projekte ORDER BY sort_order ASC"
    );
    const data = rows.map((r) => ({
      ...r,
      completion: completion(r.content_i18n),
    }));
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return internalError("projekte/GET", err);
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  const body = await parseBody<{
    slug?: string;
    title_i18n?: I18nString;
    kategorie_i18n?: I18nString;
    content_i18n?: I18nContent;
    external_url?: string;
    archived?: boolean;
  }>(req);

  if (!body) {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const { slug, title_i18n, kategorie_i18n, content_i18n, external_url, archived } = body;

  if (!slug) {
    return NextResponse.json({ success: false, error: "slug is required" }, { status: 400 });
  }
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

  // Legacy mirror values — required because `titel`/`kategorie` are NOT NULL.
  const legacyTitel = pickLegacy(title_i18n);
  const legacyKategorie = pickLegacy(kategorie_i18n);
  const legacyContent = pickLegacyContent(content_i18n);

  if (!legacyTitel) {
    return NextResponse.json({ success: false, error: "title_i18n.de or title_i18n.fr is required" }, { status: 400 });
  }
  if (!legacyKategorie) {
    return NextResponse.json({ success: false, error: "kategorie_i18n.de or kategorie_i18n.fr is required" }, { status: 400 });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO projekte (slug, titel, kategorie, paragraphs, content, external_url, archived, sort_order, title_i18n, kategorie_i18n, content_i18n)
       VALUES ($1, $2, $3, $4, $5, $6, $7, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM projekte), $8, $9, $10)
       RETURNING *`,
      [
        slug,
        legacyTitel,
        legacyKategorie,
        JSON.stringify([]),
        legacyContent ? JSON.stringify(legacyContent) : null,
        external_url ?? null,
        archived ?? false,
        JSON.stringify(title_i18n ?? {}),
        JSON.stringify(kategorie_i18n ?? {}),
        JSON.stringify(content_i18n ?? {}),
      ]
    );
    return NextResponse.json({ success: true, data: { ...rows[0], completion: completion(rows[0].content_i18n) } }, { status: 201 });
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err && err.code === "23505") {
      return NextResponse.json({ success: false, error: "Slug already exists" }, { status: 409 });
    }
    return internalError("projekte/POST", err);
  }
}
