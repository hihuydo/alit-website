"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { DeleteConfirm } from "./DeleteConfirm";

interface AgendaItem {
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

  const reload = async () => {
    const res = await fetch("/api/dashboard/agenda/");
    const data = await res.json();
    if (data.success) setItems(data.data);
  };

  const openCreate = () => {
    setForm(empty);
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
    setEditing(item);
  };

  const handleSave = async () => {
    const payload = {
      datum: form.datum,
      zeit: form.zeit,
      ort: form.ort,
      ort_url: form.ort_url,
      titel: form.titel,
      beschrieb: form.beschrieb.split("\n").filter(Boolean),
    };

    if (editing) {
      await fetch(`/api/dashboard/agenda/${editing.id}/`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    } else {
      await fetch("/api/dashboard/agenda/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    }

    setEditing(null);
    setCreating(false);
    await reload();
  };

  const handleDelete = async () => {
    if (!deleting) return;
    await fetch(`/api/dashboard/agenda/${deleting.id}/`, { method: "DELETE" });
    setDeleting(null);
    await reload();
  };

  const formFields = (
    <div className="space-y-4">
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
        <label className="block text-sm font-medium mb-1">Beschreibung (ein Absatz pro Zeile)</label>
        <textarea value={form.beschrieb} onChange={(e) => setForm({ ...form, beschrieb: e.target.value })} rows={6} className="w-full px-3 py-2 border rounded" />
      </div>
      <div className="flex gap-3 justify-end">
        <button onClick={() => { setEditing(null); setCreating(false); }} className="px-4 py-2 border rounded hover:bg-gray-50">Abbrechen</button>
        <button onClick={handleSave} className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800">Speichern</button>
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Agenda ({items.length})</h2>
        <button onClick={openCreate} className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 text-sm">+ Neu</button>
      </div>

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

      <Modal open={creating} onClose={() => setCreating(false)} title="Neuer Agenda-Eintrag">
        {formFields}
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Agenda-Eintrag bearbeiten">
        {formFields}
      </Modal>

      <DeleteConfirm open={!!deleting} onClose={() => setDeleting(null)} onConfirm={handleDelete} label={deleting?.titel ?? ""} />
    </div>
  );
}
