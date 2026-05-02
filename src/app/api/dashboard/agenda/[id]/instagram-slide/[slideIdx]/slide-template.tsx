import type { GridImage, Slide } from "@/lib/instagram-post";
import { FONT_FAMILY } from "@/lib/instagram-fonts";
import {
  computeSupporterGridLayout,
  IG_FRAME_WIDTH,
  IG_FRAME_HEIGHT,
  IG_FRAME_PADDING,
} from "@/lib/instagram-supporter-layout";

const BG = "#ff5048";
const FG = "#000000";

// Fixed font sizes (no admin-side scale picker — see PR #128). All sizes in
// px on the 1080×1350 canvas.
const BODY_SIZE = 40;
const TITLE_SIZE = 74;
const LEAD_SIZE = 40;
const META_SIZE = 26;
const HASHTAG_SIZE = 26;

// Vertical gaps.
const HEADER_TO_HASHTAGS_GAP = 32;
const HEADER_TO_BODY_GAP = 60;
const HASHTAGS_TO_TITLE_GAP = 60;
const TITLE_TO_LEAD_GAP = 18;
const TITLE_TO_BODY_GAP = 64;
const TITLE_TO_GRID_GAP = 48;
const LEAD_TO_BODY_GAP = 100;

const NO_SHRINK = { flexShrink: 0 as const };

/** Canvas inner box after the outer 80px padding. */
const INNER_WIDTH = 1080 - 160;

/** Available height for `<ImageGrid>` on slide 1. Derived as:
 *    1350 (canvas) - 2*80 (padding) - 34 (HeaderRow) - 32+62 (hashtags +
 *    HASHTAGS_TO_TITLE_GAP, when present) - ~280 (worst-case 3-line title @
 *    74px*1.04*3 + buffer) - 48 (TITLE_TO_GRID_GAP) ≈ 750. Round down to
 *    700 for safety. Tunable via Manual Smoke (DK-19). */
const GRID_MAX_HEIGHT = 700;

const GRID_GAP = 13; // mirrors --spacing-half clamp ceiling 13.333 → floor 13

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

/** Top header — present on every slide. Date+time on the left, ort on the
 *  right (mirror the website's AgendaItem meta row). minWidth:0 + flexShrink:1
 *  so the right-hand cluster can shrink instead of overflowing. */
function HeaderRow({ meta }: { meta: Slide["meta"] }) {
  const datumZeit = (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        minWidth: 0,
        flexShrink: 1,
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
        minWidth: 0,
        flexShrink: 1,
        marginLeft: 24,
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
        width: INNER_WIDTH,
        ...NO_SHRINK,
      }}
    >
      {datumZeit}
      {ort}
    </div>
  );
}

/** Hashtags row — null-guarded against empty arrays so a 0-height phantom
 *  container can't shift the layout (Codex R2 #5 / spec §HashtagsRow). */
function HashtagsRow({ hashtags }: { hashtags: string[] }) {
  if (hashtags.length === 0) return null;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        flexWrap: "wrap",
        ...NO_SHRINK,
        width: INNER_WIDTH,
        fontSize: HASHTAG_SIZE,
        fontWeight: 400,
        marginTop: HEADER_TO_HASHTAGS_GAP,
      }}
    >
      {hashtags.map((t) => (
        <div key={t} style={{ display: "flex", marginRight: 20 }}>
          #{t}
        </div>
      ))}
    </div>
  );
}

function TitleBlock({
  title,
  marginTop,
  marginBottom,
}: {
  title: string;
  marginTop: number;
  marginBottom: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: INNER_WIDTH,
        ...NO_SHRINK,
        marginTop,
        marginBottom,
        whiteSpace: "normal",
        wordBreak: "break-word",
        fontSize: TITLE_SIZE,
        fontWeight: 800,
        lineHeight: 1.04,
      }}
    >
      {title}
    </div>
  );
}

function LeadBlock({
  lead,
  marginBottom,
}: {
  lead: string;
  marginBottom: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: INNER_WIDTH,
        ...NO_SHRINK,
        marginBottom,
        whiteSpace: "normal",
        wordBreak: "break-word",
        fontSize: LEAD_SIZE,
        fontWeight: 800,
        lineHeight: 1.3,
      }}
    >
      {lead}
    </div>
  );
}

/** Image grid mirroring AgendaItem.tsx 1:1 (Codex R1 #1).
 *
 *  - `cols=1 + length=1` → orientation-aware single image (portrait → 50%
 *    width centered, landscape → full width). Aspect from img.width/height
 *    or fallback (3:4 portrait / 4:3 landscape). Fits into maxHeight with
 *    aspect preserved.
 *  - else → multi-cell grid with `min(cols, length)` columns (or `min(2,
 *    length)` defensive when cols=1 + length≥2). Each cell aspect 2:3,
 *    scaled down if total height exceeds maxHeight.
 *
 *  Per-image `fit` (cover/contain) + `cropX/cropY` (objectPosition)
 *  respected. `objectPosition` is set unconditionally (not undefined) —
 *  defaults to 50%/50% center, mirror of AgendaItem `?? 50` pattern. */
