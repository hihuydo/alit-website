"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { DeleteConfirm } from "./DeleteConfirm";
import { DragHandle, ReorderHint } from "./DragHandle";
import { RichTextEditor } from "./RichTextEditor";
import { blocksToHtml, htmlToBlocks } from "./journal-html-converter";
import type { JournalContent } from "@/lib/journal-types";

export interface AlitSectionItem {
  id: number;
  title: string | null;
  content: JournalContent | null;
  sort_order: number;
  locale: string;
}

const empty = { title: "", html: "" };

function preview(content: JournalContent | null, fallback: string): string {
  if (!content || content.length === 0) return fallback;
  for (const block of content) {
    if (!("content" in block)) continue;
    const text = block.content.map((n) => n.text).join("").trim();
    if (text) return text.length > 80 ? text.slice(0, 80) + "…" : text;
  }
  return fallback;
}

export function AlitSection({ initial }: { initial: AlitSectionItem[] }) {
  const [items, setItems] = useState(initial);
  const [editing, setEditing] = useState<AlitSectionItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<AlitSectionItem | null>(null);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const dragItem = useRef<number | null>(null);
  const dragOver = useRef<number | null>(null);

  const reload = useCallback(async () => {
    const res = await fetch("/api/dashboard/alit/");
    const data = await res.json();
    if (data.success) setItems(data.data);
  }, []);

  // Refetch on mount — parent fetches `initial` only once per session.
  useEffect(() => { reload(); }, [reload]);

  const openCreate = () => {
    setForm(empty);
    setError("");
    setCreating(true);
  };

  const openEdit = (item: AlitSectionItem) => {
    setForm({
      title: item.title ?? "",
      html: item.content && item.content.length > 0 ? blocksToHtml(item.content) : "",
    });
    setError("");
    setEditing(item);
  };

  const updateHtml = useCallback((h: string) => setForm((f) => ({ ...f, html: h })), []);

  const handleSave = async () => {
    setError("");
    setSaving(true);
    const blocks = htmlToBlocks(form.html);
    const payload = {
      title: form.title.trim() ? form.title.trim() : null,
      content: blocks,
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
      await fetch("/api/dashboard/alit/reorder/", {
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
      <div>
        <label className="block text-sm font-medium mb-1">Titel <span className="text-gray-400 font-normal">(optional — leer lassen für Intro-Block ohne Überschrift)</span></label>
        <input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          className="w-full px-3 py-2 border rounded"
          placeholder="z.B. Projektpartner"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Inhalt</label>
        {/* Media-Toolbar deliberately omitted (no onOpenMediaPicker) — image
            embedding is out of scope for Alit sections per spec. */}
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
        <h2 className="text-lg font-semibold">{showForm ? (editing ? "Sektion bearbeiten" : "Neue Sektion") : `Über Alit (${items.length} Sektionen)`}</h2>
        {!showForm && <button onClick={openCreate} className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 text-sm">+ Neu</button>}
      </div>

      {showForm ? (
        <div className="bg-white border rounded p-6">{formFields}</div>
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
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">
                  {item.title ?? <span className="italic text-gray-500">(ohne Titel — Intro)</span>}
                </p>
                <span className="text-sm text-gray-500 truncate block">{preview(item.content, "(leer)")}</span>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => openEdit(item)} className="px-3 py-1 text-sm border rounded hover:bg-gray-50">Bearbeiten</button>
                <button onClick={() => setDeleting(item)} className="px-3 py-1 text-sm border border-red-200 text-red-600 rounded hover:bg-red-50">Löschen</button>
              </div>
            </div>
          ))}
          {items.length === 0 && <p className="text-gray-500 text-sm">Keine Sektionen vorhanden.</p>}
        </div>
      )}

      <DeleteConfirm open={!!deleting} onClose={() => setDeleting(null)} onConfirm={handleDelete} label={deleting?.title ?? "diese Sektion"} />
    </div>
  );
}
