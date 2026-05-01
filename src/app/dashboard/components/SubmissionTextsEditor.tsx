"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getDictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import {
  LOCALES,
  MITGLIEDSCHAFT_EDITABLE_KEYS,
  NEWSLETTER_EDITABLE_KEYS,
  SUBMISSION_FORMS,
  mergeWithDefaults,
  pickEditableFields,
  stripDictEqual,
  type DictMap,
  type SubmissionForm,
  type SubmissionFormFields,
  type SubmissionTextsDisplay,
  type SubmissionTextsRaw,
} from "@/lib/submission-form-fields";
import { useDirty } from "../DirtyContext";
import { dashboardFetch } from "../lib/dashboardFetch";

const DICT_MAP: DictMap = { de: getDictionary("de"), fr: getDictionary("fr") };

const FORM_LABELS: Record<SubmissionForm, string> = {
  mitgliedschaft: "Mitgliedschaft",
  newsletter: "Newsletter",
};

// Multi-line fields render as <textarea>; everything else as <input>.
const MULTILINE_FIELDS = new Set<string>([
  "intro",
  "successBody",
  "privacy",
]);

const FIELD_LABELS: Record<string, string> = {
  heading: "Überschrift",
  intro: "Einleitung",
  consent: "Einverständnis",
  successTitle: "Erfolg — Titel",
  successBody: "Erfolg — Text",
  errorGeneric: "Fehler — generisch",
  errorDuplicate: "Fehler — Duplikat",
  errorRate: "Fehler — Rate-Limit",
  privacy: "Datenschutz-Hinweis",
};

interface FetchResponse {
  success: boolean;
  data: SubmissionTextsRaw;
  etag: string | null;
  error?: string;
  code?: string;
}

