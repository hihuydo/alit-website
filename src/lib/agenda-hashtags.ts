import pool from "./db";

export const ALLOWED_HASHTAGS = [
  "lyriktalk",
  "lyriktisch",
  "zürcherliteraturwerkstatt",
  "schweizerliteraturwerkstatt",
  "reihederautor:innen",
  "weltenliteratur",
  "essaisagités",
  "discoursagités",
  "netzwerkfuerliteratur*en",
] as const;

const ALLOWED_SET = new Set<string>(ALLOWED_HASHTAGS);

export interface AgendaHashtag {
  tag: string;
  projekt_slug: string;
}

type ValidationResult =
  | { ok: true; value: AgendaHashtag[] }
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
    if (!ALLOWED_SET.has(tag)) return { ok: false, error: `Unknown hashtag: ${tag}` };
    if (seen.has(tag)) return { ok: false, error: `Duplicate hashtag: ${tag}` };
    seen.add(tag);
    if (slug.length > 200) return { ok: false, error: "Project slug too long" };
    cleaned.push({ tag, projekt_slug: slug });
  }

  const slugs = [...new Set(cleaned.map((h) => h.projekt_slug))];
  const { rows } = await pool.query("SELECT slug FROM projekte WHERE slug = ANY($1)", [slugs]);
  const validSlugs = new Set(rows.map((r) => r.slug));
  for (const h of cleaned) {
    if (!validSlugs.has(h.projekt_slug)) return { ok: false, error: `Unknown project: ${h.projekt_slug}` };
  }

  return { ok: true, value: cleaned };
}
