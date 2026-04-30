import { describe, it, expect } from "vitest";
import {
  canMoveNext,
  canMovePrev,
  canSplit,
  moveBlockToNextSlide,
  moveBlockToPrevSlide,
  splitSlideHere,
  validateSlideCount,
} from "./layout-editor-state";
import type { EditorSlide } from "./layout-editor-types";

function makeSlides(spec: string[][]): EditorSlide[] {
  return spec.map((blockIds) => ({
    blocks: blockIds.map((id) => ({ id, text: `text-${id}`, isHeading: false })),
  }));
}

describe("layout-editor-state pure helpers", () => {
  describe("PH-1: moveBlockToPrevSlide first-of-first no-op + canMovePrev guard", () => {
    it("returns same array reference when slideIdx===0 (no-op)", () => {
      const input = makeSlides([["b1", "b2"], ["b3"]]);
      const result = moveBlockToPrevSlide(input, 0, 0);
      expect(result).toBe(input);
    });

    it("canMovePrev(0, blockIdx) === false for ANY block on slide 0", () => {
      // Regression-guard: previous spec returned !(slideIdx===0 && blockIdx===0)
      // which would enable the button on slide 0 / blockIdx>0 even though
      // moveBlockToPrevSlide is a guaranteed no-op there.
      expect(canMovePrev(0, 0)).toBe(false);
      expect(canMovePrev(0, 1)).toBe(false);
      expect(canMovePrev(0, 99)).toBe(false);
    });

    it("canMovePrev returns true for any non-first slide", () => {
      expect(canMovePrev(1, 0)).toBe(true);
      expect(canMovePrev(2, 0)).toBe(true);
    });
  });

  describe("PH-2: moveBlockToPrevSlide last-block-of-non-first → previous gains, current filtered", () => {
    it("merges blocks correctly and filters empty source slide", () => {
      const input = makeSlides([["b1"], ["b2"]]);
      const result = moveBlockToPrevSlide(input, 1, 0);
      expect(result.length).toBe(1);
      expect(result[0].blocks.map((b) => b.id)).toEqual(["b1", "b2"]);
    });

    it("returns a NEW array reference (not mutated input)", () => {
      // Mutation-path invariant: helpers MUST return new arrays so React's
      // setState detects the change. If a helper mutates and returns the
      // same reference, setState no-ops and the UI freezes.
      const input = makeSlides([["b1"], ["b2"]]);
      const result = moveBlockToPrevSlide(input, 1, 0);
      expect(result).not.toBe(input);
    });
  });

  describe("PH-3: moveBlockToNextSlide last-slide no-op + positive-case mutates", () => {
    it("returns same reference for last-slide no-op", () => {
      const input = makeSlides([["b1"], ["b2"]]);
      const result = moveBlockToNextSlide(input, 1, 0);
      expect(result).toBe(input);
    });

    it("returns new array reference on actual move", () => {
      const input = makeSlides([["b1", "b2"], ["b3"]]);
      const result = moveBlockToNextSlide(input, 0, 0);
      expect(result).not.toBe(input);
      expect(result.map((s) => s.blocks.map((b) => b.id))).toEqual([["b2"], ["b1", "b3"]]);
    });
  });

  describe("PH-4: splitSlideHere blockIdx=0 no-op; blockIdx=1 splits into 2", () => {
    it("returns same reference for blockIdx===0 no-op", () => {
      const input = makeSlides([["b1", "b2"]]);
      const result = splitSlideHere(input, 0, 0);
      expect(result).toBe(input);
    });

    it("returns new array reference on actual split, splits into 2 slides", () => {
      const input = makeSlides([["b1", "b2", "b3"]]);
      const result = splitSlideHere(input, 0, 1);
      expect(result).not.toBe(input);
      expect(result.length).toBe(2);
      expect(result[0].blocks.map((b) => b.id)).toEqual(["b1"]);
      expect(result[1].blocks.map((b) => b.id)).toEqual(["b2", "b3"]);
    });
  });

  describe("PH-5: canMoveNext returns false for ANY block on the last slide", () => {
    // Regression-guard: previous spec returned blockIdx-aware booleans;
    // canMoveNext signature has no blockIdx — it's slide-level only.
    it("false on last slide, true on non-last slide", () => {
      const slides = makeSlides([["b1"], ["b2"], ["b3"]]);
      expect(canMoveNext(slides, 2)).toBe(false);
      expect(canMoveNext(slides, 1)).toBe(true);
      expect(canMoveNext(slides, 0)).toBe(true);
    });

    it("canSplit follows blockIdx>0 rule", () => {
      expect(canSplit(0)).toBe(false);
      expect(canSplit(1)).toBe(true);
      expect(canSplit(99)).toBe(true);
    });
  });

  describe("PH-6: validateSlideCount boundary cases", () => {
    it("empty array → empty_layout", () => {
      expect(validateSlideCount([], false)).toEqual({ ok: false, reason: "empty_layout" });
      expect(validateSlideCount([], true)).toEqual({ ok: false, reason: "empty_layout" });
    });

    it("hasGrid=false, 11 slides → too_many_slides (1 over text-only cap)", () => {
      const slides = makeSlides(Array.from({ length: 11 }, (_, i) => [`b${i}`]));
      expect(validateSlideCount(slides, false)).toEqual({
        ok: false,
        reason: "too_many_slides",
      });
    });

    it("hasGrid=true, 10 slides → too_many_slides_for_grid (1 over grid cap)", () => {
      const slides = makeSlides(Array.from({ length: 10 }, (_, i) => [`b${i}`]));
      expect(validateSlideCount(slides, true)).toEqual({
        ok: false,
        reason: "too_many_slides_for_grid",
      });
    });

    it("hasGrid=false, 10 slides → ok (exactly at SLIDE_HARD_CAP)", () => {
      const slides = makeSlides(Array.from({ length: 10 }, (_, i) => [`b${i}`]));
      expect(validateSlideCount(slides, false)).toEqual({ ok: true });
    });

    it("hasGrid=true, 9 slides → ok (exactly at SLIDE_HARD_CAP - 1)", () => {
      const slides = makeSlides(Array.from({ length: 9 }, (_, i) => [`b${i}`]));
      expect(validateSlideCount(slides, true)).toEqual({ ok: true });
    });

    it("hasGrid=false, 1 slide → ok", () => {
      const slides = makeSlides([["b1"]]);
      expect(validateSlideCount(slides, false)).toEqual({ ok: true });
    });
  });
});
