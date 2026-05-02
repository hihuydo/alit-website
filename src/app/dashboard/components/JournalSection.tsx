"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { DashboardJournalEntry } from "./journal-editor-types";
import { JournalEditor, type JournalSavePayload } from "./JournalEditor";
import { DeleteConfirm } from "./DeleteConfirm";
import { DragHandle } from "./DragHandle";
import { ListRow } from "./ListRow";
import { JournalInfoEditor, type JournalInfoValue } from "./JournalInfoEditor";
import type { Locale } from "@/lib/i18n-field";
import { useDirty } from "../DirtyContext";
import { dashboardFetch } from "../lib/dashboardFetch";

function CompletionBadge({ locale, done }: { locale: Locale; done: boolean }) {
  const label = locale.toUpperCase();
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${
        done
          ? "bg-green-50 text-green-700 border-green-200"
          : "bg-gray-50 text-gray-400 border-gray-200"
      }`}
      aria-label={done ? `${label} übersetzt` : `${label} fehlt`}
    >
      <span>{label}</span>
      <span aria-hidden>{done ? "✓" : "–"}</span>
    </span>
  );
}

export type JournalEntry = DashboardJournalEntry;

interface ProjektOption {
  slug_de: string;
  titel: string;
}

export function JournalSection({
  initial,
  projekte,
  journalInfo,
  onJournalInfoChange,
  resetSignal,
}: {
  initial: JournalEntry[];
  projekte: ProjektOption[];
  journalInfo: JournalInfoValue;
  onJournalInfoChange?: (next: JournalInfoValue) => void;
  resetSignal?: number;
}) {
  const [entries, setEntries] = useState(initial);
  const [editing, setEditing] = useState<JournalEntry | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<JournalEntry | null>(null);

  // Tab-reset (see AgendaSection).
  useEffect(() => {
    setEditing(null);
    setCreating(false);
    setDeleting(null);
  }, [resetSignal]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // Global list sort mode — either datum-based auto or admin-controlled
  // drag-and-drop manual. The GET response carries the current value;
  // optimistic local update on reorder avoids a reload flash.
  const [sortMode, setSortMode] = useState<"auto" | "manual">("auto");
  const dragItem = useRef<number | null>(null);
  const dragOver = useRef<number | null>(null);

  const reload = useCallback(async () => {
    const res = await fetch("/api/dashboard/journal/");
    const data = await res.json();
    if (data.success) {
      setEntries(data.data);
      if (data.sortMode === "auto" || data.sortMode === "manual") {
        setSortMode(data.sortMode);
      }
    }
  }, []);

  // Refetch on mount — the parent fetches `initial` only once.
  useEffect(() => { reload(); }, [reload]);

  const openCreate = () => {
    setError("");
    setCreating(true);
  };

  const openEdit = (entry: JournalEntry) => {
    setError("");
    setEditing(entry);
  };

  const handleSave = async (
    payload: JournalSavePayload,
    opts?: { autoSave?: boolean; signal?: AbortSignal }
  ) => {
    setError("");
    if (!opts?.autoSave) setSaving(true);
    try {
      const url = editing
        ? `/api/dashboard/journal/${editing.id}/`
        : "/api/dashboard/journal/";
      const res = await dashboardFetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: opts?.signal,
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Fehler beim Speichern");
        return;
      }
      if (!opts?.autoSave) {
        setEditing(null);
        setCreating(false);
        await reload();
      }
    } catch (err) {
      // Autosave aborted during unmount (Verwerfen / tab-switch) is expected —
      // don't raise a "Verbindungsfehler" banner for it.
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("Verbindungsfehler");
    } finally {
      if (!opts?.autoSave) setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setSaving(true);
    try {
      const res = await dashboardFetch(`/api/dashboard/journal/${deleting.id}/`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Fehler beim Löschen");
        return;
      }
      setDeleting(null);
      await reload();
    } catch {
      setError("Verbindungsfehler");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditing(null);
    setCreating(false);
  };

  const handleDragEnd = async () => {
    if (dragItem.current === null || dragOver.current === null || dragItem.current === dragOver.current) {
      dragItem.current = null;
      dragOver.current = null;
      return;
    }
    const reordered = [...entries];
    const [moved] = reordered.splice(dragItem.current, 1);
    reordered.splice(dragOver.current, 0, moved);
    setEntries(reordered);
    // Optimistic: first drag flips display to manual before the server
    // confirms. If the request fails, reload() restores truth.
    setSortMode("manual");
    dragItem.current = null;
    dragOver.current = null;
    try {
      const res = await dashboardFetch("/api/dashboard/journal/reorder/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: reordered.map((e) => e.id) }),
      });
      const data = await res.json().catch(() => ({ success: false }));
      if (!res.ok || !data.success) {
        await reload();
      }
    } catch {
      await reload();
    }
  };

  const handleResetToAuto = async () => {
    try {
      const res = await dashboardFetch("/api/dashboard/journal/sort-mode/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "auto" }),
      });
      const data = await res.json().catch(() => ({ success: false }));
      if (!res.ok || !data.success) return;
      // Full reload — the server will re-sort by datum now, so the
      // local entries array needs the new order.
      await reload();
    } catch {
      /* no-op: stale-state is harmless, admin can retry */
    }
  };

  const showEditor = creating || !!editing;
  const editorEntry: JournalEntry | null = editing ?? null;

  // JournalEditor calls us synchronously from markDirty / unmount-cleanup,
  // so the central dirty-guard is updated BEFORE React processes the next
  // user event (keypress → click race). No intermediate useState hop.
  const { setDirty } = useDirty();
  const handleEditorDirty = useCallback(
    (dirty: boolean) => setDirty("journal", dirty),
    [setDirty],
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">
          {showEditor
            ? editing
              ? "Eintrag bearbeiten"
              : "Neuer Eintrag"
            : `Discours Agités (${entries.length})`}
        </h2>
        {!showEditor && (
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 text-sm"
          >
            + Neu
          </button>
        )}
      </div>

      {showEditor ? (
        <JournalEditor
          entry={editorEntry}
          projekte={projekte}
          onSave={handleSave}
          onCancel={handleCancel}
          saving={saving}
          error={error}
          onDirtyChange={handleEditorDirty}
        />
      ) : (
        <div className="space-y-4">
          <details className="border rounded bg-white">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium hoverable:hover:bg-gray-50">
              i-bar Info-Text bearbeiten
            </summary>
            <div className="border-t p-3">
              <JournalInfoEditor
                initial={journalInfo}
                onSaved={onJournalInfoChange}
              />
            </div>
          </details>

          {/* Sort-mode indicator + reset button. "Auto"-Zustand ist der
              Default — erst beim ersten Drag wechselt die Liste in
              "Manuell", dann erscheint der Reset-Button. */}
          <div className="flex items-center gap-3 text-sm text-gray-500">
            {sortMode === "manual" ? (
              <>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border bg-amber-50 text-amber-800 border-amber-200">
                  Manuelle Sortierung aktiv
                </span>
                <button
                  type="button"
                  onClick={handleResetToAuto}
                  className="text-xs underline hoverable:hover:text-gray-800"
                >
                  Auto-Sort (nach Datum) wiederherstellen
                </button>
              </>
            ) : (
              <span className="text-xs">
                Auto-Sort nach Datum · erster Drag schaltet auf manuelle Reihenfolge um
              </span>
            )}
          </div>

          {entries.map((entry, index) => {
            const displayTitle = entry.title_i18n?.de ?? entry.title_i18n?.fr ?? "–";
            const completion = entry.completion ?? { de: false, fr: false };
            return (
              <ListRow
                key={entry.id}
                draggable
                dataAttrs={{
                  "data-completion-de": String(completion.de),
                  "data-completion-fr": String(completion.fr),
                }}
                onDragStart={() => { dragItem.current = index; }}
                onDragEnter={() => { dragOver.current = index; }}
                onDragOver={(e) => e.preventDefault()}
                onDragEnd={handleDragEnd}
                className="group bg-white border rounded cursor-grab active:cursor-grabbing hoverable:hover:border-gray-400 hoverable:hover:bg-gray-50/50 transition-colors"
                dragHandle={<DragHandle />}
                content={
                  <>
                    <span className="text-sm text-gray-500">{entry.datum ?? "—"}</span>
                    <p className="font-bold truncate">{displayTitle}</p>
                    {entry.author && (
                      <p className="text-sm text-gray-500 truncate">
                        von <span className="italic">{entry.author}</span>
                      </p>
                    )}
                  </>
                }
                badges={
                  <>
                    <CompletionBadge locale="de" done={completion.de} />
                    <CompletionBadge locale="fr" done={completion.fr} />
                  </>
                }
                actions={[
                  { label: "Bearbeiten", onClick: () => openEdit(entry) },
                  { label: "Löschen", onClick: () => setDeleting(entry), variant: "danger" },
                ]}
              />
            );
          })}
          {entries.length === 0 && (
            <p className="text-gray-500 text-sm">
              Keine Journal-Einträge vorhanden.
            </p>
          )}
        </div>
      )}

      <DeleteConfirm
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        label={deleting?.title_i18n?.de ?? deleting?.title_i18n?.fr ?? deleting?.datum ?? ""}
      />
    </div>
  );
}
