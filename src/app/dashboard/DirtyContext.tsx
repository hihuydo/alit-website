"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Modal } from "./components/Modal";
import { dashboardStrings } from "./i18n";

// Governance: a new editor tab in the dashboard MUST add its key here AND
// call useDirty()/setDirty() in its section. Without both sides wired, the
// new editor silently loses its unsaved-changes guard. Editors with autosave
// MUST additionally register a flush handler via registerFlushHandler so
// "Zurück" resolves pending timers synchronously.
export type DirtyKey = "agenda" | "journal" | "projekte" | "alit" | "account";

const DIRTY_KEYS: readonly DirtyKey[] = [
  "agenda",
  "journal",
  "projekte",
  "alit",
  "account",
];

interface DirtyContextValue {
  setDirty: (key: DirtyKey, isDirty: boolean) => void;
  confirmDiscard: (action: () => void) => void;
  registerFlushHandler: (key: DirtyKey, fn: () => void) => () => void;
}

const DirtyContext = createContext<DirtyContextValue | null>(null);

export function useDirty(): DirtyContextValue {
  const ctx = useContext(DirtyContext);
  if (!ctx) throw new Error("useDirty must be used within a DirtyProvider");
  return ctx;
}

const INITIAL_DIRTY: Record<DirtyKey, boolean> = {
  agenda: false,
  journal: false,
  projekte: false,
  alit: false,
  account: false,
};

export function DirtyProvider({ children }: { children: ReactNode }) {
  const dirtyRef = useRef<Record<DirtyKey, boolean>>({ ...INITIAL_DIRTY });
  const flushHandlersRef = useRef<Partial<Record<DirtyKey, () => void>>>({});
  const flushRunningRef = useRef(false);
  const modalOpenRef = useRef(false);
  const actionRef = useRef<(() => void) | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const isAnyDirty = useCallback(
    () => Object.values(dirtyRef.current).some(Boolean),
    [],
  );

  const setDirty = useCallback((key: DirtyKey, isDirty: boolean) => {
    dirtyRef.current[key] = isDirty;
  }, []);

  const registerFlushHandler = useCallback(
    (key: DirtyKey, fn: () => void) => {
      flushHandlersRef.current[key] = fn;
      return () => {
        // Idempotent: only clear if this exact fn is still registered.
        // Prevents an older unmount cleanup from removing a newer handler
        // after a newest-wins replacement.
        if (flushHandlersRef.current[key] === fn) {
          delete flushHandlersRef.current[key];
        }
      };
    },
    [],
  );

  const openConfirm = useCallback(() => {
    modalOpenRef.current = true;
    setModalOpen(true);
  }, []);

  const closeConfirm = useCallback(() => {
    // Flush runs ONLY on Zurück (this path), NEVER on Verwerfen (handleDiscard).
    // Verwerfen unmounts the editor and its AbortController cancels in-flight
    // autosave; flushing here would commit data the user explicitly discarded.
    //
    // Telemetry: each invocation emits a structured one-line JSON log in the
    // same shape as server-side audit logs (`{type, key, ...}`). When a
    // DevTools observer or error-reporting-tool is wired in later, these
    // lines are grepable without refactoring the flush pipeline.
    if (!flushRunningRef.current) {
      flushRunningRef.current = true;
      try {
        for (const key of DIRTY_KEYS) {
          if (!dirtyRef.current[key]) continue;
          const handler = flushHandlersRef.current[key];
          if (!handler) continue;
          try {
            handler();
            console.log(JSON.stringify({ type: "flush_invoked", key }));
          } catch (err) {
            console.error(
              JSON.stringify({
                type: "flush_failed",
                key,
                error: err instanceof Error ? err.message : String(err),
              }),
            );
          }
        }
      } finally {
        flushRunningRef.current = false;
      }
    }
    modalOpenRef.current = false;
    actionRef.current = null;
    setModalOpen(false);
  }, []);

  const confirmDiscard = useCallback(
    (action: () => void) => {
      // State-guard via ref (not state) so rapid synchronous double-clicks
      // can't race past a stale closure before the next render.
      if (modalOpenRef.current) return;
      if (!isAnyDirty()) {
        action();
        return;
      }
      actionRef.current = action;
      openConfirm();
    },
    [isAnyDirty, openConfirm],
  );

  const handleDiscard = useCallback(() => {
    // No flush here — see closeConfirm comment.
    const pending = actionRef.current;
    actionRef.current = null;
    modalOpenRef.current = false;
    setModalOpen(false);
    pending?.();
  }, []);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isAnyDirty()) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isAnyDirty]);

  return (
    <DirtyContext.Provider
      value={{ setDirty, confirmDiscard, registerFlushHandler }}
    >
      {children}
      <Modal
        open={modalOpen}
        onClose={closeConfirm}
        title={dashboardStrings.dirtyConfirm.title}
      >
        <p className="text-sm text-gray-700">{dashboardStrings.dirtyConfirm.body}</p>
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={closeConfirm}
            className="px-4 py-2 border rounded text-sm hover:bg-gray-50"
          >
            {dashboardStrings.dirtyConfirm.stay}
          </button>
          <button
            onClick={handleDiscard}
            className="px-4 py-2 border border-black bg-black text-white rounded text-sm hover:bg-gray-800"
          >
            {dashboardStrings.dirtyConfirm.discard}
          </button>
        </div>
      </Modal>
    </DirtyContext.Provider>
  );
}
