import { NextRequest, NextResponse } from "next/server";
import { ImageResponse } from "next/og";
import pool from "@/lib/db";
import { requireAuth, validateId, internalError } from "@/lib/api-helpers";
import { auditLog } from "@/lib/audit";
import { getClientIp } from "@/lib/client-ip";
import { resolveActorEmail } from "@/lib/signups-audit";
import { loadInstagramFonts } from "@/lib/instagram-fonts";
import {
  countAvailableImages,
  isLocaleEmpty,
  splitAgendaIntoSlides,
  type AgendaItemForExport,
} from "@/lib/instagram-post";
import { loadMediaAsDataUrl } from "@/lib/instagram-images";
import type { Locale } from "@/lib/i18n-field";
import { SlideTemplate } from "./slide-template";

export const runtime = "nodejs";

function parseLocale(v: string | null): Locale | null {
  return v === "de" || v === "fr" ? v : null;
}

function parseSlideIdx(v: string): number | null {
  const n = parseInt(v, 10);
  if (isNaN(n) || n < 0 || String(n) !== v) return null;
  return n;
}

function parseImageCount(v: string | null): number {
  if (v === null) return 0;
  const n = parseInt(v, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; slideIdx: string }> },
) {
  const { id, slideIdx } = await params;

  // 400-gate on path params BEFORE requireAuth — guarantees agenda_id is a
  // positive integer + slideIdx is a non-negative integer at all downstream
  // call-sites (including auditLog).
  const numId = validateId(id);
  if (!numId) {
    return NextResponse.json(
      { success: false, error: "Invalid id" },
      { status: 400 },
    );
  }
  const numSlideIdx = parseSlideIdx(slideIdx);
  if (numSlideIdx === null) {
    return NextResponse.json(
      { success: false, error: "Invalid slideIdx" },
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
  const download = url.searchParams.get("download") === "1";

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

    // Out-of-range resolution: 422 only when raw content actually exceeded
    // the cap (warnings.too_long); otherwise 404 slide_not_found. An upfront
    // `slideIdx >= HARD_CAP` gate would mis-classify URL-probes on short
    // items (e.g. /slide/10 on a 3-slide item) as "too_long" (Codex PR-R1 #1).
    const imageCount = Math.min(requestedImages, countAvailableImages(item));
    const { slides, warnings } = splitAgendaIntoSlides(item, locale, imageCount);
    if (numSlideIdx >= slides.length) {
      const isTooLong = warnings.includes("too_long");
      return NextResponse.json(
        {
          success: false,
          error: isTooLong ? "too_long" : "slide_not_found",
        },
        { status: isTooLong ? 422 : 404 },
      );
    }

    // Fail-closed font loading: any missing weight → 500, no partial-font PNG.
    const fontResult = loadInstagramFonts();
    if (!fontResult.ok) {
      console.error(
        `[ig-export] font_load_failed weight=${fontResult.weight}`,
        fontResult.error,
      );
      return NextResponse.json(
        {
          success: false,
          error: "font_load_failed",
          weight: fontResult.weight,
        },
        { status: 500 },
      );
    }

    const slide = slides[numSlideIdx];
    // Only load image bytes when the slide actually carries an image.
    // Failed load → render without the image (blank image area) rather
    // than 5xx; the carousel text is still meaningful.
    let imageDataUrl: string | null = null;
    if (slide.imagePublicId) {
      const media = await loadMediaAsDataUrl(slide.imagePublicId);
      imageDataUrl = media?.dataUrl ?? null;
      if (!media) {
        console.warn(
          `[ig-export] image not loadable public_id=${slide.imagePublicId} slide=${numSlideIdx}`,
        );
      }
    }

    const response = new ImageResponse(
      (
        <SlideTemplate
          slide={slide}
          imageDataUrl={imageDataUrl}
        />
      ),
      {
        width: 1080,
        height: 1350,
        fonts: fontResult.fonts.map((f) => ({
          name: f.name,
          data: f.data,
          weight: f.weight,
          style: f.style,
        })),
      },
    );
    // Agenda-content is mutable — never cache PNGs. `?v=` in modal URLs is
    // extra client-hygiene; this header is the primary guarantee.
    response.headers.set("Cache-Control", "no-store, private");

    // Audit only on explicit-download-click. Preview-fetches don't trigger
    // the audit log (avoids spam).
    if (download) {
      const actorEmail = await resolveActorEmail(auth.userId);
      auditLog("agenda_instagram_export", {
        ip: getClientIp(req.headers),
        actor_email: actorEmail ?? undefined,
        agenda_id: numId,
        locale,
        slide_count: slides.length,
        image_count: imageCount,
      });
    }

    return response;
  } catch (err) {
    return internalError("agenda/instagram-slide/GET", err);
  }
}
