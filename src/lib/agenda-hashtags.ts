import pool from "./db";
import { ALLOWED_HASHTAGS, ALLOWED_HASHTAG_SET, type AgendaHashtag, type AgendaHashtagI18n } from "./agenda-hashtags-shared";

export { ALLOWED_HASHTAGS, type AgendaHashtag, type AgendaHashtagI18n };

type ValidationResult =
  | { ok: true; value: AgendaHashtag[] }
  | { ok: false; error: string };

type ValidationResultI18n =
  | { ok: true; value: AgendaHashtagI18n[] }
  | { ok: false; error: string };

export async function validateHashtags(
  raw: { tag?: string; projekt_slug?: string }[] | undefined
): Promise<ValidationResult> {
  if (raw === undefined) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "hashtags must be an array" };
  if (raw.length === 0) return { ok: true, value: [] };
  if (raw.length > ALLOWED_HASHTAGS.length) return { ok: false, error: "Too many hashtags" };

  const cleaned: AgendaHashtag[] = [];
  const seen = new Set<string>();
  for (const h of raw) {
    const tag = h?.tag?.trim().replace(/^#+/, "");
    const slug = h?.projekt_slug?.trim();
    if (!tag || !slug) return { ok: false, error: "Each hashtag needs a tag and a project" };
    if (!ALLOWED_HASHTAG_SET.has(tag)) return { ok: false, error: "Unknown hashtag" };
    if (seen.has(tag)) return { ok: false, error: "Duplicate hashtag" };
    seen.add(tag);
    if (slug.length > 200) return { ok: false, error: "Project slug too long" };
    cleaned.push({ tag, projekt_slug: slug });
  }

  const slugs = [...new Set(cleaned.map((h) => h.projekt_slug))];
  const { rows } = await pool.query("SELECT slug_de FROM projekte WHERE slug_de = ANY($1)", [slugs]);
  const validSlugs = new Set(rows.map((r) => r.slug_de));
  for (const h of cleaned) {
    if (!validSlugs.has(h.projekt_slug)) return { ok: false, error: "Unknown project" };
  }

  return { ok: true, value: cleaned };
}

/** Sprint-3 i18n validator. DE tag must match ALLOWED_HASHTAG_SET (canonical
 *  key); FR label is free-form text (length-capped). Returns the cleaned shape
 *  ready to be written into the hashtags JSONB column. */
export async function validateHashtagsI18n(
  raw: { tag_i18n?: { de?: string; fr?: string | null }; projekt_slug?: string }[] | undefined
): Promise<ValidationResultI18n> {
  if (raw === undefined) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "hashtags must be an array" };
  if (raw.length === 0) return { ok: true, value: [] };
  if (raw.length > ALLOWED_HASHTAGS.length) return { ok: false, error: "Too many hashtags" };

  const cleaned: AgendaHashtagI18n[] = [];
  const seen = new Set<string>();
  for (const h of raw) {
    const de = h?.tag_i18n?.de?.trim().replace(/^#+/, "");
    const frRaw = h?.tag_i18n?.fr;
    const slug = h?.projekt_slug?.trim();
    if (!de || !slug) return { ok: false, error: "Each hashtag needs a DE tag and a project" };
    if (!ALLOWED_HASHTAG_SET.has(de)) return { ok: false, error: "Unknown hashtag" };
    if (seen.has(de)) return { ok: false, error: "Duplicate hashtag" };
    seen.add(de);
    if (slug.length > 200) return { ok: false, error: "Project slug too long" };
    let fr: string | null = null;
    if (typeof frRaw === "string") {
      const trimmed = frRaw.trim().replace(/^#+/, "");
      if (trimmed.length > 100) return { ok: false, error: "FR hashtag label too long" };
      fr = trimmed.length > 0 ? trimmed : null;
    }
    cleaned.push({ tag_i18n: { de, fr }, projekt_slug: slug });
  }

  const slugs = [...new Set(cleaned.map((h) => h.projekt_slug))];
  const { rows } = await pool.query("SELECT slug_de FROM projekte WHERE slug_de = ANY($1)", [slugs]);
  const validSlugs = new Set(rows.map((r) => r.slug_de));
  for (const h of cleaned) {
    if (!validSlugs.has(h.projekt_slug)) return { ok: false, error: "Unknown project" };
  }

  return { ok: true, value: cleaned };
}
