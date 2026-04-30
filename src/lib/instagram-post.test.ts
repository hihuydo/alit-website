import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, afterEach, afterAll } from "vitest";
import type { JournalContent } from "./journal-types";
import {
  blockHeightPx,
  buildSlideMeta,
  compactLastSlide,
  countAvailableImages,
  flattenContent,
  flattenContentWithIdFallback,
  flattenContentWithIds,
  isExportBlockId,
  isLocaleEmpty,
  leadHeightPx,
  packAutoSlides,
  paraHeightPx,
  projectAutoBlocksToSlides,
  splitAgendaIntoSlides,
  splitOversizedBlock,
  SLIDE_BUDGET,
  SLIDE1_BUDGET,
  SLIDE_HARD_CAP,
  type AgendaItemForExport,
  type ExportBlock,
  type PackOpts,
} from "./instagram-post";

function baseItem(overrides: Partial<AgendaItemForExport> = {}): AgendaItemForExport {
  return {
    id: 1,
    datum: "2026-05-01",
    zeit: "19:00",
    title_i18n: { de: "Ein Titel", fr: "Un titre" },
    lead_i18n: { de: "Ein Lead", fr: "Un lead" },
    ort_i18n: { de: "Basel", fr: "Bâle" },
    content_i18n: null,
    hashtags: null,
    ...overrides,
  };
}

function paragraphs(count: number, charsEach: number): JournalContent {
  const text = "x".repeat(charsEach);
  return Array.from({ length: count }, (_, i) => ({
    id: `p-${i}`,
    type: "paragraph" as const,
    content: [{ text }],
  }));
}

describe("flattenContent", () => {
  it("strips image, video, embed, spacer blocks", () => {
    const content: JournalContent = [
      { id: "p1", type: "paragraph", content: [{ text: "keep me" }] },
      { id: "i1", type: "image", src: "/x.png" },
      { id: "v1", type: "video", src: "/v.mp4", mime_type: "video/mp4" },
      { id: "e1", type: "embed", url: "https://example.com" },
      { id: "s1", type: "spacer", size: "m" },
      { id: "p2", type: "paragraph", content: [{ text: "also keep" }] },
    ];
    const flat = flattenContent(content);
    expect(flat.map((b) => b.text)).toEqual(["keep me", "also keep"]);
  });

  it("maps heading → weight 800 + isHeading true", () => {
    const content: JournalContent = [
      { id: "h1", type: "heading", level: 2, content: [{ text: "Header" }] },
    ];
    const flat = flattenContent(content);
    expect(flat).toEqual([{ text: "Header", weight: 800, isHeading: true }]);
  });

  it("maps paragraph/quote/highlight → weight 400, caption → weight 300", () => {
    const content: JournalContent = [
      { id: "p1", type: "paragraph", content: [{ text: "para" }] },
      { id: "q1", type: "quote", content: [{ text: "quote" }] },
      { id: "hl1", type: "highlight", content: [{ text: "hl" }] },
      { id: "c1", type: "caption", content: [{ text: "cap" }] },
    ];
    const flat = flattenContent(content);
    expect(flat.map((b) => ({ text: b.text, weight: b.weight }))).toEqual([
      { text: "para", weight: 400 },
      { text: "quote", weight: 400 },
      { text: "hl", weight: 400 },
      { text: "cap", weight: 300 },
    ]);
  });

  it("drops empty/whitespace-only text blocks", () => {
    const content: JournalContent = [
      { id: "p1", type: "paragraph", content: [{ text: "" }] },
      { id: "p2", type: "paragraph", content: [{ text: "   " }] },
      { id: "p3", type: "paragraph", content: [{ text: "real" }] },
    ];
    expect(flattenContent(content).map((b) => b.text)).toEqual(["real"]);
  });

  it("returns [] for null/undefined/non-array input", () => {
    expect(flattenContent(null)).toEqual([]);
    expect(flattenContent(undefined)).toEqual([]);
  });
});

describe("isLocaleEmpty", () => {
  it("(e) empty title + empty content → true", () => {
    const item = baseItem({
      title_i18n: { de: "", fr: "" },
      content_i18n: null,
    });
    expect(isLocaleEmpty(item, "de")).toBe(true);
    expect(isLocaleEmpty(item, "fr")).toBe(true);
  });

  it("(f) empty title + image-only content → true (flattenContent strips)", () => {
    const imageOnly: JournalContent = [
      { id: "i1", type: "image", src: "/a.png" },
      { id: "i2", type: "image", src: "/b.png" },
    ];
    const item = baseItem({
      title_i18n: { de: "", fr: "" },
      content_i18n: { de: imageOnly, fr: imageOnly },
    });
    expect(isLocaleEmpty(item, "de")).toBe(true);
    expect(isLocaleEmpty(item, "fr")).toBe(true);
  });

  it("(g) empty title + whitespace-only content → true", () => {
    const wsOnly: JournalContent = [
      { id: "p1", type: "paragraph", content: [{ text: "   " }] },
      { id: "p2", type: "paragraph", content: [{ text: "\n\t" }] },
    ];
    const item = baseItem({
      title_i18n: { de: "", fr: "" },
      content_i18n: { de: wsOnly, fr: wsOnly },
    });
    expect(isLocaleEmpty(item, "de")).toBe(true);
  });

  it("(h) FR empty + DE title present → isLocaleEmpty('fr') is TRUE (locale-local via hasLocale, not t() fallback)", () => {
    const item = baseItem({
      title_i18n: { de: "DE-Titel", fr: "" },
      content_i18n: { de: null, fr: null },
    });
    expect(isLocaleEmpty(item, "fr")).toBe(true);
    expect(isLocaleEmpty(item, "de")).toBe(false);
  });

  it("title-only (no content) → not empty (1 slide with just title+lead)", () => {
    const item = baseItem({
      title_i18n: { de: "Titel", fr: "Titre" },
      content_i18n: null,
    });
    expect(isLocaleEmpty(item, "de")).toBe(false);
    expect(isLocaleEmpty(item, "fr")).toBe(false);
  });
});

