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

export interface RowAction {
  label: string;
  onClick: () => void;
  variant?: "default" | "danger";
  disabled?: boolean;
}
