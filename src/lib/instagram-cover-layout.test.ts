import { describe, it, expect } from "vitest";
import { computeSlide1GridSpec } from "./instagram-cover-layout";
import type { GridImage } from "./instagram-post";

const makeImg = (publicId: string): GridImage => ({
  publicId,
  width: 1080,
  height: 1080,
  orientation: "landscape",
});

const imgs = [makeImg("a"), makeImg("b"), makeImg("c"), makeImg("d"), makeImg("e")];

describe("computeSlide1GridSpec", () => {
  it("returns defensive empty spec for imageCount=0", () => {
    expect(computeSlide1GridSpec([], 0)).toEqual({ columns: 0, rows: 0, cells: [] });
  });

  it("returns 1×1 for imageCount=1", () => {
    expect(computeSlide1GridSpec(imgs, 1)).toEqual({
      columns: 1,
      rows: 1,
      cells: [imgs[0]],
    });
  });

  it("returns 2×1 for imageCount=2", () => {
    expect(computeSlide1GridSpec(imgs, 2)).toEqual({
      columns: 2,
      rows: 1,
      cells: [imgs[0], imgs[1]],
    });
  });

  it("returns 3×1 for imageCount=3", () => {
    expect(computeSlide1GridSpec(imgs, 3)).toEqual({
      columns: 3,
      rows: 1,
      cells: [imgs[0], imgs[1], imgs[2]],
    });
  });

  it("returns 2×2 for imageCount=4", () => {
    expect(computeSlide1GridSpec(imgs, 4)).toEqual({
      columns: 2,
      rows: 2,
      cells: [imgs[0], imgs[1], imgs[2], imgs[3]],
    });
  });

  it("clamps imageCount=5 to 4 (2×2 layout, only first 4 cells)", () => {
    expect(computeSlide1GridSpec(imgs, 5)).toEqual({
      columns: 2,
      rows: 2,
      cells: [imgs[0], imgs[1], imgs[2], imgs[3]],
    });
  });

  // Sparse-case edge (Sonnet R6 #4): images.length < imageCount
  // imageCount drives columns/rows; cells = images.slice(0, imageCount).
  it("returns 3×1 spec with single cell when images=[a] and imageCount=3", () => {
    expect(computeSlide1GridSpec([imgs[0]], 3)).toEqual({
      columns: 3,
      rows: 1,
      cells: [imgs[0]],
    });
  });
});