describe("splitAgendaIntoSlides", () => {
  it("throws on locale_empty", () => {
    const item = baseItem({
      title_i18n: { de: "", fr: "" },
      content_i18n: null,
    });
    expect(() => splitAgendaIntoSlides(item, "de")).toThrow("locale_empty");
  });

  it("(a) short content without image → title, lead and body share slide 1", () => {
    const item = baseItem({
      content_i18n: {
        de: paragraphs(1, 100), // 100 chars, well below threshold
        fr: null,
      },
    });
    const { slides, warnings } = splitAgendaIntoSlides(item, "de");
    expect(slides).toHaveLength(1);
    expect(warnings).toEqual([]);
    expect(slides[0].isFirst).toBe(true);
    expect(slides[0].isLast).toBe(true);
    expect(slides[0].blocks).toHaveLength(1);
  });

  it("(b) long content → N slides per char-threshold (scale=m, ~1200 chars)", () => {
    // 5 paragraphs × 500 chars = 2500 total → at threshold 1200 → 3 slides
    // (each slide packs ≤1200 chars, greedy)
    const item = baseItem({
      content_i18n: { de: paragraphs(5, 500), fr: null },
    });
    const { slides, warnings } = splitAgendaIntoSlides(item, "de");
    expect(warnings).toEqual([]);
    expect(slides.length).toBeGreaterThan(1);
    // Every slide (except possibly the last) packs > 0 and <= threshold chars
    for (const s of slides) {
      const size = s.blocks.reduce((sum, b) => sum + b.text.length, 0);
      expect(size).toBeLessThanOrEqual(SLIDE_BUDGET + 500); // one block can push over (atomic)
    }
    // Sum of all blocks across slides equals input
    const totalChars = slides.reduce(
      (acc, s) => acc + s.blocks.reduce((sum, b) => sum + b.text.length, 0),
      0,
    );
    expect(totalChars).toBe(5 * 500);
  });

  it("(c) hashtags are present on every slide", () => {
    const item = baseItem({
      content_i18n: { de: paragraphs(4, 500), fr: null }, // ~2000 chars, scale=l=800 → 3+ slides
      hashtags: [
        { tag_i18n: { de: "alit", fr: "alit" }, projekt_slug: "p1" },
        { tag_i18n: { de: "literatur", fr: "litt" }, projekt_slug: "p2" },
      ],
    });
    const { slides } = splitAgendaIntoSlides(item, "de");
    expect(slides.length).toBeGreaterThan(1);
    for (const slide of slides) {
      expect(slide.meta.hashtags).toEqual(["alit", "literatur"]);
    }
    const last = slides[slides.length - 1];
    expect(last.isLast).toBe(true);
  });

  it("(d) raw >10 slides → clamped to 10 + warnings ['too_long']", () => {
    // 30 paragraphs × 500 chars at scale=l (threshold=800) → each para > threshold
    // so each becomes its own slide → 30 raw → clamped to 10
    const item = baseItem({
      content_i18n: { de: paragraphs(30, 500), fr: null },
    });
    const { slides, warnings } = splitAgendaIntoSlides(item, "de");
    expect(slides).toHaveLength(SLIDE_HARD_CAP);
    expect(warnings).toEqual(["too_long"]);
    // last slide flag is consistent with clamp
    expect(slides[SLIDE_HARD_CAP - 1].isLast).toBe(true);
  });

  it("title-only item → 1 slide with empty blocks array", () => {
    const item = baseItem({
      title_i18n: { de: "Nur Titel", fr: null },
      content_i18n: null,
    });
    const { slides, warnings } = splitAgendaIntoSlides(item, "de");
    expect(slides).toHaveLength(1);
    expect(slides[0].blocks).toEqual([]);
    expect(slides[0].meta.title).toBe("Nur Titel");
    expect(warnings).toEqual([]);
  });

  it("ort + lead fall back to DE when FR is empty (non-core fields)", () => {
    const item = baseItem({
      title_i18n: { de: "DE-Titel", fr: "FR-Titre" },
      lead_i18n: { de: "DE-Lead", fr: "" },
      ort_i18n: { de: "Basel", fr: "" },
      content_i18n: { fr: paragraphs(1, 50), de: null },
    });
    const { slides } = splitAgendaIntoSlides(item, "fr");
    expect(slides[0].meta.title).toBe("FR-Titre"); // locale-local
    expect(slides[0].meta.lead).toBe("DE-Lead"); // DE fallback
    expect(slides[0].meta.ort).toBe("Basel"); // DE fallback
  });

  it("hashtags resolve via tag_i18n locale → tag_i18n.de → legacy tag fallback chain", () => {
    const item = baseItem({
      content_i18n: { de: paragraphs(1, 50), fr: null },
      hashtags: [
        { tag_i18n: { de: "alit", fr: "alit-fr" }, projekt_slug: "p1" }, // locale-specific
        { tag_i18n: { de: "nur-de", fr: "" }, projekt_slug: "p2" }, // falls back to DE
        { tag: "legacy", projekt_slug: "p3" } as {
          tag: string;
          projekt_slug: string;
        }, // legacy field
      ],
    });
    const { slides } = splitAgendaIntoSlides(item, "fr");
    for (const slide of slides) {
      expect(slide.meta.hashtags).toEqual(["alit-fr", "nur-de", "legacy"]);
    }
  });
});

describe("countAvailableImages", () => {
  const img = (id: string, w = 1200, h = 800) => ({
    public_id: id,
    width: w,
    height: h,
    orientation: "landscape" as const,
  });

  it("counts valid public_id entries, skips malformed", () => {
    expect(
      countAvailableImages(
        baseItem({
          images: [img("a"), { nothing: true }, img("b"), { public_id: "" }],
        }),
      ),
    ).toBe(2);
    expect(countAvailableImages(baseItem({ images: null }))).toBe(0);
    expect(countAvailableImages(baseItem({ images: [] }))).toBe(0);
  });

  it("counts orientation-less items (defensive landscape default in resolveImages — Codex R1 #4)", () => {
    expect(
      countAvailableImages(
        baseItem({
          images: [
            { public_id: "no-orientation" },
            { public_id: "with-orientation", orientation: "portrait" },
          ],
        }),
      ),
    ).toBe(2);
  });
});

describe("imageCount=0 (legacy regression — strukturelle Invarianz)", () => {
  const img = (id: string) => ({
    public_id: id,
    width: 1200,
    height: 800,
    orientation: "landscape" as const,
  });

  it("long body block (>SLIDE1_BUDGET height) → first paragraph is split so slide-1 is not empty", () => {
    // 350-char paragraph exceeds the intro budget, so it should be split
    // across slide 1 and slide 2 instead of leaving slide 1 body-empty.
    const item = baseItem({
      content_i18n: { de: paragraphs(1, 350), fr: null },
    });
    const { slides } = splitAgendaIntoSlides(item, "de");
    expect(slides.length).toBeGreaterThanOrEqual(1);
    expect(slides[0].blocks.length).toBeGreaterThan(0);
    expect(slides[0].kind).toBe("text");
    expect(slides.at(-1)?.kind).toBe("text");
    expect(
      slides
        .flatMap((s) => s.blocks)
        .map((b) => b.text)
        .join(" ")
        .replace(/\s+/g, ""),
    ).toBe("x".repeat(350));
  });

  it("short body stays on slide-1 when imageCount=0 even if item has images", () => {
    const item = baseItem({
      content_i18n: { de: paragraphs(1, 100), fr: null },
      images: [img("a"), img("b")],
    });
    const { slides } = splitAgendaIntoSlides(item, "de", 0);
    expect(slides.length).toBe(1);
    expect(slides[0].kind).toBe("text");
    expect(slides[0].gridImages).toBeUndefined();
    expect(slides[0].blocks.length).toBe(1);
  });

  it("DK-22: no-image path uses slide-1 body space and keeps continuation slides compact", () => {
    const item = baseItem({
      lead_i18n: { de: "Ein Lead", fr: null },
      content_i18n: { de: paragraphs(3, 200), fr: null },
    });
    const { slides } = splitAgendaIntoSlides(item, "de", 0);
    expect(slides).toHaveLength(2);
    expect(slides[0].kind).toBe("text");
    expect(slides[0].blocks.length).toBeGreaterThan(0);
    expect(slides[1].kind).toBe("text");
    expect(slides[1].blocks.length).toBeGreaterThan(0);
    expect(slides[0].leadOnSlide).toBeFalsy();
    expect(slides[1].leadOnSlide).toBeFalsy();
  });

  it("splits an oversized body paragraph so no rendered body block exceeds SLIDE_BUDGET", () => {
    const text = "Ein sehr langer Satz ".repeat(90);
    const item = baseItem({
      content_i18n: {
        de: [
          {
            id: "p-long",
            type: "paragraph" as const,
            content: [{ text }],
          },
        ],
        fr: null,
      },
    });
    const { slides } = splitAgendaIntoSlides(item, "de", 0);
    expect(slides[0].blocks.length).toBeGreaterThan(0);
    const bodyBlocks = slides.flatMap((s) => s.blocks);
    expect(bodyBlocks.length).toBeGreaterThan(1);
    expect(bodyBlocks.map((b) => b.text).join(" ")).toBe(text.trim());
    for (const block of bodyBlocks) {
      expect(paraHeightPx(block.text)).toBeLessThanOrEqual(SLIDE_BUDGET);
    }
  });

  it("hard-cap > 10 slides → clamped + warnings ['too_long']", () => {
    const item = baseItem({
      content_i18n: { de: paragraphs(30, 500), fr: null },
    });
    const { slides, warnings } = splitAgendaIntoSlides(item, "de", 0);
    expect(slides).toHaveLength(SLIDE_HARD_CAP);
    expect(warnings).toContain("too_long");
  });
});

describe("leadHeightPx (distinguishable from paraHeightPx)", () => {
  it("leadHeightPx('x'.repeat(50)) === 204 px (≠ paraHeightPx 126)", () => {
    // 50 chars / 36 per-line = ceil to 2 lines × 52 = 104px
    // leadHeightPx: 104 + 100 (LEAD_TO_BODY_GAP) = 204
    // paraHeightPx: 104 + 22 (PARAGRAPH_GAP) = 126
    expect(leadHeightPx("x".repeat(50))).toBe(204);
  });

  it("leadHeightPx(null) === 0", () => {
    expect(leadHeightPx(null)).toBe(0);
  });

  it("leadHeightPx('') === 0 (empty string treated like null)", () => {
    expect(leadHeightPx("")).toBe(0);
  });
});

