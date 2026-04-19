import { hasLocale, isEmptyField, type Locale, type TranslatableField } from "./i18n-field";
import type { JournalContent } from "./journal-types";

export type Scale = "s" | "m" | "l";

export const SCALE_THRESHOLDS: Record<Scale, number> = {
  s: 1800,
  m: 1200,
  l: 800,
};

// Per-paragraph virtual-cost in addition to the raw char count. Accounts for
// the visual space the paragraph-break margin consumes — 6 paragraphs in a
// row push the layout ~120 visible pixels without a single extra character.
// Calibrated against real alit agenda items (see PR #97 V9).
export const PARAGRAPH_OVERHEAD = 80;

// Virtual-cost reserved on slide 1 for the title + lead + meta-row block.
// Slide 1 has visibly less body space than slides 2+ (which only show a
// slim continuation header), so its effective budget = threshold - this.
export const SLIDE1_OVERHEAD = 300;

export const SLIDE_HARD_CAP = 10;

export type SlideBlock = {
  text: string;
  weight: 300 | 400 | 800;
  isHeading: boolean;
};

export type SlideMeta = {
  datum: string;
  zeit: string;
  ort: string;
  title: string;
  lead: string | null;
  hashtags: string[];
  locale: Locale;
};

export type Slide = {
  index: number;
  isFirst: boolean;
  isLast: boolean;
  blocks: SlideBlock[];
  meta: SlideMeta;
};

export type AgendaItemForExport = {
  id: number;
  datum: string;
  zeit: string;
  title_i18n: TranslatableField<string> | null;
  lead_i18n: TranslatableField<string> | null;
  ort_i18n: TranslatableField<string> | null;
  content_i18n: TranslatableField<JournalContent> | null;
  hashtags:
    | {
        tag_i18n?: { de?: string | null; fr?: string | null };
        tag?: string;
        projekt_slug: string;
      }[]
    | null;
  images?: unknown;
};

export function flattenContent(
  content: JournalContent | null | undefined,
): SlideBlock[] {
  if (!content || !Array.isArray(content)) return [];
  const out: SlideBlock[] = [];
  for (const block of content) {
    switch (block.type) {
      case "paragraph":
      case "quote":
      case "highlight": {
        const text = block.content.map((n) => n.text).join("");
        if (text.trim().length === 0) break;
        out.push({ text, weight: 400, isHeading: false });
        break;
      }
      case "heading": {
        const text = block.content.map((n) => n.text).join("");
        if (text.trim().length === 0) break;
        out.push({ text, weight: 800, isHeading: true });
        break;
      }
      case "caption": {
        const text = block.content.map((n) => n.text).join("");
        if (text.trim().length === 0) break;
        out.push({ text, weight: 300, isHeading: false });
        break;
      }
      // image / video / embed / spacer → stripped (v1 text-only export)
    }
  }
  return out;
}

export function isLocaleEmpty(
  item: AgendaItemForExport,
  locale: Locale,
): boolean {
  const hasTitle = hasLocale(item.title_i18n, locale);
  const flat = flattenContent(item.content_i18n?.[locale] ?? null);
  const hasFlatText = flat.some((b) => b.text.trim().length > 0);
  return !hasTitle && !hasFlatText;
}

function resolveWithDeFallback<T>(
  field: TranslatableField<T> | null | undefined,
  locale: Locale,
): T | null {
  if (!field) return null;
  const primary = field[locale];
  if (!isEmptyField(primary)) return primary as T;
  const fb = field.de;
  if (!isEmptyField(fb)) return fb as T;
  return null;
}

function resolveHashtags(
  item: AgendaItemForExport,
  locale: Locale,
): string[] {
  if (!item.hashtags) return [];
  const out: string[] = [];
  for (const h of item.hashtags) {
    const tagLoc = h.tag_i18n?.[locale];
    const tagDe = h.tag_i18n?.de;
    const legacy = h.tag;
    const chosen =
      (typeof tagLoc === "string" && tagLoc.trim() ? tagLoc : null) ??
      (typeof tagDe === "string" && tagDe.trim() ? tagDe : null) ??
      (typeof legacy === "string" && legacy.trim() ? legacy : null);
    if (chosen) out.push(chosen);
  }
  return out;
}

export function splitAgendaIntoSlides(
  item: AgendaItemForExport,
  locale: Locale,
  scale: Scale,
): { slides: Slide[]; warnings: string[] } {
  if (isLocaleEmpty(item, locale)) {
    throw new Error("locale_empty");
  }

  const threshold = SCALE_THRESHOLDS[scale];
  const blocks = flattenContent(item.content_i18n?.[locale] ?? null);

  // Greedy fill with two calibrations: (1) each paragraph costs +overhead
  // to account for the visual space of the paragraph break, (2) slide 1
  // has reduced effective budget because title+lead+meta already claim
  // part of its canvas. Without these, long multi-paragraph items (~1100
  // chars at M) fit the raw-char threshold but overflow the 1350px canvas.
  const groups: SlideBlock[][] = [];
  let current: SlideBlock[] = [];
  let currentSize = 0;
  for (const block of blocks) {
    const cost = block.text.length + PARAGRAPH_OVERHEAD;
    const slideIdx = groups.length;
    const budget =
      slideIdx === 0 ? threshold - SLIDE1_OVERHEAD : threshold;
    if (currentSize > 0 && currentSize + cost > budget) {
      groups.push(current);
      current = [block];
      currentSize = cost;
    } else {
      current.push(block);
      currentSize += cost;
    }
  }
  if (current.length > 0) groups.push(current);
  // Title-only item (no content blocks) still produces 1 slide (title + lead).
  if (groups.length === 0) groups.push([]);

  const warnings: string[] = [];
  let clamped = groups;
  if (groups.length > SLIDE_HARD_CAP) {
    clamped = groups.slice(0, SLIDE_HARD_CAP);
    warnings.push("too_long");
  }

  // Title is locale-local (hasLocale guarantees present since we passed
  // isLocaleEmpty). Lead and ort fall back to DE to preserve meta-row
  // completeness. Hashtags resolve per-locale with tag_i18n.de + legacy fallback.
  const title = item.title_i18n?.[locale] ?? "";
  const lead = resolveWithDeFallback(item.lead_i18n, locale);
  const ort = resolveWithDeFallback(item.ort_i18n, locale) ?? "";
  const hashtags = resolveHashtags(item, locale);

  const total = clamped.length;
  const slides: Slide[] = clamped.map((groupBlocks, i) => ({
    index: i,
    isFirst: i === 0,
    isLast: i === total - 1,
    blocks: groupBlocks,
    meta: {
      datum: item.datum,
      zeit: item.zeit,
      ort,
      title,
      lead,
      // hashtags only on the last slide — matches Instagram convention and
      // makes the template logic trivial (render if meta.hashtags.length > 0).
      hashtags: i === total - 1 ? hashtags : [],
      locale,
    },
  }));

  return { slides, warnings };
}
