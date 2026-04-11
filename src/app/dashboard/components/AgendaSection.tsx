"use client";

import { useState, useRef, useCallback } from "react";
import { DeleteConfirm } from "./DeleteConfirm";
import { RichTextEditor } from "./RichTextEditor";
import { blocksToHtml, htmlToBlocks } from "./journal-html-converter";
import type { JournalContent } from "@/lib/journal-types";

export interface AgendaItem {
  id: number;
  datum: string;
  zeit: string;
  ort: string;
  ort_url: string;
  titel: string;
  beschrieb: string[];
  content: JournalContent | null;
  sort_order: number;
}

function linesToHtml(lines: string[]): string {
  if (!lines.length) return "";
  return lines.map((l) => (l ? `<p>${l.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>` : `<p data-block="spacer"><br></p>`)).join("\n");
}

const empty = { datum: "", zeit: "", ort: "", ort_url: "", titel: "", html: "" };

export function AgendaSection({ initial }: { initial: AgendaItem[] }) {
  const [items, setItems] = useState(initial);
  const [editing, setEditing] = useState<AgendaItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<AgendaItem | null>(null);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const dragItem = useRef<number | null>(null);
  const dragOver = useRef<number | null>(null);

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
    const html = item.content && item.content.length > 0
      ? blocksToHtml(item.content)
      : linesToHtml(item.beschrieb);
    setForm({
      datum: item.datum,
      zeit: item.zeit,
      ort: item.ort,
      ort_url: item.ort_url,
      titel: item.titel,
      html,
    });
    setError("");
    setEditing(item);
  };

  const updateHtml = useCallback((h: string) => setForm((f) => ({ ...f, html: h })), []);

  const handleSave = async () => {
    setError("");
    setSaving(true);
    const blocks = htmlToBlocks(form.html);
    const beschrieb: string[] = [];
    for (const b of blocks) {
      if ("content" in b) beschrieb.push(b.content.map((n) => n.text).join(""));
    }
    const payload = {
      datum: form.datum,
      zeit: form.zeit,
      ort: form.ort,
      ort_url: form.ort_url,
      titel: form.titel,
      beschrieb,
      content: blocks,
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
        <label className="block text-sm font-medium mb-1">Beschreibung</label>
        <RichTextEditor value={form.html} onChange={updateHtml} />
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