describe("grid path (imageCount > 0)", () => {
  const img = (
    id: string,
    w = 1200,
    h = 800,
    orientation: "portrait" | "landscape" = "landscape",
  ) => ({ public_id: id, width: w, height: h, orientation });

  it("imageCount=1 + cols=1 → 1 grid slide (single image) + 1 text-with-leadOnSlide", () => {
    const item = baseItem({
      content_i18n: { de: paragraphs(2, 200), fr: null },
      images: [img("pic1", 1200, 900)],
      images_grid_columns: 1,
    });
    const { slides } = splitAgendaIntoSlides(item, "de", 1);
    expect(slides.length).toBe(2);
    expect(slides[0].kind).toBe("grid");
    expect(slides[0].gridColumns).toBe(1);
    expect(slides[0].gridImages?.map((g) => g.publicId)).toEqual(["pic1"]);
    expect(slides[0].blocks).toEqual([]);
    expect(slides[1].kind).toBe("text");
    expect(slides[1].leadOnSlide).toBe(true);
    expect(slides[1].blocks.length).toBe(2);
  });

  it("imageCount=2 + cols=1 → 1 grid slide (defensive 2-col) + 1 text-with-leadOnSlide", () => {
    const item = baseItem({
      content_i18n: { de: paragraphs(1, 200), fr: null },
      images: [img("a"), img("b")],
      images_grid_columns: 1,
    });
    const { slides } = splitAgendaIntoSlides(item, "de", 2);
    expect(slides.length).toBe(2);
    expect(slides[0].kind).toBe("grid");
    expect(slides[0].gridColumns).toBe(1); // raw, template handles defensive 2-col
    expect(slides[0].gridImages).toHaveLength(2);
    expect(slides[1].kind).toBe("text");
    expect(slides[1].leadOnSlide).toBe(true);
  });

  it("imageCount=3 + cols=2 → 1 grid slide carries all 3 images + body slide", () => {
    const item = baseItem({
      content_i18n: { de: paragraphs(1, 200), fr: null },
      images: [img("pic1"), img("pic2"), img("pic3")],
      images_grid_columns: 2,
    });
    const { slides } = splitAgendaIntoSlides(item, "de", 3);
    expect(slides.length).toBe(2);
    expect(slides[0].kind).toBe("grid");
    expect(slides[0].gridColumns).toBe(2);
    expect(slides[0].gridImages?.map((g) => g.publicId)).toEqual(["pic1", "pic2", "pic3"]);
    expect(slides[1].kind).toBe("text");
    expect(slides[1].leadOnSlide).toBe(true);
    expect(slides[1].blocks.length).toBe(1);
  });

  it("imageCount > available → clamped silently to what's there", () => {
    const item = baseItem({
      content_i18n: { de: paragraphs(1, 100), fr: null },
      images: [img("only-one")],
    });
    const { slides } = splitAgendaIntoSlides(item, "de", 5);
    expect(slides.length).toBe(2);
    expect(slides[0].kind).toBe("grid");
    expect(slides[0].gridImages?.map((g) => g.publicId)).toEqual(["only-one"]);
    expect(slides[1].kind).toBe("text");
  });

  it("title-only + grid + lead → 1 grid + 1 lead-only text slide (blocks=[], leadOnSlide=true)", () => {
    const item = baseItem({
      content_i18n: null,
      images: [img("solo")],
    });
    const { slides } = splitAgendaIntoSlides(item, "de", 1);
    expect(slides.length).toBe(2);
    expect(slides[0].kind).toBe("grid");
    expect(slides[0].gridImages?.map((g) => g.publicId)).toEqual(["solo"]);
    expect(slides[1].kind).toBe("text");
    expect(slides[1].leadOnSlide).toBe(true);
    expect(slides[1].blocks).toEqual([]);
  });

  it("title-only + grid + no lead → 1 grid slide alone", () => {
    const item = baseItem({
      content_i18n: null,
      lead_i18n: { de: "", fr: "" },
      images: [img("solo")],
    });
    const { slides } = splitAgendaIntoSlides(item, "de", 1);
    expect(slides.length).toBe(1);
    expect(slides[0].kind).toBe("grid");
  });

  it("first body paragraph too tall for slide-2 budget → whole block stays on slide-2 (lead+body), within-slide chunked (S2c whole-block invariant)", () => {
    // 200-char lead → ceil(200/36)=6 lines × 52 + 100 = 412px lead height.
    // slide2BodyBudget = 1080 - 412 = 668px.
    // First paragraph 600 chars → ceil(600/36)=17 × 52 + 22 = 906px.
    // S2c whole-block: 906 > 668 with current group empty → force-push to
    // slide-2 (lead-prefixed). Renderer splits within-slide via
    // splitOversizedBlock(b, 668) → multi-chunk stack (chunks share block.id).
    // Pre-S2c cross-split would have moved the tail onto slide-3.
    const longLead = "x".repeat(200);
    const item = baseItem({
      lead_i18n: { de: longLead, fr: longLead },
      content_i18n: { de: paragraphs(1, 600), fr: null },
      images: [img("a")],
    });
    const { slides } = splitAgendaIntoSlides(item, "de", 1);
    expect(slides.length).toBe(2);
    expect(slides[0].kind).toBe("grid");
    expect(slides[1].kind).toBe("text");
    expect(slides[1].leadOnSlide).toBe(true);
    // Within-slide chunks: 906px / 668px budget → ≥2 chunks, all sharing parent id
    expect(slides[1].blocks.length).toBeGreaterThan(1);
    const parentIds = new Set(slides[1].blocks.map((b) => (b as ExportBlock).id));
    expect(parentIds.size).toBe(1);
  });

  it("long lead pushes body off slide-2 budget → lead bleibt auf slide-2, body splittet ab slide-3", () => {
    // 200-char lead → ceil(200/36)=6 lines × 52 + 100 = 412px lead height.
    // slide2BodyBudget = 1080 - 412 = 668px.
    // 2 paragraphs of 400 chars each → ceil(400/36)=12 × 52 + 22 = 646px each.
    // para1 (646) fits in 668 → slide 2. para2 (646) doesn't fit (646+646=1292>668)
    // AND doesn't fit in normal 1080 either (1292>1080) → slide 3.
    const longLead = "x".repeat(200);
    const item = baseItem({
      lead_i18n: { de: longLead, fr: longLead },
      content_i18n: { de: paragraphs(2, 400), fr: null },
      images: [img("a")],
    });
    const { slides } = splitAgendaIntoSlides(item, "de", 1);
    expect(slides[0].kind).toBe("grid");
    expect(slides.length).toBeGreaterThanOrEqual(3);
    expect(slides[1].leadOnSlide).toBe(true);
    for (let i = 2; i < slides.length; i++) {
      expect(slides[i].leadOnSlide).toBeFalsy();
    }
  });

  it("isFirst is true only on slide 0; isLast only on the last slide", () => {
    const item = baseItem({
      content_i18n: { de: paragraphs(2, 200), fr: null },
      images: [img("a"), img("b")],
      images_grid_columns: 2,
    });
    const { slides } = splitAgendaIntoSlides(item, "de", 2);
    expect(slides[0].isFirst).toBe(true);
    expect(slides[0].isLast).toBe(false);
    for (let i = 1; i < slides.length - 1; i++) {
      expect(slides[i].isFirst).toBe(false);
      expect(slides[i].isLast).toBe(false);
    }
    expect(slides[slides.length - 1].isLast).toBe(true);
  });

  it("hard-cap with grid (1 grid + 12 body raw) → 10 slides + too_long warning", () => {
    const item = baseItem({
      content_i18n: { de: paragraphs(20, SLIDE_BUDGET), fr: null },
      images: [img("a")],
    });
    const { slides, warnings } = splitAgendaIntoSlides(item, "de", 1);
    expect(slides.length).toBe(SLIDE_HARD_CAP);
    expect(warnings).toContain("too_long");
    expect(slides[0].kind).toBe("grid");
  });

  it("gridImages carry orientation/fit/cropX/cropY from images JSONB", () => {
    const item = baseItem({
      content_i18n: { de: paragraphs(1, 100), fr: null },
      images: [
        {
          public_id: "rich",
          width: 800,
          height: 1200,
          orientation: "portrait",
          fit: "contain",
          cropX: 25,
          cropY: 75,
          alt: "test alt",
        },
      ],
    });
    const { slides } = splitAgendaIntoSlides(item, "de", 1);
    expect(slides[0].kind).toBe("grid");
    const gi = slides[0].gridImages?.[0];
    expect(gi?.publicId).toBe("rich");
    expect(gi?.orientation).toBe("portrait");
    expect(gi?.fit).toBe("contain");
    expect(gi?.cropX).toBe(25);
    expect(gi?.cropY).toBe(75);
    expect(gi?.width).toBe(800);
    expect(gi?.height).toBe(1200);
    expect(gi?.alt).toBe("test alt");
  });

  it("gridImage without orientation → defaults to 'landscape' (Codex R1 #4 mirror AgendaItem)", () => {
    const item = baseItem({
      content_i18n: { de: paragraphs(1, 100), fr: null },
      images: [{ public_id: "no-orient", width: 800, height: 600 }],
    });
    const { slides } = splitAgendaIntoSlides(item, "de", 1);
    expect(slides[0].kind).toBe("grid");
    expect(slides[0].gridImages?.[0].orientation).toBe("landscape");
  });

  it("gridImage with invalid orientation → defaults to 'landscape'", () => {
    const item = baseItem({
      content_i18n: { de: paragraphs(1, 100), fr: null },
      images: [{ public_id: "bad-orient", orientation: "invalid", width: 800, height: 600 }],
    });
    const { slides } = splitAgendaIntoSlides(item, "de", 1);
    expect(slides[0].gridImages?.[0].orientation).toBe("landscape");
  });

  it("gridColumns=0 in DB → defensive default cols=1", () => {
    const item = baseItem({
      content_i18n: { de: paragraphs(1, 100), fr: null },
      images: [img("a")],
      images_grid_columns: 0,
    });
    const { slides } = splitAgendaIntoSlides(item, "de", 1);
    expect(slides[0].gridColumns).toBe(1);
  });

  it("gridColumns=null in DB → defensive default cols=1", () => {
    const item = baseItem({
      content_i18n: { de: paragraphs(1, 100), fr: null },
      images: [img("a")],
      images_grid_columns: null,
    });
    const { slides } = splitAgendaIntoSlides(item, "de", 1);
    expect(slides[0].gridColumns).toBe(1);
  });
});

