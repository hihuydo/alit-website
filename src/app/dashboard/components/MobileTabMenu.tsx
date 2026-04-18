"use client";

import { useEffect } from "react";
import { Modal } from "./Modal";

export interface MobileTabMenuProps<TKey extends string> {
  tabs: { key: TKey; label: string }[];
  active: TKey;
  /**
   * Human-readable label for the currently-active state, shown next to the
   * burger icon. Passed explicitly (rather than derived from `tabs.find`)
   * because `active` can be a key that legitimately lives outside the
   * tabs array — e.g. the "Konto" view is selected via a header button,
   * not the tab bar, so it never appears in `tabs` but is a valid active
   * state. Deriving the label from `tabs` alone would leave the burger
   * trigger text empty in that case.
   */
  activeLabel: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Called **unconditionally** when the user picks a tab.
   * Dirty-guard ownership stays with the parent — this component is dumb
   * and never calls `confirmDiscard`. The parent MUST close the panel
   * (`onOpenChange(false)`) BEFORE delegating to any flow that may open
   * a second modal (e.g. dirty-confirm), so the two modals never stack.
   */
  onSelect: (tab: TKey) => void;
}

/**
 * Mobile-first tab navigation.
 * - `<768px` renders a burger button that opens a Modal-hosted panel.
 * - `≥768px` renders nothing; caller renders the full horizontal tab bar
 *   separately (gated by `hidden md:flex`).
 *
 * Panel reuses the shared `<Modal>` primitive, so focus-trap, focus-return,
 * ESC, backdrop-click, and `aria-modal="true"` come for free.
 *
 * When the viewport grows past 768px with the panel still open, a
 * `matchMedia`-listener closes it so the state does not leak behind the
 * `md:hidden` burger button.
 */
export function MobileTabMenu<TKey extends string>({
  tabs,
  active,
  activeLabel,
  isOpen,
  onOpenChange,
  onSelect,
}: MobileTabMenuProps<TKey>) {
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(min-width: 768px)");
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) onOpenChange(false);
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [onOpenChange]);

  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        aria-label="Menü öffnen"
        aria-expanded={isOpen}
        className="md:hidden min-w-11 min-h-11 flex items-center gap-2 px-3 py-2 rounded border border-black bg-white text-sm font-medium hover:bg-gray-50 mb-4"
      >
        <span aria-hidden>☰</span>
        <span className="truncate">{activeLabel}</span>
      </button>

      <Modal open={isOpen} onClose={() => onOpenChange(false)} title="Tabs">
        <ul className="flex flex-col -m-6">
          {tabs.map((tab) => {
            const isActive = tab.key === active;
            return (
              <li key={tab.key}>
                <button
                  type="button"
                  disabled={isActive}
                  onClick={() => onSelect(tab.key)}
                  className={`w-full text-left px-6 py-3 min-h-11 border-b border-gray-100 ${
                    isActive
                      ? "font-semibold underline underline-offset-4 text-black cursor-default"
                      : "hover:bg-gray-50 text-gray-700"
                  }`}
                >
                  {tab.label}
                </button>
              </li>
            );
          })}
        </ul>
      </Modal>
    </>
  );
}
