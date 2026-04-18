"use client";

import { useEffect, useCallback, useState, useRef, useImperativeHandle, forwardRef } from "react";
import { isSafeUrl } from "@/lib/url-safety";

function sanitizeHtml(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  doc.body.querySelectorAll("*").forEach((el) => {
    const tag = el.tagName.toLowerCase();

    // Remove disallowed tags but keep children
    const allowed = [
      "p", "br", "b", "strong", "i", "em", "a",
      "h2", "h3", "blockquote",
      "figure", "img", "figcaption",
      "video", "source", "iframe",
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

    if (tag === "img") {
      const src = el.getAttribute("src")?.trim() ?? "";
      if (!src || !isSafeUrl(src)) {
        el.remove();
        return;
      }
    }

    if (tag === "iframe") {
      const src = el.getAttribute("src")?.trim() ?? "";
      const allowed_hosts = ["www.youtube.com", "player.vimeo.com"];
      try {
        const u = new URL(src);
        if (!allowed_hosts.includes(u.hostname)) { el.remove(); return; }
      } catch { el.remove(); return; }
    }

    if (tag === "video") {
      const src = el.getAttribute("src")?.trim() ?? "";
      if (src && !isSafeUrl(src)) { el.remove(); return; }
    }

    // Strip all attributes except safe ones
    for (const attr of Array.from(el.attributes)) {
      if (tag === "a" && ["href", "target", "rel", "download"].includes(attr.name)) continue;
      if (tag === "img" && ["src", "alt"].includes(attr.name)) continue;
      if (tag === "video" && ["controls", "src", "data-mime"].includes(attr.name)) continue;
      if (tag === "source" && ["src", "type"].includes(attr.name)) continue;
      if (tag === "iframe" && ["src", "allowfullscreen", "frameborder"].includes(attr.name)) continue;
      if (tag === "p" && ["data-block", "data-size"].includes(attr.name)) continue;
      if (tag === "blockquote" && attr.name === "data-attribution") continue;
      if (tag === "figure" && ["data-width", "data-media"].includes(attr.name)) continue;
      el.removeAttribute(attr.name);
    }
  });

  return doc.body.innerHTML;
}

export interface RichTextEditorHandle {
  insertHtml: (html: string) => void;
}

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  onOpenMediaPicker?: () => void;
}

type ToolbarState = {
  bold: boolean;
  italic: boolean;
  link: boolean;
  heading2: boolean;
  heading3: boolean;
  quote: boolean;
  caption: boolean;
};

const INITIAL_STATE: ToolbarState = {
  bold: false,
  italic: false,
  link: false,
  heading2: false,
  heading3: false,
  quote: false,
  caption: false,
};

