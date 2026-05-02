import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";

export const SUBMISSION_FORMS = ["mitgliedschaft", "newsletter"] as const;
export type SubmissionForm = (typeof SUBMISSION_FORMS)[number];

export const MITGLIEDSCHAFT_EDITABLE_KEYS = [
  "heading",
  "intro",
  "consent",
  "successTitle",
  "successBody",
  "errorGeneric",
  "errorDuplicate",
  "errorRate",
] as const;
export type MitgliedschaftEditableKey = (typeof MITGLIEDSCHAFT_EDITABLE_KEYS)[number];

export const NEWSLETTER_EDITABLE_KEYS = [
  "heading",
  "intro",
  "consent",
  "successTitle",
  "successBody",
  "errorGeneric",
  "errorRate",
  "privacy",
] as const;
export type NewsletterEditableKey = (typeof NEWSLETTER_EDITABLE_KEYS)[number];

export type EditableFieldsByForm = {
  mitgliedschaft: MitgliedschaftEditableKey;
  newsletter: NewsletterEditableKey;
};

export type SubmissionFormFields<F extends SubmissionForm> = {
  [K in EditableFieldsByForm[F]]: string;
};

export type SubmissionTextsRaw = {
  mitgliedschaft: { de: Partial<SubmissionFormFields<"mitgliedschaft">>; fr: Partial<SubmissionFormFields<"mitgliedschaft">> };
  newsletter: { de: Partial<SubmissionFormFields<"newsletter">>; fr: Partial<SubmissionFormFields<"newsletter">> };
};

export type SubmissionTextsDisplay = {
  mitgliedschaft: { de: SubmissionFormFields<"mitgliedschaft">; fr: SubmissionFormFields<"mitgliedschaft"> };
  newsletter: { de: SubmissionFormFields<"newsletter">; fr: SubmissionFormFields<"newsletter"> };
};

export type DictMap = { de: Dictionary; fr: Dictionary };

export const LOCALES: readonly Locale[] = ["de", "fr"] as const;

export function editableKeysFor<F extends SubmissionForm>(form: F): readonly EditableFieldsByForm[F][] {
  return (form === "mitgliedschaft"
    ? MITGLIEDSCHAFT_EDITABLE_KEYS
    : NEWSLETTER_EDITABLE_KEYS) as readonly EditableFieldsByForm[F][];
}

/**
 * Project a dict slice (or a stored payload slice) onto the editable keys of
 * a given form. Pure — used by Editor reset and DB-loader merge to share a
 * single source of truth for "which keys count as editable".
 */
export function pickEditableFields<F extends SubmissionForm>(
  form: F,
  source: Record<string, unknown> | undefined | null,
): SubmissionFormFields<F> {
  const keys = editableKeysFor(form);
  const out = {} as SubmissionFormFields<F>;
  for (const k of keys) {
    const v = source?.[k];
    out[k] = typeof v === "string" ? v : "";
  }
  return out;
}

/**
 * Merge raw stored payload with dictionary defaults for ALL forms × locales.
 * Trim-aware: empty-string AND whitespace-only-string both fall back to the
 * default (consistent with DK-4 pickField semantics — admin can't whitespace-
 * pollute a heading via copy/paste, can't accidentally clear a field empty).
 *
 * Result is fully populated (every editable field set) for both locales. Used
 * by both the editor's display state and the public-page render.
 */
export function mergeWithDefaults(
  raw: Partial<SubmissionTextsRaw> | undefined | null,
  dictMap: DictMap,
): SubmissionTextsDisplay {
  const out = {} as SubmissionTextsDisplay;
  for (const form of SUBMISSION_FORMS) {
    out[form] = { de: {} as never, fr: {} as never };
    for (const locale of LOCALES) {
      const keys = editableKeysFor(form);
      const stored = (raw?.[form]?.[locale] ?? {}) as Record<string, unknown>;
      const defaults = dictMap[locale][form] as unknown as Record<string, string>;
      const merged = {} as SubmissionFormFields<typeof form>;
      for (const k of keys) {
        const v = stored[k];
        const trimmed = typeof v === "string" ? v.trim() : "";
        (merged as Record<string, string>)[k] = trimmed ? (v as string) : defaults[k];
      }
      (out[form] as Record<Locale, unknown>)[locale] = merged;
    }
  }
  return out;
}

/**
 * Strip out any field that exact-matches the dictionary default. Inverse of
 * `mergeWithDefaults` — produces the minimal payload to PUT (defaults are
 * never persisted, so a "reset to default" save shrinks the DB row).
 *
 * Returns the full top-level structure (DK-1 requires all 4 form×locale
 * sub-objects present, even if `{}`). Empty leaf objects are valid output.
 */
export function stripDictEqual(
  display: SubmissionTextsDisplay,
  dictMap: DictMap,
): SubmissionTextsRaw {
  const out = {} as SubmissionTextsRaw;
  for (const form of SUBMISSION_FORMS) {
    out[form] = { de: {}, fr: {} };
    for (const locale of LOCALES) {
      const keys = editableKeysFor(form);
      const displayLocale = display[form][locale] as unknown as Record<string, string>;
      const defaults = dictMap[locale][form] as unknown as Record<string, string>;
      const minimal: Record<string, string> = {};
      for (const k of keys) {
        const v = displayLocale[k];
        if (typeof v === "string" && v !== defaults[k]) {
          minimal[k] = v;
        }
      }
      (out[form] as Record<Locale, unknown>)[locale] = minimal;
    }
  }
  return out;
}
