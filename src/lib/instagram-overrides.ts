import { createHash } from "node:crypto";
import type { JournalContent } from "./journal-types";
import {
  buildSlideMeta,
  flattenContentWithIds,
  isLocaleEmpty,
  leadHeightPx,
  resolveHashtags,
  resolveImages,
  resolveWithDeFallback,
  splitAgendaIntoSlides,
  splitOversizedBlock,
  SLIDE_BUDGET,
  SLIDE1_BUDGET,
  SLIDE_HARD_CAP,
  type AgendaItemForExport,
  type ExportBlock,
  type GridImage,
  type InstagramLayoutOverride,
  type Locale,
  type Slide,
  type SlideBlock,
  type SlideMeta,
} from "./instagram-post";
import { stableStringify } from "./stable-stringify";
import { appendSupporterSlide } from "./instagram-supporter-slide";
import type { SupporterSlideLogo } from "./supporter-logos";

function normalizeContentForHash(content: JournalContent | null): unknown {
  if (!content) return [];
  return content.map((block) => {
    // Strip block.id so hash is robust against ID regeneration in legacy
    // code paths. Cast covers the JournalContent[number] union-with-id shape.
    const { id: _id, ...rest } = block as JournalContent[number] & { id: string };
    return rest;
  });
}

function normalizeImagesForHash(images: unknown): string[] {
  // INTENTIONAL CONSERVATIVE POLICY: hash ALL image public_ids in `item.images`,
  // not just the first `imageCount`. Reason: any mutation to the image catalog
  // (e.g. user adds a 3rd image while an override for imageCount=2 exists)
  // should stale the override. A stricter "hash = renderer output" variant
  // would be `resolveImages(item, imageCount).map(g => g.publicId)` but would
  // tolerate out-of-band image catalog changes — undesired for visual
  // consistency. Trade-off is intentional: false-positive stale beats silent
  // visual drift.
  if (!Array.isArray(images)) return [];
  return images
    .filter(
      (i): i is { public_id: string } =>
        typeof i === "object" &&
        i !== null &&
        typeof (i as { public_id?: unknown }).public_id === "string",
    )
    .map((i) => i.public_id);
}

function normalizeGridColumns(raw: number | null | undefined): number {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 1) return 1;
  return Math.floor(raw);
}

export function computeLayoutHash(opts: {
  item: AgendaItemForExport;
  locale: Locale;
  imageCount: number;
}): string {
  const { item, locale, imageCount } = opts;
  // Mirror renderer-resolution: DE-fallback for fields the renderer falls back on.
  // Title stays locale-only (no DE-fallback in renderer).
  const lead = resolveWithDeFallback(item.lead_i18n, locale);
  const ort = resolveWithDeFallback(item.ort_i18n, locale);
  const hashtags = resolveHashtags(item, locale);

  const payload = {
    title: item.title_i18n?.[locale] ?? "",
    lead: lead ?? "",
    ort: ort ?? "",
    content: normalizeContentForHash(item.content_i18n?.[locale] ?? null),
    hashtags,
    imagePublicIds: normalizeImagesForHash(item.images),
    gridColumns: normalizeGridColumns(item.images_grid_columns),
    imageCount,
  };
  return createHash("sha256").update(stableStringify(payload)).digest("hex").slice(0, 16);
}

/** 16-char md5-prefix of the canonicalized override JSONB.
 *  App-side CAS token: client passes the version received from GET, server
 *  recomputes from the stored row, mismatch → 412. md5 ist kein security-
 *  artifact (Optimistic-Concurrency-Token, kein authentication-payload);
 *  16-char prefix gibt 2^64 Kollisionsraum für single-row-CAS. NIE für
 *  authentication, signature verification, oder password hashing nutzen.
 *  Server-only — kann NICHT vom client-bundle importiert werden (node:crypto). */
export function computeLayoutVersion(override: InstagramLayoutOverride): string {
  return createHash("md5").update(stableStringify(override)).digest("hex").slice(0, 16);
}

