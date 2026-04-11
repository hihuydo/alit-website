"use client";

import { useState, useEffect, useRef } from "react";
import { Modal } from "./Modal";

interface MediaItem {
  id: number;
  filename: string;
  mime_type: string;
  size: number;
}

export interface MediaPickerResult {
  type: "image" | "video" | "embed";
  src: string;
  mime_type?: string;
  caption: string;
}

interface MediaPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (result: MediaPickerResult) => void;
}

function isVideo(mimeType: string): boolean {
  return mimeType.startsWith("video/");
}

function parseEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    // YouTube
    if (
      u.hostname === "www.youtube.com" ||
      u.hostname === "youtube.com"
    ) {
      const v = u.searchParams.get("v");
      if (v) return `https://www.youtube.com/embed/${v}`;
    }
    if (u.hostname === "youtu.be") {
      const id = u.pathname.slice(1);
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    // Vimeo
    if (u.hostname === "www.vimeo.com" || u.hostname === "vimeo.com") {
      const match = u.pathname.match(/^\/(\d+)/);
      if (match) return `https://player.vimeo.com/video/${match[1]}`;
    }
    return null;
  } catch {
    return null;
  }
}

type PickerTab = "library" | "embed";

export function MediaPicker({ open, onClose, onSelect }: MediaPickerProps) {
  const [tab, setTab] = useState<PickerTab>("library");
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [caption, setCaption] = useState("");
  const [embedUrl, setEmbedUrl] = useState("");
  const [embedCaption, setEmbedCaption] = useState("");
  const [embedError, setEmbedError] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setCaption("");
    setEmbedUrl("");
    setEmbedCaption("");
    setEmbedError("");
    setLoading(true);
    fetch("/api/dashboard/media/")
      .then((r) => r.json())
      .then((d) => { if (d.success) setItems(d.data); })
      .finally(() => setLoading(false));
  }, [open]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/dashboard/media/", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (data.success) {
        setItems((prev) => [data.data, ...prev]);
        setSelected(data.data);
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleInsert = () => {
    if (!selected) return;
    const mediaType = isVideo(selected.mime_type) ? "video" : "image";
    onSelect({
      type: mediaType,
      src: `/api/media/${selected.id}/`,
      mime_type: selected.mime_type,
      caption,
    });
    onClose();
  };

  const handleEmbed = () => {
    setEmbedError("");
    const parsed = parseEmbedUrl(embedUrl.trim());
    if (!parsed) {
      setEmbedError("Ungültige URL. YouTube oder Vimeo-Links erlaubt.");
      return;
    }
    onSelect({
      type: "embed",
      src: parsed,
      caption: embedCaption,
    });
    onClose();
  };

  const tabBtn = (t: PickerTab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(t)}
      className={`px-3 py-1.5 text-sm rounded ${
        tab === t ? "bg-black text-white" : "bg-gray-100 hover:bg-gray-200"
      }`}
    >
      {label}
    </button>
  );

  return (
    <Modal open={open} onClose={onClose} title="Medien einfügen">
      <div className="flex gap-2 mb-4">
        {tabBtn("library", "Medienbibliothek")}
        {tabBtn("embed", "Video einbetten")}
      </div>

      {tab === "library" && (
        <>
          <div className="mb-4">
            <label className="px-3 py-1.5 text-sm border rounded cursor-pointer hover:bg-gray-50">
              {uploading ? "Lädt hoch..." : "Datei hochladen"}
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

          {loading ? (
            <p className="text-gray-500 text-sm">Laden...</p>
          ) : items.length === 0 ? (
            <p className="text-gray-500 text-sm">Keine Medien vorhanden.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[40vh] overflow-y-auto">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelected(item)}
                  className={`relative aspect-square rounded overflow-hidden border-2 ${
                    selected?.id === item.id
                      ? "border-black"
                      : "border-transparent hover:border-gray-300"
                  }`}
                >
                  {isVideo(item.mime_type) ? (
                    <div className="w-full h-full bg-gray-100 flex items-center justify-center text-gray-400">
                      <svg
                        className="w-8 h-8"
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
                      src={`/api/media/${item.id}/`}
                      alt={item.filename}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  )}
                </button>
              ))}
            </div>
          )}

          {selected && (
            <div className="mt-4 border-t pt-4 space-y-3">
              <p className="text-sm text-gray-600">
                {selected.filename}
              </p>
              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Bildunterschrift (optional)"
                className="w-full px-3 py-2 text-sm border rounded focus:outline-none"
              />
              <button
                type="button"
                onClick={handleInsert}
                className="px-4 py-2 bg-black text-white rounded text-sm hover:bg-gray-800"
              >
                Einfügen
              </button>
            </div>
          )}
        </>
      )}

      {tab === "embed" && (
        <div className="space-y-3">
          <input
            type="url"
            value={embedUrl}
            onChange={(e) => { setEmbedUrl(e.target.value); setEmbedError(""); }}
            placeholder="https://www.youtube.com/watch?v=... oder https://vimeo.com/..."
            className="w-full px-3 py-2 text-sm border rounded focus:outline-none"
          />
          {embedError && (
            <p className="text-red-600 text-sm">{embedError}</p>
          )}
          <input
            type="text"
            value={embedCaption}
            onChange={(e) => setEmbedCaption(e.target.value)}
            placeholder="Bildunterschrift (optional)"
            className="w-full px-3 py-2 text-sm border rounded focus:outline-none"
          />
          <button
            type="button"
            onClick={handleEmbed}
            disabled={!embedUrl.trim()}
            className="px-4 py-2 bg-black text-white rounded text-sm hover:bg-gray-800 disabled:opacity-50"
          >
            Einbetten
          </button>
        </div>
      )}
    </Modal>
  );
}
