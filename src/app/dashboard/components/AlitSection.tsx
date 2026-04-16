"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { DeleteConfirm } from "./DeleteConfirm";
import { DragHandle, ReorderHint } from "./DragHandle";
import { RichTextEditor } from "./RichTextEditor";
import { blocksToHtml, htmlToBlocks } from "./journal-html-converter";
import type { JournalContent } from "@/lib/journal-types";
import { useDirty } from "../DirtyContext";
import type { Locale } from "@/lib/i18n-field";

type I18nString = { de?: string | null; fr?: string | null };
type I18nContent = { de?: JournalContent | null; fr?: JournalContent | null };

export interface AlitSectionItem {
  id: number;
  title_i18n: I18nString | null;
  content_i18n: I18nContent | null;
  sort_order: number;
  completion: { de: boolean; fr: boolean };
}

const LOCALES: readonly Locale[] = ["de", "fr"];
const emptyForm = {
  title: { de: "", fr: "" },
  html: { de: "", fr: "" },
};

function firstText(content: JournalContent | null | undefined): string {
  if (!content || content.length === 0) return "";
  for (const block of content) {
    if (!("content" in block)) continue;
    const text = block.content.map((n) => n.text ?? "").join("").trim();
    if (text) return text;
  }
  return "";
}

function preview(item: AlitSectionItem): string {
  const de = firstText(item.content_i18n?.de ?? null);
  if (de) return de.length > 80 ? de.slice(0, 80) + "…" : de;
  const fr = firstText(item.content_i18n?.fr ?? null);
  if (fr) return fr.length > 80 ? fr.slice(0, 80) + "…" : fr;
  return "(leer)";
}

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

