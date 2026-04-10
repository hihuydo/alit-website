"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { JournalContent, DashboardJournalEntry as JournalEntry } from "./journal-editor-types";
import { JournalMetaForm } from "./JournalMetaForm";
import { JournalPreview } from "./JournalPreview";
import { RichTextEditor } from "./RichTextEditor";
import { blocksToHtml, htmlToBlocks } from "./journal-html-converter";
import type { JournalMeta } from "./journal-editor-utils";
import { migrateLinesToContent } from "@/lib/journal-migration";

interface JournalEditorProps {
  entry: JournalEntry | null;
  onSave: (payload: {
    date: string;
    author: string | null;
    title: string | null;
    title_border: boolean;
    lines: string[];
    content: JournalContent;
    footer: string | null;
  }) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
  error: string;
}

function entryToMeta(entry: JournalEntry | null): JournalMeta {
  return {
    date: entry?.date ?? "",
    author: entry?.author ?? "",
    title: entry?.title ?? "",
    title_border: entry?.title_border ?? false,
    footer: entry?.footer ?? "",
  };
}

function entryToHtml(entry: JournalEntry | null): string {
  if (entry?.content && entry.content.length > 0) {
    return blocksToHtml(entry.content);
  }
  if (entry?.lines && entry.lines.length > 0) {
    return blocksToHtml(migrateLinesToContent(entry.lines, entry.images));
  }
  return "";
}

export function JournalEditor({
  entry,
  onSave,
  onCancel,
  saving,
  error,
}: JournalEditorProps) {
  const [meta, setMeta] = useState<JournalMeta>(() => entryToMeta(entry));
  const [html, setHtml] = useState(() => entryToHtml(entry));
  const [showPreview, setShowPreview] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<
    "saved" | "unsaved" | "saving"
  >("saved");
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isEditing = !!entry;

  const doAutoSave = useRef<() => void>(() => {});

  const markDirty = useCallback(() => {
    if (!isEditing) return;
    setAutoSaveStatus("unsaved");
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      doAutoSave.current();
    }, 3000);
  }, [isEditing]);

  const updateMeta = useCallback(
    (m: JournalMeta) => { setMeta(m); markDirty(); },
    [markDirty]
  );

  const updateHtml = useCallback(
    (h: string) => { setHtml(h); markDirty(); },
    [markDirty]
  );

  useEffect(() => {
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, []);

  const buildPayload = useCallback(() => {
    const blocks = htmlToBlocks(html);
    // Build lines fallback from plain text (skip non-text blocks like images)
    const lines: string[] = [];
    for (const b of blocks) {
      if (b.type === "spacer") {
        lines.push("");
      } else if ("content" in b) {
        lines.push(b.content.map((n) => n.text).join(""));
      }
    }

    return {
      date: meta.date,
      author: meta.author || null,
      title: meta.title || null,
      title_border: meta.title_border,
      lines,
      content: blocks,
      footer: meta.footer || null,
    };
  }, [meta, html]);

  const handleSave = async () => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    setAutoSaveStatus("saving");
    try {
      await onSave(buildPayload());
      setAutoSaveStatus("saved");
    } catch {
      setAutoSaveStatus("unsaved");
    }
  };

  doAutoSave.current = handleSave;

  // Preview blocks (memoized to avoid recomputing on every render)
  const previewBlocks = useMemo(
    () => (showPreview ? htmlToBlocks(html) : []),
    [showPreview, html]
  );

  return (
    <div className="space-y-4">
      {/* Toolbar: auto-save status + preview toggle */}
      <div className="flex items-center justify-end gap-3">
        {isEditing && (
          <span
            className={`text-xs ${
              autoSaveStatus === "saving"
                ? "text-yellow-600"
                : autoSaveStatus === "unsaved"
                  ? "text-gray-400"
                  : "text-green-600"
            }`}
          >
            {autoSaveStatus === "saving"
              ? "Speichert..."
              : autoSaveStatus === "unsaved"
                ? "Ungespeicherte Änderungen"
                : "Gespeichert"}
          </span>
        )}
        <button
          type="button"
          onClick={() => setShowPreview(!showPreview)}
          className={`px-3 py-1.5 text-xs border rounded transition-colors ${
            showPreview ? "bg-black text-white" : "bg-white hover:bg-gray-50"
          }`}
        >
          {showPreview ? "Vorschau ausblenden" : "Vorschau"}
        </button>
      </div>

      <div className={showPreview ? "grid grid-cols-2 gap-6 items-start" : ""}>
        {/* Editor column */}
        <div className="space-y-4">
          {/* Metadata */}
          <div className="bg-white border rounded p-4">
            <h3 className="text-sm font-semibold mb-3 text-gray-600">Metadaten</h3>
            <JournalMetaForm meta={meta} onChange={updateMeta} />
          </div>

          {/* Rich text editor */}
          <div className="bg-white border rounded p-4">
            <label className="block text-sm font-medium mb-2">Inhalt</label>
            <RichTextEditor value={html} onChange={updateHtml} />
          </div>
        </div>

        {/* Preview column */}
        {showPreview && (
          <div className="sticky top-6">
            <h3 className="text-sm font-semibold mb-2 text-gray-600">Vorschau</h3>
            <JournalPreview meta={meta} blocks={previewBlocks} />
          </div>
        )}
      </div>

      {/* Error & Actions */}
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <div className="flex gap-3 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border rounded hover:bg-gray-50 text-sm"
        >
          Abbrechen
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 disabled:opacity-50 text-sm"
        >
          {saving ? "..." : "Speichern"}
        </button>
      </div>
    </div>
  );
}
