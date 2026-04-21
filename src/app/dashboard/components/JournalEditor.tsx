"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { JournalContent, DashboardJournalEntry as JournalEntry } from "./journal-editor-types";
import { JournalPreview } from "./JournalPreview";
import { RichTextEditor, type RichTextEditorHandle } from "./RichTextEditor";
import { MediaPicker, type MediaPickerResult } from "./MediaPicker";
import { blocksToHtml, htmlToBlocks } from "./journal-html-converter";
import { HashtagEditor, type HashtagDraft, newHashtagUid } from "./HashtagEditor";
import type { Locale } from "@/lib/i18n-field";
import { useDirty } from "../DirtyContext";
import {
  datumToIsoInput,
  parseIsoDate,
  formatCanonicalDatum,
  isCanonicalDatum,
} from "@/lib/agenda-datetime";

type I18nString = { de?: string | null; fr?: string | null };
type I18nContent = { de?: JournalContent | null; fr?: JournalContent | null };

interface ProjektOption {
  slug_de: string;
  titel: string;
}

export interface JournalSavePayload {
  date: string;
  /** Canonical DD.MM.YYYY or null. Drives public-list sort; display
   *  still comes from `date` freitext. */
  datum: string | null;
  author: string | null;
  title_border: boolean;
  title_i18n: I18nString;
  content_i18n: I18nContent;
  footer_i18n: I18nString;
  /** Optional: when omitted, the server PUT preserves current DB hashtags
   *  (used by autosave while a hashtag draft is incomplete). */
  hashtags?: { tag_i18n: { de: string; fr: string | null }; projekt_slug: string }[];
}

interface JournalEditorProps {
  entry: JournalEntry | null;
  projekte: ProjektOption[];
  onSave: (payload: JournalSavePayload, opts?: { autoSave?: boolean; signal?: AbortSignal }) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
  error: string;
  onDirtyChange?: (dirty: boolean) => void;
}

const LOCALES: readonly Locale[] = ["de", "fr"];

interface Shared {
  date: string;
  /** Canonical DD.MM.YYYY; empty string means "not set". */
  datum: string;
  author: string;
  title_border: boolean;
}
type PerLocaleForm = {
  title: string;
  footer: string;
  html: string;
};

function entryToShared(entry: JournalEntry | null): Shared {
  // Preserve the raw DB value only when it is already canonical — legacy
  // rows without a canonical datum open the picker empty, with a hint
  // showing the current DB freitext so the admin can transfer it.
  const datumCanonical = entry?.datum && isCanonicalDatum(entry.datum) ? entry.datum : "";
  return {
    date: entry?.date ?? "",
    datum: datumCanonical,
    author: entry?.author ?? "",
    title_border: entry?.title_border ?? false,
  };
}

function initialPerLocale(entry: JournalEntry | null, loc: Locale): PerLocaleForm {
  const titleI18n = entry?.title_i18n;
  const contentI18n = entry?.content_i18n;
  const footerI18n = entry?.footer_i18n;
  const locContent = contentI18n?.[loc];
  const html =
    locContent && Array.isArray(locContent) && locContent.length > 0
      ? blocksToHtml(locContent)
      : "";
  return {
    title: titleI18n?.[loc] ?? "",
    footer: footerI18n?.[loc] ?? "",
    html,
  };
}

