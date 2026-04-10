import type {
  JournalBlock,
  JournalContent,
  JournalTextNode,
  JournalInlineMark,
} from "./journal-editor-types";

let counter = 0;

export function generateBlockId(): string {
  return `b${Date.now().toString(36)}-${(counter++).toString(36)}`;
}

type TextBlock = Extract<JournalBlock, { content: JournalTextNode[] }>;

export function createBlock(type: JournalBlock["type"]): JournalBlock {
  const id = generateBlockId();
  switch (type) {
    case "paragraph":
      return { id, type: "paragraph", content: [{ text: "" }] };
    case "quote":
      return { id, type: "quote", content: [{ text: "" }] };
    case "heading":
      return { id, type: "heading", level: 2, content: [{ text: "" }] };
    case "highlight":
      return { id, type: "highlight", content: [{ text: "" }] };
    case "image":
      return { id, type: "image", src: "" };
    case "spacer":
      return { id, type: "spacer", size: "m" };
  }
}

export function moveBlock(
  blocks: JournalContent,
  index: number,
  direction: "up" | "down"
): JournalContent {
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= blocks.length) return blocks;
  const next = [...blocks];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function removeBlock(
  blocks: JournalContent,
  index: number
): JournalContent {
  return blocks.filter((_, i) => i !== index);
}

export function updateBlock(
  blocks: JournalContent,
  index: number,
  updated: JournalBlock
): JournalContent {
  return blocks.map((b, i) => (i === index ? updated : b));
}

export function insertBlock(
  blocks: JournalContent,
  index: number,
  block: JournalBlock
): JournalContent {
  const next = [...blocks];
  next.splice(index + 1, 0, block);
  return next;
}

// ---------------------------------------------------------------------------
// Inline-text parsing: markdown-like syntax ↔ JournalTextNode[]
// Supported: **bold**, *italic*, ==highlight==, [text](url)
// ---------------------------------------------------------------------------

/**
 * Parse a plain-text string with inline markdown syntax into JournalTextNode[].
 * Nesting is NOT supported — marks are flat.
 */
export function parseInlineText(raw: string): JournalTextNode[] {
  if (!raw) return [{ text: "" }];

  const tokens: JournalTextNode[] = [];
  // Regex matches (in order): **bold**, *italic*, ==highlight==, [text](url)
  const re =
    /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(?<!=)(==(.+?)==)|\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(raw)) !== null) {
    // Text before match
    if (match.index > lastIndex) {
      tokens.push({ text: raw.slice(lastIndex, match.index) });
    }

    if (match[1]) {
      // **bold**
      tokens.push({ text: match[2], marks: [{ type: "bold" }] });
    } else if (match[3]) {
      // *italic*
      tokens.push({ text: match[4], marks: [{ type: "italic" }] });
    } else if (match[5]) {
      // ==highlight==
      tokens.push({ text: match[6], marks: [{ type: "highlight" }] });
    } else if (match[7]) {
      // [text](url)
      const href = match[8];
      const external =
        href.startsWith("http://") || href.startsWith("https://");
      tokens.push({
        text: match[7],
        marks: [{ type: "link", href, external }],
      });
    }
    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < raw.length) {
    tokens.push({ text: raw.slice(lastIndex) });
  }

  return tokens.length > 0 ? tokens : [{ text: "" }];
}

/**
 * Serialize JournalTextNode[] back to markdown-like plain text for editing.
 */
export function serializeTextNodes(nodes: JournalTextNode[]): string {
  return nodes
    .map((node) => {
      let t = node.text;
      if (!node.marks || node.marks.length === 0) return t;
      for (const mark of node.marks) {
        switch (mark.type) {
          case "bold":
            t = `**${t}**`;
            break;
          case "italic":
            t = `*${t}*`;
            break;
          case "highlight":
            t = `==${t}==`;
            break;
          case "link":
            t = `[${t}](${mark.href})`;
            break;
        }
      }
      return t;
    })
    .join("");
}

/**
 * Get the serialized text for a block (for textarea editing).
 */
export function getBlockText(block: JournalBlock): string {
  if ("content" in block && Array.isArray(block.content)) {
    return serializeTextNodes(block.content);
  }
  return "";
}

/**
 * Wrap selected text in a textarea with markdown syntax.
 * Returns the new text and updated selection range.
 */
export function wrapSelection(
  text: string,
  start: number,
  end: number,
  mark: "bold" | "italic" | "highlight"
): { text: string; selectionStart: number; selectionEnd: number } {
  const wrapMap = { bold: "**", italic: "*", highlight: "==" };
  const wrapper = wrapMap[mark];
  const selected = text.slice(start, end);

  // Check if already wrapped — unwrap
  const wl = wrapper.length;
  if (
    start >= wl &&
    text.slice(start - wl, start) === wrapper &&
    text.slice(end, end + wl) === wrapper
  ) {
    return {
      text: text.slice(0, start - wl) + selected + text.slice(end + wl),
      selectionStart: start - wl,
      selectionEnd: end - wl,
    };
  }

  return {
    text: text.slice(0, start) + wrapper + selected + wrapper + text.slice(end),
    selectionStart: start + wl,
    selectionEnd: end + wl,
  };
}

/**
 * Insert a link around selected text.
 */
export function insertLink(
  text: string,
  start: number,
  end: number,
  url: string
): { text: string; selectionStart: number; selectionEnd: number } {
  const selected = text.slice(start, end) || "Link";
  const replacement = `[${selected}](${url})`;
  return {
    text: text.slice(0, start) + replacement + text.slice(end),
    selectionStart: start,
    selectionEnd: start + replacement.length,
  };
}

/**
 * Check if a block has text content (for determining if it's a text block).
 */
export function isTextBlock(
  block: JournalBlock
): block is TextBlock {
  return (
    block.type === "paragraph" ||
    block.type === "quote" ||
    block.type === "heading" ||
    block.type === "highlight"
  );
}

export const BLOCK_TYPE_LABELS: Record<JournalBlock["type"], string> = {
  paragraph: "Absatz",
  quote: "Zitat",
  heading: "Überschrift",
  highlight: "Hervorhebung",
  image: "Bild",
  spacer: "Abstand",
};
