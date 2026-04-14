import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireAuth, parseBody, internalError } from "@/lib/api-helpers";
import { locales } from "@/i18n/config";

export async function POST(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  const body = await parseBody<{ ids?: number[]; locale?: string }>(req);
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

  const locale = body.locale ?? "de";
  if (!locales.includes(locale as (typeof locales)[number])) {
    return NextResponse.json(
      { success: false, error: `invalid locale (allowed: ${locales.join(", ")})` },
      { status: 400 }
    );
  }

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // sort_order is per-locale: reorder payload covers exactly one locale
      // and the UPDATE only matches rows whose locale equals the payload's.
      // Without this scoping, dragging a DE section would shuffle FR order,
      // because ids from different locales share one global sort_order space.
      // The rowCount === 1 assertion also catches the case where the client
      // sends an id belonging to a different locale.
      for (let i = 0; i < body.ids.length; i++) {
        const res = await client.query(
          "UPDATE alit_sections SET sort_order = $1 WHERE id = $2 AND locale = $3",
          [i, body.ids[i], locale]
        );
        if (res.rowCount !== 1) {
          throw new Error(`reorder: id ${body.ids[i]} not found for locale ${locale}`);
        }
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      // Known-id errors are a client issue, not a server one.
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
