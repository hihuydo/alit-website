import type { GridImage, Slide } from "@/lib/instagram-post";
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
const TITLE_TO_GRID_GAP = 48;
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
 * Top header — present on every slide. Date+time on the left, ort on the
 * right, each with its calendar/clock/globe icon.
 */
function HeaderRow({ meta }: { meta: Slide["meta"] }) {
  // minWidth:0 + flexShrink:1 so the right-hand Ort cluster can shrink with
  // long left-hand date/time strings instead of getting pushed out of the
  // 920px content row (Codex PR#128 R1).
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

function LeadBlock({ lead, marginBottom }: { lead: string; marginBottom: number }) {
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
        fontWeight: 400,
        lineHeight: 1.3,
      }}
    >
      {lead}
    </div>
  );
}

/**
 * Image grid that mirrors the website's AgendaItem renderer.
 *   cols=1 + length=1 → orientation-aware single image (portrait → 50% width
 *     centered, landscape → full width). Uses image's actual width/height
 *     for aspect-ratio when available, else 4:3 / 3:4 fallback.
 *   else → multi-image grid with `min(cols, length)` columns and 2:3 cells.
 */
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
  const GAP = 12; // matches website's --spacing-half scale at slide resolution.
  if (cols === 1 && images.length === 1) {
    const img = images[0];
    const url = dataUrls[0];
    const isPortrait = img.orientation === "portrait";
    const aspectW = img.width ?? (isPortrait ? 3 : 4);
    const aspectH = img.height ?? (isPortrait ? 4 : 3);
    const aspect = aspectW / aspectH;
    const cellMaxW = isPortrait ? Math.floor(INNER_WIDTH * 0.5) : INNER_WIDTH;
    // Fit the image into (cellMaxW × maxHeight) preserving aspect.
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
            alt={img.alt ?? ""}
            width={renderW}
            height={renderH}
            style={{
              width: renderW,
              height: renderH,
              objectFit: img.fit === "contain" ? "contain" : "cover",
              objectPosition: `${img.cropX ?? 50}% ${img.cropY ?? 50}%`,
              backgroundColor: img.fit === "contain" ? "#fff" : undefined,
            }}
          />
        ) : null}
      </div>
    );
  }

  // Multi-image grid. Mirror AgendaItem's defensive cols handling: cols≥2
  // caps at images.length, defensive (cols=1 + length≥2) becomes 2.
  const effectiveCols =
    cols >= 2 ? Math.min(cols, images.length) : Math.min(2, images.length);
  const rows = Math.ceil(images.length / effectiveCols);
  // Each cell is aspect 2:3. Width = (INNER_WIDTH - gaps) / cols; height
  // derived from aspect. If total row-stack exceeds maxHeight, scale down.
  const cellW = Math.floor((INNER_WIDTH - GAP * (effectiveCols - 1)) / effectiveCols);
  let cellH = Math.floor((cellW * 3) / 2); // 2:3 aspect → h = w * 3/2
  const totalH = cellH * rows + GAP * (rows - 1);
  if (totalH > maxHeight) {
    cellH = Math.floor((maxHeight - GAP * (rows - 1)) / rows);
  }
  const cellWFinal = cellH > 0 ? Math.floor((cellH * 2) / 3) : cellW;

  // Build rows manually — Satori's CSS Grid support is incomplete; nested
  // flex-rows render reliably.
  const rowsJsx = [] as React.ReactElement[];
  for (let r = 0; r < rows; r++) {
    const cells = [] as React.ReactElement[];
    for (let c = 0; c < effectiveCols; c++) {
      const idx = r * effectiveCols + c;
      const img = images[idx];
      if (!img) {
        // Empty trailing cell: keep grid alignment with a transparent box.
        cells.push(
          <div
            key={`empty-${r}-${c}`}
            style={{
              display: "flex",
              width: cellWFinal,
              height: cellH,
              marginLeft: c > 0 ? GAP : 0,
            }}
          />,
        );
        continue;
      }
      const url = dataUrls[idx] ?? null;
      cells.push(
        <div
          key={`${img.publicId}-${idx}`}
          style={{
            display: "flex",
            width: cellWFinal,
            height: cellH,
            marginLeft: c > 0 ? GAP : 0,
            backgroundColor: img.fit === "contain" ? "#fff" : undefined,
            overflow: "hidden",
          }}
        >
          {url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={url}
              alt={img.alt ?? ""}
              width={cellWFinal}
              height={cellH}
              style={{
                width: cellWFinal,
                height: cellH,
                objectFit: img.fit === "contain" ? "contain" : "cover",
                objectPosition: `${img.cropX ?? 50}% ${img.cropY ?? 50}%`,
              }}
            />
          ) : null}
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
          marginTop: r > 0 ? GAP : 0,
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
   *  bytes failed to load (template renders the empty cell rather than
   *  blowing up the whole render). Required when `slide.kind === "grid"`. */
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
  if (kind === "grid" && slide.gridImages && slide.gridImages.length > 0) {
    const cols = slide.gridColumns ?? 1;
    const dataUrls = gridImageDataUrls ?? slide.gridImages.map(() => null);
    return (
      <div style={outerStyle}>
        <HeaderRow meta={meta} />
        <HashtagsRow hashtags={meta.hashtags} />
        <TitleBlock
          title={meta.title}
          marginTop={meta.hashtags.length > 0 ? HASHTAGS_TO_TITLE_GAP : HEADER_TO_BODY_GAP}
          marginBottom={TITLE_TO_GRID_GAP}
        />
        {/* Available height = 1350 - 160 (padding) - HeaderRow(~34) - hashtags
            (~62 if present) - title(~280 for 3-line) - title-to-grid gap. We
            give the grid a generous ceiling and let it scale down. */}
        <ImageGrid
          cols={cols}
          images={slide.gridImages}
          dataUrls={dataUrls}
          maxHeight={680}
        />
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
          // Slide-1 owns its bottom-margin via the title/lead block above;
          // continuation slides + lead-on-slide need explicit gap from header.
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
