import { describe, it, expect } from "vitest";
import {
  computeSupporterGridLayout,
  IG_FRAME_WIDTH,
  IG_FRAME_HEIGHT,
  IG_FRAME_PADDING,
  SUPPORTER_LOGO_HEIGHT,
  SUPPORTER_LOGO_GAP,
  SUPPORTER_LABEL_FONT_SIZE,
} from "./instagram-supporter-layout";
import type { SupporterSlideLogo } from "./supporter-logos";

function logo(over: Partial<SupporterSlideLogo> = {}): SupporterSlideLogo {
  return {
    public_id: "x",
    alt: null,
    dataUrl: "data:image/png;base64,xx",
    width: 200,
    height: 80,
    ...over,
  };
}

describe("computeSupporterGridLayout", () => {
  it("returns label.fontSize = SUPPORTER_LABEL_FONT_SIZE", () => {
    const layout = computeSupporterGridLayout([], IG_FRAME_WIDTH, IG_FRAME_HEIGHT, "L");
    expect(layout.label.fontSize).toBe(SUPPORTER_LABEL_FONT_SIZE);
  });

  it("returns no logos when input is empty", () => {
    const layout = computeSupporterGridLayout([], IG_FRAME_WIDTH, IG_FRAME_HEIGHT, "L");
    expect(layout.logos).toEqual([]);
  });

  it("uses fixed SUPPORTER_LOGO_HEIGHT for logo h", () => {
    const layout = computeSupporterGridLayout(
      [logo({ width: 200, height: 80 })],
      IG_FRAME_WIDTH,
      IG_FRAME_HEIGHT,
      "L",
    );
    expect(layout.logos[0].h).toBe(SUPPORTER_LOGO_HEIGHT);
  });

  it("derives w from height × aspect-ratio", () => {
    // aspect = 200/80 = 2.5 → w = SUPPORTER_LOGO_HEIGHT × 2.5
    const layout = computeSupporterGridLayout(
      [logo({ width: 200, height: 80 })],
      IG_FRAME_WIDTH,
      IG_FRAME_HEIGHT,
      "L",
    );
    expect(layout.logos[0].w).toBe(SUPPORTER_LOGO_HEIGHT * 2.5);
  });

  it("falls back to 1:1 aspect when width or height is null", () => {
    const layout = computeSupporterGridLayout(
      [logo({ width: null, height: null })],
      IG_FRAME_WIDTH,
      IG_FRAME_HEIGHT,
      "L",
    );
    expect(layout.logos[0].w).toBe(SUPPORTER_LOGO_HEIGHT);
  });

  it("packs all logos into one row when total width fits", () => {
    const small = logo({ width: 100, height: 100 }); // w=100
    const layout = computeSupporterGridLayout(
      [small, { ...small, public_id: "b" }, { ...small, public_id: "c" }],
      IG_FRAME_WIDTH,
      IG_FRAME_HEIGHT,
      "L",
    );
    // All on the same y
    const ys = new Set(layout.logos.map((l) => l.y));
    expect(ys.size).toBe(1);
  });

  it("wraps to a second row when row exceeds inner width", () => {
    // inner = 1080 - 2×80 = 920. Logo w=400, gap=24 → row of 3 = 1248 > 920.
    const big = logo({ width: 400, height: 100 }); // w=400
    const layout = computeSupporterGridLayout(
      [
        { ...big, public_id: "a" },
        { ...big, public_id: "b" },
        { ...big, public_id: "c" },
      ],
      IG_FRAME_WIDTH,
      IG_FRAME_HEIGHT,
      "L",
    );
    const ys = new Set(layout.logos.map((l) => l.y));
    expect(ys.size).toBeGreaterThanOrEqual(2);
  });

  it("centers row horizontally inside inner-frame", () => {
    // 1:1 aspect → w = SUPPORTER_LOGO_HEIGHT
    const small = logo({ width: 100, height: 100 });
    const layout = computeSupporterGridLayout(
      [{ ...small, public_id: "a" }],
      IG_FRAME_WIDTH,
      IG_FRAME_HEIGHT,
      "L",
    );
    const innerLeft = IG_FRAME_PADDING;
    const innerRight = IG_FRAME_WIDTH - IG_FRAME_PADDING;
    const innerWidth = innerRight - innerLeft;
    const expectedX = innerLeft + (innerWidth - SUPPORTER_LOGO_HEIGHT) / 2;
    expect(layout.logos[0].x).toBe(expectedX);
  });

  it("respects gap between logos in a row", () => {
    // 1:1 aspect → w = SUPPORTER_LOGO_HEIGHT
    const small = logo({ width: 100, height: 100 });
    const layout = computeSupporterGridLayout(
      [
        { ...small, public_id: "a" },
        { ...small, public_id: "b" },
      ],
      IG_FRAME_WIDTH,
      IG_FRAME_HEIGHT,
      "L",
    );
    expect(layout.logos[1].x - layout.logos[0].x).toBe(
      SUPPORTER_LOGO_HEIGHT + SUPPORTER_LOGO_GAP,
    );
  });

  it("clamps pathological wide aspect (Codex PR-R2 [P2])", () => {
    // width=20000, height=1 → raw aspect=20000 → would produce 2M-px wide
    // box without the clamp. Clamped aspect=6 → w = HEIGHT × 6.
    const layout = computeSupporterGridLayout(
      [logo({ width: 20000, height: 1 })],
      IG_FRAME_WIDTH,
      IG_FRAME_HEIGHT,
      "L",
    );
    expect(layout.logos[0].w).toBe(SUPPORTER_LOGO_HEIGHT * 6); // MAX_LOGO_ASPECT
  });

  it("clamps pathological tall aspect to MIN_LOGO_ASPECT", () => {
    // width=1, height=20000 → raw aspect=0.00005 → clamped to 0.2.
    const layout = computeSupporterGridLayout(
      [logo({ width: 1, height: 20000 })],
      IG_FRAME_WIDTH,
      IG_FRAME_HEIGHT,
      "L",
    );
    expect(layout.logos[0].w).toBe(SUPPORTER_LOGO_HEIGHT * 0.2); // MIN_LOGO_ASPECT
  });

  it("preserves alt + dataUrl + public_id passthrough", () => {
    const layout = computeSupporterGridLayout(
      [
        logo({
          public_id: "p1",
          alt: "Pro Helvetia",
          dataUrl: "data:image/png;base64,abc",
        }),
      ],
      IG_FRAME_WIDTH,
      IG_FRAME_HEIGHT,
      "L",
    );
    expect(layout.logos[0]).toMatchObject({
      public_id: "p1",
      alt: "Pro Helvetia",
      dataUrl: "data:image/png;base64,abc",
    });
  });
});
