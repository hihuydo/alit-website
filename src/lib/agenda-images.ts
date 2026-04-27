import pool from "./db";

export type ImageFit = "cover" | "contain";

export interface AgendaImage {
  public_id: string;
  orientation: "portrait" | "landscape";
  width?: number | null;
  height?: number | null;
  alt?: string | null;
  cropX?: number;
  cropY?: number;
  /** Display mode in the public renderer + dashboard preview slot.
   *  - "cover" (default): fill container, crop overflow per cropX/cropY pan.
   *  - "contain": show entire image, letterbox empty space (panel bg shows
   *    through). Use for logos / wide images that get badly center-cropped.
   *  Optional for backwards-compat — `undefined` is treated as "cover". */
  fit?: ImageFit;
}

type ValidationResult =
  | { ok: true; value: AgendaImage[] }
  | { ok: false; error: string };

const MAX_PIXEL_DIMENSION = 20000;

export async function validateImages(
  raw:
    | {
        public_id?: string;
        orientation?: string;
        width?: number;
        height?: number;
        alt?: string | null;
        cropX?: number | null;
        cropY?: number | null;
        fit?: string | null;
      }[]
    | undefined
): Promise<ValidationResult> {
  if (raw === undefined) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "images must be an array" };
  if (raw.length === 0) return { ok: true, value: [] };
  if (raw.length > 20) return { ok: false, error: "Too many images (max 20)" };

  const cleaned: AgendaImage[] = [];
  const seen = new Set<string>();
  for (const img of raw) {
    const publicId = img?.public_id?.trim();
    const orientation = img?.orientation;
    if (!publicId) return { ok: false, error: "Each image needs a public_id" };
    if (publicId.length > 200) return { ok: false, error: "public_id too long" };
    if (orientation !== "portrait" && orientation !== "landscape") {
      return { ok: false, error: "Invalid orientation" };
    }
    if (seen.has(publicId)) return { ok: false, error: "Duplicate image" };
    seen.add(publicId);
    const alt = img?.alt?.trim() || null;
    if (alt && alt.length > 500) return { ok: false, error: "alt text too long" };
    const width = typeof img?.width === "number" && Number.isFinite(img.width) && img.width > 0 && img.width <= MAX_PIXEL_DIMENSION ? Math.round(img.width) : null;
    const height = typeof img?.height === "number" && Number.isFinite(img.height) && img.height > 0 && img.height <= MAX_PIXEL_DIMENSION ? Math.round(img.height) : null;
    let validatedCropX: number | undefined;
    if (img?.cropX === undefined || img?.cropX === null) {
      validatedCropX = undefined;
    } else if (
      typeof img.cropX !== "number" ||
      !Number.isFinite(img.cropX) ||
      img.cropX < 0 ||
      img.cropX > 100
    ) {
      return { ok: false, error: "crop value out of range" };
    } else {
      validatedCropX = img.cropX;
    }
    let validatedCropY: number | undefined;
    if (img?.cropY === undefined || img?.cropY === null) {
      validatedCropY = undefined;
    } else if (
      typeof img.cropY !== "number" ||
      !Number.isFinite(img.cropY) ||
      img.cropY < 0 ||
      img.cropY > 100
    ) {
      return { ok: false, error: "crop value out of range" };
    } else {
      validatedCropY = img.cropY;
    }
    let validatedFit: ImageFit | undefined;
    if (img?.fit === undefined || img?.fit === null) {
      validatedFit = undefined;
    } else if (img.fit === "cover" || img.fit === "contain") {
      validatedFit = img.fit;
    } else {
      return { ok: false, error: "Invalid image fit" };
    }
    cleaned.push({
      public_id: publicId,
      orientation,
      width,
      height,
      alt,
      cropX: validatedCropX,
      cropY: validatedCropY,
      fit: validatedFit,
    });
  }

  const publicIds = [...new Set(cleaned.map((i) => i.public_id))];
  const { rows } = await pool.query(
    "SELECT public_id FROM media WHERE public_id = ANY($1)",
    [publicIds]
  );
  const valid = new Set(rows.map((r) => r.public_id));
  for (const img of cleaned) {
    if (!valid.has(img.public_id)) return { ok: false, error: "Unknown media reference" };
  }

  return { ok: true, value: cleaned };
}
