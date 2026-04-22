/**
 * Loader for media bytes used in the Instagram-slide PNG renderer.
 *
 * Satori does accept remote `http(s):` URLs for `<img>` sources, but
 * that would hit the public `/api/media/<uuid>/` endpoint from within
 * our own container — extra network hop + cache bust + auth
 * considerations. Going straight to the DB returns the bytes once,
 * encodes as a data-URL, and hands Satori an inline image with no
 * roundtrip.
 *
 * Node-only (uses `Buffer`). The Satori-rendering route is already
 * `runtime = "nodejs"`, so no edge-boundary problem.
 */

import pool from "./db";

export type MediaImage = {
  dataUrl: string;
  width: number | null;
  height: number | null;
};

/**
 * Fetch one media row by its public UUID and return a data-URL-ready
 * payload. Returns null when the row doesn't exist or the MIME type
 * isn't an image — caller decides how to degrade (we prefer a blank
 * slide over a broken `<img>`).
 */
export async function loadMediaAsDataUrl(publicId: string): Promise<MediaImage | null> {
  const { rows } = await pool.query<{
    mime_type: string;
    data: Buffer;
  }>(
    `SELECT mime_type, data
       FROM media
      WHERE public_id = $1
      LIMIT 1`,
    [publicId],
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  if (!row.mime_type.startsWith("image/")) return null;
  const b64 = row.data.toString("base64");
  return {
    dataUrl: `data:${row.mime_type};base64,${b64}`,
    width: null,
    height: null,
  };
}
