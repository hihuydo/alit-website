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
    datum?: string;
    zeit?: string;
    ort?: string;
    ort_url?: string;
    titel?: string;
    beschrieb?: string[];
    content?: unknown[];
    sort_order?: number;
  }>(req);

  if (!body) {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const { datum, zeit, ort, ort_url, titel, beschrieb, content, sort_order } = body;
  const hasContent = content && Array.isArray(content) && content.length > 0;

  if (!validLength(datum, 50) || !validLength(zeit, 50) || !validLength(ort, 200) || !validLength(ort_url, 500) || !validLength(titel, 500)) {
    return NextResponse.json({ success: false, error: "Field too long" }, { status: 400 });
  }

  try {
    const { rows, rowCount } = await pool.query(
      `UPDATE agenda_items
       SET datum = COALESCE($1, datum),
           zeit = COALESCE($2, zeit),
           ort = COALESCE($3, ort),
           ort_url = COALESCE($4, ort_url),
           titel = COALESCE($5, titel),
           beschrieb = COALESCE($6, beschrieb),
           content = $7,
           sort_order = COALESCE($8, sort_order),
           updated_at = NOW()
       WHERE id = $9 RETURNING *`,
      [
        datum ?? null,
        zeit ?? null,
        ort ?? null,
        ort_url ?? null,
        titel ?? null,
        beschrieb ? JSON.stringify(beschrieb) : null,
        hasContent ? JSON.stringify(content) : null,
        sort_order ?? null,
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
