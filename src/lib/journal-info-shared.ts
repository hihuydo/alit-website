import type { JournalContent } from "./journal-types";

/**
 * Shape stored in `site_settings.value` under key `journal_info_i18n`.
 * Null per-locale = admin has not set content for this locale → use dict
 * fallback at render time.
 */
export interface JournalInfoI18n {
  de: JournalContent | null;
  fr: JournalContent | null;
}

/**
 * Returns true when `content` has no renderable text. Empty arrays, arrays
 * of blocks whose text-children are all empty/whitespace-only, null — all
 * count as empty. A paragraph with a single `<br>`-derived empty text-node
 * (what RichTextEditor produces when the field is cleared) normalizes to
 * empty so the dict fallback kicks back in.
 *
 * Pure: no imports beyond JournalContent. Safe for Edge runtime.
 */
export function isJournalInfoEmpty(content: JournalContent | null | undefined): boolean {
  if (!content || !Array.isArray(content) || content.length === 0) return true;
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    // Media/embed/spacer blocks are inherently non-empty; we never expect them
    // in the i-bar but if present they keep the content "non-empty".
    if (block.type === "image" || block.type === "video" || block.type === "embed") return false;
    if (block.type === "spacer") continue;
    const textNodes = (block as { content?: { text?: unknown }[] }).content;
    if (!Array.isArray(textNodes)) continue;
    for (const node of textNodes) {
      if (node && typeof node === "object" && typeof node.text === "string" && node.text.trim()) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Wrap a plain-text dict string as a single-paragraph JournalContent so the
 * public-side `JournalBlockRenderer` can render it uniformly.
 */
export function wrapDictAsParagraph(text: string): JournalContent {
  return [
    {
      id: "dict-fallback",
      type: "paragraph",
      content: [{ text }],
    },
  ];
}
