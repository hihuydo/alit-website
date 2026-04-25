import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "./lib/auth-cookie";
import { buildCspPolicy, generateNonce } from "./lib/csp";

/**
 * Proxy (formerly Next.js middleware) combining dashboard auth-guard with
 * the Sprint D1 CSP Report-Only baseline. Renamed from middleware.ts per
 * Next.js 16 file-convention (build warning
 * https://nextjs.org/docs/messages/middleware-to-proxy). The exported
 * function name must match the filename, so `proxy` here instead of the
 * old `middleware`.
 *
 * SEQUENCE (order matters — see spec.md v3 §Architecture Decisions):
 *
 *   1. Auth decision (fail-closed, outside any try/catch). If the request
 *      targets a protected dashboard path without a valid session, we
 *      construct the login redirect now. No CSP headers propagate onto
 *      redirects via request headers — redirect responses don't carry
 *      framework hydration scripts, so nonce propagation is moot.
 *
 *   2. CSP decoration (fail-open, inner try/catch). For pass-through
 *      requests we CONSTRUCT the NextResponse via
 *      `NextResponse.next({ request: { headers: newHeaders } })` so that
 *      the x-nonce and Content-Security-Policy request headers reach
 *      Server Components + the framework-script-nonce-auto-injection
 *      step (Next.js 16.2.4 source:
 *      `node_modules/next/dist/server/app-render/app-render.js:166`
 *      reads `csp = headers['content-security-policy']
 *                    || headers['content-security-policy-report-only']`).
 *      The browser only ever sees the Response-side Report-Only header;
 *      enforcement comes with the D2 flip.
 *
 *   3. Fail-open on CSP errors keeps auth decisions unaffected: if
 *      generateNonce or header composition throws, the already-decided
 *      response (redirect or pass-through) is still returned, just
 *      without CSP headers. Auth is NEVER weakened by a CSP bug.
 *
 * Matcher: narrow to document requests only. `/api/*` is broad-excluded
 * because CSP on JSON/binary responses is semantically moot and would
 * couple every API change to CSP surface. Prefetch requests are excluded
 * via the `missing` guards so warm-nav optimizations don't burn nonces.
 */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Auth decision — fail-closed, outside any try/catch.
  let response: NextResponse | null = null;

  const isDashboardRoute =
    pathname.startsWith("/dashboard") &&
    pathname !== "/dashboard/login" &&
    pathname !== "/dashboard/login/";

  if (isDashboardRoute) {
    const session = await verifySession(req);
    if (!session) {
      response = NextResponse.redirect(new URL("/dashboard/login/", req.url));
    }
  }

  // 2. CSP decoration — fail-open, isolated try/catch.
  try {
    const nonce = generateNonce();
    const policy = buildCspPolicy(nonce);

    if (response === null) {
      // Pass-through: construct NextResponse with request-header injection
      // so Next.js extracts the nonce for framework scripts.
      const requestHeaders = new Headers(req.headers);
      requestHeaders.set("x-nonce", nonce);
      requestHeaders.set("Content-Security-Policy", policy);
      response = NextResponse.next({ request: { headers: requestHeaders } });
    }

    response.headers.set("Content-Security-Policy-Report-Only", policy);
    response.headers.set(
      "Reporting-Endpoints",
      'csp-endpoint="/api/csp-report/"',
    );
  } catch (err) {
    console.error("[proxy] CSP decoration failed", err);
    if (response === null) {
      response = NextResponse.next();
    }
    // Auth response already decided — stays intact without CSP headers.
  }

  return response;
}

export const config = {
  matcher: [
    {
      // Exclude non-document paths:
      //  - `_next/static`, `_next/image`, `api`, `fonts`  — framework + dynamic
      //  - `favicon.ico`                                   — anchored file
      //  - `.+\.[^/]+$`                                    — any path ending in a file
      //    extension (e.g. `/journal/foo.png`, `/robots.txt`, `/sitemap.xml`).
      //    App routes end with trailing slash in this project (`trailingSlash:
      //    true`), so they never match `[^/]+$` and are not excluded.
      source:
        "/((?!_next/static(?:/|$)|_next/image(?:/|$)|api(?:/|$)|fonts(?:/|$)|favicon\\.ico$|.+\\.[^/]+$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
