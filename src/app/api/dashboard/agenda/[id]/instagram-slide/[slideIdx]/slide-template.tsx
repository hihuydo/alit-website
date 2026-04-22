import type { Slide, Scale } from "@/lib/instagram-post";
import { FONT_FAMILY } from "@/lib/instagram-fonts";

const BG = "#ff5048";
const FG = "#000000";

const BODY_SIZES: Record<Scale, number> = { s: 28, m: 34, l: 42 };
const HEADING_FACTOR = 1.25;
const META_GAP = 8;
const META_BLOCK_GAP = 40;
const TITLE_TO_LEAD_GAP = 18;
const LEAD_TO_IMAGE_GAP = 48;
const TITLE_TO_IMAGE_GAP = 40;
const LEAD_TO_BODY_GAP = 100;
const TITLE_TO_BODY_GAP = 64;
const NO_SHRINK = { flexShrink: 0 as const };

/** Canvas inner box after the outer 80px padding. */
const INNER_WIDTH = 1080 - 160;

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

/**
 * Compute an image's rendered box that fits inside `maxWidth × maxHeight`
 * while preserving its aspect ratio (contain). Fallback to a square
 * sub-box (75% of the smaller dimension) when the aspect is unknown —
 * better than Satori's default of stretching to the parent.
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
  // Try fitting by width first; fall back to by-height when too tall.
  const byWidth = { width: maxWidth, height: maxWidth / aspect };
  if (byWidth.height <= maxHeight) {
    return { width: Math.floor(byWidth.width), height: Math.floor(byWidth.height) };
  }
  return {
    width: Math.floor(maxHeight * aspect),
    height: Math.floor(maxHeight),
  };
}

export function SlideTemplate({
  slide,
  totalSlides,
  scale,
  imageDataUrl,
}: {
  slide: Slide;
  totalSlides: number;
  scale: Scale;
  /** base64 data-URL for `slide.imagePublicId`, loaded by the caller.
   *  Required when `slide.kind === "image"` or when slide-1 carries an
   *  image. Null otherwise. */
  imageDataUrl?: string | null;
}) {
  const { meta, blocks, kind } = slide;
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

  const hashtagsFooter = meta.hashtags.length > 0 ? (
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
  ) : null;

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

  // ─── KIND: "image" — pure image slide (slides 2..N when admin exports
  // multiple images). Header = continuation meta, body = centered image
  // on the red bg, footer = hashtags.
  if (kind === "image") {
    // Reserve ~60px header + ~80px hashtags footer → body has ~1050px height
    // inside the padded canvas.
    const imageBox = fitImage(slide.imageAspect, INNER_WIDTH, 1020);
    return (
      <div style={outerStyle}>
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
          {imageDataUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={imageDataUrl}
              alt=""
              width={imageBox.width}
              height={imageBox.height}
              style={{ width: imageBox.width, height: imageBox.height, objectFit: "contain" }}
            />
          ) : null}
        </div>
        {hashtagsFooter}
      </div>
    );
  }

  // ─── KIND: "text" — may have an inline image (slide-1 with image) OR
  // be a pure text slide (legacy behavior, or body-text-after-images).
  const hasInlineImage = Boolean(slide.imagePublicId && imageDataUrl);
  // When slide-1 carries an image: reserve ~550px for the image box below
  // title/lead. No content-blocks on that slide (splitAgendaIntoSlides
  // routes body blocks to later slides instead).
  const inlineImageBox = hasInlineImage
    ? fitImage(slide.imageAspect, INNER_WIDTH, 540)
    : null;

  return (
    <div style={outerStyle}>
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
            marginBottom: hasInlineImage
              ? meta.lead
                ? LEAD_TO_IMAGE_GAP
                : TITLE_TO_IMAGE_GAP
              : meta.lead
              ? LEAD_TO_BODY_GAP
              : TITLE_TO_BODY_GAP,
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
      )}

      {hashtagsFooter}
    </div>
  );
}
