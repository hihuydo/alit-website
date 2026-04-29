import { describe, expect, it } from "vitest";
import type { JournalContent } from "./journal-types";
import {
  flattenContentWithIds,
  splitAgendaIntoSlides,
  SLIDE_HARD_CAP,
  type AgendaItemForExport,
  type InstagramLayoutOverride,
} from "./instagram-post";
import { computeLayoutHash, resolveInstagramSlides } from "./instagram-overrides";

function baseItem(overrides: Partial<AgendaItemForExport> = {}): AgendaItemForExport {
  return {
    id: 1,
    datum: "2026-05-01",
    zeit: "19:00",
    title_i18n: { de: "T", fr: "T" },
    lead_i18n: { de: "L", fr: "L" },
    ort_i18n: { de: "O", fr: "O" },
    content_i18n: null,
    hashtags: null,
    ...overrides,
  };
}

function paragraphs(count: number, charsEach: number, prefix = "p"): JournalContent {
  const text = "x".repeat(charsEach);
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${i}`,
    type: "paragraph" as const,
    content: [{ text }],
  }));
}

describe("computeLayoutHash", () => {
  const item = baseItem({ content_i18n: { de: paragraphs(2, 30), fr: null } });

  it("is deterministic — same input twice → same hash", () => {
    const h1 = computeLayoutHash({ item, locale: "de", imageCount: 0 });
    const h2 = computeLayoutHash({ item, locale: "de", imageCount: 0 });
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{16}$/);
  });

  it("different inputs (title/lead/content/hashtags/images/imageCount/locale) → different hashes", () => {
    const h0 = computeLayoutHash({ item, locale: "de", imageCount: 0 });
    expect(
      computeLayoutHash({
        item: { ...item, title_i18n: { de: "Other", fr: "T" } },
        locale: "de",
        imageCount: 0,
      }),
    ).not.toBe(h0);
    expect(
      computeLayoutHash({
        item: { ...item, lead_i18n: { de: "Other", fr: "L" } },
        locale: "de",
        imageCount: 0,
      }),
    ).not.toBe(h0);
    expect(
      computeLayoutHash({
        item: { ...item, content_i18n: { de: paragraphs(3, 30), fr: null } },
        locale: "de",
        imageCount: 0,
      }),
    ).not.toBe(h0);
    expect(
      computeLayoutHash({
        item: {
          ...item,
          hashtags: [{ tag: "x", projekt_slug: "p" }],
        },
        locale: "de",
        imageCount: 0,
      }),
    ).not.toBe(h0);
    expect(
      computeLayoutHash({
        item: { ...item, images: [{ public_id: "img-a" }] },
        locale: "de",
        imageCount: 0,
      }),
    ).not.toBe(h0);
    expect(computeLayoutHash({ item, locale: "de", imageCount: 1 })).not.toBe(h0);
    expect(computeLayoutHash({ item, locale: "fr", imageCount: 0 })).not.toBe(h0);
  });

  it("is invariant against block.id changes (normalizeContentForHash strips id)", () => {
    const a = baseItem({ content_i18n: { de: paragraphs(2, 30, "x"), fr: null } });
    const b = baseItem({ content_i18n: { de: paragraphs(2, 30, "y"), fr: null } });
    expect(computeLayoutHash({ item: a, locale: "de", imageCount: 0 })).toBe(
      computeLayoutHash({ item: b, locale: "de", imageCount: 0 }),
    );
  });

  it("DE-fallback for FR with empty FR-lead matches DE-lead (title kept identical to isolate lead)", () => {
    // Fixture-Constraint per spec WARN-3: title_i18n.de === title_i18n.fr so
    // that locale-only title doesn't generate independent hash difference.
    const item = baseItem({
      title_i18n: { de: "T", fr: "T" },
      lead_i18n: { de: "DE Lead", fr: null },
    });
    const frHash = computeLayoutHash({ item, locale: "fr", imageCount: 0 });
    const deHash = computeLayoutHash({ item, locale: "de", imageCount: 0 });
    expect(frHash).toBe(deHash);
  });
});

describe("resolveInstagramSlides", () => {
  function withContent(
    n: number,
    chars = 30,
  ): AgendaItemForExport {
    return baseItem({ content_i18n: { de: paragraphs(n, chars), fr: null } });
  }

  it("override=null → mode='auto' AND slides bit-identical to splitAgendaIntoSlides", () => {
    const item = withContent(3);
    const r = resolveInstagramSlides(item, "de", 0, null);
    expect(r.mode).toBe("auto");
    expect(r.slides).toStrictEqual(splitAgendaIntoSlides(item, "de", 0).slides);
  });

  it("valid override matching contentHash + all blocks → mode='manual'", () => {
    const item = withContent(2);
    const blocks = flattenContentWithIds(item.content_i18n!.de!);
    const ch = computeLayoutHash({ item, locale: "de", imageCount: 0 });
    const override: InstagramLayoutOverride = {
      contentHash: ch,
      slides: [{ blocks: [blocks[0].id] }, { blocks: [blocks[1].id] }],
    };
    const r = resolveInstagramSlides(item, "de", 0, override);
    expect(r.mode).toBe("manual");
    expect(r.slides.length).toBe(2);
    expect(r.warnings).not.toContain("layout_stale");
  });

  it("override with stale contentHash → mode='stale' + 'layout_stale' warning", () => {
    const item = withContent(2);
    const blocks = flattenContentWithIds(item.content_i18n!.de!);
    const ch = computeLayoutHash({ item, locale: "de", imageCount: 0 });
    const override: InstagramLayoutOverride = {
      contentHash: ch.slice(0, -1) + "0", // mutated → guaranteed mismatch
      slides: [{ blocks: [blocks[0].id, blocks[1].id] }],
    };
    const r = resolveInstagramSlides(item, "de", 0, override);
    expect(r.mode).toBe("stale");
    expect(r.warnings).toContain("layout_stale");
  });

  it("override with unknown block-IDs → mode='stale'", () => {
    const item = withContent(2);
    const ch = computeLayoutHash({ item, locale: "de", imageCount: 0 });
    const override: InstagramLayoutOverride = {
      contentHash: ch,
      slides: [{ blocks: ["block:does-not-exist"] }],
    };
    expect(resolveInstagramSlides(item, "de", 0, override).mode).toBe("stale");
  });

  it("override with unreferenced current blocks → mode='stale'", () => {
    const item = withContent(3);
    const blocks = flattenContentWithIds(item.content_i18n!.de!);
    const ch = computeLayoutHash({ item, locale: "de", imageCount: 0 });
    const override: InstagramLayoutOverride = {
      contentHash: ch,
      slides: [{ blocks: [blocks[0].id] }],
    };
    expect(resolveInstagramSlides(item, "de", 0, override).mode).toBe("stale");
  });

  it("grid-path (imageCount=2): slides[0]=grid, override-blocks from slides[1]", () => {
    const item = baseItem({
      content_i18n: { de: paragraphs(2, 30), fr: null },
      images: [
        { public_id: "a", orientation: "landscape" },
        { public_id: "b", orientation: "landscape" },
      ],
      images_grid_columns: 2,
    });
    const blocks = flattenContentWithIds(item.content_i18n!.de!);
    const ch = computeLayoutHash({ item, locale: "de", imageCount: 2 });
    const override: InstagramLayoutOverride = {
      contentHash: ch,
      slides: [{ blocks: blocks.map((b) => b.id) }],
    };
    const r = resolveInstagramSlides(item, "de", 2, override);
    expect(r.mode).toBe("manual");
    expect(r.slides[0].kind).toBe("grid");
    expect(r.slides[1].kind).toBe("text");
    expect(r.slides[1].blocks.length).toBe(2);
  });

  it("manual grid-path with lead → slides[1].leadOnSlide === true, slides[2+].leadOnSlide falsy", () => {
    const item = baseItem({
      lead_i18n: { de: "Lead Text", fr: null },
      content_i18n: { de: paragraphs(2, 30), fr: null },
      images: [{ public_id: "a", orientation: "landscape" }],
    });
    const blocks = flattenContentWithIds(item.content_i18n!.de!);
    const ch = computeLayoutHash({ item, locale: "de", imageCount: 1 });
    const override: InstagramLayoutOverride = {
      contentHash: ch,
      slides: [{ blocks: [blocks[0].id] }, { blocks: [blocks[1].id] }],
    };
    const r = resolveInstagramSlides(item, "de", 1, override);
    expect(r.slides[1].leadOnSlide).toBe(true);
    expect(r.slides[2].leadOnSlide).toBeFalsy();
  });

  it("no-image path: override applies from slides[0]", () => {
    const item = withContent(2);
    const blocks = flattenContentWithIds(item.content_i18n!.de!);
    const ch = computeLayoutHash({ item, locale: "de", imageCount: 0 });
    const override: InstagramLayoutOverride = {
      contentHash: ch,
      slides: [{ blocks: [blocks[0].id] }, { blocks: [blocks[1].id] }],
    };
    const r = resolveInstagramSlides(item, "de", 0, override);
    expect(r.slides[0].kind).toBe("text");
    expect(r.slides[0].blocks.length).toBe(1);
  });

  it("empty body + empty override → mode='manual', slides=[] (or [grid] if hasGrid)", () => {
    const item = baseItem({ content_i18n: { de: [], fr: null } });
    const ch = computeLayoutHash({ item, locale: "de", imageCount: 0 });
    const r = resolveInstagramSlides(item, "de", 0, {
      contentHash: ch,
      slides: [],
    });
    expect(r.mode).toBe("manual");
    expect(r.slides).toEqual([]);
  });

  it("manual path with oversized block → inline-split via splitOversizedBlock", () => {
    // Fixture per spec WARN-5: 1 block with text long enough that
    // blockHeightPx > SLIDE_BUDGET (1080) — forces splitOversizedBlock to fire.
    const item = baseItem({
      content_i18n: {
        de: [
          {
            id: "huge",
            type: "paragraph",
            content: [{ text: "x".repeat(800) }],
          },
        ],
        fr: null,
      },
    });
    const ch = computeLayoutHash({ item, locale: "de", imageCount: 0 });
    const override: InstagramLayoutOverride = {
      contentHash: ch,
      slides: [{ blocks: ["block:huge"] }],
    };
    const r = resolveInstagramSlides(item, "de", 0, override);
    expect(r.mode).toBe("manual");
    expect(r.slides[0].blocks.length).toBeGreaterThan(1);
  });

  it("isLocaleEmpty (no title + no body) → empty result without throwing", () => {
    const item = baseItem({
      title_i18n: { de: null, fr: null },
      content_i18n: { de: [], fr: null },
    });
    const r = resolveInstagramSlides(item, "de", 0, null);
    expect(r.mode).toBe("auto");
    expect(r.slides).toEqual([]);
    expect(r.warnings).toEqual(["locale_empty"]);
    expect(r.contentHash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("manual mode filters 'too_long' warning (override implicitly accepts slide-count)", () => {
    // Build content where EACH block is large enough (~1062px) to require its
    // own slide — auto-path produces SLIDE_HARD_CAP+1+ slides → too_long.
    // 700-char paragraphs ≈ 20 lines × 52 + 22 = 1062px (just under SLIDE_BUDGET).
    const item = baseItem({ content_i18n: { de: paragraphs(15, 700), fr: null } });
    expect(splitAgendaIntoSlides(item, "de").warnings).toContain("too_long");
    const blocks = flattenContentWithIds(item.content_i18n!.de!);
    const ch = computeLayoutHash({ item, locale: "de", imageCount: 0 });
    // Override references ALL current blocks across ≤SLIDE_HARD_CAP slides
    // (defensive clamp inside buildManualSlides handles overflow).
    const overrideAll: InstagramLayoutOverride = {
      contentHash: ch,
      slides: [{ blocks: blocks.map((b) => b.id) }],
    };
    const r = resolveInstagramSlides(item, "de", 0, overrideAll);
    expect(r.mode).toBe("manual");
    expect(r.warnings).not.toContain("too_long");
  });

  it("buildManualSlides clamps to SLIDE_HARD_CAP (defensive)", () => {
    // Craft 11+ paragraph blocks, override with 11 slides each carrying one block.
    const N = SLIDE_HARD_CAP + 1;
    const item = baseItem({
      content_i18n: { de: paragraphs(N, 30), fr: null },
    });
    const blocks = flattenContentWithIds(item.content_i18n!.de!);
    const ch = computeLayoutHash({ item, locale: "de", imageCount: 0 });
    const override: InstagramLayoutOverride = {
      contentHash: ch,
      slides: blocks.map((b) => ({ blocks: [b.id] })),
    };
    const r = resolveInstagramSlides(item, "de", 0, override);
    expect(r.mode).toBe("manual");
    expect(r.slides.length).toBe(SLIDE_HARD_CAP);
  });
});

