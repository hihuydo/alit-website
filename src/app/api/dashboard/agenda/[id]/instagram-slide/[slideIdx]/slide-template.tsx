import type { Slide, Scale } from "@/lib/instagram-post";
import { FONT_FAMILY } from "@/lib/instagram-fonts";

const BG = "#ff5048";
const FG = "#000000";

const BODY_SIZES: Record<Scale, number> = { s: 28, m: 34, l: 42 };
const HEADING_FACTOR = 1.25;

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

// Satori text-layout notes (distilled from iterating on a real agenda item):
// 1. Text wraps naturally inside a flex container IF the container is
//    flex-direction: column. Text inside a row-direction flex is treated
//    as inline flex-items that don't word-wrap.
// 2. `flexWrap: "wrap"` is for flex-ITEMS, NOT text. Adding it to a text
//    div makes Satori treat each word as a separate flex-item → they pile
//    up in a narrow column (observed: title "Agenda" rendering as
//    "A"/"g"/"e" stacked vertically on the right edge).
// 3. Every flex container that holds text needs an explicit axis-locking
//    width — "100%" works when parent is a flex-column (stretch is default
//    on cross-axis) but may silently drop when parent is flex-row.
// 4. `<span>` siblings in `justify-content: space-between` concatenate
//    without gap — always use `<div>` siblings for space-between layout.
// 5. Outer container needs `width: "1080px", height: "1350px"` explicit
//    (not "100%") so Satori has a concrete layout root.
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
              flexDirection: "row",
              justifyContent: "space-between",
              fontSize: 26,
              fontWeight: 400,
              marginBottom: 48,
            }}
          >
            <div style={{ display: "flex", minWidth: 0 }}>
              {meta.datum} · {meta.zeit}
            </div>
            <div style={{ display: "flex", minWidth: 0 }}>
              {truncate(meta.ort, 30)}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 76,
              fontWeight: 800,
              lineHeight: 1.08,
              marginBottom: meta.lead ? 28 : 48,
              whiteSpace: "normal",
              wordBreak: "break-word",
            }}
          >
            {meta.title}
          </div>
          {meta.lead ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                fontSize: 32,
                fontWeight: 400,
                lineHeight: 1.3,
                marginBottom: 48,
                whiteSpace: "normal",
                wordBreak: "break-word",
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
            flexDirection: "column",
            fontSize: 26,
            fontWeight: 400,
            marginBottom: 48,
            whiteSpace: "normal",
            wordBreak: "break-word",
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
        }}
      >
        {blocks.map((b, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              flexDirection: "column",
              fontWeight: b.weight,
              fontSize: b.isHeading
                ? Math.round(bodySize * HEADING_FACTOR)
                : bodySize,
              marginBottom: b.isHeading ? 16 : 22,
              lineHeight: b.isHeading ? 1.15 : 1.3,
              whiteSpace: "normal",
              wordBreak: "break-word",
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
            fontSize: 22,
            fontWeight: 400,
            marginTop: 24,
            marginBottom: 24,
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
          flexDirection: "row",
          justifyContent: "space-between",
          fontSize: 20,
          fontWeight: 300,
          opacity: 0.85,
        }}
      >
        <div style={{ display: "flex", minWidth: 0 }}>alit.ch</div>
        <div style={{ display: "flex", minWidth: 0 }}>
          {slide.index + 1} / {totalSlides}
        </div>
      </div>
    </div>
  );
}
