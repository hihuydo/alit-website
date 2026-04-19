/**
 * Edge-safe CSP helpers — Sprint D1 Report-Only baseline.
 *
 * Phase-0 recon (2026-04-19, Next.js 16.2.4 source):
 *   node_modules/next/dist/server/app-render/app-render.js:166
 *     const csp = headers['content-security-policy']
 *              || headers['content-security-policy-report-only'];
 *
 * Next.js 16 reads the nonce from EITHER Content-Security-Policy OR
 * Content-Security-Policy-Report-Only request-header (enforced takes
 * precedence via short-circuit). This sprint sets request-side enforced +
 * response-side Report-Only so framework scripts still get a nonce while
 * the browser only reports violations. D2 flips the response header name
 * from "-Report-Only" to enforced — request header stays unchanged.
 *
 * MUST remain edge-safe (consumed by src/middleware.ts in the Edge
 * Runtime): no pg / bcryptjs / ./db / ./audit / ./auth / ./cookie-counter
 * imports. A file-content self-grep in csp.test.ts fails the build if a
 * regression is introduced.
 */

/**
 * Trailing slash is REQUIRED — this project sets `trailingSlash: true`
 * in next.config.ts, so `/api/csp-report` (no slash) returns a 308
 * permanent-redirect. Browsers do not reliably follow 308s with POST
 * bodies; violation reports would be silently dropped. Always use the
 * canonical path here and in the Reporting-Endpoints header in middleware.ts.
 */
export const CSP_REPORT_ENDPOINT = "/api/csp-report/";

/**
 * Ordered directive names. Used for normalized policy-structure tests.
 * Order MUST match the `buildCspPolicy` output — tests verify this.
 */
export const CSP_DIRECTIVES = [
  "default-src",
  "script-src",
  "style-src",
  "img-src",
  "font-src",
  "connect-src",
  "frame-src",
  "media-src",
  "object-src",
  "base-uri",
  "form-action",
  "frame-ancestors",
  "report-uri",
  "report-to",
] as const;

export interface CspViolation {
  blocked_uri: string;
  violated_directive: string;
  source_file: string;
  line_number: number;
  referrer: string;
}

/**
 * Cryptographically random 128-bit nonce, base64-encoded.
 * Edge-Runtime compatible (no Node Buffer).
 */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/**
 * Build the full CSP policy string with the given nonce interpolated into
 * script-src. Order matches CSP_DIRECTIVES. Returns a semicolon-separated
 * string, no trailing semicolon (browsers tolerate either).
 *
 * 'strict-dynamic' is ignored by browsers that don't support it; they
 * fall back to the explicit source list ('self' 'nonce-...').
 */
export function buildCspPolicy(nonce: string): string {
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self'`,
    `connect-src 'self'`,
    `frame-src 'self' https://www.youtube.com https://player.vimeo.com`,
    `media-src 'self' blob:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `report-uri ${CSP_REPORT_ENDPOINT}`,
    `report-to csp-endpoint`,
  ].join("; ");
}

/**
 * Normalize a CSP violation report body into the internal shape. Handles
 * both legacy (`application/csp-report`, Firefox/Safari) and modern
 * (`application/reports+json`, Chrome/Edge) formats. Silently filters
 * non-csp-violation reports (deprecation/intervention/etc.) and returns
 * an empty array for malformed input. Returns an array so modern batches
 * can produce N log lines.
 */
export function normalizeCspReport(
  body: unknown,
  contentType: string,
): CspViolation[] {
  const ct = contentType.toLowerCase();

  if (ct.startsWith("application/csp-report")) {
    return extractLegacy(body);
  }

  if (ct.startsWith("application/reports+json")) {
    return extractModern(body);
  }

  if (ct.startsWith("application/json")) {
    const asLegacy = extractLegacy(body);
    if (asLegacy.length > 0) return asLegacy;
    return extractModern(body);
  }

  return [];
}

function extractLegacy(body: unknown): CspViolation[] {
  if (!isPlainObject(body)) return [];
  const report = body["csp-report"];
  if (!isPlainObject(report)) return [];
  return [mapLegacyReport(report)];
}

function extractModern(body: unknown): CspViolation[] {
  if (!Array.isArray(body)) return [];
  const out: CspViolation[] = [];
  for (const entry of body) {
    if (!isPlainObject(entry)) continue;
    if (entry.type !== "csp-violation") continue;
    const eBody = entry.body;
    if (!isPlainObject(eBody)) continue;
    out.push(mapModernReport(eBody));
  }
  return out;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asNumber(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function mapLegacyReport(r: Record<string, unknown>): CspViolation {
  return {
    blocked_uri: asString(r["blocked-uri"]),
    violated_directive: asString(r["violated-directive"]),
    source_file: asString(r["source-file"]),
    line_number: asNumber(r["line-number"]),
    referrer: asString(r.referrer),
  };
}

function mapModernReport(b: Record<string, unknown>): CspViolation {
  return {
    blocked_uri: asString(b.blockedURL),
    violated_directive: asString(b.effectiveDirective),
    source_file: asString(b.sourceFile),
    line_number: asNumber(b.lineNumber),
    referrer: asString(b.referrer),
  };
}