function ImageGrid({
  cols,
  images,
  dataUrls,
  maxHeight,
}: {
  cols: number;
  images: GridImage[];
  dataUrls: (string | null)[];
  maxHeight: number;
}) {
  // Single-Image-Branch (cols=1 + length=1 only — matches AgendaItem.tsx:188).
  if (cols === 1 && images.length === 1) {
    const img = images[0];
    const url = dataUrls[0];
    const fit = img.fit;
    const isPortrait = img.orientation === "portrait";
    const aspectW = img.width ?? (isPortrait ? 3 : 4);
    const aspectH = img.height ?? (isPortrait ? 4 : 3);
    const aspect = aspectW / aspectH;
    const cellMaxW = isPortrait ? Math.floor(INNER_WIDTH * 0.5) : INNER_WIDTH;
    let renderW = cellMaxW;
    let renderH = Math.floor(cellMaxW / aspect);
    if (renderH > maxHeight) {
      renderH = maxHeight;
      renderW = Math.floor(maxHeight * aspect);
    }
    return (
      <div
        style={{
          display: "flex",
          width: INNER_WIDTH,
          ...NO_SHRINK,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={url}
            width={renderW}
            height={renderH}
            alt={img.alt ?? ""}
            style={{
              width: renderW,
              height: renderH,
              objectFit: fit === "contain" ? "contain" : "cover",
              objectPosition: `${img.cropX ?? 50}% ${img.cropY ?? 50}%`,
              ...(fit === "contain" && { backgroundColor: "#fff" }),
            }}
          />
        ) : (
          <div
            style={{
              display: "flex",
              width: renderW,
              height: renderH,
              backgroundColor: "#cccccc",
            }}
          />
        )}
      </div>
    );
  }

  // Multi-Cell-Branch (everything else).
  const effectiveCols =
    cols >= 2 ? Math.min(cols, images.length) : Math.min(2, images.length);
  const rows = Math.ceil(images.length / effectiveCols);
  let cellW = Math.floor(
    (INNER_WIDTH - GRID_GAP * (effectiveCols - 1)) / effectiveCols,
  );
  let cellH = Math.floor((cellW * 3) / 2); // aspect 2:3 (mirror AgendaItem.tsx:238)
  const totalH = cellH * rows + GRID_GAP * (rows - 1);
  if (totalH > maxHeight) {
    cellH = Math.floor((maxHeight - GRID_GAP * (rows - 1)) / rows);
    cellW = Math.floor((cellH * 2) / 3);
  }

  // Build rows manually — Satori CSS-Grid support is unreliable; nested
  // flex-rows render deterministically.
  const rowsJsx: React.ReactElement[] = [];
  for (let r = 0; r < rows; r++) {
    const cells: React.ReactElement[] = [];
    for (let c = 0; c < effectiveCols; c++) {
      const idx = r * effectiveCols + c;
      const img = images[idx];
      if (!img) {
        // Empty trailing cell (last row when length % cols !== 0).
        cells.push(
          <div
            key={`empty-${r}-${c}`}
            style={{
              display: "flex",
              width: cellW,
              height: cellH,
              marginLeft: c > 0 ? GRID_GAP : 0,
            }}
          />,
        );
        continue;
      }
      const url = dataUrls[idx] ?? null;
      const fit = img.fit;
      cells.push(
        <div
          key={`${img.publicId}-${idx}`}
          style={{
            display: "flex",
            width: cellW,
            height: cellH,
            marginLeft: c > 0 ? GRID_GAP : 0,
            overflow: "hidden",
            ...(fit === "contain" && { backgroundColor: "#fff" }),
          }}
        >
          {url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={url}
              width={cellW}
              height={cellH}
              alt={img.alt ?? ""}
              style={{
                width: cellW,
                height: cellH,
                objectFit: fit === "contain" ? "contain" : "cover",
                objectPosition: `${img.cropX ?? 50}% ${img.cropY ?? 50}%`,
              }}
            />
          ) : null /* leer → red bg shows through */}
        </div>,
      );
    }
    rowsJsx.push(
      <div
        key={`row-${r}`}
        style={{
          display: "flex",
          flexDirection: "row",
          width: INNER_WIDTH,
          marginTop: r > 0 ? GRID_GAP : 0,
        }}
      >
        {cells}
      </div>,
    );
  }
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: INNER_WIDTH,
        ...NO_SHRINK,
      }}
    >
      {rowsJsx}
    </div>
  );
}

