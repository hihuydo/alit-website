"use client";

import { useEffect, useCallback, useState, useRef } from "react";

function isSafeUrl(url: string): boolean {
  const lower = url.trim().toLowerCase();
  if (!lower) return false;
  return (
    lower.startsWith("/") ||
    lower.startsWith("#") ||
    lower.startsWith("mailto:") ||
    lower.startsWith("http://") ||
    lower.startsWith("https://")
  );
}

function sanitizeHtml(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  doc.body.querySelectorAll("*").forEach((el) => {
    const tag = el.tagName.toLowerCase();

    // Remove disallowed tags but keep children
    const allowed = [
      "p", "br", "b", "strong", "i", "em", "a",
      "h2", "h3", "blockquote", "ul", "ol", "li",
      "figure", "img", "figcaption", "hr",
    ];
    if (!allowed.includes(tag)) {
      el.replaceWith(...Array.from(el.childNodes));
      return;
    }

    if (tag === "a") {
      const href = el.getAttribute("href")?.trim() ?? "";
      if (!href || !isSafeUrl(href)) {
        el.replaceWith(...Array.from(el.childNodes));
        return;
      }
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer");
    }

    // Strip all attributes except safe ones
    for (const attr of Array.from(el.attributes)) {
      if (tag === "a" && ["href", "target", "rel"].includes(attr.name)) continue;
      if (tag === "img" && ["src", "alt"].includes(attr.name)) continue;
      el.removeAttribute(attr.name);
    }
  });

  return doc.body.innerHTML;
}

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
}

type ToolbarState = {
  bold: boolean;
  italic: boolean;
  bulletList: boolean;
  orderedList: boolean;
  link: boolean;
  heading2: boolean;
  heading3: boolean;
  quote: boolean;
};

const INITIAL_STATE: ToolbarState = {
  bold: false,
  italic: false,
  bulletList: false,
  orderedList: false,
  link: false,
  heading2: false,
  heading3: false,
  quote: false,
};

