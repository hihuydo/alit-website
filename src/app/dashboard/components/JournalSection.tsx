"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { DashboardJournalEntry } from "./journal-editor-types";
import { JournalEditor, type JournalSavePayload } from "./JournalEditor";
import { DeleteConfirm } from "./DeleteConfirm";
import { DragHandle, ReorderHint } from "./DragHandle";
import type { Locale } from "@/lib/i18n-field";
import { useDirty } from "../DirtyContext";

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

export function JournalSection({ initial, projekte }: { initial: JournalEntry[]; projekte: ProjektOption[] }) {
  const [entries, setEntries] = useState(initial);
  const [editing, setEditing] = useState<JournalEntry | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<JournalEntry | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [migrateResult, setMigrateResult] = useState("");
  const dragItem = useRef<number | null>(null);
  const dragOver = useRef<number | null>(null);

  const reload = useCallback(async () => {
    const res = await fetch("/api/dashboard/journal/");
    const data = await res.json();
    if (data.success) setEntries(data.data);
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
      const res = await fetch(url, {
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
      const res = await fetch(`/api/dashboard/journal/${deleting.id}/`, {
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

  const handleMigrate = async () => {
    setMigrating(true);
    setMigrateResult("");
    try {
      const res = await fetch("/api/dashboard/journal/migrate/", {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        setMigrateResult(data.message);
        await reload();
      } else {
        setMigrateResult(data.error || "Migration fehlgeschlagen");
      }
    } catch {
      setMigrateResult("Verbindungsfehler");
    } finally {
      setMigrating(false);
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
    dragItem.current = null;
    dragOver.current = null;

    try {
      await fetch("/api/dashboard/journal/reorder/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: reordered.map((e) => e.id) }),
      });
    } catch {
      await reload();
    }
  };

  const legacyCount = entries.filter(
    (e) => !e.content || e.content.length === 0
  ).length;
  const showEditor = creating || !!editing;
  const editorEntry: JournalEntry | null = editing ?? null;

  // JournalEditor reports its internal dirty-state (any field touched since
  // mount) via onDirtyChange; we only forward it when the editor is visible.
  const [editorDirty, setEditorDirty] = useState(false);
  const { setDirty } = useDirty();
  useEffect(() => {
    setDirty("journal", showEditor && editorDirty);
    return () => setDirty("journal", false);
  }, [showEditor, editorDirty, setDirty]);

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
          onDirtyChange={setEditorDirty}
        />
      ) : (
        <div className="space-y-2">
          <ReorderHint count={entries.length} />
          {entries.map((entry, index) => {
            const displayTitle = entry.title_i18n?.de ?? entry.title_i18n?.fr ?? entry.title ?? entry.lines?.[0] ?? "–";
            const completion = entry.completion ?? { de: false, fr: false };
            return (
              <div
                key={entry.id}
                draggable
                data-completion-de={String(completion.de)}
                data-completion-fr={String(completion.fr)}
                onDragStart={() => { dragItem.current = index; }}
                onDragEnter={() => { dragOver.current = index; }}
                onDragOver={(e) => e.preventDefault()}
                onDragEnd={handleDragEnd}
                className="group flex items-center justify-between gap-3 p-3 bg-white border rounded cursor-grab active:cursor-grabbing hoverable:hover:border-gray-400 hoverable:hover:bg-gray-50/50 transition-colors"
              >
                <DragHandle />
                <div className="min-w-0 flex-1">
                  <span className="text-sm text-gray-500">{entry.date}</span>
                  <p className="font-bold truncate">{displayTitle}</p>
                  {entry.author && (
                    <p className="text-sm text-gray-500 truncate">
                      von <span className="italic">{entry.author}</span>
                    </p>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <CompletionBadge locale="de" done={completion.de} />
                  <CompletionBadge locale="fr" done={completion.fr} />
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => openEdit(entry)}
                    className="px-3 py-1 text-sm border rounded hover:bg-gray-50"
                  >
                    Bearbeiten
                  </button>
                  <button
                    onClick={() => setDeleting(entry)}
                    className="px-3 py-1 text-sm border border-red-200 text-red-600 rounded hover:bg-red-50"
                  >
                    Löschen
                  </button>
                </div>
              </div>
            );
          })}
          {entries.length === 0 && (
            <p className="text-gray-500 text-sm">
              Keine Journal-Einträge vorhanden.
            </p>
          )}
        </div>
      )}

      {/* Migration controls — only show when legacy entries exist */}
      {!showEditor && legacyCount > 0 && (
        <div className="mt-4 p-3 bg-gray-50 border rounded text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-600">
              {legacyCount} {legacyCount === 1 ? "Eintrag" : "Einträge"} ohne
              Block-Format
            </span>
            <button
              onClick={handleMigrate}
              disabled={migrating}
              className="px-3 py-1.5 text-xs border rounded hover:bg-white disabled:opacity-50"
            >
              {migrating ? "Migriere..." : "Alle migrieren"}
            </button>
          </div>
          {migrateResult && (
            <p className="mt-2 text-gray-500">{migrateResult}</p>
          )}
        </div>
      )}

      <DeleteConfirm
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        label={deleting?.title_i18n?.de ?? deleting?.title_i18n?.fr ?? deleting?.title ?? deleting?.date ?? ""}
      />
    </div>
  );
}
