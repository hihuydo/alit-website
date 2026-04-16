"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { dashboardStrings } from "../i18n";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /**
   * When true, Escape / backdrop-click / × button no longer trigger
   * `onClose`. Use this during a committed in-progress operation (e.g. a
   * fetch) so the caller doesn't have to fake it with a no-op `onClose`,
   * which left keyboard / screen-reader users without feedback and a
   * dismissible-looking modal. The × button is hidden while disabled.
   * Focus-trap + Escape-key blocking stay consistent with hidden × state.
   */
  disableClose?: boolean;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ open, onClose, title, children, disableClose = false }: ModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Keep disableClose live-readable in the key handler without re-subscribing
  // every render. The handler uses the ref, not the prop, so toggling
  // disableClose mid-open doesn't reinstall listeners.
  const disableCloseRef = useRef(disableClose);
  useEffect(() => {
    disableCloseRef.current = disableClose;
  });

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;

    // Move initial focus into the dialog. Prefer the first focusable child;
    // fall back to the dialog container itself (tabIndex=-1 makes it focusable
    // but keeps it out of the tab sequence).
    const first = dialog?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (first ?? dialog)?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (!disableCloseRef.current) onClose();
        return;
      }
      if (e.key !== "Tab" || !dialog) return;
      const focusables = dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusables.length === 0) {
        e.preventDefault();
        dialog.focus();
        return;
      }
      const firstEl = focusables[0];
      const lastEl = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      // Restore focus to the element that opened the modal. Guarded because
      // the element may have been removed from the DOM while the modal was open.
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (disableClose) return;
        if (e.target === backdropRef.current) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4 focus:outline-none"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
          {!disableClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label={dashboardStrings.modal.close}
              className="text-gray-400 hover:text-black text-2xl leading-none"
            >
              &times;
            </button>
          )}
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