export function RichTextEditor({ value, onChange }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [toolbar, setToolbar] = useState<ToolbarState>(INITIAL_STATE);

  const emitChange = useCallback(() => {
    if (!editorRef.current) return;
    onChange(sanitizeHtml(editorRef.current.innerHTML));
  }, [onChange]);

  useEffect(() => {
    if (!editorRef.current) return;
    if (editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value;
    }
  }, [value]);

  const selectionInEditor = useCallback(() => {
    const editor = editorRef.current;
    const sel = window.getSelection();
    if (!editor || !sel || sel.rangeCount === 0) return false;
    return !!sel.anchorNode && editor.contains(sel.anchorNode);
  }, []);

  const updateToolbar = useCallback(() => {
    if (!selectionInEditor()) {
      setToolbar(INITIAL_STATE);
      return;
    }
    const sel = window.getSelection();
    const anchor =
      sel?.anchorNode instanceof Element
        ? sel.anchorNode
        : sel?.anchorNode?.parentElement ?? null;
    const block = anchor?.closest("h2, h3, blockquote");

    setToolbar({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      bulletList: document.queryCommandState("insertUnorderedList"),
      orderedList: document.queryCommandState("insertOrderedList"),
      link: !!anchor?.closest("a"),
      heading2: block?.tagName.toLowerCase() === "h2",
      heading3: block?.tagName.toLowerCase() === "h3",
      quote: block?.tagName.toLowerCase() === "blockquote",
    });
  }, [selectionInEditor]);

  useEffect(() => {
    const handler = () => updateToolbar();
    document.addEventListener("selectionchange", handler);
    return () => document.removeEventListener("selectionchange", handler);
  }, [updateToolbar]);

  const focus = useCallback(() => editorRef.current?.focus(), []);

  const run = useCallback(
    (cmd: string, val?: string) => {
      focus();
      document.execCommand(cmd, false, val);
      emitChange();
      updateToolbar();
    },
    [emitChange, focus, updateToolbar]
  );

  const toggleBlock = useCallback(
    (tag: "H2" | "H3" | "BLOCKQUOTE") => {
      focus();
      const key =
        tag === "H2" ? "heading2" : tag === "H3" ? "heading3" : "quote";
      document.execCommand(
        "formatBlock",
        false,
        toolbar[key] ? "P" : tag
      );
      emitChange();
      updateToolbar();
    },
    [emitChange, focus, toolbar, updateToolbar]
  );

  const openLinkInput = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !selectionInEditor()) return;
    savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    const anchor =
      sel.anchorNode instanceof Element
        ? sel.anchorNode.closest("a")
        : sel.anchorNode?.parentElement?.closest("a") ?? null;
    setLinkUrl(anchor?.getAttribute("href") ?? "https://");
    setShowLinkInput(true);
    setTimeout(() => linkInputRef.current?.focus(), 0);
  }, [selectionInEditor]);

  const restoreSelection = useCallback(() => {
    if (!savedRangeRef.current) return;
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(savedRangeRef.current);
  }, []);

  const applyLink = useCallback(() => {
    restoreSelection();
    focus();
    if (!linkUrl.trim()) {
      document.execCommand("unlink");
    } else {
      document.execCommand("createLink", false, linkUrl.trim());
    }
    setShowLinkInput(false);
    setLinkUrl("");
    savedRangeRef.current = null;
    emitChange();
    updateToolbar();
  }, [emitChange, focus, linkUrl, restoreSelection, updateToolbar]);

  const cancelLink = useCallback(() => {
    setShowLinkInput(false);
    setLinkUrl("");
    savedRangeRef.current = null;
    focus();
  }, [focus]);

  const btn =
    "px-2 py-1 text-xs rounded hover:bg-gray-200 transition-colors disabled:opacity-30";
  const on = "bg-gray-200 font-semibold";

  return (
    <div className="border rounded overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-0.5 border-b bg-gray-50 px-1.5 py-1">
        <button type="button" onClick={() => run("bold")} className={`${btn} ${toolbar.bold ? on : ""}`} title="Fett (Cmd+B)">
          <strong>B</strong>
        </button>
        <button type="button" onClick={() => run("italic")} className={`${btn} ${toolbar.italic ? on : ""}`} title="Kursiv (Cmd+I)">
          <em>I</em>
        </button>
        <div className="w-px bg-gray-300 mx-0.5 self-stretch" />
        <button type="button" onClick={() => toggleBlock("H2")} className={`${btn} ${toolbar.heading2 ? on : ""}`} title="Überschrift 2">
          H2
        </button>
        <button type="button" onClick={() => toggleBlock("H3")} className={`${btn} ${toolbar.heading3 ? on : ""}`} title="Überschrift 3">
          H3
        </button>
        <button type="button" onClick={() => toggleBlock("BLOCKQUOTE")} className={`${btn} ${toolbar.quote ? on : ""}`} title="Zitat">
          &ldquo;&rdquo;
        </button>
        <div className="w-px bg-gray-300 mx-0.5 self-stretch" />
        <button type="button" onClick={() => run("insertUnorderedList")} className={`${btn} ${toolbar.bulletList ? on : ""}`} title="Liste">
          &bull;
        </button>
        <button type="button" onClick={() => run("insertOrderedList")} className={`${btn} ${toolbar.orderedList ? on : ""}`} title="Nummerierte Liste">
          1.
        </button>
        <div className="w-px bg-gray-300 mx-0.5 self-stretch" />
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); openLinkInput(); }}
          className={`${btn} ${toolbar.link ? on : ""}`}
          title="Link (Cmd+K)"
        >
          Link
        </button>
        <button type="button" onClick={() => run("unlink")} disabled={!toolbar.link} className={btn} title="Link entfernen">
          Unlink
        </button>
      </div>

      {/* Link input */}
      {showLinkInput && (
        <div className="flex items-center gap-2 border-b bg-gray-50 px-3 py-2">
          <input
            ref={linkInputRef}
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); applyLink(); }
              if (e.key === "Escape") cancelLink();
            }}
            placeholder="https://..."
            className="flex-1 px-2 py-1 text-sm border rounded focus:outline-none"
          />
          <button type="button" onClick={applyLink} className="px-3 py-1 text-sm bg-black text-white rounded">OK</button>
          <button type="button" onClick={cancelLink} className="px-3 py-1 text-sm border rounded hover:bg-gray-100">Abbrechen</button>
        </div>
      )}

      {/* Editable area */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={emitChange}
        onBlur={emitChange}
        className="min-h-[300px] p-4 focus:outline-none text-sm leading-relaxed [&_a]:text-blue-600 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-gray-300 [&_blockquote]:pl-3 [&_blockquote]:italic [&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-4 [&_h2]:mb-1 [&_h3]:text-sm [&_h3]:font-bold [&_h3]:mt-3 [&_h3]:mb-1"
        style={{ minHeight: "calc(100vh - 500px)" }}
      />
    </div>
  );
}
