"use client";

import { useCallback, useState } from "react";
import type { SupporterLogo } from "@/lib/supporter-logos";
import { MediaPicker, type MediaPickerMultiResult } from "./MediaPicker";

export const SUPPORTER_LOGOS_HARD_CAP = 8;

/**
 * Locale-agnostic DE-only editor strings. Dashboard is locale-agnostic
 * (no /de/ prefix), so we use a const-export instead of dict-resolution.
 * Public-facing strings (label, supporterSlideLabel) live in dictionaries.ts
 * as `agenda.supporters.*` and ARE locale-aware.
 */
export const DASHBOARD_SUPPORTER_STRINGS = {
  sectionLabel: "Unterstützer-Logos",
  addLogo: "Logo hinzufügen",
  removeLogo: "Entfernen",
  altPlaceholder: "Alt-Text (z.B. Logo Pro Helvetia)",
  capReached: `Maximum erreicht (${SUPPORTER_LOGOS_HARD_CAP})`,
  probeFailure:
    "Logo-Dimensionen konnten nicht ermittelt werden. Bild ist trotzdem hinzugefügt — bitte im Public-Render prüfen.",
  dismissBanner: "Hinweis schließen",
  moveUp: "Nach oben",
  moveDown: "Nach unten",
  warningSlideReplaced:
    "Letzter Inhalts-Slide wurde durch Supporter-Folie ersetzt (max. 10 Slides).",
} as const;

function probeImageUrl(
  src: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Probe failed"));
    img.src = src;
  });
}

export function SupporterLogosEditor({
  value,
  onChange,
  strings = DASHBOARD_SUPPORTER_STRINGS,
}: {
  value: SupporterLogo[];
  onChange: (next: SupporterLogo[]) => void;
  strings?: typeof DASHBOARD_SUPPORTER_STRINGS;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [probeFailureBanner, setProbeFailureBanner] = useState(false);

  const remainingCap = SUPPORTER_LOGOS_HARD_CAP - value.length;
  const capReached = remainingCap <= 0;

  const handleConfirmMulti = useCallback(
    async (selected: MediaPickerMultiResult[]) => {
      // Probe each newly-picked logo for naturalWidth/Height. Failures are
      // tolerated (logo gets width: null, height: null); we surface a banner
      // so the admin knows something went wrong silently.
      let anyProbeFailed = false;
      const probed = await Promise.all(
        selected.map(async (item): Promise<SupporterLogo> => {
          try {
            const { width, height } = await probeImageUrl(
              `/api/media/${item.public_id}/`,
            );
            return {
              public_id: item.public_id,
              alt: null,
              width,
              height,
            };
          } catch {
            anyProbeFailed = true;
            return {
              public_id: item.public_id,
              alt: null,
              width: null,
              height: null,
            };
          }
        }),
      );

      // Defense against duplicate add (race / picker bug) — drop logos that
      // are already in `value`.
      const existing = new Set(value.map((l) => l.public_id));
      const additions = probed.filter((l) => !existing.has(l.public_id));
      onChange([...value, ...additions]);
      if (anyProbeFailed) setProbeFailureBanner(true);
    },
    [value, onChange],
  );

  const handleRemove = useCallback(
    (publicId: string) => {
      onChange(value.filter((l) => l.public_id !== publicId));
    },
    [value, onChange],
  );

  const handleAltChange = useCallback(
    (publicId: string, alt: string) => {
      onChange(
        value.map((l) =>
          l.public_id === publicId ? { ...l, alt: alt || null } : l,
        ),
      );
    },
    [value, onChange],
  );

  const handleMove = useCallback(
    (idx: number, dir: -1 | 1) => {
      const target = idx + dir;
      if (target < 0 || target >= value.length) return;
      const next = value.slice();
      [next[idx], next[target]] = [next[target], next[idx]];
      onChange(next);
    },
    [value, onChange],
  );

  return (
    <div data-testid="supporter-logos-editor">
      <label className="block text-sm font-medium mb-2">
        {strings.sectionLabel}
      </label>

      {probeFailureBanner && (
        <div
          role="status"
          data-testid="supporter-probe-failure-banner"
          className="mb-2 flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-300 text-amber-900 text-xs rounded"
        >
          <span className="flex-1">{strings.probeFailure}</span>
          <button
            type="button"
            onClick={() => setProbeFailureBanner(false)}
            aria-label={strings.dismissBanner}
            className="text-amber-700 hover:text-amber-900"
          >
            ✕
          </button>
        </div>
      )}

      {value.length > 0 && (
        <ul className="space-y-2 mb-2 list-none p-0" data-testid="supporter-logo-list">
          {value.map((logo, idx) => (
            <li
              key={logo.public_id}
              data-testid={`supporter-logo-row-${idx}`}
              className="flex items-center gap-2 p-2 border border-gray-200 rounded bg-white"
            >
              <img
                src={`/api/media/${logo.public_id}/`}
                alt={logo.alt ?? ""}
                className="w-12 h-12 object-contain bg-gray-50 border border-gray-200 rounded shrink-0"
              />
              <input
                type="text"
                value={logo.alt ?? ""}
                onChange={(e) => handleAltChange(logo.public_id, e.target.value)}
                placeholder={strings.altPlaceholder}
                maxLength={500}
                className="flex-1 min-w-0 px-2 py-1 text-sm border rounded focus:outline-none bg-white"
              />
              <div className="flex flex-col gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => handleMove(idx, -1)}
                  disabled={idx === 0}
                  aria-label={strings.moveUp}
                  className="px-1.5 py-0.5 text-xs border rounded hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => handleMove(idx, 1)}
                  disabled={idx === value.length - 1}
                  aria-label={strings.moveDown}
                  className="px-1.5 py-0.5 text-xs border rounded hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ↓
                </button>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(logo.public_id)}
                aria-label={strings.removeLogo}
                className="px-2 py-1 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50 shrink-0"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        disabled={capReached}
        aria-label={
          capReached
            ? `${strings.addLogo} — ${strings.capReached}`
            : strings.addLogo
        }
        className="px-3 py-1.5 text-xs border rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {strings.addLogo}
      </button>

      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={() => {}}
        multi
        maxSelectable={remainingCap}
        capReachedMessage={strings.capReached}
        onSelectMulti={handleConfirmMulti}
      />
    </div>
  );
}
