"use client";

import { useState } from "react";
import { DeleteConfirm } from "./DeleteConfirm";

export interface AgendaItem {
  id: number;
  datum: string;
  zeit: string;
  ort: string;
  ort_url: string;
  titel: string;
  beschrieb: string[];
  sort_order: number;
}

const empty = { datum: "", zeit: "", ort: "", ort_url: "", titel: "", beschrieb: "" };

export function AgendaSection({ initial }: { initial: AgendaItem[] }) {
  const [items, setItems] = useState(initial);
  const [editing, setEditing] = useState<AgendaItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<AgendaItem | null>(null);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    const res = await fetch("/api/dashboard/agenda/");
    const data = await res.json();
    if (data.success) setItems(data.data);
  };

  const openCreate = () => {
    setForm(empty);
    setError("");
    setCreating(true);
  };

  const openEdit = (item: AgendaItem) => {
    setForm({
      datum: item.datum,
      zeit: item.zeit,
      ort: item.ort,
      ort_url: item.ort_url,
      titel: item.titel,
      beschrieb: item.beschrieb.join("\n"),
    });
    setError("");
    setEditing(item);
  };

  const handleSave = async () => {
    setError("");
    setSaving(true);
    const payload = {
      datum: form.datum,
      zeit: form.zeit,
      ort: form.ort,
      ort_url: form.ort_url,
      titel: form.titel,
      beschrieb: form.beschrieb.split("\n").filter(Boolean),
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

  const formFields = (
    <div className="flex flex-col gap-4 h-full">
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
      <div className="flex flex-col flex-1 min-h-0">
        <label className="block text-sm font-medium mb-1">Beschreibung (ein Absatz pro Zeile)</label>
        <textarea value={form.beschrieb} onChange={(e) => setForm({ ...form, beschrieb: e.target.value })} className="w-full px-3 py-2 border rounded flex-1 min-h-[120px] resize-y" />
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
        <div className="bg-white border rounded p-6 flex flex-col" style={{ height: "calc(100vh - 160px)" }}>{formFields}</div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between p-3 bg-white border rounded">
              <div>
                <span className="text-sm text-gray-500">{item.datum} {item.zeit}</span>
                <p className="font-medium">{item.titel}</p>
                <span className="text-sm text-gray-500">{item.ort}</span>
              </div>
              <div className="flex gap-2 shrink-0 ml-4">
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
