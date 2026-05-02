import pool from "./db";
import { loadMediaAsDataUrl } from "./instagram-images";

export interface SupporterLogo {
  public_id: string;
  alt: string | null;
  width: number | null;
  height: number | null;
}

export interface SupporterSlideLogo {
  public_id: string;
  alt: string | null;
  dataUrl: string;
  width: number | null;
  height: number | null;
}

type ValidationResult =
  | { ok: true; value: SupporterLogo[] }
  | { ok: false; error: string };

const MAX_LOGOS = 8;
const MAX_PIXEL_DIMENSION = 20000;
const MAX_PUBLIC_ID_LEN = 100;
const MAX_ALT_LEN = 500;

export async function validateSupporterLogos(
  raw:
    | {
        public_id?: unknown;
        alt?: unknown;
        width?: unknown;
        height?: unknown;
      }[]
    | undefined,
): Promise<ValidationResult> {
  if (raw === undefined) return { ok: true, value: [] };
  if (!Array.isArray(raw)) {
    return { ok: false, error: "supporter_logos must be an array" };
  }
  if (raw.length === 0) return { ok: true, value: [] };
  if (raw.length > MAX_LOGOS) {
    return { ok: false, error: `Too many supporter logos (max ${MAX_LOGOS})` };
  }

  const cleaned: SupporterLogo[] = [];
  const seen = new Set<string>();
  for (const logo of raw) {
    const publicIdRaw = logo?.public_id;
    if (typeof publicIdRaw !== "string" || publicIdRaw.trim().length === 0) {
      return { ok: false, error: "Each logo needs a public_id" };
    }
    const publicId = publicIdRaw.trim();
    if (publicId.length > MAX_PUBLIC_ID_LEN) {
      return {
        ok: false,
        error: `public_id too long (max ${MAX_PUBLIC_ID_LEN} chars)`,
      };
    }
    if (seen.has(publicId)) {
      return { ok: false, error: "Duplicate supporter logo" };
    }
    seen.add(publicId);

    let alt: string | null = null;
    if (logo?.alt !== undefined && logo?.alt !== null) {
      if (typeof logo.alt !== "string") {
        return { ok: false, error: "alt must be a string" };
      }
      const trimmed = logo.alt.trim();
      if (trimmed.length === 0) {
        alt = null;
      } else {
        if (trimmed.length > MAX_ALT_LEN) {
          return { ok: false, error: "alt text too long" };
        }
        alt = trimmed;
      }
    }

    const width = sanitizeDimension(logo?.width, "width");
    if ("error" in width) return { ok: false, error: width.error };

    const height = sanitizeDimension(logo?.height, "height");
    if ("error" in height) return { ok: false, error: height.error };

    cleaned.push({
      public_id: publicId,
      alt,
      width: width.value,
      height: height.value,
    });
  }

  const publicIds = [...new Set(cleaned.map((l) => l.public_id))];
  // Codex PR-R1 [P2]: select mime_type too so non-image media (videos, PDFs)
  // get rejected at the server boundary. Otherwise MediaPicker tampering or
  // cross-contamination from the multi-mode library tab could ship a video
  // public_id into supporter_logos → broken <img> in public + IG-Slide.
  const { rows } = await pool.query<{ public_id: string; mime_type: string }>(
    "SELECT public_id, mime_type FROM media WHERE public_id = ANY($1)",
    [publicIds],
  );
  const mimeByPublicId = new Map(rows.map((r) => [r.public_id, r.mime_type]));
  for (const logo of cleaned) {
    const mime = mimeByPublicId.get(logo.public_id);
    if (mime === undefined) {
      return { ok: false, error: "Unknown media reference" };
    }
    if (!mime.startsWith("image/")) {
      return { ok: false, error: "Supporter logo must be an image" };
    }
  }

  return { ok: true, value: cleaned };
}

type DimensionResult =
  | { value: number | null }
  | { error: string };

function sanitizeDimension(input: unknown, field: "width" | "height"): DimensionResult {
  if (input === undefined || input === null) return { value: null };
  if (
    typeof input !== "number" ||
    !Number.isFinite(input) ||
    input <= 0 ||
    input > MAX_PIXEL_DIMENSION
  ) {
    return { error: `${field} must be a positive number` };
  }
  return { value: Math.round(input) };
}

/**
 * Fetch dataUrl for each logo from the media table and pair with the
 * dimensions stored in the supporter_logos JSONB. Per-logo failures are
 * isolated (try/catch inside map-callback), null results are filtered out
 * via type-predicate so callers always get a strict SupporterSlideLogo[].
 *
 * Width/height come from the JSONB input — NOT from the media table —
 * because the media table has no dimension columns. Mismatch would render
 * Satori-Slides as silent-square placeholders.
 */
export async function loadSupporterSlideLogos(
  logos: SupporterLogo[],
): Promise<SupporterSlideLogo[]> {
  const results = await Promise.all(
    logos.map(async (logo): Promise<SupporterSlideLogo | null> => {
      try {
        const media = await loadMediaAsDataUrl(logo.public_id);
        if (!media) return null;
        return {
          public_id: logo.public_id,
          alt: logo.alt,
          dataUrl: media.dataUrl,
          width: logo.width,
          height: logo.height,
        };
      } catch (err) {
        console.warn(
          `[supporter-logos] failed to load public_id=${logo.public_id}`,
          err,
        );
        return null;
      }
    }),
  );
  return results.filter((x): x is SupporterSlideLogo => x !== null);
}