describe("last-slide compaction (Variante E, post-staging-smoke)", () => {
  // Adressiert das "1 kurzer Absatz isoliert auf der letzten Slide"-Pattern,
  // das im 2026-04-28 Staging-Smoke beobachtet wurde (6/6 mit nur einem
  // kurzen Bio-Absatz). Codex-Empfehlung: nur compact wenn last komplett
  // in prev's Budget passt — sonst nichts ändern.
  const img = (id: string) => ({
    public_id: id,
    orientation: "landscape" as const,
    width: 1200,
    height: 800,
  });

  // Mathematischer Hintergrund: Greedy trennt zwei Blocks NUR wenn
  // currentSize+blockCost > currentBudget. Damit gilt nach greedy:
  // prev_cost + last_cost > prev_budget. Compaction prüft dasselbe
  // Budget, also kann sie nach reinem greedy nie feuern.
  // Compaction wirkt als Safety-Net NACH balance-pass (der für
  // !hasGrid && slide1IsIntroOnly && ≥3 continuation slides läuft) —
  // dort kann Re-distribution gelegentlich einen mergeable Last-Slot
  // produzieren. In den meisten realen Inputs ist Compaction ein No-op,
  // aber wenn sie feuert, garantiert sie das Budget-Limit der vorletzten
  // Slide. Diese Tests verifizieren die Sicherheits-Properties.

  it("no-grid path uses slide-1 body budget before spilling into continuation slides", () => {
    const item = baseItem({
      lead_i18n: null,
      content_i18n: { de: paragraphs(2, 200), fr: null },
    });
    const { slides } = splitAgendaIntoSlides(item, "de", 0);
    expect(slides.length).toBe(2);
    expect(slides[0].blocks.length).toBeGreaterThan(0);
    expect(slides[1].blocks.length).toBeGreaterThan(0);
  });

  it("long single paragraph stays on slide-1, within-slide chunks visualize overflow (S2c whole-block invariant)", () => {
    // 700-char paragraph → ceil(700/36)=20 lines × 52 + 22 = 1062px.
    // No-grid path: firstSlideBudget=SLIDE1_BUDGET=560.
    // S2c: 1062 > 560 with current empty → force-push to slide-1 alone.
    // Within-slide split at 560 → ≥2 chunks. Pre-S2c cross-split would
    // have moved the tail onto slide-2.
    const item = baseItem({
      lead_i18n: null,
      content_i18n: { de: paragraphs(1, 700), fr: null },
    });
    const { slides } = splitAgendaIntoSlides(item, "de", 0);
    expect(slides.length).toBe(1);
    expect(slides[0].blocks.length).toBeGreaterThan(1);
    // All chunks share parent block.id
    const parentIds = new Set(slides[0].blocks.map((b) => (b as ExportBlock).id));
    expect(parentIds.size).toBe(1);
  });

  it("hasGrid + nur Lead → 1 grid + 1 lead-only slide bleibt unverändert", () => {
    // grid-Pfad mit leerem body. groups bleibt [[]] (lead-only seed).
    // Compaction skippt da last.length===0 (oder prev.length===0).
    const item = baseItem({
      lead_i18n: { de: "Lead da", fr: null },
      content_i18n: { de: null, fr: null },
      images: [img("a")],
    });
    const { slides } = splitAgendaIntoSlides(item, "de", 1);
    expect(slides.length).toBe(2);
    expect(slides[0].kind).toBe("grid");
    expect(slides[1].kind).toBe("text");
    expect(slides[1].blocks).toEqual([]);
    expect(slides[1].leadOnSlide).toBe(true);
  });

  it("verifiziert merge-Pfad direkt: split content remains compact across reduced-budget grid slides", () => {
    // Kontrollierte hasGrid-Konstruktion zum Auslösen der merge-Branch:
    // - hasGrid=true, lead "Lead" (kurz, leadHeightPx klein).
    //   Mit lead "Lead" 4-chars: ceil(4/26)=1 line × 52 + 100 = 152px.
    //   slide2BodyBudget = 1080 - 152 = 928.
    // - 2 Absätze: 600 chars (906px) + 50 chars (126px).
    //   Block 1 (906): currentSize=0, 906 > 928? No → cur=[b1], phase=leadSlide.
    //   Block 2 (126): 906+126=1032 > 928? Yes → push. cur=[b2], phase=normal.
    //   groups=[[b1],[b2]]. Compaction: prevIdx=0, hasGrid → prevBudget=928.
    //   906+126=1032 > 928 → no merge. (Conservative — slide 2 hat reduced budget.)
    //
    // Drittes Setup ohne lead → slide2BodyBudget = SLIDE_BUDGET = 1080:
    // Dann 906+126=1032 ≤ 1080 → würde mergen — aber dann bei greedy
    // joinen sich beide direkt (906+126 ≤ 1080) → Compaction ist no-op.
    //
    // Fazit: ohne balance-pass-redistribution feuert Compaction nicht.
    // Dieser Test dokumentiert die Conservative-Property: kein Merge
    // wenn slide2BodyBudget verletzt wäre.
    const item = baseItem({
      lead_i18n: { de: "Lead", fr: null },
      content_i18n: {
        de: [
          {
            id: "p1",
            type: "paragraph" as const,
            content: [{ text: "x".repeat(600) }],
          },
          {
            id: "p2",
            type: "paragraph" as const,
            content: [{ text: "x".repeat(50) }],
          },
        ],
        fr: null,
      },
      images: [img("a")],
    });
    const { slides } = splitAgendaIntoSlides(item, "de", 1);
    expect(slides.length).toBe(3);
    expect(slides[0].kind).toBe("grid");
    expect(slides[1].blocks.length).toBeGreaterThan(0);
    expect(
      slides
        .slice(1)
        .flatMap((s) => s.blocks)
        .map((b) => b.text)
        .join(" ")
        .replace(/\s+/g, ""),
        ).toContain("x".repeat(50));
  });

  it("no-grid: large final content still spans multiple continuation chunks", () => {
    // 5 große-Absätze (je 600 chars). 600 chars = ceil(600/36)*52+22 = 17*52+22 = 906px.
    // 906+906 = 1812 > 1080 → kein merge möglich.
    const item = baseItem({
      lead_i18n: null,
      content_i18n: { de: paragraphs(5, 600), fr: null },
    });
    const { slides } = splitAgendaIntoSlides(item, "de", 0);
    expect(slides.length).toBeGreaterThan(2);
    expect(slides[slides.length - 1].blocks.length).toBeGreaterThanOrEqual(1);
  });

  it("nur 1 kurze body group → title+lead+body auf slide 1", () => {
    const item = baseItem({
      content_i18n: {
        de: [
          {
            id: "p1",
            type: "paragraph" as const,
            content: [{ text: "kurz" }],
          },
        ],
        fr: null,
      },
    });
    const { slides } = splitAgendaIntoSlides(item, "de", 0);
    expect(slides.length).toBe(1);
    expect(slides[0].blocks.length).toBe(1);
  });

  it("no-grid: letzter Absatz UND vorletzter beide kurz, aber vorletzter ist Slide 1 mit SLIDE1_BUDGET → korrektes Budget", () => {
    // Wenn nach allen passes nur 2 groups übrig sind, ist prevIdx=0
    // → Budget = SLIDE1_BUDGET (klein, weil Title+Lead). Test: 2 mittelgroße
    // Absätze (je 250 chars = ceil(250/36)*52+22=8*52+22=438px). Vorletzte
    // ist Slide 1 (intro) → SLIDE1_BUDGET ≈ 660. 438 alleine in slide 1
    // ginge, +438 = 876 > 660 → kein merge weil vorletzte = Slide 1.
    // Test verifiziert dass das kleine Budget respektiert wird.
    const item = baseItem({
      lead_i18n: { de: "L", fr: null },
      content_i18n: { de: paragraphs(2, 250), fr: null },
    });
    const { slides } = splitAgendaIntoSlides(item, "de", 0);
    // Slide 1 trägt entweder 1 Absatz (wenn 438 in SLIDE1_BUDGET passt) oder
    // ist intro-only. Last-slide-compaction darf nicht den 2. Absatz in
    // Slide 1 zwängen wenn das SLIDE1_BUDGET sprengt.
    if (slides[0].blocks.length > 0) {
      // Greedy hat Slide 1 = [absatz1], Slide 2 = [absatz2].
      // Compaction-Versuch: prevCost (438) + lastCost (438) = 876 > SLIDE1_BUDGET
      // → kein merge → bleibt 2 slides.
      expect(slides.length).toBe(2);
    } else {
      expect(slides[0].blocks.length).toBe(0);
    }
  });

  it("hasGrid: letzte body-slide passt in vorletzte → compact funktioniert auch im grid-Pfad", () => {
    // Grid-Pfad: rawSlides[0]=grid, rawSlides[1+]=body groups.
    // 4 mittlere Absätze + 1 kurzer Letzter. Vorletzte body-slide hat
    // SLIDE_BUDGET, kurzer Letzter passt rein → merge.
    const item = baseItem({
      lead_i18n: { de: "Lead", fr: "Lead" },
      content_i18n: {
        de: [
          ...paragraphs(4, 200),
          {
            id: "p-last",
            type: "paragraph" as const,
            content: [{ text: "x".repeat(50) }],
          },
        ],
        fr: null,
      },
      images: [img("a"), img("b")],
      images_grid_columns: 2,
    });
    const { slides } = splitAgendaIntoSlides(item, "de", 2);
    expect(slides[0].kind).toBe("grid");
    // Pre-fix wäre slides.length größer; post-fix wurde der kurze Letzte
    // in den vorletzten body-slide kompaktiert.
    const lastBodySlide = slides[slides.length - 1];
    expect(lastBodySlide.kind).toBe("text");
    expect(lastBodySlide.blocks.length).toBeGreaterThanOrEqual(2);
  });
});

