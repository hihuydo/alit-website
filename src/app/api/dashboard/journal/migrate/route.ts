import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireAuth, internalError } from "@/lib/api-helpers";
import { migrateLinesToContent } from "@/lib/journal-migration";

export async function POST(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  try {
    // Find all entries that have lines but no content yet
    const { rows } = await pool.query(
      "SELECT id, lines, images FROM journal_entries WHERE content IS NULL"
    );

    if (rows.length === 0) {
      return NextResponse.json({
        success: true,
        migrated: 0,
        message: "No entries to migrate",
      });
    }

    const client = await pool.connect();
    let migrated = 0;
    try {
      await client.query("BEGIN");
      for (const row of rows) {
        const lines: string[] =
          typeof row.lines === "string" ? JSON.parse(row.lines) : row.lines ?? [];
        const images =
          typeof row.images === "string"
            ? JSON.parse(row.images)
            : row.images ?? null;

        if (lines.length === 0) continue;

        const content = migrateLinesToContent(lines, images);

        await client.query(
          "UPDATE journal_entries SET content = $1, updated_at = NOW() WHERE id = $2",
          [JSON.stringify(content), row.id]
        );
        migrated++;
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    return NextResponse.json({
      success: true,
      migrated,
      total: rows.length,
      message: `Migrated ${migrated} of ${rows.length} entries`,
    });
  } catch (err) {
    return internalError("journal/migrate", err);
  }
}
