export type Locale = "de" | "fr";

export type TranslatableField<T> = {
  de?: T | null;
  fr?: T | null;
};

export function isEmptyField<T>(v: T | null | undefined): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim().length === 0;
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

export function t<T>(
  field: TranslatableField<T> | null | undefined,
  locale: Locale,
  fallback: Locale = "de",
): T | null {
  if (!field) return null;
  const primary = field[locale];
  if (!isEmptyField(primary)) return primary as T;
  if (locale === fallback) return null;
  const fb = field[fallback];
  if (!isEmptyField(fb)) return fb as T;
  return null;
}

export function hasLocale<T>(
  field: TranslatableField<T> | null | undefined,
  locale: Locale,
): boolean {
  if (!field) return false;
  return !isEmptyField(field[locale]);
}
