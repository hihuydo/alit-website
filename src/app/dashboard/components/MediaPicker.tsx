"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "./Modal";
import { dashboardFetch } from "../lib/dashboardFetch";

interface MediaItem {
  id: number;
  public_id: string;
  filename: string;
  mime_type: string;
  size: number;
}

export interface MediaPickerResult {
  type: "image" | "video" | "embed";
  src: string;
  mime_type?: string;
  caption: string;
  width?: "full" | "half";
}

interface MediaPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (result: MediaPickerResult) => void;
  /** Sprint Agenda Bilder-Grid 2.0: ignored passthrough für AgendaSection
   *  Slot-Index-Routing. Picker selbst nutzt das nicht — nur damit
   *  AgendaSection es type-safe durchreichen + Tests via Mock asserten
   *  können. */
  targetSlot?: number | null;
}

function isVideo(mimeType: string): boolean {
  return mimeType.startsWith("video/");
}

// The picker embeds image/video blocks into rich-text. PDFs and ZIPs live
// in the library as linkable assets (admin copies the URL from MediaSection
// and uses the toolbar's Link button) — they have no block-embed form, so
// filter them out here.
function isEmbeddable(mimeType: string): boolean {
  return mimeType.startsWith("image/") || mimeType.startsWith("video/");
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
  const [width, setWidth] = useState<"full" | "half">("full");
  const [embedUrl, setEmbedUrl] = useState("");
  const [embedCaption, setEmbedCaption] = useState("");
  const [embedError, setEmbedError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setCaption("");
    setWidth("full");
    setUploadError("");
    setEmbedUrl("");
    setEmbedCaption("");
    setEmbedError("");
    setLoading(true);
    fetch("/api/dashboard/media/")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          // Only show embeddable media in the picker — PDFs/ZIPs are linked
          // to via the toolbar's Link button, not embedded as blocks.
          const embeddable = (d.data as MediaItem[]).filter((m) => isEmbeddable(m.mime_type));
          setItems(embeddable);
        }
      })
      .finally(() => setLoading(false));
  }, [open]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await dashboardFetch("/api/dashboard/media/", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (data.success) {
        // Only show the new file in the picker if it's embeddable; the
        // upload still went into the media library either way.
        if (isEmbeddable(data.data.mime_type)) {
          setItems((prev) => [data.data, ...prev]);
          setSelected(data.data);
        } else {
          setUploadError("Datei hochgeladen — aber nur Bilder/Videos können hier eingebettet werden. Nutze den 'Link'-Button im Editor und füge die URL aus dem Medien-Tab ein.");
        }
      } else {
        setUploadError(data.error || "Upload fehlgeschlagen");
      }
    } catch {
      setUploadError("Verbindungsfehler");
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
      src: `/api/media/${selected.public_id}/`,
      mime_type: selected.mime_type,
      caption,
      width: mediaType === "image" ? width : undefined,
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

  // Guard against accidental modal-dismiss after the user typed a caption.
  // Only fires on user-initiated close mechanisms (Escape / backdrop /
  // × button). `handleInsert` and `handleEmbed` call `onClose()` directly,
  // bypassing this guard (explicit intent to insert = caption is preserved
  // in the payload).
  //
  // STABILITY: `handleGuardedClose` MUST be `useCallback`-stable across
  // caption keystrokes. `Modal`'s useEffect depends on `[open, onClose]`
  // and its cleanup restores focus to the previously-focused element. If
  // onClose is re-created on every keystroke, the caption input loses
  // focus after every character (Codex PR #84 R1 [P1]). We read the live
  // caption state via a ref that's mutated during render, same pattern as
  // Modal's `disableCloseRef`.
  const captionRef = useRef("");
  const embedCaptionRef = useRef("");
  captionRef.current = caption;
  embedCaptionRef.current = embedCaption;

  const handleGuardedClose = useCallback(() => {
    const hasUnsavedCaption =
      captionRef.current.trim().length > 0 ||
      embedCaptionRef.current.trim().length > 0;
    if (
      hasUnsavedCaption &&
      !window.confirm("Bildunterschrift verwerfen?")
    ) {
      return;
    }
    onClose();
  }, [onClose]);

  const tabBtn = (t: PickerTab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(t)}
      className={`px-3 py-1.5 text-sm rounded min-h-11 md:min-h-0 ${
        tab === t ? "bg-black text-white" : "bg-gray-100 hover:bg-gray-200"
      }`}
    >
      {label}
    </button>
  );

  return (
    <Modal open={open} onClose={handleGuardedClose} title="Medien einfügen">
      <div className="flex gap-2 mb-4">
        {tabBtn("library", "Medienbibliothek")}
        {tabBtn("embed", "Video einbetten")}
      </div>

      {tab === "library" && (
        <>
          <div className="mb-4">
            <label className="px-3 py-1.5 text-sm border rounded cursor-pointer hover:bg-gray-50 min-h-11 md:min-h-0 inline-flex items-center">
              {uploading ? "Lädt hoch..." : "Datei hochladen"}
              {/* Intentionally no PDF/ZIP — this picker embeds as blocks.
                  For PDF/ZIP, upload via the Medien tab and link from the
                  editor's "Link" button. */}
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

          {uploadError && (
            <p className="text-red-600 text-sm mb-3">{uploadError}</p>
          )}

          {loading ? (
            <p className="text-gray-500 text-sm">Laden...</p>
          ) : items.length === 0 ? (
            <p className="text-gray-500 text-sm">Keine Medien vorhanden.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-[40vh] overflow-y-auto">
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
                      src={`/api/media/${item.public_id}/`}
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
              {!isVideo(selected.mime_type) && (
                <div className="flex flex-col min-[400px]:flex-row gap-2">
                  <button
                    type="button"
                    onClick={() => setWidth("full")}
                    className={`px-3 py-1.5 text-sm rounded border min-h-11 md:min-h-0 ${width === "full" ? "bg-black text-white" : "hover:bg-gray-50"}`}
                  >
                    Volle Breite
                  </button>
                  <button
                    type="button"
                    onClick={() => setWidth("half")}
                    className={`px-3 py-1.5 text-sm rounded border min-h-11 md:min-h-0 ${width === "half" ? "bg-black text-white" : "hover:bg-gray-50"}`}
                  >
                    Halbe Breite
                  </button>
                </div>
              )}
              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Bildunterschrift (optional)"
                className="w-full px-3 py-2 text-base md:text-sm border rounded focus:outline-none"
              />
              <button
                type="button"
                onClick={handleInsert}
                className="px-4 py-2 bg-black text-white rounded text-sm hover:bg-gray-800 min-h-11 md:min-h-0"
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
            onBlur={() => {
              // Validate onBlur instead of waiting for submit. Silent
              // on empty input (user may come back to the field).
              const url = embedUrl.trim();
              if (!url) return;
              if (!parseEmbedUrl(url)) {
                setEmbedError("Ungültige URL. YouTube oder Vimeo-Links erlaubt.");
              }
            }}
            placeholder="https://www.youtube.com/watch?v=... oder https://vimeo.com/..."
            className="w-full px-3 py-2 text-base md:text-sm border rounded focus:outline-none"
          />
          {embedError && (
            <p className="text-red-600 text-sm">{embedError}</p>
          )}
          <input
            type="text"
            value={embedCaption}
            onChange={(e) => setEmbedCaption(e.target.value)}
            placeholder="Bildunterschrift (optional)"
            className="w-full px-3 py-2 text-base md:text-sm border rounded focus:outline-none"
          />
          <button
            type="button"
            onClick={handleEmbed}
            disabled={!embedUrl.trim()}
            className="px-4 py-2 bg-black text-white rounded text-sm hover:bg-gray-800 disabled:opacity-50 min-h-11 md:min-h-0"
          >
            Einbetten
          </button>
        </div>
      )}
    </Modal>
  );
}
