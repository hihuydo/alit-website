"use client";

import { useState } from "react";
import type { JournalContent } from "./journal-editor-types";
import { JournalMetaForm } from "./JournalMetaForm";
import { JournalBlocksEditor } from "./JournalBlocksEditor";
import {
  serializeTextNodes,
  isTextBlock,
  createBlock,
} from "./journal-editor-utils";

interface JournalMeta {
  date: string;
  author: string;
  title: string;
  title_border: boolean;
  footer: string;
}

export interface JournalEditorEntry {
  id?: number;
  date: string;
  author: string | null;
  title: string | null;
  title_border: boolean;
  lines: string[];
  images: { src: string; afterLine: number }[] | null;
  content: JournalContent | null;
  footer: string | null;
  sort_order: number;
}

interface JournalEditorProps {
  entry: JournalEditorEntry | null;
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

function entryToMeta(entry: JournalEditorEntry | null): JournalMeta {
  return {
    date: entry?.date ?? "",
    author: entry?.author ?? "",
    title: entry?.title ?? "",
    title_border: entry?.title_border ?? false,
    footer: entry?.footer ?? "",
  };
}

function entryToBlocks(entry: JournalEditorEntry | null): JournalContent {
  if (entry?.content && entry.content.length > 0) {
    return entry.content;
  }
  // Convert legacy lines to paragraph blocks for editing
  if (entry?.lines && entry.lines.length > 0) {
    return linesToBlocks(entry.lines);
  }
  // New entry: start with one empty paragraph
  return [createBlock("paragraph")];
}

function linesToBlocks(lines: string[]): JournalContent {
  const blocks: JournalContent = [];
  for (const line of lines) {
    if (line === "") {
      blocks.push(createBlock("spacer"));
    } else {
      const block = createBlock("paragraph");
      if (block.type === "paragraph") {
        block.content = [{ text: line }];
      }
      blocks.push(block);
    }
  }
  return blocks.length > 0 ? blocks : [createBlock("paragraph")];
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
    <div className="space-y-6">
      {/* Metadata */}
      <div className="bg-white border rounded p-4">
        <h3 className="text-sm font-semibold mb-3 text-gray-600">Metadaten</h3>
        <JournalMetaForm meta={meta} onChange={setMeta} />
      </div>

      {/* Block editor */}
      <div className="bg-white border rounded p-4">
        <JournalBlocksEditor blocks={blocks} onChange={setBlocks} />
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
