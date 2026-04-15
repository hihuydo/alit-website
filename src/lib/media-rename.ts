// Pure filename-rename logic for media renames. Extracted from the
// media PUT handler so it can be unit-tested without DB/auth coupling.

function sanitizeFilename(raw: string): string {
  return raw.trim().replace(/[^a-zA-Z0-9._-]/g, "_");
}

function extensionOf(filename: string): string {
  const idx = filename.lastIndexOf(".");
  if (idx <= 0 || idx === filename.length - 1) return "";
  return filename.slice(idx);
}

function extensionFromMime(mimeType: string): string {
  if (mimeType === "application/pdf") return ".pdf";
  if (mimeType === "application/zip" || mimeType === "application/x-zip-compressed") return ".zip";
  return "";
}

// Renames must preserve the original file extension — the filename is
// threaded into Content-Disposition on download, so losing or changing
// the extension would produce a misleading/unusable saved file.
// If the admin-supplied name already ends in the right extension, keep
// it; if they omit or use a different one, append the original (or one
// derived from mime_type when the original was extensionless).
// Returns "" for inputs that sanitize down to nothing usable (caller
// should reject with 400).
export function applyRename(original: string, mimeType: string, userInput: string): string {
  const clean = sanitizeFilename(userInput);
  if (!clean) return "";
  // Require at least one alphanumeric character somewhere — rejects inputs
  // like "." or "__" that otherwise pass the char allowlist but produce
  // nonsense filenames.
  if (!/[a-zA-Z0-9]/.test(clean)) return "";
  const ext = extensionOf(original) || extensionFromMime(mimeType);
  if (!ext) return clean; // nothing to preserve or derive (e.g. images)
  if (clean.toLowerCase().endsWith(ext.toLowerCase())) return clean;
  // Drop any extension the user typed (likely a different/typo one) and
  // append the authoritative extension.
  const base = clean.replace(/\.[^.]+$/, "");
  return `${base || clean}${ext}`;
}