export function SlideTemplate({
  slide,
  gridImageDataUrls,
}: {
  slide: Slide;
  /** Parallel array to `slide.gridImages`. Each entry may be null when the
   *  bytes failed to load — template renders an empty cell rather than
   *  blowing up the whole render. Required when `slide.kind === "grid"`. */
  gridImageDataUrls?: (string | null)[] | null;
}) {
  const { meta, blocks, kind } = slide;

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

  // ─── KIND: "grid" — slide 1 with image grid below title.
  if (kind === "grid") {
    if (!slide.gridImages || slide.gridImages.length === 0) {
      // splitAgendaIntoSlides invariant violation. Lautes Fail statt silent
      // wrong-template fallthrough (spec §Defensive Guard).
      throw new Error(
        `[ig-export] kind="grid" slide ${slide.index} has empty gridImages — splitAgendaIntoSlides invariant violated`,
      );
    }
    const gridCols = slide.gridColumns ?? 1;
    const dataUrls = gridImageDataUrls ?? slide.gridImages.map(() => null);
    return (
      <div style={outerStyle}>
        <HeaderRow meta={meta} />
        <HashtagsRow hashtags={meta.hashtags} />
        <TitleBlock
          title={meta.title}
          marginTop={
            meta.hashtags.length > 0 ? HASHTAGS_TO_TITLE_GAP : HEADER_TO_BODY_GAP
          }
          marginBottom={TITLE_TO_GRID_GAP}
        />
        <ImageGrid
          cols={gridCols}
          images={slide.gridImages}
          dataUrls={dataUrls}
          maxHeight={GRID_MAX_HEIGHT}
        />
      </div>
    );
  }

  // ─── KIND: "supporters" — Sprint M3, optional carousel-tail slide.
  if (kind === "supporters") {
    if (!slide.supporterLogos || slide.supporterLogos.length === 0) {
      throw new Error(
        `[ig-export] kind="supporters" slide ${slide.index} has empty supporterLogos`,
      );
    }
    const layout = computeSupporterGridLayout(
      slide.supporterLogos,
      IG_FRAME_WIDTH,
      IG_FRAME_HEIGHT,
      slide.supporterLabel ?? "",
    );
    return (
      <div
        style={{
          position: "relative",
          width: `${IG_FRAME_WIDTH}px`,
          height: `${IG_FRAME_HEIGHT}px`,
          backgroundColor: BG,
          color: FG,
          fontFamily: FONT_FAMILY,
          display: "flex",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: `${layout.label.y}px`,
            left: `${IG_FRAME_PADDING}px`,
            width: `${IG_FRAME_WIDTH - IG_FRAME_PADDING * 2}px`,
            fontSize: `${layout.label.fontSize}px`,
            fontWeight: 400,
            display: "flex",
          }}
        >
          {slide.supporterLabel ?? ""}
        </div>
        {layout.logos.map((logo) => (
          <div
            key={logo.public_id}
            style={{
              position: "absolute",
              left: `${logo.x}px`,
              top: `${logo.y}px`,
              width: `${logo.w}px`,
              height: `${logo.h}px`,
              display: "flex",
            }}
          >
            <img
              src={logo.dataUrl}
              alt={logo.alt ?? ""}
              width={logo.w}
              height={logo.h}
              style={{ width: `${logo.w}px`, height: `${logo.h}px`, objectFit: "contain" }}
            />
          </div>
        ))}
      </div>
    );
  }

  // ─── KIND: "text" — three sub-cases:
  //   isFirst (no-grid path)  → hashtags + title + lead
  //   leadOnSlide (grid path) → lead-prefix + body
  //   continuation            → just body
  return (
    <div style={outerStyle}>
      <HeaderRow meta={meta} />

      {slide.isFirst ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: INNER_WIDTH,
            ...NO_SHRINK,
          }}
        >
          <HashtagsRow hashtags={meta.hashtags} />
          <TitleBlock
            title={meta.title}
            marginTop={
              meta.hashtags.length > 0 ? HASHTAGS_TO_TITLE_GAP : HEADER_TO_BODY_GAP
            }
            marginBottom={meta.lead ? TITLE_TO_LEAD_GAP : TITLE_TO_BODY_GAP}
          />
          {meta.lead ? <LeadBlock lead={meta.lead} marginBottom={LEAD_TO_BODY_GAP} /> : null}
        </div>
      ) : null}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          minHeight: 0,
          width: INNER_WIDTH,
          justifyContent: "flex-start",
          // Slide 1 owns its bottom-margin via the title/lead block above;
          // continuation + lead-on-slide need explicit gap from header so the
          // body starts at the same vertical position as the lead on slide 2.
          marginTop: slide.isFirst ? 0 : HEADER_TO_BODY_GAP,
        }}
      >
        {slide.leadOnSlide && meta.lead ? (
          <LeadBlock lead={meta.lead} marginBottom={LEAD_TO_BODY_GAP} />
        ) : null}
        {blocks.map((b, i) => {
          const isMetaLine =
            !b.isHeading &&
            b.text.length < 200 &&
            /^\s*\p{L}+\s*:/u.test(b.text);
          return (
            <div
              key={i}
              style={{
                display: "flex",
                flexDirection: "column",
                width: INNER_WIDTH,
                whiteSpace: "normal",
                wordBreak: "break-word",
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
    </div>
  );
}
