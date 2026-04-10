import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireAuth, parseBody, internalError } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  try {
    const { rows } = await pool.query(
      "SELECT * FROM journal_entries ORDER BY sort_order ASC"
    );
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    return internalError("journal/GET", err);
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  const body = await parseBody<{
    date?: string;
    author?: string;
    title?: string;
    title_border?: boolean;
    lines?: string[];
    images?: { src: string; afterLine: number }[];
    footer?: string;
  }>(req);

  if (!body) {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const { date, author, title, title_border, lines, images, footer } = body;

  if (!date || !lines || !Array.isArray(lines)) {
    return NextResponse.json({ success: false, error: "date and lines are required" }, { status: 400 });
  }

  try {
    const { rows: [maxRow] } = await pool.query("SELECT COALESCE(MAX(sort_order), -1) AS max FROM journal_entries");
    const { rows } = await pool.query(
      `INSERT INTO journal_entries (date, author, title, title_border, lines, images, footer, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [date, author ?? null, title ?? null, title_border ?? false, JSON.stringify(lines), images ? JSON.stringify(images) : null, footer ?? null, maxRow.max + 1]
    );
    return NextResponse.json({ success: true, data: rows[0] }, { status: 201 });
  } catch (err) {
    return internalError("journal/POST", err);
  }
}
