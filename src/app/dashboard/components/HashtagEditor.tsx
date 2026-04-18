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
  // slug_de is the stable internal ID that hashtag references store as
  // `projekt_slug`. Public renderers resolve slug_de → locale-appropriate
  // URL-slug at render time via projekt-slug.ts.
  slug_de: string;
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
        <div className="space-y-3 md:space-y-2">
          {hashtags.map((h, i) => {
            const usedTags = new Set(hashtags.map((x, idx) => (idx !== i ? x.tag : "")));
            return (
              // Mobile: stacked rows per hashtag so each select gets its
              // full width (~327px) instead of being squeezed to <150px
              // next to its siblings. Desktop: single inline row as before.
              <div
                key={h.uid}
                className="flex flex-col md:flex-row md:items-center gap-2 p-2 md:p-0 rounded md:rounded-none border md:border-0 border-gray-200 bg-white md:bg-transparent"
              >
                <div className="flex items-center flex-1">
                  <span className="text-gray-400 font-mono px-2">#</span>
                  <select
                    value={h.tag}
                    onChange={(e) => {
                      const nextDe = e.target.value;
                      // Auto-sync FR with DE when FR is empty OR still mirrors
                      // the old DE (= brand-name default, unchanged by admin).
                      // If admin edited FR to differ from DE, respect that.
                      const frCurrent = (h.tag_fr ?? "").trim();
                      const deCurrent = (h.tag ?? "").trim();
                      const frIsSyncedOrEmpty = !frCurrent || frCurrent === deCurrent;
                      const patch: Partial<HashtagDraft> =
                        showI18n && nextDe && frIsSyncedOrEmpty
                          ? { tag: nextDe, tag_fr: nextDe }
                          : { tag: nextDe };
                      onUpdate(i, patch);
                    }}
                    className="flex-1 min-w-0 px-3 py-2 text-base md:text-sm border rounded bg-white font-mono"
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
                      className="flex-1 min-w-0 px-3 py-2 text-base md:text-sm border rounded bg-white font-mono"
                      aria-label="Hashtag FR"
                    />
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <select
                    value={h.projekt_slug}
                    onChange={(e) => onUpdate(i, { projekt_slug: e.target.value })}
                    className="flex-1 min-w-0 px-3 py-2 text-base md:text-sm border rounded bg-white"
                  >
                    <option value="">Projekt wählen…</option>
                    {projekte.map((p) => (
                      <option key={p.slug_de} value={p.slug_de}>{p.titel}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => onRemove(i)}
                    className="shrink-0 min-w-11 min-h-11 flex items-center justify-center text-red-600 border border-red-200 rounded hover:bg-red-50"
                    aria-label="Hashtag entfernen"
                  >
                    ✕
                  </button>
                </div>
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
