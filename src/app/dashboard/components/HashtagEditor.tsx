"use client";

import { ALLOWED_HASHTAGS } from "@/lib/agenda-hashtags-shared";

export interface HashtagDraft {
  uid: string;
  tag: string;
  projekt_slug: string;
}

interface ProjektOption {
  slug: string;
  titel: string;
}

interface HashtagEditorProps {
  hashtags: HashtagDraft[];
  projekte: ProjektOption[];
  onAdd: () => void;
  onUpdate: (i: number, patch: Partial<HashtagDraft>) => void;
  onRemove: (i: number) => void;
}

export function HashtagEditor({ hashtags, projekte, onAdd, onUpdate, onRemove }: HashtagEditorProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-sm font-medium">Hashtags</label>
        <button
          type="button"
          onClick={onAdd}
          disabled={hashtags.length >= ALLOWED_HASHTAGS.length}
          className="text-xs px-2 py-1 border rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + Hashtag
        </button>
      </div>
      {hashtags.length === 0 ? (
        <p className="text-xs text-gray-500">
          Noch keine Hashtags. Aus der vorgegebenen Liste wählen und jedem Tag ein Projekt zuordnen.
        </p>
      ) : (
        <div className="space-y-2">
          {hashtags.map((h, i) => {
            const usedTags = new Set(hashtags.map((x, idx) => (idx !== i ? x.tag : "")));
            return (
              <div key={h.uid} className="flex items-center gap-2">
                <div className="flex items-center flex-1">
                  <span className="text-gray-400 font-mono px-2">#</span>
                  <select
                    value={h.tag}
                    onChange={(e) => onUpdate(i, { tag: e.target.value })}
                    className="flex-1 px-3 py-2 border rounded bg-white text-sm font-mono"
                  >
                    <option value="">Hashtag wählen…</option>
                    {ALLOWED_HASHTAGS.map((t) => (
                      <option key={t} value={t} disabled={usedTags.has(t)}>
                        #{t}
                      </option>
                    ))}
                  </select>
                </div>
                <select
                  value={h.projekt_slug}
                  onChange={(e) => onUpdate(i, { projekt_slug: e.target.value })}
                  className="flex-1 px-3 py-2 border rounded bg-white text-sm"
                >
                  <option value="">Projekt wählen…</option>
                  {projekte.map((p) => (
                    <option key={p.slug} value={p.slug}>{p.titel}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => onRemove(i)}
                  className="px-2 py-2 text-sm text-red-600 border border-red-200 rounded hover:bg-red-50"
                  aria-label="Hashtag entfernen"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

let hashtagUidCounter = 0;
export const newHashtagUid = () => `ht-${++hashtagUidCounter}`;
