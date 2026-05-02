"use client";

import { useEffect, useMemo, useState } from "react";
import { dashboardFetch } from "../lib/dashboardFetch";
import { dashboardStrings } from "../i18n";
import { useDirty } from "../DirtyContext";
import {
  DEFAULT_NAV_LABELS_DE,
  DEFAULT_NAV_LABELS_FR,
  NAV_FIELD_KEYS,
  type NavLabels,
  type NavLabelsI18n,
} from "@/lib/nav-labels-shared";

const FIELDS = [
  { key: "agenda" as const, labelKey: "fieldAgenda" as const },
  { key: "projekte" as const, labelKey: "fieldProjekte" as const },
  { key: "alit" as const, labelKey: "fieldAlit" as const },
  { key: "mitgliedschaft" as const, labelKey: "fieldMitgliedschaft" as const },
  { key: "newsletter" as const, labelKey: "fieldNewsletter" as const },
];

const EMPTY_LABELS: NavLabels = {
  agenda: "",
  projekte: "",
  alit: "",
  mitgliedschaft: "",
  newsletter: "",
};

function fromInitial(initial: NavLabelsI18n): { de: NavLabels; fr: NavLabels } {
  return {
    de: initial.de ?? { ...EMPTY_LABELS },
    fr: initial.fr ?? { ...EMPTY_LABELS },
  };
}

function isAllEmpty(labels: NavLabels): boolean {
  return NAV_FIELD_KEYS.every((k) => !labels[k].trim());
}

export function NavLabelsSection({ initial }: { initial: NavLabelsI18n }) {
  const tNav = dashboardStrings.nav;
  const tLeiste = dashboardStrings.leiste;
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
    setDirty("nav-labels", isDirty);
  }, [isDirty, setDirty]);

  useEffect(() => () => setDirty("nav-labels", false), [setDirty]);

  const updateField = (locale: "de" | "fr", key: keyof NavLabels, value: string) => {
    setForm((prev) => ({ ...prev, [locale]: { ...prev[locale], [key]: value } }));
  };

  const handleReset = () => {
    setForm(JSON.parse(savedSnapshot) as { de: NavLabels; fr: NavLabels });
    setError("");
    setSavedAt(null);
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setError("");
    setSavedAt(null);
    const payload: NavLabelsI18n = {
      de: isAllEmpty(form.de) ? null : form.de,
      fr: isAllEmpty(form.fr) ? null : form.fr,
    };
    try {
      const res = await dashboardFetch("/api/dashboard/site-settings/nav-labels/", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Fehler beim Speichern");
        return;
      }
      const next = fromInitial((data.data ?? { de: null, fr: null }) as NavLabelsI18n);
      setForm(next);
      setSavedSnapshot(JSON.stringify(next));
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
        <h3 className="text-lg font-semibold mb-2">{tNav.heading}</h3>
        <p className="text-sm text-gray-600">{tNav.intro}</p>
      </div>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
      )}
      {savedAt && !error && (
        <p data-testid="nav-saved-toast" className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
          {tLeiste.savedToast}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {(["de", "fr"] as const).map((locale) => {
          const defaults = locale === "fr" ? DEFAULT_NAV_LABELS_FR : DEFAULT_NAV_LABELS_DE;
          return (
            <div key={locale} className="bg-white border rounded p-4 space-y-3">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">
                {locale === "de" ? tLeiste.localeDeHeading : tLeiste.localeFrHeading}
              </h4>
              {FIELDS.map(({ key, labelKey }) => {
                const fallback = defaults[key];
                return (
                  <label key={key} className="block">
                    <span className="block text-xs text-gray-600 mb-1">{tNav[labelKey]}</span>
                    <input
                      type="text"
                      value={form[locale][key]}
                      onChange={(e) => updateField(locale, key, e.target.value)}
                      placeholder={fallback || `${tLeiste.defaultHint}—`}
                      maxLength={200}
                      data-testid={`nav-${locale}-${key}`}
                      className="w-full border border-black/30 rounded px-2 py-1 text-sm bg-white"
                    />
                    {fallback && (
                      <span className="text-[11px] text-gray-400">
                        {tLeiste.defaultHint}
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
          data-testid="nav-reset"
        >
          {tLeiste.reset}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!isDirty || saving}
          className="bg-black text-white px-4 py-2 text-sm disabled:opacity-40"
          data-testid="nav-save"
        >
          {saving ? tLeiste.saving : tLeiste.save}
        </button>
      </div>
    </div>
  );
}
