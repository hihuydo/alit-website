import pool from "./db";
import type { AgendaItemData } from "@/components/AgendaItem";
import type { JournalEntry } from "@/content/de/journal/entries";
import type { Projekt } from "@/content/projekte";
import type { JournalContent } from "./journal-types";
import { t, isEmptyField, hasLocale, type Locale, type TranslatableField } from "./i18n-field";
import { getDictionary } from "@/i18n/dictionaries";
import { isJournalInfoEmpty, wrapDictAsParagraph, type JournalInfoI18n } from "./journal-info-shared";
import { isUpcomingDatum } from "./agenda-datetime";

export type AlitSection = {
  id: number;
  title: string | null;
  content: JournalContent;
  /** True when the requested locale had no content and DE was used as fallback. */
  isFallback: boolean;
};

/**
 * Resolves the i-bar info-text for Panel 2 (Discours Agités). Lookup order:
 *   1. DB row `site_settings.journal_info_i18n` → locale value (non-empty)
 *   2. DB row → DE value (if FR was requested and empty) → marks `isFallback`
 *   3. Dict `journal.info` (DE or FR) wrapped as single paragraph
 *
 * `isFallback` is true when the returned content does not correspond to the
 * requested locale natively, so the caller can set `lang="de"` on the render
 * wrapper for screen-reader correctness. Invalid JSON in the DB row is caught
 * and falls through to the dict, with a stderr warning.
 */
export async function getJournalInfo(
  locale: Locale,
): Promise<{ content: JournalContent; isFallback: boolean }> {
  // DB errors propagate (same as other loaders in this file) so an outage
  // surfaces as a 5xx rather than silently serving default text. Only
  // JSON.parse / shape errors fall through to dict fallback, because those
  // are admin-authored data bugs, not operational failures.
  const { rows } = await pool.query<{ value: string | null }>(
    "SELECT value FROM site_settings WHERE key = $1",
    ["journal_info_i18n"],
  );

  let stored: JournalInfoI18n | null = null;
  if (rows.length > 0 && typeof rows[0].value === "string" && rows[0].value.trim()) {
    try {
      const parsed = JSON.parse(rows[0].value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const record = parsed as Record<string, unknown>;
        stored = {
          de: Array.isArray(record.de) ? (record.de as JournalContent) : null,
          fr: Array.isArray(record.fr) ? (record.fr as JournalContent) : null,
        };
      }
    } catch (err) {
      console.warn("[getJournalInfo] invalid stored JSON, falling back to dict:", err);
    }
  }

  const localeContent = stored?.[locale] ?? null;
  if (!isJournalInfoEmpty(localeContent)) {
    return { content: localeContent as JournalContent, isFallback: false };
  }
  if (locale !== "de") {
    const deContent = stored?.de ?? null;
    if (!isJournalInfoEmpty(deContent)) {
      return { content: deContent as JournalContent, isFallback: true };
    }
  }
  const dict = getDictionary(locale);
  return {
    content: wrapDictAsParagraph(dict.journal.info),
    isFallback: false,
  };
}

