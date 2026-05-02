"use client";

import { useCallback, useState } from "react";
import type { SupporterLogo } from "@/lib/supporter-logos";
import { MediaPicker, type MediaPickerMultiResult } from "./MediaPicker";
import { Modal } from "./Modal";

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
  editAlt: "Alt-Text bearbeiten",
  altModalTitle: "Alt-Text",
  altPlaceholder: "z.B. Logo Pro Helvetia",
  altSave: "Speichern",
  altCancel: "Abbrechen",
  capReached: `Maximum erreicht (${SUPPORTER_LOGOS_HARD_CAP})`,
  probeFailure:
    "Logo-Dimensionen konnten nicht ermittelt werden. Bild ist trotzdem hinzugefügt — bitte im Public-Render prüfen.",
  dismissBanner: "Hinweis schließen",
  warningSlideReplaced:
    "Letzter Inhalts-Slide wurde durch Supporter-Folie ersetzt (max. 10 Slides).",
} as const;

const TILE_SIZE_PX = 80;

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
  // Alt-edit-Modal state — null = closed, otherwise index into `value`.
  const [altEditIndex, setAltEditIndex] = useState<number | null>(null);
  const [draftAlt, setDraftAlt] = useState("");
  // Drag-Reorder source-index (HTML5 dnd, parity with AgendaSection image grid).
  const [dragSourceIdx, setDragSourceIdx] = useState<number | null>(null);

  const remainingCap = SUPPORTER_LOGOS_HARD_CAP - value.length;
  const capReached = remainingCap <= 0;

  const handleConfirmMulti = useCallback(
    async (selected: MediaPickerMultiResult[]) => {
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

      const existing = new Set(value.map((l) => l.public_id));
      const additions = probed.filter((l) => !existing.has(l.public_id));
      onChange([...value, ...additions]);
      if (anyProbeFailed) setProbeFailureBanner(true);
    },
    [value, onChange],
  );

  const handleRemove = useCallback(
    (idx: number) => {
      onChange(value.filter((_, i) => i !== idx));
    },
    [value, onChange],
  );

  const handleAltOpen = useCallback(
    (idx: number) => {
      setDraftAlt(value[idx]?.alt ?? "");
      setAltEditIndex(idx);
    },
    [value],
  );
  const handleAltClose = useCallback(() => setAltEditIndex(null), []);
  const handleAltSave = useCallback(() => {
    const i = altEditIndex;
    if (i === null) return;
    const next = value.slice();
    const trimmed = draftAlt.trim();
    next[i] = { ...next[i], alt: trimmed.length > 0 ? trimmed : null };
    onChange(next);
    setAltEditIndex(null);
  }, [altEditIndex, draftAlt, value, onChange]);

  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, idx: number) => {
      setDragSourceIdx(idx);
      e.dataTransfer.effectAllowed = "move";
    },
    [],
  );
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>, targetIdx: number) => {
      e.preventDefault();
      if (dragSourceIdx === null || dragSourceIdx === targetIdx) {
        setDragSourceIdx(null);
        return;
      }
      const next = value.slice();
      const [moved] = next.splice(dragSourceIdx, 1);
      next.splice(targetIdx, 0, moved);
      onChange(next);
      setDragSourceIdx(null);
    },
    [dragSourceIdx, value, onChange],
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
        <div
          data-testid="supporter-logo-grid"
          className="flex flex-wrap gap-2 mb-3"
        >
          {value.map((logo, idx) => (
            <div
              key={logo.public_id}
              data-testid={`supporter-logo-tile-${idx}`}
              draggable
              onDragStart={(e) => handleDragStart(e, idx)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, idx)}
              style={{ width: `${TILE_SIZE_PX}px`, height: `${TILE_SIZE_PX}px` }}
              className="relative bg-white border border-black/20 rounded overflow-hidden cursor-move shrink-0"
            >
              <button
                type="button"
                onClick={() => handleAltOpen(idx)}
                aria-label={`${strings.editAlt}${logo.alt ? `: ${logo.alt}` : ""}`}
                data-testid={`supporter-logo-edit-${idx}`}
                className="absolute inset-0 w-full h-full p-1 flex items-center justify-center hover:bg-black/5"
              >
                <img
                  src={`/api/media/${logo.public_id}/`}
                  alt={logo.alt ?? ""}
                  className="max-w-full max-h-full object-contain block pointer-events-none"
                  draggable={false}
                />
              </button>
              <button
                type="button"
                onClick={() => handleRemove(idx)}
                aria-label={strings.removeLogo}
                data-testid={`supporter-logo-remove-${idx}`}
                className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center bg-white/90 hover:bg-red-50 text-red-600 border border-red-200 rounded text-xs"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
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

      <Modal
        open={altEditIndex !== null}
        onClose={handleAltClose}
        title={strings.altModalTitle}
      >
        <div className="flex flex-col gap-4">
          <input
            type="text"
            value={draftAlt}
            onChange={(e) => setDraftAlt(e.target.value)}
            placeholder={strings.altPlaceholder}
            maxLength={500}
            autoFocus
            data-testid="supporter-alt-input"
            className="border border-black px-2 py-1 bg-white"
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={handleAltClose}
              data-testid="supporter-alt-cancel"
              className="border border-black px-3 py-1"
            >
              {strings.altCancel}
            </button>
            <button
              type="button"
              onClick={handleAltSave}
              data-testid="supporter-alt-save"
              className="border border-black bg-black text-white px-3 py-1"
            >
              {strings.altSave}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
