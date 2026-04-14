import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireAuth, parseBody, internalError, validateId, validLength } from "@/lib/api-helpers";
import { validateContent } from "@/lib/journal-validation";

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
    title?: string | null;
    content?: unknown[] | null;
    locale?: string;
  }>(req);

  if (!body) {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const { title, content, locale } = body;

  if (!validLength(title, 200)) {
    return NextResponse.json({ success: false, error: "title too long" }, { status: 400 });
  }
  if (locale !== undefined && (typeof locale !== "string" || locale.length > 10)) {
    return NextResponse.json({ success: false, error: "invalid locale" }, { status: 400 });
  }
  if (content !== undefined && content !== null) {
    const err = validateContent(content);
    if (err) {
      return NextResponse.json({ success: false, error: `Invalid content: ${err}` }, { status: 400 });
    }
  }

  // Build dynamic SET clauses. undefined = skip (preserve DB value),
  // null = SET NULL, value = SET value. Mirrors journal/[id]/route.ts.
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (title !== undefined) { setClauses.push(`title = $${paramIndex++}`); values.push(title); }
  // content: explicit null → NULL; empty array → '[]'
  if (content !== undefined) { setClauses.push(`content = $${paramIndex++}`); values.push(content === null ? null : JSON.stringify(content)); }
  if (locale !== undefined) { setClauses.push(`locale = $${paramIndex++}`); values.push(locale); }

  if (setClauses.length === 0) {
    return NextResponse.json({ success: false, error: "No fields to update" }, { status: 400 });
  }

  setClauses.push("updated_at = NOW()");
  values.push(numId);

  try {
    const { rows, rowCount } = await pool.query(
      `UPDATE alit_sections SET ${setClauses.join(", ")} WHERE id = $${paramIndex} RETURNING id, title, content, sort_order, locale, created_at, updated_at`,
      values
    );
    if (!rowCount) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: rows[0] });
  } catch (err) {
    return internalError("alit/PUT", err);
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
    const { rowCount } = await pool.query("DELETE FROM alit_sections WHERE id = $1", [numId]);
    if (!rowCount) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return internalError("alit/DELETE", err);
  }
}
