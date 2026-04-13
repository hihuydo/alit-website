import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireAuth, parseBody, internalError } from "@/lib/api-helpers";

export async function POST(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  const body = await parseBody<{ ids?: number[] }>(req);
  if (!body?.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json(
      { success: false, error: "ids array required" },
      { status: 400 }
    );
  }

  if (!body.ids.every((id) => typeof id === "number" && id > 0)) {
    return NextResponse.json(
      { success: false, error: "ids must be positive integers" },
      { status: 400 }
    );
  }

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Visual order is DESC — invert so that ids[0] (top of list) gets highest sort_order
      const n = body.ids.length;
      for (let i = 0; i < n; i++) {
        await client.query(
          "UPDATE journal_entries SET sort_order = $1 WHERE id = $2",
          [n - 1 - i, body.ids[i]]
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return internalError("journal/reorder", err);
  }
}
