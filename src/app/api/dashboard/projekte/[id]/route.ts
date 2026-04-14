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
    slug?: string;
    titel?: string;
    kategorie?: string;
    paragraphs?: string[];
    content?: unknown[] | null;
    external_url?: string | null;
    archived?: boolean;
    sort_order?: number;
  }>(req);

  if (!body) {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const { slug, titel, kategorie, paragraphs, content, external_url, archived, sort_order } = body;

  if (!validLength(slug, 100) || !validLength(titel, 300) || !validLength(kategorie, 200) || !validLength(external_url, 500)) {
    return NextResponse.json({ success: false, error: "Field too long" }, { status: 400 });
  }

  // Build dynamic SET clauses. undefined = skip (preserve DB value),
  // null = SET NULL, value = SET value. Mirrors journal/[id]/route.ts.
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (slug !== undefined) { setClauses.push(`slug = $${paramIndex++}`); values.push(slug); }
  if (titel !== undefined) { setClauses.push(`titel = $${paramIndex++}`); values.push(titel); }
  if (kategorie !== undefined) { setClauses.push(`kategorie = $${paramIndex++}`); values.push(kategorie); }
  if (paragraphs !== undefined) { setClauses.push(`paragraphs = $${paramIndex++}`); values.push(JSON.stringify(paragraphs)); }
  if (content !== undefined) { setClauses.push(`content = $${paramIndex++}`); values.push(content === null ? null : JSON.stringify(content)); }
  if (external_url !== undefined) { setClauses.push(`external_url = $${paramIndex++}`); values.push(external_url); }
  if (archived !== undefined) { setClauses.push(`archived = $${paramIndex++}`); values.push(archived); }
  if (sort_order !== undefined) { setClauses.push(`sort_order = $${paramIndex++}`); values.push(sort_order); }

  if (setClauses.length === 0) {
    return NextResponse.json({ success: false, error: "No fields to update" }, { status: 400 });
  }

  setClauses.push("updated_at = NOW()");
  values.push(numId);

  try {
    const { rows, rowCount } = await pool.query(
      `UPDATE projekte SET ${setClauses.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (!rowCount) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: rows[0] });
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err && err.code === "23505") {
      return NextResponse.json({ success: false, error: "Slug already exists" }, { status: 409 });
    }
    return internalError("projekte/PUT", err);
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
    const { rowCount } = await pool.query("DELETE FROM projekte WHERE id = $1", [numId]);

    if (!rowCount) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return internalError("projekte/DELETE", err);
  }
}
