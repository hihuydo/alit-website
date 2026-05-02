import { describe, it, expect } from "vitest";
import { appendSupporterSlide } from "./instagram-supporter-slide";
import type { Slide, SlideMeta } from "./instagram-post";
import type { SupporterSlideLogo } from "./supporter-logos";

const meta: SlideMeta = {
  datum: "01.06.2026",
  zeit: "19:00 Uhr",
  ort: "Bern",
  title: "Test",
  lead: null,
  hashtags: [],
  locale: "de",
};

function logo(over: Partial<SupporterSlideLogo> = {}): SupporterSlideLogo {
  return {
    public_id: "logo-1",
    alt: "Pro Helvetia",
    dataUrl: "data:image/png;base64,xx",
    width: 200,
    height: 80,
    ...over,
  };
}

function textSlide(idx: number, isLast: boolean): Slide {
  return {
    index: idx,
    isFirst: idx === 0,
    isLast,
    kind: "text",
    blocks: [],
    meta,
  };
}

describe("appendSupporterSlide", () => {
  it("returns input unchanged when supporterSlideLogos is empty", () => {
    const slides = [textSlide(0, true)];
    const result = appendSupporterSlide(slides, [], "label", meta);
    expect(result.slides).toBe(slides);
    expect(result.warnings).toEqual([]);
  });

  it("appends a single supporter slide and flips previous-last isLast=false", () => {
    const slides = [textSlide(0, true)];
    const result = appendSupporterSlide(
      slides,
      [logo()],
      "Mit freundlicher Unterstützung von",
      meta,
    );
    expect(result.slides).toHaveLength(2);
    expect(result.slides[0].isLast).toBe(false);
    expect(result.slides[1].kind).toBe("supporters");
    expect(result.slides[1].isLast).toBe(true);
    expect(result.slides[1].index).toBe(1);
    expect(result.slides[1].supporterLogos).toHaveLength(1);
    expect(result.slides[1].supporterLabel).toBe(
      "Mit freundlicher Unterstützung von",
    );
  });

  it("does not mutate the input slides array (immutability)", () => {
    const original = [textSlide(0, true)];
    const snapshot = JSON.stringify(original);
    appendSupporterSlide(original, [logo()], "label", meta);
    expect(JSON.stringify(original)).toBe(snapshot);
    expect(original[0].isLast).toBe(true);
  });

  it("returns a single supporter slide with isFirst=true when input is empty", () => {
    const result = appendSupporterSlide([], [logo()], "label", meta);
    expect(result.slides).toHaveLength(1);
    expect(result.slides[0]).toMatchObject({
      kind: "supporters",
      index: 0,
      isFirst: true,
      isLast: true,
      supporterLabel: "label",
    });
  });

  it("works with multiple existing slides", () => {
    const slides = [textSlide(0, false), textSlide(1, false), textSlide(2, true)];
    const result = appendSupporterSlide(slides, [logo()], "label", meta);
    expect(result.slides).toHaveLength(4);
    expect(result.slides[2].isLast).toBe(false);
    expect(result.slides[3].kind).toBe("supporters");
    expect(result.slides[3].isLast).toBe(true);
    expect(result.slides[3].index).toBe(3);
  });

  it("emits warning + clamps to SLIDE_HARD_CAP when input is at cap", () => {
    const tenSlides = Array.from({ length: 10 }, (_, i) =>
      textSlide(i, i === 9),
    );
    const result = appendSupporterSlide(tenSlides, [logo()], "label", meta);
    expect(result.slides).toHaveLength(10);
    expect(result.slides[9].kind).toBe("supporters");
    expect(result.warnings).toContain("supporter_slide_replaced_last_content");
  });

  it("does not emit cap-warning when input is below cap", () => {
    const slides = [textSlide(0, true)];
    const result = appendSupporterSlide(slides, [logo()], "label", meta);
    expect(result.warnings).not.toContain(
      "supporter_slide_replaced_last_content",
    );
  });

  it("preserves the supporterLogos array passed in", () => {
    const logos = [logo({ public_id: "a" }), logo({ public_id: "b" })];
    const result = appendSupporterSlide(
      [textSlide(0, true)],
      logos,
      "label",
      meta,
    );
    expect(result.slides[1].supporterLogos).toEqual(logos);
  });
});