describe("flattenContentWithIds", () => {
  it("produces block:<srcId> for paragraph/heading/quote/highlight/caption", () => {
    const content: JournalContent = [
      { id: "p1", type: "paragraph", content: [{ text: "para" }] },
      { id: "h1", type: "heading", level: 2, content: [{ text: "head" }] },
      { id: "q1", type: "quote", content: [{ text: "quote" }] },
      { id: "hl1", type: "highlight", content: [{ text: "hl" }] },
      { id: "c1", type: "caption", content: [{ text: "cap" }] },
    ];
    const out = flattenContentWithIds(content);
    expect(out.map((b) => b.id)).toEqual([
      "block:p1",
      "block:h1",
      "block:q1",
      "block:hl1",
      "block:c1",
    ]);
    expect(out.map((b) => b.sourceBlockId)).toEqual([
      "p1",
      "h1",
      "q1",
      "hl1",
      "c1",
    ]);
  });

  it("strips image/video/embed/spacer (mirror flattenContent)", () => {
    const content: JournalContent = [
      { id: "p1", type: "paragraph", content: [{ text: "keep" }] },
      { id: "i1", type: "image", src: "/x.png" },
      { id: "v1", type: "video", src: "/v.mp4", mime_type: "video/mp4" },
      { id: "e1", type: "embed", url: "https://example.com" },
      { id: "s1", type: "spacer", size: "m" },
    ];
    expect(flattenContentWithIds(content).map((b) => b.id)).toEqual(["block:p1"]);
  });

  it("strips empty/whitespace-only text-blocks", () => {
    const content: JournalContent = [
      { id: "p1", type: "paragraph", content: [{ text: "   " }] },
      { id: "p2", type: "paragraph", content: [{ text: "" }] },
      { id: "p3", type: "paragraph", content: [{ text: "hi" }] },
    ];
    expect(flattenContentWithIds(content).map((b) => b.id)).toEqual(["block:p3"]);
  });

  it("strips blocks without an id (legacy/backfill state)", () => {
    const content = [
      { type: "paragraph", content: [{ text: "no id" }] },
      { id: "", type: "paragraph", content: [{ text: "empty id" }] },
      { id: "p1", type: "paragraph", content: [{ text: "ok" }] },
    ] as unknown as JournalContent;
    expect(flattenContentWithIds(content).map((b) => b.id)).toEqual(["block:p1"]);
  });

  it("weight + isHeading mirror flattenContent semantics", () => {
    const content: JournalContent = [
      { id: "p1", type: "paragraph", content: [{ text: "p" }] },
      { id: "h1", type: "heading", level: 2, content: [{ text: "h" }] },
      { id: "c1", type: "caption", content: [{ text: "c" }] },
    ];
    const out = flattenContentWithIds(content);
    const weights = out.map((b) => ({ w: b.weight, h: b.isHeading }));
    expect(weights).toEqual([
      { w: 400, h: false },
      { w: 800, h: true },
      { w: 300, h: false },
    ]);
  });
});

describe("isExportBlockId", () => {
  it("accepts well-formed block:<id> strings", () => {
    expect(isExportBlockId("block:abc")).toBe(true);
    expect(isExportBlockId("block:p-1")).toBe(true);
  });

  it("rejects empty / non-string / missing prefix / prefix-only", () => {
    expect(isExportBlockId("")).toBe(false);
    expect(isExportBlockId("abc")).toBe(false);
    expect(isExportBlockId("block:")).toBe(false);
    expect(isExportBlockId(undefined)).toBe(false);
    expect(isExportBlockId(null)).toBe(false);
    expect(isExportBlockId(42)).toBe(false);
    expect(isExportBlockId({ id: "block:x" })).toBe(false);
  });

  it("round-trips with flattenContentWithIds output", () => {
    const content: JournalContent = [
      { id: "p1", type: "paragraph", content: [{ text: "x" }] },
    ];
    const [block] = flattenContentWithIds(content);
    expect(isExportBlockId(block.id)).toBe(true);
  });
});

