import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireAuth, parseBody, internalError, validateId, validLength } from "@/lib/api-helpers";
import { validateHashtags } from "@/lib/agenda-hashtags";
import { validateImages } from "@/lib/agenda-images";

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
    datum?: string;
    zeit?: string;
    ort?: string;
    ort_url?: string;
    titel?: string;
    lead?: string | null;
    beschrieb?: string[];
    content?: unknown[] | null;
    sort_order?: number;
    hashtags?: { tag?: string; projekt_slug?: string }[];
    images?: { public_id?: string; orientation?: string; width?: number; height?: number; alt?: string | null }[];
  }>(req);

  if (!body) {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const { datum, zeit, ort, ort_url, titel, lead, beschrieb, content, sort_order, hashtags, images } = body;

  if (!validLength(datum, 50) || !validLength(zeit, 50) || !validLength(ort, 200) || !validLength(ort_url, 500) || !validLength(titel, 500) || !validLength(lead, 1000)) {
    return NextResponse.json({ success: false, error: "Field too long" }, { status: 400 });
  }

  const hashtagValidation = await validateHashtags(hashtags);
  if (!hashtagValidation.ok) {
    return NextResponse.json({ success: false, error: hashtagValidation.error }, { status: 400 });
  }

  const imageValidation = await validateImages(images);
  if (!imageValidation.ok) {
    return NextResponse.json({ success: false, error: imageValidation.error }, { status: 400 });
  }

  // Build dynamic SET clauses. undefined = skip (preserve DB value),
  // null = SET NULL, value = SET value. Mirrors journal/[id]/route.ts.
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (datum !== undefined) { setClauses.push(`datum = $${paramIndex++}`); values.push(datum); }
  if (zeit !== undefined) { setClauses.push(`zeit = $${paramIndex++}`); values.push(zeit); }
  if (ort !== undefined) { setClauses.push(`ort = $${paramIndex++}`); values.push(ort); }
  if (ort_url !== undefined) { setClauses.push(`ort_url = $${paramIndex++}`); values.push(ort_url); }
  if (titel !== undefined) { setClauses.push(`titel = $${paramIndex++}`); values.push(titel); }
  // lead: normalize empty string to NULL (preserves prior behavior)
  if (lead !== undefined) { setClauses.push(`lead = $${paramIndex++}`); values.push(lead == null ? null : (lead.trim() || null)); }
  if (beschrieb !== undefined) { setClauses.push(`beschrieb = $${paramIndex++}`); values.push(JSON.stringify(beschrieb)); }
  if (content !== undefined) { setClauses.push(`content = $${paramIndex++}`); values.push(content === null ? null : JSON.stringify(content)); }
  if (sort_order !== undefined) { setClauses.push(`sort_order = $${paramIndex++}`); values.push(sort_order); }
  if (hashtags !== undefined) { setClauses.push(`hashtags = $${paramIndex++}`); values.push(JSON.stringify(hashtagValidation.value)); }
  if (images !== undefined) { setClauses.push(`images = $${paramIndex++}`); values.push(JSON.stringify(imageValidation.value)); }

  if (setClauses.length === 0) {
    return NextResponse.json({ success: false, error: "No fields to update" }, { status: 400 });
  }

  setClauses.push("updated_at = NOW()");
  values.push(numId);

  try {
    const { rows, rowCount } = await pool.query(
      `UPDATE agenda_items SET ${setClauses.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (!rowCount) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: rows[0] });
  } catch (err) {
    return internalError("agenda/PUT", err);
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
    const { rowCount } = await pool.query("DELETE FROM agenda_items WHERE id = $1", [numId]);

    if (!rowCount) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return internalError("agenda/DELETE", err);
  }
}
