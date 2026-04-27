import { hasLocale, isEmptyField, type Locale, type TranslatableField } from "./i18n-field";
import type { JournalContent } from "./journal-types";

/**
 * Char-budget per slide at the fixed body-size of 40px. Derived from
 * roughly 21 lines/slide × 36 chars/line ≈ 756; rounded up to 800 for a
 * small safety margin (atomic blocks can push over by a few chars).
 *
 * Was previously dynamic per Scale ("s" | "m" | "l" → 1800/1200/800
 * thresholds). Removed when the editor went to fixed font sizes — admins
 * no longer pick a scale, so the splitting logic also collapses to one
 * threshold tied to body=40px.
 */
export const SLIDE_BUDGET = 800;

// Per-paragraph virtual-cost in addition to the raw char count. Accounts for
// the visual space the paragraph-break margin consumes. V9 used 80 which was
// over-estimated (~25% of a line-capacity each) and made slide 1 underfill
// noticeably. Re-calibrated to ~22px ÷ ~44px-per-line × ~55-chars-per-line
// ≈ 27 virtual chars. Round up for safety.
export const PARAGRAPH_OVERHEAD = 30;

// Virtual-cost reserved on slide 1 for the title + lead + meta-row block.
// V9 used 300 which was over-estimated (~7 lines at M, matching a lead with
// 3-4 lines). Typical alit items have 1-2 line leads, so calibrate to the
// median: ~5 virtual lines × 40 chars ≈ 200. When lead is long the
// occasional overflow is cheaper than the routine underfill at 300.
export const SLIDE1_OVERHEAD = 200;

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

/**
 * Slide content kind — drives the SlideTemplate branching:
 *
 * - `text`: rendered with title/lead/blocks as before. When `imagePublicId`
 *   is ALSO set, it's the "slide-1-with-image" case (title+lead + image
 *   below, no body blocks).
 * - `image`: pure-image slide — just the image centered on the red bg,
 *   with hashtags in the footer. No title/lead/body blocks. Used for
 *   slides 2..imageCount when the admin exports multiple images.
 */
export type SlideKind = "text" | "image";

export type Slide = {
  index: number;
  isFirst: boolean;
  isLast: boolean;
  kind: SlideKind;
  blocks: SlideBlock[];
  /** UUID of the image in the `media` table. Loaded to bytes + base64
   *  just-in-time by the PNG-render route. Present on: slide-1 if
   *  imageCount>0, and on all `kind="image"` slides. */
  imagePublicId?: string;
  /** width / height, if known from the agenda item's images metadata.
   *  Used by the template to size the image box (Satori doesn't auto-fit). */
  imageAspect?: number;
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

/** Shape of a single image reference loaded from agenda_items.images JSONB. */
type ImageRef = {
  public_id: string;
  width?: number | null;
  height?: number | null;
};

function resolveImages(item: AgendaItemForExport, count: number): ImageRef[] {
  if (count <= 0 || !Array.isArray(item.images)) return [];
  const out: ImageRef[] = [];
  for (const raw of item.images as unknown[]) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as { public_id?: unknown; width?: unknown; height?: unknown };
    if (typeof r.public_id !== "string" || r.public_id.length === 0) continue;
    out.push({
      public_id: r.public_id,
      width: typeof r.width === "number" ? r.width : null,
      height: typeof r.height === "number" ? r.height : null,
    });
    if (out.length >= count) break;
  }
  return out;
}

export function countAvailableImages(item: AgendaItemForExport): number {
  if (!Array.isArray(item.images)) return 0;
  let n = 0;
  for (const raw of item.images as unknown[]) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as { public_id?: unknown };
    if (typeof r.public_id === "string" && r.public_id.length > 0) n++;
  }
  return n;
}

