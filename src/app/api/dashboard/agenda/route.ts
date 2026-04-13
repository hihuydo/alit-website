import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireAuth, parseBody, internalError, validLength } from "@/lib/api-helpers";
import { validateHashtags } from "@/lib/agenda-hashtags";
import { validateImages } from "@/lib/agenda-images";

export async function GET(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  try {
    const { rows } = await pool.query(
      "SELECT * FROM agenda_items ORDER BY sort_order DESC"
    );
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    return internalError("agenda/GET", err);
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  const body = await parseBody<{
    datum?: string;
    zeit?: string;
    ort?: string;
    ort_url?: string;
    titel?: string;
    lead?: string;
    beschrieb?: string[];
    content?: unknown[];
    hashtags?: { tag?: string; projekt_slug?: string }[];
    images?: { public_id?: string; orientation?: string; width?: number; height?: number; alt?: string | null }[];
  }>(req);

  if (!body) {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const { datum, zeit, ort, ort_url, titel, lead, beschrieb, content, hashtags, images } = body;
  const hasContent = content && Array.isArray(content) && content.length > 0;

  if (!datum || !zeit || !ort || !ort_url || !titel) {
    return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
  }

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
    const { rows } = await pool.query(
      `INSERT INTO agenda_items (datum, zeit, ort, ort_url, titel, lead, beschrieb, content, hashtags, images, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM agenda_items))
       RETURNING *`,
      [datum, zeit, ort, ort_url, titel, lead?.trim() || null, JSON.stringify(beschrieb ?? []), hasContent ? JSON.stringify(content) : null, JSON.stringify(hashtagValidation.value), JSON.stringify(imageValidation.value)]
    );
    return NextResponse.json({ success: true, data: rows[0] }, { status: 201 });
  } catch (err) {
    return internalError("agenda/POST", err);
  }
}

