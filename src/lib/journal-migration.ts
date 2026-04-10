import type { JournalContent, JournalTextNode } from "./journal-types";

let counter = 0;

function generateBlockId(): string {
  return `m${Date.now().toString(36)}-${(counter++).toString(36)}`;
}

/**
 * Detect bare URLs in text and convert them to link marks.
 */
function parseLineText(text: string): JournalTextNode[] {
  const nodes: JournalTextNode[] = [];
  const urlRe = /\(?(https?:\/\/[^\s)]+)\)?/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = urlRe.exec(text)) !== null) {
    const url = match[1];
    if (match.index > lastIndex) {
      nodes.push({ text: text.slice(lastIndex, match.index) });
    }
    nodes.push({
      text: url,
      marks: [{ type: "link", href: url, external: true }],
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push({ text: text.slice(lastIndex) });
  }

  return nodes.length > 0 ? nodes : [{ text }];
}

/**
 * Convert legacy lines[] + images[] into JournalContent blocks.
 */
export function migrateLinesToContent(
  lines: string[],
  images?: { src: string; afterLine: number }[] | null
): JournalContent {
  const blocks: JournalContent = [];

  const imageMap = new Map<number, { src: string; afterLine: number }[]>();
  if (images) {
    for (const img of images) {
      const existing = imageMap.get(img.afterLine) ?? [];
      existing.push(img);
      imageMap.set(img.afterLine, existing);
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line === "") {
      blocks.push({ id: generateBlockId(), type: "spacer", size: "m" });
    } else {
      blocks.push({
        id: generateBlockId(),
        type: "paragraph",
        content: parseLineText(line),
      });
    }

    const imagesAfter = imageMap.get(i);
    if (imagesAfter) {
      for (const img of imagesAfter) {
        blocks.push({
          id: generateBlockId(),
          type: "image",
          src: img.src,
          width: "half",
        });
      }
    }
  }

  // Append orphaned images whose afterLine is out of range
  for (const [pos, imgs] of imageMap) {
    if (pos >= lines.length) {
      for (const img of imgs) {
        blocks.push({
          id: generateBlockId(),
          type: "image",
          src: img.src,
          width: "half",
        });
      }
    }
  }

  return blocks.length > 0
    ? blocks
    : [{ id: generateBlockId(), type: "paragraph", content: [{ text: "" }] }];
}
