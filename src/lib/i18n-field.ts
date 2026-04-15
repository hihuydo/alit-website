import type { JournalContent } from "./journal-types";

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

// Converts legacy plain-string paragraphs into minimal JournalContent blocks.
// Used by the projekte Sprint-2 migration to backfill content_i18n.de from the
// legacy paragraphs column for entries that have no rich-text content yet.
export function contentBlocksFromParagraphs(
  paragraphs: string[] | null | undefined,
): JournalContent {
  if (!paragraphs || !Array.isArray(paragraphs)) return [];
  const blocks: JournalContent = [];
  for (let i = 0; i < paragraphs.length; i++) {
    const text = paragraphs[i];
    if (typeof text !== "string") continue;
    if (text.trim().length === 0) {
      blocks.push({ id: `p-${i}`, type: "spacer", size: "m" });
      continue;
    }
    blocks.push({
      id: `p-${i}`,
      type: "paragraph",
      content: [{ text }],
    });
  }
  return blocks;
}

export function hasLocale<T>(
  field: TranslatableField<T> | null | undefined,
  locale: Locale,
): boolean {
  if (!field) return false;
  return !isEmptyField(field[locale]);
}
