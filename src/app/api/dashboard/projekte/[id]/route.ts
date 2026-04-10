import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireAuth, parseBody, internalError } from "@/lib/api-helpers";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  const { id } = await params;

  const body = await parseBody<{
    slug?: string;
    titel?: string;
    kategorie?: string;
    paragraphs?: string[];
    external_url?: string | null;
    archived?: boolean;
    sort_order?: number;
  }>(req);

  if (!body) {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const { slug, titel, kategorie, paragraphs, external_url, archived, sort_order } = body;

  try {
    const { rows, rowCount } = await pool.query(
      `UPDATE projekte
       SET slug = COALESCE($1, slug),
           titel = COALESCE($2, titel),
           kategorie = COALESCE($3, kategorie),
           paragraphs = COALESCE($4, paragraphs),
           external_url = COALESCE($5, external_url),
           archived = COALESCE($6, archived),
           sort_order = COALESCE($7, sort_order),
           updated_at = NOW()
       WHERE id = $8 RETURNING *`,
      [
        slug ?? null,
        titel ?? null,
        kategorie ?? null,
        paragraphs ? JSON.stringify(paragraphs) : null,
        external_url !== undefined ? external_url : null,
        archived ?? null,
        sort_order ?? null,
        id,
      ]
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

  try {
    const { rowCount } = await pool.query("DELETE FROM projekte WHERE id = $1", [id]);

    if (!rowCount) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return internalError("projekte/DELETE", err);
  }
}