export function AlitSection({ initial }: { initial: AlitSectionItem[] }) {
  const [items, setItems] = useState(initial);
  const [editing, setEditing] = useState<AlitSectionItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<AlitSectionItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editingLocale, setEditingLocale] = useState<Locale>("de");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const dragItem = useRef<number | null>(null);
  const dragOver = useRef<number | null>(null);

  const reload = useCallback(async () => {
    const res = await fetch("/api/dashboard/alit/");
    const data = await res.json();
    if (data.success) setItems(data.data);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Snapshot of form state right after open — see AgendaSection for rationale.
  const initialFormRef = useRef<string>("");

  const openCreate = () => {
    setForm(emptyForm);
    initialFormRef.current = JSON.stringify(emptyForm);
    setEditingLocale("de");
    setError("");
    setCreating(true);
  };

  const openEdit = (item: AlitSectionItem) => {
    const deContent = item.content_i18n?.de ?? null;
    const frContent = item.content_i18n?.fr ?? null;
    const nextForm = {
      title: {
        de: item.title_i18n?.de ?? "",
        fr: item.title_i18n?.fr ?? "",
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

  // Stable onChange callbacks per locale — parent-state updates trigger
  // RichTextEditor's controlled `value` prop without remounting.
  const updateHtmlDe = useCallback(
    (h: string) => setForm((f) => ({ ...f, html: { ...f.html, de: h } })),
    [],
  );
  const updateHtmlFr = useCallback(
    (h: string) => setForm((f) => ({ ...f, html: { ...f.html, fr: h } })),
    [],
  );

  // Live completion from form state (overrides server completion while editing)
  const liveCompletion = useMemo(() => ({
    de: htmlToBlocks(form.html.de).length > 0,
    fr: htmlToBlocks(form.html.fr).length > 0,
  }), [form.html.de, form.html.fr]);

  const handleSave = async () => {
    setError("");
    setSaving(true);
    const payload = {
      title_i18n: {
        de: form.title.de.trim() || null,
        fr: form.title.fr.trim() || null,
      },
      content_i18n: {
        de: htmlToBlocks(form.html.de),
        fr: htmlToBlocks(form.html.fr),
      },
    };
    try {
      const url = editing ? `/api/dashboard/alit/${editing.id}/` : "/api/dashboard/alit/";
      const res = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
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
      const res = await fetch(`/api/dashboard/alit/${deleting.id}/`, { method: "DELETE" });
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
      const res = await fetch("/api/dashboard/alit/reorder/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: reordered.map((e) => e.id) }),
      });
      const data = await res.json().catch(() => ({ success: false }));
      if (!res.ok || !data.success) {
        await reload();
      }
    } catch {
      await reload();
    }
  };

  const formFields = (
    <div className="space-y-4">
      {/* Locale tabs: both editors stay mounted, inactive one hidden via CSS.
          This prevents unsaved-keystroke loss in RichTextEditor (which debounces
          its onChange) when switching locales. */}
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

      {LOCALES.map((loc) => (
        <div key={loc} hidden={loc !== editingLocale} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Titel ({loc.toUpperCase()}){" "}
              <span className="text-gray-400 font-normal">(optional — leer für Intro-Block)</span>
            </label>
            <input
              value={form.title[loc]}
              onChange={(e) =>
                setForm((f) => ({ ...f, title: { ...f.title, [loc]: e.target.value } }))
              }
              className="w-full px-3 py-2 border rounded"
              placeholder={loc === "de" ? "z.B. Projektpartner" : "p.ex. Partenaires du projet"}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Inhalt ({loc.toUpperCase()})</label>
            <RichTextEditor
              value={form.html[loc]}
              onChange={loc === "de" ? updateHtmlDe : updateHtmlFr}
            />
          </div>
        </div>
      ))}

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
    setDirty("alit", isEdited);
    return () => setDirty("alit", false);
  }, [isEdited, setDirty]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">{showForm ? (editing ? "Sektion bearbeiten" : "Neue Sektion") : `Über Alit (${items.length} Sektionen)`}</h2>
        {!showForm && <button onClick={openCreate} className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 text-sm">+ Neu</button>}
      </div>

      {showForm ? (
        <div className="bg-white border rounded p-6">{formFields}</div>
      ) : (
        <div className="space-y-2">
          <ReorderHint count={items.length} />
          {items.map((item, index) => {
            const displayTitle = item.title_i18n?.de ?? item.title_i18n?.fr ?? null;
            return (
              <div
                key={item.id}
                draggable
                data-completion-de={String(item.completion.de)}
                data-completion-fr={String(item.completion.fr)}
                onDragStart={() => { dragItem.current = index; }}
                onDragEnter={() => { dragOver.current = index; }}
                onDragOver={(e) => e.preventDefault()}
                onDragEnd={handleDragEnd}
                className="group flex items-center justify-between gap-3 p-3 bg-white border rounded cursor-grab active:cursor-grabbing hoverable:hover:border-gray-400 hoverable:hover:bg-gray-50/50 transition-colors"
              >
                <DragHandle />
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">
                    {displayTitle ?? <span className="italic text-gray-500">(ohne Titel — Intro)</span>}
                  </p>
                  <span className="text-sm text-gray-500 truncate block">{preview(item)}</span>
                </div>
                <div className="flex gap-1 shrink-0">
                  <CompletionBadge locale="de" done={item.completion.de} />
                  <CompletionBadge locale="fr" done={item.completion.fr} />
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => openEdit(item)} className="px-3 py-1 text-sm border rounded hover:bg-gray-50">Bearbeiten</button>
                  <button onClick={() => setDeleting(item)} className="px-3 py-1 text-sm border border-red-200 text-red-600 rounded hover:bg-red-50">Löschen</button>
                </div>
              </div>
            );
          })}
          {items.length === 0 && <p className="text-gray-500 text-sm">Keine Sektionen vorhanden.</p>}
        </div>
      )}

      <DeleteConfirm
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        label={deleting?.title_i18n?.de ?? deleting?.title_i18n?.fr ?? "diese Sektion"}
      />
    </div>
  );
}