export async function getAgendaItems(locale: Locale): Promise<AgendaItemData[]> {
  const { rows } = await pool.query(
    // Post-drag-removal (2026-04-21): sort by datum DESC, then zeit DESC.
    // CASE guards against any off-spec datum that slips past the migration
    // (admin SQL-force-insert, future import) — unparseable rows land at
    // the end via NULLS LAST instead of crashing the query.
    `SELECT datum, zeit, ort_url, hashtags, images, title_i18n, lead_i18n, ort_i18n, content_i18n
     FROM agenda_items
     ORDER BY
       CASE WHEN datum ~ '^\\d{2}\\.\\d{2}\\.\\d{4}$'
            THEN TO_DATE(datum, 'DD.MM.YYYY')
       END DESC NULLS LAST,
       zeit DESC`

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
      ortUrl: (typeof r.ort_url === "string" && r.ort_url.length > 0) ? r.ort_url : null,
      isUpcoming: false, // set below — only the single nearest upcoming row wins

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

  // Codex PR-R1 [P2] addressed: "Nächster Termin" is singular. Rows are
  // pre-sorted `datum DESC`, so upcoming entries cluster at the top of
  // the list with the FARTHEST-future date first. The nearest-upcoming
  // is the LAST upcoming index we encounter walking top-to-bottom — flip
  // only that one. All other future rows stay `isUpcoming: false`.
  let nearestUpcomingIdx = -1;
  for (let i = 0; i < out.length; i++) {
    if (isUpcomingDatum(out[i].datum)) nearestUpcomingIdx = i;
  }
  if (nearestUpcomingIdx >= 0) out[nearestUpcomingIdx].isUpcoming = true;

  return out;
}

export async function getJournalEntries(locale: Locale): Promise<JournalEntry[]> {
  const { rows } = await pool.query(
    "SELECT date, author, title_border, images, hashtags, title_i18n, content_i18n, footer_i18n FROM journal_entries ORDER BY created_at DESC, id DESC"
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
  // slug_de is the stable internal ID (immutable after create).
  // slug_fr is optional; urlSlug is derived per locale.
  const { rows } = await pool.query(
    "SELECT slug_de, slug_fr, archived, title_i18n, kategorie_i18n, content_i18n, show_newsletter_signup, newsletter_signup_intro_i18n FROM projekte ORDER BY created_at DESC, id DESC"
  );
  const dict = getDictionary(locale);
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
    const slug_fr = (typeof r.slug_fr === "string" && r.slug_fr.length > 0) ? r.slug_fr : null;
    const urlSlug = locale === "fr" ? (slug_fr ?? r.slug_de) : r.slug_de;

    // Resolve per-locale newsletter intro with dict-fallback. JSONB may be
    // null (default), partially-populated ({de: [...], fr: null}), or fully
    // set. `isJournalInfoEmpty` also rejects whitespace-only paragraphs.
    const intro_i18n = r.newsletter_signup_intro_i18n as { de?: JournalContent | null; fr?: JournalContent | null } | null;
    const localeIntro = intro_i18n?.[locale] ?? null;
    const newsletterSignupIntro: JournalContent = !isJournalInfoEmpty(localeIntro)
      ? (localeIntro as JournalContent)
      : wrapDictAsParagraph(dict.newsletter.intro);

    out.push({
      slug_de: r.slug_de,
      slug_fr,
      urlSlug,
      titel: resolvedTitle ?? "",
      kategorie: resolvedKategorie ?? "",
      content: resolvedContent ?? undefined,
      archived: r.archived,
      titleIsFallback,
      kategorieIsFallback,
      contentIsFallback,
      showNewsletterSignup: Boolean(r.show_newsletter_signup),
      newsletterSignupIntro,
    });
  }
  return out;
}

// Locale-neutral slug source for Sitemap + generateMetadata. Unlike
// getProjekte(locale), this does NOT filter by locale visibility or
// resolve titles — it returns just the raw slug pair plus visibility
// flags so the caller can decide per-locale whether to emit an entry.
// Used to avoid coupling SEO/canonical emission to the UI reader's
// content-filter logic (would silently change routing/sitemap when
// getProjekte's filter evolves).
//
// Visibility flags (`has_de` / `has_fr`) mirror getProjekte's filter
// exactly: a projekt counts as visible in a locale when EITHER its
// title or its content is populated for that locale. A title-only
// projekt renders in panel 3 and at /<locale>/projekte/<slug>, so
// sitemap emission must treat it as visible too.
export type ProjektSitemapRow = {
  slug_de: string;
  slug_fr: string | null;
  has_de: boolean;
  has_fr: boolean;
};

export async function getProjekteForSitemap(): Promise<ProjektSitemapRow[]> {
  const { rows } = await pool.query(
    "SELECT slug_de, slug_fr, title_i18n, content_i18n FROM projekte ORDER BY created_at DESC, id DESC"
  );
  return rows.map((r) => ({
    slug_de: r.slug_de,
    slug_fr: (typeof r.slug_fr === "string" && r.slug_fr.length > 0) ? r.slug_fr : null,
    has_de: hasLocale(r.title_i18n, "de") || hasLocale(r.content_i18n, "de"),
    has_fr: hasLocale(r.title_i18n, "fr") || hasLocale(r.content_i18n, "fr"),
  }));
}
