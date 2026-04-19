import type { Slide, Scale } from "@/lib/instagram-post";
import { FONT_FAMILY } from "@/lib/instagram-fonts";

const BG = "#ff5048";
const FG = "#ffffff";

const BODY_SIZES: Record<Scale, number> = { s: 28, m: 34, l: 42 };
const HEADING_FACTOR = 1.25;

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

// Satori layout rules enforced here:
// 1. All visible elements use `display: flex` (required for non-text nodes
//    with children, required for text blocks to participate in flex layout).
// 2. Text-bearing divs MUST carry `flexWrap: "wrap"` so multi-word content
//    breaks at word boundaries instead of overflowing the canvas edge.
// 3. Every text-bearing div MUST set `width: "100%"` explicitly — without it
//    Satori shrink-fits the div to content width, which breaks
//    `justify-content: space-between` on the parent flex row.
// 4. No `<span>` elements — Satori's inline handling of spans gave
//    adjacent siblings zero visual gap in a `justify-content: space-between`
//    parent (observed in v1 smoke: "14:15 UhrLiteraturmuseum" concatenated).
// 5. `alignItems: "baseline"` on flex rows removed — caused cross-browser-
//    parity quirks in Satori rendering.
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

  return (
    <div
      style={{
        width: "1080px",
        height: "1350px",
        display: "flex",
        flexDirection: "column",
        backgroundColor: BG,
        color: FG,
        fontFamily: FONT_FAMILY,
        padding: "80px",
      }}
    >
      {slide.isFirst ? (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              width: "100%",
              fontSize: 26,
              fontWeight: 400,
              marginBottom: 40,
            }}
          >
            <div style={{ display: "flex" }}>
              {meta.datum} · {meta.zeit}
            </div>
            <div style={{ display: "flex" }}>{truncate(meta.ort, 30)}</div>
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              width: "100%",
              fontSize: 76,
              fontWeight: 800,
              lineHeight: 1.08,
              letterSpacing: "-0.02em",
              marginBottom: meta.lead ? 24 : 40,
            }}
          >
            {meta.title}
          </div>
          {meta.lead ? (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                width: "100%",
                fontSize: 32,
                fontWeight: 400,
                lineHeight: 1.3,
                marginBottom: 40,
                opacity: 0.95,
              }}
            >
              {meta.lead}
            </div>
          ) : null}
        </>
      ) : (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            width: "100%",
            fontSize: 26,
            fontWeight: 400,
            marginBottom: 40,
            opacity: 0.88,
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
              display: "flex",
              flexWrap: "wrap",
              width: "100%",
              fontWeight: b.weight,
              fontSize: b.isHeading
                ? Math.round(bodySize * HEADING_FACTOR)
                : bodySize,
              marginBottom: b.isHeading ? 14 : 20,
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
            flexWrap: "wrap",
            width: "100%",
            fontSize: 22,
            fontWeight: 400,
            marginTop: 24,
            marginBottom: 20,
            opacity: 0.95,
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
          display: "flex",
          justifyContent: "space-between",
          width: "100%",
          fontSize: 20,
          fontWeight: 300,
          opacity: 0.85,
          letterSpacing: "0.02em",
        }}
      >
        <div style={{ display: "flex" }}>alit.ch</div>
        <div style={{ display: "flex" }}>
          {slide.index + 1} / {totalSlides}
        </div>
      </div>
    </div>
  );
}
