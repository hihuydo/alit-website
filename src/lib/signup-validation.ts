const MAX_LEN = 200;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (v.length === 0 || v.length > MAX_LEN) return null;
  if (!EMAIL_RE.test(v)) return null;
  return v;
}

function str(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (v.length === 0 || v.length > MAX_LEN) return null;
  return v;
}

export interface NewsletterPayload {
  vorname: string;
  nachname: string;
  woher: string;
  email: string;
}

export interface MembershipPayload {
  vorname: string;
  nachname: string;
  strasse: string;
  nr: string;
  plz: string;
  stadt: string;
  email: string;
  newsletter_opt_in: boolean;
}

// Honeypot field name. Must not collide with any common browser autofill
// target ("company", "organization", "url", "website", "address-line-*" all
// get filled from user profiles → silent data loss for real users).
// Project-prefixed, non-semantic, stable for form↔API coordination.
export const HONEYPOT_FIELD = "alit_hp_field";

export function isHoneypotTriggered(body: Record<string, unknown>): boolean {
  const v = body[HONEYPOT_FIELD];
  return typeof v === "string" && v.trim().length > 0;
}

export function hasConsent(body: Record<string, unknown>): boolean {
  return body.consent === true;
}

export function validateNewsletter(
  body: Record<string, unknown>,
): NewsletterPayload | null {
  const vorname = str(body.vorname);
  const nachname = str(body.nachname);
  const woher = str(body.woher);
  const email = normalizeEmail(body.email);
  if (!vorname || !nachname || !woher || !email) return null;
  return { vorname, nachname, woher, email };
}

export function validateMembership(
  body: Record<string, unknown>,
): MembershipPayload | null {
  const vorname = str(body.vorname);
  const nachname = str(body.nachname);
  const strasse = str(body.strasse);
  const nr = str(body.nr);
  const plz = str(body.plz);
  const stadt = str(body.stadt);
  const email = normalizeEmail(body.email);
  if (!vorname || !nachname || !strasse || !nr || !plz || !stadt || !email) {
    return null;
  }
  return {
    vorname,
    nachname,
    strasse,
    nr,
    plz,
    stadt,
    email,
    newsletter_opt_in: body.newsletter_opt_in === true,
  };
}
