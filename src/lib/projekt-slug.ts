import type { Projekt } from "@/content/projekte";

// Resolves a hashtag's stable `projekt_slug` (= slug_de of the target
// projekt) to the locale-appropriate URL-slug. Public renderers
// (AgendaItem, JournalSidebar) look up the map per hashtag:
//
// - Map hit → render as <a href={/<locale>/projekte/<urlSlug>}>
// - Map miss → render as <span> without link (projekt is hidden in
//   this locale or was deleted; avoid linking to a guaranteed 404).
export type ProjektSlugEntry = {
  slug_de: string;
  slug_fr: string | null;
  urlSlug: string;
};

export type ProjektSlugMap = Record<string, ProjektSlugEntry>;

// Build the map keyed by slug_de — the stable ID that hashtags store.
// Input is the locale-resolved projekt list (so the map also encodes
// "visible in this locale": absent keys = hidden projekte).
export function buildProjektSlugMap(projekte: readonly Projekt[]): ProjektSlugMap {
  const map: ProjektSlugMap = {};
  for (const p of projekte) {
    map[p.slug_de] = {
      slug_de: p.slug_de,
      slug_fr: p.slug_fr,
      urlSlug: p.urlSlug,
    };
  }
  return map;
}
