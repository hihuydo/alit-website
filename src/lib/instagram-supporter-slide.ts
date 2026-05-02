import type { Slide, SlideMeta } from "./instagram-post";
import { SLIDE_HARD_CAP } from "./instagram-post";
import type { SupporterSlideLogo } from "./supporter-logos";

/**
 * Append the Supporter-Slide to the end of an existing slide list. The
 * input `slides` array is NOT mutated — the previous-last slide gets a
 * cloned `isLast: false` and a new `kind: "supporters"` slide is appended.
 *
 * Edge cases:
 * - `supporterSlideLogos.length === 0` → no-op, returns `slides` unchanged
 * - `slides.length === 0` → returns a single supporter slide with
 *   `isFirst: true`, `isLast: true`, `index: 0`
 *
 * 10-slide hard cap (SLIDE_HARD_CAP): if appending would push the total
 * over the cap, the input is clamped to `SLIDE_HARD_CAP - 1` slides
 * BEFORE the supporter slide is added. The returned `warnings` carries
 * `supporter_slide_replaced_last_content` so the UI can surface the trim.
 *
 * Single-Owner: this helper is called EXCLUSIVELY from
 * `resolveInstagramSlides`. Never from `splitAgendaIntoSlides` or
 * `projectAutoBlocksToSlides` — keeps DK-6 parity across all paths.
 */
export function appendSupporterSlide(
  slides: Slide[],
  supporterSlideLogos: SupporterSlideLogo[],
  label: string,
  meta: SlideMeta,
): { slides: Slide[]; warnings: string[] } {
  if (supporterSlideLogos.length === 0) {
    return { slides, warnings: [] };
  }

  const warnings: string[] = [];
  let working = slides;

  // 10-slide hard cap. If we're already at SLIDE_HARD_CAP, the supporter
  // slide must replace the last content slide.
  if (working.length >= SLIDE_HARD_CAP) {
    working = working.slice(0, SLIDE_HARD_CAP - 1);
    warnings.push("supporter_slide_replaced_last_content");
  }

  if (working.length === 0) {
    return {
      slides: [
        {
          kind: "supporters" as const,
          index: 0,
          isFirst: true,
          isLast: true,
          blocks: [],
          supporterLogos: supporterSlideLogos,
          supporterLabel: label,
          meta,
        },
      ],
      warnings,
    };
  }

  const lastIdx = working.length - 1;
  const prevLast = working[lastIdx];
  const updatedPrevLast: Slide = { ...prevLast, isLast: false };
  const newSlide: Slide = {
    kind: "supporters" as const,
    index: working.length,
    isFirst: false,
    isLast: true,
    blocks: [],
    supporterLogos: supporterSlideLogos,
    supporterLabel: label,
    meta,
  };

  return {
    slides: [...working.slice(0, lastIdx), updatedPrevLast, newSlide],
    warnings,
  };
}
