"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { DeleteConfirm } from "./DeleteConfirm";
import { DragHandle, ReorderHint } from "./DragHandle";
import { RichTextEditor } from "./RichTextEditor";
import { blocksToHtml, htmlToBlocks } from "./journal-html-converter";
import type { JournalContent } from "@/lib/journal-types";
import type { Locale } from "@/lib/i18n-field";

type I18nString = { de?: string | null; fr?: string | null };
type I18nContent = { de?: JournalContent | null; fr?: JournalContent | null };

export interface Projekt {
  id: number;
  slug: string;
  titel: string;
  kategorie: string;
  paragraphs: string[];
  content: JournalContent | null;
  external_url: string | null;
  archived: boolean;
  sort_order: number;
  title_i18n: I18nString | null;
  kategorie_i18n: I18nString | null;
  content_i18n: I18nContent | null;
  completion: { de: boolean; fr: boolean };
}

const LOCALES: readonly Locale[] = ["de", "fr"];

const emptyForm = {
  slug: "",
  external_url: "",
  archived: false,
  titel: { de: "", fr: "" },
  kategorie: { de: "", fr: "" },
  html: { de: "", fr: "" },
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[äÄ]/g, "ae").replace(/[öÖ]/g, "oe").replace(/[üÜ]/g, "ue").replace(/ß/g, "ss")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
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

