import { hasLocale, isEmptyField, type Locale, type TranslatableField } from "./i18n-field";
import type { JournalContent } from "./journal-types";

/**
 * Visual height budget for the body region of a continuation slide, in
 * pixels on the 1080×1350 canvas. Derived as:
 *   1350 (canvas) - 80 (top padding) - 80 (bottom padding)
 *     - 34 (HeaderRow height @ 28px icon + line-height) - 60 (header→body gap)
 *     ≈ 1096; rounded down slightly for safety against Satori line-wrap
 * variance while still using the visible slide height more fully.
 */
export const SLIDE_BUDGET = 1080;

/**
 * Body height available on slide 1 for the no-image path. Slide 1 carries
 * Header + hashtags + title + lead. Real preview renders show substantially
 * more room than the earlier conservative estimate, so slide 1 should accept
 * a medium paragraph before spilling.
 */
export const SLIDE1_BUDGET = 560;

const BODY_LINE_HEIGHT_PX = 52; // 40px font × 1.3 line-height (matches slide-template)
const PARAGRAPH_GAP_PX = 22; // matches slide-template marginBottom (non-heading)
const LEAD_TO_BODY_GAP_PX = 100; // matches slide-template LEAD_TO_BODY_GAP
const CHARS_PER_LINE = 36; // closer to observed Satori wrap in the preview grid

/** Estimated vertical space (px) a paragraph occupies in the rendered slide. */
export function paraHeightPx(text: string): number {
  const lines = Math.max(1, Math.ceil(text.length / CHARS_PER_LINE));
  return lines * BODY_LINE_HEIGHT_PX + PARAGRAPH_GAP_PX;
}

function blockHeightPx(block: SlideBlock): number {
  const lines = Math.max(1, Math.ceil(block.text.length / CHARS_PER_LINE));
  const gap = block.isHeading ? 16 : PARAGRAPH_GAP_PX;
  const lineHeight = block.isHeading ? BODY_LINE_HEIGHT_PX * 1.15 : BODY_LINE_HEIGHT_PX;
  return lines * lineHeight + gap;
}

/**
 * Estimated vertical space (px) the lead-prefix occupies on a `text` slide
 * that follows a `grid` slide. Distinct from `paraHeightPx` — same line-height
 * (lead and body share font-size 40 / line-height 1.3 ≈ 52px), but the
 * trailing gap to the first body block is `LEAD_TO_BODY_GAP_PX` (100px),
 * not `PARAGRAPH_GAP_PX` (22px). Reusing `paraHeightPx` underestimates by
 * 78px and routinely overflows slide 2.
 */
export function leadHeightPx(text: string | null): number {
  if (!text) return 0;
  const lines = Math.max(1, Math.ceil(text.length / CHARS_PER_LINE));
  return lines * BODY_LINE_HEIGHT_PX + LEAD_TO_BODY_GAP_PX;
}

function splitOversizedBlock(block: SlideBlock, budget: number): SlideBlock[] {
  if (blockHeightPx(block) <= budget) return [block];

  const chunks: SlideBlock[] = [];
  let rest: SlideBlock | null = block;

  while (rest) {
    const { head, tail } = splitBlockToBudget(rest, budget);
    if (!head) {
      chunks.push(rest);
      break;
    }
    chunks.push(head);
    rest = tail;
  }

  return chunks;
}

