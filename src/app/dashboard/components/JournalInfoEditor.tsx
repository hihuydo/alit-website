"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RichTextEditor } from "./RichTextEditor";
import { blocksToHtml, htmlToBlocks } from "./journal-html-converter";
import { isJournalInfoEmpty } from "@/lib/journal-info-shared";
import type { JournalContent } from "@/lib/journal-types";
import type { Locale } from "@/lib/i18n-field";
import { useDirty } from "../DirtyContext";
import { dashboardFetch } from "../lib/dashboardFetch";

const LOCALES: readonly Locale[] = ["de", "fr"];

export interface JournalInfoValue {
  de: JournalContent | null;
  fr: JournalContent | null;
}

function initialHtml(value: JournalInfoValue): Record<Locale, string> {
  return {
    de: value.de && value.de.length > 0 ? blocksToHtml(value.de) : "",
    fr: value.fr && value.fr.length > 0 ? blocksToHtml(value.fr) : "",
  };
}

export function JournalInfoEditor({
  initial,
  onSaved,
}: {
  initial: JournalInfoValue;
  onSaved?: (next: JournalInfoValue) => void;
}) {
  const { setDirty } = useDirty();
  const [activeLocale, setActiveLocale] = useState<Locale>("de");
  const [html, setHtml] = useState<Record<Locale, string>>(() => initialHtml(initial));
  const initialSnapshotRef = useRef<string>(JSON.stringify(initialHtml(initial)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);

  const isDirty = useMemo(
    () => JSON.stringify(html) !== initialSnapshotRef.current,
    [html],
  );

  useEffect(() => {
    setDirty("journal-info", isDirty);
  }, [isDirty, setDirty]);

  // Clear dirty on unmount so tab-switches don't carry stale state.
  useEffect(() => () => setDirty("journal-info", false), [setDirty]);

  const updateDe = useCallback((h: string) => setHtml((s) => ({ ...s, de: h })), []);
  const updateFr = useCallback((h: string) => setHtml((s) => ({ ...s, fr: h })), []);

  const handleSave = async () => {
    setError("");
    setSaving(true);
    try {
      const deBlocks = htmlToBlocks(html.de);
      const frBlocks = htmlToBlocks(html.fr);
      const payload: JournalInfoValue = {
        de: isJournalInfoEmpty(deBlocks) ? null : deBlocks,
        fr: isJournalInfoEmpty(frBlocks) ? null : frBlocks,
      };
      const res = await dashboardFetch("/api/dashboard/site-settings/journal-info/", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Fehler beim Speichern");
        return;
      }
      const next: JournalInfoValue = {
        de: data.data?.de ?? null,
        fr: data.data?.fr ?? null,
      };
      // Re-snapshot from the server response — server may have normalized
      // empty paragraphs to null, and we want the dirty-check to reflect that.
      const nextHtml = initialHtml(next);
      setHtml(nextHtml);
      initialSnapshotRef.current = JSON.stringify(nextHtml);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
      onSaved?.(next);
    } catch {
      setError("Verbindungsfehler");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Dieser Text erscheint hinter dem <span className="font-mono">i</span>-Button in Panel 2 (Discours Agités).
        Leere Felder fallen auf den Standard-Text zurück.
      </p>

      <div className="flex gap-1 border-b" role="tablist" aria-label="Sprache">
        {LOCALES.map((loc) => {
          const active = loc === activeLocale;
          return (
            <button
              key={loc}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`journal-info-locale-${loc}`}
              onClick={() => setActiveLocale(loc)}
              className={`px-4 py-2 -mb-px border-b-2 text-sm font-medium transition-colors ${
                active
                  ? "border-black text-black"
                  : "border-transparent text-gray-500 hoverable:hover:text-gray-800"
              }`}
            >
              {loc.toUpperCase()}
            </button>
          );
        })}
      </div>

      {LOCALES.map((loc) => (
        <div key={loc} hidden={loc !== activeLocale}>
          <RichTextEditor
            value={html[loc]}
            onChange={loc === "de" ? updateDe : updateFr}
          />
        </div>
      ))}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={!isDirty || saving}
          className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed text-sm"
        >
          {saving ? "Speichern…" : "Speichern"}
        </button>
        {savedFlash && <span className="text-sm text-green-700">Gespeichert.</span>}
      </div>
    </div>
  );
}
