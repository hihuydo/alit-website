import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireAuth, parseBody, internalError } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  try {
    const { rows } = await pool.query(
      "SELECT * FROM projekte ORDER BY sort_order ASC"
    );
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    return internalError("projekte/GET", err);
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  const body = await parseBody<{
    slug?: string;
    titel?: string;
    kategorie?: string;
    paragraphs?: string[];
    external_url?: string;
    archived?: boolean;
  }>(req);

  if (!body) {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const { slug, titel, kategorie, paragraphs, external_url, archived } = body;

  if (!slug || !titel || !kategorie) {
    return NextResponse.json({ success: false, error: "slug, titel, and kategorie are required" }, { status: 400 });
  }

  try {
    const { rows: [maxRow] } = await pool.query("SELECT COALESCE(MAX(sort_order), -1) AS max FROM projekte");
    const { rows } = await pool.query(
      `INSERT INTO projekte (slug, titel, kategorie, paragraphs, external_url, archived, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [slug, titel, kategorie, JSON.stringify(paragraphs ?? []), external_url ?? null, archived ?? false, maxRow.max + 1]
    );
    return NextResponse.json({ success: true, data: rows[0] }, { status: 201 });
  } catch (err) {
    // Catch unique violation (duplicate slug) explicitly
    if (typeof err === "object" && err !== null && "code" in err && err.code === "23505") {
      return NextResponse.json({ success: false, error: "Slug already exists" }, { status: 409 });
    }
    return internalError("projekte/POST", err);
  }
}