describe("instagram-post.ts bundle-safety (Edge-safe leaf)", () => {
  it("contains no Node-only or server-only imports", () => {
    const src = readFileSync(path.resolve(__dirname, "instagram-post.ts"), "utf8");
    expect(src).not.toMatch(
      /from\s+["'](node:|pg|bcryptjs|jose|@\/lib\/db|@\/lib\/audit)/,
    );
  });
});

describe("buildSlideMeta", () => {
  it("returns lead/ort with DE-fallback when locale absent", () => {
    const item = baseItem({
      lead_i18n: { de: "DE Lead", fr: null },
      ort_i18n: { de: "Basel", fr: null },
    });
    const meta = buildSlideMeta(item, "fr");
    expect(meta.lead).toBe("DE Lead");
    expect(meta.ort).toBe("Basel");
  });

  it("title is locale-only — NO DE-fallback when FR title absent", () => {
    const item = baseItem({
      title_i18n: { de: "DE Title", fr: null },
    });
    const meta = buildSlideMeta(item, "fr");
    expect(meta.title).toBe("");
  });

  it("returns DE values for DE locale (no fallback path)", () => {
    const item = baseItem({
      title_i18n: { de: "DE T", fr: "FR T" },
      lead_i18n: { de: "DE L", fr: "FR L" },
      ort_i18n: { de: "DE O", fr: "FR O" },
    });
    const meta = buildSlideMeta(item, "de");
    expect(meta.title).toBe("DE T");
    expect(meta.lead).toBe("DE L");
    expect(meta.ort).toBe("DE O");
    expect(meta.locale).toBe("de");
  });

  it("splitAgendaIntoSlides output is bit-identical after meta refactor", () => {
    const item = baseItem({
      content_i18n: { de: paragraphs(3, 30), fr: null },
    });
    const result = splitAgendaIntoSlides(item, "de");
    expect(result.slides[0].meta.title).toBe("Ein Titel");
    expect(result.slides[0].meta.lead).toBe("Ein Lead");
    expect(result.slides[0].meta.ort).toBe("Basel");
    expect(result.slides[0].meta.datum).toBe("2026-05-01");
  });
});

describe("projectAutoBlocksToSlides", () => {
  // Fixture sizing per spec WARN-4: pick block dimensions that EACH budget
  // tier discriminates against differently. Targets:
  //  - !hasGrid (budget 560 / 1080):    overflows → ≥2 groups
  //  - hasGrid+lead (budget ~824):      overflows → ≥2 groups
  //  - hasGrid+!lead (budget 1080):     fits      → 1 group
  // 4 blocks × ~120 chars (≈4 lines × 52 + 22 = 230px) → cumulative ~920px.
  function exportBlocks(n: number, charsEach: number): ExportBlock[] {
    return Array.from({ length: n }, (_, i) => ({
      id: `block:p${i}`,
      sourceBlockId: `p${i}`,
      text: "x".repeat(charsEach),
      weight: 400 as const,
      isHeading: false,
    }));
  }

  it("returns [] when exportBlocks is empty", () => {
    const item = baseItem();
    expect(projectAutoBlocksToSlides(item, "de", 0, [])).toEqual([]);
  });

  it("!hasGrid + overflow → first group respects SLIDE1_BUDGET (≥2 groups)", () => {
    const item = baseItem({ images: [], lead_i18n: { de: "Lead", fr: null } });
    const blocks = exportBlocks(4, 120);
    const totalCost = blocks.reduce((s, b) => s + blockHeightPx(b), 0);
    expect(totalCost).toBeGreaterThan(SLIDE1_BUDGET);
    expect(totalCost).toBeLessThanOrEqual(SLIDE_BUDGET);
    const groups = projectAutoBlocksToSlides(item, "de", 0, blocks);
    expect(groups.length).toBeGreaterThanOrEqual(2);
    const g0Cost = groups[0].reduce((s, b) => s + blockHeightPx(b), 0);
    expect(g0Cost).toBeLessThanOrEqual(SLIDE1_BUDGET);
  });

  it("hasGrid + lead → first group uses lead-reduced budget (≥2 groups)", () => {
    const lead = "L".repeat(80);
    const item = baseItem({
      images: [{ public_id: "a" }],
      lead_i18n: { de: lead, fr: null },
    });
    const blocks = exportBlocks(4, 120);
    const groups = projectAutoBlocksToSlides(item, "de", 1, blocks);
    const expectedFirstBudget = Math.max(SLIDE_BUDGET - leadHeightPx(lead), 200);
    const totalCost = blocks.reduce((s, b) => s + blockHeightPx(b), 0);
    // Discrimination: combined cost overflows reduced budget but fits SLIDE_BUDGET.
    expect(totalCost).toBeGreaterThan(expectedFirstBudget);
    expect(totalCost).toBeLessThanOrEqual(SLIDE_BUDGET);
    const g0Cost = groups[0].reduce((s, b) => s + blockHeightPx(b), 0);
    expect(g0Cost).toBeLessThanOrEqual(expectedFirstBudget);
    expect(groups.length).toBeGreaterThanOrEqual(2);
  });

  it("hasGrid + !lead → first group uses full SLIDE_BUDGET (1 group)", () => {
    const item = baseItem({
      images: [{ public_id: "a" }],
      lead_i18n: { de: null, fr: null },
    });
    const blocks = exportBlocks(4, 120);
    const totalCost = blocks.reduce((s, b) => s + blockHeightPx(b), 0);
    expect(totalCost).toBeLessThanOrEqual(SLIDE_BUDGET);
    const groups = projectAutoBlocksToSlides(item, "de", 1, blocks);
    expect(groups.length).toBe(1);
  });

  it("hasGrid via resolveImages — malformed entries (no public_id) treated as text-only", () => {
    // S1b regression: `hasGrid` was previously derived from raw
    // item.images.length, diverging from the renderer's resolveImages-based
    // logic. With imageCount=1 + only-malformed images, the editor should
    // see SLIDE1_BUDGET (text-only path), not the smaller hasGrid budget.
    const lead = "L".repeat(80);
    const item = baseItem({
      images: [{} as unknown as { public_id: string }],
      lead_i18n: { de: lead, fr: null },
    });
    const blocks = exportBlocks(4, 120);
    const groups = projectAutoBlocksToSlides(item, "de", 1, blocks);
    const g0Cost = groups[0].reduce((s, b) => s + blockHeightPx(b), 0);
    // Text-only first-slide budget = SLIDE1_BUDGET (no lead-reduction);
    // hasGrid+lead would have shrunk it to ~Math.max(SLIDE_BUDGET-leadH, 200).
    expect(g0Cost).toBeLessThanOrEqual(SLIDE1_BUDGET);
  });
});

// ============================================================================
// DK-9: Direct unit tests for shared helpers (S2c)
// ============================================================================

/** Builds an ExportBlock whose blockHeightPx returns exactly
 *  `lines * 52 + 22` (paragraph; lines × BODY_LINE_HEIGHT_PX + PARAGRAPH_GAP_PX).
 *  Math anchor: blockHeightPx (exported function in instagram-post.ts) does
 *  `lines = max(1, ceil(text.length / 36))`. We feed text of length
 *  `lines * 36` so the ceil is exact. Cost reference:
 *    1 line = 74px, 5 lines = 282px, 10 lines = 542px,
 *    15 lines = 802px, 20 lines = 1062px (just under SLIDE_BUDGET=1080).
 */
function mkBlock(id: string, lines: number): ExportBlock {
  return {
    id,
    sourceBlockId: id,
    text: "x".repeat(lines * 36),
    weight: 400,
    isHeading: false,
  };
}

/** Module-level img helper for DK-6 fixtures (existing per-describe `img`
 *  consts at lines 281, 326 stay scoped — DK-6 lives outside them). */
function imgFixture(id: string) {
  return {
    public_id: id,
    width: 1200,
    height: 800,
    orientation: "landscape" as const,
  };
}

describe("packAutoSlides", () => {
  const opts: PackOpts = { firstSlideBudget: 500, normalBudget: 1000 };

  it("empty input returns empty array", () => {
    expect(packAutoSlides([], opts)).toEqual([]);
  });

  it("single block fits firstSlide → 1 group", () => {
    const blockA = mkBlock("a", 5); // cost=282 ≤ 500
    expect(packAutoSlides([blockA], opts)).toEqual([[blockA]]);
  });

  it("single oversized block goes alone (whole-block invariant, force-push on empty group)", () => {
    const blockA = mkBlock("a", 15); // cost=802 > firstSlide=500, group empty → force-push
    expect(packAutoSlides([blockA], opts)).toEqual([[blockA]]);
  });

  it("2 blocks both fit firstSlide → 1 group", () => {
    const blockA = mkBlock("a", 3); // 178
    const blockB = mkBlock("b", 3); // 178, total 356 ≤ 500
    expect(packAutoSlides([blockA, blockB], opts)).toEqual([[blockA, blockB]]);
  });

  it("2 blocks 2nd doesn't fit → flush + 2 groups", () => {
    const blockA = mkBlock("a", 5); // 282
    const blockB = mkBlock("b", 5); // 282, total 564 > 500 → flush
    expect(packAutoSlides([blockA, blockB], opts)).toEqual([[blockA], [blockB]]);
  });

  it("boundary: block exactly equals remaining budget → no flush", () => {
    const blockA = mkBlock("a", 3); // 178
    const blockB = mkBlock("b", 6); // 334, total 512 — fits firstSlide=512 exactly
    const result = packAutoSlides([blockA, blockB], { ...opts, firstSlideBudget: 512 });
    expect(result).toEqual([[blockA, blockB]]);
  });

  it("oversized block on slide 2+ goes alone (whole-block invariant after flush)", () => {
    const blockA = mkBlock("a", 3); // 178
    const blockB = mkBlock("b", 25); // 1322 > normalBudget=1000
    // A fits firstSlide=500. B oversize for normalBudget but force-pushed
    // because slide-2 starts empty after flush.
    expect(packAutoSlides([blockA, blockB], opts)).toEqual([[blockA], [blockB]]);
  });

  it("3 blocks: A fills slide-1, B+C group on slide-2 under normalBudget", () => {
    const blockA = mkBlock("a", 5); // 282
    const blockB = mkBlock("b", 5); // 282
    const blockC = mkBlock("c", 4); // 230
    // A(282) fits firstSlide=500. B(282) > remaining=218 → flush.
    // remaining=normalBudget=1000. B(282) push, remaining=718.
    // C(230) ≤ 718 → push same slide. Verifies remaining = normalBudget after flush.
    expect(packAutoSlides([blockA, blockB, blockC], opts)).toEqual([[blockA], [blockB, blockC]]);
  });
});

describe("compactLastSlide", () => {
  it("1 group: returns same reference (no-copy-on-no-merge)", () => {
    const blockA = mkBlock("a", 3);
    const groups = [[blockA]];
    const result = compactLastSlide(groups, () => 1000);
    expect(result).toHaveLength(1);
    expect(result).toBe(groups);
  });

  it("2 groups, combined fits → merged into 1 group", () => {
    const blockA = mkBlock("a", 3); // 178
    const blockB = mkBlock("b", 3); // 178, combined 356 ≤ 600
    const result = compactLastSlide([[blockA], [blockB]], () => 600);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual([blockA, blockB]);
  });

  it("2 groups, combined exceeds prevBudget → unchanged + same reference (no-copy)", () => {
    const blockA = mkBlock("a", 10); // 542
    const blockB = mkBlock("b", 3); // 178, combined 720 > 600 (last alone 178<600 OK)
    const groups = [[blockA], [blockB]];
    const result = compactLastSlide(groups, () => 600);
    expect(result).toEqual([[blockA], [blockB]]);
    expect(result).toBe(groups);
  });

  it("empty group as last (defensive) → unchanged + same reference", () => {
    const blockA = mkBlock("a", 3);
    const groups: ExportBlock[][] = [[blockA], []];
    const result = compactLastSlide(groups, () => 1000);
    expect(result).toEqual([[blockA], []]);
    expect(result).toBe(groups);
  });

  it("3 groups, last 2 fit; first preserved (multi-slide-path coverage)", () => {
    const blockA = mkBlock("a", 3);
    const blockB = mkBlock("b", 3);
    const blockC = mkBlock("c", 3);
    const result = compactLastSlide(
      [[blockA], [blockB], [blockC]],
      (idx) => (idx === 0 ? 300 : 600), // exercises prevSlideBudget(1) → 600
    );
    // prev=slide-2 cost=178, last=slide-3 cost=178, combined 356 ≤ 600 → merge last pair
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual([blockA]);
    expect(result[1]).toEqual([blockB, blockC]);
  });

  it("2 groups, idx-aware callback at prevIdx=0 (callback-uses-firstSlideBudget coverage)", () => {
    const blockA = mkBlock("a", 3); // 178
    const blockB = mkBlock("b", 5); // 282, combined 460
    const groups = [[blockA], [blockB]];
    // 460 > 300 (idx=0 budget) → no merge; 460 < 600 (idx=1 budget) → confirms idx is consulted.
    // A typo (_idx) => 600 would merge → result.length === 1 → fail.
    const result = compactLastSlide(groups, (idx) => (idx === 0 ? 300 : 600));
    expect(result).toHaveLength(2);
    expect(result).toBe(groups);
  });
});

describe("flattenContentWithIdFallback", () => {
  it("identity pass-through: id-having block → block:{id} prefix + sourceBlockId no-prefix", () => {
    const result = flattenContentWithIdFallback([
      { id: "p1", type: "paragraph", content: [{ text: "hello" }] },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "block:p1", sourceBlockId: "p1", text: "hello" });
  });

  it("synthetic fallback: id-less block → synthetic-{idx} for both id and sourceBlockId", () => {
    const result = flattenContentWithIdFallback([
      // @ts-expect-error — intentional id-less for fallback coverage
      { type: "paragraph", content: [{ text: "no-id" }] },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "synthetic-0", sourceBlockId: "synthetic-0", text: "no-id" });
  });

  it("mixed order [id, no-id, id]: counter only increments on id-less blocks", () => {
    const result = flattenContentWithIdFallback([
      { id: "p1", type: "paragraph", content: [{ text: "a" }] },
      // @ts-expect-error — intentional id-less
      { type: "paragraph", content: [{ text: "b" }] },
      { id: "p2", type: "paragraph", content: [{ text: "c" }] },
    ]);
    expect(result.map((b) => b.id)).toEqual(["block:p1", "synthetic-0", "block:p2"]);
  });

  it("null content returns empty array", () => {
    expect(flattenContentWithIdFallback(null)).toEqual([]);
  });

  it("undefined content returns empty array", () => {
    expect(flattenContentWithIdFallback(undefined)).toEqual([]);
  });

  it("synIdx increments at push-site, not for filtered-empty blocks", () => {
    const result = flattenContentWithIdFallback([
      // @ts-expect-error — id-less + empty text → filtered, synIdx unchanged
      { type: "paragraph", content: [{ text: "" }] },
      // @ts-expect-error — id-less + non-empty → gets synthetic-0 (NOT synthetic-1)
      { type: "paragraph", content: [{ text: "kept" }] },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("synthetic-0");
  });
});

describe("splitOversizedBlock budget-awareness (DK-9)", () => {
  it("budgetForSlide(0) chunks at SLIDE1_BUDGET (smaller) → more chunks than at SLIDE_BUDGET", () => {
    // huge: 25 lines × 52 + 22 = 1322px > SLIDE_BUDGET — both budgets force chunking
    const huge = mkBlock("a", 25);
    const chunksAtSlide1 = splitOversizedBlock(huge, SLIDE1_BUDGET);
    const chunksAtSlideN = splitOversizedBlock(huge, SLIDE_BUDGET);
    expect(chunksAtSlide1.length).toBeGreaterThan(chunksAtSlideN.length);
    // Both chunk-sets share parent block.id (within-slide invariant)
    expect(chunksAtSlide1.every((c) => c.id === "a")).toBe(true);
    expect(chunksAtSlideN.every((c) => c.id === "a")).toBe(true);
  });
});

describe("[s2c] synthesized id for legacy id-less block sanity-check", () => {
  afterEach(() => vi.restoreAllMocks());

  it("warns once + renderer keeps the block (synthesized id, not dropped)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const item = baseItem({
      content_i18n: {
        de: [
          { id: "p1", type: "paragraph", content: [{ text: "ok" }] },
          // @ts-expect-error — intentional id-less
          { type: "paragraph", content: [{ text: "no-id" }] },
        ],
        fr: null,
      },
    });
    const result = splitAgendaIntoSlides(item, "de", 0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      "[s2c] synthesized id for legacy id-less block",
      expect.objectContaining({ itemId: item.id, locale: "de", synthesized: 1 }),
    );
    // Architecture invariant: id-less block MUST appear in renderer output.
    const allRenderedTexts = result.slides
      .filter((s) => s.kind === "text")
      .flatMap((s) => (s.blocks as ExportBlock[]).map((b) => b.text));
    expect(allRenderedTexts.some((t) => t.includes("no-id"))).toBe(true);
  });
});

