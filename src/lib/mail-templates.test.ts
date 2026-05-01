// Tests for src/lib/mail-templates.ts — pure module, no I/O.
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  DEFAULT_TEMPLATES,
  MAIL_TYPES,
  escapeHtml,
  interpolate,
  mailTypeFor,
  renderMailFromTemplate,
  type MembershipFormData,
  type NewsletterFormData,
} from "./mail-templates";

const memberFormData: MembershipFormData = {
  vorname: "Anna",
  nachname: "Müller",
  strasse: "Bahnhofstrasse",
  nr: "12",
  plz: "8001",
  stadt: "Zürich",
  email: "anna@example.com",
};

const newsletterFormData: NewsletterFormData = {
  vorname: "Anna",
  nachname: "Müller",
  woher: "Empfehlung",
  email: "anna@example.com",
};

describe("mail-templates — purity", () => {
  it("source has no I/O imports (pure module)", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "mail-templates.ts"),
      "utf-8",
    );
    const forbidden = [
      /from ["']\.\/db["']/,
      /from ["']\.\/audit["']/,
      /from ["']\.\/mail["']/, // templates module must not pull in transport
      /from ["']pg["']/,
      /from ["']node:fs["']/,
      /from ["']node:net["']/,
      /from ["']node:https["']/,
      /from ["']nodemailer["']/,
    ];
    for (const re of forbidden) {
      expect(source).not.toMatch(re);
    }
  });
});

describe("mail-templates — interpolate (strict allow-list)", () => {
  it("replaces known {{key}} placeholders", () => {
    expect(interpolate("Hallo {{vorname}}", { vorname: "Anna" })).toBe("Hallo Anna");
  });

  it("leaves unknown {{key}} placeholders LITERAL (typo-signal, R3 Decision-D)", () => {
    expect(interpolate("Hallo {{voname}}", {})).toBe("Hallo {{voname}}");
  });

  it("interpolates multiple distinct placeholders", () => {
    expect(
      interpolate("{{vorname}} {{nachname}}", { vorname: "Anna", nachname: "Müller" }),
    ).toBe("Anna Müller");
  });

  it("does NOT touch [SQUARE_BRACKETS] (R3 disambiguation — only mustache syntax)", () => {
    expect(interpolate("Pay: [WHATEVER]", {})).toBe("Pay: [WHATEVER]");
  });

  it("repeats same placeholder multiple times", () => {
    expect(
      interpolate("{{vorname}} und {{vorname}}", { vorname: "Anna" }),
    ).toBe("Anna und Anna");
  });
});

describe("mail-templates — escapeHtml", () => {
  it("escapes the 5 char-classes", () => {
    expect(escapeHtml("&")).toBe("&amp;");
    expect(escapeHtml("<")).toBe("&lt;");
    expect(escapeHtml(">")).toBe("&gt;");
    expect(escapeHtml('"')).toBe("&quot;");
    expect(escapeHtml("'")).toBe("&#39;");
  });

  it("escapes XSS payload", () => {
    expect(escapeHtml("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;",
    );
  });

  it("is NOT idempotent (R3-User-Review #2): &lt; → &amp;lt; on second pass", () => {
    expect(escapeHtml(escapeHtml("<"))).toBe("&amp;lt;");
  });
});

describe("mail-templates — mailTypeFor", () => {
  it("maps (membership, user) → member_confirmation_user", () => {
    expect(mailTypeFor("membership", "user")).toBe("member_confirmation_user");
  });
  it("maps (membership, admin) → member_notify_admin", () => {
    expect(mailTypeFor("membership", "admin")).toBe("member_notify_admin");
  });
  it("maps (newsletter, user) → newsletter_confirmation_user", () => {
    expect(mailTypeFor("newsletter", "user")).toBe("newsletter_confirmation_user");
  });
  it("maps (newsletter, admin) → newsletter_notify_admin", () => {
    expect(mailTypeFor("newsletter", "admin")).toBe("newsletter_notify_admin");
  });
});

describe("mail-templates — DEFAULT_TEMPLATES content fidelity", () => {
  it("has all 4 mail-types × 2 locales = 8 templates", () => {
    for (const type of MAIL_TYPES) {
      expect(DEFAULT_TEMPLATES[type].de).toBeDefined();
      expect(DEFAULT_TEMPLATES[type].fr).toBeDefined();
    }
  });

  it("member_confirmation_user.de uses Option-C non-auto-activation wording", () => {
    const intro = DEFAULT_TEMPLATES.member_confirmation_user.de.intro;
    // Asserts neutral wording — promises post-payment confirmation, not auto-activation.
    expect(intro).toContain("Nach Eingang Deiner Zahlung bestätigen wir Dir Deine Mitgliedschaft");
    // Anti-regression: no auto-activation contract-language.
    expect(intro).not.toContain("bist Du Mitglied im");
  });

  it("member_confirmation_user.fr uses Option-C non-auto-activation wording", () => {
    const intro = DEFAULT_TEMPLATES.member_confirmation_user.fr.intro;
    expect(intro).toContain("nous te confirmerons ton adhésion");
    expect(intro).not.toContain("tu seras membre du");
  });

  it("member_confirmation_user.de does NOT contain bank details (R4 user-direktive)", () => {
    const intro = DEFAULT_TEMPLATES.member_confirmation_user.de.intro;
    expect(intro).not.toMatch(/IBAN|CH\d{2}|Konto-Nr|Konto Nr/i);
    // Mentions "Bankdaten" but only as "wir melden uns mit den Bankdaten" — no actual data.
    expect(intro).toContain("Bankdaten");
  });

  it("admin-notify subjects use {{vorname}} {{nachname}} interpolation", () => {
    expect(DEFAULT_TEMPLATES.member_notify_admin.de.subject).toContain("{{vorname}}");
    expect(DEFAULT_TEMPLATES.member_notify_admin.de.subject).toContain("{{nachname}}");
    expect(DEFAULT_TEMPLATES.newsletter_notify_admin.fr.subject).toContain("{{vorname}}");
  });

  it("user-confirmation subjects do NOT contain interpolation placeholders", () => {
    expect(DEFAULT_TEMPLATES.member_confirmation_user.de.subject).not.toMatch(/\{\{/);
    expect(DEFAULT_TEMPLATES.newsletter_confirmation_user.fr.subject).not.toMatch(/\{\{/);
  });
});

describe("mail-templates — renderMailFromTemplate (8 default-templates structural)", () => {
  it.each(MAIL_TYPES)(
    "renders %s for both locales without throwing",
    (kind) => {
      for (const locale of ["de", "fr"] as const) {
        const isMember = kind.startsWith("member");
        const formData = isMember ? memberFormData : newsletterFormData;
        const result = renderMailFromTemplate({
          kind,
          locale,
          template: DEFAULT_TEMPLATES[kind][locale],
          formData,
        });
        expect(result.subject).toBeTruthy();
        expect(result.text).toBeTruthy();
        expect(result.html.startsWith("<!doctype html>")).toBe(true);
        expect(result.html.endsWith("</html>")).toBe(true);
        expect(result.html).toContain("alit — netzwerk für literatur*en");
      }
    },
  );

  it("admin-notify Mitgliedschaft contains all 5 form-table fields in HTML", () => {
    const result = renderMailFromTemplate({
      kind: "member_notify_admin",
      locale: "de",
      template: DEFAULT_TEMPLATES.member_notify_admin.de,
      formData: memberFormData,
    });
    expect(result.html).toContain("Vorname");
    expect(result.html).toContain("Nachname");
    expect(result.html).toContain("Strasse");
    expect(result.html).toContain("PLZ Stadt");
    expect(result.html).toContain("Email");
    expect(result.html).toContain("Anna");
    expect(result.html).toContain("Müller");
    expect(result.html).toContain("Bahnhofstrasse 12");
    expect(result.html).toContain("8001 Zürich");
  });

  it("admin-notify Newsletter contains all 4 form-table fields in HTML", () => {
    const result = renderMailFromTemplate({
      kind: "newsletter_notify_admin",
      locale: "de",
      template: DEFAULT_TEMPLATES.newsletter_notify_admin.de,
      formData: newsletterFormData,
    });
    expect(result.html).toContain("Vorname");
    expect(result.html).toContain("Nachname");
    expect(result.html).toContain("Wie/Woher");
    expect(result.html).toContain("Email");
    expect(result.html).toContain("Empfehlung");
  });

  it("user-confirmation has NO form-table HTML structure", () => {
    const result = renderMailFromTemplate({
      kind: "member_confirmation_user",
      locale: "de",
      template: DEFAULT_TEMPLATES.member_confirmation_user.de,
      formData: memberFormData,
    });
    expect(result.html).not.toContain("<table");
    expect(result.text).not.toContain("Vorname:\t");
  });
});

describe("mail-templates — XSS roundtrip + escaping", () => {
  it("HTML body escapes <script> in vorname; plaintext keeps raw", () => {
    const xss: MembershipFormData = {
      ...memberFormData,
      vorname: "<script>alert(1)</script>",
    };
    const result = renderMailFromTemplate({
      kind: "member_confirmation_user",
      locale: "de",
      template: DEFAULT_TEMPLATES.member_confirmation_user.de,
      formData: xss,
    });
    // HTML escaped
    expect(result.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(result.html).not.toContain("<script>alert(1)</script>");
    // Plaintext raw (Plaintext non-executing)
    expect(result.text).toContain("<script>alert(1)</script>");
  });

  it("Subject NEVER escaped — 'O' Brien' stays raw with apostrophe (R3-User-Review #3)", () => {
    const data: MembershipFormData = {
      ...memberFormData,
      vorname: "Anna",
      nachname: "O'Brien",
    };
    const result = renderMailFromTemplate({
      kind: "member_notify_admin",
      locale: "de",
      template: DEFAULT_TEMPLATES.member_notify_admin.de,
      formData: data,
    });
    // Subject MUST be raw (RFC 2047 plain-text header).
    expect(result.subject).toContain("O'Brien");
    expect(result.subject).not.toContain("O&#39;Brien");
  });

  it("Body assertion split: text raw, html escaped, no raw apostrophe in html (R3-User-Review #3)", () => {
    const data: MembershipFormData = {
      ...memberFormData,
      vorname: "Anna",
      nachname: "O'Brien",
    };
    const result = renderMailFromTemplate({
      kind: "member_notify_admin",
      locale: "de",
      template: DEFAULT_TEMPLATES.member_notify_admin.de,
      formData: data,
    });
    // Text-body raw apostrophe
    expect(result.text).toContain("O'Brien");
    // HTML-body escaped — no raw apostrophe in form-table-cell rendering
    expect(result.html).toContain("O&#39;Brien");
    // Anti-regression: html does NOT contain the form-table-row's raw apostrophe.
    // (Subject is in `result.subject` field, not concatenated into html.)
    const htmlBodyOnly = result.html;
    expect(htmlBodyOnly.match(/O'Brien/g)).toBeNull();
  });

  it("Anti-double-escape (R4-User-Review-2 #2) — Membership nachname with & and <", () => {
    const data: MembershipFormData = {
      ...memberFormData,
      nachname: "AT&T <Niederlassung>",
    };
    const result = renderMailFromTemplate({
      kind: "member_notify_admin",
      locale: "de",
      template: DEFAULT_TEMPLATES.member_notify_admin.de,
      formData: data,
    });
    // Single-escape (correct).
    expect(result.html).toContain("AT&amp;T &lt;Niederlassung&gt;");
    // Double-escape would produce these — assert NOT present.
    expect(result.html).not.toContain("AT&amp;amp;T");
    expect(result.html).not.toContain("&amp;lt;Niederlassung");
  });

  it("Anti-double-escape (R4-User-Review-2 #2) — Newsletter woher with & and <", () => {
    const data: NewsletterFormData = {
      ...newsletterFormData,
      woher: "AT&T <Newsletter>",
    };
    const result = renderMailFromTemplate({
      kind: "newsletter_notify_admin",
      locale: "de",
      template: DEFAULT_TEMPLATES.newsletter_notify_admin.de,
      formData: data,
    });
    expect(result.html).toContain("AT&amp;T &lt;Newsletter&gt;");
    expect(result.html).not.toContain("AT&amp;amp;T");
  });

  it("Form-table cells in HTML escape rendered values exactly once", () => {
    const data: MembershipFormData = {
      ...memberFormData,
      strasse: "Beispiel & Co.",
    };
    const result = renderMailFromTemplate({
      kind: "member_notify_admin",
      locale: "de",
      template: DEFAULT_TEMPLATES.member_notify_admin.de,
      formData: data,
    });
    // Strasse cell shows escaped & once.
    expect(result.html).toContain("Beispiel &amp; Co. 12");
    expect(result.html).not.toContain("Beispiel &amp;amp; Co.");
    // Plaintext-body cell shows raw &.
    expect(result.text).toContain("Beispiel & Co. 12");
  });
});
