import type { JournalContent } from "./journal-editor-types";
import type { JournalMeta } from "./journal-editor-utils";
import { JournalBlockRenderer } from "@/components/JournalBlockRenderer";

interface JournalPreviewProps {
  meta: JournalMeta;
  blocks: JournalContent;
  hashtags?: { tag: string; projekt_slug: string }[];
}

export function JournalPreview({ meta, blocks, hashtags = [] }: JournalPreviewProps) {
  const hasContent = blocks.some(
    (b) =>
      b.type !== "spacer" &&
      (b.type === "image"
        ? b.src
        : "content" in b && b.content.some((n) => n.text))
  );

  return (
    <div
      className="bg-black text-white overflow-y-auto rounded"
      style={{
        fontFamily: "var(--font-mono)",
        maxHeight: "calc(100vh - 200px)",
      }}
    >
      {/* Date */}
      {meta.datum && (
        <div
          className="text-right"
          style={{
            padding: "var(--spacing-half) var(--spacing-base) 0",
            fontSize: "var(--text-journal-meta)",
            lineHeight: "16px",
            color: "rgba(255,255,255,0.5)",
          }}
        >
          {meta.datum}
        </div>
      )}

      {/* Content area */}
      <div
        className="journal-entry-body"
        style={{
          padding: `${meta.title ? "0" : "var(--spacing-base)"} var(--spacing-base) var(--spacing-base)`,
          fontSize: "var(--text-journal)",
          lineHeight: "26px",
        }}
      >
        {/* Title */}
        {meta.title && (
          <p
            className="pt-[14.667px] font-bold"
            style={{
              fontSize: "var(--text-journal)",
              marginBottom: meta.author ? undefined : "var(--spacing-base)",
            }}
          >
            {meta.title}
          </p>
        )}
        {/* Author */}
        {meta.author && (
          <p
            className="font-normal"
            style={{ fontSize: "var(--text-journal)", lineHeight: "26px", marginBottom: "var(--spacing-base)" }}
          >
            von <span className="italic">{meta.author}</span>
          </p>
        )}

        {/* Blocks */}
        {hasContent ? (
          <JournalBlockRenderer content={blocks} />
        ) : (
          <p
            className="italic"
            style={{ color: "rgba(255,255,255,0.3)", paddingTop: "14.667px" }}
          >
            Noch kein Inhalt...
          </p>
        )}

        {/* Hashtags */}
        {hashtags.length > 0 && (
          <div
            className="flex flex-wrap gap-x-3 gap-y-1 pt-[14.667px]"
            style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-journal-meta)" }}
          >
            {hashtags.map((h) => (
              <span key={h.tag} className="underline decoration-dotted">
                #{h.tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {(meta.footer || meta.datum) && (
        <div
          className="border-t-3 border-[rgba(255,255,255,0.15)]"
          style={{
            height: "56px",
            padding: meta.footer ? "13px" : undefined,
          }}
        >
          {meta.footer && (
            <p style={{ fontSize: "var(--text-journal)", lineHeight: "26px" }}>
              {meta.footer}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