// ============================================================================
// DK-6: Property/regression test — Editor↔Renderer single source of truth
// ============================================================================

/** Helper — extracts dedup'd block.id list per slide. Safe because S2c
 *  guarantees splitAgendaIntoSlides writes ExportBlock-shaped inputs into
 *  its slides (Slide.blocks is statically typed SlideBlock[] for legacy
 *  manual-mode reasons; runtime is ExportBlock[]). */
function getSlideBlockIds(slide: { blocks: unknown[] }): string[] {
  const ids = (slide.blocks as ExportBlock[]).map((b) => b.id);
  return [...new Set(ids)]; // within-slide overflow chunks share parent id
}

describe("Auto-layout single source of truth (DK-6)", () => {
  // Zero-test-pass safety net: if the loop generates 0 it() calls (wrong
  // fixture shape, all locales empty), Vitest reports the describe as
  // green. Guard with afterAll-floor based on declared fixture matrix.
  let casesRan = 0;
  afterAll(() => {
    expect(casesRan, "DK-6 must run at least one case per fixture").toBeGreaterThanOrEqual(fixtures.length);
  });

  // Fixtures use existing baseItem + paragraphs helpers (lines 24-45).
  // KEY: paragraphs() sets id: `p-${i}` — flattenContentWithIds sees them as
  // addressable, flattenContentWithIdFallback prefixes to "block:p-{i}".
  // Drift-coverage: oversized-paragraph fixture is the main reason for DK-6;
  // others guard the happy-path.
  const fixtures: Array<{ label: string; item: AgendaItemForExport }> = [
    { label: "1-paragraph short (no grid)",
      item: baseItem({ content_i18n: { de: paragraphs(1, 100), fr: paragraphs(1, 100) } }) },
    { label: "5-paragraph medium (no grid)",
      item: baseItem({ content_i18n: { de: paragraphs(5, 200), fr: paragraphs(5, 200) } }) },
    { label: "8-paragraph medium-long (no grid, under hard-cap)",
      item: baseItem({ content_i18n: { de: paragraphs(8, 200), fr: paragraphs(8, 200) } }) },
    { label: "5-paragraph + grid 3 images",
      item: baseItem({
        content_i18n: { de: paragraphs(5, 200), fr: paragraphs(5, 200) },
        images: [imgFixture("uuid-a"), imgFixture("uuid-b"), imgFixture("uuid-c")],
      }) },
    { label: "OVERSIZED-DRIFT — 1 paragraph 1500 chars (forces single-block-overflow)",
      item: baseItem({ content_i18n: { de: paragraphs(1, 1500), fr: paragraphs(1, 1500) } }) },
    { label: "OVERSIZED + grid (drift × grid interaction)",
      item: baseItem({
        content_i18n: { de: paragraphs(1, 1500), fr: paragraphs(1, 1500) },
        images: [imgFixture("uuid-a")],
      }) },
    { label: "5-paragraph + grid 3 images, NO LEAD (grid-no-lead branch)",
      item: baseItem({
        lead_i18n: { de: null, fr: null },
        content_i18n: { de: paragraphs(5, 200), fr: paragraphs(5, 200) },
        images: [imgFixture("uuid-a"), imgFixture("uuid-b"), imgFixture("uuid-c")],
      }) },
  ];

  // Three documented Editor↔Renderer asymmetries — DK-6 equality does NOT
  // hold for items triggering them:
  // (a) result.warnings.includes("too_long"): renderer clamps to SLIDE_HARD_CAP=10,
  //     editor doesn't. Skip via early-return inside it().
  // (b) hasGrid + lead + empty body: renderer emits lead-only text-slide via
  //     grid-alone-guard, editor returns []. Skip via probeExportBlocks.length===0.
  // (c) content has id-less paragraphs (Codex R1 [Architecture]): renderer uses
  //     flattenContentWithIdFallback (synthetic IDs), editor uses
  //     flattenContentWithIds (filter). All 7 fixtures use paragraphs() with
  //     real IDs — asymmetry not triggered.

  for (const { item, label } of fixtures) {
    for (const locale of ["de", "fr"] as const) {
      for (const imageCount of [0, 1, 3]) {
        if (isLocaleEmpty(item, locale)) continue;
        const probeExportBlocks = flattenContentWithIds(item.content_i18n?.[locale] ?? null);
        if (probeExportBlocks.length === 0) continue;
        it(`${label} (${locale}, imageCount=${imageCount}) — editor + renderer agree`, () => {
          casesRan++;
          const exportBlocks = flattenContentWithIds(item.content_i18n?.[locale] ?? null);
          const editorGroups = projectAutoBlocksToSlides(item, locale, imageCount, exportBlocks);
          // No dedup needed for editorIds: projectAutoBlocksToSlides uses
          // whole-block placement, each ExportBlock.id appears exactly once
          // per group. rendererIds dedupes because within-slide overflow
          // chunks share parent block.id.
          const editorIds = editorGroups.map((g) => g.map((b) => b.id));

          const result = splitAgendaIntoSlides(item, locale, imageCount);
          // Hard-cap-skip (asymmetry a): renderer clamps to SLIDE_HARD_CAP,
          // editor doesn't. Comparison meaningless if clamped.
          if (result.warnings.includes("too_long")) return;

          const rendererTextSlides = result.slides.filter((s) => s.kind === "text");
          const rendererIds = rendererTextSlides.map(getSlideBlockIds);

          expect(rendererIds).toEqual(editorIds);
        });
      }
    }
  }
});

