import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireAuth, parseBody, internalError, validLength } from "@/lib/api-helpers";
import { validateContent } from "@/lib/journal-validation";
import { locales } from "@/i18n/config";

export async function GET(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  // Dashboard is single-locale for now. Filter server-side so the UI
  // can't accidentally mix DE + FR rows into one draggable list
  // (reorder is per-locale — mixed payloads fail). `?locale=` param
  // is accepted for when FR support lands.
  const url = new URL(req.url);
  const localeParam = url.searchParams.get("locale") ?? "de";
  if (!locales.includes(localeParam as (typeof locales)[number])) {
    return NextResponse.json(
      { success: false, error: `invalid locale (allowed: ${locales.join(", ")})` },
      { status: 400 }
    );
  }

  try {
    const { rows } = await pool.query(
      "SELECT id, title, content, sort_order, locale, created_at, updated_at FROM alit_sections WHERE locale = $1 ORDER BY sort_order ASC",
      [localeParam]
    );
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    return internalError("alit/GET", err);
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  const body = await parseBody<{
    title?: string | null;
    content?: unknown[];
    locale?: string;
  }>(req);

  if (!body) {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const { title, content, locale } = body;

  if (!validLength(title, 200)) {
    return NextResponse.json({ success: false, error: "title too long" }, { status: 400 });
  }
  if (locale !== undefined && (typeof locale !== "string" || !locales.includes(locale as (typeof locales)[number]))) {
    return NextResponse.json({ success: false, error: `invalid locale (allowed: ${locales.join(", ")})` }, { status: 400 });
  }
  if (content !== undefined && content !== null) {
    const err = validateContent(content);
    if (err) {
      return NextResponse.json({ success: false, error: `Invalid content: ${err}` }, { status: 400 });
    }
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO alit_sections (title, content, locale, sort_order)
       VALUES ($1, $2, $3, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM alit_sections))
       RETURNING id, title, content, sort_order, locale, created_at, updated_at`,
      [
        title ?? null,
        JSON.stringify(Array.isArray(content) ? content : []),
        locale ?? "de",
      ]
    );
    return NextResponse.json({ success: true, data: rows[0] }, { status: 201 });
  } catch (err) {
    return internalError("alit/POST", err);
  }
}
