"use client";

import { useState } from "react";
import type { JournalContent, DashboardJournalEntry as JournalEntry } from "./journal-editor-types";
import { JournalMetaForm } from "./JournalMetaForm";
import { JournalBlocksEditor } from "./JournalBlocksEditor";
import { JournalPreview } from "./JournalPreview";
import type { JournalMeta } from "./journal-editor-utils";
import {
  serializeTextNodes,
  isTextBlock,
  createBlock,
  migrateLinesToContent,
} from "./journal-editor-utils";

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

function entryToBlocks(entry: JournalEntry | null): JournalContent {
  if (entry?.content && entry.content.length > 0) {
    return entry.content;
  }
  // Convert legacy lines + images to blocks
  if (entry?.lines && entry.lines.length > 0) {
    return migrateLinesToContent(entry.lines, entry.images);
  }
  // New entry: start with one empty paragraph
  return [createBlock("paragraph")];
}

export function JournalEditor({
  entry,
  onSave,
  onCancel,
  saving,
  error,
}: JournalEditorProps) {
  const [meta, setMeta] = useState<JournalMeta>(() => entryToMeta(entry));
  const [blocks, setBlocks] = useState<JournalContent>(() =>
    entryToBlocks(entry)
  );
  const [showPreview, setShowPreview] = useState(false);

  const handleSave = async () => {
    // Build lines fallback from blocks for backward compatibility
    const lines: string[] = [];
    for (const block of blocks) {
      if (isTextBlock(block)) {
        lines.push(serializeTextNodes(block.content));
      } else if (block.type === "spacer") {
        lines.push("");
      }
    }

    await onSave({
      date: meta.date,
      author: meta.author || null,
      title: meta.title || null,
      title_border: meta.title_border,
      lines,
      content: blocks,
      footer: meta.footer || null,
    });
  };

  return (
    <div className="space-y-4">
      {/* Preview toggle */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setShowPreview(!showPreview)}
          className={`px-3 py-1.5 text-xs border rounded transition-colors ${
            showPreview
              ? "bg-black text-white"
              : "bg-white hover:bg-gray-50"
          }`}
        >
          {showPreview ? "Vorschau ausblenden" : "Vorschau"}
        </button>
      </div>

      <div
        className={
          showPreview ? "grid grid-cols-2 gap-6 items-start" : ""
        }
      >
        {/* Editor column */}
        <div className="space-y-4">
          {/* Metadata */}
          <div className="bg-white border rounded p-4">
            <h3 className="text-sm font-semibold mb-3 text-gray-600">
              Metadaten
            </h3>
            <JournalMetaForm meta={meta} onChange={setMeta} />
          </div>

          {/* Block editor */}
          <div className="bg-white border rounded p-4">
            <JournalBlocksEditor blocks={blocks} onChange={setBlocks} />
          </div>
        </div>

        {/* Preview column */}
        {showPreview && (
          <div className="sticky top-6">
            <h3 className="text-sm font-semibold mb-2 text-gray-600">
              Vorschau
            </h3>
            <JournalPreview meta={meta} blocks={blocks} />
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
