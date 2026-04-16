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

// Governance: a new editor tab in the dashboard MUST add its key here AND
// call useDirty()/setDirty() in its section. Without both sides wired, the
// new editor silently loses its unsaved-changes guard.
export type DirtyKey = "agenda" | "journal" | "projekte" | "alit";

interface DirtyContextValue {
  setDirty: (key: DirtyKey, isDirty: boolean) => void;
  confirmDiscard: (action: () => void) => void;
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
};

export function DirtyProvider({ children }: { children: ReactNode }) {
  const dirtyRef = useRef<Record<DirtyKey, boolean>>({ ...INITIAL_DIRTY });
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

  const openConfirm = useCallback(() => {
    modalOpenRef.current = true;
    setModalOpen(true);
  }, []);

  const closeConfirm = useCallback(() => {
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
    <DirtyContext.Provider value={{ setDirty, confirmDiscard }}>
      {children}
      <Modal
        open={modalOpen}
        onClose={closeConfirm}
        title="Ungesicherte Änderungen verwerfen?"
      >
        <p className="text-sm text-gray-700">Deine Änderungen am Editor gehen verloren.</p>
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={closeConfirm}
            className="px-4 py-2 border rounded text-sm hover:bg-gray-50"
          >
            Zurück
          </button>
          <button
            onClick={handleDiscard}
            className="px-4 py-2 border border-black bg-black text-white rounded text-sm hover:bg-gray-800"
          >
            Verwerfen
          </button>
        </div>
      </Modal>
    </DirtyContext.Provider>
  );
}
