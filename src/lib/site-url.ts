// Canonical site URL for SEO metadata (metadataBase, sitemap, canonical/alternate URLs).
// Server-only — do NOT use NEXT_PUBLIC_* here (Runtime-Config, nicht Build-Time-Inline).
// Staging override via env SITE_URL=https://staging.alit.hihuydo.com.

const DEFAULT_SITE_URL = "https://alit.hihuydo.com";

export function getSiteUrl(): URL {
  const raw = process.env.SITE_URL?.trim();
  const value = raw && raw.length > 0 ? raw : DEFAULT_SITE_URL;
  return new URL(value);
}