export function SubmissionTextsEditor({
  onDirtyChange,
}: {
  onDirtyChange?: (isDirty: boolean) => void;
}) {
  const { setDirty } = useDirty();
  const [activeForm, setActiveForm] = useState<SubmissionForm>("mitgliedschaft");
  const [activeLocale, setActiveLocale] = useState<Locale>("de");
  const [displayState, setDisplayState] = useState<SubmissionTextsDisplay>(() =>
    mergeWithDefaults({}, DICT_MAP),
  );
  const [currentEtag, setCurrentEtag] = useState<string | null>(null);
  const [snapshotVersion, setSnapshotVersion] = useState(0);
  const initialSnapshotRef = useRef<string>(JSON.stringify(mergeWithDefaults({}, DICT_MAP)));
  const userTouchedRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState("");
  const [staleConflict, setStaleConflict] = useState(false);

  const isDirty = useMemo(
    () => JSON.stringify(displayState) !== initialSnapshotRef.current,
    // snapshotVersion is the trigger — bumped whenever initialSnapshotRef mutates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [displayState, snapshotVersion],
  );

  useEffect(() => {
    setDirty("submission-texts", isDirty);
    onDirtyChange?.(isDirty);
  }, [isDirty, setDirty, onDirtyChange]);

  // Cleanup on unmount so a tab-switch doesn't carry stale dirty-state.
  useEffect(() => () => setDirty("submission-texts", false), [setDirty]);

  // Initial fetch — userTouchedRef guards against the mount-vs-fetch race
  // (if the user typed before GET resolved, do not overwrite their input).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard/site-settings/submission-form-texts/")
      .then((r) => r.json())
      .then((data: FetchResponse) => {
        if (cancelled) return;
        if (!data.success) return;
        if (userTouchedRef.current) return;
        const merged = mergeWithDefaults(data.data, DICT_MAP);
        setDisplayState(merged);
        setCurrentEtag(data.etag);
        initialSnapshotRef.current = JSON.stringify(merged);
        setSnapshotVersion((v) => v + 1);
      })
      .catch(() => {
        if (cancelled) return;
        // Initial load failure is silent — defaults already in state.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleFieldChange(form: SubmissionForm, locale: Locale, field: string, value: string) {
    userTouchedRef.current = true;
    setDisplayState((s) => ({
      ...s,
      [form]: {
        ...s[form],
        [locale]: { ...(s[form] as Record<Locale, Record<string, string>>)[locale], [field]: value },
      },
    }));
  }

  function handleResetActive() {
    userTouchedRef.current = true;
    setDisplayState((s) => {
      const defaults = pickEditableFields(activeForm, DICT_MAP[activeLocale][activeForm]);
      return {
        ...s,
        [activeForm]: { ...s[activeForm], [activeLocale]: defaults },
      };
    });
  }

  async function handleReload() {
    setError("");
    try {
      const res = await fetch("/api/dashboard/site-settings/submission-form-texts/");
      const data: FetchResponse = await res.json();
      if (!data.success) {
        setError(data.error || "Fehler beim Laden");
        return;
      }
      const merged = mergeWithDefaults(data.data, DICT_MAP);
      setDisplayState(merged);
      setCurrentEtag(data.etag);
      initialSnapshotRef.current = JSON.stringify(merged);
      setSnapshotVersion((v) => v + 1);
      setStaleConflict(false);
      userTouchedRef.current = false;
    } catch {
      setError("Verbindungsfehler");
    }
  }

  async function handleSave() {
    setError("");
    setSaving(true);
    try {
      const payload = stripDictEqual(displayState, DICT_MAP);
      const res = await dashboardFetch("/api/dashboard/site-settings/submission-form-texts/", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: payload, etag: currentEtag }),
      });
      const data: FetchResponse = await res.json();
      if (res.status === 409 || data.code === "stale_etag") {
        setStaleConflict(true);
        return;
      }
      if (!data.success) {
        setError(data.error || "Fehler beim Speichern");
        return;
      }
      const newDisplay = mergeWithDefaults(data.data, DICT_MAP);
      setDisplayState(newDisplay);
      setCurrentEtag(data.etag);
      initialSnapshotRef.current = JSON.stringify(newDisplay);
      setSnapshotVersion((v) => v + 1);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch {
      setError("Verbindungsfehler");
    } finally {
      setSaving(false);
    }
  }

  const editableKeys = activeForm === "mitgliedschaft"
    ? MITGLIEDSCHAFT_EDITABLE_KEYS
    : NEWSLETTER_EDITABLE_KEYS;
  const localeFields = (displayState[activeForm] as Record<Locale, SubmissionFormFields<typeof activeForm>>)[activeLocale];

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Editiere die öffentlichen Texte beider Formulare (Mitgliedschaft + Newsletter). Form-Beschriftungen
        (Vorname, E-Mail, Submit-Button) bleiben hartkodiert. Leere Felder fallen auf den Standardtext zurück.
      </p>

      {staleConflict && (
        <div className="border border-orange-400 bg-orange-50 px-3 py-2 text-sm text-orange-900 rounded">
          <p className="font-medium">Inhalt wurde inzwischen von einem anderen Admin geändert.</p>
          <p>Bitte neu laden — deine lokalen Änderungen werden verworfen.</p>
          <button
            type="button"
            onClick={handleReload}
            className="mt-2 px-3 py-1 border border-orange-700 text-orange-900 rounded text-xs hover:bg-orange-100"
          >
            Neu laden
          </button>
        </div>
      )}

      <div className="flex gap-1 border-b" role="tablist" aria-label="Formular">
        {SUBMISSION_FORMS.map((f) => {
          const active = f === activeForm;
          return (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`submission-form-${f}`}
              onClick={() => setActiveForm(f)}
              className={`px-4 py-2 -mb-px border-b-2 text-sm font-medium transition-colors ${
                active
                  ? "border-black text-black"
                  : "border-transparent text-gray-500 hoverable:hover:text-gray-800"
              }`}
            >
              {FORM_LABELS[f]}
            </button>
          );
        })}
      </div>

      <div className="flex gap-1 border-b" role="tablist" aria-label="Sprache">
        {LOCALES.map((loc) => {
          const active = loc === activeLocale;
          return (
            <button
              key={loc}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`submission-locale-${loc}`}
              onClick={() => setActiveLocale(loc)}
              className={`px-3 py-1.5 -mb-px border-b-2 text-xs font-medium transition-colors ${
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

      <div className="space-y-3">
        {editableKeys.map((field) => {
          const fieldKey = field as string;
          const isMultiline = MULTILINE_FIELDS.has(fieldKey);
          const inputId = `submission-text-${activeForm}-${activeLocale}-${fieldKey}`;
          const value = (localeFields as Record<string, string>)[fieldKey] ?? "";
          return (
            <div key={fieldKey}>
              <label htmlFor={inputId} className="block text-xs font-medium text-gray-700 mb-1">
                {FIELD_LABELS[fieldKey] ?? fieldKey}
              </label>
              {isMultiline ? (
                <textarea
                  id={inputId}
                  value={value}
                  onChange={(e) => handleFieldChange(activeForm, activeLocale, fieldKey, e.target.value)}
                  rows={4}
                  className="w-full px-2 py-1.5 border rounded text-sm font-mono focus:outline-none focus:ring-1 focus:ring-black"
                />
              ) : (
                <input
                  id={inputId}
                  type="text"
                  value={value}
                  onChange={(e) => handleFieldChange(activeForm, activeLocale, fieldKey, e.target.value)}
                  className="w-full px-2 py-1.5 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-black"
                />
              )}
            </div>
          );
        })}
      </div>

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
        <button
          type="button"
          onClick={handleResetActive}
          className="px-4 py-2 border border-gray-400 text-gray-700 rounded hover:bg-gray-50 text-sm"
        >
          Auf Standard zurücksetzen
        </button>
        {savedFlash && <span className="text-sm text-green-700">Gespeichert.</span>}
      </div>
    </div>
  );
}
