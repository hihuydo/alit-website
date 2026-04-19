import fs from "node:fs";
import path from "node:path";

export type FontWeight = 300 | 400 | 800;

export type FontRegistration = {
  name: string;
  data: Buffer;
  weight: FontWeight;
  style: "normal";
};

export const FONT_FILES: Record<FontWeight, string> = {
  300: "PPFragment-SansLight.woff",
  400: "PPFragment-SansRegular.woff",
  800: "PPFragment-SansExtraBold.woff",
};

export const FONT_FAMILY = "PP Fragment Sans";

export type LoadResult =
  | { ok: true; fonts: FontRegistration[] }
  | { ok: false; weight: FontWeight; error: unknown };

/**
 * Load all 3 required PP Fragment Sans weights from public/fonts.
 * Fail-closed: if any weight fails to load, returns {ok:false} with the
 * first failing weight. Caller returns 500 — no partial-font PNG.
 *
 * readFile + fontsDir are injectable for unit tests.
 */
export function loadInstagramFonts(
  opts: { readFile?: (p: string) => Buffer; fontsDir?: string } = {},
): LoadResult {
  const readFile = opts.readFile ?? fs.readFileSync;
  const fontsDir =
    opts.fontsDir ?? path.join(process.cwd(), "public/fonts");
  const fonts: FontRegistration[] = [];
  const weights: FontWeight[] = [300, 400, 800];
  for (const weight of weights) {
    const file = FONT_FILES[weight];
    const p = path.join(fontsDir, file);
    try {
      const data = readFile(p);
      fonts.push({ name: FONT_FAMILY, data, weight, style: "normal" });
    } catch (err) {
      return { ok: false, weight, error: err };
    }
  }
  return { ok: true, fonts };
}
