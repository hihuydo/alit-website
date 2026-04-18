"use client";

import { useEffect, useState, type DragEventHandler, type ReactNode } from "react";
import { Modal } from "./Modal";

export interface RowAction {
  label: string;
  onClick: () => void;
  variant?: "default" | "danger";
  disabled?: boolean;
}

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
 * Responsive action cluster (Sprint B1):
 * - `≥md` (768+): all actions render as horizontal buttons inline.
 * - `<md`: actions collapse into a single "…"-button that opens a
 *   Modal-hosted menu (re-uses the Sprint A `<Modal>` primitive for
 *   focus-trap / focus-return / ESC / safe-area support).
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

      {/* Desktop cluster: all actions inline */}
      <div className="hidden md:flex gap-2 shrink-0">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={action.onClick}
            disabled={action.disabled}
            aria-label={action.label}
            className={`px-3 py-1.5 text-sm rounded border transition-colors ${
              action.variant === "danger"
                ? "border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50"
                : "border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            }`}
          >
            {action.label}
          </button>
        ))}
      </div>

      {/* Mobile cluster: single "…"-button, opens Modal with actions */}
      <RowActionsMenu actions={actions} />
    </div>
  );
}

/**
 * Mobile-only "…"-menu. Uses `<Modal>` for focus-trap and ESC/backdrop
 * close. Closes itself BEFORE invoking the action callback, so any
 * follow-up modal (e.g. DeleteConfirm) is the only aria-modal dialog on
 * screen — single-modal-stack invariant, same pattern as MobileTabMenu
 * in Sprint A.
 *
 * `md:hidden` on the trigger button — the Modal itself is hidden via
 * `open={false}` while the trigger is out of view, so no DOM cost.
 */
function RowActionsMenu({ actions }: { actions: RowAction[] }) {
  const [open, setOpen] = useState(false);

  // Close the menu if the viewport grows past md — avoids a stranded
  // open menu when the user resizes into the desktop layout where the
  // "…"-button is hidden. Matches MobileTabMenu behaviour.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(min-width: 768px)");
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) setOpen(false);
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  const handleActionClick = (action: RowAction) => {
    // Close menu-modal BEFORE invoking action. If the action opens
    // another modal (DeleteConfirm), the menu is already gone →
    // single aria-modal stack.
    setOpen(false);
    action.onClick();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Aktionen"
        aria-expanded={open}
        aria-haspopup="menu"
        className="md:hidden min-w-11 min-h-11 flex items-center justify-center text-gray-500 hover:text-black text-xl leading-none rounded hover:bg-gray-50"
      >
        …
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Aktionen">
        <ul className="flex flex-col -m-6">
          {actions.map((action) => (
            <li key={action.label}>
              <button
                type="button"
                disabled={action.disabled}
                onClick={() => handleActionClick(action)}
                className={`w-full text-left px-6 py-3 min-h-11 border-b border-gray-100 transition-colors disabled:opacity-50 ${
                  action.variant === "danger"
                    ? "text-red-600 hover:bg-red-50"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                {action.label}
              </button>
            </li>
          ))}
        </ul>
      </Modal>
    </>
  );
}
