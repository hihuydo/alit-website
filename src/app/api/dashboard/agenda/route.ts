import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireAuth, parseBody, internalError } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  try {
    const { rows } = await pool.query(
      "SELECT * FROM agenda_items ORDER BY sort_order ASC"
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
    beschrieb?: string[];
  }>(req);

  if (!body) {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const { datum, zeit, ort, ort_url, titel, beschrieb } = body;

  if (!datum || !zeit || !ort || !ort_url || !titel) {
    return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
  }

  try {
    const { rows: [maxRow] } = await pool.query("SELECT COALESCE(MAX(sort_order), -1) AS max FROM agenda_items");
    const { rows } = await pool.query(
      `INSERT INTO agenda_items (datum, zeit, ort, ort_url, titel, beschrieb, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [datum, zeit, ort, ort_url, titel, JSON.stringify(beschrieb ?? []), maxRow.max + 1]
    );
    return NextResponse.json({ success: true, data: rows[0] }, { status: 201 });
  } catch (err) {
    return internalError("agenda/POST", err);
  }
}
