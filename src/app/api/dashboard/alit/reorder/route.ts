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

  if (!body.ids.every((id) => Number.isInteger(id) && id > 0)) {
    return NextResponse.json(
      { success: false, error: "ids must be positive integers" },
      { status: 400 }
    );
  }

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // One row per logical entity (post-i18n migration). All rows have
      // locale='de' per the schema-level backfill precondition. Matching
      // on `locale='de'` keeps the existing index useful and asserts the
      // id belongs to the managed set.
      for (let i = 0; i < body.ids.length; i++) {
        const res = await client.query(
          "UPDATE alit_sections SET sort_order = $1 WHERE id = $2 AND locale = 'de'",
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
        return NextResponse.json(
          { success: false, error: err.message },
          { status: 400 }
        );
      }
      throw err;
    } finally {
      client.release();
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return internalError("alit/reorder", err);
  }
}
