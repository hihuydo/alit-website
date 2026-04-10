export type JournalInlineMark =
  | { type: "bold" }
  | { type: "italic" }
  | { type: "highlight" }
  | { type: "link"; href: string; title?: string; external?: boolean };

export type JournalTextNode = {
  text: string;
  marks?: JournalInlineMark[];
};

export type JournalBlock =
  | { id: string; type: "paragraph"; content: JournalTextNode[] }
  | { id: string; type: "quote"; content: JournalTextNode[]; attribution?: string }
  | { id: string; type: "heading"; level: 2 | 3; content: JournalTextNode[] }
  | { id: string; type: "highlight"; content: JournalTextNode[] }
  | { id: string; type: "image"; src: string; alt?: string; caption?: string; width?: "full" | "half" }
  | { id: string; type: "spacer"; size?: "s" | "m" | "l" };

export type JournalContent = JournalBlock[];
