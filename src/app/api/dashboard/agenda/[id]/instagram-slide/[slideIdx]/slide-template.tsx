import type { Slide, Scale } from "@/lib/instagram-post";
import { FONT_FAMILY } from "@/lib/instagram-fonts";

const BG = "#ff5048";
const FG = "#000000";

const BODY_SIZES: Record<Scale, number> = { s: 28, m: 34, l: 42 };
const HEADING_FACTOR = 1.25;

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
            fontSize: 26,
            fontWeight: 400,
            lineHeight: 1.3,
            marginBottom: 8,
          }}
        >
          {meta.datum} · {meta.zeit}
        </div>
      )}
      {slide.isFirst && (
        <div
          style={{
            ...textBase,
            fontSize: 26,
            fontWeight: 400,
            lineHeight: 1.3,
            marginBottom: 40,
          }}
        >
          {meta.ort}
        </div>
      )}
      {slide.isFirst && (
        <div
          style={{
            ...textBase,
            fontSize: 76,
            fontWeight: 800,
            lineHeight: 1.08,
            marginBottom: meta.lead ? 24 : 40,
          }}
        >
          {meta.title}
        </div>
      )}
      {slide.isFirst && meta.lead ? (
        <div
          style={{
            ...textBase,
            fontSize: 32,
            fontWeight: 400,
            lineHeight: 1.3,
            marginBottom: 40,
          }}
        >
          {meta.lead}
        </div>
      ) : null}
      {!slide.isFirst && (
        <div
          style={{
            ...textBase,
            fontSize: 26,
            fontWeight: 400,
            lineHeight: 1.3,
            marginBottom: 40,
          }}
        >
          {meta.datum} · {truncate(meta.title, 48)}
        </div>
      )}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          width: "100%",
        }}
      >
        {blocks.map((b, i) => (
          <div
            key={i}
            style={{
              ...textBase,
              fontWeight: b.weight,
              fontSize: b.isHeading
                ? Math.round(bodySize * HEADING_FACTOR)
                : bodySize,
              marginBottom: b.isHeading ? 16 : 22,
              lineHeight: b.isHeading ? 1.15 : 1.3,
            }}
          >
            {b.text}
          </div>
        ))}
      </div>

      {slide.isLast && meta.hashtags.length > 0 ? (
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            flexWrap: "wrap",
            width: "100%",
            fontSize: 22,
            fontWeight: 400,
            marginTop: 24,
            marginBottom: 20,
          }}
        >
          {meta.hashtags.map((t) => (
            <div key={t} style={{ display: "flex", marginRight: 20 }}>
              #{t}
            </div>
          ))}
        </div>
      ) : null}

      <div
        style={{
          ...textBase,
          fontSize: 20,
          fontWeight: 300,
          lineHeight: 1.4,
          opacity: 0.85,
        }}
      >
        alit.ch · Slide {slide.index + 1} / {totalSlides}
      </div>
    </div>
  );
}
