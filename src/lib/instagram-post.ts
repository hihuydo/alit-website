import { hasLocale, isEmptyField, type Locale, type TranslatableField } from "./i18n-field";
import type { JournalContent } from "./journal-types";
import type { SupporterSlideLogo } from "./supporter-logos";

// Re-export Locale so consumers (instagram-overrides.ts, S1b API routes)
// can single-source the type via instagram-post.ts.
export type { Locale } from "./i18n-field";

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

/**
 * Hard cap on images displayed in Slide-1 cover-grid (M4a A5b).
 * Design constraint: Slide-1 cover Grid-Layout supports 1×1 / 2×1 / 3×1 / 2×2
 * (computed by `computeSlide1GridSpec` in instagram-cover-layout.ts).
 * Distinct from `MAX_BODY_IMAGE_COUNT` which caps the `agenda_items.images`
 * array size for DB-row validation.
 */
export const MAX_GRID_IMAGES = 4;

const BODY_LINE_HEIGHT_PX = 52; // 40px font × 1.3 line-height (matches slide-template)
const PARAGRAPH_GAP_PX = 22; // matches slide-template marginBottom (non-heading)
const LEAD_TO_BODY_GAP_PX = 100; // matches slide-template LEAD_TO_BODY_GAP
const CHARS_PER_LINE = 36; // closer to observed Satori wrap in the preview grid

/** Estimated vertical space (px) a paragraph occupies in the rendered slide. */
export function paraHeightPx(text: string): number {
  const lines = Math.max(1, Math.ceil(text.length / CHARS_PER_LINE));
  return lines * BODY_LINE_HEIGHT_PX + PARAGRAPH_GAP_PX;
}

