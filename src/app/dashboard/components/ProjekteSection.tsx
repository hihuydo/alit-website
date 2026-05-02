"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { DeleteConfirm } from "./DeleteConfirm";
import { DragHandle } from "./DragHandle";
import { ListRow } from "./ListRow";
import { RichTextEditor } from "./RichTextEditor";
import { blocksToHtml, htmlToBlocks } from "./journal-html-converter";
import type { JournalContent } from "@/lib/journal-types";
import { useDirty } from "../DirtyContext";
import { dashboardFetch } from "../lib/dashboardFetch";
import type { Locale } from "@/lib/i18n-field";

type I18nString = { de?: string | null; fr?: string | null };
type I18nContent = { de?: JournalContent | null; fr?: JournalContent | null };

export interface Projekt {
  id: number;
  slug_de: string;
  slug_fr: string | null;
  archived: boolean;
  sort_order: number;
  title_i18n: I18nString | null;
  kategorie_i18n: I18nString | null;
  content_i18n: I18nContent | null;
  show_newsletter_signup: boolean;
  completion: { de: boolean; fr: boolean };
}

const LOCALES: readonly Locale[] = ["de", "fr"];

const emptyForm = {
  slug_de: "",
  slug_fr: "",
  archived: false,
  titel: { de: "", fr: "" },
  kategorie: { de: "", fr: "" },
  html: { de: "", fr: "" },
  show_newsletter_signup: false,
};