export function splitAgendaIntoSlides(
  item: AgendaItemForExport,
  locale: Locale,
  imageCount: number = 0,
): { slides: Slide[]; warnings: string[] } {
  if (isLocaleEmpty(item, locale)) {
    throw new Error("locale_empty");
  }

  const threshold = SLIDE_BUDGET;
  const blocks = flattenContent(item.content_i18n?.[locale] ?? null);

  // Images inject themselves into the carousel in website-order:
  //   slide 1      = title + lead + image[0]  (content-blocks shifted out)
  //   slides 2..N  = image-only slides for image[1..imageCount-1]
  //   slides N+1…  = text body slides, split by greedy fill like before
  // imageCount=0 → legacy behavior (title+lead on slide-1, content starts
  // filling slide-1 budget) remains bit-identical.
  const images = resolveImages(item, imageCount);
  const hasSlide1Image = images.length > 0;

  // Greedy fill with two calibrations: (1) each paragraph costs +overhead
  // to account for the visual space of the paragraph break, (2) slide 1
  // has reduced effective budget because title+lead+meta already claim
  // part of its canvas. When slide-1 carries an image instead of content,
  // the content-block greedy-fill starts at slide index 0 of the TEXT
  // deck (which will be concatenated AFTER the image-slides below).
  const groups: SlideBlock[][] = [];
  let current: SlideBlock[] = [];
  let currentSize = 0;
  for (const block of blocks) {
    const cost = block.text.length + PARAGRAPH_OVERHEAD;
    const slideIdx = groups.length;
    // SLIDE1_OVERHEAD only applies when the FIRST text slide is also the
    // first overall slide (no image on slide-1). With images, the first
    // text slide is N+1 — full budget.
    const budget =
      slideIdx === 0 && !hasSlide1Image
        ? threshold - SLIDE1_OVERHEAD
        : threshold;
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

  // Title-only item without images → 1 text slide (title+lead only).
  // Title-only item WITH images → 1 text slide (slide-1 with image) +
  //   further image-only slides. No text body slides needed.
  if (groups.length === 0 && !hasSlide1Image) groups.push([]);

  const title = item.title_i18n?.[locale] ?? "";
  const lead = resolveWithDeFallback(item.lead_i18n, locale);
  const ort = resolveWithDeFallback(item.ort_i18n, locale) ?? "";
  const hashtags = resolveHashtags(item, locale);
  const meta: SlideMeta = {
    datum: item.datum,
    zeit: item.zeit,
    ort,
    title,
    lead,
    hashtags,
    locale,
  };

  // Assemble full carousel in final order.
  const rawSlides: Array<Omit<Slide, "index" | "isFirst" | "isLast" | "meta">> = [];
  if (hasSlide1Image) {
    // Slide 1: title+lead + image[0], no body blocks.
    rawSlides.push({
      kind: "text",
      blocks: [],
      imagePublicId: images[0].public_id,
      imageAspect: aspectOf(images[0]),
    });
    // Slides 2..N: image-only for image[1..imageCount-1].
    for (let i = 1; i < images.length; i++) {
      rawSlides.push({
        kind: "image",
        blocks: [],
        imagePublicId: images[i].public_id,
        imageAspect: aspectOf(images[i]),
      });
    }
    // Body text slides after all images.
    for (const groupBlocks of groups) {
      rawSlides.push({ kind: "text", blocks: groupBlocks });
    }
  } else {
    // Legacy path: greedy groups become slides directly. First text slide
    // is slide-1 and carries title+lead on top of its blocks (same as before).
    for (const groupBlocks of groups) {
      rawSlides.push({ kind: "text", blocks: groupBlocks });
    }
  }

  const warnings: string[] = [];
  let clamped = rawSlides;
  if (rawSlides.length > SLIDE_HARD_CAP) {
    clamped = rawSlides.slice(0, SLIDE_HARD_CAP);
    warnings.push("too_long");
  }

  const total = clamped.length;
  const slides: Slide[] = clamped.map((s, i) => ({
    index: i,
    isFirst: i === 0,
    isLast: i === total - 1,
    kind: s.kind,
    blocks: s.blocks,
    imagePublicId: s.imagePublicId,
    imageAspect: s.imageAspect,
    meta,
  }));

  return { slides, warnings };
}

function aspectOf(img: ImageRef): number | undefined {
  if (typeof img.width === "number" && typeof img.height === "number" && img.height > 0) {
    return img.width / img.height;
  }
  return undefined;
}
