import pool from "./db";
import { getDictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import {
  pickEditableFields,
  type SubmissionFormFields,
} from "./submission-form-fields";

export const SUBMISSION_FORM_TEXTS_KEY = "submission_form_texts_i18n";

export type SubmissionTextsForLocale = {
  mitgliedschaft: SubmissionFormFields<"mitgliedschaft">;
  newsletter: SubmissionFormFields<"newsletter">;
};

/**
 * Public-page loader: returns the editable mitgliedschaft + newsletter prose
 * for `locale`, with per-field fallback to dictionary defaults.
 *
 * NOT for the dashboard GET-API-route — that returns raw normalized DB state
 * so the editor sees user-saved values instead of merged-defaults.
 *
 * Diverges from `getLeisteLabels` by wrapping the SELECT in try/catch so a
 * DB outage falls back to defaults rather than crashing the public layout
 * render. (Backport to `getLeisteLabels` tracked in memory/todo.md.)
 */
export async function getSubmissionFormTexts(
  locale: Locale,
): Promise<SubmissionTextsForLocale> {
  const defaults: SubmissionTextsForLocale = {
    mitgliedschaft: pickEditableFields("mitgliedschaft", getDictionary(locale).mitgliedschaft),
    newsletter: pickEditableFields("newsletter", getDictionary(locale).newsletter),
  };

  let stored: Record<string, unknown> | null = null;
  try {
    const { rows } = await pool.query<{ value: string | null }>(
      "SELECT value FROM site_settings WHERE key = $1",
      [SUBMISSION_FORM_TEXTS_KEY],
    );
    if (rows.length > 0 && typeof rows[0].value === "string" && rows[0].value.trim()) {
      try {
        const parsed = JSON.parse(rows[0].value) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          stored = parsed as Record<string, unknown>;
        }
      } catch (err) {
        console.warn("[getSubmissionFormTexts] invalid stored JSON, falling back to dict:", err);
      }
    }
  } catch (err) {
    console.warn("[getSubmissionFormTexts] DB error, falling back to dict:", err);
    return defaults;
  }

  return {
    mitgliedschaft: mergeForm("mitgliedschaft", stored, locale, defaults.mitgliedschaft),
    newsletter: mergeForm("newsletter", stored, locale, defaults.newsletter),
  };
}

function mergeForm<F extends "mitgliedschaft" | "newsletter">(
  form: F,
  stored: Record<string, unknown> | null,
  locale: Locale,
  defaults: SubmissionFormFields<F>,
): SubmissionFormFields<F> {
  const formNode = stored?.[form];
  if (!formNode || typeof formNode !== "object" || Array.isArray(formNode)) {
    return defaults;
  }
  const localeNode = (formNode as Record<string, unknown>)[locale];
  if (!localeNode || typeof localeNode !== "object" || Array.isArray(localeNode)) {
    return defaults;
  }
  const source = localeNode as Record<string, unknown>;
  const merged = { ...defaults };
  for (const k of Object.keys(defaults) as (keyof SubmissionFormFields<F>)[]) {
    const v = source[k as string];
    const trimmed = typeof v === "string" ? v.trim() : "";
    if (trimmed) {
      (merged as Record<string, string>)[k as string] = v as string;
    }
  }
  return merged;
}