function splitBlockToBudget(
  block: SlideBlock,
  budget: number,
): { head: SlideBlock | null; tail: SlideBlock | null } {
  const gap = block.isHeading ? 16 : PARAGRAPH_GAP_PX;
  const lineHeight = block.isHeading ? BODY_LINE_HEIGHT_PX * 1.15 : BODY_LINE_HEIGHT_PX;
  const maxLines = Math.max(1, Math.floor((budget - gap) / lineHeight));
  if (maxLines <= 0) {
    return { head: null, tail: block };
  }
  const maxChars = Math.max(CHARS_PER_LINE, Math.floor(maxLines * CHARS_PER_LINE));
  let rest = block.text.trim();
  if (rest.length <= maxChars) {
    return { head: { ...block, text: rest }, tail: null };
  }

  let cut = rest.lastIndexOf(" ", maxChars);
  if (cut < Math.floor(maxChars * 0.6)) cut = maxChars;
  const headText = rest.slice(0, cut).trimEnd();
  const tailText = rest.slice(cut).trimStart();
  return {
    head: headText.length > 0 ? { ...block, text: headText } : null,
    tail: tailText.length > 0 ? { ...block, text: tailText } : null,
  };
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
 * Slide content kind:
 *
 * - `text`: HeaderRow + (on slide-1 of no-grid path) hashtags + title + lead
 *   plus any body blocks that fit, otherwise just body blocks. Optional
 *   `leadOnSlide` injects the lead at
 *   the top of the body region on the FIRST text slide of the grid path.
 * - `grid`: HeaderRow + hashtags + title + image grid (mirrors website
 *   AgendaItem). No lead, no body — both shift to subsequent `text` slides.
 *   Only on slide 1 when `imageCount > 0`.
 */
export type SlideKind = "text" | "grid";

/** A single image to render in the slide-1 grid (mirrors AgendaImage from
 *  agenda-images.ts but keyed for export use — `publicId` instead of
 *  `public_id`, only the fields the renderer needs). */
export type GridImage = {
  publicId: string;
  width: number | null;
  height: number | null;
  /** Defensive default when missing/invalid in the JSONB row: `"landscape"`
   *  (mirror AgendaItem.tsx:191 `?? "landscape"`). Codex R1 #4. */
  orientation: "portrait" | "landscape";
  /** undefined → template renders as `objectFit: "cover"`. */
  fit?: "cover" | "contain";
  /** 0-100 percent, default 50 (Center) — mirror AgendaItem `?? 50`. */
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
  /** True on the FIRST text slide that follows a `grid` slide. Template
   *  prefixes the body region with the lead. */
  leadOnSlide?: boolean;
  /** kind="grid" only: column count from `agenda_items.images_grid_columns`. */
  gridColumns?: number;
  /** kind="grid" only: full image array to render in the grid. */
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
  /** From `agenda_items.images_grid_columns`. Drives slide-1 grid cols. */
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
      // image / video / embed / spacer → stripped (text-only export)
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

/**
 * Extract the slide-1-grid image array from `agenda_items.images` JSONB.
 * Defensively defaults missing/invalid `orientation` to `"landscape"` —
 * mirrors AgendaItem.tsx:191 `?? "landscape"` so legacy pre-PR-#103 rows
 * still render in the export (Codex R1 #4).
 */
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
    out.push({
      publicId: r.public_id,
      width: typeof r.width === "number" ? r.width : null,
      height: typeof r.height === "number" ? r.height : null,
      orientation,
      fit:
        r.fit === "contain" ? "contain" : r.fit === "cover" ? "cover" : undefined,
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

export function splitAgendaIntoSlides(
  item: AgendaItemForExport,
  locale: Locale,
  imageCount: number = 0,
): { slides: Slide[]; warnings: string[] } {
  if (isLocaleEmpty(item, locale)) {
    throw new Error("locale_empty");
  }

  const blocks = flattenContent(item.content_i18n?.[locale] ?? null).flatMap(
    (block) => splitOversizedBlock(block, SLIDE_BUDGET),
  );

  const images = resolveImages(item, imageCount);
  const hasGrid = images.length > 0;
  const gridColumns = (() => {
    const raw = item.images_grid_columns;
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 1) return 1;
    return Math.floor(raw);
  })();

  const lead = resolveWithDeFallback(item.lead_i18n, locale);

  // Slide-2 budget reduction: lead-prefix consumes height. Floor 200 prevents
  // pathological overflow loop on gigantic leads (defensive, unlikely).
  const slide2BodyBudget = hasGrid
    ? Math.max(SLIDE_BUDGET - leadHeightPx(lead), 200)
    : SLIDE_BUDGET;

  // Greedy fill against visual height-budget (px).
  // Three phases (disjoint, advanced as we pack):
  //   intro     = !hasGrid && groups.length === 0 (slide 1 below title+lead)
  //   leadSlide = hasGrid && groups.length === 0  (slide 2 with lead prefix)
  //   normal    = otherwise                       (full budget)
  const groups: SlideBlock[][] = [];
  let current: SlideBlock[] = [];
  let currentSize = 0;
  let phase: "intro" | "leadSlide" | "normal" = hasGrid ? "leadSlide" : "intro";

  function budgetFor(p: typeof phase): number {
    if (p === "intro") return SLIDE1_BUDGET;
    if (p === "leadSlide") return slide2BodyBudget;
    return SLIDE_BUDGET;
  }

  const queue = [...blocks];
  while (queue.length > 0) {
    const block = queue.shift()!;
    const budget = budgetFor(phase);
    const remaining = budget - currentSize;
    const cost = blockHeightPx(block);

    if (cost <= remaining) {
      current.push(block);
      currentSize += cost;
      continue;
    }

    const { head, tail } = splitBlockToBudget(block, remaining);
    if (head) {
      current.push(head);
      currentSize += blockHeightPx(head);
      if (tail) queue.unshift(tail);
      groups.push(current);
      current = [];
      currentSize = 0;
      phase = "normal";
      continue;
    }

    if (current.length > 0) {
      groups.push(current);
      current = [];
      currentSize = 0;
      phase = "normal";
      queue.unshift(block);
      continue;
    }

    current.push(block);
    currentSize = cost;
    groups.push(current);
    current = [];
    currentSize = 0;
    phase = "normal";
  }
  if (current.length > 0) groups.push(current);

  // Balance pass — only for no-grid body continuations after slide 1. Re-distributes to
  // `remainingCost / remainingSlides` while never exceeding hard
  // `SLIDE_BUDGET`. The hasGrid path skips this: slide 2's reduced budget
  // makes mixed-budget rebalance non-trivial.
  const continuationSlideCount = Math.max(groups.length - 1, 0);
  if (!hasGrid && continuationSlideCount >= 2) {
    const introGroup = groups[0] ?? [];
    const continuationBlocks = groups.slice(1).flat();
    const totalContCost = continuationBlocks.reduce(
      (sum, b) => sum + blockHeightPx(b),
      0,
    );
    let remainingCost = totalContCost;
    let remainingSlides = continuationSlideCount;
    const balanced: SlideBlock[][] = [];
    let cur: SlideBlock[] = [];
    let curCost = 0;
    for (const block of continuationBlocks) {
      const cost = blockHeightPx(block);
      const target =
        remainingSlides > 0
          ? Math.min(SLIDE_BUDGET, remainingCost / remainingSlides)
          : SLIDE_BUDGET;
      const wouldExceedHard = curCost > 0 && curCost + cost > SLIDE_BUDGET;
      const wouldExceedTarget =
        remainingSlides > 1 && curCost > 0 && curCost + cost > target;
      if (wouldExceedHard || wouldExceedTarget) {
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
    if (balanced.length > 0 && balanced.length <= continuationSlideCount) {
      groups.splice(0, groups.length, introGroup, ...balanced);
    }
  }

  // Last-slide compaction (Variante E, Codex post-staging-smoke).
  // Wenn die letzte Slide komplett in die vorletzte passt (unter dem
  // jeweiligen Budget der vorletzten), → mergen. Adressiert den
  // "1 kurzer Absatz isoliert auf der letzten Slide"-Fall ohne den
  // Balance-Pass aggressiver zu machen.
  //
  // Budget der vorletzten Body-Gruppe hängt von ihrer Position ab:
  //   !hasGrid && index 0 → SLIDE1_BUDGET (intro-Phase)
  //   hasGrid && index 0  → slide2BodyBudget (leadSlide-Phase)
  //   sonst               → SLIDE_BUDGET (normal)
  //
  // Skip wenn entweder Slide leer ist — empty-intro-Seed (slide1IsIntroOnly)
  // bleibt erhalten, damit Slide 1 nicht plötzlich Body bekommt.
  if (groups.length >= 2) {
    const lastIdx = groups.length - 1;
    const prevIdx = lastIdx - 1;
    const last = groups[lastIdx];
    const prev = groups[prevIdx];
    if (last.length > 0 && prev.length > 0) {
      const lastCost = last.reduce((s, b) => s + blockHeightPx(b), 0);
      const prevCost = prev.reduce((s, b) => s + blockHeightPx(b), 0);
      const prevBudget =
        prevIdx === 0
          ? hasGrid
            ? slide2BodyBudget
            : SLIDE1_BUDGET
          : SLIDE_BUDGET;
      if (prevCost + lastCost <= prevBudget) {
        groups[prevIdx] = [...prev, ...last];
        groups.pop();
      }
    }
  }

  // Title-only edge case for grid path: grid slide alone is enough; only add
  // a lead-only text slide IF there IS a lead worth showing.
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

  // Assemble carousel.
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
    // No-image path: slide 1 carries title+lead and any body blocks that fit
    // under them. Remaining body flows onto continuation slides.
    rawSlides.push({ kind: "text", blocks: groups[0] ?? [] });
    for (const groupBlocks of groups.slice(1)) {
      rawSlides.push({ kind: "text", blocks: groupBlocks });
    }
  }

  // Hard-cap on TOTAL slides (grid + body). For hasGrid this means the body
  // slot is effectively SLIDE_HARD_CAP - 1; the slice handles both paths
  // uniformly because rawSlides already includes the grid element.
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
