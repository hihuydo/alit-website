import type { Slide } from "@/lib/instagram-post";
import { FONT_FAMILY } from "@/lib/instagram-fonts";

const BG = "#ff5048";
const FG = "#000000";

// Fixed font sizes (no admin-side scale picker — see PR #128). All sizes in
// px on the 1080×1350 canvas.
const BODY_SIZE = 40;
const TITLE_SIZE = 74;
const LEAD_SIZE = 40;
const META_SIZE = 26; // datum / zeit / ort header on every slide
const HASHTAG_SIZE = 26;

// Vertical gaps.
const HEADER_TO_HASHTAGS_GAP = 32;
const HEADER_TO_BODY_GAP = 60; // header → body content (slides 2..N) or → image
const HASHTAGS_TO_TITLE_GAP = 60;
const TITLE_TO_LEAD_GAP = 18;
const TITLE_TO_BODY_GAP = 64;
const LEAD_TO_BODY_GAP = 100;

const NO_SHRINK = { flexShrink: 0 as const };

/** Canvas inner box after the outer 80px padding. */
const INNER_WIDTH = 1080 - 160;

// ─── Icons (mirror src/components/AgendaItem.tsx). 28px size to read alongside
// the 26px meta text. Stroke #000 to match the rest of the slide colorway.
const ICON_SIZE = 28;
const iconStroke = {
  fill: "none" as const,
  stroke: "#000",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const CalendarIcon = () => (
  <svg
    width={ICON_SIZE}
    height={ICON_SIZE}
    viewBox="0 0 24 24"
    style={{ marginRight: 10 }}
    {...iconStroke}
  >
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
  </svg>
);

const ClockIcon = () => (
  <svg
    width={ICON_SIZE}
    height={ICON_SIZE}
    viewBox="0 0 24 24"
    style={{ marginRight: 10 }}
    {...iconStroke}
  >
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const GlobeIcon = () => (
  <svg
    width={ICON_SIZE}
    height={ICON_SIZE}
    viewBox="0 0 24 24"
    style={{ marginRight: 10 }}
    {...iconStroke}
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

/**
 * Compute an image's rendered box that fits inside `maxWidth × maxHeight`
 * while preserving its aspect ratio (contain). Fallback to a square sub-box
 * (75% of the smaller dimension) when the aspect is unknown — better than
 * Satori's default of stretching to the parent.
 */
function fitImage(
  aspect: number | undefined,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  if (!aspect || !Number.isFinite(aspect) || aspect <= 0) {
    const side = Math.floor(Math.min(maxWidth, maxHeight) * 0.75);
    return { width: side, height: side };
  }
  const byWidth = { width: maxWidth, height: maxWidth / aspect };
  if (byWidth.height <= maxHeight) {
    return { width: Math.floor(byWidth.width), height: Math.floor(byWidth.height) };
  }
  return { width: Math.floor(maxHeight * aspect), height: Math.floor(maxHeight) };
}

/**
 * Top header — present on every slide. Date+time on the left, ort on the
 * right, each with its calendar/clock/globe icon (mirrors the website's
 * AgendaItem meta row). Items are inline `<span>` to coexist with icon SVGs
 * inside a flex-row (Satori needs explicit `display: flex` on every container,
 * so we keep this simple).
 */
function HeaderRow({ meta }: { meta: Slide["meta"] }) {
  const datumZeit = (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        fontSize: META_SIZE,
        fontWeight: 400,
      }}
    >
      {meta.datum ? (
        <div style={{ display: "flex", alignItems: "center", marginRight: 32 }}>
          <CalendarIcon />
          <span>{meta.datum}</span>
        </div>
      ) : null}
      {meta.zeit ? (
        <div style={{ display: "flex", alignItems: "center" }}>
          <ClockIcon />
          <span>{meta.zeit}</span>
        </div>
      ) : null}
    </div>
  );
  const ort = meta.ort ? (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        fontSize: META_SIZE,
        fontWeight: 400,
      }}
    >
      <GlobeIcon />
      <span>{meta.ort}</span>
    </div>
  ) : (
    <div style={{ display: "flex" }} />
  );
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        ...NO_SHRINK,
      }}
    >
      {datumZeit}
      {ort}
    </div>
  );
}

