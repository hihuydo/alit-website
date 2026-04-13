import pool from "./db";

export interface AgendaImage {
  public_id: string;
  orientation: "portrait" | "landscape";
  width?: number | null;
  height?: number | null;
  alt?: string | null;
}

type ValidationResult =
  | { ok: true; value: AgendaImage[] }
  | { ok: false; error: string };

const MAX_PIXEL_DIMENSION = 20000;

export async function validateImages(
  raw: { public_id?: string; orientation?: string; width?: number; height?: number; alt?: string | null }[] | undefined
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
    cleaned.push({ public_id: publicId, orientation, width, height, alt });
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
