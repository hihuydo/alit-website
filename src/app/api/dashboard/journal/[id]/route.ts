import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireAuth, parseBody, internalError, validateId, validLength } from "@/lib/api-helpers";
import { validateContent } from "@/lib/journal-validation";
import { validateHashtags } from "@/lib/agenda-hashtags";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  const { id } = await params;
  const numId = validateId(id);
  if (!numId) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
  }

  const body = await parseBody<{
    date?: string;
    author?: string | null;
    title?: string | null;
    title_border?: boolean;
    lines?: string[];
    images?: { src: string; afterLine: number }[] | null;
    content?: unknown[] | null;
    footer?: string | null;
    sort_order?: number;
    hashtags?: { tag?: string; projekt_slug?: string }[];
  }>(req);

  if (!body) {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const { date, author, title, title_border, lines, images, content, footer, sort_order, hashtags } = body;

  const hashtagValidation = await validateHashtags(hashtags);
  if (!hashtagValidation.ok) {
    return NextResponse.json({ success: false, error: hashtagValidation.error }, { status: 400 });
  }

  if (!validLength(date, 100) || !validLength(author, 200) || !validLength(title, 500) || !validLength(footer, 500)) {
    return NextResponse.json({ success: false, error: "Field too long" }, { status: 400 });
  }

  // Validate content if provided
  if (content !== undefined && content !== null) {
    const contentErr = validateContent(content);
    if (contentErr) {
      return NextResponse.json({ success: false, error: `Invalid content: ${contentErr}` }, { status: 400 });
    }
  }

  // Type guards for non-string fields
  if (title_border !== undefined && typeof title_border !== "boolean") {
    return NextResponse.json({ success: false, error: "title_border must be boolean" }, { status: 400 });
  }
  if (lines !== undefined && (!Array.isArray(lines) || !lines.every((l) => typeof l === "string"))) {
    return NextResponse.json({ success: false, error: "lines must be string array" }, { status: 400 });
  }
  if (sort_order !== undefined && typeof sort_order !== "number") {
    return NextResponse.json({ success: false, error: "sort_order must be number" }, { status: 400 });
  }

  // Build dynamic SET clauses to allow explicit NULL clearing
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (date !== undefined) { setClauses.push(`date = $${paramIndex++}`); values.push(date); }
  if (author !== undefined) { setClauses.push(`author = $${paramIndex++}`); values.push(author); }
  if (title !== undefined) { setClauses.push(`title = $${paramIndex++}`); values.push(title); }
  if (title_border !== undefined) { setClauses.push(`title_border = $${paramIndex++}`); values.push(title_border); }
  if (lines !== undefined) { setClauses.push(`lines = $${paramIndex++}`); values.push(JSON.stringify(lines)); }
  if (images !== undefined) { setClauses.push(`images = $${paramIndex++}`); values.push(images ? JSON.stringify(images) : null); }
  if (content !== undefined) { setClauses.push(`content = $${paramIndex++}`); values.push(content ? JSON.stringify(content) : null); }
  if (footer !== undefined) { setClauses.push(`footer = $${paramIndex++}`); values.push(footer); }
  if (sort_order !== undefined) { setClauses.push(`sort_order = $${paramIndex++}`); values.push(sort_order); }
  if (hashtags !== undefined) { setClauses.push(`hashtags = $${paramIndex++}`); values.push(JSON.stringify(hashtagValidation.value)); }

  if (setClauses.length === 0) {
    return NextResponse.json({ success: false, error: "No fields to update" }, { status: 400 });
  }

  setClauses.push("updated_at = NOW()");
  values.push(numId);

  try {
    const { rows, rowCount } = await pool.query(
      `UPDATE journal_entries SET ${setClauses.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (!rowCount) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: rows[0] });
  } catch (err) {
    return internalError("journal/PUT", err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  const { id } = await params;
  const numId = validateId(id);
  if (!numId) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
  }

  try {
    const { rowCount } = await pool.query("DELETE FROM journal_entries WHERE id = $1", [numId]);

    if (!rowCount) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return internalError("journal/DELETE", err);
  }
}
