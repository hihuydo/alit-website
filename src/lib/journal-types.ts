export type JournalInlineMark =
  | { type: "bold" }
  | { type: "italic" }
  | { type: "highlight" }
  | { type: "link"; href: string; title?: string; external?: boolean; download?: boolean };

export type JournalTextNode = {
  text: string;
  marks?: JournalInlineMark[];
};

export type JournalBlock =
  | { id: string; type: "paragraph"; content: JournalTextNode[] }
  | { id: string; type: "quote"; content: JournalTextNode[]; attribution?: string }
  | { id: string; type: "heading"; level: 2 | 3; content: JournalTextNode[] }
  | { id: string; type: "highlight"; content: JournalTextNode[] }
  | { id: string; type: "caption"; content: JournalTextNode[] }
  | { id: string; type: "image"; src: string; alt?: string; caption?: string; width?: "full" | "half" }
  | { id: string; type: "video"; src: string; mime_type: string; caption?: string }
  | { id: string; type: "embed"; url: string; caption?: string }
  | { id: string; type: "spacer"; size?: "s" | "m" | "l" };

export type JournalContent = JournalBlock[];

export interface DashboardJournalEntry {
  id: number;
  date: string;
  author: string | null;
  title: string | null;
  title_border: boolean;
  lines: string[];
  images: { src: string; afterLine: number }[] | null;
  content: JournalContent | null;
  footer: string | null;
  hashtags: { tag_i18n?: { de?: string; fr?: string | null }; tag?: string; projekt_slug: string }[] | null;
  sort_order: number;
  title_i18n: { de?: string | null; fr?: string | null } | null;
  content_i18n: { de?: JournalContent | null; fr?: JournalContent | null } | null;
  footer_i18n: { de?: string | null; fr?: string | null } | null;
  completion: { de: boolean; fr: boolean };
}

// Allowed values for server-side validation
export const ALLOWED_BLOCK_TYPES = new Set([
  "paragraph",
  "quote",
  "heading",
  "highlight",
  "caption",
  "image",
  "video",
  "embed",
  "spacer",
]);
export const ALLOWED_MARK_TYPES = new Set([
  "bold",
  "italic",
  "highlight",
  "link",
]);
export const ALLOWED_HEADING_LEVELS = new Set([2, 3]);
export const ALLOWED_SPACER_SIZES = new Set(["s", "m", "l"]);
export const ALLOWED_IMAGE_WIDTHS = new Set(["full", "half"]);
