import { describe, it, expect } from "vitest";
import { loadInstagramFonts, FONT_FAMILY, FONT_FILES } from "./instagram-fonts";

function makeReadFile(
  opts: { throwOn?: "light" | "regular" | "bold" } = {},
): (p: string) => Buffer {
  return (p: string) => {
    if (opts.throwOn === "light" && p.includes("Light")) {
      throw new Error("fake-error-light");
    }
    if (opts.throwOn === "regular" && p.includes("Regular")) {
      throw new Error("fake-error-regular");
    }
    if (opts.throwOn === "bold" && p.includes("ExtraBold")) {
      throw new Error("fake-error-bold");
    }
    return Buffer.from(`fake-font-data:${p}`);
  };
}

describe("loadInstagramFonts", () => {
  it("returns ok with 3 registrations on success", () => {
    const result = loadInstagramFonts({
      readFile: makeReadFile(),
      fontsDir: "/fake/fonts",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.fonts).toHaveLength(3);
    expect(result.fonts.every((f) => f.name === FONT_FAMILY)).toBe(true);
    expect(result.fonts.map((f) => f.weight)).toEqual([300, 400, 800]);
    expect(result.fonts.every((f) => f.style === "normal")).toBe(true);
    // every registration carries a non-empty Buffer
    expect(result.fonts.every((f) => Buffer.isBuffer(f.data))).toBe(true);
    expect(result.fonts.every((f) => f.data.length > 0)).toBe(true);
  });

  it("returns {ok:false, weight:300} when Light font fails", () => {
    const result = loadInstagramFonts({
      readFile: makeReadFile({ throwOn: "light" }),
      fontsDir: "/fake/fonts",
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.weight).toBe(300);
  });

  it("returns {ok:false, weight:400} when Regular font fails", () => {
    const result = loadInstagramFonts({
      readFile: makeReadFile({ throwOn: "regular" }),
      fontsDir: "/fake/fonts",
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.weight).toBe(400);
  });

  it("returns {ok:false, weight:800} when ExtraBold font fails", () => {
    const result = loadInstagramFonts({
      readFile: makeReadFile({ throwOn: "bold" }),
      fontsDir: "/fake/fonts",
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.weight).toBe(800);
  });

  it("FONT_FILES references all 3 weights by distinct filenames", () => {
    expect(FONT_FILES[300]).toMatch(/Light/);
    expect(FONT_FILES[400]).toMatch(/Regular/);
    expect(FONT_FILES[800]).toMatch(/ExtraBold/);
    const files = Object.values(FONT_FILES);
    expect(new Set(files).size).toBe(3);
  });
});
