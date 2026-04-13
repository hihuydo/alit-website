"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { DeleteConfirm } from "./DeleteConfirm";
import { DragHandle, ReorderHint } from "./DragHandle";
import { RichTextEditor } from "./RichTextEditor";
import { blocksToHtml, htmlToBlocks } from "./journal-html-converter";
import type { JournalContent } from "@/lib/journal-types";
import { AgendaItem as AgendaItemPreview } from "@/components/AgendaItem";
import { ALLOWED_HASHTAGS } from "@/lib/agenda-hashtags-shared";

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
  hashtags: { tag: string; projekt_slug: string }[] | null;
  sort_order: number;
}

interface ProjektOption {
  slug: string;
  titel: string;
}

interface HashtagDraft {
  uid: string;
  tag: string;
  projekt_slug: string;
}

let hashtagUidCounter = 0;
const newHashtagUid = () => `ht-${++hashtagUidCounter}`;

function linesToHtml(lines: string[]): string {
  if (!lines.length) return "";
  return lines.map((l) => (l ? `<p>${l.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>` : `<p data-block="spacer"><br></p>`)).join("\n");
}

const empty = { datum: "", zeit: "", ort: "", ort_url: "", titel: "", lead: "", html: "", hashtags: [] as HashtagDraft[] };

