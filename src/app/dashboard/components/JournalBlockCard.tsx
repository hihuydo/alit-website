"use client";

import { useRef, useState, useCallback } from "react";
import type { JournalBlock } from "./journal-editor-types";
import {
  isTextBlock,
  getBlockText,
  parseInlineText,
  wrapSelection,
  insertLink,
  BLOCK_TYPE_LABELS,
} from "./journal-editor-utils";

interface JournalBlockCardProps {
  block: JournalBlock;
  index: number;
  total: number;
  onChange: (block: JournalBlock) => void;
  onRemove: () => void;
  onMove: (direction: "up" | "down") => void;
}

export function JournalBlockCard({
  block,
  index,
  total,
  onChange,
  onRemove,
  onMove,
}: JournalBlockCardProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [showLinkInput, setShowLinkInput] = useState(false);

  const handleTextChange = useCallback(
    (raw: string) => {
      if (!isTextBlock(block)) return;
      const content = parseInlineText(raw);
      onChange({ ...block, content } as JournalBlock);
    },
    [block, onChange]
  );

  const applyMark = useCallback(
    (mark: "bold" | "italic" | "highlight") => {
      const ta = textareaRef.current;
      if (!ta) return;
      const text = ta.value;
      const result = wrapSelection(text, ta.selectionStart, ta.selectionEnd, mark);
      handleTextChange(result.text);
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(result.selectionStart, result.selectionEnd);
      });
    },
    [handleTextChange]
  );

  const applyLink = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta || !linkUrl.trim()) return;
    const text = ta.value;
    const result = insertLink(text, ta.selectionStart, ta.selectionEnd, linkUrl.trim());
    handleTextChange(result.text);
    setShowLinkInput(false);
    setLinkUrl("");
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  }, [handleTextChange, linkUrl]);

  const textValue = isTextBlock(block) ? getBlockText(block) : "";

  return (
    <div className="border rounded bg-white">
      {/* Header: type label + actions */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-gray-50 text-sm">
        <span className="font-medium text-gray-600 min-w-0">
          {BLOCK_TYPE_LABELS[block.type]}
        </span>

        {/* Heading level selector */}
        {block.type === "heading" && (
          <select
            value={block.level}
            onChange={(e) =>
              onChange({ ...block, level: Number(e.target.value) as 2 | 3 })
            }
            className="text-xs border rounded px-1 py-0.5"
          >
            <option value={2}>H2</option>
            <option value={3}>H3</option>
          </select>
        )}

        {/* Quote attribution */}
        {block.type === "quote" && (
          <input
            value={block.attribution ?? ""}
            onChange={(e) =>
              onChange({ ...block, attribution: e.target.value || undefined })
            }
            placeholder="Zuschreibung"
            className="text-xs border rounded px-2 py-0.5 w-32"
          />
        )}

        <div className="flex-1" />

        <button
          type="button"
          onClick={() => onMove("up")}
          disabled={index === 0}
          className="p-1 text-gray-400 hover:text-black disabled:opacity-20"
          title="Nach oben"
        >
          &uarr;
        </button>
        <button
          type="button"
          onClick={() => onMove("down")}
          disabled={index === total - 1}
          className="p-1 text-gray-400 hover:text-black disabled:opacity-20"
          title="Nach unten"
        >
          &darr;
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="p-1 text-red-400 hover:text-red-600"
          title="Block entfernen"
        >
          &times;
        </button>
      </div>

      {/* Body */}
      <div className="p-3">
        {isTextBlock(block) && (
          <>
            {/* Inline toolbar */}
            <div className="flex items-center gap-1 mb-2">
              <button
                type="button"
                onClick={() => applyMark("bold")}
                className="px-2 py-0.5 text-xs border rounded hover:bg-gray-100 font-bold"
                title="Fett (**text**)"
              >
                B
              </button>
              <button
                type="button"
                onClick={() => applyMark("italic")}
                className="px-2 py-0.5 text-xs border rounded hover:bg-gray-100 italic"
                title="Kursiv (*text*)"
              >
                I
              </button>
              <button
                type="button"
                onClick={() => applyMark("highlight")}
                className="px-2 py-0.5 text-xs border rounded hover:bg-gray-100"
                title="Hervorhebung (==text==)"
              >
                H
              </button>
              <button
                type="button"
                onClick={() => setShowLinkInput(!showLinkInput)}
                className={`px-2 py-0.5 text-xs border rounded hover:bg-gray-100 ${showLinkInput ? "bg-gray-200" : ""}`}
                title="Link [text](url)"
              >
                Link
              </button>
              {showLinkInput && (
                <div className="flex items-center gap-1 ml-1">
                  <input
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="https://..."
                    className="text-xs border rounded px-2 py-0.5 w-48"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        applyLink();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={applyLink}
                    className="text-xs px-2 py-0.5 bg-black text-white rounded"
                  >
                    OK
                  </button>
                </div>
              )}
            </div>

            <textarea
              ref={textareaRef}
              value={textValue}
              onChange={(e) => handleTextChange(e.target.value)}
              className="w-full px-3 py-2 border rounded font-mono text-sm resize-y min-h-[60px]"
              rows={3}
            />
          </>
        )}

        {block.type === "image" && (
          <div className="space-y-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Bild-URL</label>
              <input
                value={block.src}
                onChange={(e) => onChange({ ...block, src: e.target.value })}
                className="w-full px-3 py-2 border rounded text-sm"
                placeholder="/uploads/journal/..."
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Alt-Text</label>
                <input
                  value={block.alt ?? ""}
                  onChange={(e) =>
                    onChange({ ...block, alt: e.target.value || undefined })
                  }
                  className="w-full px-3 py-2 border rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Breite</label>
                <select
                  value={block.width ?? "full"}
                  onChange={(e) =>
                    onChange({
                      ...block,
                      width: e.target.value as "full" | "half",
                    })
                  }
                  className="w-full px-3 py-2 border rounded text-sm"
                >
                  <option value="full">Volle Breite</option>
                  <option value="half">Halbe Breite</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Bildunterschrift</label>
              <input
                value={block.caption ?? ""}
                onChange={(e) =>
                  onChange({ ...block, caption: e.target.value || undefined })
                }
                className="w-full px-3 py-2 border rounded text-sm"
              />
            </div>
            {block.src && (
              <img
                src={block.src}
                alt={block.alt ?? ""}
                className="max-h-32 rounded border object-contain"
              />
            )}
          </div>
        )}

        {block.type === "spacer" && (
          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-500">Größe:</label>
            {(["s", "m", "l"] as const).map((size) => (
              <label key={size} className="flex items-center gap-1 text-sm">
                <input
                  type="radio"
                  name={`spacer-${block.id}`}
                  checked={(block.size ?? "m") === size}
                  onChange={() => onChange({ ...block, size })}
                />
                {size === "s" ? "Klein" : size === "m" ? "Mittel" : "Groß"}
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
