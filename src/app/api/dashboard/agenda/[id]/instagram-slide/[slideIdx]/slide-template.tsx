import type { Slide, Scale } from "@/lib/instagram-post";
import { FONT_FAMILY } from "@/lib/instagram-fonts";

const BG = "#ff5048";
const FG = "#000000";

const BODY_SIZES: Record<Scale, number> = { s: 28, m: 34, l: 42 };
const HEADING_FACTOR = 1.25;
const META_GAP = 8;
const META_BLOCK_GAP = 40;
const TITLE_TO_LEAD_GAP = 18;
const LEAD_TO_BODY_GAP = 100;
const TITLE_TO_BODY_GAP = 64;
const NO_SHRINK = { flexShrink: 0 as const };

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

// V5: full single-column layout. Satori/Yoga had layout problems with:
// - React fragments wrapping siblings (3 divs in `<>` got laid out as row-
//   flex-items instead of inheriting the outer column direction)
// - `justify-content: space-between` on text spans (meta row "19.30" and
//   "Photobastei" concatenated without gap)
// - Inconsistent behavior between row-flex siblings (meta-row broken,
//   footer-row working with identical structure)
// Solution: everything is a direct child of the outer column. Every child
// carries `width: "100%"` + `flex-direction: column` explicitly. Long text
// wraps via `whiteSpace: "normal"` + `wordBreak: "break-word"`. Meta is
// two stacked lines (date/time above, location below); footer is two
// stacked lines (alit.ch above, counter below). No `<>` fragments.
export function SlideTemplate({
  slide,
  totalSlides,
  scale,
}: {
  slide: Slide;
  totalSlides: number;
  scale: Scale;
}) {
  const { meta, blocks } = slide;
  const bodySize = BODY_SIZES[scale];
  const primaryMeta = [meta.datum, meta.zeit].filter(Boolean).join(" · ");
  const continuationMeta =
    totalSlides > 1 && primaryMeta.length > 0
      ? primaryMeta
      : truncate(meta.title, 48);

  const textBase = {
    display: "flex",
    flexDirection: "column" as const,
    width: "100%",
    whiteSpace: "normal" as const,
    wordBreak: "break-word" as const,
  };

  return (
    <div
      style={{
        width: "1080px",
        height: "1350px",
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        backgroundColor: BG,
        color: FG,
        fontFamily: FONT_FAMILY,
        padding: "80px",
      }}
    >
      {slide.isFirst && (
        <div
          style={{
            ...textBase,
            ...NO_SHRINK,
            fontSize: 26,
            fontWeight: 400,
            lineHeight: 1.3,
            marginBottom: META_GAP,
          }}
        >
          {primaryMeta}
        </div>
      )}
      {slide.isFirst && meta.ort ? (
        <div
          style={{
            ...textBase,
            ...NO_SHRINK,
            fontSize: 26,
            fontWeight: 400,
            lineHeight: 1.3,
            marginBottom: META_BLOCK_GAP,
          }}
        >
          {meta.ort}
        </div>
      ) : null}
      {slide.isFirst && (
        <div
          style={{
            ...textBase,
            ...NO_SHRINK,
            marginBottom: meta.lead ? LEAD_TO_BODY_GAP : TITLE_TO_BODY_GAP,
          }}
        >
          <div
            style={{
              ...textBase,
              ...NO_SHRINK,
              fontSize: 76,
              fontWeight: 800,
              lineHeight: 1.04,
              paddingBottom: meta.lead ? TITLE_TO_LEAD_GAP : 0,
            }}
          >
            {meta.title}
          </div>
          {meta.lead ? (
            <div
              style={{
                ...textBase,
                ...NO_SHRINK,
                fontSize: 32,
                fontWeight: 400,
                lineHeight: 1.3,
              }}
            >
              {meta.lead}
            </div>
          ) : null}
        </div>
      )}
      {!slide.isFirst && (
        <div
          style={{
            ...textBase,
            ...NO_SHRINK,
            fontSize: 26,
            fontWeight: 400,
            lineHeight: 1.3,
            marginBottom: META_BLOCK_GAP,
          }}
        >
          {continuationMeta}
        </div>
      )}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          minHeight: 0,
          width: "100%",
        }}
      >
        {blocks.map((b, i) => {
          // "Meta-lines" in the body (e.g. "Termin: …", "Ort: …", "Eintritt: …")
          // should sit tight together — they describe the same event, not
          // separate paragraphs. Heuristic: short paragraph that starts with
          // `Word:` (language-agnostic via `\p{L}` Unicode letter class).
          // Regular description paragraphs keep a full paragraph-gap.
          const isMetaLine =
            !b.isHeading &&
            b.text.length < 200 &&
            /^\s*\p{L}+\s*:/u.test(b.text);
          return (
            <div
              key={i}
              style={{
                ...textBase,
                fontWeight: b.weight,
                fontSize: b.isHeading
                  ? Math.round(bodySize * HEADING_FACTOR)
                  : bodySize,
                marginBottom: b.isHeading ? 16 : isMetaLine ? 6 : 22,
                lineHeight: b.isHeading ? 1.15 : 1.3,
              }}
            >
              {b.text}
            </div>
          );
        })}
      </div>

      {meta.hashtags.length > 0 ? (
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            flexWrap: "wrap",
            ...NO_SHRINK,
            width: "100%",
            fontSize: 22,
            fontWeight: 400,
            marginTop: 24,
          }}
        >
          {meta.hashtags.map((t) => (
            <div key={t} style={{ display: "flex", marginRight: 20 }}>
              #{t}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