export function AgendaSection({ initial, projekte }: { initial: AgendaItem[]; projekte: ProjektOption[] }) {
  const [items, setItems] = useState(initial);
  const [editing, setEditing] = useState<AgendaItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<AgendaItem | null>(null);
  const [form, setForm] = useState<typeof empty>(empty);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const dragItem = useRef<number | null>(null);
  const dragOver = useRef<number | null>(null);

  const reload = async () => {
    const res = await fetch("/api/dashboard/agenda/");
    const data = await res.json();
    if (data.success) setItems(data.data);
  };

  // Refetch on mount — the parent (dashboard/page.tsx) fetches `initial` only
  // once, so switching tabs would otherwise show stale state.
  useEffect(() => { reload(); }, []);

  const openCreate = () => {
    setForm(empty);
    setError("");
    setCreating(true);
  };

  const openEdit = (item: AgendaItem) => {
    const html = item.content && item.content.length > 0
      ? blocksToHtml(item.content)
      : linesToHtml(item.beschrieb);
    setForm({
      datum: item.datum,
      zeit: item.zeit,
      ort: item.ort,
      ort_url: item.ort_url,
      titel: item.titel,
      lead: item.lead ?? "",
      html,
      hashtags: (item.hashtags ?? []).map((h) => ({ ...h, uid: newHashtagUid() })),
    });
    setError("");
    setEditing(item);
  };

  const updateHtml = useCallback((h: string) => setForm((f) => ({ ...f, html: h })), []);

  const previewItem = useMemo(() => {
    const blocks = showPreview ? htmlToBlocks(form.html) : [];
    const beschrieb: string[] = [];
    for (const b of blocks) {
      if ("content" in b) beschrieb.push(b.content.map((n) => n.text).join(""));
    }
    const validHashtags = form.hashtags
      .map((h) => ({ tag: h.tag.trim().replace(/^#+/, ""), projekt_slug: h.projekt_slug.trim() }))
      .filter((h) => h.tag && h.projekt_slug);
    return {
      datum: form.datum || "Datum",
      zeit: form.zeit || "Zeit",
      ort: form.ort || "Ort",
      ortUrl: form.ort_url || "#",
      titel: form.titel || "Titel",
      lead: form.lead.trim() || null,
      beschrieb,
      content: blocks.length > 0 ? blocks : null,
      hashtags: validHashtags,
    };
  }, [showPreview, form]);

  const addHashtag = () => setForm((f) => ({ ...f, hashtags: [...f.hashtags, { uid: newHashtagUid(), tag: "", projekt_slug: "" }] }));
  const updateHashtag = (i: number, patch: Partial<HashtagDraft>) =>
    setForm((f) => ({ ...f, hashtags: f.hashtags.map((h, idx) => (idx === i ? { ...h, ...patch } : h)) }));
  const removeHashtag = (i: number) =>
    setForm((f) => ({ ...f, hashtags: f.hashtags.filter((_, idx) => idx !== i) }));

  const handleSave = async () => {
    setError("");
    setSaving(true);
    const blocks = htmlToBlocks(form.html);
    const beschrieb: string[] = [];
    for (const b of blocks) {
      if ("content" in b) beschrieb.push(b.content.map((n) => n.text).join(""));
    }
    const cleanedHashtags = form.hashtags
      .map((h) => ({ tag: h.tag.trim().replace(/^#+/, ""), projekt_slug: h.projekt_slug.trim() }))
      .filter((h) => h.tag && h.projekt_slug);
    if (cleanedHashtags.length !== form.hashtags.length) {
      setError("Jeder Hashtag braucht einen Namen und ein verknüpftes Projekt.");
      setSaving(false);
      return;
    }
    const payload = {
      datum: form.datum,
      zeit: form.zeit,
      ort: form.ort,
      ort_url: form.ort_url,
      titel: form.titel,
      lead: form.lead.trim() || null,
      beschrieb,
      content: blocks,
      hashtags: cleanedHashtags,
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
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Ort</label>
          <input value={form.ort} onChange={(e) => setForm({ ...form, ort: e.target.value })} className="w-full px-3 py-2 border rounded" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Ort URL</label>
          <input value={form.ort_url} onChange={(e) => setForm({ ...form, ort_url: e.target.value })} className="w-full px-3 py-2 border rounded" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Titel</label>
        <input value={form.titel} onChange={(e) => setForm({ ...form, titel: e.target.value })} className="w-full px-3 py-2 border rounded" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Lead</label>
        <textarea
          value={form.lead}
          onChange={(e) => setForm({ ...form, lead: e.target.value })}
          className="w-full px-3 py-2 border rounded resize-y"
          rows={2}
          placeholder="Kurzer Teaser unter dem Titel (optional)"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Beschreibung</label>
        <RichTextEditor value={form.html} onChange={updateHtml} />
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium">Hashtags</label>
          <button
            type="button"
            onClick={addHashtag}
            disabled={form.hashtags.length >= ALLOWED_HASHTAGS.length}
            className="text-xs px-2 py-1 border rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            + Hashtag
          </button>
        </div>
        {form.hashtags.length === 0 ? (
          <p className="text-xs text-gray-500">
            Noch keine Hashtags. Aus der vorgegebenen Liste wählen und jedem Tag ein Projekt zuordnen — erscheint am Ende des Agenda-Eintrags.
          </p>
        ) : (
          <div className="space-y-2">
            {form.hashtags.map((h, i) => {
              const usedTags = new Set(form.hashtags.map((x, idx) => (idx !== i ? x.tag : "")));
              return (
                <div key={h.uid} className="flex items-center gap-2">
                  <div className="flex items-center flex-1">
                    <span className="text-gray-400 font-mono px-2">#</span>
                    <select
                      value={h.tag}
                      onChange={(e) => updateHashtag(i, { tag: e.target.value })}
                      className="flex-1 px-3 py-2 border rounded bg-white text-sm font-mono"
                    >
                      <option value="">Hashtag wählen…</option>
                      {ALLOWED_HASHTAGS.map((t) => (
                        <option key={t} value={t} disabled={usedTags.has(t)}>
                          #{t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <select
                    value={h.projekt_slug}
                    onChange={(e) => updateHashtag(i, { projekt_slug: e.target.value })}
                    className="flex-1 px-3 py-2 border rounded bg-white text-sm"
                  >
                    <option value="">Projekt wählen…</option>
                    {projekte.map((p) => (
                      <option key={p.slug} value={p.slug}>{p.titel}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeHashtag(i)}
                    className="px-2 py-2 text-sm text-red-600 border border-red-200 rounded hover:bg-red-50"
                    aria-label="Hashtag entfernen"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
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
        <h2 className="text-lg font-semibold">{showForm ? (editing ? "Agenda-Eintrag bearbeiten" : "Neuer Agenda-Eintrag") : `Agenda (${items.length})`}</h2>
        {!showForm && <button onClick={openCreate} className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 text-sm">+ Neu</button>}
      </div>

      {showForm ? (
        <div className={showPreview ? "grid grid-cols-2 gap-6 items-start" : ""}>
          <div className="bg-white border rounded p-6">{formFields}</div>
          {showPreview && (
            <div className="sticky top-6">
              <h3 className="text-sm font-semibold mb-2 text-gray-600">Vorschau</h3>
              <div className="bg-white">
                <AgendaItemPreview item={previewItem} defaultExpanded />
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <ReorderHint count={items.length} />
          {items.map((item, index) => (
            <div
              key={item.id}
              draggable
              onDragStart={() => { dragItem.current = index; }}
              onDragEnter={() => { dragOver.current = index; }}
              onDragOver={(e) => e.preventDefault()}
              onDragEnd={handleDragEnd}
              className="group flex items-center justify-between gap-3 p-3 bg-white border rounded cursor-grab active:cursor-grabbing hoverable:hover:border-gray-400 hoverable:hover:bg-gray-50/50 transition-colors"
            >
              <DragHandle />
              <div className="flex-1 min-w-0">
                <span className="text-sm text-gray-500">{item.datum} {item.zeit}</span>
                <p className="font-medium">{item.titel}</p>
                <span className="text-sm text-gray-500">{item.ort}</span>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => openEdit(item)} className="px-3 py-1 text-sm border rounded hover:bg-gray-50">Bearbeiten</button>
                <button onClick={() => setDeleting(item)} className="px-3 py-1 text-sm border border-red-200 text-red-600 rounded hover:bg-red-50">Löschen</button>
              </div>
            </div>
          ))}
          {items.length === 0 && <p className="text-gray-500 text-sm">Keine Agenda-Einträge vorhanden.</p>}
        </div>
      )}

      <DeleteConfirm open={!!deleting} onClose={() => setDeleting(null)} onConfirm={handleDelete} label={deleting?.titel ?? ""} />
    </div>
  );
}
