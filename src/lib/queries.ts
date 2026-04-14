import pool from "./db";
import type { AgendaItemData } from "@/components/AgendaItem";
import type { JournalEntry } from "@/content/de/journal/entries";
import type { Projekt } from "@/content/projekte";
import type { JournalContent } from "./journal-types";
import { t, isEmptyField, type Locale } from "./i18n-field";

export type AlitSection = {
  id: number;
  title: string | null;
  content: JournalContent;
  /** True when the requested locale had no content and DE was used as fallback. */
  isFallback: boolean;
};

export async function getAgendaItems(): Promise<AgendaItemData[]> {
  const { rows } = await pool.query(
    "SELECT datum, zeit, ort, ort_url, titel, lead, beschrieb, content, hashtags, images FROM agenda_items ORDER BY sort_order DESC"
  );
  return rows.map((r) => ({
    datum: r.datum,
    zeit: r.zeit,
    ort: r.ort,
    ortUrl: r.ort_url,
    titel: r.titel,
    lead: r.lead ?? undefined,
    beschrieb: r.beschrieb,
    content: r.content ?? undefined,
    hashtags: Array.isArray(r.hashtags) ? r.hashtags : [],
    images: Array.isArray(r.images)
      ? r.images.map((img: { public_id: string; orientation: "portrait" | "landscape"; width?: number | null; height?: number | null; alt?: string | null }) => ({
          public_id: img.public_id,
          orientation: img.orientation,
          width: img.width ?? null,
          height: img.height ?? null,
          alt: img.alt ?? null,
        }))
      : [],
  }));
}

export async function getJournalEntries(): Promise<JournalEntry[]> {
  const { rows } = await pool.query(
    "SELECT date, author, title, title_border, lines, images, content, footer, hashtags FROM journal_entries ORDER BY sort_order DESC"
  );
  return rows.map((r) => ({
    date: r.date,
    author: r.author ?? undefined,
    title: r.title ?? undefined,
    titleBorder: r.title_border,
    lines: r.lines,
    images: r.images ?? undefined,
    content: r.content ?? undefined,
    footer: r.footer ?? undefined,
    hashtags: Array.isArray(r.hashtags) ? r.hashtags : [],
  }));
}

export async function getAlitSections(locale: Locale = "de"): Promise<AlitSection[]> {
  // Post-i18n migration: one row per logical entity (filtered on legacy
  // `locale='de'` per schema precondition). Locale content lives in the
  // JSONB columns; `t()` resolves with DE fallback.
  const { rows } = await pool.query<{
    id: number;
    title_i18n: { de?: string | null; fr?: string | null } | null;
    content_i18n: { de?: JournalContent | null; fr?: JournalContent | null } | null;
  }>(
    "SELECT id, title_i18n, content_i18n FROM alit_sections WHERE locale = 'de' ORDER BY sort_order ASC"
  );

  const result: AlitSection[] = [];
  for (const r of rows) {
    const content = t<JournalContent>(r.content_i18n ?? null, locale);
    // Skip sections with no content in requested locale AND no DE fallback.
    if (!content) continue;
    const primaryEmpty = isEmptyField(r.content_i18n?.[locale]);
    const isFallback = primaryEmpty && locale !== "de";
    const title = t<string>(r.title_i18n ?? null, locale);
    result.push({
      id: r.id,
      title: title ?? null,
      content,
      isFallback,
    });
  }
  return result;
}

export async function getSiteSetting(key: string): Promise<string | null> {
  const { rows } = await pool.query(
    "SELECT value FROM site_settings WHERE key = $1",
    [key]
  );
  return rows[0]?.value ?? null;
}

export async function getProjekte(): Promise<Projekt[]> {
  const { rows } = await pool.query(
    "SELECT slug, titel, kategorie, paragraphs, content, external_url, archived FROM projekte ORDER BY sort_order ASC"
  );
  return rows.map((r) => ({
    slug: r.slug,
    titel: r.titel,
    kategorie: r.kategorie,
    paragraphs: r.paragraphs,
    content: r.content ?? undefined,
    externalUrl: r.external_url ?? undefined,
    archived: r.archived,
  }));
}
