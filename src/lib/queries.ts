import pool from "./db";
import type { AgendaItemData } from "@/components/AgendaItem";
import type { JournalEntry } from "@/content/de/journal/entries";
import type { Projekt } from "@/content/projekte";
import type { JournalContent } from "./journal-types";
import { t, isEmptyField, hasLocale, type Locale, type TranslatableField } from "./i18n-field";

export type AlitSection = {
  id: number;
  title: string | null;
  content: JournalContent;
  /** True when the requested locale had no content and DE was used as fallback. */
  isFallback: boolean;
};

export async function getAgendaItems(locale: Locale): Promise<AgendaItemData[]> {
  const { rows } = await pool.query(
    "SELECT datum, zeit, ort_url, hashtags, images, title_i18n, lead_i18n, ort_i18n, content_i18n FROM agenda_items ORDER BY sort_order DESC"
  );
  const out: AgendaItemData[] = [];
  for (const r of rows) {
    const resolvedTitle = t<string>(r.title_i18n, locale);
    const resolvedLead = t<string>(r.lead_i18n, locale);
    const resolvedOrt = t<string>(r.ort_i18n, locale);
    const resolvedContent = t<JournalContent>(r.content_i18n, locale);
    // DE locale: skip entries with no DE title AND no DE content.
    // FR locale: DE fallback is intentional.
    if (locale === "de" && !hasLocale(r.title_i18n, "de") && !hasLocale(r.content_i18n, "de")) {
      continue;
    }
    if (!resolvedTitle && !resolvedContent) continue;

    const titleIsFallback = locale !== "de" && resolvedTitle !== null && !hasLocale(r.title_i18n, locale);
    const leadIsFallback = locale !== "de" && resolvedLead !== null && !hasLocale(r.lead_i18n, locale);
    const ortIsFallback = locale !== "de" && resolvedOrt !== null && !hasLocale(r.ort_i18n, locale);
    const contentIsFallback = locale !== "de" && resolvedContent !== null && !hasLocale(r.content_i18n, locale);

    // Transform DB hashtag shape {tag_i18n, projekt_slug}[] back to the public
    // shape {tag, projekt_slug}[] with locale-resolved labels. Public renderers
    // stay unchanged. Hashtags with no label for the requested locale fall back
    // to DE; if both are empty, the hashtag is filtered out.
    const hashtags: { tag: string; projekt_slug: string }[] = [];
    if (Array.isArray(r.hashtags)) {
      for (const h of r.hashtags) {
        if (!h || typeof h !== "object") continue;
        const slug = (h as { projekt_slug?: unknown }).projekt_slug;
        if (typeof slug !== "string" || !slug) continue;
        const tagI18n = (h as { tag_i18n?: unknown; tag?: unknown }).tag_i18n;
        let label: string | null = null;
        if (tagI18n && typeof tagI18n === "object") {
          label = t<string>(tagI18n as TranslatableField<string>, locale);
        } else if (typeof (h as { tag?: unknown }).tag === "string") {
          // Legacy pre-migration shape (shouldn't occur post-bootstrap, but
          // defensive): treat as DE-only.
          label = (h as { tag: string }).tag;
        }
        if (!label) continue;
        hashtags.push({ tag: label, projekt_slug: slug });
      }
    }

    out.push({
      datum: r.datum,
      zeit: r.zeit,
      ort: resolvedOrt ?? "",
      ortUrl: r.ort_url,
      titel: resolvedTitle ?? "",
      lead: resolvedLead ?? undefined,
      beschrieb: [],
      content: resolvedContent ?? undefined,
      hashtags,
      images: Array.isArray(r.images)
        ? r.images.map((img: { public_id: string; orientation: "portrait" | "landscape"; width?: number | null; height?: number | null; alt?: string | null }) => ({
            public_id: img.public_id,
            orientation: img.orientation,
            width: img.width ?? null,
            height: img.height ?? null,
            alt: img.alt ?? null,
          }))
        : [],
      titleIsFallback,
      leadIsFallback,
      ortIsFallback,
      contentIsFallback,
    });
  }
  return out;
}

