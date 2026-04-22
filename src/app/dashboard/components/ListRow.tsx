"use client";

import { type DragEventHandler, type ReactNode } from "react";
import { ActionsMenuButton } from "./ActionsMenuButton";
import type { RowAction } from "./actions-menu-types";

// Re-export for the four B1-adopter sections (Agenda/Journal/Projekte/Alit)
// so their import paths stay valid after the type moved to
// `actions-menu-types.ts` in Sprint B2b.
export type { RowAction };

export interface ListRowProps {
  dragHandle?: ReactNode;
  content: ReactNode;
  badges?: ReactNode;
  actions: RowAction[];

  /** Extra container classes appended to the base flex-row layout. */
  className?: string;

  // Drag-drop forwarding (Codex R1 #1): handlers sit on the Row-Container,
  // NOT on DragHandle. ListRow is the container, so we pass through.
  draggable?: boolean;
  onDragStart?: DragEventHandler<HTMLDivElement>;
  onDragEnter?: DragEventHandler<HTMLDivElement>;
  onDragOver?: DragEventHandler<HTMLDivElement>;
  onDragEnd?: DragEventHandler<HTMLDivElement>;
  rowId?: string;

  /** Extra data-* attrs. Sections use these for drag-state indexing. */
  dataAttrs?: Record<`data-${string}`, string | undefined>;
}

/**
 * Shared row primitive for dashboard list sections (Agenda/Journal/Projekte/Alit).
 *
 * Responsive action cluster (Sprint B1, refactored in B2b):
 * - `≥md` (768+): all actions render as horizontal buttons inline.
 * - `<md`: actions collapse into a single "…"-button that opens a
 *   Modal-hosted menu. The menu is now `<ActionsMenuButton>` — shared
 *   with MediaSection Grid + List in Sprint B2b.
 *
 * Both layouts live in the DOM simultaneously. Tailwind's `hidden md:flex`
 * and `md:hidden` gate visibility — JSDOM does not apply breakpoints, so
 * tests verify structural class-presence rather than rendered visibility.
 *
 * Action-ordering convention: callers pass actions primary-first,
 * destructive-last. ListRow does not sort.
 *
 * Drag-drop: HTML5 drag handlers (`onDragStart`, `onDragEnter`, etc.) are
 * forwarded onto the container `<div>`, matching the existing pattern
 * where each section hangs drag state on the row container — NOT on the
 * decorative DragHandle. `rowId` renders as `data-row-id` so section-level
 * drag tracking can read the target.
 */
export function ListRow({
  dragHandle,
  content,
  badges,
  actions,
  className = "",
  draggable,
  onDragStart,
  onDragEnter,
  onDragOver,
  onDragEnd,
  rowId,
  dataAttrs,
}: ListRowProps) {
  const baseClass = "flex items-center justify-between gap-3 p-3";
  return (
    <div
      className={`${baseClass} ${className}`.trim()}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      data-row-id={rowId}
      {...dataAttrs}
    >
      {dragHandle}
      <div className="flex-1 min-w-0">{content}</div>
      {badges && <div className="shrink-0 flex gap-2">{badges}</div>}

      {/* Desktop cluster: all actions inline. Renders `action.icon` when
          set (square icon-only button), otherwise the label as text.
          `aria-label` + `title` always use the text label so screen
          readers + hover-tooltips work in both modes. */}
      <div className="hidden md:flex gap-2 shrink-0">
        {actions.map((action) => {
          const iconMode = action.icon !== undefined;
          return (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              disabled={action.disabled}
              aria-label={action.label}
              title={action.label}
              className={`${
                iconMode ? "p-2" : "px-3 py-1.5 text-sm"
              } rounded border transition-colors ${
                action.variant === "danger"
                  ? "border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50"
                  : "border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              }`}
            >
              {action.icon ?? action.label}
            </button>
          );
        })}
      </div>

      {/* Mobile cluster: "…"-button + Modal via shared ActionsMenuButton.
          `md:hidden` gates visibility — base classes in ActionsMenuButton
          do NOT include visibility, so the caller is responsible. The
          modal always shows text labels regardless of `action.icon`. */}
      <ActionsMenuButton actions={actions} triggerClassName="md:hidden" />
    </div>
  );
}
