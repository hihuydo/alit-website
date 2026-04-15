import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";
import { getProjekteForSitemap, type ProjektSitemapRow } from "@/lib/queries";

// DB-backed: slugs are admin-editable so the sitemap must re-evaluate
// on every request rather than being cached at build-time.
export const dynamic = "force-dynamic";

const STATIC_PATHS = ["/", "/projekte", "/alit", "/newsletter", "/mitgliedschaft"] as const;

// Pure, injectable helper — consumers (sitemap() and tests) pass rows +
// base and get back the sitemap array. Keeps the file testable without
// Next-runtime infrastructure.
export function buildSitemap(rows: readonly ProjektSitemapRow[], base: URL): MetadataRoute.Sitemap {
  const abs = (path: string) => new URL(path, base).toString();
  const out: MetadataRoute.Sitemap = [];

  // Static routes: always emit both locales with hreflang pair.
  for (const path of STATIC_PATHS) {
    for (const locale of ["de", "fr"] as const) {
      out.push({
        url: abs(`/${locale}${path}`),
        alternates: {
          languages: {
            de: abs(`/de${path}`),
            fr: abs(`/fr${path}`),
            "x-default": abs(`/de${path}`),
          },
        },
      });
    }
  }

  // Projekt detail pages: emit-rule from spec §31.
  //   - DE content + (FR content || slug_fr set) → 2 entries w/ both langs
  //   - DE content only                          → 1 DE entry, no FR alternate
  //   - no DE content                            → skip (not listed on /de)
  for (const r of rows) {
    if (!r.has_de_content) continue;
    const dePath = `/de/projekte/${r.slug_de}`;
    const hasFr = r.slug_fr !== null || r.has_fr_content;
    if (hasFr) {
      const frUrlSlug = r.slug_fr ?? r.slug_de;
      const frPath = `/fr/projekte/${frUrlSlug}`;
      const languages = {
        de: abs(dePath),
        fr: abs(frPath),
        "x-default": abs(dePath),
      };
      out.push({ url: abs(dePath), alternates: { languages } });
      out.push({ url: abs(frPath), alternates: { languages } });
    } else {
      // DE-only — no fake FR alternate (Google-best-practice).
      out.push({
        url: abs(dePath),
        alternates: {
          languages: {
            de: abs(dePath),
            "x-default": abs(dePath),
          },
        },
      });
    }
  }

  return out;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const rows = await getProjekteForSitemap();
  return buildSitemap(rows, getSiteUrl());
}
