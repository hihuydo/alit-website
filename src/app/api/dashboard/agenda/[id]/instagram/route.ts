import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireAuth, validateId, internalError } from "@/lib/api-helpers";
import {
  isLocaleEmpty,
  splitAgendaIntoSlides,
  type AgendaItemForExport,
  type Scale,
} from "@/lib/instagram-post";
import type { Locale } from "@/lib/i18n-field";

export const runtime = "nodejs";

function parseLocale(v: string | null): Locale | null {
  return v === "de" || v === "fr" ? v : null;
}

function parseScale(v: string | null): Scale | null {
  return v === "s" || v === "m" || v === "l" ? v : null;
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
  const scale = parseScale(url.searchParams.get("scale"));
  if (!locale) {
    return NextResponse.json(
      { success: false, error: "Invalid locale" },
      { status: 400 },
    );
  }
  if (!scale) {
    return NextResponse.json(
      { success: false, error: "Invalid scale" },
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

    const { slides, warnings } = splitAgendaIntoSlides(item, locale, scale);
    return NextResponse.json({
      success: true,
      slideCount: slides.length,
      warnings,
    });
  } catch (err) {
    return internalError("agenda/instagram/GET", err);
  }
}
