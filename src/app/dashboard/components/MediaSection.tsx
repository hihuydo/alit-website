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
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isVideo(mimeType: string): boolean {
  return mimeType.startsWith("video/");
}

export function MediaSection({ initial }: { initial: MediaItem[] }) {
  const [items, setItems] = useState(initial);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<MediaItem | null>(null);
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
        <label className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 text-sm cursor-pointer">
          {uploading ? "Lädt hoch..." : "+ Hochladen"}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm"
            onChange={handleUpload}
            disabled={uploading}
            className="hidden"
          />
        </label>
      </div>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      {items.length === 0 ? (
        <p className="text-gray-500 text-sm">
          Keine Medien vorhanden. Lade Bilder oder Videos hoch.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="group relative border rounded overflow-hidden bg-white"
            >
              {isVideo(item.mime_type) ? (
                <div className="aspect-square bg-gray-100 flex items-center justify-center text-gray-400">
                  <svg
                    className="w-12 h-12"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z"
                    />
                  </svg>
                </div>
              ) : (
                <img
                  src={`/api/media/${item.public_id}/`}
                  alt={item.filename}
                  className="aspect-square object-cover w-full"
                  loading="lazy"
                />
              )}
              <div className="p-2">
                <p className="text-xs text-gray-700 truncate">{item.filename}</p>
                <p className="text-xs text-gray-400">
                  {formatSize(item.size)} &middot;{" "}
                  {new Date(item.created_at).toLocaleDateString("de-CH")}
                </p>
              </div>
              <button
                onClick={() => setDeleting(item)}
                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/80 rounded p-1 text-red-500 hover:text-red-700 text-xs"
                title="Löschen"
              >
                &times;
              </button>
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
