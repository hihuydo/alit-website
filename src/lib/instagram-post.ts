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
 * - `text`: HeaderRow + (on first slide of no-grid path) hashtags + title +
 *   lead, otherwise just body blocks. Optional `leadOnSlide` injects the
 *   lead at the top of the body region (used for slide 2 of the grid path
 *   so the lead doesn't get lost).
 * - `grid`: HeaderRow + hashtags + title + image grid that mirrors the
 *   website's agenda renderer. No lead, no body — both move to subsequent
 *   `text` slides. Only used on slide 1 when the admin opted into the grid.
 */
export type SlideKind = "text" | "grid";

export type GridImage = {
  publicId: string;
  /** width / height (from agenda_items.images JSONB), null when legacy row
   *  carries no dimensions. The template falls back to a 4:3 / 3:4 box. */
  width: number | null;
  height: number | null;
  orientation: "portrait" | "landscape";
  fit?: "cover" | "contain";
  cropX?: number;
  cropY?: number;
  alt?: string | null;
};

export type Slide = {
  index: number;
  isFirst: boolean;
  isLast: boolean;
  kind: SlideKind;
  blocks: SlideBlock[];
  /** Render lead at the top of the body region on this `text` slide. Set
   *  on the FIRST text slide that follows a `grid` slide so the lead has a
   *  home (slide 1 holds the grid instead of the lead). */
  leadOnSlide?: boolean;
  /** Number of grid columns to render — mirrors `agenda_items.images_grid_columns`.
   *  Only set on `kind="grid"` slides. */
  gridColumns?: number;
  /** Images attached to this slide. Single entry on the slide-1 grid case
   *  is allowed (mirrors the website's single-image branch). */
  gridImages?: GridImage[];
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
  /** Mirror of the website-renderer setting (AgendaItem.imagesGridColumns).
   *  Drives column count for the slide-1 grid. Optional — `null`/missing
   *  defaults to 1 (single-image / orientation-aware single cell). */
  images_grid_columns?: number | null;
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

function resolveImages(item: AgendaItemForExport, count: number): GridImage[] {
  if (count <= 0 || !Array.isArray(item.images)) return [];
  const out: GridImage[] = [];
  for (const raw of item.images as unknown[]) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as {
      public_id?: unknown;
      width?: unknown;
      height?: unknown;
      orientation?: unknown;
      fit?: unknown;
      cropX?: unknown;
      cropY?: unknown;
      alt?: unknown;
    };
    if (typeof r.public_id !== "string" || r.public_id.length === 0) continue;
    const orientation: "portrait" | "landscape" =
      r.orientation === "portrait" ? "portrait" : "landscape";
    const fit: "cover" | "contain" | undefined =
      r.fit === "contain" ? "contain" : r.fit === "cover" ? "cover" : undefined;
    out.push({
      publicId: r.public_id,
      width: typeof r.width === "number" ? r.width : null,
      height: typeof r.height === "number" ? r.height : null,
      orientation,
      fit,
      cropX: typeof r.cropX === "number" ? r.cropX : undefined,
      cropY: typeof r.cropY === "number" ? r.cropY : undefined,
      alt: typeof r.alt === "string" ? r.alt : null,
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

/**
 * Estimated rendered height (px) of the lead paragraph on a `text` slide
 * that gets a `leadOnSlide` prefix. Mirrors `paraHeightPx` but with the
 * lead's lineHeight (1.3 → ~52px @ 40px font) plus a generous
 * lead→body gap (LEAD_TO_BODY_GAP=100px in slide-template).
 */
function leadHeightPx(lead: string | null): number {
  if (!lead) return 0;
  const lines = Math.max(1, Math.ceil(lead.length / CHARS_PER_LINE));
  return lines * BODY_LINE_HEIGHT_PX + 100; // 100 = LEAD_TO_BODY_GAP
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

  // Slide structure depends on whether the admin opted into the image grid:
  //
  //   imageCount > 0:
  //     slide 1      = HeaderRow + hashtags + title + image grid (no lead, no body)
  //     slide 2      = HeaderRow + lead-prefix + body[0..K] (greedy fill)
  //     slides 3..N  = HeaderRow + body continuation
  //
  //   imageCount = 0 (legacy):
  //     slide 1      = HeaderRow + hashtags + title + lead (+ body if it
  //                    fits in SLIDE1_BUDGET)
  //     slides 2..N  = HeaderRow + body continuation
  //                    (when first body block exceeds SLIDE1_BUDGET, seed
  //                    empty intro slide-1 and start body on slide 2)
  //
  // Codex PR#128 R3 introduced the height-budget; this revision (user
  // request 2026-04-28) replaces the per-image carousel slides with a
  // single grid slide so all images stay together like on the website.
  const images = resolveImages(item, imageCount);
  const hasGrid = images.length > 0;
  const gridColumns = (() => {
    const raw = item.images_grid_columns;
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 1) return 1;
    return Math.floor(raw);
  })();

  const lead = resolveWithDeFallback(item.lead_i18n, locale);

  // Body fill: lead-prefix on slide 2 reduces the budget there. In the
  // no-grid path slide 1 keeps the SLIDE1_BUDGET intro behavior.
  const slide2BodyBudget = hasGrid
    ? Math.max(SLIDE_BUDGET - leadHeightPx(lead), 200)
    : SLIDE_BUDGET;

  const groups: SlideBlock[][] = [];
  let current: SlideBlock[] = [];
  let currentSize = 0;
  // Tracks which "slide kind" the current group fills:
  //   intro     = !hasGrid && groups.length === 0 (slide 1, narrow budget)
  //   leadSlide = hasGrid && groups.length === 0 (slide 2 with lead prefix)
  //   normal    = otherwise (full budget)
  let phase: "intro" | "leadSlide" | "normal" = hasGrid ? "leadSlide" : "intro";

  function budgetFor(p: typeof phase): number {
    if (p === "intro") return SLIDE1_BUDGET;
    if (p === "leadSlide") return slide2BodyBudget;
    return SLIDE_BUDGET;
  }

  for (const block of blocks) {
    const cost = paraHeightPx(block.text);
    const budget = budgetFor(phase);
    if (currentSize === 0 && cost > budget && phase === "intro") {
      // First body block doesn't fit on intro slide 1 → seed empty intro
      // slide and place block on slide 2 at full budget.
      groups.push([]);
      current = [block];
      currentSize = cost;
      phase = "normal";
    } else if (currentSize > 0 && currentSize + cost > budget) {
      groups.push(current);
      current = [block];
      currentSize = cost;
      phase = "normal";
    } else {
      current.push(block);
      currentSize += cost;
    }
  }
  if (current.length > 0) groups.push(current);

  // Balance pass — when slide 1 was seeded empty (intro-only) AND we
  // produced ≥ 3 continuation slides. Greedy fill leaves the last slide
  // with whatever remained, often much emptier than the rest. Re-distribute
  // the continuation slides toward `remainingCost / remainingSlides`,
  // while NEVER exceeding the hard SLIDE_BUDGET.
  const slide1IsIntroOnly =
    !hasGrid && groups.length > 0 && groups[0].length === 0;
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
    if (balanced.length <= greedyContSlideCount + 1) {
      groups.splice(continuationStart, groups.length - continuationStart, ...balanced);
    }
  }

  // Title-only items: no body groups produced.
  //   no-grid path  → seed one empty text slide so title+lead has a slide.
  //   grid path     → grid slide alone is enough; only add a lead-only slide
  //                   if there IS a lead worth showing.
  if (groups.length === 0 && !hasGrid) groups.push([]);
  if (groups.length === 0 && hasGrid && lead) groups.push([]);

  const title = item.title_i18n?.[locale] ?? "";
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

  const rawSlides: Array<Omit<Slide, "index" | "isFirst" | "isLast" | "meta">> = [];
  if (hasGrid) {
    rawSlides.push({
      kind: "grid",
      blocks: [],
      gridColumns,
      gridImages: images,
    });
    groups.forEach((groupBlocks, i) => {
      rawSlides.push({
        kind: "text",
        blocks: groupBlocks,
        leadOnSlide: i === 0 && Boolean(lead),
      });
    });
  } else {
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
    leadOnSlide: s.leadOnSlide,
    gridColumns: s.gridColumns,
    gridImages: s.gridImages,
    meta,
  }));

  return { slides, warnings };
}
