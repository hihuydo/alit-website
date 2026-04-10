import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireAuth, parseBody, internalError, validLength } from "@/lib/api-helpers";
import { validateContent } from "@/lib/journal-validation";

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
    content?: unknown[];
    footer?: string;
  }>(req);

  if (!body) {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const { date, author, title, title_border, lines, images, content, footer } = body;

  // Require date + at least one content source (content blocks or lines)
  if (!date) {
    return NextResponse.json({ success: false, error: "date is required" }, { status: 400 });
  }
  const hasContent = content && Array.isArray(content) && content.length > 0;
  const hasLines = lines && Array.isArray(lines);
  if (!hasContent && !hasLines) {
    return NextResponse.json({ success: false, error: "content or lines required" }, { status: 400 });
  }
  if (hasLines && !lines.every((l) => typeof l === "string")) {
    return NextResponse.json({ success: false, error: "lines must be strings" }, { status: 400 });
  }

  if (hasContent) {
    const contentErr = validateContent(content);
    if (contentErr) {
      return NextResponse.json({ success: false, error: `Invalid content: ${contentErr}` }, { status: 400 });
    }
  }

  if (!validLength(date, 100) || !validLength(author, 200) || !validLength(title, 500) || !validLength(footer, 500)) {
    return NextResponse.json({ success: false, error: "Field too long" }, { status: 400 });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO journal_entries (date, author, title, title_border, lines, images, content, footer, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM journal_entries))
       RETURNING *`,
      [date, author ?? null, title ?? null, title_border ?? false, JSON.stringify(lines ?? []), images ? JSON.stringify(images) : null, hasContent ? JSON.stringify(content) : null, footer ?? null]
    );
    return NextResponse.json({ success: true, data: rows[0] }, { status: 201 });
  } catch (err) {
    return internalError("journal/POST", err);
  }
}
