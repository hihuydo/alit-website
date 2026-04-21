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
      const countRes = await client.query<{ c: number }>(
        "SELECT COUNT(*)::int AS c FROM projekte",
      );
      if (countRes.rows[0].c !== body.ids.length) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { success: false, error: "Liste veraltet — bitte Seite neu laden" },
          { status: 409 }
        );
      }
      // Display is `sort_order ASC`, so ids[0] (top of list) gets sort_order=0.
      // rowCount=1 guard rejects unknown ids; count-match + uniqueness rejects
      // stale subsets and duplicates (Codex R2 [P2]).
      for (let i = 0; i < body.ids.length; i++) {
        const res = await client.query(
          "UPDATE projekte SET sort_order = $1 WHERE id = $2",
          [i, body.ids[i]]
        );
        if (res.rowCount !== 1) {
          throw new Error(`reorder: id ${body.ids[i]} not found`);
        }
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      if (err instanceof Error && err.message.startsWith("reorder: id ")) {
        console.error("[projekte/reorder]", err.message);
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
    return internalError("projekte/reorder", err);
  }
}
