import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireAuth, parseBody, internalError } from "@/lib/api-helpers";
import {
  type I18nString,
  type I18nContent,
  type AlitRow,
  validateI18nKeys,
  validateI18nTitle,
  validateI18nContent,
  buildI18nString,
  buildI18nContent,
  withCompletion,
} from "@/lib/alit-i18n";

export async function GET(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  try {
    // Single list across locales: one row per logical entity. The legacy
    // `locale` column is scoped to 'de' by the schema-level backfill
    // precondition; JSONB columns carry both DE and FR content.
    const { rows } = await pool.query<AlitRow>(
      `SELECT id, title_i18n, content_i18n, sort_order, created_at, updated_at
       FROM alit_sections
       WHERE locale = 'de'
       ORDER BY sort_order ASC`,
    );
    return NextResponse.json({ success: true, data: rows.map(withCompletion) });
  } catch (err) {
    return internalError("alit/GET", err);
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  const body = await parseBody<{
    title_i18n?: I18nString;
    content_i18n?: I18nContent;
  }>(req);

  if (!body) {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const { title_i18n, content_i18n } = body;

  const keyErr =
    validateI18nKeys(title_i18n, "title_i18n") ?? validateI18nKeys(content_i18n, "content_i18n");
  if (keyErr) return NextResponse.json({ success: false, error: keyErr }, { status: 400 });

  const titleErr = validateI18nTitle(title_i18n);
  if (titleErr) return NextResponse.json({ success: false, error: titleErr }, { status: 400 });

  const contentErr = validateI18nContent(content_i18n);
  if (contentErr) return NextResponse.json({ success: false, error: contentErr }, { status: 400 });

  const titleJsonb = buildI18nString(title_i18n);
  const contentJsonb = buildI18nContent(content_i18n);

  try {
    const { rows } = await pool.query<AlitRow>(
      `INSERT INTO alit_sections (locale, sort_order, title_i18n, content_i18n)
       VALUES (
         'de',
         (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM alit_sections WHERE locale = 'de'),
         $1::jsonb,
         $2::jsonb
       )
       RETURNING id, title_i18n, content_i18n, sort_order, created_at, updated_at`,
      [
        JSON.stringify(titleJsonb),
        JSON.stringify(contentJsonb),
      ],
    );
    return NextResponse.json({ success: true, data: withCompletion(rows[0]) }, { status: 201 });
  } catch (err) {
    return internalError("alit/POST", err);
  }
}
