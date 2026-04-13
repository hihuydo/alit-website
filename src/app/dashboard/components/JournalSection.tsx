"use client";

import { useState, useRef } from "react";
import type { JournalContent, DashboardJournalEntry } from "./journal-editor-types";
import { JournalEditor } from "./JournalEditor";
import { DeleteConfirm } from "./DeleteConfirm";
import { DragHandle, ReorderHint } from "./DragHandle";

export type JournalEntry = DashboardJournalEntry;

export function JournalSection({ initial }: { initial: JournalEntry[] }) {
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

  const reload = async () => {
    const res = await fetch("/api/dashboard/journal/");
    const data = await res.json();
    if (data.success) setEntries(data.data);
  };

  const openCreate = () => {
    setError("");
    setCreating(true);
  };

  const openEdit = (entry: JournalEntry) => {
    setError("");
    setEditing(entry);
  };

  const handleSave = async (
    payload: {
      date: string;
      author: string | null;
      title: string | null;
      title_border: boolean;
      lines: string[];
      content: JournalContent;
      footer: string | null;
    },
    opts?: { autoSave?: boolean }
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
    } catch {
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

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">
          {showEditor
            ? editing
              ? "Journal-Eintrag bearbeiten"
              : "Neuer Journal-Eintrag"
            : `Journal (${entries.length})`}
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
          onSave={handleSave}
          onCancel={handleCancel}
          saving={saving}
          error={error}
        />
      ) : (
        <div className="space-y-2">
          <ReorderHint count={entries.length} />
          {entries.map((entry, index) => (
            <div
              key={entry.id}
              draggable
              onDragStart={() => { dragItem.current = index; }}
              onDragEnter={() => { dragOver.current = index; }}
              onDragOver={(e) => e.preventDefault()}
              onDragEnd={handleDragEnd}
              className="group flex items-center justify-between gap-3 p-3 bg-white border rounded cursor-grab active:cursor-grabbing hover:border-gray-400 hover:bg-gray-50/50 transition-colors"
            >
              <DragHandle />
              <div className="min-w-0 flex-1">
                <span className="text-sm text-gray-500">{entry.date}</span>
                <p className="font-medium truncate">
                  {entry.title || entry.lines[0] || "–"}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  {entry.author && (
                    <span className="text-sm text-gray-500">
                      {entry.author}
                    </span>
                  )}
                  {entry.content && entry.content.length > 0 && (
                    <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                      {entry.content.length} Blöcke
                    </span>
                  )}
                </div>
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
          ))}
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
        label={deleting?.title ?? deleting?.date ?? ""}
      />
    </div>
  );
}
