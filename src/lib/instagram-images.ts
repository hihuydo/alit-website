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

/**
 * Load a batch of grid images in parallel, isolating per-image failures.
 *
 * DK-20 / Codex R1 #3 — bug class commit 4bfe4ce reproduced: a single broken
 * image row used to take down the whole slide because Promise.all rejects
 * on the first throw. Per-image try/catch turns failed loads into `null`
 * → the slide template renders an empty cell instead of 5xx-ing the route.
 *
 * `slideIdx` is logging context only; the function never throws.
 */
export async function loadGridImageDataUrls(
  publicIds: readonly string[],
  slideIdx: number,
): Promise<(string | null)[]> {
  return Promise.all(
    publicIds.map(async (publicId) => {
      try {
        const media = await loadMediaAsDataUrl(publicId);
        if (!media) {
          console.warn(
            `[ig-export] image not loadable public_id=${publicId} slide=${slideIdx}`,
          );
          return null;
        }
        return media.dataUrl;
      } catch (err) {
        console.warn(
          `[ig-export] image load threw public_id=${publicId} slide=${slideIdx}`,
          err,
        );
        return null;
      }
    }),
  );
}
