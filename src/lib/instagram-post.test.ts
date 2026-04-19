import { describe, it, expect } from "vitest";
import type { JournalContent } from "./journal-types";
import {
  flattenContent,
  isLocaleEmpty,
  splitAgendaIntoSlides,
  SCALE_THRESHOLDS,
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
    expect(() => splitAgendaIntoSlides(item, "de", "m")).toThrow("locale_empty");
  });

  it("(a) short content → 1 slide", () => {
    const item = baseItem({
      content_i18n: {
        de: paragraphs(1, 100), // 100 chars, well below threshold
        fr: null,
      },
    });
    const { slides, warnings } = splitAgendaIntoSlides(item, "de", "m");
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
    const { slides, warnings } = splitAgendaIntoSlides(item, "de", "m");
    expect(warnings).toEqual([]);
    expect(slides.length).toBeGreaterThan(1);
    // Every slide (except possibly the last) packs > 0 and <= threshold chars
    for (const s of slides) {
      const size = s.blocks.reduce((sum, b) => sum + b.text.length, 0);
      expect(size).toBeLessThanOrEqual(SCALE_THRESHOLDS.m + 500); // one block can push over (atomic)
    }
    // Sum of all blocks across slides equals input
    const totalChars = slides.reduce(
      (acc, s) => acc + s.blocks.reduce((sum, b) => sum + b.text.length, 0),
      0,
    );
    expect(totalChars).toBe(5 * 500);
  });

  it("(c) hashtags only on the last slide", () => {
    const item = baseItem({
      content_i18n: { de: paragraphs(4, 500), fr: null }, // ~2000 chars, scale=l=800 → 3+ slides
      hashtags: [
        { tag_i18n: { de: "alit", fr: "alit" }, projekt_slug: "p1" },
        { tag_i18n: { de: "literatur", fr: "litt" }, projekt_slug: "p2" },
      ],
    });
    const { slides } = splitAgendaIntoSlides(item, "de", "l");
    expect(slides.length).toBeGreaterThan(1);
    // earlier slides: hashtags == []
    for (let i = 0; i < slides.length - 1; i++) {
      expect(slides[i].meta.hashtags).toEqual([]);
    }
    // last slide: has the resolved hashtags
    const last = slides[slides.length - 1];
    expect(last.meta.hashtags).toEqual(["alit", "literatur"]);
    expect(last.isLast).toBe(true);
  });

  it("(d) raw >10 slides → clamped to 10 + warnings ['too_long']", () => {
    // 30 paragraphs × 500 chars at scale=l (threshold=800) → each para > threshold
    // so each becomes its own slide → 30 raw → clamped to 10
    const item = baseItem({
      content_i18n: { de: paragraphs(30, 500), fr: null },
    });
    const { slides, warnings } = splitAgendaIntoSlides(item, "de", "l");
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
    const { slides, warnings } = splitAgendaIntoSlides(item, "de", "m");
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
    const { slides } = splitAgendaIntoSlides(item, "fr", "m");
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
    const { slides } = splitAgendaIntoSlides(item, "fr", "m");
    expect(slides[slides.length - 1].meta.hashtags).toEqual([
      "alit-fr",
      "nur-de",
      "legacy",
    ]);
  });
});
