import type { Slide, Scale } from "@/lib/instagram-post";
import { FONT_FAMILY } from "@/lib/instagram-fonts";

const BG = "#ff5048";
const FG = "#ffffff";

const BODY_SIZES: Record<Scale, number> = { s: 28, m: 34, l: 42 };
const HEADING_FACTOR = 1.25;
const LINE_HEIGHT = 1.3;

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

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
        padding: "80px 80px 60px 80px",
      }}
    >
      {slide.isFirst ? (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              fontSize: 28,
              fontWeight: 400,
              marginBottom: 40,
              letterSpacing: "-0.01em",
            }}
          >
            <span>
              {meta.datum} · {meta.zeit}
            </span>
            <span style={{ maxWidth: 450, overflow: "hidden" }}>
              {truncate(meta.ort, 30)}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 84,
              fontWeight: 800,
              lineHeight: 1.05,
              marginBottom: meta.lead ? 20 : 40,
              letterSpacing: "-0.02em",
            }}
          >
            {meta.title}
          </div>
          {meta.lead ? (
            <div
              style={{
                display: "flex",
                fontSize: 36,
                fontWeight: 400,
                lineHeight: 1.2,
                marginBottom: 40,
                opacity: 0.92,
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
            fontSize: 26,
            fontWeight: 400,
            marginBottom: 40,
            opacity: 0.88,
          }}
        >
          <span>
            {meta.datum} · {truncate(meta.title, 48)}
          </span>
        </div>
      )}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          fontSize: bodySize,
          lineHeight: LINE_HEIGHT,
        }}
      >
        {blocks.map((b, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              fontWeight: b.weight,
              fontSize: b.isHeading ? Math.round(bodySize * HEADING_FACTOR) : bodySize,
              marginBottom: b.isHeading ? 14 : 20,
              lineHeight: b.isHeading ? 1.15 : LINE_HEIGHT,
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
            fontSize: 24,
            fontWeight: 400,
            marginTop: 30,
            marginBottom: 30,
            opacity: 0.95,
          }}
        >
          {meta.hashtags.map((t) => (
            <span key={t} style={{ marginRight: 20 }}>
              #{t}
            </span>
          ))}
        </div>
      ) : null}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 22,
          fontWeight: 300,
          opacity: 0.85,
          letterSpacing: "0.02em",
        }}
      >
        <span>alit.ch</span>
        <span>
          {slide.index + 1} / {totalSlides}
        </span>
      </div>
    </div>
  );
}
