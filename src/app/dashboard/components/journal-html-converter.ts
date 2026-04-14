import type {
  JournalBlock,
  JournalContent,
  JournalTextNode,
  JournalInlineMark,
} from "@/lib/journal-types";
import { isSafeUrl } from "@/lib/url-safety";

let counter = 0;
function id(): string {
  return `b${Date.now().toString(36)}-${(counter++).toString(36)}`;
}

// ---------------------------------------------------------------------------
// JournalBlock[] → HTML (for loading into the contentEditable editor)
// ---------------------------------------------------------------------------

function textNodesToHtml(nodes: JournalTextNode[]): string {
  return nodes
    .map((node) => {
      let html = escapeHtml(node.text);
      if (!node.marks) return html;
      for (const mark of node.marks) {
        switch (mark.type) {
          case "bold":
            html = `<strong>${html}</strong>`;
            break;
          case "italic":
            html = `<em>${html}</em>`;
            break;
          case "highlight":
            html = `<strong>${html}</strong>`;
            break;
          case "link": {
            const ext = mark.external
              ? ' target="_blank" rel="noopener noreferrer"'
              : "";
            html = `<a href="${escapeAttr(mark.href)}"${ext}>${html}</a>`;
            break;
          }
        }
      }
      return html;
    })
    .join("");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

export function blocksToHtml(blocks: JournalContent): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case "paragraph":
          return `<p>${textNodesToHtml(block.content)}</p>`;
        case "heading":
          return `<h${block.level}>${textNodesToHtml(block.content)}</h${block.level}>`;
        case "quote": {
          const attrAttr = block.attribution
            ? ` data-attribution="${escapeAttr(block.attribution)}"`
            : "";
          return `<blockquote${attrAttr}><p>${textNodesToHtml(block.content)}</p></blockquote>`;
        }
        case "highlight":
          return `<p data-block="highlight">${textNodesToHtml(block.content)}</p>`;
        case "caption":
          return `<p data-block="caption">${textNodesToHtml(block.content)}</p>`;
        case "image": {
          const widthAttr = block.width ? ` data-width="${escapeAttr(block.width)}"` : "";
          return `<figure${widthAttr}><img src="${escapeAttr(block.src)}" alt="${escapeAttr(block.alt ?? "")}" />${
            block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : ""
          }</figure>`;
        }
        case "video":
          return `<figure data-media="video"><video controls src="${escapeAttr(block.src)}" data-mime="${escapeAttr(block.mime_type)}">${
            block.mime_type ? `<source src="${escapeAttr(block.src)}" type="${escapeAttr(block.mime_type)}" />` : ""
          }</video>${
            block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : ""
          }</figure>`;
        case "embed":
          return `<figure data-media="embed"><iframe src="${escapeAttr(block.url)}" frameborder="0" allowfullscreen></iframe>${
            block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : ""
          }</figure>`;
        case "spacer":
          return `<p data-block="spacer"><br></p>`;
        default:
          return "";
      }
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// HTML → JournalBlock[] (for saving from the contentEditable editor)
// ---------------------------------------------------------------------------

function parseInlineNodes(el: Element | ChildNode): JournalTextNode[] {
  const nodes: JournalTextNode[] = [];

  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === 3 /* TEXT_NODE */) {
      const text = child.textContent ?? "";
      if (text) nodes.push({ text });
    } else if (child.nodeType === 1 /* ELEMENT_NODE */) {
      const elem = child as Element;
      const tag = elem.tagName.toLowerCase();
      const inner = parseInlineNodes(elem);

      let mark: JournalInlineMark | null = null;
      if (tag === "strong" || tag === "b") mark = { type: "bold" };
      else if (tag === "em" || tag === "i") mark = { type: "italic" };
      else if (tag === "a") {
        const href = elem.getAttribute("href") ?? "";
        if (!isSafeUrl(href)) {
          // Unsafe URL — flatten to plain text
          nodes.push(...inner);
          continue;
        }
        const external = href.startsWith("http://") || href.startsWith("https://");
        mark = { type: "link", href, external };
      }

      if (mark) {
        for (const node of inner) {
          const existingMarks = node.marks ?? [];
          nodes.push({ text: node.text, marks: [...existingMarks, mark] });
        }
      } else {
        // Unknown inline tag — just flatten children
        nodes.push(...inner);
      }
    }
  }

  return nodes;
}

