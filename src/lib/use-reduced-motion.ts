import { useSyncExternalStore } from "react";

// Module-level lazy singleton: ein einziges MQL-Object über alle Reads
// geteilt. Vermeidet GC-Druck (useSyncExternalStore ruft getSnapshot oft
// pro Render) und neue Function-References (würden tear-down + re-subscribe
// pro Consumer-Render triggern). Lazy-Init weil window auf Server undefined.
let mql: MediaQueryList | null = null;
const ensureMql = (): MediaQueryList | null => {
  if (!mql && typeof window !== "undefined") {
    mql = window.matchMedia("(prefers-reduced-motion: reduce)");
  }
  return mql;
};

const subscribe = (cb: () => void) => {
  const m = ensureMql();
  if (!m) return () => {};
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

const getSnapshot = () => ensureMql()?.matches ?? false;
const getServerSnapshot = () => false;

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
