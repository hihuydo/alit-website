import { validateContent } from "./journal-validation";
import { isEmptyField, type Locale } from "./i18n-field";

export type I18nString = { de?: string | null; fr?: string | null };
export type I18nContent = { de?: unknown[] | null; fr?: unknown[] | null };

const ALLOWED_I18N_KEYS: ReadonlyArray<Locale> = ["de", "fr"];

export function validateI18nKeys(value: unknown, label: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    return `${label} must be an object`;
  }
  for (const key of Object.keys(value)) {
    if (!ALLOWED_I18N_KEYS.includes(key as Locale)) {
      return `${label} has unsupported key "${key}" (allowed: de, fr)`;
    }
  }
  return null;
}

export function validateI18nTitle(payload: I18nString | undefined, maxLen = 200): string | null {
  if (!payload) return null;
  for (const key of ALLOWED_I18N_KEYS) {
    const v = payload[key];
    if (v === undefined || v === null) continue;
    if (typeof v !== "string") return `title_i18n.${key} must be a string`;
    if (v.length > maxLen) return `title_i18n.${key} too long`;
  }
  return null;
}

export function validateI18nContent(payload: I18nContent | undefined): string | null {
  if (!payload) return null;
  for (const key of ALLOWED_I18N_KEYS) {
    const v = payload[key];
    if (v === undefined || v === null) continue;
    if (!Array.isArray(v)) return `content_i18n.${key} must be an array`;
    const err = validateContent(v);
    if (err) return `content_i18n.${key}: ${err}`;
  }
  return null;
}

export function buildI18nString(input: I18nString | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input) return out;
  for (const key of ALLOWED_I18N_KEYS) {
    const v = input[key];
    if (typeof v === "string") out[key] = v;
  }
  return out;
}

export function buildI18nContent(input: I18nContent | undefined): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {};
  if (!input) return out;
  for (const key of ALLOWED_I18N_KEYS) {
    const v = input[key];
    if (Array.isArray(v)) out[key] = v;
  }
  return out;
}

export type AlitRow = {
  id: number;
  title_i18n: Record<string, unknown> | null;
  content_i18n: Record<string, unknown> | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export function withCompletion(row: AlitRow) {
  const content = row.content_i18n ?? {};
  return {
    ...row,
    completion: {
      de: !isEmptyField(content.de as unknown[] | null | undefined),
      fr: !isEmptyField(content.fr as unknown[] | null | undefined),
    },
  };
}
