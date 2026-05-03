import { MAX_GRID_IMAGES, type GridImage } from "./instagram-post";

/**
 * Layout spec for the Slide-1 cover-grid (M4a A4).
 *
 * `imageCount` is authoritative for `columns`/`rows`; `cells = images.slice(0, imageCount)`.
 * Helper-output for `<ImageGrid>` consumer in `slide-template.tsx`.
 */
export type Slide1GridSpec = {
  columns: number;
  rows: number;
  cells: GridImage[];
};

/**
 * Compute the cover-grid layout for Slide 1 based on `imageCount`.
 *
 * Mapping (M4a A4):
 *   - 0 → defensive `{0,0,[]}` (consumer guards via `kind === "grid"` so this is never rendered)
 *   - 1 → 1×1
 *   - 2 → 2×1
 *   - 3 → 3×1
 *   - 4 → 2×2
 *   - >4 → clamped to 4 (2×2)
 *
 * Sparse case (`images.length < imageCount`): `cells.length < imageCount`.
 * Caller's `<ImageGrid>` clamps `effectiveCols = Math.min(cols, images.length)`,
 * so `[img0]` with `imageCount=3` renders 1×1, NOT 3 columns with 2 empty cells.
 * In the normal pipeline `resolveImages(item, imageCount)` pre-resolves to
 * `images.length === imageCount`, so this is testability-completeness only.
 */
export function computeSlide1GridSpec(
  images: GridImage[],
  imageCount: number,
): Slide1GridSpec {
  const clampedCount = Math.min(Math.max(0, imageCount), MAX_GRID_IMAGES);
  const cells = images.slice(0, clampedCount);

  if (clampedCount === 0) return { columns: 0, rows: 0, cells: [] };
  if (clampedCount === 1) return { columns: 1, rows: 1, cells };
  if (clampedCount === 2) return { columns: 2, rows: 1, cells };
  if (clampedCount === 3) return { columns: 3, rows: 1, cells };
  return { columns: 2, rows: 2, cells }; // clampedCount === 4
}
