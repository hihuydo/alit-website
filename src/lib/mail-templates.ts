// Mail templates + interpolation + render — pure module, no I/O.
// All defaults are hard-coded constants (M2a). Editor-driven overrides
// (M2b) will replace these via DB-merge — until then this file is the
// single source of truth.

import type { Locale } from "@/i18n/config";

export const MAIL_TYPES = [
  "member_confirmation_user",
  "member_notify_admin",
  "newsletter_confirmation_user",
  "newsletter_notify_admin",
] as const;
export type MailType = (typeof MAIL_TYPES)[number];

export type MailTemplate = { subject: string; intro: string };

// Form-Daten Interfaces — die Felder die in Templates interpoliert werden können
// und die in der admin-notify Form-Tabelle gerendert werden.
export interface MembershipFormData {
  vorname: string;
  nachname: string;
  strasse: string;
  nr: string;
  plz: string;
  stadt: string;
  email: string;
}

export interface NewsletterFormData {
  vorname: string;
  nachname: string;
  woher: string;
  email: string;
}

export type SignupKind = "membership" | "newsletter";
export type RecipientKind = "user" | "admin";

/**
 * Pure helper: maps (signupKind, recipientKind) → MailType.
 * (membership, user) → "member_confirmation_user"
 * (membership, admin) → "member_notify_admin"
 * (newsletter, user) → "newsletter_confirmation_user"
 * (newsletter, admin) → "newsletter_notify_admin"
 */
export function mailTypeFor(
  signupKind: SignupKind,
  recipientKind: RecipientKind,
): MailType {
  if (signupKind === "membership") {
    return recipientKind === "user"
      ? "member_confirmation_user"
      : "member_notify_admin";
  }
  return recipientKind === "user"
    ? "newsletter_confirmation_user"
    : "newsletter_notify_admin";
}

// 8 hand-crafted defaults from spec.md §M2a-B (R3 Option C wording for
// member_confirmation: non-auto-activation, post-payment confirmation).
export const DEFAULT_TEMPLATES: Record<MailType, Record<Locale, MailTemplate>> = {
  member_confirmation_user: {
    de: {
      subject: "Anmeldung bei alit erhalten",
      intro:
        "Liebe/r {{vorname}},\n\n" +
        "wir haben Deine Anmeldung als Mitglied erhalten. In Kürze melden wir uns persönlich mit den Bankdaten für die Mitgliedsbeitragsüberweisung. Nach Eingang Deiner Zahlung bestätigen wir Dir Deine Mitgliedschaft im Netzwerk für Literatur*en.\n\n" +
        "Bei Fragen erreichst Du uns unter info@alit.ch.\n\n" +
        "Herzlich\n" +
        "alit",
    },
    fr: {
      subject: "Demande d'adhésion reçue par alit",
      intro:
        "Cher·ère {{vorname}},\n\n" +
        "nous avons bien reçu ta demande d'adhésion. Nous te contacterons sous peu personnellement avec les coordonnées bancaires pour le virement de la cotisation. Dès la réception de ton paiement, nous te confirmerons ton adhésion au réseau pour les littératures.\n\n" +
        "Pour toute question : info@alit.ch.\n\n" +
        "Cordialement\n" +
        "alit",
    },
  },
  member_notify_admin: {
    de: {
      subject: "Neue Mitgliedschafts-Anmeldung: {{vorname}} {{nachname}}",
      intro: "Eine neue Anmeldung für eine Mitgliedschaft ist eingegangen.",
    },
    fr: {
      subject: "Nouvelle demande d'adhésion : {{vorname}} {{nachname}}",
      intro: "Une nouvelle demande d'adhésion a été reçue.",
    },
  },
  newsletter_confirmation_user: {
    de: {
      subject: "Newsletter-Anmeldung bei alit",
      intro:
        "Liebe/r {{vorname}},\n\n" +
        "Du bist nun für den alit-Newsletter angemeldet. Wir freuen uns, Dich gelegentlich mit Neuigkeiten aus dem Netzwerk für Literatur*en zu versorgen.\n\n" +
        "Falls Du Dich nicht bewusst angemeldet hast, antworte einfach auf diese Mail — wir nehmen Dich raus.\n\n" +
        "Herzlich\n" +
        "alit",
    },
    fr: {
      subject: "Inscription à la newsletter alit",
      intro:
        "Cher·ère {{vorname}},\n\n" +
        "tu es maintenant inscrit·e à la newsletter d'alit. Nous nous réjouissons de te tenir informé·e des nouvelles du réseau pour les littératures.\n\n" +
        "Si tu ne t'es pas inscrit·e volontairement, réponds simplement à ce mail — nous te retirerons de la liste.\n\n" +
        "Cordialement\n" +
        "alit",
    },
  },
  newsletter_notify_admin: {
    de: {
      subject: "Neue Newsletter-Anmeldung: {{vorname}} {{nachname}}",
      intro: "Eine neue Newsletter-Anmeldung ist eingegangen.",
    },
    fr: {
      subject: "Nouvelle inscription newsletter : {{vorname}} {{nachname}}",
      intro: "Une nouvelle inscription à la newsletter a été reçue.",
    },
  },
};

