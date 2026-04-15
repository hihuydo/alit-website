import { describe, expect, it } from "vitest";
import { buildSitemap } from "./sitemap";
import type { ProjektSitemapRow } from "@/lib/queries";

const BASE = new URL("https://alit.hihuydo.com");

function row(overrides: Partial<ProjektSitemapRow> & Pick<ProjektSitemapRow, "slug_de">): ProjektSitemapRow {
  return {
    slug_de: overrides.slug_de,
    slug_fr: overrides.slug_fr ?? null,
    has_de: overrides.has_de ?? true,
    has_fr: overrides.has_fr ?? false,
  };
}

// Regression for Codex P2: title-only locales (no content) must still
// count as "visible" for sitemap emission, matching getProjekte's filter.

describe("buildSitemap", () => {
  describe("static routes", () => {
    it("emits both locales for every static path with hreflang triple", () => {
      const out = buildSitemap([], BASE);
      // 5 static paths × 2 locales = 10 entries
      expect(out).toHaveLength(10);
      const urls = out.map((e) => e.url);
      expect(urls).toContain("https://alit.hihuydo.com/de/");
      expect(urls).toContain("https://alit.hihuydo.com/fr/");
      expect(urls).toContain("https://alit.hihuydo.com/de/alit");
      expect(urls).toContain("https://alit.hihuydo.com/fr/alit");
      for (const entry of out) {
        expect(entry.alternates?.languages).toBeDefined();
        expect(entry.alternates?.languages).toHaveProperty("de");
        expect(entry.alternates?.languages).toHaveProperty("fr");
        expect(entry.alternates?.languages).toHaveProperty("x-default");
      }
    });
  });

  describe("projekt detail pages", () => {
    it("skips projekte without DE content entirely", () => {
      const out = buildSitemap(
        [row({ slug_de: "fr-only", has_de: false, has_fr: true })],
        BASE,
      );
      const projektUrls = out.map((e) => e.url).filter((u) => u.includes("/projekte/"));
      expect(projektUrls).toHaveLength(0);
    });

    it("emits one DE-only entry (NO FR alternate) when projekt has only DE content and no slug_fr", () => {
      const out = buildSitemap(
        [row({ slug_de: "weltenliteratur" })],
        BASE,
      );
      const projektEntries = out.filter((e) => e.url.includes("/projekte/weltenliteratur"));
      expect(projektEntries).toHaveLength(1);
      expect(projektEntries[0].url).toBe("https://alit.hihuydo.com/de/projekte/weltenliteratur");
      const langs = projektEntries[0].alternates?.languages;
      expect(langs).toHaveProperty("de");
      expect(langs).toHaveProperty("x-default");
      expect(langs).not.toHaveProperty("fr");
    });

    it("emits both locale entries when slug_fr is set (even without FR content — explicit admin override)", () => {
      const out = buildSitemap(
        [row({ slug_de: "essais-agites", slug_fr: "essais-agites-fr" })],
        BASE,
      );
      const projektEntries = out.filter((e) => e.url.includes("/projekte/"));
      expect(projektEntries).toHaveLength(2);
      const urls = projektEntries.map((e) => e.url);
      expect(urls).toContain("https://alit.hihuydo.com/de/projekte/essais-agites");
      expect(urls).toContain("https://alit.hihuydo.com/fr/projekte/essais-agites-fr");
      const langs = projektEntries[0].alternates?.languages;
      expect(langs).toHaveProperty("fr");
      expect(langs?.fr).toBe("https://alit.hihuydo.com/fr/projekte/essais-agites-fr");
    });

    it("emits both locale entries pointing at same URL when FR content exists but no slug_fr", () => {
      const out = buildSitemap(
        [row({ slug_de: "unsere-schweiz", has_fr: true })],
        BASE,
      );
      const projektEntries = out.filter((e) => e.url.includes("/projekte/unsere-schweiz"));
      expect(projektEntries).toHaveLength(2);
      // Both entries point at slug_de (no FR alias), but FR alternate is emitted
      expect(projektEntries[0].alternates?.languages?.fr).toBe("https://alit.hihuydo.com/fr/projekte/unsere-schweiz");
    });

    it("treats title-only locale as visible (Codex Runde 2 P2 regression)", () => {
      // Projekt has DE title but no DE content — renders on panel 3 and
      // at /de/projekte/<slug>, so sitemap must emit it. has_de is the
      // broader "title OR content" flag set by getProjekteForSitemap.
      const out = buildSitemap(
        [row({ slug_de: "title-only-de", has_de: true, has_fr: false })],
        BASE,
      );
      const projektEntries = out.filter((e) => e.url.includes("/projekte/title-only-de"));
      expect(projektEntries).toHaveLength(1);
      expect(projektEntries[0].url).toBe("https://alit.hihuydo.com/de/projekte/title-only-de");
    });
  });

  describe("URLs are absolute", () => {
    it("every entry url starts with https://", () => {
      const out = buildSitemap(
        [
          row({ slug_de: "a" }),
          row({ slug_de: "b", slug_fr: "b-fr" }),
        ],
        BASE,
      );
      for (const entry of out) {
        expect(entry.url).toMatch(/^https:\/\//);
      }
    });

    it("respects the base URL passed in (staging vs prod)", () => {
      const stagingBase = new URL("https://staging.alit.hihuydo.com");
      const out = buildSitemap([row({ slug_de: "a" })], stagingBase);
      for (const entry of out) {
        expect(entry.url).toMatch(/^https:\/\/staging\.alit\.hihuydo\.com\//);
      }
    });
  });
});
