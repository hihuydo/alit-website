import { describe, expect, it } from "vitest";
import type { JournalContent } from "./journal-types";
import {
  flattenContentWithIds,
  splitAgendaIntoSlides,
  SLIDE_HARD_CAP,
  type AgendaItemForExport,
  type InstagramLayoutOverride,
} from "./instagram-post";
import {
  computeLayoutHash,
  computeLayoutVersion,
  resolveInstagramSlides,
} from "./instagram-overrides";

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

describe("computeLayoutVersion", () => {
  const sampleOverride: InstagramLayoutOverride = {
    contentHash: "0123456789abcdef",
    slides: [{ blocks: ["block:0:0", "block:0:1"] }, { blocks: ["block:1:0"] }],
  };

  it("is deterministic — same override → same 16-char md5-prefix", () => {
    const v1 = computeLayoutVersion(sampleOverride);
    const v2 = computeLayoutVersion(sampleOverride);
    expect(v1).toBe(v2);
    expect(v1).toMatch(/^[0-9a-f]{16}$/);
  });

  it("different overrides (contentHash OR slides) → different versions", () => {
    const base = computeLayoutVersion(sampleOverride);
    expect(
      computeLayoutVersion({ ...sampleOverride, contentHash: "fedcba9876543210" }),
    ).not.toBe(base);
    expect(
      computeLayoutVersion({
        ...sampleOverride,
        slides: [{ blocks: ["block:0:0"] }, { blocks: ["block:0:1", "block:1:0"] }],
      }),
    ).not.toBe(base);
  });

  it("is robust against JSON-key-order via stableStringify", () => {
    // Same shape with reversed top-level key construction order — TS object
    // literal order normally matches insertion order; stableStringify must
    // canonicalize regardless.
    const a: InstagramLayoutOverride = {
      contentHash: "abcd1234abcd1234",
      slides: [{ blocks: ["block:0:0"] }],
    };
    const b: InstagramLayoutOverride = {
      slides: [{ blocks: ["block:0:0"] }],
      contentHash: "abcd1234abcd1234",
    } as InstagramLayoutOverride;
    expect(computeLayoutVersion(a)).toBe(computeLayoutVersion(b));
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

  it("manual grid-path with lead → ALL text-slides leadOnSlide:false (M4a A3b: lead on grid-cover)", () => {
    // Pre-M4a: hasGrid + lead → buildManualSlides set leadOnSlide:true on the
    // first text-slide (idx===0). Post-M4a: lead lives on Slide-1 grid-cover,
    // every text-slide carries leadOnSlide:false.
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
    expect(r.slides[0].kind).toBe("grid");
    expect(r.slides[1].leadOnSlide).toBe(false);
    expect(r.slides[2].leadOnSlide).toBe(false);
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

  // ==========================================================================
  // M4a A2b/A3b — buildManualSlides full-budget + leadOnSlide truth-table (E2b)
  // ==========================================================================

  it("E2b #1 manual hasGrid + long lead + 2 medium blocks → both fit Slide-2 (no lead-reduction)", () => {
    // Pre-M4a: buildManualSlides for idx===0 used Math.max(SLIDE_BUDGET - leadHeightPx(lead), 200).
    // 80-char lead → leadHeightPx ≈ ceil(80/26)=4 lines × 52 + 100 = 308px.
    // Pre-M4a budget = 1080 - 308 = 772. Two ~500px blocks (1000 total) overflowed.
    // Post-M4a budget = SLIDE_BUDGET = 1080 (no lead-reduction). 1000 ≤ 1080 → fits.
    // Override puts both blocks on the SAME slide; renderer must NOT split them.
    // 350-char paragraph → ceil(350/36)=10 × 52 + 22 = 542px. 2× = 1084px (just over),
    // use 320 chars → ceil(320/36)=9 × 52 + 22 = 490px. 2× = 980px ≤ 1080.
    const item = baseItem({
      lead_i18n: { de: "A".repeat(80), fr: null },
      content_i18n: { de: paragraphs(2, 320), fr: null },
      images: [{ public_id: "a", orientation: "landscape" }],
    });
    const blocks = flattenContentWithIds(item.content_i18n!.de!);
    const ch = computeLayoutHash({ item, locale: "de", imageCount: 1 });
    const override: InstagramLayoutOverride = {
      // Manual override packs both blocks on a SINGLE post-grid text-slide.
      contentHash: ch,
      slides: [{ blocks: blocks.map((b) => b.id) }],
    };
    const r = resolveInstagramSlides(item, "de", 1, override);
    expect(r.mode).toBe("manual");
    expect(r.slides.length).toBe(2);
    expect(r.slides[0].kind).toBe("grid");
    expect(r.slides[1].kind).toBe("text");
    // Within-slide split count: both 490px blocks ≤ 1080 budget → no chunking.
    // Each block stays as a single chunk (=2 blocks total on Slide-2).
    expect(r.slides[1].blocks.length).toBe(2);
    expect(r.slides[1].leadOnSlide).toBe(false);
  });

  it("E2b #2 manual no-grid + lead → Slide-0 leadOnSlide:true (legacy cover layout preserved)", () => {
    const item = baseItem({
      lead_i18n: { de: "Lead", fr: null },
      content_i18n: { de: paragraphs(2, 30), fr: null },
      images: [],
    });
    const blocks = flattenContentWithIds(item.content_i18n!.de!);
    const ch = computeLayoutHash({ item, locale: "de", imageCount: 0 });
    const override: InstagramLayoutOverride = {
      contentHash: ch,
      slides: [{ blocks: [blocks[0].id] }, { blocks: [blocks[1].id] }],
    };
    const r = resolveInstagramSlides(item, "de", 0, override);
    expect(r.mode).toBe("manual");
    expect(r.slides[0].kind).toBe("text");
    expect(r.slides[0].leadOnSlide).toBe(true);
    expect(r.slides[1].leadOnSlide).toBe(false);
  });
});

describe("resolveInstagramSlides — Sprint M3 supporter-slide append", () => {
  function logo(over: Partial<{ public_id: string; alt: string | null; dataUrl: string; width: number | null; height: number | null }> = {}) {
    return {
      public_id: "logo-1",
      alt: "Pro Helvetia",
      dataUrl: "data:image/png;base64,xx",
      width: 200 as number | null,
      height: 80 as number | null,
      ...over,
    };
  }

  it("auto-mode WITHOUT supporter logos: no kind:supporters slide", () => {
    const item = baseItem({ content_i18n: { de: paragraphs(2, 30), fr: null } });
    const r = resolveInstagramSlides(item, "de", 0);
    expect(r.slides.every((s) => s.kind !== "supporters")).toBe(true);
  });

  it("auto-mode WITH supporter logos: appends supporter slide as last", () => {
    const item = baseItem({ content_i18n: { de: paragraphs(2, 30), fr: null } });
    const r = resolveInstagramSlides(
      item,
      "de",
      0,
      undefined,
      [logo()],
      "Mit freundlicher Unterstützung von",
    );
    const last = r.slides[r.slides.length - 1];
    expect(last.kind).toBe("supporters");
    expect(last.isLast).toBe(true);
    expect(last.supporterLabel).toBe("Mit freundlicher Unterstützung von");
    expect(last.supporterLogos).toHaveLength(1);
  });

  it("DE label vs FR label are passed through (locale parity)", () => {
    const item = baseItem({
      content_i18n: { de: paragraphs(1, 10), fr: paragraphs(1, 10) },
    });
    const de = resolveInstagramSlides(
      item,
      "de",
      0,
      undefined,
      [logo()],
      "Mit freundlicher Unterstützung von",
    );
    const fr = resolveInstagramSlides(
      item,
      "fr",
      0,
      undefined,
      [logo()],
      "Avec le soutien aimable de",
    );
    expect(de.slides[de.slides.length - 1].supporterLabel).toBe(
      "Mit freundlicher Unterstützung von",
    );
    expect(fr.slides[fr.slides.length - 1].supporterLabel).toBe(
      "Avec le soutien aimable de",
    );
  });

  it("override-stale path also appends supporter slide", () => {
    const item = baseItem({
      content_i18n: { de: paragraphs(2, 30), fr: null },
    });
    const override: InstagramLayoutOverride = {
      contentHash: "STALE-HASH",
      slides: [{ blocks: ["nonexistent"] }],
    };
    const r = resolveInstagramSlides(
      item,
      "de",
      0,
      override,
      [logo()],
      "Label",
    );
    expect(r.mode).toBe("stale");
    expect(r.slides[r.slides.length - 1].kind).toBe("supporters");
  });

  it("override-manual path also appends supporter slide", () => {
    const item = baseItem({
      content_i18n: { de: paragraphs(2, 30), fr: null },
    });
    const blocks = flattenContentWithIds(item.content_i18n!.de!);
    const ch = computeLayoutHash({ item, locale: "de", imageCount: 0 });
    const override: InstagramLayoutOverride = {
      contentHash: ch,
      slides: blocks.map((b) => ({ blocks: [b.id] })),
    };
    const r = resolveInstagramSlides(
      item,
      "de",
      0,
      override,
      [logo()],
      "Label",
    );
    expect(r.mode).toBe("manual");
    expect(r.slides[r.slides.length - 1].kind).toBe("supporters");
  });

  it("DK-15 parity — auto + manual produce identical supporter-slide tail", () => {
    const item = baseItem({
      content_i18n: { de: paragraphs(2, 30), fr: null },
    });
    const blocks = flattenContentWithIds(item.content_i18n!.de!);
    const ch = computeLayoutHash({ item, locale: "de", imageCount: 0 });
    const override: InstagramLayoutOverride = {
      contentHash: ch,
      slides: blocks.map((b) => ({ blocks: [b.id] })),
    };
    const auto = resolveInstagramSlides(item, "de", 0, undefined, [logo()], "L");
    const manual = resolveInstagramSlides(item, "de", 0, override, [logo()], "L");
    const autoTail = auto.slides[auto.slides.length - 1];
    const manualTail = manual.slides[manual.slides.length - 1];
    expect(autoTail.kind).toBe(manualTail.kind);
    expect(autoTail.supporterLabel).toBe(manualTail.supporterLabel);
    expect(autoTail.supporterLogos).toEqual(manualTail.supporterLogos);
  });

  it("emits supporter_slide_replaced_last_content warning when at SLIDE_HARD_CAP", () => {
    // Force many slides by using one block PER slide via the manual override
    // path (auto-pack groups small blocks together). Each override-slide is
    // its own physical slide so 11 blocks → 11 slides (clamped to 10).
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
    const r = resolveInstagramSlides(
      item,
      "de",
      0,
      override,
      [logo()],
      "Label",
    );
    expect(r.mode).toBe("manual");
    expect(r.warnings).toContain("supporter_slide_replaced_last_content");
    expect(r.slides.length).toBe(SLIDE_HARD_CAP);
    expect(r.slides[r.slides.length - 1].kind).toBe("supporters");
  });

  it("throws when supporterSlideLogos given without supporterLabel", () => {
    const item = baseItem({ content_i18n: { de: paragraphs(1, 10), fr: null } });
    expect(() =>
      resolveInstagramSlides(item, "de", 0, undefined, [logo()], undefined),
    ).toThrow(/supporterLabel/);
  });

  it("locale_empty short-circuit returns no supporter slide", () => {
    // To trigger isLocaleEmpty: no title + no content for the locale.
    const item = baseItem({
      title_i18n: null,
      content_i18n: null,
    });
    const r = resolveInstagramSlides(
      item,
      "de",
      0,
      undefined,
      [logo()],
      "Label",
    );
    expect(r.warnings).toContain("locale_empty");
    expect(r.slides).toEqual([]);
  });
});

