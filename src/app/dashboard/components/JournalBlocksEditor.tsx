"use client";

import { useState, useRef, useEffect } from "react";
import type { JournalBlock, JournalContent } from "./journal-editor-types";
import { JournalBlockCard } from "./JournalBlockCard";
import {
  createBlock,
  moveBlock,
  removeBlock,
  updateBlock,
  insertBlock,
  BLOCK_TYPE_LABELS,
} from "./journal-editor-utils";

interface JournalBlocksEditorProps {
  blocks: JournalContent;
  onChange: (blocks: JournalContent) => void;
}

const blockTypes: JournalBlock["type"][] = [
  "paragraph",
  "quote",
  "heading",
  "highlight",
  "image",
  "spacer",
];

export function JournalBlocksEditor({
  blocks,
  onChange,
}: JournalBlocksEditorProps) {
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!addMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setAddMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [addMenuOpen]);

  const handleAdd = (type: JournalBlock["type"]) => {
    onChange([...blocks, createBlock(type)]);
    setAddMenuOpen(false);
  };

  const handleInsertAfter = (index: number, type: JournalBlock["type"]) => {
    onChange(insertBlock(blocks, index, createBlock(type)));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm font-medium">Inhalt</label>
        <span className="text-xs text-gray-400">
          {blocks.length} {blocks.length === 1 ? "Block" : "Blöcke"}
        </span>
      </div>

      {blocks.length === 0 && (
        <p className="text-sm text-gray-400 py-4 text-center border border-dashed rounded">
          Noch keine Blöcke. Füge einen hinzu.
        </p>
      )}

      {blocks.map((block, i) => (
        <div key={block.id} className="group">
          <JournalBlockCard
            block={block}
            index={i}
            total={blocks.length}
            onChange={(updated) => onChange(updateBlock(blocks, i, updated))}
            onRemove={() => onChange(removeBlock(blocks, i))}
            onMove={(dir) => onChange(moveBlock(blocks, i, dir))}
          />
          {/* Insert between blocks */}
          <div className="flex justify-center py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="relative">
              <InsertMenu
                onInsert={(type) => handleInsertAfter(i, type)}
              />
            </div>
          </div>
        </div>
      ))}

      {/* Add block button */}
      <div className="relative" ref={addMenuRef}>
        <button
          type="button"
          onClick={() => setAddMenuOpen(!addMenuOpen)}
          className="w-full py-2 text-sm border border-dashed rounded hover:bg-gray-50 text-gray-500 hover:text-black transition-colors"
        >
          + Block hinzufügen
        </button>
        {addMenuOpen && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded shadow-lg z-10">
            {blockTypes.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => handleAdd(type)}
                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
              >
                {BLOCK_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function InsertMenu({
  onInsert,
}: {
  onInsert: (type: JournalBlock["type"]) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-xs text-gray-300 hover:text-gray-500 px-2"
        title="Block einfügen"
      >
        +
      </button>
      {open && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 bg-white border rounded shadow-lg z-10 w-40">
          {blockTypes.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => {
                onInsert(type);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50"
            >
              {BLOCK_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