export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(
  function RichTextEditor({ value, onChange, onOpenMediaPicker }, ref) {
  const editorRef = useRef<HTMLDivElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const mediaRangeRef = useRef<Range | null>(null);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [toolbar, setToolbar] = useState<ToolbarState>(INITIAL_STATE);

  const emitChange = useCallback(() => {
    if (!editorRef.current) return;
    onChange(sanitizeHtml(editorRef.current.innerHTML));
  }, [onChange]);

  useImperativeHandle(ref, () => ({
    insertHtml(html: string) {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      // Restore saved selection from before modal opened
      const sel = window.getSelection();
      if (mediaRangeRef.current && sel) {
        sel.removeAllRanges();
        sel.addRange(mediaRangeRef.current);
        mediaRangeRef.current = null;
        document.execCommand("insertHTML", false, html);
      } else if (sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
        document.execCommand("insertHTML", false, html);
      } else {
        editor.innerHTML += html;
      }
      onChange(sanitizeHtml(editor.innerHTML));
    },
  }));

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

    const captionEl = anchor?.closest("[data-block=caption]");
    setToolbar({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      link: !!anchor?.closest("a"),
      heading2: block?.tagName.toLowerCase() === "h2",
      heading3: block?.tagName.toLowerCase() === "h3",
      quote: block?.tagName.toLowerCase() === "blockquote",
      caption: !!captionEl,
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

  const toggleCaption = useCallback(() => {
    focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const node = sel.anchorNode instanceof Element
      ? sel.anchorNode
      : sel.anchorNode?.parentElement ?? null;
    const block = node?.closest("p, div");
    if (!block || !editorRef.current?.contains(block)) return;
    if (block.getAttribute("data-block") === "caption") {
      block.removeAttribute("data-block");
    } else {
      // Reset to P first if inside a heading/blockquote
      if (block.tagName !== "P") {
        document.execCommand("formatBlock", false, "P");
        // Re-find the block after formatBlock
        const newSel = window.getSelection();
        const newNode = newSel?.anchorNode instanceof Element
          ? newSel.anchorNode
          : newSel?.anchorNode?.parentElement ?? null;
        const newBlock = newNode?.closest("p");
        if (newBlock) newBlock.setAttribute("data-block", "caption");
      } else {
        block.setAttribute("data-block", "caption");
      }
    }
    emitChange();
    updateToolbar();
  }, [emitChange, focus, updateToolbar]);

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
    const trimmed = linkUrl.trim();
    if (!trimmed) {
      document.execCommand("unlink");
    } else if (!isSafeUrl(trimmed)) {
      // Reject unsafe URL — do nothing
      setShowLinkInput(false);
      setLinkUrl("");
      savedRangeRef.current = null;
      return;
    } else {
      document.execCommand("createLink", false, trimmed);
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
    "px-2 py-1 text-xs rounded hover:bg-gray-200 transition-colors disabled:opacity-30 shrink-0 min-h-11 md:min-h-0";
  const on = "bg-gray-200 font-semibold";

  return (
    <div className="border rounded overflow-hidden">
      {/* Toolbar */}
      <div className="flex gap-0.5 border-b bg-gray-50 px-1.5 py-1 overflow-x-auto md:flex-wrap md:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button type="button" onClick={() => run("bold")} className={`${btn} ${toolbar.bold ? on : ""}`} title="Fett (Cmd+B)" aria-label="Fett">
          <strong>B</strong>
        </button>
        <button type="button" onClick={() => run("italic")} className={`${btn} ${toolbar.italic ? on : ""}`} title="Kursiv (Cmd+I)" aria-label="Kursiv">
          <em>I</em>
        </button>
        <div className="w-px bg-gray-300 mx-0.5 self-stretch shrink-0" />
        <button type="button" onClick={() => toggleBlock("H2")} className={`${btn} ${toolbar.heading2 ? on : ""}`} title="Überschrift 2" aria-label="Überschrift 2">
          H2
        </button>
        <button type="button" onClick={() => toggleBlock("H3")} className={`${btn} ${toolbar.heading3 ? on : ""}`} title="Überschrift 3" aria-label="Überschrift 3">
          H3
        </button>
        <button type="button" onClick={() => toggleBlock("BLOCKQUOTE")} className={`${btn} ${toolbar.quote ? on : ""}`} title="Zitat" aria-label="Zitat">
          &ldquo;&rdquo;
        </button>
        <div className="w-px bg-gray-300 mx-0.5 self-stretch shrink-0" />
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); openLinkInput(); }}
          className={`${btn} ${toolbar.link ? on : ""}`}
          title="Link (Cmd+K)"
          aria-label="Link"
        >
          Link
        </button>
        <button type="button" onClick={() => run("unlink")} disabled={!toolbar.link} className={btn} title="Link entfernen" aria-label="Link entfernen">
          Unlink
        </button>
        {onOpenMediaPicker && (
          <>
            <div className="w-px bg-gray-300 mx-0.5 self-stretch shrink-0" />
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                // Save cursor position before modal steals focus
                const sel = window.getSelection();
                if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode ?? null)) {
                  mediaRangeRef.current = sel.getRangeAt(0).cloneRange();
                }
                onOpenMediaPicker();
              }}
              className={btn}
              title="Bild/Video einfügen"
              aria-label="Bild/Video einfügen"
            >
              Medien
            </button>
            <button type="button" onClick={toggleCaption} className={`${btn} ${toolbar.caption ? on : ""}`} title="Bildunterschrift" aria-label="Bildunterschrift">
              <span className="text-[10px]">BU</span>
            </button>
          </>
        )}
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
        className="min-h-[300px] p-4 focus:outline-none text-sm leading-relaxed [&_a]:text-blue-600 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-gray-300 [&_blockquote]:pl-3 [&_blockquote]:italic [&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-4 [&_h2]:mb-1 [&_h3]:text-sm [&_h3]:font-bold [&_h3]:mt-3 [&_h3]:mb-1 [&_[data-block=highlight]]:font-semibold [&_[data-block=caption]]:text-xs [&_[data-block=caption]]:text-gray-400 [&_figure]:my-4 [&_figcaption]:text-xs [&_figcaption]:text-gray-400 [&_figcaption]:mt-1 [&_img]:max-w-full [&_figure[data-width=half]]:w-1/2 [&_video]:max-w-full [&_iframe]:w-full [&_iframe]:aspect-video"
        style={{ minHeight: "calc(100vh - 500px)" }}
      />
    </div>
  );
});
