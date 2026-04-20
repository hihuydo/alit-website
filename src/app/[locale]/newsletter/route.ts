import { NextRequest, NextResponse } from "next/server";
import { locales, type Locale } from "@/i18n/config";

/**
 * GET /[locale]/newsletter → 308 redirect onto the Discours-Agités
 * projekt page, with a hash anchor so the browser scrolls directly to
 * the embedded signup section. Single-project-scoped this sprint;
 * multi-project support would need this target to become dynamic.
 * 308 (permanent, method-preserving) matches our existing canonical
 * redirect in `projekte/[slug]/page.tsx`.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale } = await params;
  const safeLocale: Locale = locales.includes(locale as Locale) ? (locale as Locale) : "de";
  const target = new URL(
    `/${safeLocale}/projekte/discours-agites#newsletter-signup`,
    req.url,
  );
  return NextResponse.redirect(target, 308);
}