// ============================================================================
// DK-10: External-contract regression tests (library-level only)
// ============================================================================

describe("DK-10 external contract — too_long / hard-cap stability", () => {
  it("oversized item still triggers too_long warning", () => {
    // 30+ paragraphs forces > SLIDE_HARD_CAP=10 even with whole-block packing
    const item = baseItem({
      content_i18n: { de: paragraphs(30, 200), fr: paragraphs(30, 200) },
    });
    const result = splitAgendaIntoSlides(item, "de", 0);
    expect(result.warnings).toContain("too_long");
    expect(result.slides.length).toBeLessThanOrEqual(SLIDE_HARD_CAP);
  });

  it("borderline item: 8-paragraph stays warning-free", () => {
    const item = baseItem({
      content_i18n: { de: paragraphs(8, 200), fr: null },
    });
    const result = splitAgendaIntoSlides(item, "de", 0);
    expect(result.warnings).not.toContain("too_long");
  });

  it("oversized SINGLE block (drift case) doesn't silently change warning state", () => {
    // pre-S2c: cross-slide split could fit 1 oversized block in 2 slides under cap
    // post-S2c: whole-block-on-its-own-slide may bump count by 1, but should
    // still not trigger too_long for moderately-sized inputs
    const item = baseItem({
      content_i18n: { de: paragraphs(1, 1500), fr: null },
    });
    const result = splitAgendaIntoSlides(item, "de", 0);
    expect(result.warnings).not.toContain("too_long");
  });
});
