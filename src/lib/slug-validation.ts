// Canonical slug format for projekte URLs.
// - lowercase ASCII letters + digits
// - hyphen-separated segments (no leading, trailing, or doubled hyphens)
// - length 1-100 characters
//
// Matches the existing live slugs on alit.ch (e.g. "essais-agites",
// "weltenliteratur", "unsere-schweiz") and stays URL-safe without
// needing encoding in pathnames, sitemaps, or Content-Disposition.

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_LEN = 100;

export function validateSlug(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length === 0 || value.length > MAX_LEN) return false;
  return SLUG_RE.test(value);
}
