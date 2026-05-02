/**
 * Shape stored in `site_settings.value` under key `nav_labels_i18n`.
 * Null per-locale = admin has not set content for this locale → use dict
 * fallback at render time. Mirrors `LeisteLabelsI18n` (PR #124).
 */
export interface NavLabels {
  agenda: string;
  projekte: string;
  alit: string;
  mitgliedschaft: string;
  newsletter: string;
}

export interface NavLabelsI18n {
  de: NavLabels | null;
  fr: NavLabels | null;
}

export const NAV_LABELS_KEY = "nav_labels_i18n";

export const NAV_FIELD_KEYS = [
  "agenda",
  "projekte",
  "alit",
  "mitgliedschaft",
  "newsletter",
] as const satisfies ReadonlyArray<keyof NavLabels>;

export const DEFAULT_NAV_LABELS_DE: NavLabels = {
  agenda: "Agenda",
  projekte: "Projekte",
  alit: "Über Alit",
  mitgliedschaft: "Mitgliedschaft",
  newsletter: "Newsletter",
};

export const DEFAULT_NAV_LABELS_FR: NavLabels = {
  agenda: "Agenda",
  projekte: "Projets",
  alit: "À propos",
  mitgliedschaft: "Adhésion",
  newsletter: "Newsletter",
};

/**
 * Returns true when every field is empty/whitespace-only. Used to detect
 * "admin cleared every field" → render dict default.
 */
export function isNavLabelsEmpty(labels: NavLabels | null | undefined): boolean {
  if (!labels) return true;
  return NAV_FIELD_KEYS.every((k) => !labels[k].trim());
}
