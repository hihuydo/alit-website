import { describe, expect, it } from "vitest";
import { validateSlug } from "./slug-validation";

describe("validateSlug", () => {
  describe("accepts", () => {
    it("single lowercase word", () => {
      expect(validateSlug("weltenliteratur")).toBe(true);
    });

    it("hyphen-separated segments", () => {
      expect(validateSlug("essais-agites")).toBe(true);
      expect(validateSlug("a-b-c-d-e")).toBe(true);
    });

    it("segments with digits", () => {
      expect(validateSlug("band-2026")).toBe(true);
      expect(validateSlug("2026-q1")).toBe(true);
    });

    it("single character", () => {
      expect(validateSlug("a")).toBe(true);
      expect(validateSlug("9")).toBe(true);
    });

    it("max-length (100 chars)", () => {
      expect(validateSlug("a".repeat(100))).toBe(true);
    });
  });

  describe("rejects", () => {
    it("empty string", () => {
      expect(validateSlug("")).toBe(false);
    });

    it("whitespace-only", () => {
      expect(validateSlug(" ")).toBe(false);
      expect(validateSlug("   ")).toBe(false);
    });

    it("uppercase letters", () => {
      expect(validateSlug("Essais")).toBe(false);
      expect(validateSlug("ESSAIS-AGITES")).toBe(false);
      expect(validateSlug("mixed-Case")).toBe(false);
    });

    it("leading hyphen", () => {
      expect(validateSlug("-essais")).toBe(false);
    });

    it("trailing hyphen", () => {
      expect(validateSlug("essais-")).toBe(false);
    });

    it("doubled hyphens", () => {
      expect(validateSlug("essais--agites")).toBe(false);
    });

    it("unicode / accented characters", () => {
      expect(validateSlug("agités")).toBe(false);
      expect(validateSlug("ünsere")).toBe(false);
    });

    it("underscores, spaces, other punctuation", () => {
      expect(validateSlug("essais_agites")).toBe(false);
      expect(validateSlug("essais agites")).toBe(false);
      expect(validateSlug("essais.agites")).toBe(false);
      expect(validateSlug("essais/agites")).toBe(false);
    });

    it("length 101+", () => {
      expect(validateSlug("a".repeat(101))).toBe(false);
    });

    it("non-string input", () => {
      expect(validateSlug(undefined)).toBe(false);
      expect(validateSlug(null)).toBe(false);
      expect(validateSlug(42)).toBe(false);
      expect(validateSlug({})).toBe(false);
      expect(validateSlug([])).toBe(false);
    });
  });
});