export async function getJournalEntries(locale: Locale): Promise<JournalEntry[]> {
  const { rows } = await pool.query(
    "SELECT date, author, title_border, images, hashtags, title_i18n, content_i18n, footer_i18n FROM journal_entries ORDER BY sort_order DESC"
  );
  const out: JournalEntry[] = [];
  for (const r of rows) {
    const resolvedTitle = t<string>(r.title_i18n, locale);
    const resolvedContent = t<JournalContent>(r.content_i18n, locale);
    const resolvedFooter = t<string>(r.footer_i18n, locale);
    // DE isolation: skip entries where DE content is missing. Title-only DE
    // rows (with FR content only) would otherwise leak onto /de/ as empty
    // titles — Content is the primary language carrier, filter on that alone.
    // Codex P2 Sprint 4.
    if (locale === "de" && !hasLocale(r.content_i18n, "de")) {
      continue;
    }
    if (!resolvedContent) continue;

    const titleIsFallback = locale !== "de" && resolvedTitle !== null && !hasLocale(r.title_i18n, locale);
    const contentIsFallback = locale !== "de" && resolvedContent !== null && !hasLocale(r.content_i18n, locale);
    const footerIsFallback = locale !== "de" && resolvedFooter !== null && !hasLocale(r.footer_i18n, locale);

    // Hashtag transform: {tag_i18n, projekt_slug}[] → {tag, projekt_slug}[]
    // with locale-resolved label. Public renderers stay on legacy shape.
    const hashtags: { tag: string; projekt_slug: string }[] = [];
    if (Array.isArray(r.hashtags)) {
      for (const h of r.hashtags) {
        if (!h || typeof h !== "object") continue;
        const slug = (h as { projekt_slug?: unknown }).projekt_slug;
        if (typeof slug !== "string" || !slug) continue;
        const tagI18n = (h as { tag_i18n?: unknown; tag?: unknown }).tag_i18n;
        let label: string | null = null;
        if (tagI18n && typeof tagI18n === "object") {
          label = t<string>(tagI18n as TranslatableField<string>, locale);
        } else if (typeof (h as { tag?: unknown }).tag === "string") {
          label = (h as { tag: string }).tag;
        }
        if (!label) continue;
        hashtags.push({ tag: label, projekt_slug: slug });
      }
    }

    out.push({
      date: r.date,
      author: r.author ?? undefined,
      title: resolvedTitle ?? undefined,
      titleBorder: r.title_border,
      lines: [],
      images: Array.isArray(r.images) ? r.images : undefined,
      content: resolvedContent ?? undefined,
      footer: resolvedFooter ?? undefined,
      hashtags,
      titleIsFallback,
      contentIsFallback,
      footerIsFallback,
    });
  }
  return out;
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

export async function getProjekte(locale: Locale): Promise<Projekt[]> {
  const { rows } = await pool.query(
    "SELECT slug, paragraphs, external_url, archived, title_i18n, kategorie_i18n, content_i18n FROM projekte ORDER BY sort_order ASC"
  );
  const out: Projekt[] = [];
  for (const r of rows) {
    // i18n columns are the source of truth post-migration. Legacy titel/kategorie
    // are not read here — they may contain cross-locale content (dual-write
    // prefers DE but falls back to FR) and would leak FR into /de/ pages.
    const resolvedTitle = t<string>(r.title_i18n, locale);
    const resolvedKategorie = t<string>(r.kategorie_i18n, locale);
    const resolvedContent = t<JournalContent>(r.content_i18n, locale);
    // DE locale: skip entries with no DE content — no FR→DE fallback.
    // FR locale: DE-fallback is intentional; only skip when both locales empty.
    if (locale === "de" && !hasLocale(r.title_i18n, "de") && !hasLocale(r.content_i18n, "de")) {
      continue;
    }
    if (!resolvedTitle && !resolvedContent) continue;
    // Per-field fallback: true when the requested locale was empty AND we
    // fell back to DE. "de" reader never falls back, so always false there.
    const titleIsFallback = locale !== "de" && resolvedTitle !== null && !hasLocale(r.title_i18n, locale);
    const kategorieIsFallback = locale !== "de" && resolvedKategorie !== null && !hasLocale(r.kategorie_i18n, locale);
    const contentIsFallback = locale !== "de" && resolvedContent !== null && !hasLocale(r.content_i18n, locale);
    out.push({
      slug: r.slug,
      titel: resolvedTitle ?? "",
      kategorie: resolvedKategorie ?? "",
      paragraphs: r.paragraphs ?? [],
      content: resolvedContent ?? undefined,
      externalUrl: r.external_url ?? undefined,
      archived: r.archived,
      titleIsFallback,
      kategorieIsFallback,
      contentIsFallback,
    });
  }
  return out;
}
