"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { JournalContent, DashboardJournalEntry as JournalEntry } from "./journal-editor-types";
import { JournalMetaForm } from "./JournalMetaForm";
import { JournalPreview } from "./JournalPreview";
import { RichTextEditor, type RichTextEditorHandle } from "./RichTextEditor";
import { MediaPicker, type MediaPickerResult } from "./MediaPicker";
import { blocksToHtml, htmlToBlocks } from "./journal-html-converter";
import type { JournalMeta } from "./journal-editor-utils";
import { migrateLinesToContent } from "@/lib/journal-migration";
import { HashtagEditor, type HashtagDraft, newHashtagUid } from "./HashtagEditor";

interface ProjektOption {
  slug: string;
  titel: string;
}

interface JournalEditorProps {
  entry: JournalEntry | null;
  projekte: ProjektOption[];
  onSave: (payload: {
    date: string;
    author: string | null;
    title: string | null;
    title_border: boolean;
    lines: string[];
    content: JournalContent;
    footer: string | null;
    /**
     * Optional: when omitted, the server PUT preserves the current DB
     * value (used by autosave while a hashtag draft is incomplete to
     * avoid persisting an in-progress edit as a deletion).
     */
    hashtags?: { tag: string; projekt_slug: string }[];
  }, opts?: { autoSave?: boolean }) => Promise<void>;
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
  projekte,
  onSave,
  onCancel,
  saving,
  error,
}: JournalEditorProps) {
  const [meta, setMeta] = useState<JournalMeta>(() => entryToMeta(entry));
  const [html, setHtml] = useState(() => entryToHtml(entry));
  const [hashtags, setHashtags] = useState<HashtagDraft[]>(() =>
    (entry?.hashtags ?? []).map((h) => ({ ...h, uid: newHashtagUid() }))
  );
  const [showPreview, setShowPreview] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [localError, setLocalError] = useState("");
  const editorHandleRef = useRef<RichTextEditorHandle>(null);
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

  const addHashtag = useCallback(() => {
    setHashtags((prev) => [...prev, { uid: newHashtagUid(), tag: "", projekt_slug: "" }]);
    markDirty();
  }, [markDirty]);
  const updateHashtag = useCallback((i: number, patch: Partial<HashtagDraft>) => {
    setHashtags((prev) => prev.map((h, idx) => (idx === i ? { ...h, ...patch } : h)));
    markDirty();
  }, [markDirty]);
  const removeHashtag = useCallback((i: number) => {
    setHashtags((prev) => prev.filter((_, idx) => idx !== i));
    markDirty();
  }, [markDirty]);

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

    const cleanedHashtags = hashtags
      .map((h) => ({ tag: h.tag.trim().replace(/^#+/, ""), projekt_slug: h.projekt_slug.trim() }))
      .filter((h) => h.tag && h.projekt_slug);

    return {
      date: meta.date,
      author: meta.author || null,
      title: meta.title || null,
      title_border: meta.title_border,
      lines,
      content: blocks,
      footer: meta.footer || null,
      hashtags: cleanedHashtags,
    };
  }, [meta, html, hashtags]);

  const handleSave = async () => {
    setLocalError("");
    // Match AgendaSection: block manual save if any hashtag draft is incomplete
    // (autosave still drops them silently to avoid spam)
    const incomplete = hashtags.some((h) => !h.tag.trim() || !h.projekt_slug.trim());
    if (incomplete) {
      setLocalError("Jeder Hashtag braucht einen Namen und ein verknüpftes Projekt.");
      return;
    }
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    setAutoSaveStatus("saving");
    try {
      await onSave(buildPayload());
      setAutoSaveStatus("saved");
    } catch {
      setAutoSaveStatus("unsaved");
    }
  };

  const handleAutoSave = async () => {
    setAutoSaveStatus("saving");
    try {
      // Codex P1 fix: while any hashtag draft is incomplete, omit the
      // hashtags field from the autosave payload. buildPayload() filters
      // incomplete rows and would otherwise persist an in-progress edit
      // (e.g. user clearing a tag to retype it) as a deletion of the
      // existing DB hashtags. Server PUT skips the field on undefined
      // and preserves the current DB value.
      const incomplete = hashtags.some((h) => !h.tag.trim() || !h.projekt_slug.trim());
      const payload = buildPayload();
      const finalPayload = incomplete ? { ...payload, hashtags: undefined } : payload;
      await onSave(finalPayload, { autoSave: true });
      setAutoSaveStatus("saved");
    } catch {
      setAutoSaveStatus("unsaved");
    }
  };

  doAutoSave.current = handleAutoSave;

  const handleMediaSelect = useCallback((result: MediaPickerResult) => {
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const captionHtml = result.caption
      ? `<figcaption>${esc(result.caption)}</figcaption>`
      : "";
    const src = esc(result.src);
    let figureHtml: string;
    if (result.type === "embed") {
      figureHtml = `<figure data-media="embed"><iframe src="${src}" frameborder="0" allowfullscreen></iframe>${captionHtml}</figure>`;
    } else if (result.type === "video") {
      const mimeAttr = result.mime_type ? ` data-mime="${esc(result.mime_type)}"` : "";
      figureHtml = `<figure data-media="video"><video controls src="${src}"${mimeAttr}></video>${captionHtml}</figure>`;
    } else {
      const widthAttr = result.width && result.width !== "full" ? ` data-width="${esc(result.width)}"` : "";
      figureHtml = `<figure${widthAttr}><img src="${src}" alt="" />${captionHtml}</figure>`;
    }
    editorHandleRef.current?.insertHtml(figureHtml);
    markDirty();
  }, [markDirty]);

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
            <RichTextEditor
              ref={editorHandleRef}
              value={html}
              onChange={updateHtml}
              onOpenMediaPicker={() => setShowMediaPicker(true)}
            />
          </div>

          {/* Hashtags */}
          <div className="bg-white border rounded p-4">
            <HashtagEditor
              hashtags={hashtags}
              projekte={projekte}
              onAdd={addHashtag}
              onUpdate={updateHashtag}
              onRemove={removeHashtag}
            />
          </div>
        </div>

        {/* Preview column */}
        {showPreview && (
          <div className="sticky top-6">
            <h3 className="text-sm font-semibold mb-2 text-gray-600">Vorschau</h3>
            <JournalPreview
              meta={meta}
              blocks={previewBlocks}
              hashtags={hashtags
                .map((h) => ({ tag: h.tag.trim().replace(/^#+/, ""), projekt_slug: h.projekt_slug.trim() }))
                .filter((h) => h.tag && h.projekt_slug)}
            />
          </div>
        )}
      </div>

      <MediaPicker
        open={showMediaPicker}
        onClose={() => setShowMediaPicker(false)}
        onSelect={handleMediaSelect}
      />

      {/* Error & Actions */}
      {(localError || error) && <p className="text-red-600 text-sm">{localError || error}</p>}
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