function parseBlockElement(el: Element): JournalBlock[] {
  const tag = el.tagName.toLowerCase();

  if (tag === "h2" || tag === "h3") {
    const level = tag === "h2" ? 2 : 3;
    return [{ id: id(), type: "heading", level: level as 2 | 3, content: parseInlineNodes(el) }];
  }

  if (tag === "blockquote") {
    // Flatten blockquote children into one quote block
    const content: JournalTextNode[] = [];
    for (const child of Array.from(el.children)) {
      content.push(...parseInlineNodes(child));
    }
    if (content.length === 0) content.push(...parseInlineNodes(el));
    const attribution = el.getAttribute("data-attribution") || undefined;
    return [{ id: id(), type: "quote", content, attribution }];
  }

  if (tag === "figure") {
    const mediaType = el.getAttribute("data-media");
    const caption = el.querySelector("figcaption")?.textContent ?? undefined;

    if (mediaType === "video") {
      const video = el.querySelector("video");
      const source = el.querySelector("source");
      const src = video?.getAttribute("src") ?? source?.getAttribute("src") ?? "";
      const mime_type = video?.getAttribute("data-mime") ?? source?.getAttribute("type") ?? "video/mp4";
      return [{ id: id(), type: "video", src, mime_type, caption }];
    }

    if (mediaType === "embed") {
      const iframe = el.querySelector("iframe");
      const url = iframe?.getAttribute("src") ?? "";
      return [{ id: id(), type: "embed", url, caption }];
    }

    const img = el.querySelector("img");
    if (img) {
      const rawWidth = el.getAttribute("data-width");
      const width = rawWidth === "full" || rawWidth === "half" ? rawWidth : undefined;
      return [{
        id: id(),
        type: "image",
        src: img.getAttribute("src") ?? "",
        alt: img.getAttribute("alt") ?? undefined,
        caption,
        width,
      }];
    }
  }

  if (tag === "hr") {
    return [{ id: id(), type: "spacer", size: "m" }];
  }

  if (tag === "ul" || tag === "ol") {
    // Convert list items to individual paragraph blocks
    const blocks: JournalBlock[] = [];
    for (const li of Array.from(el.querySelectorAll("li"))) {
      blocks.push({ id: id(), type: "paragraph", content: parseInlineNodes(li) });
    }
    return blocks;
  }

  if (tag === "p" || tag === "div") {
    const content = parseInlineNodes(el);
    // Skip empty paragraphs
    if (content.length === 0 || (content.length === 1 && !content[0].text.trim())) {
      return [{ id: id(), type: "spacer", size: "m" }];
    }
    // Preserve block type via data attribute
    const dataBlock = el.getAttribute("data-block");
    if (dataBlock === "spacer") {
      return [{ id: id(), type: "spacer", size: "m" }];
    }
    if (dataBlock === "highlight") {
      return [{ id: id(), type: "highlight", content }];
    }
    if (dataBlock === "caption") {
      return [{ id: id(), type: "caption", content }];
    }
    return [{ id: id(), type: "paragraph", content }];
  }

  // Fallback: treat as paragraph
  const content = parseInlineNodes(el);
  if (content.length > 0) {
    return [{ id: id(), type: "paragraph", content }];
  }
  return [];
}

export function htmlToBlocks(html: string): JournalContent {
  if (!html.trim()) return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const blocks: JournalContent = [];

  for (const child of Array.from(doc.body.childNodes)) {
    if (child.nodeType === 1 /* ELEMENT_NODE */) {
      blocks.push(...parseBlockElement(child as Element));
    } else if (child.nodeType === 3 /* TEXT_NODE */) {
      const text = child.textContent?.trim();
      if (text) {
        blocks.push({ id: id(), type: "paragraph", content: [{ text }] });
      }
    }
  }

  return blocks;
}
