import type { SupporterSlideLogo } from "./supporter-logos";

// IG-frame & supporter-slide layout constants. Static (Satori-frame is
// fixed 1080×1350), exported so tests can assert exact pixel values.
export const IG_FRAME_WIDTH = 1080;
export const IG_FRAME_HEIGHT = 1350;
export const IG_FRAME_PADDING = 80;
export const SUPPORTER_LABEL_HEIGHT_RESERVE = 100;
export const SUPPORTER_LOGO_HEIGHT = 100;
export const SUPPORTER_LOGO_GAP = 24;
export const SUPPORTER_LABEL_FONT_SIZE = 32;

/** Default aspect ratio (1:1) for logos with missing dimensions. */
const DEFAULT_LOGO_ASPECT = 1;

export interface SupporterGridLogoLayout {
  public_id: string;
  alt: string | null;
  dataUrl: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SupporterGridLayout {
  label: { y: number; fontSize: number };
  logos: SupporterGridLogoLayout[];
}

/**
 * Compute absolute-positioned grid layout for the Supporter-Slide.
 * Returns label position + each logo's pixel-precise box. Satori
 * cannot reliably do `flexWrap` so we precompute everything here and
 * the template just renders absolute-positioned divs.
 *
 * Logos with null dimensions get a 1:1 aspect-ratio fallback. Width is
 * derived from the fixed `SUPPORTER_LOGO_HEIGHT` and the logo's aspect.
 *
 * Multi-row wrap: if a row exceeds the inner-frame width, the next logo
 * starts a new row. Vertical centering inside the body region.
 */
export function computeSupporterGridLayout(
  logos: SupporterSlideLogo[],
  frameW: number = IG_FRAME_WIDTH,
  frameH: number = IG_FRAME_HEIGHT,
  // label kept for parity with the `appendSupporterSlide` 4-param contract
  // even though here only fontSize is needed.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _label: string = "",
): SupporterGridLayout {
  const innerLeft = IG_FRAME_PADDING;
  const innerRight = frameW - IG_FRAME_PADDING;
  const innerWidth = innerRight - innerLeft;

  // Label sits in the upper region (above the body).
  const labelY = IG_FRAME_PADDING;
  const labelBaselineY = labelY + SUPPORTER_LABEL_HEIGHT_RESERVE;

  // Pre-compute each logo's box (height fixed, width = height × aspect).
  const sized = logos.map((logo) => {
    const aspect =
      logo.width != null && logo.height != null && logo.height > 0
        ? logo.width / logo.height
        : DEFAULT_LOGO_ASPECT;
    return {
      logo,
      w: SUPPORTER_LOGO_HEIGHT * aspect,
      h: SUPPORTER_LOGO_HEIGHT,
    };
  });

  // Greedy row-pack. Each row's logos sum width + gaps; next logo wraps
  // when adding it would overflow innerWidth.
  type Row = { items: typeof sized; totalWidth: number };
  const rows: Row[] = [];
  let current: Row = { items: [], totalWidth: 0 };
  for (const item of sized) {
    const additionalWidth =
      (current.items.length === 0 ? 0 : SUPPORTER_LOGO_GAP) + item.w;
    if (
      current.items.length > 0 &&
      current.totalWidth + additionalWidth > innerWidth
    ) {
      rows.push(current);
      current = { items: [item], totalWidth: item.w };
    } else {
      current.items.push(item);
      current.totalWidth += additionalWidth;
    }
  }
  if (current.items.length > 0) rows.push(current);

  // Vertical centering: total stack height + gaps between rows.
  const stackHeight =
    rows.length === 0
      ? 0
      : rows.length * SUPPORTER_LOGO_HEIGHT +
        (rows.length - 1) * SUPPORTER_LOGO_GAP;
  const bodyTop = labelBaselineY + IG_FRAME_PADDING / 2;
  const bodyBottom = frameH - IG_FRAME_PADDING;
  const bodyHeight = bodyBottom - bodyTop;
  const startY = bodyTop + Math.max(0, (bodyHeight - stackHeight) / 2);

  const out: SupporterGridLogoLayout[] = [];
  let rowY = startY;
  for (const row of rows) {
    const rowStartX = innerLeft + (innerWidth - row.totalWidth) / 2;
    let cursorX = rowStartX;
    for (let i = 0; i < row.items.length; i++) {
      const item = row.items[i];
      out.push({
        public_id: item.logo.public_id,
        alt: item.logo.alt,
        dataUrl: item.logo.dataUrl,
        x: cursorX,
        y: rowY,
        w: item.w,
        h: item.h,
      });
      cursorX += item.w + SUPPORTER_LOGO_GAP;
    }
    rowY += SUPPORTER_LOGO_HEIGHT + SUPPORTER_LOGO_GAP;
  }

  return {
    label: { y: labelY, fontSize: SUPPORTER_LABEL_FONT_SIZE },
    logos: out,
  };
}
