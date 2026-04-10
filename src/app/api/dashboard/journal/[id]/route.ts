import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireAuth, parseBody, internalError, validateId, validLength } from "@/lib/api-helpers";

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
  }>(req);

  if (!body) {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const { date, author, title, title_border, lines, images, content, footer, sort_order } = body;

  if (!validLength(date, 100) || !validLength(author, 200) || !validLength(title, 500) || !validLength(footer, 500)) {
    return NextResponse.json({ success: false, error: "Field too long" }, { status: 400 });
  }

  try {
    const { rows, rowCount } = await pool.query(
      `UPDATE journal_entries
       SET date = COALESCE($1, date),
           author = COALESCE($2, author),
           title = COALESCE($3, title),
           title_border = COALESCE($4, title_border),
           lines = COALESCE($5, lines),
           images = COALESCE($6, images),
           content = COALESCE($7, content),
           footer = COALESCE($8, footer),
           sort_order = COALESCE($9, sort_order),
           updated_at = NOW()
       WHERE id = $10 RETURNING *`,
      [
        date ?? null,
        author !== undefined ? author : null,
        title !== undefined ? title : null,
        title_border ?? null,
        lines ? JSON.stringify(lines) : null,
        images !== undefined ? (images ? JSON.stringify(images) : null) : null,
        content !== undefined ? (content ? JSON.stringify(content) : null) : null,
        footer !== undefined ? footer : null,
        sort_order ?? null,
        numId,
      ]
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
