"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { DeleteConfirm } from "./DeleteConfirm";
import { ListRow } from "./ListRow";
import { RichTextEditor, type RichTextEditorHandle } from "./RichTextEditor";
import { MediaPicker, type MediaPickerResult } from "./MediaPicker";
import { blocksToHtml, htmlToBlocks } from "./journal-html-converter";
import type { JournalContent } from "@/lib/journal-types";
import { AgendaItem as AgendaItemPreview } from "@/components/AgendaItem";
import { useDirty } from "../DirtyContext";
import { dashboardFetch } from "../lib/dashboardFetch";
import { dashboardStrings } from "../i18n";
import { HashtagEditor, type HashtagDraft, newHashtagUid } from "./HashtagEditor";
import type { Locale } from "@/lib/i18n-field";
import type { ProjektSlugMap } from "@/lib/projekt-slug";
import { InstagramExportModal } from "./InstagramExportModal";
import { isLocaleEmpty, type AgendaItemForExport } from "@/lib/instagram-post";
import {
  datumToIsoInput,
  zeitToIsoInput,
  formatCanonicalDatum,
  formatCanonicalZeit,
  parseIsoDate,
  parseIsoTime,
  isCanonicalDatum,
  isCanonicalZeit,
} from "@/lib/agenda-datetime";

type I18nString = { de?: string | null; fr?: string | null };
type I18nContent = { de?: JournalContent | null; fr?: JournalContent | null };

export interface AgendaItem {
  id: number;
  datum: string;
  zeit: string;
  ort_url: string | null;
  hashtags: { tag_i18n?: { de?: string; fr?: string | null }; tag?: string; projekt_slug: string }[] | null;
  images: { public_id: string; orientation: "portrait" | "landscape"; width?: number | null; height?: number | null; alt?: string | null }[] | null;
  // Sprint Agenda Bilder-Grid 2.0: persistierte UI-Einstellungen pro Eintrag.
  images_grid_columns: number;
  images_fit: "cover" | "contain";
  title_i18n: I18nString | null;
  lead_i18n: I18nString | null;
  ort_i18n: I18nString | null;
  content_i18n: I18nContent | null;
  completion: { de: boolean; fr: boolean };
}

interface ImageDraft {
  public_id: string;
  orientation: "portrait" | "landscape";
  width: number | null;
  height: number | null;
  alt: string;
}

interface ProjektOption {
  slug_de: string;
  titel: string;
}

const LOCALES: readonly Locale[] = ["de", "fr"];

const emptyForm = {
  datum: "",
  zeit: "",
  ort_url: "",
  hashtags: [] as HashtagDraft[],
  images: [] as ImageDraft[],
  // Persistierbare Felder im form-Snapshot für DirtyContext.
  // visibleSlotCount + slotErrors leben AUSSERHALB form (separater useState),
  // sonst poluttet jeder "+ Zeile"-Click den Snapshot-Diff (Sonnet R5 C-1).
  images_grid_columns: 1,
  images_fit: "cover" as "cover" | "contain",
  titel: { de: "", fr: "" } as Record<Locale, string>,
  lead: { de: "", fr: "" } as Record<Locale, string>,
  ort: { de: "", fr: "" } as Record<Locale, string>,
  html: { de: "", fr: "" } as Record<Locale, string>,
};

