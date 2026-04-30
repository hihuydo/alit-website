/** Slide-shape used by LayoutEditor's internal state and by the
 *  pure-helper functions in layout-editor-state.ts.
 *
 *  Mirrors the response-shape contract from S1b's GET endpoint:
 *  `body.slides[].blocks[]` has `{id, text, isHeading}`.
 *  See src/app/api/dashboard/agenda/[id]/instagram-layout/route.ts. */
export type EditorSlide = {
  blocks: { id: string; text: string; isHeading: boolean }[];
};

/** Banner-kind union — single source of truth.
 *
 *  Used by:
 *    - LayoutEditor `errorBanner` state shape
 *    - `mapPutErrorToBannerKind` return type
 *    - `dashboardStrings.layoutEditor.errors: Record<ErrorBannerKind, string>`
 *
 *  `null` is encoded in the LayoutEditor state as `errorBanner: { kind, ... } | null`,
 *  not as a union member here — the type intentionally lists only positive kinds. */
export type ErrorBannerKind =
  | "content_changed"
  | "layout_modified"
  | "too_many_slides"
  | "too_many_slides_for_grid"
  | "empty_layout"
  | "incomplete_layout"
  | "unknown_block"
  | "duplicate_block"
  | "generic"
  | "network"
  | "delete_failed";
