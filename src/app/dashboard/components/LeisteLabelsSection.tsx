"use client";

import { useEffect, useMemo, useState } from "react";
import { dashboardFetch } from "../lib/dashboardFetch";
import { dashboardStrings } from "../i18n";
import { useDirty } from "../DirtyContext";
import {
  DEFAULT_LEISTE_LABELS_DE,
  DEFAULT_LEISTE_LABELS_FR,
  type LeisteLabels,
  type LeisteLabelsI18n,
} from "@/lib/leiste-labels-shared";

const FIELDS = [
  { key: "verein" as const, labelKey: "fieldVerein" as const },
  { key: "vereinSub" as const, labelKey: "fieldVereinSub" as const },
  { key: "literatur" as const, labelKey: "fieldLiteratur" as const },
  { key: "literaturSub" as const, labelKey: "fieldLiteraturSub" as const },
  { key: "stiftung" as const, labelKey: "fieldStiftung" as const },
  { key: "stiftungSub" as const, labelKey: "fieldStiftungSub" as const },
];

const EMPTY_LABELS: LeisteLabels = {
  verein: "",
  vereinSub: "",
  literatur: "",
  literaturSub: "",
  stiftung: "",
  stiftungSub: "",
};

function fromInitial(initial: LeisteLabelsI18n): { de: LeisteLabels; fr: LeisteLabels } {
  return {
    de: initial.de ?? { ...EMPTY_LABELS },
    fr: initial.fr ?? { ...EMPTY_LABELS },
  };
}

function isAllEmpty(labels: LeisteLabels): boolean {
  return FIELDS.every(({ key }) => !labels[key].trim());
}

export function LeisteLabelsSection({ initial }: { initial: LeisteLabelsI18n }) {
  const t = dashboardStrings.leiste;
  const { setDirty } = useDirty();
  const [form, setForm] = useState(() => fromInitial(initial));
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(form));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const isDirty = useMemo(
    () => JSON.stringify(form) !== savedSnapshot,
    [form, savedSnapshot],
  );

  useEffect(() => {
    setDirty("leiste", isDirty);
  }, [isDirty, setDirty]);

  useEffect(() => () => setDirty("leiste", false), [setDirty]);

  const updateField = (locale: "de" | "fr", key: keyof LeisteLabels, value: string) => {
    setForm((prev) => ({ ...prev, [locale]: { ...prev[locale], [key]: value } }));
  };

  const handleReset = () => {
    const fresh = fromInitial(initial);
    setForm(fresh);
    setError("");
    setSavedAt(null);
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setError("");
    setSavedAt(null);
    // Convert empty-objects back to null so the server stores null per-locale
    // (= "use dict default for this locale"). Keeps the stored JSON tidy.
    const payload: LeisteLabelsI18n = {
      de: isAllEmpty(form.de) ? null : form.de,
      fr: isAllEmpty(form.fr) ? null : form.fr,
    };
    try {
      const res = await dashboardFetch("/api/dashboard/site-settings/leiste-labels/", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Fehler beim Speichern");
        return;
      }
      // Snapshot the saved state for fresh dirty-tracking.
      setSavedSnapshot(JSON.stringify(form));
      setSavedAt(Date.now());
    } catch {
      setError("Verbindungsfehler");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-2">{t.heading}</h2>
        <p className="text-sm text-gray-600">{t.intro}</p>
      </div>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
      )}
      {savedAt && !error && (
        <p data-testid="leiste-saved-toast" className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
          {t.savedToast}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {(["de", "fr"] as const).map((locale) => {
          const defaults = locale === "fr" ? DEFAULT_LEISTE_LABELS_FR : DEFAULT_LEISTE_LABELS_DE;
          return (
            <div key={locale} className="bg-white border rounded p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                {locale === "de" ? t.localeDeHeading : t.localeFrHeading}
              </h3>
              {FIELDS.map(({ key, labelKey }) => {
                const fallback = defaults[key];
                return (
                  <label key={key} className="block">
                    <span className="block text-xs text-gray-600 mb-1">{t[labelKey]}</span>
                    <input
                      type="text"
                      value={form[locale][key]}
                      onChange={(e) => updateField(locale, key, e.target.value)}
                      placeholder={fallback || `${t.defaultHint}—`}
                      maxLength={200}
                      data-testid={`leiste-${locale}-${key}`}
                      className="w-full border border-black/30 rounded px-2 py-1 text-sm"
                    />
                    {fallback && (
                      <span className="text-[11px] text-gray-400">
                        {t.defaultHint}
                        {fallback}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="flex gap-2 justify-end pt-2">
        <button
          type="button"
          onClick={handleReset}
          disabled={!isDirty || saving}
          className="border border-black px-4 py-2 text-sm disabled:opacity-40"
          data-testid="leiste-reset"
        >
          {t.reset}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!isDirty || saving}
          className="bg-black text-white px-4 py-2 text-sm disabled:opacity-40"
          data-testid="leiste-save"
        >
          {saving ? t.saving : t.save}
        </button>
      </div>
    </div>
  );
}
