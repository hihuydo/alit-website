import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireAuth, validateId, internalError } from "@/lib/api-helpers";
import {
  countAvailableImages,
  isLocaleEmpty,
  MAX_GRID_IMAGES,
  type AgendaItemForExport,
  type InstagramLayoutOverrides,
} from "@/lib/instagram-post";
import { resolveInstagramSlides } from "@/lib/instagram-overrides";
import { loadSupporterSlideLogos } from "@/lib/supporter-logos";
import { getDictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/lib/i18n-field";

export const runtime = "nodejs";

function parseLocale(v: string | null): Locale | null {
  return v === "de" || v === "fr" ? v : null;
}

/** Non-negative integer, default 0. Anything malformed clamps to 0 so
 *  a bad client param can't 400 the preview fetch. Strict-token check
 *  (`String(n) !== v`) rejects mixed-format values like `2abc` (parseInt
 *  is permissive and would return 2). Mirrors instagram-layout/route.ts +
 *  instagram-slide/[slideIdx]/route.tsx so all three IG endpoints resolve
 *  identical layout buckets for the same query string (Codex PR-R3 [P1]). */
function parseImageCount(v: string | null): number {
  if (v === null) return 0;
  const n = parseInt(v, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  if (String(n) !== v) return 0;
  return n;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const numId = validateId(id);
  if (!numId) {
    return NextResponse.json(
      { success: false, error: "Invalid id" },
      { status: 400 },
    );
  }

  const url = new URL(req.url);
  const locale = parseLocale(url.searchParams.get("locale"));
  const requestedImages = parseImageCount(url.searchParams.get("images"));
  if (!locale) {
    return NextResponse.json(
      { success: false, error: "Invalid locale" },
      { status: 400 },
    );
  }

  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { rows } = await pool.query<
      AgendaItemForExport & { instagram_layout_i18n: InstagramLayoutOverrides | null }
    >(
      `SELECT id, datum, zeit, title_i18n, lead_i18n, ort_i18n, content_i18n,
              hashtags, images, images_grid_columns,
              COALESCE(supporter_logos, '[]'::jsonb) AS supporter_logos,
              instagram_layout_i18n
         FROM agenda_items WHERE id = $1`,
      [numId],
    );
    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404 },
      );
    }
    const item = rows[0];

    if (isLocaleEmpty(item, locale)) {
      return NextResponse.json(
        { success: false, error: "locale_empty" },
        { status: 404 },
      );
    }

    const availableImages = countAvailableImages(item);
    // Clamp requested images to what the item actually has, so a stale
    // client after someone else's edit can't cause a hard error — just
    // a smaller carousel than they asked for.
    // M4a A6: also clamp to MAX_GRID_IMAGES so legacy keys >4 are unreachable
    // across all 3 IG routes (layout / images-API / slide-render PNG).
    const imageCount = Math.min(MAX_GRID_IMAGES, requestedImages, availableImages);
    const override =
      item.instagram_layout_i18n?.[locale]?.[String(imageCount)] ?? null;
    // Sprint M3 — pre-load supporter logos so resolveInstagramSlides can
    // append the supporter slide. Empty array → no append (no-op in resolver).
    const supporterSlideLogos = await loadSupporterSlideLogos(
      item.supporter_logos ?? [],
    );
    const supporterLabel = getDictionary(locale).agenda.supporters.label;
    const { slides, warnings, mode: layoutMode } = resolveInstagramSlides(
      item,
      locale,
      imageCount,
      override,
      supporterSlideLogos,
      supporterLabel,
    );

    // Codex R1 #5 — image_partial pre-check: when grid slide carries N images
    // but media table only has K rows, K<N images render as empty cells in
    // the slide-PNG. Without surfacing that, admin downloads silently
    // under-delivered output. Detect here, modal shows amber banner.
    //
    // Codex PR-R1 [P2] — dedupe ids before comparing. If the same image is
    // attached twice in the grid, gridImages has 2 entries but the media
    // SELECT returns 1 row → false `image_partial` warning without dedupe.
    const gridSlide = slides.find((s) => s.kind === "grid");
    if (gridSlide?.gridImages && gridSlide.gridImages.length > 0) {
      const uniqueIds = Array.from(
        new Set(gridSlide.gridImages.map((g) => g.publicId)),
      );
      const { rows: mediaRows } = await pool.query<{ public_id: string }>(
        `SELECT public_id FROM media WHERE public_id = ANY($1)`,
        [uniqueIds],
      );
      if (mediaRows.length < uniqueIds.length) {
        warnings.push("image_partial");
      }
    }

    return NextResponse.json({
      success: true,
      slideCount: slides.length,
      availableImages,
      imageCount,
      warnings,
      layoutMode,
    });
  } catch (err) {
    return internalError("agenda/instagram/GET", err);
  }
}
