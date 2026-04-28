import { hasLocale, isEmptyField, type Locale, type TranslatableField } from "./i18n-field";
import type { JournalContent } from "./journal-types";

/**
 * Visual height budget for the body region of a continuation slide, in
 * pixels on the 1080×1350 canvas. Derived as:
 *   1350 (canvas) - 80 (top padding) - 80 (bottom padding)
 *     - 34 (HeaderRow height @ 28px icon + line-height) - 60 (header→body gap)
 *     ≈ 1096; rounded down to 1080 for safety against Satori line-wrap variance.
 *
 * Was previously a char-budget (V14: 800 chars). Replaced with a
 * height-budget after Codex PR#128 R3 found that char-cost
 * (`text.length + PARAGRAPH_OVERHEAD`) cannot reliably predict rendered
 * height — long names, hyphenated German words, and hashtag-heavy lines
 * break differently than their char count suggests, leaving uneven
 * whitespace and routine overflows.
 */
export const SLIDE_BUDGET = 1080;

/**
 * Body height available on slide 1 BEFORE pushing body content to slide 2.
 * Slide 1 carries Header + hashtags + title + lead, which together claim
 * ~870px of the 1190px content area for typical 3-line title + 2-3 line
 * lead. That leaves ~320px = roughly one short paragraph (5-6 lines).
 *
 * If the first body paragraph wouldn't fit in 350px, the algorithm seeds
 * an empty intro slide-1 and starts body on slide 2 at the full
 * SLIDE_BUDGET. Conservative on purpose: better an extra "intro" slide
 * than a routine overflow.
 */
export const SLIDE1_BUDGET = 350;

const BODY_LINE_HEIGHT_PX = 52; // 40px font × 1.3 line-height (matches slide-template)
const PARAGRAPH_GAP_PX = 22; // matches slide-template marginBottom (non-heading)
const CHARS_PER_LINE = 36; // approx for sans-serif at 40px on 920px content width

/** Estimated vertical space (px) a paragraph occupies in the rendered slide. */
export function paraHeightPx(text: string): number {
  const lines = Math.max(1, Math.ceil(text.length / CHARS_PER_LINE));
  return lines * BODY_LINE_HEIGHT_PX + PARAGRAPH_GAP_PX;
}

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

  const blocks = flattenContent(item.content_i18n?.[locale] ?? null);

  // Images inject themselves into the carousel in website-order:
  //   slide 1      = title + lead + image[0]  (content-blocks shifted out)
  //   slides 2..N  = image-only slides for image[1..imageCount-1]
  //   slides N+1…  = text body slides, split by greedy fill like before
  // imageCount=0 → slide-1 = title+lead intro (NO body), body always starts
  // on slide 2. This is the post-PR#128 layout: HeaderRow + hashtag row +
  // title + lead claim ~870px of the 1190px content area, so squeezing body
  // onto slide 1 routinely overflows. Codex PR#128 R3.
  const images = resolveImages(item, imageCount);
  const hasSlide1Image = images.length > 0;

  // Greedy fill against visual height-budget (px). Each paragraph's cost
  // is its estimated rendered height (ceil(chars/CHARS_PER_LINE) lines ×
  // line-height + paragraph-gap). When body would exceed the slide budget,
  // push to a new slide.
  //
  // Slide 1 (when no slide-1 image) has REDUCED capacity SLIDE1_BUDGET
  // because Header + hashtags + title + lead consume most of it. If the
  // first body block alone exceeds SLIDE1_BUDGET, the algorithm seeds an
  // empty intro slide-1 and starts the block on slide 2 at full budget.
  const groups: SlideBlock[][] = [];
  let current: SlideBlock[] = [];
  let currentSize = 0;
  let onSlide1 = !hasSlide1Image; // first iteration is filling slide 1

  for (const block of blocks) {
    const cost = paraHeightPx(block.text);
    const budget = onSlide1 && groups.length === 0 ? SLIDE1_BUDGET : SLIDE_BUDGET;
    if (currentSize === 0 && cost > budget && onSlide1) {
      // First body block doesn't fit on intro slide 1 → seed empty intro
      // slide and place block on slide 2 with full budget.
      groups.push([]);
      current = [block];
      currentSize = cost;
      onSlide1 = false;
    } else if (currentSize > 0 && currentSize + cost > budget) {
      groups.push(current);
      current = [block];
      currentSize = cost;
      onSlide1 = false;
    } else {
      current.push(block);
      currentSize += cost;
    }
  }
  if (current.length > 0) groups.push(current);

  // Balance pass — when slide 1 was seeded empty (intro-only) AND we
  // produced ≥ 3 continuation slides. Greedy fill leaves the last slide
  // with whatever remained, often much emptier than the rest. Re-distribute
  // the continuation slides toward `remainingCost / remainingSlides`
  // (target recomputed each slide as we pack), while NEVER exceeding the
  // hard SLIDE_BUDGET. The hard cap may force the balanced layout to end
  // up with one MORE slide than greedy — that's accepted; visual balance
  // > minimal slide count, and we still respect SLIDE_HARD_CAP.
  const slide1IsIntroOnly =
    !hasSlide1Image && groups.length > 0 && groups[0].length === 0;
  const continuationStart = slide1IsIntroOnly ? 1 : 0;
  const greedyContSlideCount = groups.length - continuationStart;
  if (slide1IsIntroOnly && greedyContSlideCount >= 3) {
    const continuationBlocks = groups.slice(continuationStart).flat();
    const totalContCost = continuationBlocks.reduce(
      (sum, b) => sum + paraHeightPx(b.text),
      0,
    );
    let remainingCost = totalContCost;
    let remainingSlides = greedyContSlideCount;
    const balanced: SlideBlock[][] = [];
    let cur: SlideBlock[] = [];
    let curCost = 0;
    for (const block of continuationBlocks) {
      const cost = paraHeightPx(block.text);
      const target = remainingSlides > 0 ? remainingCost / remainingSlides : SLIDE_BUDGET;
      const wouldExceedHard = curCost > 0 && curCost + cost > SLIDE_BUDGET;
      // "Last balanced slot" relative to the planned count — once we're on
      // the last slot, prefer to absorb anything remaining unless hard cap
      // forces a new slot.
      const isLastBalancedSlot = balanced.length === remainingSlides - 1;
      const wouldExceedTargetEarly =
        !isLastBalancedSlot && curCost > 0 && curCost + cost > target;
      if (wouldExceedHard || wouldExceedTargetEarly) {
        balanced.push(cur);
        remainingCost -= curCost;
        remainingSlides -= 1;
        cur = [block];
        curCost = cost;
      } else {
        cur.push(block);
        curCost += cost;
      }
    }
    if (cur.length > 0) balanced.push(cur);
    // Adopt the balanced layout. It may have grown by 1 slot if the hard
    // cap forced an extra split; that's fine. Refuse only if it bloated
    // by more than 1 (defensive — shouldn't happen).
    if (balanced.length <= greedyContSlideCount + 1) {
      groups.splice(continuationStart, groups.length - continuationStart, ...balanced);
    }
  }

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
