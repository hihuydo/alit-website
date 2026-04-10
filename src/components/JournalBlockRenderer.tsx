import type { JournalContent, JournalTextNode, JournalInlineMark } from "@/app/dashboard/components/journal-editor-types";

function renderMark(text: string, mark: JournalInlineMark, key: string) {
  switch (mark.type) {
    case "bold":
      return <strong key={key}>{text}</strong>;
    case "italic":
      return <em key={key}>{text}</em>;
    case "highlight":
      return <span key={key} className="font-semibold">{text}</span>;
    case "link":
      return (
        <a
          key={key}
          href={mark.href}
          {...(mark.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          className="underline"
        >
          {text}
        </a>
      );
  }
}

function renderTextNodes(nodes: JournalTextNode[]) {
  return nodes.map((node, i) => {
    if (!node.marks || node.marks.length === 0) {
      return <span key={i}>{node.text}</span>;
    }
    let el: React.ReactNode = node.text;
    for (const mark of node.marks) {
      el = renderMark(typeof el === "string" ? el : "", mark, `${i}-${mark.type}`);
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
                  src={block.src}
                  alt={block.alt ?? ""}
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