/**
 * Strict allow-list interpolation for `{{key}}` mustache placeholders.
 * Unknown placeholders (e.g. `{{voname}}` typo) stay LITERAL in the output —
 * sichtbares typo-signal statt silent-strip. HTML-escaping ist NICHT in dieser
 * Funktion — caller (renderMailFromTemplate) escaped vars vor Interpolation.
 */
export function interpolate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) {
      return vars[key];
    }
    return match;
  });
}

/**
 * Pure HTML-escape for the 5 char-classes that matter in HTML body context.
 * NOT idempotent — `<` → `&lt;`, dann `&lt;` → `&amp;lt;`. Caller must pass
 * raw values exactly once.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeFormData<T extends Record<string, string>>(formData: T): T {
  const out = {} as Record<string, string>;
  for (const k of Object.keys(formData)) {
    out[k] = escapeHtml(formData[k]);
  }
  return out as T;
}

interface RenderInput {
  kind: MailType;
  locale: Locale;
  template: MailTemplate;
  formData: MembershipFormData | NewsletterFormData;
}

interface RenderOutput {
  subject: string;
  text: string;
  html: string;
}

const HTML_FOOTER = "alit — netzwerk für literatur*en";

/**
 * Render a mail from its template + form-data into {subject, text, html}.
 *
 * Escape-rules (R3-User-Review #2 + #3):
 * - Subject: NEVER escaped (RFC 2047 plain-text header). Same string for
 *   text and html outputs.
 * - Plaintext body: raw formData throughout (Plaintext non-executing).
 * - HTML body: intro interpolated with escapeHtml-mapped formData. Form-table
 *   cells (admin-notify only) are built from RAW formData and escaped exactly
 *   once via `escapeHtml(formData.field)` per cell — escapeHtml is NOT
 *   idempotent.
 */
export function renderMailFromTemplate(input: RenderInput): RenderOutput {
  const { kind, template, formData } = input;
  const isAdmin = kind === "member_notify_admin" || kind === "newsletter_notify_admin";
  const isMembership = kind === "member_confirmation_user" || kind === "member_notify_admin";

  const formDataRaw = formData as unknown as Record<string, string>;
  const formDataEscaped = escapeFormData(formDataRaw);

  // Subject is plain-text RFC 2047, never HTML-escaped.
  const subject = interpolate(template.subject, formDataRaw);

  // Plaintext body — raw values throughout.
  const introText = interpolate(template.intro, formDataRaw);
  const formTableText = isAdmin ? renderFormTableText(formData, isMembership) : "";
  const text = formTableText ? `${introText}\n\n${formTableText}\n` : `${introText}\n`;

  // HTML body — intro uses escaped vars; form-table cells escape raw formData
  // exactly once (escapeHtml is NOT idempotent).
  const introHtmlInterp = interpolate(template.intro, formDataEscaped);
  const introHtml = introHtmlInterp.replace(/\n/g, "<br/>");
  const formTableHtml = isAdmin ? renderFormTableHtml(formData, isMembership) : "";
  const html =
    `<!doctype html><html><body>` +
    `<div style="font:15px sans-serif; max-width:560px; margin:auto">` +
    `<p>${introHtml}</p>` +
    formTableHtml +
    `<hr/>` +
    `<p style="font-size:12px; color:#666">${HTML_FOOTER}</p>` +
    `</div></body></html>`;

  return { subject, text, html };
}

function renderFormTableText(
  formData: MembershipFormData | NewsletterFormData,
  isMembership: boolean,
): string {
  if (isMembership) {
    const m = formData as MembershipFormData;
    return [
      `Vorname:\t${m.vorname}`,
      `Nachname:\t${m.nachname}`,
      `Strasse:\t${m.strasse} ${m.nr}`,
      `PLZ Stadt:\t${m.plz} ${m.stadt}`,
      `Email:\t${m.email}`,
    ].join("\n");
  }
  const n = formData as NewsletterFormData;
  return [
    `Vorname:\t${n.vorname}`,
    `Nachname:\t${n.nachname}`,
    `Wie/Woher:\t${n.woher}`,
    `Email:\t${n.email}`,
  ].join("\n");
}

function renderFormTableHtml(
  formData: MembershipFormData | NewsletterFormData,
  isMembership: boolean,
): string {
  // Form-table cells read RAW formData and escape exactly once.
  // Doppel-escape ist NICHT idempotent → Bug für Werte mit `&`/`<`.
  const cell = (label: string, raw: string) =>
    `<tr><td style="padding:4px 8px 4px 0; color:#666">${escapeHtml(label)}</td>` +
    `<td style="padding:4px 0">${escapeHtml(raw)}</td></tr>`;

  const rows: string[] = [];
  if (isMembership) {
    const m = formData as MembershipFormData;
    rows.push(cell("Vorname", m.vorname));
    rows.push(cell("Nachname", m.nachname));
    rows.push(cell("Strasse", `${m.strasse} ${m.nr}`));
    rows.push(cell("PLZ Stadt", `${m.plz} ${m.stadt}`));
    rows.push(cell("Email", m.email));
  } else {
    const n = formData as NewsletterFormData;
    rows.push(cell("Vorname", n.vorname));
    rows.push(cell("Nachname", n.nachname));
    rows.push(cell("Wie/Woher", n.woher));
    rows.push(cell("Email", n.email));
  }
  return `<table style="border-collapse:collapse; margin:16px 0; font-size:14px"><tbody>${rows.join("")}</tbody></table>`;
}
