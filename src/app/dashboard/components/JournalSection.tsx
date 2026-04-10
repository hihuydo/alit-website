"use client";

import { useState } from "react";
import { DeleteConfirm } from "./DeleteConfirm";

export interface JournalEntry {
  id: number;
  date: string;
  author: string | null;
  title: string | null;
  title_border: boolean;
  lines: string[];
  images: { src: string; afterLine: number }[] | null;
  footer: string | null;
  sort_order: number;
}

const empty = { date: "", author: "", title: "", title_border: false, lines: "", footer: "" };

export function JournalSection({ initial }: { initial: JournalEntry[] }) {
  const [entries, setEntries] = useState(initial);
  const [editing, setEditing] = useState<JournalEntry | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<JournalEntry | null>(null);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    const res = await fetch("/api/dashboard/journal/");
    const data = await res.json();
    if (data.success) setEntries(data.data);
  };

  const openCreate = () => {
    setForm(empty);
    setError("");
    setCreating(true);
  };

  const openEdit = (entry: JournalEntry) => {
    setForm({
      date: entry.date,
      author: entry.author ?? "",
      title: entry.title ?? "",
      title_border: entry.title_border,
      lines: entry.lines.join("\n"),
      footer: entry.footer ?? "",
    });
    setError("");
    setEditing(entry);
  };

  const handleSave = async () => {
    setError("");
    setSaving(true);
    const payload = {
      date: form.date,
      author: form.author || null,
      title: form.title || null,
      title_border: form.title_border,
      lines: form.lines.split("\n"),
      footer: form.footer || null,
    };

    try {
      const url = editing ? `/api/dashboard/journal/${editing.id}/` : "/api/dashboard/journal/";
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
      const res = await fetch(`/api/dashboard/journal/${deleting.id}/`, { method: "DELETE" });
      const data = await res.json();
      if (!data.success) { setError(data.error || "Fehler beim Löschen"); return; }
      setDeleting(null);
      await reload();
    } catch { setError("Verbindungsfehler"); } finally { setSaving(false); }
  };

  const formFields = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Datum</label>
          <input value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full px-3 py-2 border rounded" placeholder="2022/03/10," />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Autor</label>
          <input value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} className="w-full px-3 py-2 border rounded" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Titel</label>
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full px-3 py-2 border rounded" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.title_border} onChange={(e) => setForm({ ...form, title_border: e.target.checked })} />
        Titel mit Trennlinie
      </label>
      <div>
        <label className="block text-sm font-medium mb-1">Text (eine Zeile pro Zeile, leere Zeile = Absatz)</label>
        <textarea value={form.lines} onChange={(e) => setForm({ ...form, lines: e.target.value })} rows={12} className="w-full px-3 py-2 border rounded font-mono text-sm" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Footer</label>
        <input value={form.footer} onChange={(e) => setForm({ ...form, footer: e.target.value })} className="w-full px-3 py-2 border rounded" />
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
        <h2 className="text-lg font-semibold">{showForm ? (editing ? "Journal-Eintrag bearbeiten" : "Neuer Journal-Eintrag") : `Journal (${entries.length})`}</h2>
        {!showForm && <button onClick={openCreate} className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 text-sm">+ Neu</button>}
      </div>

      {showForm ? (
        <div className="bg-white border rounded p-6">{formFields}</div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between p-3 bg-white border rounded">
              <div className="min-w-0">
                <span className="text-sm text-gray-500">{entry.date}</span>
                <p className="font-medium truncate">{entry.title || entry.lines[0] || "–"}</p>
                {entry.author && <span className="text-sm text-gray-500">{entry.author}</span>}
              </div>
              <div className="flex gap-2 shrink-0 ml-4">
                <button onClick={() => openEdit(entry)} className="px-3 py-1 text-sm border rounded hover:bg-gray-50">Bearbeiten</button>
                <button onClick={() => setDeleting(entry)} className="px-3 py-1 text-sm border border-red-200 text-red-600 rounded hover:bg-red-50">Löschen</button>
              </div>
            </div>
          ))}
          {entries.length === 0 && <p className="text-gray-500 text-sm">Keine Journal-Einträge vorhanden.</p>}
        </div>
      )}

      <DeleteConfirm open={!!deleting} onClose={() => setDeleting(null)} onConfirm={handleDelete} label={deleting?.title ?? deleting?.date ?? ""} />
    </div>
  );
}