export function ProjekteSection({ initial }: { initial: Projekt[] }) {
  const [items, setItems] = useState(initial);
  const [editing, setEditing] = useState<Projekt | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Projekt | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editingLocale, setEditingLocale] = useState<Locale>("de");
  const [slugConflict, setSlugConflict] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const dragItem = useRef<number | null>(null);
  const dragOver = useRef<number | null>(null);

  const reload = useCallback(async () => {
    const res = await fetch("/api/dashboard/projekte/");
    const data = await res.json();
    if (data.success) setItems(data.data);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const openCreate = () => {
    setForm(emptyForm);
    setEditingLocale("de");
    setSlugConflict(false);
    setError("");
    setCreating(true);
  };

  const openEdit = (item: Projekt) => {
    const deContent = item.content_i18n?.de ?? null;
    const frContent = item.content_i18n?.fr ?? null;
    setForm({
      slug: item.slug,
      external_url: item.external_url ?? "",
      archived: item.archived,
      titel: {
        de: item.title_i18n?.de ?? item.titel ?? "",
        fr: item.title_i18n?.fr ?? "",
      },
      kategorie: {
        de: item.kategorie_i18n?.de ?? item.kategorie ?? "",
        fr: item.kategorie_i18n?.fr ?? "",
      },
      html: {
        de: deContent && deContent.length > 0 ? blocksToHtml(deContent) : "",
        fr: frContent && frContent.length > 0 ? blocksToHtml(frContent) : "",
      },
    });
    setEditingLocale("de");
    setSlugConflict(false);
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

  const handleSave = async () => {
    setError("");
    setSaving(true);
    const autoSlug = slugify(form.titel.de || form.titel.fr);
    const payload = {
      slug: creating ? (form.slug || autoSlug) : form.slug,
      title_i18n: {
        de: form.titel.de.trim() || null,
        fr: form.titel.fr.trim() || null,
      },
      kategorie_i18n: {
        de: form.kategorie.de.trim() || null,
        fr: form.kategorie.fr.trim() || null,
      },
      content_i18n: {
        de: htmlToBlocks(form.html.de),
        fr: htmlToBlocks(form.html.fr),
      },
      external_url: form.external_url || null,
      archived: form.archived,
    };

    try {
      const url = editing ? `/api/dashboard/projekte/${editing.id}/` : "/api/dashboard/projekte/";
      const res = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) {
        if (res.status === 409 && creating) {
          // Slug collision — reveal slug field pre-filled with auto-slug,
          // let the admin edit and retry.
          setSlugConflict(true);
          setForm((f) => ({ ...f, slug: f.slug || autoSlug }));
          setError("Slug bereits vergeben — bitte anpassen.");
          return;
        }
        setError(data.error || "Fehler beim Speichern");
        return;
      }
      setEditing(null);
      setCreating(false);
      await reload();
    } catch { setError("Verbindungsfehler"); } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/dashboard/projekte/${deleting.id}/`, { method: "DELETE" });
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
      await fetch("/api/dashboard/projekte/reorder/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: reordered.map((e) => e.id) }),
      });
    } catch {
      await reload();
    }
  };

  const showSlugField = creating && slugConflict;
  const autoSlugPreview = creating
    ? slugify(form.titel.de || form.titel.fr)
    : "";

  const formFields = (
    <div className="space-y-4">
      {/* Locale tabs: both editors stay mounted, inactive hidden via CSS.
          Prevents unsaved-keystroke loss in RichTextEditor on tab switch. */}
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Titel ({loc.toUpperCase()})</label>
              <input
                value={form.titel[loc]}
                onChange={(e) =>
                  setForm((f) => ({ ...f, titel: { ...f.titel, [loc]: e.target.value } }))
                }
                className="w-full px-3 py-2 border rounded"
              />
              {creating && loc === "de" && form.titel.de && !showSlugField && (
                <p className="mt-1 text-xs text-gray-500 font-mono">
                  Slug: /{autoSlugPreview || "…"}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Kategorie ({loc.toUpperCase()})</label>
              <input
                value={form.kategorie[loc]}
                onChange={(e) =>
                  setForm((f) => ({ ...f, kategorie: { ...f.kategorie, [loc]: e.target.value } }))
                }
                className="w-full px-3 py-2 border rounded"
                placeholder={loc === "de" ? "z.B. Publikationsreihe" : "p.ex. Collection"}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Beschreibung ({loc.toUpperCase()})</label>
            <RichTextEditor
              value={form.html[loc]}
              onChange={loc === "de" ? updateHtmlDe : updateHtmlFr}
            />
          </div>
        </div>
      ))}

      {/* Shared fields (not per-locale) */}
      <div className="grid grid-cols-2 gap-4 border-t pt-4">
        {showSlugField ? (
          <div>
            <label className="block text-sm font-medium mb-1">Slug</label>
            <input
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              className="w-full px-3 py-2 border rounded font-mono text-sm"
              autoFocus
            />
            <p className="mt-1 text-xs text-red-600">Bisheriger Slug ist vergeben — bitte anpassen.</p>
          </div>
        ) : editing ? (
          <div>
            <label className="block text-sm font-medium mb-1">Slug</label>
            <input
              value={form.slug}
              readOnly
              aria-readonly="true"
              className="w-full px-3 py-2 border rounded font-mono text-sm bg-gray-50 text-gray-600"
              title="Slug ist nach dem Anlegen fix — URLs und Hashtag-Verlinkungen bleiben stabil"
            />
          </div>
        ) : (
          <div />
        )}
        <div>
          <label className="block text-sm font-medium mb-1">Externe URL</label>
          <input value={form.external_url} onChange={(e) => setForm({ ...form, external_url: e.target.value })} className="w-full px-3 py-2 border rounded" />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.archived} onChange={(e) => setForm({ ...form, archived: e.target.checked })} />
        Archiviert
      </label>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <div className="flex gap-3 justify-end">
        <button onClick={() => { setEditing(null); setCreating(false); }} className="px-4 py-2 border rounded hover:bg-gray-50">Abbrechen</button>
        <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 disabled:opacity-50">{saving ? "..." : "Speichern"}</button>
      </div>
    </div>
  );

  const showForm = creating || !!editing;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">{showForm ? (editing ? "Projekt bearbeiten" : "Neues Projekt") : `Projekte (${items.length})`}</h2>
        {!showForm && <button onClick={openCreate} className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 text-sm">+ Neu</button>}
      </div>

      {showForm ? (
        <div className="bg-white border rounded p-6">{formFields}</div>
      ) : (
        <div className="space-y-2">
          <ReorderHint count={items.length} />
          {items.map((item, index) => {
            const displayTitle = item.title_i18n?.de ?? item.title_i18n?.fr ?? item.titel;
            const displayKategorie = item.kategorie_i18n?.de ?? item.kategorie_i18n?.fr ?? item.kategorie;
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
                  <p className="font-medium">
                    {displayTitle}
                    {item.archived && <span className="text-xs bg-gray-200 px-2 py-0.5 rounded ml-1">archiviert</span>}
                  </p>
                  <span className="text-sm text-gray-500">{displayKategorie} · /{item.slug}</span>
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
          {items.length === 0 && <p className="text-gray-500 text-sm">Keine Projekte vorhanden.</p>}
        </div>
      )}

      <DeleteConfirm open={!!deleting} onClose={() => setDeleting(null)} onConfirm={handleDelete} label={deleting?.title_i18n?.de ?? deleting?.title_i18n?.fr ?? deleting?.titel ?? ""} />
    </div>
  );
}
