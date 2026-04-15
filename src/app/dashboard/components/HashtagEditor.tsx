"use client";

import { ALLOWED_HASHTAGS } from "@/lib/agenda-hashtags-shared";

export interface HashtagDraft {
  uid: string;
  tag: string;
  /** Optional FR display label — only used when parent passes `showI18n` to the
   *  editor. DE (`tag`) is the canonical key and must be in ALLOWED_HASHTAG_SET. */
  tag_fr?: string;
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
  /** Show an additional FR-label text input per hashtag row. */
  showI18n?: boolean;
}

export function HashtagEditor({ hashtags, projekte, onAdd, onUpdate, onRemove, showI18n = false }: HashtagEditorProps) {
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
                    onChange={(e) => {
                      const nextDe = e.target.value;
                      // Auto-fill FR with DE value when FR is still empty (90%
                      // of hashtags are brand names — FR == DE). Admin can
                      // override afterwards.
                      const patch: Partial<HashtagDraft> =
                        showI18n && nextDe && !h.tag_fr?.trim()
                          ? { tag: nextDe, tag_fr: nextDe }
                          : { tag: nextDe };
                      onUpdate(i, patch);
                    }}
                    className="flex-1 px-3 py-2 border rounded bg-white text-sm font-mono"
                    aria-label="Hashtag DE"
                  >
                    <option value="">Hashtag wählen…</option>
                    {ALLOWED_HASHTAGS.map((t) => (
                      <option key={t} value={t} disabled={usedTags.has(t)}>
                        #{t}
                      </option>
                    ))}
                  </select>
                </div>
                {showI18n && (
                  <div className="flex items-center flex-1">
                    <span className="text-gray-400 font-mono px-2">#</span>
                    <input
                      value={h.tag_fr ?? ""}
                      onChange={(e) => onUpdate(i, { tag_fr: e.target.value })}
                      placeholder="FR-Label (optional)"
                      className="flex-1 px-3 py-2 border rounded bg-white text-sm font-mono"
                      aria-label="Hashtag FR"
                    />
                  </div>
                )}
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

// crypto.randomUUID is available in all browsers we target (and Node >=19);
// no module-level mutable state needed.
export const newHashtagUid = () => `ht-${crypto.randomUUID()}`;
