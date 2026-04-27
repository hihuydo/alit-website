import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireAuth, validateId, internalError } from "@/lib/api-helpers";
import {
  countAvailableImages,
  isLocaleEmpty,
  splitAgendaIntoSlides,
  type AgendaItemForExport,
} from "@/lib/instagram-post";
import type { Locale } from "@/lib/i18n-field";

export const runtime = "nodejs";

function parseLocale(v: string | null): Locale | null {
  return v === "de" || v === "fr" ? v : null;
}

/** Non-negative integer, default 0. Anything malformed clamps to 0 so
 *  a bad client param can't 400 the preview fetch. */
function parseImageCount(v: string | null): number {
  if (v === null) return 0;
  const n = parseInt(v, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
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
    const { rows } = await pool.query<AgendaItemForExport>(
      `SELECT id, datum, zeit, title_i18n, lead_i18n, ort_i18n, content_i18n, hashtags, images
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
    const imageCount = Math.min(requestedImages, availableImages);
    const { slides, warnings } = splitAgendaIntoSlides(item, locale, imageCount);
    return NextResponse.json({
      success: true,
      slideCount: slides.length,
      availableImages,
      imageCount,
      warnings,
    });
  } catch (err) {
    return internalError("agenda/instagram/GET", err);
  }
}