// Must produce output that passes server-side validateSlug(): lowercase
// ASCII letters+digits, hyphen-separated, no leading/trailing/doubled
// hyphens, length 1-100. \w would allow underscores which validateSlug
// rejects, so we use an explicit ASCII-only char class.
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[äÄ]/g, "ae").replace(/[öÖ]/g, "oe").replace(/[üÜ]/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim()
    .slice(0, 100);
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

export function ProjekteSection({ initial, onItemsChange, resetSignal }: { initial: Projekt[]; onItemsChange?: (items: Projekt[]) => void; resetSignal?: number }) {
  const [items, setItems] = useState(initial);

  // Notify parent on every items change so sibling sections (Journal,
  // Agenda HashtagEditor) see freshly added/removed/renamed projects
  // without a full page reload. Ref avoids re-firing when the parent
  // stores a fresh closure each render.
  const onItemsChangeRef = useRef(onItemsChange);
  useEffect(() => { onItemsChangeRef.current = onItemsChange; }, [onItemsChange]);
  useEffect(() => { onItemsChangeRef.current?.(items); }, [items]);
  const [editing, setEditing] = useState<Projekt | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Projekt | null>(null);

  // Tab-reset (see AgendaSection).
  useEffect(() => {
    setEditing(null);
    setCreating(false);
    setDeleting(null);
  }, [resetSignal]);
  const [form, setForm] = useState(emptyForm);
  const [editingLocale, setEditingLocale] = useState<Locale>("de");
  // Separate slug error fields let 409-UX point at the specific input
  // that caused the collision (DE vs FR), per spec §17.
  const [slugDeError, setSlugDeError] = useState("");
  const [slugFrError, setSlugFrError] = useState("");
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

  const clearSlugErrors = () => { setSlugDeError(""); setSlugFrError(""); };

  // Snapshot of form state right after open — see AgendaSection for rationale.
  const initialFormRef = useRef<string>("");

  const openCreate = () => {
    setForm(emptyForm);
    initialFormRef.current = JSON.stringify(emptyForm);
    setEditingLocale("de");
    clearSlugErrors();
    setError("");
    setCreating(true);
  };

  const openEdit = (item: Projekt) => {
    const deContent = item.content_i18n?.de ?? null;
    const frContent = item.content_i18n?.fr ?? null;
    const nextForm = {
      slug_de: item.slug_de,
      slug_fr: item.slug_fr ?? "",
      archived: item.archived,
      titel: {
        de: item.title_i18n?.de ?? "",
        fr: item.title_i18n?.fr ?? "",
      },
      kategorie: {
        de: item.kategorie_i18n?.de ?? "",
        fr: item.kategorie_i18n?.fr ?? "",
      },
      html: {
        de: deContent && deContent.length > 0 ? blocksToHtml(deContent) : "",
        fr: frContent && frContent.length > 0 ? blocksToHtml(frContent) : "",
      },
      show_newsletter_signup: item.show_newsletter_signup,
    };
    setForm(nextForm);
    initialFormRef.current = JSON.stringify(nextForm);
    setEditingLocale("de");
    clearSlugErrors();
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

  // Auto-suggest: when the FR-slug input is focused and still empty,
  // pre-fill it with the current slug_de. User can accept, edit, or
  // clear (empty on save = null, no FR alias). Matches the Hashtag-
  // Editor FR-auto-sync pattern from PR #37.
  const handleSlugFrFocus = () => {
    setForm((f) => (f.slug_fr ? f : { ...f, slug_fr: f.slug_de }));
  };

  const handleSave = async () => {
    setError("");
    clearSlugErrors();
    setSaving(true);

    const autoSlug = slugify(form.titel.de || form.titel.fr);
    const finalSlugDe = (form.slug_de || autoSlug).trim();

    // Intra-row distinctness check client-side — cheaper UX than round-tripping.
    const trimmedSlugFr = form.slug_fr.trim();
    if (creating && !finalSlugDe) {
      setSlugDeError("URL-Slug (DE) ist erforderlich");
      setSaving(false);
      return;
    }
    if (trimmedSlugFr && trimmedSlugFr === finalSlugDe) {
      setSlugFrError("URL-Slug (FR) muss sich vom DE-Slug unterscheiden");
      setSaving(false);
      return;
    }

    // POST carries slug_de + slug_fr; PUT carries ONLY slug_fr (slug_de
    // is immutable after create, server rejects it with 400).
    const payload = creating
      ? {
          slug_de: finalSlugDe,
          slug_fr: trimmedSlugFr || null,
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
          archived: form.archived,
          show_newsletter_signup: form.show_newsletter_signup,
        }
      : {
          slug_fr: trimmedSlugFr || null,
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
          archived: form.archived,
          show_newsletter_signup: form.show_newsletter_signup,
        };

    try {
      const url = editing ? `/api/dashboard/projekte/${editing.id}/` : "/api/dashboard/projekte/";
      const res = await dashboardFetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) {
        if (res.status === 409) {
          // Route response identifies which slug collided in the message
          // (spec §7/12). Split the error onto the right field.
          const msg = String(data.error ?? "");
          if (msg.includes("slug_fr")) {
            setSlugFrError(msg);
          } else {
            setSlugDeError(msg || "Slug bereits vergeben");
          }
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
      const res = await dashboardFetch(`/api/dashboard/projekte/${deleting.id}/`, { method: "DELETE" });
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
      const res = await dashboardFetch("/api/dashboard/projekte/reorder/", {
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
              {creating && loc === "de" && form.titel.de && !form.slug_de && (
                <p className="mt-1 text-xs text-gray-500 font-mono">
                  DE-Slug: /{autoSlugPreview || "…"}
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
        <div>
          <label className="block text-sm font-medium mb-1">
            URL-Slug (DE)
            {creating && <span className="text-gray-400 font-normal"> — aus Titel abgeleitet wenn leer</span>}
          </label>
          <input
            value={form.slug_de}
            onChange={(e) => { setForm((f) => ({ ...f, slug_de: e.target.value })); setSlugDeError(""); }}
            readOnly={!creating}
            aria-readonly={!creating}
            className={`w-full px-3 py-2 border rounded font-mono text-sm ${
              !creating ? "bg-gray-50 text-gray-600" : slugDeError ? "border-red-400" : ""
            }`}
            placeholder={creating ? autoSlugPreview || "z.B. essais-agites" : undefined}
            title={!creating ? "Der DE-Slug ist nach dem Anlegen fix — URLs und Hashtag-Verlinkungen bleiben stabil" : undefined}
          />
          {slugDeError && <p className="mt-1 text-xs text-red-600">{slugDeError}</p>}
          {!creating && !slugDeError && (
            <p className="mt-1 text-xs text-gray-400">Der DE-Slug ist nach dem Anlegen fix.</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            URL-Slug (FR) <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            value={form.slug_fr}
            onFocus={handleSlugFrFocus}
            onChange={(e) => { setForm((f) => ({ ...f, slug_fr: e.target.value })); setSlugFrError(""); }}
            className={`w-full px-3 py-2 border rounded font-mono text-sm ${slugFrError ? "border-red-400" : ""}`}
            placeholder="leer lassen = DE-Slug wird für /fr/-URL verwendet"
          />
          {slugFrError && <p className="mt-1 text-xs text-red-600">{slugFrError}</p>}
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.archived} onChange={(e) => setForm({ ...form, archived: e.target.checked })} />
        Archiviert
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.show_newsletter_signup}
          onChange={(e) => setForm({ ...form, show_newsletter_signup: e.target.checked })}
        />
        Newsletter-Signup auf Projekt-Seite anzeigen
      </label>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <div className="flex gap-3 justify-end">
        <button onClick={() => { setEditing(null); setCreating(false); }} className="px-4 py-2 border rounded hover:bg-gray-50">Abbrechen</button>
        <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 disabled:opacity-50">{saving ? "..." : "Speichern"}</button>
      </div>
    </div>
  );

  const showForm = creating || !!editing;
  const isEdited = showForm && JSON.stringify(form) !== initialFormRef.current;

  // Synchronous dirty-signal propagation (see AgendaSection for rationale).
  const { setDirty } = useDirty();
  const lastReportedRef = useRef(false);
  if (isEdited !== lastReportedRef.current) {
    lastReportedRef.current = isEdited;
    setDirty("projekte", isEdited);
  }
  useEffect(() => () => setDirty("projekte", false), [setDirty]);

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
          {items.map((item, index) => {
            const displayTitle = item.title_i18n?.de ?? item.title_i18n?.fr ?? "";
            const displayKategorie = item.kategorie_i18n?.de ?? item.kategorie_i18n?.fr ?? "";
            const slugsLabel = item.slug_fr
              ? `/de/${item.slug_de} · /fr/${item.slug_fr}`
              : `/${item.slug_de}`;
            return (
              <ListRow
                key={item.id}
                draggable
                dataAttrs={{
                  "data-completion-de": String(item.completion.de),
                  "data-completion-fr": String(item.completion.fr),
                }}
                onDragStart={() => { dragItem.current = index; }}
                onDragEnter={() => { dragOver.current = index; }}
                onDragOver={(e) => e.preventDefault()}
                onDragEnd={handleDragEnd}
                className="group bg-white border rounded cursor-grab active:cursor-grabbing hoverable:hover:border-gray-400 hoverable:hover:bg-gray-50/50 transition-colors"
                dragHandle={<DragHandle />}
                content={
                  <>
                    <p className="font-medium">
                      {displayTitle}
                      {item.archived && <span className="text-xs bg-gray-200 px-2 py-0.5 rounded ml-1">archiviert</span>}
                    </p>
                    <span className="text-sm text-gray-500">{displayKategorie} · {slugsLabel}</span>
                  </>
                }
                badges={
                  <>
                    <CompletionBadge locale="de" done={item.completion.de} />
                    <CompletionBadge locale="fr" done={item.completion.fr} />
                  </>
                }
                actions={[
                  { label: "Bearbeiten", onClick: () => openEdit(item) },
                  { label: "Löschen", onClick: () => setDeleting(item), variant: "danger" },
                ]}
              />
            );
          })}
          {items.length === 0 && <p className="text-gray-500 text-sm">Keine Projekte vorhanden.</p>}
        </div>
      )}

      <DeleteConfirm open={!!deleting} onClose={() => setDeleting(null)} onConfirm={handleDelete} label={deleting?.title_i18n?.de ?? deleting?.title_i18n?.fr ?? ""} />
    </div>
  );
}
