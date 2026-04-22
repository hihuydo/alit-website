/**
 * Shared types for action-menu-style components (ListRow, ActionsMenuButton,
 * MediaSection). Previously owned by ListRow.tsx — lived there since
 * Sprint B1 — but MediaSection now also consumes it. Moving the type to
 * its own file avoids the dependency-inversion where the primitive
 * ActionsMenuButton would have had to re-import from its consumer ListRow.
 *
 * ListRow still re-exports `RowAction` for backwards-compat so the four
 * B1-adopter sections (Agenda/Journal/Projekte/Alit) don't need import
 * path changes.
 */

import type { ReactNode } from "react";

export interface RowAction {
  /** Always required — used as aria-label on desktop buttons (a11y) and
   *  as visible text in the mobile "…"-menu modal. */
  label: string;
  /** Desktop-only: when set, the desktop button renders this node in
   *  place of the label text, keeping the label as aria-label + tooltip.
   *  The mobile modal always shows the text label regardless of `icon`.
   *  Used by MediaSection (5 actions per row — text-button cluster was
   *  visually noisy); other ListRow consumers (Agenda/Journal/Projekte/
   *  Alit) keep text-only by omitting `icon`. */
  icon?: ReactNode;
  onClick: () => void;
  variant?: "default" | "danger";
  disabled?: boolean;
}