export function SlideTemplate({
  slide,
  imageDataUrl,
}: {
  slide: Slide;
  /** base64 data-URL for `slide.imagePublicId`, loaded by the caller.
   *  Required when `slide.kind === "image"` or when slide-1 carries an
   *  image. Null otherwise. */
  imageDataUrl?: string | null;
}) {
  const { meta, blocks, kind } = slide;

  const textBase = {
    display: "flex",
    flexDirection: "column" as const,
    width: "100%",
    whiteSpace: "normal" as const,
    wordBreak: "break-word" as const,
  };

  const outerStyle = {
    width: "1080px",
    height: "1350px",
    display: "flex" as const,
    flexDirection: "column" as const,
    alignItems: "stretch" as const,
    backgroundColor: BG,
    color: FG,
    fontFamily: FONT_FAMILY,
    padding: "80px",
  };

  // Hashtags row — only on slide 1, immediately under the header.
  const hashtagsRow = slide.isFirst && meta.hashtags.length > 0 ? (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        flexWrap: "wrap",
        ...NO_SHRINK,
        width: "100%",
        fontSize: HASHTAG_SIZE,
        fontWeight: 400,
        marginTop: HEADER_TO_HASHTAGS_GAP,
      }}
    >
      {meta.hashtags.map((t) => (
        <div key={t} style={{ display: "flex", marginRight: 20 }}>
          #{t}
        </div>
      ))}
    </div>
  ) : null;

  // ─── KIND: "image" — pure image slide (slides 2..N). Header on top, image
  // centered in the remaining canvas. No hashtags, no title (slide-1 only).
  if (kind === "image") {
    const imageBox = fitImage(slide.imageAspect, INNER_WIDTH, 1100);
    return (
      <div style={outerStyle}>
        <HeaderRow meta={meta} />
        <div
          style={{
            display: "flex",
            flexGrow: 1,
            minHeight: 0,
            width: "100%",
            alignItems: "center",
            justifyContent: "center",
            marginTop: HEADER_TO_BODY_GAP,
          }}
        >
          {imageDataUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={imageDataUrl}
              alt=""
              width={imageBox.width}
              height={imageBox.height}
              style={{
                width: imageBox.width,
                height: imageBox.height,
                objectFit: "contain",
              }}
            />
          ) : null}
        </div>
      </div>
    );
  }

  // ─── KIND: "text" — slide 1 carries title (+ optional lead, + optional
  // inline image). Slides 2..N carry body content under the same header.
  const hasInlineImage = Boolean(slide.imagePublicId && imageDataUrl);
  const inlineImageBox = hasInlineImage
    ? fitImage(slide.imageAspect, INNER_WIDTH, 540)
    : null;

  return (
    <div style={outerStyle}>
      <HeaderRow meta={meta} />

      {slide.isFirst ? (
        <>
          {hashtagsRow}
          <div
            style={{
              ...textBase,
              ...NO_SHRINK,
              marginTop: hashtagsRow ? HASHTAGS_TO_TITLE_GAP : HEADER_TO_BODY_GAP,
              marginBottom: hasInlineImage
                ? meta.lead
                  ? LEAD_TO_BODY_GAP
                  : TITLE_TO_BODY_GAP
                : meta.lead
                ? LEAD_TO_BODY_GAP
                : TITLE_TO_BODY_GAP,
            }}
          >
            <div
              style={{
                ...textBase,
                ...NO_SHRINK,
                fontSize: TITLE_SIZE,
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
                  fontSize: LEAD_SIZE,
                  fontWeight: 400,
                  lineHeight: 1.3,
                }}
              >
                {meta.lead}
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      {hasInlineImage && inlineImageBox ? (
        <div
          style={{
            display: "flex",
            flexGrow: 1,
            minHeight: 0,
            width: "100%",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageDataUrl ?? ""}
            alt=""
            width={inlineImageBox.width}
            height={inlineImageBox.height}
            style={{
              width: inlineImageBox.width,
              height: inlineImageBox.height,
              objectFit: "contain",
            }}
          />
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flexGrow: 1,
            minHeight: 0,
            width: "100%",
            // Slide-1 owns its bottom-margin via the title-block above; only
            // continuation slides need the explicit gap from the header.
            marginTop: slide.isFirst ? 0 : HEADER_TO_BODY_GAP,
          }}
        >
          {blocks.map((b, i) => {
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
                  fontSize: BODY_SIZE,
                  marginBottom: b.isHeading ? 16 : isMetaLine ? 6 : 22,
                  lineHeight: b.isHeading ? 1.15 : 1.3,
                }}
              >
                {b.text}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
