import type { JournalContent } from "./journal-editor-types";
import type { JournalMeta } from "./journal-editor-utils";
import { JournalBlockRenderer } from "@/components/JournalBlockRenderer";

interface JournalPreviewProps {
  meta: JournalMeta;
  blocks: JournalContent;
}

export function JournalPreview({ meta, blocks }: JournalPreviewProps) {
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
      {meta.date && (
        <div
          className="text-right"
          style={{
            padding: "var(--spacing-half) var(--spacing-base) 0",
            fontSize: "var(--text-journal-meta)",
            lineHeight: "16px",
            color: "rgba(255,255,255,0.5)",
          }}
        >
          {meta.date}
        </div>
      )}

      {/* Content area */}
      <div
        style={{
          padding: "0 var(--spacing-half) var(--spacing-half)",
          fontSize: "var(--text-journal)",
          lineHeight: "26px",
        }}
      >
        {/* Title */}
        {meta.title && (
          <p
            className={`pt-[14.667px] font-normal ${
              meta.title_border
                ? "border-b-3 border-black pb-[13px] mb-[13px]!"
                : ""
            }`}
          >
            <strong
              className="font-normal"
              style={{ fontSize: "var(--text-journal)" }}
            >
              {meta.title}
            </strong>
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
      </div>

      {/* Footer */}
      {(meta.footer || meta.date) && (
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