export function blockHeightPx(block: SlideBlock): number {
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

export function splitOversizedBlock<T extends SlideBlock>(block: T, budget: number): T[] {
  if (blockHeightPx(block) <= budget) return [block];

  const chunks: T[] = [];
  let rest: T | null = block;

  while (rest) {
    const split: { head: T | null; tail: T | null } = splitBlockToBudget<T>(rest, budget);
    if (!split.head) {
      chunks.push(rest);
      break;
    }
    chunks.push(split.head);
    rest = split.tail;
  }

  return chunks;
}

function splitBlockToBudget<T extends SlideBlock>(
  block: T,
  budget: number,
): { head: T | null; tail: T | null } {
  const gap = block.isHeading ? 16 : PARAGRAPH_GAP_PX;
  const lineHeight = block.isHeading ? BODY_LINE_HEIGHT_PX * 1.15 : BODY_LINE_HEIGHT_PX;
  const maxLines = Math.max(1, Math.floor((budget - gap) / lineHeight));
  if (maxLines <= 0) {
    return { head: null, tail: block };
  }
  const maxChars = Math.max(CHARS_PER_LINE, Math.floor(maxLines * CHARS_PER_LINE));
  const rest = block.text.trim();
  if (rest.length <= maxChars) {
    return { head: { ...block, text: rest } as T, tail: null };
  }

  let cut = rest.lastIndexOf(" ", maxChars);
  if (cut < Math.floor(maxChars * 0.6)) cut = maxChars;
  const headText = rest.slice(0, cut).trimEnd();
  const tailText = rest.slice(cut).trimStart();
  return {
    head: headText.length > 0 ? ({ ...block, text: headText } as T) : null,
    tail: tailText.length > 0 ? ({ ...block, text: tailText } as T) : null,
  };
}

export type PackOpts = {
  firstSlideBudget: number;
  normalBudget: number;
};

/** Whole-block greedy packer. Single source of truth for auto-mode slide
 *  boundaries shared by Editor (projectAutoBlocksToSlides) and Renderer
 *  (splitAgendaIntoSlides). INVARIANT: no block is ever split across slides —
 *  if a block doesn't fit on the current slide and the slide is non-empty,
 *  flush and start a new slide with the block. If a block doesn't fit
 *  even alone (oversized), it goes alone on its own slide; the renderer
 *  handles within-slide overflow via splitOversizedBlock.
 *
 *  Phase-AGNOSTIC: knows nothing about intro/leadSlide/normal. Caller
 *  computes firstSlideBudget from its own grid/lead context.
 */
export function packAutoSlides<T extends SlideBlock>(
  blocks: T[],
  opts: PackOpts,
): T[][] {
  if (blocks.length === 0) return [];
  const groups: T[][] = [[]];
  let remaining = opts.firstSlideBudget;
  for (const block of blocks) {
    const cost = blockHeightPx(block);
    if (cost > remaining && groups[groups.length - 1].length > 0) {
      groups.push([]);
      remaining = opts.normalBudget;
    }
    groups[groups.length - 1].push(block);
    remaining -= cost;
  }
  return groups.filter((g) => g.length > 0);
}

/** Whole-block-safe last-slide compaction. If the last group fits combined
 *  with the previous group under the previous group's budget, merge them.
 *  Returns the same `groups` reference when no merge happens (the renderer's
 *  grid-alone-guard relies on this aliasing — see splitAgendaIntoSlides). */
export function compactLastSlide<T extends SlideBlock>(
  groups: T[][],
  prevSlideBudget: (idx: number) => number,
): T[][] {
  if (groups.length < 2) return groups;
  const lastIdx = groups.length - 1;
  const prevIdx = lastIdx - 1;
  const last = groups[lastIdx];
  const prev = groups[prevIdx];
  // last.length === 0 / prev.length === 0 guards: BOTH defensive only via
  // current callers. packAutoSlides filters empty groups via
  // `.filter(g => g.length > 0)`. Grid-alone-guard fires AFTER compactLastSlide
  // returns (mutates `let compactedGroups`, not the function input).
  if (last.length === 0 || prev.length === 0) return groups;
  const lastCost = last.reduce((s, b) => s + blockHeightPx(b), 0);
  const prevCost = prev.reduce((s, b) => s + blockHeightPx(b), 0);
  const budget = prevSlideBudget(prevIdx);
  if (prevCost + lastCost > budget) return groups;
  const merged = [...groups];
  merged[prevIdx] = [...prev, ...last];
  merged.pop();
  return merged;
}

export const SLIDE_HARD_CAP = 10;

/** Hard cap on `imageCount` accepted in PUT bodies. DOS-guard at the Zod
 *  stage — keeps obviously absurd values from reaching `pool.connect()`.
 *  The real per-item business cap is enforced via `countAvailableImages(item)`
 *  after the SELECT FOR UPDATE; this const just bounds the input space. */
export const MAX_BODY_IMAGE_COUNT = 20;

/** Hard cap on `slides[i].blocks.length` for PUT bodies. DOS-guard:
 *  ohne diesen cap könnte ein 256KB-body ~10000 block-IDs in einer
 *  einzelnen slide enthalten und dadurch den O(n) coverage-check loop
 *  belasten bevor Zod 422 zurückgibt. 200 ist großzügig für realistische
 *  single-slide-Layouts (typisch <20). */
export const EXPORT_BLOCKS_HARD_CAP = 200;

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
export type SlideKind = "text" | "grid" | "supporters";

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
  /** kind="supporters" only: pre-loaded logos with dataUrl + dimensions. */
  supporterLogos?: SupporterSlideLogo[];
  /** kind="supporters" only: locale-resolved label string ("Mit
   *  freundlicher Unterstützung von" / "Avec le soutien aimable de"). */
  supporterLabel?: string;
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
  /** Sprint M3 — JSONB array of supporter logos for the optional
   *  Supporter-Slide at the carousel tail. Default `[]` via SQL
   *  COALESCE for unmigrated rows. */
  supporter_logos?: { public_id: string; alt: string | null; width: number | null; height: number | null }[];
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

export function resolveWithDeFallback<T>(
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

export function resolveHashtags(
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
export function resolveImages(item: AgendaItemForExport, count: number): GridImage[] {
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

  const content = item.content_i18n?.[locale] ?? null;
  const exportBlocks = flattenContentWithIdFallback(content);
  // Telemetry: 1 warn per item with legacy id-less paragraphs. The
  // synthetic-id fallback keeps such items rendering correctly; the warn
  // is a migration signal during staging soak.
  const synthesized = exportBlocks.filter((b) => b.id.startsWith("synthetic-")).length;
  if (synthesized > 0) {
    console.warn("[s2c] synthesized id for legacy id-less block", {
      itemId: item.id,
      locale,
      synthesized,
    });
  }

  const images = resolveImages(item, imageCount);
  const hasGrid = images.length > 0;
  const gridColumns = (() => {
    const raw = item.images_grid_columns;
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 1) return 1;
    return Math.floor(raw);
  })();

  // M4a A2b: Lead lebt jetzt auf Slide-1 grid-cover (NICHT mehr Slide-2 text-prefix).
  // Slide-2 (erste text-slide nach grid) darf vollen SLIDE_BUDGET nutzen — sonst
  // spillt content unnötig auf Slide-3 wegen still-reduced budget für nicht-mehr-
  // existierenden Lead.
  const firstSlideBudget = hasGrid ? SLIDE_BUDGET : SLIDE1_BUDGET;

  // Single source of truth: shared whole-block packer with explicit
  // per-position budgets. NO cross-slide block-splitting (was rebalanceGroups).
  const packedGroups = packAutoSlides<ExportBlock>(exportBlocks, {
    firstSlideBudget,
    normalBudget: SLIDE_BUDGET,
  });
  const compactedGroups = compactLastSlide(packedGroups, (idx) =>
    idx === 0 ? firstSlideBudget : SLIDE_BUDGET,
  );

  // M4a A2c: Pre-M4a grid-alone-guard pushte sentinel `[]` für hasGrid+lead+empty-body
  // damit Slide-2 die Lead-text rendert. Nach M4a lebt Lead auf grid-cover-slide;
  // ein blank trailing-slide wäre Regression. Guard ENTFERNT.

  // Per-slide within-slide overflow split (renderer-only — keeps block.id on
  // every chunk so DK-6 dedup works). budgetForSlide is idx-aware: slide 0
  // uses firstSlideBudget (smaller for non-grid intro), slides 2+ use full.
  const budgetForSlide = (idx: number): number =>
    idx === 0 ? firstSlideBudget : SLIDE_BUDGET;
  const slidesWithChunks: ExportBlock[][] = compactedGroups.map((group, idx) =>
    group.flatMap((b) => splitOversizedBlock(b, budgetForSlide(idx))),
  );

  const meta = buildSlideMeta(item, locale);

  // Assemble carousel.
  const rawSlides: Array<Omit<Slide, "index" | "isFirst" | "isLast" | "meta">> = [];
  if (hasGrid) {
    rawSlides.push({
      kind: "grid",
      blocks: [],
      gridColumns,
      gridImages: images,
    });
    slidesWithChunks.forEach((groupBlocks) => {
      rawSlides.push({
        kind: "text",
        blocks: groupBlocks,
        // M4a A2/A3b: Lead lebt jetzt auf grid-cover-slide. ALLE text-slides
        // bei hasGrid haben leadOnSlide:false (kein doppelter Lead-Render).
        leadOnSlide: false,
      });
    });
  } else {
    // No-image path: slide 1 carries title+lead and any body blocks that fit
    // under them. Remaining body flows onto continuation slides.
    // M4a A3b: leadOnSlide:true für no-grid-Slide-0 ist der Detection-Anker
    // im SlideTemplate (kind:"text" && isFirst && leadOnSlide===true →
    // no-grid-cover branch). UNCONDITIONAL (auch für no-lead Items —
    // Lead-empty-handling via {meta.lead && <LeadBlock>}-conditional im Template).
    rawSlides.push({
      kind: "text",
      blocks: slidesWithChunks[0] ?? [],
      leadOnSlide: true,
    });
    for (const groupBlocks of slidesWithChunks.slice(1)) {
      rawSlides.push({ kind: "text", blocks: groupBlocks, leadOnSlide: false });
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

// ============================================================================
// S1a Layout-Overrides Foundation — exposed surface for instagram-overrides.ts
// + S1b API routes.
// ============================================================================

export type InstagramLayoutOverrides = {
  de?: PerImageCountOverrides | null;
  fr?: PerImageCountOverrides | null;
};

export type PerImageCountOverrides = {
  [imageCountStr: string]: InstagramLayoutOverride | null;
};

export type InstagramLayoutOverride = {
  contentHash: string;
  slides: InstagramLayoutSlide[];
};

export type InstagramLayoutSlide = {
  blocks: string[];
};

export type ExportBlock = SlideBlock & {
  id: string;
  sourceBlockId: string;
};

const EXPORT_BLOCK_PREFIX = "block:" as const;

/** Same content-shape filtering as flattenContent, but preserves block-IDs
 *  for override-referencing. Auto-path keeps using flattenContent (no IDs).
 *  Manual-path uses this helper exclusively. */
export function flattenContentWithIds(
  content: JournalContent | null | undefined,
): ExportBlock[] {
  if (!content || !Array.isArray(content)) return [];
  const out: ExportBlock[] = [];
  for (const block of content) {
    if (typeof block.id !== "string" || block.id.length === 0) continue;
    switch (block.type) {
      case "paragraph":
      case "quote":
      case "highlight": {
        const text = block.content.map((n) => n.text).join("");
        if (text.trim().length === 0) break;
        out.push({
          id: `${EXPORT_BLOCK_PREFIX}${block.id}`,
          sourceBlockId: block.id,
          text,
          weight: 400,
          isHeading: false,
        });
        break;
      }
      case "heading": {
        const text = block.content.map((n) => n.text).join("");
        if (text.trim().length === 0) break;
        out.push({
          id: `${EXPORT_BLOCK_PREFIX}${block.id}`,
          sourceBlockId: block.id,
          text,
          weight: 800,
          isHeading: true,
        });
        break;
      }
      case "caption": {
        const text = block.content.map((n) => n.text).join("");
        if (text.trim().length === 0) break;
        out.push({
          id: `${EXPORT_BLOCK_PREFIX}${block.id}`,
          sourceBlockId: block.id,
          text,
          weight: 300,
          isHeading: false,
        });
        break;
      }
    }
  }
  return out;
}

/** Renderer-only flatten that preserves all blocks. Synthesizes per-call
 *  IDs for legacy id-less blocks so they participate in boundary computation
 *  + within-slide chunking instead of being silently dropped (Codex R1
 *  Architecture). Editor keeps using flattenContentWithIds (filter) because
 *  it can't address synthetic-IDs in persisted layout-overrides. */
export function flattenContentWithIdFallback(
  content: JournalContent | null | undefined,
): ExportBlock[] {
  if (!content || !Array.isArray(content)) return [];
  const out: ExportBlock[] = [];
  let synIdx = 0;
  for (const block of content) {
    const hasId = typeof block.id === "string" && block.id.length > 0;
    // Resolve at push-site (after empty-text guard) so synIdx never
    // increments for filtered-out blocks (Sonnet R16 CORRECTNESS HIGH).
    const resolveIds = (): { id: string; sourceBlockId: string } => {
      if (hasId) {
        return { id: `${EXPORT_BLOCK_PREFIX}${block.id}`, sourceBlockId: block.id! };
      }
      const id = `synthetic-${synIdx++}`;
      return { id, sourceBlockId: id };
    };
    switch (block.type) {
      case "paragraph":
      case "quote":
      case "highlight": {
        const text = block.content.map((n) => n.text).join("");
        if (text.trim().length === 0) break;
        const ids = resolveIds();
        out.push({ ...ids, text, weight: 400, isHeading: false });
        break;
      }
      case "heading": {
        const text = block.content.map((n) => n.text).join("");
        if (text.trim().length === 0) break;
        const ids = resolveIds();
        out.push({ ...ids, text, weight: 800, isHeading: true });
        break;
      }
      case "caption": {
        const text = block.content.map((n) => n.text).join("");
        if (text.trim().length === 0) break;
        const ids = resolveIds();
        out.push({ ...ids, text, weight: 300, isHeading: false });
        break;
      }
    }
  }
  return out;
}

/** Single source-of-truth for ExportBlock-ID validation — S1b PUT validation
 *  imports this rather than re-deriving the prefix regex. */
export function isExportBlockId(s: unknown): s is string {
  return (
    typeof s === "string" &&
    s.startsWith(EXPORT_BLOCK_PREFIX) &&
    s.length > EXPORT_BLOCK_PREFIX.length
  );
}

/** Build SlideMeta for a given (item, locale). Extracted from
 *  splitAgendaIntoSlides inline-block so resolver + manual-path can reuse
 *  without duplication. */
export function buildSlideMeta(item: AgendaItemForExport, locale: Locale): SlideMeta {
  return {
    datum: item.datum,
    zeit: item.zeit,
    ort: resolveWithDeFallback(item.ort_i18n, locale) ?? "",
    title: item.title_i18n?.[locale] ?? "",
    lead: resolveWithDeFallback(item.lead_i18n, locale),
    hashtags: resolveHashtags(item, locale),
    locale,
  };
}

/** Editor-side projection of exportBlocks into slide-groups. Thin wrapper
 *  around the shared packAutoSlides + compactLastSlide helpers — must stay
 *  in lockstep with splitAgendaIntoSlides for DK-6 boundary parity. */
export function projectAutoBlocksToSlides(
  item: AgendaItemForExport,
  locale: Locale,
  imageCount: number,
  exportBlocks: ExportBlock[],
): ExportBlock[][] {
  // hasGrid MUST be derived via resolveImages (per-element public_id
  // validation), NOT via raw item.images.length. The PNG renderer
  // (splitAgendaIntoSlides) does it this way; otherwise malformed
  // entries lacking public_id ghost-grid the editor view.
  const hasGrid = resolveImages(item, imageCount).length > 0;
  // M4a A2c parity-fix: Lead lebt auf grid-cover-slide; firstSlideBudget
  // braucht keinen leadHeightPx-abzug mehr. Sonst diverge Editor und Renderer
  // auf Slide-2-block-count → DK-6 property-test breaks.
  const firstSlideBudget = hasGrid ? SLIDE_BUDGET : SLIDE1_BUDGET;
  const packedGroups = packAutoSlides<ExportBlock>(exportBlocks, {
    firstSlideBudget,
    normalBudget: SLIDE_BUDGET,
  });
  // M4a A2c: grid-alone-guard ENTFERNT (mirrors splitAgendaIntoSlides).
  // Lead lebt jetzt auf grid-cover; kein blank text-slide mehr nötig.
  return compactLastSlide(packedGroups, (idx) =>
    idx === 0 ? firstSlideBudget : SLIDE_BUDGET,
  );
}
