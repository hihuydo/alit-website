"use client";

import { useState, useRef } from "react";
import { DeleteConfirm } from "./DeleteConfirm";

export interface MediaItem {
  id: number;
  public_id: string;
  filename: string;
  mime_type: string;
  size: number;
  created_at: string;
  used_in?: { kind: "journal" | "agenda" | "alit"; id: number; label: string }[];
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isVideo(mimeType: string): boolean {
  return mimeType.startsWith("video/");
}

function isPdf(mimeType: string): boolean {
  return mimeType === "application/pdf";
}

function isImage(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

// Badge for non-image/non-video media (PDF, ZIP) — no thumbnail is possible.
// `size` switches between the grid tile (square) and the list tile (small box).
function DocBadge({ mimeType, size }: { mimeType: string; size: "grid" | "list" }) {
  const label = isPdf(mimeType) ? "PDF" : "ZIP";
  const color = isPdf(mimeType)
    ? "bg-red-50 text-red-700 border-red-200"
    : "bg-gray-100 text-gray-700 border-gray-300";
  if (size === "list") {
    return (
      <div className={`w-12 h-12 shrink-0 rounded border flex items-center justify-center text-xs font-bold tracking-wider ${color}`}>
        {label}
      </div>
    );
  }
  return (
    <div className={`aspect-square border flex items-center justify-center text-2xl font-bold tracking-wider ${color}`}>
      {label}
    </div>
  );
}

// Relative path — domain-stable, safe to embed into content (survives domain changes).
function internalUrl(item: MediaItem): string {
  return `/api/media/${item.public_id}/`;
}

// Absolute URL — for sharing externally (email, chat). Uses the current origin,
// so after a domain switch the admin gets links against the active domain.
function externalUrl(item: MediaItem): string {
  return `${window.location.origin}/api/media/${item.public_id}/`;
}

function downloadUrl(item: MediaItem): string {
  return `/api/media/${item.public_id}/?download=1`;
}

type ViewMode = "grid" | "list";

export function MediaSection({ initial }: { initial: MediaItem[] }) {
  const [items, setItems] = useState(initial);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<MediaItem | null>(null);
  const [view, setView] = useState<ViewMode>("list");
  const [copied, setCopied] = useState<{ id: number; kind: "internal" | "external" } | null>(null);
  // Inline-rename state. `saving=true` disables input + buttons during PUT.
  // Replaces the old window.prompt() flow so the editor never leaves the
  // dashboard (and so dirty-tracking can be added in a follow-up).
  const [renameState, setRenameState] = useState<{ id: number; draft: string; saving: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = async () => {
    const res = await fetch("/api/dashboard/media/");
    const data = await res.json();
    if (data.success) setItems(data.data);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/dashboard/media/", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Upload fehlgeschlagen");
      } else {
        await reload();
      }
    } catch {
      setError("Verbindungsfehler");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const copyUrl = async (item: MediaItem, kind: "internal" | "external") => {
    const url = kind === "internal" ? internalUrl(item) : externalUrl(item);
    await navigator.clipboard.writeText(url);
    setCopied({ id: item.id, kind });
    setTimeout(() => setCopied(null), 2000);
  };

  const startRename = (item: MediaItem) => {
    // Single-edit guard: clicking a second rename-button while one is open
    // is ignored (buttons are also disabled). Avoids losing a half-typed draft.
    if (renameState !== null) return;
    setError("");
    setRenameState({ id: item.id, draft: item.filename, saving: false });
  };

  const cancelRename = () => {
    // Only clear on explicit cancel; a successful save clears in commit-path.
    // Ignore when a request is in flight so Escape doesn't orphan the PUT.
    if (renameState?.saving) return;
    setRenameState(null);
  };

  const commitRename = async (item: MediaItem) => {
    if (!renameState || renameState.id !== item.id || renameState.saving) return;
    const trimmed = renameState.draft.trim();
    if (!trimmed || trimmed === item.filename) {
      setRenameState(null);
      return;
    }
    setRenameState({ ...renameState, saving: true });
    try {
      const res = await fetch(`/api/dashboard/media/${item.id}/`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: trimmed }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Umbenennen fehlgeschlagen");
        // Leave the input open with the user's draft so they can retry /
        // correct it instead of re-entering from scratch.
        setRenameState({ ...renameState, saving: false });
        return;
      }
      setRenameState(null);
      await reload();
    } catch {
      setError("Verbindungsfehler");
      setRenameState({ ...renameState, saving: false });
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      const res = await fetch(`/api/dashboard/media/${deleting.id}/`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Fehler beim Löschen");
        return;
      }
      setDeleting(null);
      await reload();
    } catch {
      setError("Verbindungsfehler");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Medien ({items.length})</h2>
        <div className="flex items-center gap-2">
          <div className="flex border rounded overflow-hidden text-sm">
            <button
              type="button"
              onClick={() => setView("grid")}
              className={`px-2.5 py-1.5 ${view === "grid" ? "bg-gray-200" : "hover:bg-gray-50"}`}
              title="Grid"
            >
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1" /><rect x="9" y="1" width="6" height="6" rx="1" /><rect x="1" y="9" width="6" height="6" rx="1" /><rect x="9" y="9" width="6" height="6" rx="1" /></svg>
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              className={`px-2.5 py-1.5 border-l ${view === "list" ? "bg-gray-200" : "hover:bg-gray-50"}`}
              title="Liste"
            >
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="2" width="14" height="2.5" rx="0.5" /><rect x="1" y="6.75" width="14" height="2.5" rx="0.5" /><rect x="1" y="11.5" width="14" height="2.5" rx="0.5" /></svg>
            </button>
          </div>
          <label className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 text-sm cursor-pointer">
            {uploading ? "Lädt hoch..." : "+ Hochladen"}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,application/pdf,application/zip,application/x-zip-compressed,.pdf,.zip"
              onChange={handleUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      {items.length === 0 ? (
        <p className="text-gray-500 text-sm">
          Keine Medien vorhanden. Lade Bilder, Videos, PDFs oder ZIP-Dateien hoch.
        </p>
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="group relative border rounded overflow-hidden bg-white"
            >
              {isImage(item.mime_type) ? (
                <img
                  src={`/api/media/${item.public_id}/`}
                  alt={item.filename}
                  className="aspect-square object-cover w-full"
                  loading="lazy"
                />
              ) : isVideo(item.mime_type) ? (
                <div className="aspect-square bg-gray-100 flex items-center justify-center text-gray-400">
                  <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                  </svg>
                </div>
              ) : (
                <DocBadge mimeType={item.mime_type} size="grid" />
              )}
              <div className="p-2">
                {renameState?.id === item.id ? (
                  <input
                    type="text"
                    value={renameState.draft}
                    autoFocus
                    disabled={renameState.saving}
                    onChange={(e) =>
                      setRenameState((s) => (s ? { ...s, draft: e.target.value } : s))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void commitRename(item);
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        cancelRename();
                      }
                    }}
                    onBlur={() => void commitRename(item)}
                    aria-label={`Dateiname bearbeiten für ${item.filename}`}
                    className="w-full px-1 py-0.5 text-xs border border-black rounded disabled:opacity-50"
                  />
                ) : (
                  <p className="text-xs text-gray-700 truncate">{item.filename}</p>
                )}
                <p className="text-xs text-gray-400">
                  {formatSize(item.size)} &middot;{" "}
                  {new Date(item.created_at).toLocaleDateString("de-CH")}
                </p>
                {item.used_in && item.used_in.length > 0 ? (
                  <p className="text-xs text-green-600 mt-0.5 truncate" title={item.used_in.map((u) => u.label).join(", ")}>
                    {item.used_in.length === 1 ? "1 Verwendung" : `${item.used_in.length} Verwendungen`}
                  </p>
                ) : (
                  <p className="text-xs text-gray-300 mt-0.5">Nicht verwendet</p>
                )}
              </div>
              <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => copyUrl(item, "internal")}
                  className="bg-white/80 rounded p-1 text-gray-500 hover:text-black text-xs"
                  title="Interner Link (relativ, für Einbettung in Inhalte)"
                >
                  {copied?.id === item.id && copied.kind === "internal" ? "✓" : "Int"}
                </button>
                <button
                  onClick={() => copyUrl(item, "external")}
                  className="bg-white/80 rounded p-1 text-gray-500 hover:text-black text-xs"
                  title="Externer Link (absolut, zum Teilen per Mail/Chat)"
                >
                  {copied?.id === item.id && copied.kind === "external" ? "✓" : "Ext"}
                </button>
                <a
                  href={downloadUrl(item)}
                  download={item.filename}
                  className="bg-white/80 rounded p-1 text-gray-500 hover:text-black text-xs"
                  title="Herunterladen"
                >
                  ↓
                </a>
                <button
                  onClick={() => startRename(item)}
                  disabled={renameState !== null && renameState.id !== item.id}
                  className="bg-white/80 rounded p-1 text-gray-500 hover:text-black text-xs disabled:opacity-50"
                  title="Umbenennen"
                >
                  {renameState?.id === item.id ? "…" : "✎"}
                </button>
                <button
                  onClick={() => setDeleting(item)}
                  className="bg-white/80 rounded p-1 text-red-500 hover:text-red-700 text-xs"
                  title="Löschen"
                >
                  &times;
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 p-2 bg-white border rounded group"
            >
              {isImage(item.mime_type) ? (
                <img
                  src={`/api/media/${item.public_id}/`}
                  alt={item.filename}
                  className="w-12 h-12 shrink-0 object-cover rounded"
                  loading="lazy"
                />
              ) : isVideo(item.mime_type) ? (
                <div className="w-12 h-12 shrink-0 bg-gray-100 rounded flex items-center justify-center text-gray-400">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                  </svg>
                </div>
              ) : (
                <DocBadge mimeType={item.mime_type} size="list" />
              )}
              <div className="min-w-0 flex-1">
                {renameState?.id === item.id ? (
                  <input
                    type="text"
                    value={renameState.draft}
                    autoFocus
                    disabled={renameState.saving}
                    onChange={(e) =>
                      setRenameState((s) => (s ? { ...s, draft: e.target.value } : s))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void commitRename(item);
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        cancelRename();
                      }
                    }}
                    onBlur={() => void commitRename(item)}
                    aria-label={`Dateiname bearbeiten für ${item.filename}`}
                    className="w-full px-2 py-1 text-sm border border-black rounded disabled:opacity-50"
                  />
                ) : (
                  <p className="text-sm truncate">{item.filename}</p>
                )}
                <p className="text-xs text-gray-400">
                  {formatSize(item.size)} &middot; {item.mime_type} &middot;{" "}
                  {new Date(item.created_at).toLocaleDateString("de-CH")}
                  {item.used_in && item.used_in.length > 0 ? (
                    <span className="text-green-600 ml-1" title={item.used_in.map((u) => u.label).join(", ")}>
                      &middot; {item.used_in.map((u) => u.label).join(", ")}
                    </span>
                  ) : (
                    <span className="text-gray-300 ml-1">&middot; Nicht verwendet</span>
                  )}
                </p>
              </div>
              <div className="flex gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => copyUrl(item, "internal")}
                  className="px-2 py-1 text-xs border rounded hover:bg-gray-50"
                  title="Relativer Pfad — für Einbettung in Alit/Agenda/Journal-Inhalte"
                >
                  {copied?.id === item.id && copied.kind === "internal" ? "Kopiert" : "Link intern"}
                </button>
                <button
                  onClick={() => copyUrl(item, "external")}
                  className="px-2 py-1 text-xs border rounded hover:bg-gray-50"
                  title="Absolute URL — zum Teilen per Mail/Chat"
                >
                  {copied?.id === item.id && copied.kind === "external" ? "Kopiert" : "Link extern"}
                </button>
                <a
                  href={downloadUrl(item)}
                  download={item.filename}
                  className="px-2 py-1 text-xs border rounded hover:bg-gray-50"
                >
                  Download
                </a>
                <button
                  onClick={() => startRename(item)}
                  disabled={renameState !== null && renameState.id !== item.id}
                  className="px-2 py-1 text-xs border rounded hover:bg-gray-50 disabled:opacity-50"
                >
                  {renameState?.id === item.id
                    ? renameState.saving
                      ? "Speichert…"
                      : "Wird bearbeitet…"
                    : "Umbenennen"}
                </button>
                <button
                  onClick={() => setDeleting(item)}
                  className="px-2 py-1 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50"
                >
                  Löschen
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <DeleteConfirm
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        label={deleting?.filename ?? ""}
      />
    </div>
  );
}
