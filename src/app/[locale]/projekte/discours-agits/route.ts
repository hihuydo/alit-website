import { NextRequest, NextResponse } from "next/server";
import { locales, type Locale } from "@/i18n/config";
import { getSiteUrl } from "@/lib/site-url";

/**
 * GET /[locale]/projekte/discours-agits → 308 redirect onto the
 * canonical typo-fixed slug `/projekte/discours-agites`. Required (not
 * optional) because staging and prod share the DB: the schema
 * migration rewrites `slug_de` the moment ANY environment deploys,
 * while the other environment is still serving the old code. Without
 * this redirect, prod users would hit 404 on bookmarks and cached
 * crawls during the deploy window.
 *
 * Redirect target is built from SITE_URL, not `req.url` — the latter
 * resolves to the internal container origin behind nginx and would
 * produce a Location header pointing at an unreachable address.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale } = await params;
  const safeLocale: Locale = locales.includes(locale as Locale) ? (locale as Locale) : "de";
  const target = new URL(
    `/${safeLocale}/projekte/discours-agites`,
    getSiteUrl(),
  );
  return NextResponse.redirect(target, 308);
}
