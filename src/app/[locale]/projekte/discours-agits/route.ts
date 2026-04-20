import { NextRequest, NextResponse } from "next/server";
import { locales, type Locale } from "@/i18n/config";

/**
 * GET /[locale]/projekte/discours-agits → 308 redirect onto the
 * canonical typo-fixed slug `/projekte/discours-agites`. Required (not
 * optional) because staging and prod share the DB: the schema
 * migration rewrites `slug_de` the moment ANY environment deploys,
 * while the other environment is still serving the old code. Without
 * this redirect, prod users would hit 404 on bookmarks and cached
 * crawls during the deploy window.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale } = await params;
  const safeLocale: Locale = locales.includes(locale as Locale) ? (locale as Locale) : "de";
  const target = new URL(
    `/${safeLocale}/projekte/discours-agites`,
    req.url,
  );
  return NextResponse.redirect(target, 308);
}