function buildManualSlides(
  override: InstagramLayoutOverride,
  exportBlocks: ExportBlock[],
  meta: SlideMeta,
  hasGrid: boolean,
  gridImages: GridImage[],
  gridColumns: number,
): Slide[] {
  const blockById = new Map(exportBlocks.map((b) => [b.id, b]));
  const lead = meta.lead;
  const rawSlides: Array<Omit<Slide, "index" | "isFirst" | "isLast" | "meta">> = [];

  if (hasGrid) {
    rawSlides.push({ kind: "grid", blocks: [], gridColumns, gridImages });
  }

  override.slides.forEach((overrideSlide, idx) => {
    const slideBudget =
      idx === 0
        ? hasGrid
          ? lead
            ? Math.max(SLIDE_BUDGET - leadHeightPx(lead), 200)
            : SLIDE_BUDGET
          : SLIDE1_BUDGET
        : SLIDE_BUDGET;

    const slideBlocks: SlideBlock[] = [];
    for (const blockId of overrideSlide.blocks) {
      const exportBlock = blockById.get(blockId);
      if (!exportBlock) continue;
      slideBlocks.push(...splitOversizedBlock(exportBlock, slideBudget));
    }

    rawSlides.push({
      kind: "text",
      blocks: slideBlocks,
      leadOnSlide: idx === 0 && hasGrid && Boolean(lead),
    });
  });

  const clamped = rawSlides.slice(0, SLIDE_HARD_CAP);
  const total = clamped.length;
  return clamped.map((s, i) => ({
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
}

export type ResolverResult = {
  slides: Slide[];
  warnings: string[];
  mode: "auto" | "manual" | "stale";
  contentHash: string;
};

export function resolveInstagramSlides(
  item: AgendaItemForExport,
  locale: Locale,
  imageCount: number,
  override?: InstagramLayoutOverride | null,
  supporterSlideLogos?: SupporterSlideLogo[],
  supporterLabel?: string,
): ResolverResult {
  if (isLocaleEmpty(item, locale)) {
    return {
      slides: [],
      warnings: ["locale_empty"],
      mode: "auto",
      contentHash: computeLayoutHash({ item, locale, imageCount }),
    };
  }

  const exportBlocks = flattenContentWithIds(item.content_i18n?.[locale] ?? null);
  const contentHash = computeLayoutHash({ item, locale, imageCount });
  const autoResult = splitAgendaIntoSlides(item, locale, imageCount);

  // Single-Owner-Pattern (DK-6): the supporter-append step happens here
  // and ONLY here. splitAgendaIntoSlides + projectAutoBlocksToSlides stay
  // supporter-agnostic so all build paths converge through this function
  // and produce identical Supporter-Slide output.
  const baseMeta = buildSlideMeta(item, locale);
  const appendIfNeeded = (slides: Slide[]): { slides: Slide[]; warnings: string[] } => {
    if (!supporterSlideLogos || supporterSlideLogos.length === 0) {
      return { slides, warnings: [] };
    }
    if (!supporterLabel) {
      throw new Error(
        "resolveInstagramSlides: supporterSlideLogos given without supporterLabel",
      );
    }
    return appendSupporterSlide(slides, supporterSlideLogos, supporterLabel, baseMeta);
  };

  if (!override) {
    const appended = appendIfNeeded(autoResult.slides);
    return {
      slides: appended.slides,
      warnings: [...autoResult.warnings, ...appended.warnings],
      mode: "auto",
      contentHash,
    };
  }

  if (override.contentHash !== contentHash) {
    const appended = appendIfNeeded(autoResult.slides);
    return {
      slides: appended.slides,
      warnings: [...autoResult.warnings, "layout_stale", ...appended.warnings],
      mode: "stale",
      contentHash,
    };
  }

  const allOverrideBlocks = new Set(override.slides.flatMap((s) => s.blocks));
  const allCurrentBlocks = new Set(exportBlocks.map((b) => b.id));
  const unknownInOverride = [...allOverrideBlocks].some(
    (id) => !allCurrentBlocks.has(id),
  );
  const unreferencedCurrent = [...allCurrentBlocks].some(
    (id) => !allOverrideBlocks.has(id),
  );

  if (unknownInOverride || unreferencedCurrent) {
    const appended = appendIfNeeded(autoResult.slides);
    return {
      slides: appended.slides,
      warnings: [...autoResult.warnings, "layout_stale", ...appended.warnings],
      mode: "stale",
      contentHash,
    };
  }

  // Manual path — `hasGrid` MUST be derived via resolveImages (per-element
  // public_id validation), NOT via raw `item.images.length`. Auto-path does
  // it this way (see splitAgendaIntoSlides). Otherwise ghost-grid slides
  // when item.images contains entries lacking public_id.
  const gridImages = imageCount >= 1 ? resolveImages(item, imageCount) : [];
  const hasGrid = gridImages.length > 0;
  const gridColumns = normalizeGridColumns(item.images_grid_columns);
  const meta = buildSlideMeta(item, locale);
  const manualSlides = buildManualSlides(
    override,
    exportBlocks,
    meta,
    hasGrid,
    gridImages,
    gridColumns,
  );

  const appended = appendIfNeeded(manualSlides);
  return {
    slides: appended.slides,
    // Filter "too_long" — manual override implicitly accepts the slide-count.
    warnings: [
      ...autoResult.warnings.filter((w) => w !== "too_long"),
      ...appended.warnings,
    ],
    mode: "manual",
    contentHash,
  };
}
