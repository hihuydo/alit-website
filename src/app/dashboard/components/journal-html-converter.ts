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

// Block-ID Stabilität (S0 prerequisite for Layout-Overrides):
// blocksToHtml emits data-bid on every block-tag; htmlToBlocks reads it back.
// Format check is strict so a malformed paste-in cannot poison override keys —
// invalid IDs fall back to a fresh `id()`. Bestand without data-bid (legacy
// content) gets a fresh ID on next save and stabilises from there.
const BID_FORMAT = /^b[0-9a-z]+-[0-9a-z]+$/;

function bidAttr(blockId: string | undefined): string {
  return blockId ? ` data-bid="${escapeAttr(blockId)}"` : "";
}

function readBidOrGenerate(el: Element): string {
  const bid = el.getAttribute("data-bid");
  if (bid && BID_FORMAT.test(bid)) return bid;
  return id();
}

function parseSpacerSize(raw: string | null): "s" | "m" | "l" {
  return raw === "s" || raw === "l" ? raw : "m";
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
            const dl = mark.download ? ' download=""' : "";
            html = `<a href="${escapeAttr(mark.href)}"${ext}${dl}>${html}</a>`;
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
      const bid = bidAttr(block.id);
      switch (block.type) {
        case "paragraph":
          return `<p${bid}>${textNodesToHtml(block.content)}</p>`;
        case "heading":
          return `<h${block.level}${bid}>${textNodesToHtml(block.content)}</h${block.level}>`;
        case "quote": {
          const attrAttr = block.attribution
            ? ` data-attribution="${escapeAttr(block.attribution)}"`
            : "";
          return `<blockquote${bid}${attrAttr}><p>${textNodesToHtml(block.content)}</p></blockquote>`;
        }
        case "highlight":
          return `<p${bid} data-block="highlight">${textNodesToHtml(block.content)}</p>`;
        case "caption":
          return `<p${bid} data-block="caption">${textNodesToHtml(block.content)}</p>`;
        case "image": {
          const widthAttr = block.width ? ` data-width="${escapeAttr(block.width)}"` : "";
          return `<figure${bid}${widthAttr}><img src="${escapeAttr(block.src)}" alt="${escapeAttr(block.alt ?? "")}" />${
            block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : ""
          }</figure>`;
        }
        case "video":
          return `<figure${bid} data-media="video"><video controls src="${escapeAttr(block.src)}" data-mime="${escapeAttr(block.mime_type)}">${
            block.mime_type ? `<source src="${escapeAttr(block.src)}" type="${escapeAttr(block.mime_type)}" />` : ""
          }</video>${
            block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : ""
          }</figure>`;
        case "embed":
          return `<figure${bid} data-media="embed"><iframe src="${escapeAttr(block.url)}" frameborder="0" allowfullscreen></iframe>${
            block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : ""
          }</figure>`;
        case "spacer": {
          const size = block.size ?? "m";
          return `<p${bid} data-block="spacer" data-size="${escapeAttr(size)}"><br></p>`;
        }
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
        const download = elem.hasAttribute("download");
        mark = download
          ? { type: "link", href, external, download: true }
          : { type: "link", href, external };
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
    return [{ id: readBidOrGenerate(el), type: "heading", level: level as 2 | 3, content: parseInlineNodes(el) }];
  }

  if (tag === "blockquote") {
    // Flatten blockquote children into one quote block
    const content: JournalTextNode[] = [];
    for (const child of Array.from(el.children)) {
      content.push(...parseInlineNodes(child));
    }
    if (content.length === 0) content.push(...parseInlineNodes(el));
    const attribution = el.getAttribute("data-attribution") || undefined;
    return [{ id: readBidOrGenerate(el), type: "quote", content, attribution }];
  }

  if (tag === "figure") {
    const mediaType = el.getAttribute("data-media");
    const caption = el.querySelector("figcaption")?.textContent ?? undefined;

    if (mediaType === "video") {
      const video = el.querySelector("video");
      const source = el.querySelector("source");
      const src = video?.getAttribute("src") ?? source?.getAttribute("src") ?? "";
      const mime_type = video?.getAttribute("data-mime") ?? source?.getAttribute("type") ?? "video/mp4";
      return [{ id: readBidOrGenerate(el), type: "video", src, mime_type, caption }];
    }

    if (mediaType === "embed") {
      const iframe = el.querySelector("iframe");
      const url = iframe?.getAttribute("src") ?? "";
      return [{ id: readBidOrGenerate(el), type: "embed", url, caption }];
    }

    const img = el.querySelector("img");
    if (img) {
      const rawWidth = el.getAttribute("data-width");
      const width = rawWidth === "full" || rawWidth === "half" ? rawWidth : undefined;
      return [{
        id: readBidOrGenerate(el),
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
    // Preserve block type via data attribute
    const dataBlock = el.getAttribute("data-block");
    const spacerSize = parseSpacerSize(el.getAttribute("data-size"));
    // Skip empty paragraphs
    if (content.length === 0 || (content.length === 1 && !content[0].text.trim())) {
      return [{ id: readBidOrGenerate(el), type: "spacer", size: spacerSize }];
    }
    if (dataBlock === "spacer") {
      return [{ id: readBidOrGenerate(el), type: "spacer", size: spacerSize }];
    }
    if (dataBlock === "highlight") {
      return [{ id: readBidOrGenerate(el), type: "highlight", content }];
    }
    if (dataBlock === "caption") {
      return [{ id: readBidOrGenerate(el), type: "caption", content }];
    }
    return [{ id: readBidOrGenerate(el), type: "paragraph", content }];
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
