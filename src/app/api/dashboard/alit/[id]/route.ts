import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireAuth, parseBody, internalError, validateId } from "@/lib/api-helpers";
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

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const numId = validateId(id);
  if (!numId) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
  }

  // PUT deliberately does NOT accept `locale`. The logical entity is one
  // row now; locale-scoped content lives in JSONB columns. Mutating the
  // legacy `locale` column would break the GET filter.
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

  // Full-replace semantics per field: sending `title_i18n: { de: "x" }`
  // replaces the whole JSONB object; omitted FR key gets dropped. This
  // mirrors the Dashboard submission shape (always sends both locales).
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let p = 1;

  if (title_i18n !== undefined) {
    const titleJsonb = buildI18nString(title_i18n);
    setClauses.push(`title_i18n = $${p++}::jsonb`);
    values.push(JSON.stringify(titleJsonb));
  }

  if (content_i18n !== undefined) {
    const contentJsonb = buildI18nContent(content_i18n);
    setClauses.push(`content_i18n = $${p++}::jsonb`);
    values.push(JSON.stringify(contentJsonb));
  }

  if (setClauses.length === 0) {
    return NextResponse.json({ success: false, error: "No fields to update" }, { status: 400 });
  }

  setClauses.push("updated_at = NOW()");
  values.push(numId);

  try {
    const { rows, rowCount } = await pool.query<AlitRow>(
      `UPDATE alit_sections SET ${setClauses.join(", ")}
       WHERE id = $${p}
       RETURNING id, title_i18n, content_i18n, sort_order, created_at, updated_at`,
      values,
    );
    if (!rowCount) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: withCompletion(rows[0]) });
  } catch (err) {
    return internalError("alit/PUT", err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const numId = validateId(id);
  if (!numId) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
  }

  try {
    const { rowCount } = await pool.query("DELETE FROM alit_sections WHERE id = $1", [numId]);
    if (!rowCount) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return internalError("alit/DELETE", err);
  }
}
