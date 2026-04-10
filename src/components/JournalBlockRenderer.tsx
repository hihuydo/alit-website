import type { JournalContent, JournalTextNode } from "@/lib/journal-types";

/** Defense-in-depth: reject unsafe URL schemes on the render path. */
function safeSrc(url: string): string {
  const lower = url.trim().toLowerCase();
  if (
    lower.startsWith("/") ||
    lower.startsWith("http://") ||
    lower.startsWith("https://")
  ) {
    return url;
  }
  return ""; // strip unsafe src
}

function safeHref(url: string): string {
  const lower = url.trim().toLowerCase();
  if (
    lower.startsWith("/") ||
    lower.startsWith("#") ||
    lower.startsWith("mailto:") ||
    lower.startsWith("http://") ||
    lower.startsWith("https://")
  ) {
    return url;
  }
  return "#"; // neutralize unsafe href
}

function renderTextNodes(nodes: JournalTextNode[]) {
  return nodes.map((node, i) => {
    if (!node.marks || node.marks.length === 0) {
      return <span key={i}>{node.text}</span>;
    }
    // Nest marks inside-out so all marks are applied (e.g. bold+link wraps correctly)
    let el: React.ReactNode = <>{node.text}</>;
    for (let m = node.marks.length - 1; m >= 0; m--) {
      const mark = node.marks[m];
      switch (mark.type) {
        case "bold": el = <strong>{el}</strong>; break;
        case "italic": el = <em>{el}</em>; break;
        case "highlight": el = <span className="font-semibold">{el}</span>; break;
        case "link": el = <a href={safeHref(mark.href)} {...(mark.external ? { target: "_blank", rel: "noopener noreferrer" } : {})} className="underline">{el}</a>; break;
      }
    }
    return <span key={i}>{el}</span>;
  });
}

export function JournalBlockRenderer({ content }: { content: JournalContent }) {
  return (
    <>
      {content.map((block) => {
        switch (block.type) {
          case "paragraph":
            return <p key={block.id}>{renderTextNodes(block.content)}</p>;
          case "quote":
            return (
              <blockquote key={block.id} className="border-l-2 border-white pl-3 italic">
                <p>{renderTextNodes(block.content)}</p>
                {block.attribution && (
                  <footer className="text-meta mt-1 not-italic">{block.attribution}</footer>
                )}
              </blockquote>
            );
          case "heading":
            return block.level === 2 ? (
              <h2 key={block.id} className="font-bold mt-4 mb-1">{renderTextNodes(block.content)}</h2>
            ) : (
              <h3 key={block.id} className="font-bold mt-3 mb-1">{renderTextNodes(block.content)}</h3>
            );
          case "highlight":
            return (
              <p key={block.id} className="font-semibold">
                {renderTextNodes(block.content)}
              </p>
            );
          case "image":
            return (
              <figure key={block.id} className="my-[13px]">
                <img
                  src={safeSrc(block.src)}
                  alt={block.alt ?? ""}
                  loading="lazy"
                  className={block.width === "half" ? "w-1/2" : "w-full"}
                />
                {block.caption && (
                  <figcaption className="text-meta mt-1">{block.caption}</figcaption>
                )}
              </figure>
            );
          case "spacer":
            return (
              <div
                key={block.id}
                style={{
                  height: block.size === "l" ? "52px" : block.size === "s" ? "13px" : "26px",
                }}
              />
            );
          default:
            return null;
        }
      })}
    </>
  );
}
