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
    content?: unknown[];
    sort_order?: number;
    hashtags?: { tag?: string; projekt_slug?: string }[];
    images?: { public_id?: string; orientation?: string; alt?: string | null }[];
  }>(req);

  if (!body) {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const { datum, zeit, ort, ort_url, titel, lead, beschrieb, content, sort_order, hashtags, images } = body;
  const hasContent = content && Array.isArray(content) && content.length > 0;

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

  try {
    const { rows, rowCount } = await pool.query(
      `UPDATE agenda_items
       SET datum = COALESCE($1, datum),
           zeit = COALESCE($2, zeit),
           ort = COALESCE($3, ort),
           ort_url = COALESCE($4, ort_url),
           titel = COALESCE($5, titel),
           lead = CASE WHEN $6::boolean THEN $7 ELSE lead END,
           beschrieb = COALESCE($8, beschrieb),
           content = $9,
           sort_order = COALESCE($10, sort_order),
           hashtags = COALESCE($11, hashtags),
           images = COALESCE($12, images),
           updated_at = NOW()
       WHERE id = $13 RETURNING *`,
      [
        datum ?? null,
        zeit ?? null,
        ort ?? null,
        ort_url ?? null,
        titel ?? null,
        lead !== undefined,
        lead == null ? null : (lead.trim() || null),
        beschrieb ? JSON.stringify(beschrieb) : null,
        hasContent ? JSON.stringify(content) : null,
        sort_order ?? null,
        hashtags !== undefined ? JSON.stringify(hashtagValidation.value) : null,
        images !== undefined ? JSON.stringify(imageValidation.value) : null,
        numId,
      ]
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
