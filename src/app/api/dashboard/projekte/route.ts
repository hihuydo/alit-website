import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireAuth, parseBody, internalError } from "@/lib/api-helpers";
import { hasLocale, type TranslatableField, type Locale } from "@/lib/i18n-field";
import { validateSlug } from "@/lib/slug-validation";
import { SLUG_WRITE_LOCK_ID } from "@/lib/projekt-slug-lock";
import type { JournalContent } from "@/lib/journal-types";
import { validateContent } from "@/lib/journal-validation";
import { isJournalInfoEmpty } from "@/lib/journal-info-shared";

// newsletter_signup_intro_i18n is a full-object write: the body must
// carry an object with exactly de+fr keys (each JournalContent or null).
// No nested partial-merge. Separate validator from validateI18nContent
// because the legacy i18n-content validator allows missing keys.
type NewsletterIntroI18n = { de: JournalContent | null; fr: JournalContent | null };

function validateNewsletterIntro(field: unknown): { ok: true; value: NewsletterIntroI18n } | { ok: false; error: string } {
  if (field === null) return { ok: true, value: { de: null, fr: null } };
  if (typeof field !== "object" || Array.isArray(field)) {
    return { ok: false, error: "newsletter_signup_intro_i18n must be null or an object" };
  }
  const f = field as Record<string, unknown>;
  if (!("de" in f) || !("fr" in f)) {
    return { ok: false, error: "newsletter_signup_intro_i18n must contain both 'de' and 'fr' keys" };
  }
  for (const loc of ["de", "fr"] as const) {
    const v = f[loc];
    if (v === null) continue;
    if (!Array.isArray(v)) return { ok: false, error: `newsletter_signup_intro_i18n.${loc} must be null or an array` };
    const err = validateContent(v);
    if (err) return { ok: false, error: `newsletter_signup_intro_i18n.${loc}: ${err}` };
  }
  return {
    ok: true,
    value: {
      de: Array.isArray(f.de) && !isJournalInfoEmpty(f.de as JournalContent) ? (f.de as JournalContent) : null,
      fr: Array.isArray(f.fr) && !isJournalInfoEmpty(f.fr as JournalContent) ? (f.fr as JournalContent) : null,
    },
  };
}

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
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const body = await parseBody<{
    slug_de?: string;
    slug_fr?: string | null;
    title_i18n?: I18nString;
    kategorie_i18n?: I18nString;
    content_i18n?: I18nContent;
    archived?: boolean;
    show_newsletter_signup?: boolean;
    newsletter_signup_intro_i18n?: unknown;
  }>(req);

  if (!body) {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const { slug_de, slug_fr, title_i18n, kategorie_i18n, content_i18n, archived, show_newsletter_signup, newsletter_signup_intro_i18n } = body;
  let introNormalized: NewsletterIntroI18n = { de: null, fr: null };
  if (newsletter_signup_intro_i18n !== undefined) {
    const check = validateNewsletterIntro(newsletter_signup_intro_i18n);
    if (!check.ok) {
      return NextResponse.json({ success: false, error: check.error }, { status: 400 });
    }
    introNormalized = check.value;
  }
  if (show_newsletter_signup !== undefined && typeof show_newsletter_signup !== "boolean") {
    return NextResponse.json({ success: false, error: "show_newsletter_signup must be boolean" }, { status: 400 });
  }

  if (!validateSlug(slug_de)) {
    return NextResponse.json({ success: false, error: "slug_de is required (lowercase ASCII + hyphen, 1-100 chars)" }, { status: 400 });
  }
  // slug_fr: undefined or null = no FR alias; string must pass regex.
  // Empty string is rejected — redundant with null but cleaner than a silent coerce.
  let slugFrNormalized: string | null = null;
  if (slug_fr !== undefined && slug_fr !== null) {
    if (!validateSlug(slug_fr)) {
      return NextResponse.json({ success: false, error: "slug_fr must be null or a valid slug (lowercase ASCII + hyphen, 1-100 chars)" }, { status: 400 });
    }
    slugFrNormalized = slug_fr;
  }
  // Intra-row sanity check: a projekt's DE and FR slug must differ
  // (otherwise the two locale URLs collapse to the same string, which
  // defeats the purpose of having slug_fr). UNIQUE indexes don't catch
  // this — they operate on separate column namespaces.
  if (slugFrNormalized !== null && slugFrNormalized === slug_de) {
    return NextResponse.json({ success: false, error: "slug_de and slug_fr must differ within the same projekt" }, { status: 400 });
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

  // i18n-Felder müssen mindestens DE oder FR enthalten (kein empty-hash).
  if (!pickLegacy(title_i18n)) {
    return NextResponse.json({ success: false, error: "title_i18n.de or title_i18n.fr is required" }, { status: 400 });
  }
  if (!pickLegacy(kategorie_i18n)) {
    return NextResponse.json({ success: false, error: "kategorie_i18n.de or kategorie_i18n.fr is required" }, { status: 400 });
  }

  // Cross-column uniqueness: no slug may exist in slug_de OR slug_fr OR
  // legacy slug of ANY existing row. Per-column UNIQUE indexes alone
  // don't catch e.g. new slug_de == existing slug_fr of another row.
  // We serialize the collision-check + INSERT via a transaction-scoped
  // advisory lock so concurrent writers cannot race past the pre-select.
  // `pg_advisory_xact_lock` releases automatically on COMMIT/ROLLBACK.
  const collisionCandidates = [slug_de];
  if (slugFrNormalized !== null) collisionCandidates.push(slugFrNormalized);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [SLUG_WRITE_LOCK_ID]);

    const collision = await client.query(
      `SELECT slug_de, slug_fr FROM projekte
        WHERE slug_de = ANY($1::text[]) OR slug_fr = ANY($1::text[])
        LIMIT 1`,
      [collisionCandidates],
    );
    if (collision.rowCount && collision.rowCount > 0) {
      await client.query("ROLLBACK");
      const row = collision.rows[0];
      const hit = [row.slug_de, row.slug_fr].filter((v): v is string => typeof v === "string");
      const conflictingSlug = collisionCandidates.find((c) => hit.includes(c)) ?? collisionCandidates[0];
      const source = conflictingSlug === slug_de ? "slug_de" : "slug_fr";
      return NextResponse.json(
        { success: false, error: `${source} "${conflictingSlug}" already used by another projekt` },
        { status: 409 },
      );
    }

    const { rows } = await client.query(
      `INSERT INTO projekte (slug_de, slug_fr, archived, sort_order, title_i18n, kategorie_i18n, content_i18n, show_newsletter_signup, newsletter_signup_intro_i18n)
       VALUES ($1, $2, $3, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM projekte), $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        slug_de,
        slugFrNormalized,
        archived ?? false,
        JSON.stringify(title_i18n ?? {}),
        JSON.stringify(kategorie_i18n ?? {}),
        JSON.stringify(content_i18n ?? {}),
        show_newsletter_signup ?? false,
        // Persist as JSON string; null iff both locales are null (no need
        // to store an empty object).
        introNormalized.de === null && introNormalized.fr === null
          ? null
          : JSON.stringify(introNormalized),
      ]
    );
    await client.query("COMMIT");
    return NextResponse.json({ success: true, data: { ...rows[0], completion: completion(rows[0].content_i18n) } }, { status: 201 });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch { /* ignore */ }
    if (typeof err === "object" && err !== null && "code" in err && err.code === "23505") {
      // Single-column UNIQUE hit inside the lock window — extremely rare
      // (would require direct SQL outside this handler). Generic message.
      return NextResponse.json({ success: false, error: "Slug already exists" }, { status: 409 });
    }
    return internalError("projekte/POST", err);
  } finally {
    client.release();
  }
}
