"use client";

import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import type { RowAction } from "./actions-menu-types";

/**
 * Shared "…"-menu button that pops a `<Modal>` with a vertical action
 * list. Extracted from Sprint B1's inline `RowActionsMenu` (ListRow) so
 * MediaSection's Grid + List views can reuse the same close-before-
 * action + matchMedia-resize-close semantics without duplication.
 *
 * ## Trigger-Class Contract (Sprint B2b v3)
 *
 * The base trigger class covers touch-target + visual (44×44 tap area,
 * hover/focus affordance) and is ALWAYS applied. It contains NO
 * visibility tokens (no `hidden`, no `md:hidden`, no `hoverable:`) —
 * visibility is the caller's responsibility via `triggerClassName`.
 *
 * `triggerClassName` is APPENDED to the base (space-separated). Callers
 * stack their own visibility / positioning utilities:
 *
 *   ListRow (B1 behaviour preserved):
 *     triggerClassName="md:hidden"
 *
 *   MediaSection Grid-tile (touch-tablet fix):
 *     triggerClassName="md:hoverable:hidden absolute top-1 right-1 bg-white/80"
 *
 * This lets a single primitive satisfy both "mobile-only trigger" and
 * "any-non-hover trigger" visibility requirements.
 */
export const ACTIONS_MENU_TRIGGER_BASE_CLASS =
  "min-w-11 min-h-11 flex items-center justify-center text-gray-500 hover:text-black text-xl leading-none rounded hover:bg-gray-50";

export interface ActionsMenuButtonProps {
  actions: RowAction[];
  /** Appended to ACTIONS_MENU_TRIGGER_BASE_CLASS (not a replacement). */
  triggerClassName?: string;
  /** aria-label on the trigger button. Defaults to "Aktionen". */
  triggerLabel?: string;
  /** Title inside the action-list modal. Defaults to "Aktionen". */
  modalTitle?: string;
}

export function ActionsMenuButton({
  actions,
  triggerClassName = "",
  triggerLabel = "Aktionen",
  modalTitle = "Aktionen",
}: ActionsMenuButtonProps) {
  const [open, setOpen] = useState(false);

  // Close the menu if the viewport grows past md — prevents a stranded
  // open menu when the user resizes into the desktop layout. Matches
  // MobileTabMenu + B1 RowActionsMenu behaviour.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(min-width: 768px)");
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) setOpen(false);
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  // Close-before-action (patterns/react.md): close the menu BEFORE
  // invoking the action callback so any follow-up modal (e.g.
  // DeleteConfirm) is the only aria-modal on screen.
  const handleActionClick = (action: RowAction) => {
    setOpen(false);
    action.onClick();
  };

  const triggerClass = `${ACTIONS_MENU_TRIGGER_BASE_CLASS} ${triggerClassName}`.trim();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={triggerLabel}
        aria-expanded={open}
        aria-haspopup="menu"
        className={triggerClass}
      >
        …
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={modalTitle}>
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
