import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getSiteUrl } from "./site-url";

describe("getSiteUrl", () => {
  const originalEnv = process.env.SITE_URL;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.SITE_URL;
    } else {
      process.env.SITE_URL = originalEnv;
    }
  });

  describe("default", () => {
    beforeEach(() => {
      delete process.env.SITE_URL;
    });

    it("returns production URL when SITE_URL is unset", () => {
      expect(getSiteUrl().toString()).toBe("https://alit.hihuydo.com/");
    });

    it("returns production URL when SITE_URL is empty string", () => {
      process.env.SITE_URL = "";
      expect(getSiteUrl().toString()).toBe("https://alit.hihuydo.com/");
    });

    it("returns production URL when SITE_URL is whitespace-only", () => {
      process.env.SITE_URL = "   ";
      expect(getSiteUrl().toString()).toBe("https://alit.hihuydo.com/");
    });
  });

  describe("env override", () => {
    it("uses SITE_URL for staging", () => {
      process.env.SITE_URL = "https://staging.alit.hihuydo.com";
      expect(getSiteUrl().toString()).toBe("https://staging.alit.hihuydo.com/");
    });

    it("uses SITE_URL for local development", () => {
      process.env.SITE_URL = "http://localhost:3000";
      expect(getSiteUrl().toString()).toBe("http://localhost:3000/");
    });

    it("trims surrounding whitespace before parsing", () => {
      process.env.SITE_URL = "  https://staging.alit.hihuydo.com  ";
      expect(getSiteUrl().toString()).toBe("https://staging.alit.hihuydo.com/");
    });
  });

  describe("returns URL object (not string)", () => {
    it("callers can use new URL(path, base)", () => {
      delete process.env.SITE_URL;
      const base = getSiteUrl();
      expect(new URL("/de/projekte/test", base).toString()).toBe(
        "https://alit.hihuydo.com/de/projekte/test"
      );
    });
  });
});
