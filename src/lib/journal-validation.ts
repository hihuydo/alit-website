import {
  ALLOWED_BLOCK_TYPES,
  ALLOWED_MARK_TYPES,
  ALLOWED_HEADING_LEVELS,
  ALLOWED_SPACER_SIZES,
  ALLOWED_IMAGE_WIDTHS,
} from "./journal-types";

/**
 * Validate that a URL is safe for rendering in href/src attributes.
 * Deny-by-default: only allow known-safe schemes and relative paths.
 */
function isSafeUrl(url: unknown): boolean {
  if (typeof url !== "string" || !url.trim()) return false;
  const trimmed = url.trim().toLowerCase();
  return (
    trimmed.startsWith("/") ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("mailto:") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://")
  );
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function validateMark(mark: unknown): string | null {
  if (!isObject(mark)) return "mark is not an object";
  if (typeof mark.type !== "string") return "mark.type missing";
  if (!ALLOWED_MARK_TYPES.has(mark.type)) return `invalid mark type: ${mark.type}`;
  if (mark.type === "link") {
    if (!isSafeUrl(mark.href)) return `unsafe or missing link href: ${String(mark.href)}`;
  }
  return null;
}

function validateTextNode(node: unknown): string | null {
  if (!isObject(node)) return "text node is not an object";
  if (typeof node.text !== "string") return "text node missing text";
  if (node.text.length > 10000) return "text node too long";
  if (node.marks !== undefined) {
    if (!Array.isArray(node.marks)) return "marks is not an array";
    for (const mark of node.marks) {
      const err = validateMark(mark);
      if (err) return err;
    }
  }
  return null;
}

function validateTextContent(content: unknown): string | null {
  if (!Array.isArray(content)) return "content is not an array";
  for (const node of content) {
    const err = validateTextNode(node);
    if (err) return err;
  }
  return null;
}

function validateBlock(block: unknown): string | null {
  if (!isObject(block)) return "block is not an object";
  if (typeof block.id !== "string") return "block.id missing";
  if (typeof block.type !== "string") return "block.type missing";
  if (!ALLOWED_BLOCK_TYPES.has(block.type)) return `invalid block type: ${block.type}`;

  switch (block.type) {
    case "paragraph":
    case "highlight": {
      const err = validateTextContent(block.content);
      if (err) return `${block.type}: ${err}`;
      break;
    }
    case "quote": {
      const err = validateTextContent(block.content);
      if (err) return `quote: ${err}`;
      if (block.attribution !== undefined && typeof block.attribution !== "string")
        return "quote.attribution must be string";
      break;
    }
    case "heading": {
      if (!ALLOWED_HEADING_LEVELS.has(block.level as number))
        return `invalid heading level: ${String(block.level)}`;
      const err = validateTextContent(block.content);
      if (err) return `heading: ${err}`;
      break;
    }
    case "image": {
      if (!isSafeUrl(block.src))
        return `unsafe or missing image src: ${String(block.src)}`;
      if (block.alt !== undefined && typeof block.alt !== "string")
        return "image.alt must be string";
      if (block.caption !== undefined && typeof block.caption !== "string")
        return "image.caption must be string";
      if (block.width !== undefined && !ALLOWED_IMAGE_WIDTHS.has(block.width as string))
        return `invalid image width: ${String(block.width)}`;
      break;
    }
    case "video": {
      if (!isSafeUrl(block.src))
        return `unsafe or missing video src: ${String(block.src)}`;
      if (typeof block.mime_type !== "string")
        return "video.mime_type must be string";
      if (block.caption !== undefined && typeof block.caption !== "string")
        return "video.caption must be string";
      break;
    }
    case "embed": {
      if (typeof block.url !== "string" || !block.url.trim())
        return "embed.url missing";
      // Only allow known embed hosts with https protocol
      try {
        const u = new URL(block.url as string);
        if (u.protocol !== "https:")
          return `embed must use https, got: ${u.protocol}`;
        const allowed = ["www.youtube.com", "player.vimeo.com"];
        if (!allowed.includes(u.hostname))
          return `embed host not allowed: ${u.hostname}`;
      } catch {
        return `invalid embed url: ${String(block.url)}`;
      }
      if (block.caption !== undefined && typeof block.caption !== "string")
        return "embed.caption must be string";
      break;
    }
    case "spacer": {
      if (block.size !== undefined && !ALLOWED_SPACER_SIZES.has(block.size as string))
        return `invalid spacer size: ${String(block.size)}`;
      break;
    }
  }

  return null;
}

/**
 * Validate an entire content array server-side.
 * Returns null if valid, or an error message string.
 */
export function validateContent(content: unknown): string | null {
  if (!Array.isArray(content)) return "content must be an array";
  if (content.length > 500) return "too many blocks";
  for (let i = 0; i < content.length; i++) {
    const err = validateBlock(content[i]);
    if (err) return `block[${i}]: ${err}`;
  }
  return null;
}