export function JournalEditor({
  entry,
  projekte,
  onSave,
  onCancel,
  saving,
  error,
  onDirtyChange,
}: JournalEditorProps) {
  const [shared, setShared] = useState<Shared>(() => entryToShared(entry));
  const [formDe, setFormDe] = useState<PerLocaleForm>(() => initialPerLocale(entry, "de"));
  const [formFr, setFormFr] = useState<PerLocaleForm>(() => initialPerLocale(entry, "fr"));
  const [editingLocale, setEditingLocale] = useState<Locale>("de");
  const [hashtags, setHashtags] = useState<HashtagDraft[]>(() =>
    (entry?.hashtags ?? []).map((h) => ({
      uid: newHashtagUid(),
      tag: typeof h.tag_i18n?.de === "string" ? h.tag_i18n.de : (h.tag ?? ""),
      tag_fr: typeof h.tag_i18n?.fr === "string" ? h.tag_i18n.fr : "",
      projekt_slug: h.projekt_slug,
    })),
  );
  const [showPreview, setShowPreview] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [localError, setLocalError] = useState("");
  const editorHandleRefs = useRef<Record<Locale, RichTextEditorHandle | null>>({ de: null, fr: null });
  const [autoSaveStatus, setAutoSaveStatus] = useState<"saved" | "unsaved" | "saving">("saved");
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveController = useRef<AbortController | null>(null);
  const isEditing = !!entry;
  // hasEditsRef tracks whether the user has touched any field since mount.
  // We notify the parent synchronously from markDirty (no state + useEffect
  // hop) so the central dirty-guard is updated BEFORE a subsequent rapid
  // click on a tab / logout handler runs. Fixes a data-loss race flagged by
  // Codex PR #48 [P1]: effect-lagged propagation let the first keystroke
  // miss the guard if the user clicked a tab within the same frame.
  const hasEditsRef = useRef(false);
  const onDirtyChangeRef = useRef(onDirtyChange);
  useEffect(() => {
    onDirtyChangeRef.current = onDirtyChange;
  });

  const doAutoSave = useRef<() => void>(() => {});

  const markDirty = useCallback(() => {
    if (!hasEditsRef.current) {
      hasEditsRef.current = true;
      onDirtyChangeRef.current?.(true);
    }
    if (!isEditing) return;
    setAutoSaveStatus("unsaved");
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      doAutoSave.current();
    }, 3000);
  }, [isEditing]);

  const setSharedField = useCallback(
    <K extends keyof Shared>(key: K, value: Shared[K]) => {
      setShared((s) => ({ ...s, [key]: value }));
      markDirty();
    },
    [markDirty],
  );

  const setPerLocaleField = useCallback(
    <K extends keyof PerLocaleForm>(loc: Locale, key: K, value: PerLocaleForm[K]) => {
      const setter = loc === "de" ? setFormDe : setFormFr;
      setter((f) => ({ ...f, [key]: value }));
      markDirty();
    },
    [markDirty],
  );

  const updateHtmlDe = useCallback(
    (h: string) => setPerLocaleField("de", "html", h),
    [setPerLocaleField],
  );
  const updateHtmlFr = useCallback(
    (h: string) => setPerLocaleField("fr", "html", h),
    [setPerLocaleField],
  );

  const addHashtag = useCallback(() => {
    setHashtags((prev) => [...prev, { uid: newHashtagUid(), tag: "", tag_fr: "", projekt_slug: "" }]);
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
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      // Abort any in-flight autosave so "Verwerfen" / tab-switch cancels the
      // pending fetch instead of letting it commit to the DB.
      autoSaveController.current?.abort();
      // Release the dirty flag when the editor unmounts (save success,
      // cancel, or discard-confirm). Synchronous path — same reason as
      // markDirty above.
      if (hasEditsRef.current) {
        onDirtyChangeRef.current?.(false);
      }
    };
  }, []);

  // Flush the pending 3s-autosave timer when the user clicks "Zurück" on the
  // DirtyContext confirm modal. Only the timer-pending case is flushable —
  // once handleAutoSave is in-flight the request owns itself and resolves
  // asynchronously (documented in spec v3.2).
  const { registerFlushHandler } = useDirty();
  useEffect(() => {
    return registerFlushHandler("journal", () => {
      if (autoSaveTimer.current === null) return;
      clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = null;
      doAutoSave.current();
    });
  }, [registerFlushHandler]);

  const liveCompletion = useMemo(() => ({
    de: htmlToBlocks(formDe.html).length > 0,
    fr: htmlToBlocks(formFr.html).length > 0,
  }), [formDe.html, formFr.html]);

  const buildPayload = useCallback((): JournalSavePayload => {
    const cleanedHashtags = hashtags
      .map((h) => {
        const de = h.tag.trim().replace(/^#+/, "");
        const fr = (h.tag_fr ?? "").trim().replace(/^#+/, "");
        return {
          tag_i18n: { de, fr: fr || null },
          projekt_slug: h.projekt_slug.trim(),
        };
      })
      .filter((h) => h.tag_i18n.de && h.projekt_slug);

    return {
      date: shared.date,
      datum: shared.datum || null,
      author: shared.author || null,
      title_border: shared.title_border,
      title_i18n: { de: formDe.title.trim() || null, fr: formFr.title.trim() || null },
      content_i18n: {
        de: htmlToBlocks(formDe.html),
        fr: htmlToBlocks(formFr.html),
      },
      footer_i18n: { de: formDe.footer.trim() || null, fr: formFr.footer.trim() || null },
      hashtags: cleanedHashtags,
    };
  }, [shared, formDe, formFr, hashtags]);

  const handleSave = async () => {
    setLocalError("");
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
    // Supersede any earlier in-flight autosave.
    autoSaveController.current?.abort();
    const controller = new AbortController();
    autoSaveController.current = controller;
    setAutoSaveStatus("saving");
    try {
      // While a hashtag draft is incomplete, omit the hashtags field from the
      // autosave payload — server PUT skips it on undefined and preserves the
      // current DB value. Prevents partial-edit from wiping existing hashtags.
      const incomplete = hashtags.some((h) => !h.tag.trim() || !h.projekt_slug.trim());
      const payload = buildPayload();
      const finalPayload = incomplete ? { ...payload, hashtags: undefined } : payload;
      await onSave(finalPayload, { autoSave: true, signal: controller.signal });
      // Only update status if this controller is still the current one and
      // wasn't aborted — otherwise a later autosave already advanced state.
      if (autoSaveController.current === controller && !controller.signal.aborted) {
        setAutoSaveStatus("saved");
      }
    } catch {
      if (autoSaveController.current === controller && !controller.signal.aborted) {
        setAutoSaveStatus("unsaved");
      }
    }
  };

  useEffect(() => {
    doAutoSave.current = handleAutoSave;
  });

  const handleMediaSelect = useCallback((result: MediaPickerResult) => {
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const captionHtml = result.caption ? `<figcaption>${esc(result.caption)}</figcaption>` : "";
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
    editorHandleRefs.current[editingLocale]?.insertHtml(figureHtml);
    markDirty();
  }, [markDirty, editingLocale]);

  const previewBlocks = useMemo(() => {
    if (!showPreview) return [];
    const html = editingLocale === "de" ? formDe.html : formFr.html;
    return htmlToBlocks(html);
  }, [showPreview, formDe.html, formFr.html, editingLocale]);

  const previewMeta = useMemo(() => ({
    date: shared.date,
    author: shared.author,
    title: (editingLocale === "de" ? formDe.title : formFr.title),
    title_border: shared.title_border,
    footer: (editingLocale === "de" ? formDe.footer : formFr.footer),
  }), [shared, formDe, formFr, editingLocale]);

  const previewHashtags = useMemo(() => hashtags
    .map((h) => {
      const label = (editingLocale === "fr" && h.tag_fr?.trim() ? h.tag_fr : h.tag).trim().replace(/^#+/, "");
      return { tag: label, projekt_slug: h.projekt_slug.trim() };
    })
    .filter((h) => h.tag && h.projekt_slug), [hashtags, editingLocale]);

  const currentForm = editingLocale === "de" ? formDe : formFr;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
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
          {/* Shared metadata */}
          <div className="bg-white border rounded p-4">
            <h3 className="text-sm font-semibold mb-3 text-gray-600">Metadaten</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="journal-datum-input" className="block text-sm font-medium mb-1">
                    Datum <span className="text-gray-400 font-normal">(Sortierung)</span>
                  </label>
                  <input
                    id="journal-datum-input"
                    type="date"
                    value={datumToIsoInput(shared.datum) ?? ""}
                    onChange={(e) => {
                      const parsed = parseIsoDate(e.target.value);
                      setSharedField("datum", parsed ? formatCanonicalDatum(parsed) : "");
                    }}
                    aria-describedby={
                      entry && entry.datum && !isCanonicalDatum(entry.datum)
                        ? "journal-datum-hint"
                        : undefined
                    }
                    className="w-full px-3 py-2 border rounded text-sm"
                  />
                  {entry && entry.datum && !isCanonicalDatum(entry.datum) && (
                    <p id="journal-datum-hint" className="text-xs text-red-600 mt-1">
                      Alter DB-Wert: „{entry.datum}" — bitte Datum neu wählen.
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="journal-date-freitext" className="block text-sm font-medium mb-1">
                    Datum <span className="text-gray-400 font-normal">(Anzeige — Freitext)</span>
                  </label>
                  <input
                    id="journal-date-freitext"
                    value={shared.date}
                    onChange={(e) => setSharedField("date", e.target.value)}
                    className="w-full px-3 py-2 border rounded text-sm"
                    placeholder="z.B. 13. Juli 2020"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Autor*in</label>
                  <input
                    value={shared.author}
                    onChange={(e) => setSharedField("author", e.target.value)}
                    className="w-full px-3 py-2 border rounded text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Locale tabs + per-locale fields (title, footer, content) */}
          <div className="bg-white border rounded p-4">
            <div className="flex gap-1 border-b" role="tablist" aria-label="Sprache">
              {LOCALES.map((loc) => {
                const active = loc === editingLocale;
                const done = liveCompletion[loc];
                return (
                  <button
                    key={loc}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    data-testid={`locale-tab-${loc}`}
                    onClick={() => setEditingLocale(loc)}
                    className={`px-4 py-2 -mb-px border-b-2 text-sm font-medium transition-colors ${
                      active
                        ? "border-black text-black"
                        : "border-transparent text-gray-500 hoverable:hover:text-gray-800"
                    }`}
                  >
                    <span>{loc.toUpperCase()}</span>
                    <span className="ml-2 text-xs text-gray-400" aria-hidden>
                      {done ? "✓" : "–"}
                    </span>
                  </button>
                );
              })}
            </div>

            {LOCALES.map((loc) => {
              const f = loc === "de" ? formDe : formFr;
              return (
                <div key={loc} hidden={loc !== editingLocale} className="space-y-4 pt-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Titel ({loc.toUpperCase()})</label>
                    <input
                      value={f.title}
                      onChange={(e) => setPerLocaleField(loc, "title", e.target.value)}
                      className="w-full px-3 py-2 border rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Inhalt ({loc.toUpperCase()})</label>
                    <RichTextEditor
                      ref={(handle) => { editorHandleRefs.current[loc] = handle; }}
                      value={f.html}
                      onChange={loc === "de" ? updateHtmlDe : updateHtmlFr}
                      onOpenMediaPicker={() => setShowMediaPicker(true)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Footer ({loc.toUpperCase()})</label>
                    <textarea
                      value={f.footer}
                      onChange={(e) => setPerLocaleField(loc, "footer", e.target.value)}
                      className="w-full px-3 py-2 border rounded text-sm resize-y"
                      rows={2}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Shared hashtags (per-hashtag DE/FR labels via showI18n) */}
          <div className="bg-white border rounded p-4">
            <HashtagEditor
              hashtags={hashtags}
              projekte={projekte}
              onAdd={addHashtag}
              onUpdate={updateHashtag}
              onRemove={removeHashtag}
              showI18n
            />
          </div>
        </div>

        {showPreview && (
          <div className="sticky top-6">
            <h3 className="text-sm font-semibold mb-2 text-gray-600">Vorschau ({editingLocale.toUpperCase()})</h3>
            <JournalPreview
              meta={previewMeta}
              blocks={previewBlocks}
              hashtags={previewHashtags}
            />
          </div>
        )}
      </div>

      <MediaPicker
        open={showMediaPicker}
        onClose={() => setShowMediaPicker(false)}
        onSelect={handleMediaSelect}
      />

      {(localError || error) && <p className="text-red-600 text-sm">{localError || error}</p>}
      <div className="flex gap-3 justify-end">
        <button type="button" onClick={onCancel} className="px-4 py-2 border rounded hover:bg-gray-50 text-sm">Abbrechen</button>
        <button type="button" onClick={handleSave} disabled={saving} className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 disabled:opacity-50 text-sm">
          {saving ? "..." : "Speichern"}
        </button>
      </div>
    </div>
  );
}
