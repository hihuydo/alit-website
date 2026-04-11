"use client";

import { useState, useRef } from "react";
import { DeleteConfirm } from "./DeleteConfirm";

export interface Projekt {
  id: number;
  slug: string;
  titel: string;
  kategorie: string;
  paragraphs: string[];
  external_url: string | null;
  archived: boolean;
  sort_order: number;
}

const empty = { slug: "", titel: "", kategorie: "", paragraphs: "", external_url: "", archived: false };

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[äÄ]/g, "ae").replace(/[öÖ]/g, "oe").replace(/[üÜ]/g, "ue").replace(/ß/g, "ss")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

export function ProjekteSection({ initial }: { initial: Projekt[] }) {
  const [items, setItems] = useState(initial);
  const [editing, setEditing] = useState<Projekt | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Projekt | null>(null);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const dragItem = useRef<number | null>(null);
  const dragOver = useRef<number | null>(null);

  const reload = async () => {
    const res = await fetch("/api/dashboard/projekte/");
    const data = await res.json();
    if (data.success) setItems(data.data);
  };

  const openCreate = () => {
    setForm(empty);
    setError("");
    setCreating(true);
  };

  const openEdit = (item: Projekt) => {
    setForm({
      slug: item.slug,
      titel: item.titel,
      kategorie: item.kategorie,
      paragraphs: item.paragraphs.join("\n"),
      external_url: item.external_url ?? "",
      archived: item.archived,
    });
    setError("");
    setEditing(item);
  };

  const handleSave = async () => {
    setError("");
    setSaving(true);
    const payload = {
      slug: form.slug || slugify(form.titel),
      titel: form.titel,
      kategorie: form.kategorie,
      paragraphs: form.paragraphs.split("\n").filter(Boolean),
      external_url: form.external_url || null,
      archived: form.archived,
    };

    try {
      const url = editing ? `/api/dashboard/projekte/${editing.id}/` : "/api/dashboard/projekte/";
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

  const formFields = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Titel</label>
          <input
            value={form.titel}
            onChange={(e) => setForm({ ...form, titel: e.target.value, slug: creating ? slugify(e.target.value) : form.slug })}
            className="w-full px-3 py-2 border rounded"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Slug</label>
          <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} className="w-full px-3 py-2 border rounded font-mono text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Kategorie</label>
          <input value={form.kategorie} onChange={(e) => setForm({ ...form, kategorie: e.target.value })} className="w-full px-3 py-2 border rounded" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Externe URL</label>
          <input value={form.external_url} onChange={(e) => setForm({ ...form, external_url: e.target.value })} className="w-full px-3 py-2 border rounded" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Beschreibung (ein Absatz pro Zeile)</label>
        <textarea value={form.paragraphs} onChange={(e) => setForm({ ...form, paragraphs: e.target.value })} className="w-full px-3 py-2 border rounded resize-y" style={{ height: "calc(100vh - 520px)", minHeight: "150px" }} />
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
          {items.map((item, index) => (
            <div
              key={item.id}
              draggable
              onDragStart={() => { dragItem.current = index; }}
              onDragEnter={() => { dragOver.current = index; }}
              onDragOver={(e) => e.preventDefault()}
              onDragEnd={handleDragEnd}
              className="flex items-center justify-between p-3 bg-white border rounded cursor-grab active:cursor-grabbing"
            >
              <div className="min-w-0">
                <p className="font-medium">{item.titel} {item.archived && <span className="text-xs bg-gray-200 px-2 py-0.5 rounded ml-1">archiviert</span>}</p>
                <span className="text-sm text-gray-500">{item.kategorie} · /{item.slug}</span>
              </div>
              <div className="flex gap-2 shrink-0 ml-4">
                <button onClick={() => openEdit(item)} className="px-3 py-1 text-sm border rounded hover:bg-gray-50">Bearbeiten</button>
                <button onClick={() => setDeleting(item)} className="px-3 py-1 text-sm border border-red-200 text-red-600 rounded hover:bg-red-50">Löschen</button>
              </div>
            </div>
          ))}
          {items.length === 0 && <p className="text-gray-500 text-sm">Keine Projekte vorhanden.</p>}
        </div>
      )}

      <DeleteConfirm open={!!deleting} onClose={() => setDeleting(null)} onConfirm={handleDelete} label={deleting?.titel ?? ""} />
    </div>
  );
}
