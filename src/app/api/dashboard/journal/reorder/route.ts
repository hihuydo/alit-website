import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireAuth, parseBody, internalError } from "@/lib/api-helpers";

/**
 * POST /api/dashboard/journal/reorder/
 *
 * Body: `{ ids: number[] }` — full ordered id list (top-of-list first).
 * Display contract is `sort_order DESC`, so ids[0] gets the highest
 * sort_order (n-1) and ids[n-1] gets 0.
 *
 * Side-effect: if the site is currently in `auto` sort mode (datum-based
 * auto-sort), the first drag atomically flips it to `manual`. The snapshot
 * IS the reorder request itself — the browser's current visual order is
 * what the client submitted, so persisting it as sort_order + flipping
 * the mode flag produces a seamless transition.
 *
 * Guards (mirrors alit/projekte reorder):
 *   - positive integer ids only
 *   - uniqueness (Set size check) — rejects duplicates like [5,5,7]
 *   - count match inside the transaction — rejects stale subsets
 *     (SELECT COUNT(*) vs ids.length → 409)
 *   - rowCount=1 per UPDATE → rejects unknown ids with 400
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const body = await parseBody<{ ids?: number[] }>(req);
  if (!body?.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json(
      { success: false, error: "ids array required" },
      { status: 400 },
    );
  }
  if (!body.ids.every((id) => Number.isInteger(id) && id > 0)) {
    return NextResponse.json(
      { success: false, error: "ids must be positive integers" },
      { status: 400 },
    );
  }
  if (new Set(body.ids).size !== body.ids.length) {
    return NextResponse.json(
      { success: false, error: "ids must be unique" },
      { status: 400 },
    );
  }

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const countRes = await client.query<{ c: number }>(
        "SELECT COUNT(*)::int AS c FROM journal_entries",
      );
      if (countRes.rows[0].c !== body.ids.length) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { success: false, error: "Liste veraltet — bitte Seite neu laden" },
          { status: 409 },
        );
      }

      // Display is `sort_order DESC` → ids[0] (top) gets highest value.
      const n = body.ids.length;
      for (let i = 0; i < n; i++) {
        const res = await client.query(
          "UPDATE journal_entries SET sort_order = $1 WHERE id = $2",
          [n - 1 - i, body.ids[i]],
        );
        if (res.rowCount !== 1) {
          throw new Error(`reorder: id ${body.ids[i]} not found`);
        }
      }

      // Flip mode to `manual` in the same transaction so a concurrent
      // reload never sees sort_order applied under auto-sort semantics.
      await client.query(
        `INSERT INTO site_settings (key, value)
         VALUES ('journal_sort_mode', 'manual')
         ON CONFLICT (key) DO UPDATE
           SET value = 'manual', updated_at = NOW()`,
      );

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      if (err instanceof Error && err.message.startsWith("reorder: id ")) {
        console.error("[journal/reorder]", err.message);
        return NextResponse.json(
          { success: false, error: "Reorder fehlgeschlagen — ungültige ID-Liste" },
          { status: 400 },
        );
      }
      throw err;
    } finally {
      client.release();
    }

    return NextResponse.json({ success: true, sortMode: "manual" });
  } catch (err) {
    return internalError("journal/reorder", err);
  }
}
