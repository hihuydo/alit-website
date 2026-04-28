import { describe, it, expect } from "vitest";
import type { JournalContent } from "./journal-types";
import {
  countAvailableImages,
  flattenContent,
  isLocaleEmpty,
  leadHeightPx,
  splitAgendaIntoSlides,
  SLIDE_BUDGET,
  SLIDE_HARD_CAP,
  type AgendaItemForExport,
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

  it("(a) short content → 1 slide", () => {
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

  it("long body block (>SLIDE1_BUDGET height) → seeded empty intro slide-1, body starts on slide-2 (Codex PR#128 R3)", () => {
    // 350-char paragraph ≈ 10 lines × 52 + 22 = 542px, > SLIDE1_BUDGET (350).
    const item = baseItem({
      content_i18n: { de: paragraphs(1, 350), fr: null },
    });
    const { slides } = splitAgendaIntoSlides(item, "de");
    expect(slides.length).toBe(2);
    expect(slides[0].blocks).toEqual([]); // intro-only slide-1
    expect(slides[0].kind).toBe("text");
    expect(slides[1].blocks.length).toBe(1); // long body on slide-2
    expect(slides[1].kind).toBe("text");
    expect(slides[1].leadOnSlide).toBeFalsy(); // legacy: no leadOnSlide flag
  });

  it("short body fits on slide-1 (no intro seed)", () => {
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

  it("DK-22: 3 paragraphs of 200 chars → 2 slides, [1 block, 2 blocks] structure", () => {
    // 200-char paragraph: ceil(200/36)=6 lines × 52 + 22 = 334px each.
    // intro budget 350: para1 (334px) fits → slide 1. para2 (334) doesn't
    // fit (currentSize=334, 334+334=668>350) → slide 2. para3 (334) fits
    // (currentSize=334, 334+334=668≤1080) → slide 2.
    const item = baseItem({
      lead_i18n: { de: "Ein Lead", fr: null },
      content_i18n: { de: paragraphs(3, 200), fr: null },
    });
    const { slides } = splitAgendaIntoSlides(item, "de", 0);
    expect(slides).toHaveLength(2);
    expect(slides[0].kind).toBe("text");
    expect(slides[0].blocks).toHaveLength(1);
    expect(slides[1].kind).toBe("text");
    expect(slides[1].blocks).toHaveLength(2);
    expect(slides[0].leadOnSlide).toBeFalsy();
    expect(slides[1].leadOnSlide).toBeFalsy();
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

  it("first body paragraph too tall for slide-2 budget → empty leadSlide + body starts slide-3 (Codex PR-R1 [P1])", () => {
    // 200-char lead → ceil(200/36)=6 lines × 52 + 100 = 412px lead height.
    // slide2BodyBudget = 1080 - 412 = 668px.
    // First paragraph 600 chars → ceil(600/36)=17 × 52 + 22 = 906px.
    // 906 > 668 (doesn't fit slide-2 budget) but < 1080 (fits normal budget)
    // → slide 2 should be lead-only, body starts slide 3.
    // Pre-fix bug: guard only fired for `phase==="intro"`, so this 906px
    // block was placed onto slide 2's blocks anyway and overflowed visually.
    const longLead = "x".repeat(200);
    const item = baseItem({
      lead_i18n: { de: longLead, fr: longLead },
      content_i18n: { de: paragraphs(1, 600), fr: null },
      images: [img("a")],
    });
    const { slides } = splitAgendaIntoSlides(item, "de", 1);
    expect(slides[0].kind).toBe("grid");
    expect(slides[1].kind).toBe("text");
    expect(slides[1].leadOnSlide).toBe(true);
    expect(slides[1].blocks).toEqual([]);
    expect(slides[2].kind).toBe("text");
    expect(slides[2].leadOnSlide).toBeFalsy();
    expect(slides[2].blocks.length).toBeGreaterThan(0);
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
