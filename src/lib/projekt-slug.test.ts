import { describe, expect, it } from "vitest";
import { buildProjektSlugMap } from "./projekt-slug";
import type { Projekt } from "@/content/projekte";

function projekt(overrides: Partial<Projekt> & Pick<Projekt, "slug_de">): Projekt {
  return {
    slug_de: overrides.slug_de,
    slug_fr: overrides.slug_fr ?? null,
    urlSlug: overrides.urlSlug ?? overrides.slug_de,
    titel: overrides.titel ?? "Titel",
    kategorie: overrides.kategorie ?? "Kategorie",
    paragraphs: overrides.paragraphs ?? [],
  };
}

describe("buildProjektSlugMap", () => {
  it("keys entries by slug_de (not urlSlug)", () => {
    const map = buildProjektSlugMap([
      projekt({ slug_de: "essais-agites", slug_fr: "essais-agites-fr", urlSlug: "essais-agites-fr" }),
    ]);
    expect(Object.keys(map)).toEqual(["essais-agites"]);
    expect(map["essais-agites"].urlSlug).toBe("essais-agites-fr");
  });

  it("preserves null slug_fr when projekt has no FR alias", () => {
    const map = buildProjektSlugMap([
      projekt({ slug_de: "weltenliteratur", slug_fr: null, urlSlug: "weltenliteratur" }),
    ]);
    expect(map["weltenliteratur"].slug_fr).toBeNull();
  });

  it("returns empty map for empty input", () => {
    expect(buildProjektSlugMap([])).toEqual({});
  });

  it("handles multiple projekte without collision", () => {
    const map = buildProjektSlugMap([
      projekt({ slug_de: "a", urlSlug: "a" }),
      projekt({ slug_de: "b", slug_fr: "b-fr", urlSlug: "b-fr" }),
      projekt({ slug_de: "c", urlSlug: "c" }),
    ]);
    expect(Object.keys(map)).toHaveLength(3);
    expect(map.b.urlSlug).toBe("b-fr");
    expect(map.a.urlSlug).toBe("a");
  });

  it("map-miss is expressible via undefined lookup (caller responsibility)", () => {
    const map = buildProjektSlugMap([projekt({ slug_de: "existing" })]);
    expect(map["deleted-or-hidden"]).toBeUndefined();
  });
});
