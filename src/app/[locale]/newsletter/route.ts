import { NextRequest, NextResponse } from "next/server";
import { locales, type Locale } from "@/i18n/config";
import { getSiteUrl } from "@/lib/site-url";

/**
 * GET /[locale]/newsletter → 308 redirect onto the Discours-Agités
 * projekt page, with a hash anchor so the browser scrolls directly to
 * the embedded signup section. Single-project-scoped this sprint;
 * multi-project support would need this target to become dynamic.
 *
 * `req.url` resolves to the internal container origin (0.0.0.0:3000)
 * when Next.js sits behind nginx — using it as the `new URL` base sends
 * the browser to an unreachable address. Build the target against
 * SITE_URL (prod/staging-aware) to preserve the Public-URL in the
 * Location header. 308 (permanent, method-preserving) matches our
 * existing canonical redirect in `projekte/[slug]/page.tsx`.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale } = await params;
  const safeLocale: Locale = locales.includes(locale as Locale) ? (locale as Locale) : "de";
  const target = new URL(
    `/${safeLocale}/projekte/discours-agites#newsletter-signup`,
    getSiteUrl(),
  );
  return NextResponse.redirect(target, 308);
}
