import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireAuth, parseBody, internalError } from "@/lib/api-helpers";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const body = await parseBody<{ ids?: number[] }>(req);
  if (!body?.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json(
      { success: false, error: "ids array required" },
      { status: 400 }
    );
  }

  if (!body.ids.every((id) => Number.isInteger(id) && id > 0)) {
    return NextResponse.json(
      { success: false, error: "ids must be positive integers" },
      { status: 400 }
    );
  }

  // Codex R2 [P2]: reject duplicate ids. Without this, `[5, 5, 7]` would
  // overwrite id=5's sort_order twice and leave the list-length mismatch
  // invisible to the rowCount=1 guard (each duplicate touches one row).
  if (new Set(body.ids).size !== body.ids.length) {
    return NextResponse.json(
      { success: false, error: "ids must be unique" },
      { status: 400 }
    );
  }

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Codex R2 [P2]: stale-subset guard. Under concurrent admin edits
      // (another session adds/deletes a row mid-drag) the client can
      // submit a partial id list; unmentioned rows keep their old
      // sort_order and collide with the newly-assigned values. Require
      // full coverage in the same transaction.
      const countRes = await client.query<{ c: number }>(
        "SELECT COUNT(*)::int AS c FROM agenda_items",
      );
      if (countRes.rows[0].c !== body.ids.length) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { success: false, error: "Liste veraltet — bitte Seite neu laden" },
          { status: 409 }
        );
      }
      // Display is `sort_order DESC` — invert so ids[0] (top of list) gets
      // highest sort_order. rowCount=1 guard (Codex R1 [P2]) rejects stale
      // or unknown ids.
      const n = body.ids.length;
      for (let i = 0; i < n; i++) {
        const res = await client.query(
          "UPDATE agenda_items SET sort_order = $1 WHERE id = $2",
          [n - 1 - i, body.ids[i]]
        );
        if (res.rowCount !== 1) {
          throw new Error(`reorder: id ${body.ids[i]} not found`);
        }
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      if (err instanceof Error && err.message.startsWith("reorder: id ")) {
        console.error("[agenda/reorder]", err.message);
        return NextResponse.json(
          { success: false, error: "Reorder fehlgeschlagen — ungültige ID-Liste" },
          { status: 400 }
        );
      }
      throw err;
    } finally {
      client.release();
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return internalError("agenda/reorder", err);
  }
}
