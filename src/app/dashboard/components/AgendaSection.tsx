"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { DeleteConfirm } from "./DeleteConfirm";
import { DragHandle, ReorderHint } from "./DragHandle";
import { RichTextEditor, type RichTextEditorHandle } from "./RichTextEditor";
import { MediaPicker, type MediaPickerResult } from "./MediaPicker";
import { blocksToHtml, htmlToBlocks } from "./journal-html-converter";
import type { JournalContent } from "@/lib/journal-types";
import { AgendaItem as AgendaItemPreview } from "@/components/AgendaItem";
import { useDirty } from "../DirtyContext";
import { HashtagEditor, type HashtagDraft, newHashtagUid } from "./HashtagEditor";
import type { Locale } from "@/lib/i18n-field";
import type { ProjektSlugMap } from "@/lib/projekt-slug";

type I18nString = { de?: string | null; fr?: string | null };
type I18nContent = { de?: JournalContent | null; fr?: JournalContent | null };

export interface AgendaItem {
  id: number;
  datum: string;
  zeit: string;
  ort: string;
  ort_url: string;
  titel: string;
  lead: string | null;
  beschrieb: string[];
  content: JournalContent | null;
  hashtags: { tag_i18n?: { de?: string; fr?: string | null }; tag?: string; projekt_slug: string }[] | null;
  images: { public_id: string; orientation: "portrait" | "landscape"; width?: number | null; height?: number | null; alt?: string | null }[] | null;
  sort_order: number;
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
  const [form, setForm] = useState(emptyForm);
  const [editingLocale, setEditingLocale] = useState<Locale>("de");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const editorHandleRefs = useRef<Record<Locale, RichTextEditorHandle | null>>({ de: null, fr: null });
  const dragItem = useRef<number | null>(null);
  const dragOver = useRef<number | null>(null);

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
    setEditingLocale("de");
    setError("");
    setCreating(true);
  };

  const openEdit = (item: AgendaItem) => {
    const deContent = item.content_i18n?.de ?? null;
    const frContent = item.content_i18n?.fr ?? null;
    const nextForm = {
      datum: item.datum,
      zeit: item.zeit,
      ort_url: item.ort_url,
      hashtags: (item.hashtags ?? []).map((h) => ({
        uid: newHashtagUid(),
        tag: typeof h.tag_i18n?.de === "string" ? h.tag_i18n.de : (h.tag ?? ""),
        tag_fr: typeof h.tag_i18n?.fr === "string" ? h.tag_i18n.fr : "",
        projekt_slug: h.projekt_slug,
      })),
      images: (item.images ?? []).map((img) => ({
        public_id: img.public_id,
        orientation: img.orientation,
        width: img.width ?? null,
        height: img.height ?? null,
        alt: img.alt ?? "",
      })),
      titel: {
        de: item.title_i18n?.de ?? item.titel ?? "",
        fr: item.title_i18n?.fr ?? "",
      },
      lead: {
        de: item.lead_i18n?.de ?? item.lead ?? "",
        fr: item.lead_i18n?.fr ?? "",
      },
      ort: {
        de: item.ort_i18n?.de ?? item.ort ?? "",
        fr: item.ort_i18n?.fr ?? "",
      },
      html: {
        de: deContent && deContent.length > 0 ? blocksToHtml(deContent) : "",
        fr: frContent && frContent.length > 0 ? blocksToHtml(frContent) : "",
      },
    };
    setForm(nextForm);
    initialFormRef.current = JSON.stringify(nextForm);
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
    // Insert into the currently active editor instance.
    editorHandleRefs.current[editingLocale]?.insertHtml(figureHtml);
  }, [editingLocale]);

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
    };
  }, [showPreview, form, editingLocale]);

  const addHashtag = () => setForm((f) => ({ ...f, hashtags: [...f.hashtags, { uid: newHashtagUid(), tag: "", tag_fr: "", projekt_slug: "" }] }));

  const [imageUploadError, setImageUploadError] = useState("");
  const [uploadingImages, setUploadingImages] = useState(false);

  const probeImage = useCallback(
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

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (e.target) e.target.value = "";
    if (files.length === 0) return;
    setImageUploadError("");
    setUploadingImages(true);
    const newDrafts: ImageDraft[] = [];
    let failedAt: { index: number; reason: string } | null = null;
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const probe = await probeImage(file);
          const fd = new FormData();
          fd.append("file", file);
          const res = await fetch("/api/dashboard/media/", { method: "POST", body: fd });
          const data = await res.json();
          if (!data.success) {
            failedAt = { index: i, reason: data.error || "Upload fehlgeschlagen" };
            break;
          }
          newDrafts.push({ public_id: data.data.public_id, orientation: probe.orientation, width: probe.width, height: probe.height, alt: "" });
        } catch (err) {
          failedAt = { index: i, reason: err instanceof Error ? err.message : "Upload fehlgeschlagen" };
          break;
        }
      }
    } finally {
      setUploadingImages(false);
    }
    if (newDrafts.length > 0) {
      setForm((f) => ({ ...f, images: [...f.images, ...newDrafts] }));
    }
    if (failedAt) {
      const ok = newDrafts.length;
      const total = files.length;
      const detail = ok > 0
        ? `${ok} von ${total} Bildern hochgeladen — bei "${files[failedAt.index].name}" abgebrochen: ${failedAt.reason}`
        : `Upload fehlgeschlagen bei "${files[failedAt.index].name}": ${failedAt.reason}`;
      setImageUploadError(detail);
    }
  }, [probeImage]);

  const updateImage = (i: number, patch: Partial<ImageDraft>) =>
    setForm((f) => ({ ...f, images: f.images.map((img, idx) => (idx === i ? { ...img, ...patch } : img)) }));
  const removeImage = (i: number) =>
    setForm((f) => ({ ...f, images: f.images.filter((_, idx) => idx !== i) }));
  const moveImage = (i: number, dir: -1 | 1) =>
    setForm((f) => {
      const target = i + dir;
      if (target < 0 || target >= f.images.length) return f;
      const next = [...f.images];
      [next[i], next[target]] = [next[target], next[i]];
      return { ...f, images: next };
    });
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
    };

    try {
      const url = editing ? `/api/dashboard/agenda/${editing.id}/` : "/api/dashboard/agenda/";
      const res = await fetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
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
      const res = await fetch(`/api/dashboard/agenda/${deleting.id}/`, { method: "DELETE" });
      const data = await res.json();
      if (!data.success) { setError(data.error || "Fehler beim Löschen"); return; }
      setDeleting(null);
      await reload();
    } catch { setError("Verbindungsfehler"); } finally { setSaving(false); }
  };

  const handleDragEnd = async () => {
    if (dragItem.current === null || dragOver.current === null || dragItem.current === dragOver.current) {
      dragItem.current = null;
      dragOver.current = null;
      return;
    }
    const reordered = [...items];
    const [moved] = reordered.splice(dragItem.current, 1);
    reordered.splice(dragOver.current, 0, moved);
    setItems(reordered);
    dragItem.current = null;
    dragOver.current = null;
    try {
      await fetch("/api/dashboard/agenda/reorder/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: reordered.map((e) => e.id) }),
      });
    } catch {
      await reload();
    }
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

      {/* Shared single-locale fields */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Datum</label>
          <input value={form.datum} onChange={(e) => setForm({ ...form, datum: e.target.value })} className="w-full px-3 py-2 border rounded" placeholder="15.03.2025" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Zeit</label>
          <input value={form.zeit} onChange={(e) => setForm({ ...form, zeit: e.target.value })} className="w-full px-3 py-2 border rounded" placeholder="15:00 Uhr" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Ort URL</label>
        <input value={form.ort_url} onChange={(e) => setForm({ ...form, ort_url: e.target.value })} className="w-full px-3 py-2 border rounded" />
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

      {/* Shared images + hashtags (single-locale with optional FR-labels) */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium">Bilder</label>
          <label className={`text-xs px-2 py-1 border rounded cursor-pointer hover:bg-gray-50 ${uploadingImages ? "opacity-50 pointer-events-none" : ""}`}>
            {uploadingImages ? "Lädt hoch…" : "+ Bilder hochladen"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              multiple
              onChange={handleImageUpload}
              disabled={uploadingImages}
              className="hidden"
            />
          </label>
        </div>
        {imageUploadError && <p className="text-red-600 text-xs mb-2">{imageUploadError}</p>}
        {form.images.length === 0 ? (
          <p className="text-xs text-gray-500">
            Keine Bilder. Hochformat erscheint als 2-Spalten-Layout, Querformat über die volle Breite. Reihenfolge per Pfeile anpassbar.
          </p>
        ) : (
          <div className="space-y-1">
            {form.images.map((img, i) => (
              <div key={`${img.public_id}-${i}`} className="flex items-center gap-2 border rounded p-1.5 bg-white">
                <div className="relative shrink-0">
                  <img
                    src={`/api/media/${img.public_id}/`}
                    alt={img.alt}
                    width={img.width ?? (img.orientation === "portrait" ? 3 : 4)}
                    height={img.height ?? (img.orientation === "portrait" ? 4 : 3)}
                    className="w-12 h-12 object-cover rounded block"
                  />
                  <span className="absolute -top-1 -right-1 px-1 py-px bg-black/70 text-white text-[9px] uppercase rounded">
                    {img.orientation === "portrait" ? "H" : "Q"}
                  </span>
                </div>
                <input
                  value={img.alt}
                  onChange={(e) => updateImage(i, { alt: e.target.value })}
                  placeholder="Alt-Text (optional)"
                  className="flex-1 min-w-0 px-2 py-1 text-xs border rounded"
                />
                <div className="flex gap-1 shrink-0">
                  <button type="button" onClick={() => moveImage(i, -1)} disabled={i === 0} className="px-2 py-1 text-xs border rounded hover:bg-gray-50 disabled:opacity-30" aria-label="Nach oben">↑</button>
                  <button type="button" onClick={() => moveImage(i, 1)} disabled={i === form.images.length - 1} className="px-2 py-1 text-xs border rounded hover:bg-gray-50 disabled:opacity-30" aria-label="Nach unten">↓</button>
                  <button type="button" onClick={() => removeImage(i)} className="px-2 py-1 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50" aria-label="Entfernen">✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
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
        <button onClick={() => { setEditing(null); setCreating(false); }} className="px-4 py-2 border rounded hover:bg-gray-50">Abbrechen</button>
        <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 disabled:opacity-50">{saving ? "..." : "Speichern"}</button>
      </div>
    </div>
  );

  const showForm = creating || !!editing;
  const isEdited = showForm && JSON.stringify(form) !== initialFormRef.current;

  const { setDirty } = useDirty();
  useEffect(() => {
    setDirty("agenda", isEdited);
    return () => setDirty("agenda", false);
  }, [isEdited, setDirty]);

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
          <ReorderHint count={items.length} />
          {items.map((item, index) => {
            const displayTitle = item.title_i18n?.de ?? item.title_i18n?.fr ?? item.titel;
            const displayOrt = item.ort_i18n?.de ?? item.ort_i18n?.fr ?? item.ort;
            return (
              <div
                key={item.id}
                draggable
                data-completion-de={String(item.completion?.de ?? false)}
                data-completion-fr={String(item.completion?.fr ?? false)}
                onDragStart={() => { dragItem.current = index; }}
                onDragEnter={() => { dragOver.current = index; }}
                onDragOver={(e) => e.preventDefault()}
                onDragEnd={handleDragEnd}
                className="group flex items-center justify-between gap-3 p-3 bg-white border rounded cursor-grab active:cursor-grabbing hoverable:hover:border-gray-400 hoverable:hover:bg-gray-50/50 transition-colors"
              >
                <DragHandle />
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-gray-500">{item.datum} {item.zeit}</span>
                  <p className="font-medium">{displayTitle}</p>
                  <span className="text-sm text-gray-500">{displayOrt}</span>
                </div>
                <div className="flex gap-1 shrink-0">
                  <CompletionBadge locale="de" done={item.completion?.de ?? false} />
                  <CompletionBadge locale="fr" done={item.completion?.fr ?? false} />
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => openEdit(item)} className="px-3 py-1 text-sm border rounded hover:bg-gray-50">Bearbeiten</button>
                  <button onClick={() => setDeleting(item)} className="px-3 py-1 text-sm border border-red-200 text-red-600 rounded hover:bg-red-50">Löschen</button>
                </div>
              </div>
            );
          })}
          {items.length === 0 && <p className="text-gray-500 text-sm">Keine Agenda-Einträge vorhanden.</p>}
        </div>
      )}

      <DeleteConfirm open={!!deleting} onClose={() => setDeleting(null)} onConfirm={handleDelete} label={deleting?.title_i18n?.de ?? deleting?.title_i18n?.fr ?? deleting?.titel ?? ""} />
      <MediaPicker
        open={showMediaPicker}
        onClose={() => setShowMediaPicker(false)}
        onSelect={handleMediaSelect}
      />
    </div>
  );
}
