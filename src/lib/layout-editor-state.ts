import type { EditorSlide } from "./layout-editor-types";
import { SLIDE_HARD_CAP } from "./instagram-post";

/** Move slides[slideIdx].blocks[blockIdx] to END of slides[slideIdx-1].
 *  No-op if slideIdx === 0.
 *  POST: filtert empty slides (renderbare empty-cards würden verwirren). */
export function moveBlockToPrevSlide(
  slides: EditorSlide[],
  slideIdx: number,
  blockIdx: number,
): EditorSlide[] {
  if (slideIdx === 0) return slides;
  const block = slides[slideIdx]?.blocks[blockIdx];
  if (!block) return slides;
  return slides
    .map((s, i) => {
      if (i === slideIdx - 1) return { blocks: [...s.blocks, block] };
      if (i === slideIdx) return { blocks: s.blocks.filter((_, b) => b !== blockIdx) };
      return s;
    })
    .filter((s) => s.blocks.length > 0);
}

/** Move slides[slideIdx].blocks[blockIdx] to START of slides[slideIdx+1].
 *  No-op if slideIdx === slides.length - 1.
 *  POST: filtert empty slides. */
export function moveBlockToNextSlide(
  slides: EditorSlide[],
  slideIdx: number,
  blockIdx: number,
): EditorSlide[] {
  if (slideIdx >= slides.length - 1) return slides;
  const block = slides[slideIdx]?.blocks[blockIdx];
  if (!block) return slides;
  return slides
    .map((s, i) => {
      if (i === slideIdx + 1) return { blocks: [block, ...s.blocks] };
      if (i === slideIdx) return { blocks: s.blocks.filter((_, b) => b !== blockIdx) };
      return s;
    })
    .filter((s) => s.blocks.length > 0);
}

/** Split slides[slideIdx] at blockIdx: blocks BEFORE stay, blocks AT+AFTER
 *  go into a new slide inserted after current.
 *  No-op if blockIdx === 0 (would leave current slide empty pre-filter,
 *  conceptually the same as a no-op move).
 *  No-op if blockIdx >= slide.blocks.length (defensive, callers should
 *  not pass that but UI state can briefly diverge). */
export function splitSlideHere(
  slides: EditorSlide[],
  slideIdx: number,
  blockIdx: number,
): EditorSlide[] {
  if (blockIdx === 0) return slides;
  const slide = slides[slideIdx];
  if (!slide || blockIdx >= slide.blocks.length) return slides;
  const before = slide.blocks.slice(0, blockIdx);
  const after = slide.blocks.slice(blockIdx);
  return [
    ...slides.slice(0, slideIdx),
    { blocks: before },
    { blocks: after },
    ...slides.slice(slideIdx + 1),
  ];
}

/** Is the move-prev button enabled?
 *  TRUE iff there is a slide BEFORE slideIdx. blockIdx is irrelevant —
 *  any block on a non-first slide can move. Symmetric to canMoveNext. */
export function canMovePrev(slideIdx: number, blockIdx: number): boolean {
  // blockIdx parameter retained for API symmetry with canSplit but
  // intentionally unused.
  void blockIdx;
  return slideIdx > 0;
}

/** Is the move-next button enabled?
 *  TRUE iff there is a slide AFTER slideIdx. blockIdx is irrelevant —
 *  any block on a non-last slide can move. */
export function canMoveNext(slides: EditorSlide[], slideIdx: number): boolean {
  return slideIdx < slides.length - 1;
}

/** Is the split-here button enabled? FALSE for blockIdx===0 (would
 *  leave current slide empty). */
export function canSplit(blockIdx: number): boolean {
  return blockIdx > 0;
}

/** Cap-aware validation. Returns ok=true wenn save erlaubt, sonst
 *  ok=false mit konkretem `reason` der dem PUT-API-error-key 1:1
 *  entspricht. Caller setzt errorBanner.kind = reason. */
export type ValidationResult =
  | { ok: true }
  | {
      ok: false;
      reason: "empty_layout" | "too_many_slides" | "too_many_slides_for_grid";
    };

export function validateSlideCount(
  slides: EditorSlide[],
  hasGrid: boolean,
): ValidationResult {
  if (slides.length === 0) return { ok: false, reason: "empty_layout" };
  if (hasGrid && slides.length > SLIDE_HARD_CAP - 1) {
    return { ok: false, reason: "too_many_slides_for_grid" };
  }
  if (!hasGrid && slides.length > SLIDE_HARD_CAP) {
    return { ok: false, reason: "too_many_slides" };
  }
  return { ok: true };
}