function CompletionBadge({ locale, done }: { locale: Locale; done: boolean }) {
  const label = locale.toUpperCase();
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${
        done
          ? "bg-green-50 text-green-700 border-green-200"
          : "bg-gray-50 text-gray-400 border-gray-200"
      }`}
      aria-label={done ? `${label} übersetzt` : `${label} fehlt`}
    >
      <span>{label}</span>
      <span aria-hidden>{done ? "✓" : "–"}</span>
    </span>
  );
}

export function AgendaSection({ initial, projekte }: { initial: AgendaItem[]; projekte: ProjektOption[] }) {
  // Preview-local projekt-slug map. Without urlSlug in ProjektOption (dashboard
  // doesn't need locale resolution), slug_de is also the urlSlug for preview
  // purposes — the preview defaults to locale "de" and there's no /fr/ context.
  const previewProjektSlugMap = useMemo<ProjektSlugMap>(() => {
    const map: ProjektSlugMap = {};
    for (const p of projekte) {
      map[p.slug_de] = { slug_de: p.slug_de, slug_fr: null, urlSlug: p.slug_de };
    }
    return map;
  }, [projekte]);
  const [items, setItems] = useState(initial);
  const [editing, setEditing] = useState<AgendaItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<AgendaItem | null>(null);
  const [instagramItem, setInstagramItem] = useState<AgendaItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editingLocale, setEditingLocale] = useState<Locale>("de");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  // Sprint Agenda Bilder-Grid 2.0: Slot-Editor State (AUSSERHALB form, kein
  // DirtyContext-Pollution).
  const [visibleSlotCount, setVisibleSlotCount] = useState(1);
  const [slotErrors, setSlotErrors] = useState<Record<number, string | null>>({});
  // Target-Slot-Index für MediaPicker. !== null = Picker im Slot-Fill-Mode
  // (statt Rich-Text-Insert-Mode). onClose resettet auf null.
  const [pickerTargetSlot, setPickerTargetSlot] = useState<number | null>(null);
  // Drag-Source-Index während HTML5-Drag (vanilla, kein Library — wie
  // JournalSection.tsx). null wenn kein Drag aktiv.
  const dragSourceRef = useRef<number | null>(null);
  const editorHandleRefs = useRef<Record<Locale, RichTextEditorHandle | null>>({ de: null, fr: null });

  const reload = useCallback(async () => {
    const res = await fetch("/api/dashboard/agenda/");
    const data = await res.json();
    if (data.success) setItems(data.data);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Snapshot of form state right after open — used to compute `isEdited`
  // so the dirty-warning only fires when the user actually changed something,
  // not just by opening an editor.
  const initialFormRef = useRef<string>("");

  const openCreate = () => {
    setForm(emptyForm);
    initialFormRef.current = JSON.stringify(emptyForm);
    setVisibleSlotCount(1);
    setSlotErrors({});
    setEditingLocale("de");
    setError("");
    setCreating(true);
  };

  const openEdit = (item: AgendaItem) => {
    const deContent = item.content_i18n?.de ?? null;
    const frContent = item.content_i18n?.fr ?? null;
    // Legacy-Row-Adapter (Codex Spec-R1 [Correctness] 2): when the stored
    // datum/zeit is off-spec, the picker opens empty + hint is rendered +
    // save is blocked until admin picks a valid value. The raw DB-string
    // is NOT preserved — the admin MUST correct to save. That avoids both
    // silent-overwrite and silent-server-400 risks.
    const datumForForm = isCanonicalDatum(item.datum) ? item.datum : "";
    const zeitForForm = isCanonicalZeit(item.zeit) ? item.zeit : "";
    // Defensive: legacy DB-Rows könnten noch fehlende neue Spalten haben
    // (additive-Migration ist idempotent + DEFAULT'd, sollte aber nie crash'en).
    const cols = typeof item.images_grid_columns === "number" ? item.images_grid_columns : 1;
    const fit: "cover" | "contain" = item.images_fit === "contain" ? "contain" : "cover";
    const nextForm = {
      datum: datumForForm,
      zeit: zeitForForm,
      ort_url: item.ort_url ?? "",
      hashtags: (item.hashtags ?? []).map((h) => ({
        uid: newHashtagUid(),
        tag: typeof h.tag_i18n?.de === "string" ? h.tag_i18n.de : (h.tag ?? ""),
        tag_fr: typeof h.tag_i18n?.fr === "string" ? h.tag_i18n.fr : "",
        projekt_slug: h.projekt_slug,
      })),
      // null-Guard PFLICHT: DB-Type erlaubt null, Form-State braucht non-null
      // Array für Slot-Grid-Map (Sonnet R2 F-09). Codex R2 confirmed.
      images: (item.images ?? []).map((img) => ({
        public_id: img.public_id,
        orientation: img.orientation,
        width: img.width ?? null,
        height: img.height ?? null,
        alt: img.alt ?? "",
      })),
      images_grid_columns: cols,
      images_fit: fit,
      titel: {
        de: item.title_i18n?.de ?? "",
        fr: item.title_i18n?.fr ?? "",
      },
      lead: {
        de: item.lead_i18n?.de ?? "",
        fr: item.lead_i18n?.fr ?? "",
      },
      ort: {
        de: item.ort_i18n?.de ?? "",
        fr: item.ort_i18n?.fr ?? "",
      },
      html: {
        de: deContent && deContent.length > 0 ? blocksToHtml(deContent) : "",
        fr: frContent && frContent.length > 0 ? blocksToHtml(frContent) : "",
      },
    };
    setForm(nextForm);
    initialFormRef.current = JSON.stringify(nextForm);
    // Init = nur cols (NICHT max(cols, images.length)) — Display-Formel
    // Math.max(visibleSlotCount, images.length) zeigt eh alle Bilder.
    setVisibleSlotCount(cols);
    setSlotErrors({});
    setEditingLocale("de");
    setError("");
    setEditing(item);
  };

  const updateHtmlDe = useCallback(
    (h: string) => setForm((f) => ({ ...f, html: { ...f.html, de: h } })),
    [],
  );
  const updateHtmlFr = useCallback(
    (h: string) => setForm((f) => ({ ...f, html: { ...f.html, fr: h } })),
    [],
  );

  const liveCompletion = useMemo(() => ({
    de: htmlToBlocks(form.html.de).length > 0,
    fr: htmlToBlocks(form.html.fr).length > 0,
  }), [form.html.de, form.html.fr]);

  // Probe Bild via URL-Load für orientation/width/height. Reused von OS-Drop
  // und MediaPicker-Slot-Fill. Co-located helper, keine Lib-Extraktion nötig.
  const probeImageUrl = useCallback((src: string): Promise<{ orientation: "portrait" | "landscape"; width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({
        orientation: img.naturalHeight > img.naturalWidth ? "portrait" : "landscape",
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
      img.onerror = () => reject(new Error("Bild konnte nicht geladen werden"));
      img.src = src;
    });
  }, []);

  // Dual-mode handler: pickerTargetSlot !== null ist Slot-Fill-Mode (für
  // Agenda-Image), sonst Rich-Text-Insert-Mode (existing behavior für
  // RichTextEditor.onOpenMediaPicker). Liest pickerTargetSlot beim Aufruf
  // direkt aus useState — handleMediaSelect appendet IMMER ans Ende
  // (kein sparse-array bei slot-Index > images.length).
  const handleMediaSelect = useCallback(async (result: MediaPickerResult) => {
    if (pickerTargetSlot !== null) {
      // Slot-Fill: nur Image-Type (Video/Embed nicht für Agenda-Slots).
      if (result.type !== "image") return;
      // Parse public_id aus src "/api/media/<id>/".
      const match = /\/api\/media\/([^/]+)\/?/.exec(result.src);
      const publicId = match ? match[1] : null;
      if (!publicId) return;
      try {
        const probe = await probeImageUrl(result.src);
        setForm((f) => ({
          ...f,
          images: [...f.images, { public_id: publicId, orientation: probe.orientation, width: probe.width, height: probe.height, alt: "" }],
        }));
      } catch {
        setSlotErrors((prev) => ({ ...prev, [pickerTargetSlot]: "Bild konnte nicht geladen werden" }));
      }
      return;
    }
    // Rich-Text-Insert-Mode (existing).
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
    // Insert into the currently active editor instance.
    editorHandleRefs.current[editingLocale]?.insertHtml(figureHtml);
  }, [editingLocale, pickerTargetSlot, probeImageUrl]);

  // onClose-Callback: schließt Picker UND resettet pickerTargetSlot=null
  // (sonst stale-state: User klickt Slot 3, schließt ohne Auswahl, klickt
  // Slot 1 — Picker liest stale 3). useCallback-stable wegen Modal-Pattern
  // (lessons.md 2026-04-19 — Modal-Parent callback stability).
  const handlePickerClose = useCallback(() => {
    setShowMediaPicker(false);
    setPickerTargetSlot(null);
  }, []);

  const previewItem = useMemo(() => {
    const blocks = showPreview ? htmlToBlocks(form.html[editingLocale]) : [];
    const beschrieb: string[] = [];
    for (const b of blocks) {
      if ("content" in b) beschrieb.push(b.content.map((n) => n.text).join(""));
    }
    const validHashtags = form.hashtags
      .map((h) => ({
        tag: (editingLocale === "fr" && h.tag_fr?.trim() ? h.tag_fr : h.tag).trim().replace(/^#+/, ""),
        projekt_slug: h.projekt_slug.trim(),
      }))
      .filter((h) => h.tag && h.projekt_slug);
    return {
      datum: form.datum || "Datum",
      zeit: form.zeit || "Zeit",
      ort: form.ort[editingLocale] || "Ort",
      ortUrl: form.ort_url || "#",
      titel: form.titel[editingLocale] || "Titel",
      lead: form.lead[editingLocale].trim() || null,
      beschrieb,
      content: blocks.length > 0 ? blocks : null,
      hashtags: validHashtags,
      images: form.images.map((img) => ({ public_id: img.public_id, orientation: img.orientation, width: img.width, height: img.height, alt: img.alt.trim() || null })),
      // PFLICHT: previewItem reflektiert Mode/Fit-Änderungen in Live-Preview
      // (Sonnet R5 M-7). Ohne diese Felder zeigt Preview immer cols=1+cover.
      imagesGridColumns: form.images_grid_columns,
      imagesFit: form.images_fit,
    };
  }, [showPreview, form, editingLocale]);

  const addHashtag = () => setForm((f) => ({ ...f, hashtags: [...f.hashtags, { uid: newHashtagUid(), tag: "", tag_fr: "", projekt_slug: "" }] }));

  // Probe File (nicht URL) für orientation/width/height. Reused von OS-Drop.
  const probeImageFile = useCallback(
    (file: File): Promise<{ orientation: "portrait" | "landscape"; width: number; height: number }> =>
      new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(url);
          resolve({
            orientation: img.naturalHeight > img.naturalWidth ? "portrait" : "landscape",
            width: img.naturalWidth,
            height: img.naturalHeight,
          });
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error("Bild konnte nicht gelesen werden"));
        };
        img.src = url;
      }),
    []
  );

  // uploadFileForAgenda: Codex R2 [Architecture]. Helper hat Agenda-Shape
  // als Return (NICHT MediaPickerResult — das ist Rich-Text-Embed-Vertrag).
  // Aufrufer: OS-Drop-Handler. Auth + Validation identisch zur bisherigen
  // Upload-Pipeline. Co-located helper, kein eigenes File.
  const uploadFileForAgenda = useCallback(async (file: File): Promise<ImageDraft> => {
    const probe = await probeImageFile(file);
    const fd = new FormData();
    fd.append("file", file);
    const res = await dashboardFetch("/api/dashboard/media/", { method: "POST", body: fd });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "Upload fehlgeschlagen");
    return {
      public_id: data.data.public_id,
      orientation: probe.orientation,
      width: probe.width,
      height: probe.height,
      alt: "",
    };
  }, [probeImageFile]);

  const removeImage = useCallback((i: number) =>
    setForm((f) => ({ ...f, images: f.images.filter((_, idx) => idx !== i) })), []);

  // ✕-Remove cleart auch slotErrors[i] + shift-down aller Keys > i (sonst
  // wandert ein Hint zu einem unrelated Bild nach Index-Shift). Sonnet R5 C-3.
  const handleRemoveSlot = useCallback((i: number) => {
    removeImage(i);
    setSlotErrors((prev) => {
      const next: Record<number, string | null> = {};
      for (const [keyStr, val] of Object.entries(prev)) {
        const key = Number(keyStr);
        if (key === i) continue; // entfernt
        if (key > i) next[key - 1] = val; // shift-down
        else next[key] = val;
      }
      return next;
    });
  }, [removeImage]);

  // Empty-Slot-Click: öffnet MediaPicker mit pickerTargetSlot=i (für
  // Test-Routing + Stale-Reset bei Close).
  const handleEmptySlotClick = useCallback((i: number) => {
    setPickerTargetSlot(i);
    setShowMediaPicker(true);
  }, []);

  // Drag-Source: filled-Slot startet Drag mit setData('text/slot-index').
  // dataTransfer.effectAllowed='move' + Visual cue.
  const handleSlotDragStart = useCallback((e: React.DragEvent<HTMLDivElement>, sourceIdx: number) => {
    e.dataTransfer.setData("text/slot-index", String(sourceIdx));
    e.dataTransfer.effectAllowed = "move";
    dragSourceRef.current = sourceIdx;
  }, []);

  // Unified Drop-Handler. Type-Discrimination:
  //   - Files in dataTransfer: nur empty-Slot akzeptiert (filled = Noop —
  //     Sonnet R3 user decision verhindert versehentliches Überschreiben).
  //     Multi-File sequentiell via uploadFileForAgenda + slotCursor Pattern.
  //   - Slot-index in dataTransfer: Reorder via splice-out + adjusted-insert.
  //     Invalid getData (NaN) = Noop (verhindert Duplikat).
  const handleSlotDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>, targetIdx: number) => {
    e.preventDefault();
    const isFilesDrop = e.dataTransfer.types.includes("Files");
    const isSlotDrag = !isFilesDrop && dragSourceRef.current !== null;

    if (isFilesDrop) {
      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;
      // Filled-slot = Noop. Empty-slot = upload-chain.
      // We snapshot images.length OUTSIDE the loop (closure read at handler-
      // start), then increment locally — async setForm returns can race
      // with our cursor calculation otherwise.
      const startCursor = form.images.length;
      if (targetIdx < startCursor) {
        // Filled-slot OS-drop = Noop.
        return;
      }
      let cursor = startCursor;
      for (let i = 0; i < files.length; i++) {
        try {
          const draft = await uploadFileForAgenda(files[i]);
          setForm((f) => ({ ...f, images: [...f.images, draft] }));
          setSlotErrors((prev) => {
            const next = { ...prev };
            delete next[cursor];
            return next;
          });
          cursor += 1;
        } catch (err) {
          console.error("uploadFileForAgenda failed", err);
          setSlotErrors((prev) => ({ ...prev, [cursor]: dashboardStrings.agenda.uploadFailed }));
          break;
        }
      }
      return;
    }

    if (isSlotDrag) {
      const raw = e.dataTransfer.getData("text/slot-index");
      const sourceIdx = Number(raw);
      if (!Number.isInteger(sourceIdx) || sourceIdx < 0) return; // invalid getData → no-op (kein Duplikat)
      setForm((f) => {
        if (sourceIdx >= f.images.length) return f;
        if (sourceIdx === targetIdx) return f;
        const originalLength = f.images.length;
        const next = [...f.images];
        const [item] = next.splice(sourceIdx, 1);
        // Compare to PRE-splice length: targetIdx >= originalLength = drop
        // auf empty Slot jenseits filled → append. Sonst insert-before mit
        // adjusted-index (targetIdx > sourceIdx → targetIdx-1 weil source
        // vorher entfernt wurde).
        if (targetIdx >= originalLength) {
          next.push(item);
        } else {
          const adjusted = targetIdx > sourceIdx ? targetIdx - 1 : targetIdx;
          next.splice(adjusted, 0, item);
        }
        return { ...f, images: next };
      });
      setSlotErrors({});
      dragSourceRef.current = null;
    }
  // form.images.length wird beim handler-call frisch gelesen — closure
  // ist OK weil es synchron beim drop ausgewertet wird.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadFileForAgenda, form.images.length]);

  // Mode-Wechsel: cols + visibleSlotCount-Reset + slotErrors-Clear.
  // Spec PFLICHT: visibleSlotCount auf neue cols setzen (egal wie hoch
  // vorher), images bleiben unverändert (preserves Bilder).
  const setMode = useCallback((cols: number) => {
    setForm((f) => ({ ...f, images_grid_columns: cols }));
    setVisibleSlotCount(cols);
    setSlotErrors({});
  }, []);

  const setFit = useCallback((fit: "cover" | "contain") => {
    setForm((f) => ({ ...f, images_fit: fit }));
  }, []);

  const addRow = useCallback(() => {
    setVisibleSlotCount((v) => v + form.images_grid_columns);
  }, [form.images_grid_columns]);
  const updateHashtag = (i: number, patch: Partial<HashtagDraft>) =>
    setForm((f) => ({ ...f, hashtags: f.hashtags.map((h, idx) => (idx === i ? { ...h, ...patch } : h)) }));
  const removeHashtag = (i: number) =>
    setForm((f) => ({ ...f, hashtags: f.hashtags.filter((_, idx) => idx !== i) }));

  const handleSave = async () => {
    setError("");
    setSaving(true);
    // Clean hashtags: DE tag is required, FR is optional.
    const cleanedHashtags = form.hashtags
      .map((h) => {
        const de = h.tag.trim().replace(/^#+/, "");
        const fr = (h.tag_fr ?? "").trim().replace(/^#+/, "");
        return {
          tag_i18n: { de, fr: fr || null },
          projekt_slug: h.projekt_slug.trim(),
        };
      })
      .filter((h) => h.tag_i18n.de && h.projekt_slug);
    if (cleanedHashtags.length !== form.hashtags.length) {
      setError("Jeder Hashtag braucht ein DE-Label und ein verknüpftes Projekt.");
      setSaving(false);
      return;
    }
    const payload = {
      datum: form.datum,
      zeit: form.zeit,
      ort_url: form.ort_url,
      title_i18n: { de: form.titel.de.trim() || null, fr: form.titel.fr.trim() || null },
      lead_i18n: { de: form.lead.de.trim() || null, fr: form.lead.fr.trim() || null },
      ort_i18n: { de: form.ort.de.trim() || null, fr: form.ort.fr.trim() || null },
      content_i18n: {
        de: htmlToBlocks(form.html.de),
        fr: htmlToBlocks(form.html.fr),
      },
      hashtags: cleanedHashtags,
      images: form.images.map((img) => ({ public_id: img.public_id, orientation: img.orientation, width: img.width, height: img.height, alt: img.alt.trim() || null })),
      images_grid_columns: form.images_grid_columns,
      images_fit: form.images_fit,
    };

    try {
      const url = editing ? `/api/dashboard/agenda/${editing.id}/` : "/api/dashboard/agenda/";
      const res = await dashboardFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!data.success) { setError(data.error || "Fehler beim Speichern"); return; }
      setEditing(null);
      setCreating(false);
      await reload();
    } catch { setError("Verbindungsfehler"); } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setSaving(true);
    try {
      const res = await dashboardFetch(`/api/dashboard/agenda/${deleting.id}/`, { method: "DELETE" });
      const data = await res.json();
      if (!data.success) { setError(data.error || "Fehler beim Löschen"); return; }
      setDeleting(null);
      await reload();
    } catch { setError("Verbindungsfehler"); } finally { setSaving(false); }
  };

  const formFields = (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
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

      {/* Shared single-locale fields — native HTML5 date/time pickers.
          Storage is canonical DE ("DD.MM.YYYY", "HH:MM Uhr"), picker IO
          is ISO ("YYYY-MM-DD", "HH:MM"); adapters live in agenda-datetime.ts.
          Legacy-row hint is rendered + aria-described when the currently-
          edited item has an off-spec value in the DB. */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="agenda-datum-input" className="block text-sm font-medium mb-1">Datum</label>
          <input
            id="agenda-datum-input"
            type="date"
            value={datumToIsoInput(form.datum) ?? ""}
            onChange={(e) => {
              const parsed = parseIsoDate(e.target.value);
              setForm({ ...form, datum: parsed ? formatCanonicalDatum(parsed) : "" });
            }}
            aria-describedby={editing && !isCanonicalDatum(editing.datum) ? "agenda-datum-hint" : undefined}
            className="w-full px-3 py-2 border rounded"
          />
          {editing && !isCanonicalDatum(editing.datum) && (
            <p id="agenda-datum-hint" className="text-xs text-red-600 mt-1">
              Alter Eintrag — bitte Datum neu wählen (DB-Wert: „{editing.datum}").
            </p>
          )}
        </div>
        <div>
          <label htmlFor="agenda-zeit-input" className="block text-sm font-medium mb-1">Zeit</label>
          <input
            id="agenda-zeit-input"
            type="time"
            value={zeitToIsoInput(form.zeit) ?? ""}
            onChange={(e) => {
              const parsed = parseIsoTime(e.target.value);
              setForm({ ...form, zeit: parsed ? formatCanonicalZeit(parsed) : "" });
            }}
            aria-describedby={editing && !isCanonicalZeit(editing.zeit) ? "agenda-zeit-hint" : undefined}
            className="w-full px-3 py-2 border rounded"
          />
          {editing && !isCanonicalZeit(editing.zeit) && (
            <p id="agenda-zeit-hint" className="text-xs text-red-600 mt-1">
              Alter Eintrag — bitte Zeit neu wählen (DB-Wert: „{editing.zeit}").
            </p>
          )}
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">
          Ort URL <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          value={form.ort_url}
          onChange={(e) => setForm({ ...form, ort_url: e.target.value })}
          placeholder="https://…"
          className="w-full px-3 py-2 border rounded"
        />
      </div>

      {/* Locale tabs: per-locale fields (Titel, Lead, Ort, Content-Editor)
          parallel mounted, inactive ones hidden via CSS to avoid remount
          data loss in the RichTextEditor. */}
      <div className="flex gap-1 border-b pt-2" role="tablist" aria-label="Sprache">
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

      {LOCALES.map((loc) => (
        <div key={loc} hidden={loc !== editingLocale} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Titel ({loc.toUpperCase()})</label>
            <input
              value={form.titel[loc]}
              onChange={(e) => setForm((f) => ({ ...f, titel: { ...f.titel, [loc]: e.target.value } }))}
              className="w-full px-3 py-2 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Lead ({loc.toUpperCase()})</label>
            <textarea
              value={form.lead[loc]}
              onChange={(e) => setForm((f) => ({ ...f, lead: { ...f.lead, [loc]: e.target.value } }))}
              className="w-full px-3 py-2 border rounded resize-y"
              rows={2}
              placeholder={loc === "de" ? "Kurzer Teaser unter dem Titel (optional)" : "Résumé court (optionnel)"}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Ort ({loc.toUpperCase()})</label>
            <input
              value={form.ort[loc]}
              onChange={(e) => setForm((f) => ({ ...f, ort: { ...f.ort, [loc]: e.target.value } }))}
              className="w-full px-3 py-2 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Beschreibung ({loc.toUpperCase()})</label>
            <RichTextEditor
              ref={(handle) => { editorHandleRefs.current[loc] = handle; }}
              value={form.html[loc]}
              onChange={loc === "de" ? updateHtmlDe : updateHtmlFr}
              onOpenMediaPicker={() => setShowMediaPicker(true)}
            />
          </div>
        </div>
      ))}

      {/* Sprint Agenda Bilder-Grid 2.0: Mode-Picker + Fit-Toggle + Slot-Grid.
          Strict-grid editor layout (Spec B). visibleSlotCount + slotErrors
          leben AUSSERHALB form (kein DirtyContext-Pollution). */}
      {(() => {
        const cols = form.images_grid_columns;
        const len = form.images.length;
        const visibleSlots = Math.max(visibleSlotCount, len);
        const showLastRowWarning = cols >= 2 && len > 0 && len % cols !== 0;
        const showSingleModeWarning = cols === 1 && len >= 2;
        const lastRowFilled = len % cols;
        const t = dashboardStrings.agenda;
        return (
          <div>
            <label className="block text-sm font-medium mb-2">Bilder</label>

            {/* Mode-Picker */}
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-xs text-gray-500 mr-1">{t.imageMode.label}:</span>
              {([
                { v: 1, l: t.imageMode.single },
                { v: 2, l: t.imageMode.cols2 },
                { v: 3, l: t.imageMode.cols3 },
                { v: 4, l: t.imageMode.cols4 },
                { v: 5, l: t.imageMode.cols5 },
              ] as const).map(({ v, l }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setMode(v)}
                  data-testid={`mode-${v}`}
                  className={`px-2 py-1 text-xs border rounded transition-colors ${
                    cols === v ? "bg-black text-white border-black" : "bg-white hover:bg-gray-50"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>

            {/* Fit-Toggle */}
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-xs text-gray-500 mr-1">{t.imageFit.label}:</span>
              {([
                { v: "cover" as const, l: t.imageFit.cover },
                { v: "contain" as const, l: t.imageFit.letterbox },
              ]).map(({ v, l }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setFit(v)}
                  data-testid={`fit-${v}`}
                  className={`px-2 py-1 text-xs border rounded transition-colors ${
                    form.images_fit === v ? "bg-black text-white border-black" : "bg-white hover:bg-gray-50"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>

            {/* Soft-Warnings */}
            {showLastRowWarning && (
              <p data-testid="warning-last-row" className="text-xs text-amber-700 mb-2">
                {t.warningLastRow.replace("{filled}", String(lastRowFilled)).replace("{total}", String(cols))}
              </p>
            )}
            {showSingleModeWarning && (
              <p data-testid="warning-single-mode" className="text-xs text-amber-700 mb-2">
                {t.warningSingleMode}
              </p>
            )}

            {/* Slot-Grid: inline style.gridTemplateColumns (Tailwind JIT
                kann runtime-cols nicht — patterns/tailwind.md). aspect-[2/3]
                ist statisches Tailwind-class, JIT-OK. */}
            <div
              data-testid="slot-grid"
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
            >
              {Array.from({ length: visibleSlots }, (_, i) => {
                const img = form.images[i];
                const err = slotErrors[i];
                if (img) {
                  // Filled slot.
                  return (
                    <div
                      key={`${img.public_id}-${i}`}
                      data-testid={`slot-filled-${i}`}
                      draggable
                      onDragStart={(e) => handleSlotDragStart(e, i)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => handleSlotDrop(e, i)}
                      className="relative aspect-[2/3] bg-gray-100 border rounded overflow-hidden cursor-move"
                    >
                      <img
                        src={`/api/media/${img.public_id}/`}
                        alt={img.alt}
                        className="w-full h-full block"
                        style={{ objectFit: "cover" }}
                        draggable={false}
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveSlot(i)}
                        aria-label={t.slot.remove}
                        className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center bg-white/90 hover:bg-red-50 text-red-600 border border-red-200 rounded text-xs"
                      >
                        ✕
                      </button>
                      {err && (
                        <p data-testid={`slot-error-${i}`} className="absolute bottom-0 inset-x-0 text-[10px] bg-red-600/90 text-white px-1 py-0.5 text-center">
                          {err}
                        </p>
                      )}
                    </div>
                  );
                }
                // Empty slot.
                return (
                  <div
                    key={`empty-${i}`}
                    data-testid={`slot-empty-${i}`}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleSlotDrop(e, i)}
                    className="aspect-[2/3] border-2 border-dashed border-gray-300 rounded flex flex-col items-center justify-center text-gray-400 hoverable:hover:border-gray-500 hoverable:hover:text-gray-600 cursor-pointer text-xs"
                  >
                    <button
                      type="button"
                      onClick={() => handleEmptySlotClick(i)}
                      className="w-full h-full flex flex-col items-center justify-center"
                      aria-label={t.slot.empty}
                    >
                      <span className="text-2xl leading-none">+</span>
                      <span className="mt-1">{t.slot.empty}</span>
                    </button>
                    {err && (
                      <p data-testid={`slot-error-${i}`} className="absolute bottom-0 inset-x-0 text-[10px] bg-red-600/90 text-white px-1 py-0.5 text-center">
                        {err}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* "+ neue Zeile" — immer im DOM, bei cols=1 disabled (nicht hidden) */}
            <button
              type="button"
              onClick={addRow}
              disabled={cols === 1}
              data-testid="add-row"
              className="mt-2 px-3 py-1.5 text-xs border rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t.addRow.button}
            </button>
          </div>
        );
      })()}
      <HashtagEditor
        hashtags={form.hashtags}
        projekte={projekte}
        onAdd={addHashtag}
        onUpdate={updateHashtag}
        onRemove={removeHashtag}
        showI18n
      />
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <div className="flex gap-3 justify-end">
        <button type="button" onClick={() => { setEditing(null); setCreating(false); }} className="px-4 py-2 border rounded hover:bg-gray-50">Abbrechen</button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !isCanonicalDatum(form.datum) || !isCanonicalZeit(form.zeit)}
          title={
            !isCanonicalDatum(form.datum) ? "Datum fehlt oder ist ungültig"
            : !isCanonicalZeit(form.zeit) ? "Zeit fehlt oder ist ungültig"
            : undefined
          }
          className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "..." : "Speichern"}
        </button>
      </div>
    </div>
  );

  const showForm = creating || !!editing;
  const isEdited = showForm && JSON.stringify(form) !== initialFormRef.current;

  // Report dirty state SYNCHRONOUSLY within render (setDirty only mutates a
  // ref in DirtyContext — no re-render triggered). Avoids the keypress →
  // click race where a useEffect-based update would not flush in time.
  // (Codex PR #48 Runde 2 [P1].)
  const { setDirty } = useDirty();
  const lastReportedRef = useRef(false);
  if (isEdited !== lastReportedRef.current) {
    lastReportedRef.current = isEdited;
    setDirty("agenda", isEdited);
  }
  useEffect(() => () => setDirty("agenda", false), [setDirty]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">{showForm ? (editing ? "Agenda-Eintrag bearbeiten" : "Neuer Agenda-Eintrag") : `Agenda (${items.length})`}</h2>
        {!showForm && <button onClick={openCreate} className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 text-sm">+ Neu</button>}
      </div>

      {showForm ? (
        <div className={showPreview ? "grid grid-cols-2 gap-6 items-start" : ""}>
          <div className="bg-white border rounded p-6">{formFields}</div>
          {showPreview && (
            <div className="sticky top-6 max-h-[calc(100vh-3rem)] flex flex-col">
              <h3 className="text-sm font-semibold mb-2 text-gray-600 shrink-0">Vorschau ({editingLocale.toUpperCase()})</h3>
              <div className="bg-white overflow-y-auto">
                <AgendaItemPreview item={previewItem} defaultExpanded projektSlugMap={previewProjektSlugMap} />
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const displayTitle = item.title_i18n?.de ?? item.title_i18n?.fr ?? "";
            const displayOrt = item.ort_i18n?.de ?? item.ort_i18n?.fr ?? "";
            return (
              <ListRow
                key={item.id}
                dataAttrs={{
                  "data-completion-de": String(item.completion?.de ?? false),
                  "data-completion-fr": String(item.completion?.fr ?? false),
                }}
                className="group bg-white border rounded hoverable:hover:border-gray-400 hoverable:hover:bg-gray-50/50 transition-colors"
                content={
                  <>
                    <span className="text-sm text-gray-500">{item.datum} {item.zeit}</span>
                    <p className="font-medium">{displayTitle}</p>
                    <span className="text-sm text-gray-500">{displayOrt}</span>
                  </>
                }
                badges={
                  <>
                    <CompletionBadge locale="de" done={item.completion?.de ?? false} />
                    <CompletionBadge locale="fr" done={item.completion?.fr ?? false} />
                  </>
                }
                actions={[
                  { label: "Bearbeiten", onClick: () => openEdit(item) },
                  {
                    label: "Instagram",
                    onClick: () => setInstagramItem(item),
                    disabled:
                      isLocaleEmpty(item as unknown as AgendaItemForExport, "de") &&
                      isLocaleEmpty(item as unknown as AgendaItemForExport, "fr"),
                  },
                  { label: "Löschen", onClick: () => setDeleting(item), variant: "danger" },
                ]}
              />
            );
          })}
          {items.length === 0 && <p className="text-gray-500 text-sm">Keine Agenda-Einträge vorhanden.</p>}
        </div>
      )}

      <DeleteConfirm open={!!deleting} onClose={() => setDeleting(null)} onConfirm={handleDelete} label={deleting?.title_i18n?.de ?? deleting?.title_i18n?.fr ?? ""} />
      <MediaPicker
        open={showMediaPicker}
        onClose={handlePickerClose}
        onSelect={handleMediaSelect}
        targetSlot={pickerTargetSlot}
      />
      <InstagramExportModal
        open={!!instagramItem}
        onClose={() => setInstagramItem(null)}
        item={instagramItem as unknown as AgendaItemForExport | null}
      />
    </div>
  );
}
