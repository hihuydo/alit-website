import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { locales, type Locale } from "@/i18n/config";
import { getProjekte, getProjekteForSitemap } from "@/lib/queries";

// Resolve the slug against the locale-filtered projekt list so a
// DE-only projekt is notFound() on /fr and vice versa. This keeps
// routing consistent with panel-3's ProjekteList visibility — a user
// cannot deep-link to a projekt that doesn't appear on their locale's
// list. See spec §22 + invariant §6.
export default async function ProjektDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!locales.includes(locale as Locale)) notFound();

  const projekte = await getProjekte(locale as Locale);
  const match = projekte.find(
    (p) => p.slug_de === slug || (p.slug_fr !== null && p.slug_fr === slug),
  );
  if (!match) notFound();

  // Locale/slug canonicalization: if the URL-slug doesn't match the
  // projekt's urlSlug for this locale, 308-redirect. Covers:
  //   /fr/projekte/<slug_de> when slug_fr exists → /fr/projekte/<slug_fr>
  //   /de/projekte/<slug_fr> wrong-locale → /de/projekte/<slug_de>
  if (match.urlSlug !== slug) {
    permanentRedirect(`/${locale}/projekte/${match.urlSlug}`);
  }

  // Projekt expansion is rendered by Wrapper's ProjekteList (panel 3)
  // via useParams; this route just anchors the URL + metadata.
  return null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  // Use the locale-neutral helper so canonical/alternates resolve even
  // when the projekt has no content in the current locale (DE-only
  // projekte still get a valid `x-default` pointing at the DE URL).
  const rows = await getProjekteForSitemap();
  const row = rows.find(
    (r) => r.slug_de === slug || (r.slug_fr !== null && r.slug_fr === slug),
  );
  if (!row) return {};

  const frUrlSlug = row.slug_fr ?? row.slug_de;
  const canonicalSlug = locale === "fr" ? frUrlSlug : row.slug_de;
  return {
    alternates: {
      canonical: `/${locale}/projekte/${canonicalSlug}`,
      languages: {
        de: `/de/projekte/${row.slug_de}`,
        // Emit FR alternate only if the projekt actually has an FR alias
        // or FR content — otherwise Google sees a fake hreflang pointing
        // at the DE URL (see spec §31). We still resolve FR to slug_de
        // when fr_content exists without slug_fr (FR rendering with
        // DE-fallback text is legitimate).
        ...((row.slug_fr !== null || row.has_fr)
          ? { fr: `/fr/projekte/${frUrlSlug}` }
          : {}),
        "x-default": `/de/projekte/${row.slug_de}`,
      },
    },
  };
}
