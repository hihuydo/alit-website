/**
 * Shape stored in `site_settings.value` under key `leiste_labels_i18n`.
 * Null per-locale = admin has not set content for this locale → use dict
 * fallback at render time. Mirrors `JournalInfoI18n` pattern (PR #99).
 */
export interface LeisteLabels {
  verein: string;
  vereinSub: string;
  literatur: string;
  literaturSub: string;
  stiftung: string;
  stiftungSub: string;
}

export interface LeisteLabelsI18n {
  de: LeisteLabels | null;
  fr: LeisteLabels | null;
}

export const LEISTE_LABELS_KEY = "leiste_labels_i18n";

/**
 * Mirror of dictionaries.ts leiste defaults — kept here so the read-helper
 * can do per-field fallback without importing the full dict module
 * (Edge-safe, fewer cross-cutting deps).
 */
export const DEFAULT_LEISTE_LABELS_DE: LeisteLabels = {
  verein: "Agenda",
  vereinSub: "",
  literatur: "Discours Agités",
  literaturSub: "",
  stiftung: "Netzwerk für Literatur*en",
  stiftungSub: "",
};

export const DEFAULT_LEISTE_LABELS_FR: LeisteLabels = {
  verein: "Agenda",
  vereinSub: "",
  literatur: "Discours Agités",
  literaturSub: "",
  stiftung: "Netzwerk für Literatur*en",
  stiftungSub: "",
};

/**
 * Returns true when all 6 fields are empty/whitespace-only. Used to detect
 * "admin cleared every field" → render dict default.
 */
export function isLeisteLabelsEmpty(labels: LeisteLabels | null | undefined): boolean {
  if (!labels) return true;
  return (
    !labels.verein.trim() &&
    !labels.vereinSub.trim() &&
    !labels.literatur.trim() &&
    !labels.literaturSub.trim() &&
    !labels.stiftung.trim() &&
    !labels.stiftungSub.trim()
  );
}
