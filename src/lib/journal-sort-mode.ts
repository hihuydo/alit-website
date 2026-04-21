/**
 * Journal list sort mode — global switch between datum-based auto-sort
 * and admin-controlled drag&drop order.
 *
 * - `auto` (default): `ORDER BY COALESCE(parsed_datum, created_at::date) DESC`
 * - `manual`: `ORDER BY sort_order DESC` — snapshot of the visual order
 *   at the moment of the first drag. New entries (POST) land at MAX+1
 *   so they appear at the top of the DESC-sorted list.
 *
 * Stored as a key in `site_settings`. Missing key = auto (the
 * pre-manual default). Flipping from auto → manual happens atomically
 * inside the reorder route's transaction so a concurrent reload
 * never sees a mode that doesn't match the current sort_order state.
 */

import pool from "./db";

export type JournalSortMode = "auto" | "manual";

const KEY = "journal_sort_mode";

export async function getJournalSortMode(): Promise<JournalSortMode> {
  const { rows } = await pool.query<{ value: string | null }>(
    "SELECT value FROM site_settings WHERE key = $1",
    [KEY],
  );
  const v = rows[0]?.value;
  return v === "manual" ? "manual" : "auto";
}

export async function setJournalSortMode(mode: JournalSortMode): Promise<void> {
  await pool.query(
    `INSERT INTO site_settings (key, value)
     VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [KEY, mode],
  );
}
