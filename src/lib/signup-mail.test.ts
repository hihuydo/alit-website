// Tests for src/lib/signup-mail.ts — post-COMMIT mail fan-out.
import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const { sendMailMock, auditLogMock } = vi.hoisted(() => ({
  sendMailMock: vi.fn(),
  auditLogMock: vi.fn(),
}));

vi.mock("./mail", () => ({
  sendMail: sendMailMock,
}));

vi.mock("./audit", () => ({
  auditLog: auditLogMock,
}));

import { sendSignupMails } from "./signup-mail";
import type { MembershipFormData, NewsletterFormData } from "./mail-templates";

const memberData: MembershipFormData = {
  vorname: "Anna",
  nachname: "Müller",
  strasse: "Bahnhofstrasse",
  nr: "12",
  plz: "8001",
  stadt: "Zürich",
  email: "anna@example.com",
};

const newsletterData: NewsletterFormData = {
  vorname: "Anna",
  nachname: "Müller",
  woher: "Empfehlung",
  email: "anna@example.com",
};

describe("signup-mail — module purity (R4-User-Review-2 #2 source-content-test)", () => {
  it("imports only ./mail, ./mail-templates, ./audit (relative)", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "signup-mail.ts"),
      "utf-8",
    );
    // Multi-line aware regex: import statements may span multiple lines for
    // destructured imports. We capture the relative module-path after `from`.
    const importRegex = /from\s+["']\.\/?([^"']+)["']/g;
    const relativeImports = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(source)) !== null) {
      relativeImports.add(match[1]);
    }
    // Exact-set assertion: only these 3 relative imports allowed.
    expect(relativeImports).toEqual(
      new Set(["mail", "mail-templates", "audit"]),
    );
    // Defense: no DB imports (pg/db/pool).
    expect(source).not.toMatch(/from ["']\.\/db["']/);
    expect(source).not.toMatch(/from ["']pg["']/);
  });
});

describe("signup-mail — sendOne arm (success path)", () => {
  beforeEach(() => {
    sendMailMock.mockReset();
    auditLogMock.mockReset();
  });

  it("happy-path Mitgliedschaft: 2 sendMail calls + 2 audit calls, mail_accepted=true", async () => {
    sendMailMock.mockResolvedValue({ accepted: true, messageId: "<x>" });
    await sendSignupMails({
      signupKind: "membership",
      locale: "de",
      formData: memberData,
      userEmail: memberData.email,
      adminRecipient: "info@alit.ch",
      rowId: 42,
    });
    expect(sendMailMock).toHaveBeenCalledTimes(2);
    expect(auditLogMock).toHaveBeenCalledTimes(2);
    // First mail = user, second = admin (Promise.all order).
    const userArg = auditLogMock.mock.calls.find(
      (c) => c[1].mail_recipient_kind === "user",
    );
    const adminArg = auditLogMock.mock.calls.find(
      (c) => c[1].mail_recipient_kind === "admin",
    );
    expect(userArg).toBeDefined();
    expect(adminArg).toBeDefined();
    expect(userArg![1]).toMatchObject({
      signup_kind: "membership",
      row_id: 42,
      mail_type: "member_confirmation_user",
      mail_accepted: true,
    });
    expect(adminArg![1]).toMatchObject({
      signup_kind: "membership",
      row_id: 42,
      mail_type: "member_notify_admin",
      mail_accepted: true,
    });
  });

  it("Newsletter happy-path: signup_kind=newsletter, correct mail_types", async () => {
    sendMailMock.mockResolvedValue({ accepted: true, messageId: "<id>" });
    await sendSignupMails({
      signupKind: "newsletter",
      locale: "fr",
      formData: newsletterData,
      userEmail: newsletterData.email,
      adminRecipient: "info@alit.ch",
      rowId: 99,
    });
    expect(sendMailMock).toHaveBeenCalledTimes(2);
    const auditMailTypes = auditLogMock.mock.calls.map(
      (c) => c[1].mail_type,
    );
    expect(auditMailTypes).toContain("newsletter_confirmation_user");
    expect(auditMailTypes).toContain("newsletter_notify_admin");
  });

  it("admin-notify gets replyTo=userEmail, user-notify has no replyTo", async () => {
    sendMailMock.mockResolvedValue({ accepted: true, messageId: "<id>" });
    await sendSignupMails({
      signupKind: "membership",
      locale: "de",
      formData: memberData,
      userEmail: memberData.email,
      adminRecipient: "info@alit.ch",
      rowId: 1,
    });
    const adminCall = sendMailMock.mock.calls.find(
      (c) => c[0].to === "info@alit.ch",
    );
    const userCall = sendMailMock.mock.calls.find(
      (c) => c[0].to === memberData.email,
    );
    expect(adminCall![0].replyTo).toBe(memberData.email);
    expect(userCall![0].replyTo).toBeUndefined();
  });
});

describe("signup-mail — sendOne arm (failure paths)", () => {
  beforeEach(() => {
    sendMailMock.mockReset();
    auditLogMock.mockReset();
  });

  it("not-configured (Phase 1, SMTP_HOST empty) → audit mail_accepted=null, error_reason='not-configured'", async () => {
    sendMailMock.mockResolvedValue({
      accepted: false,
      reason: "not-configured",
    });
    await sendSignupMails({
      signupKind: "membership",
      locale: "de",
      formData: memberData,
      userEmail: memberData.email,
      adminRecipient: "info@alit.ch",
      rowId: 5,
    });
    expect(auditLogMock).toHaveBeenCalledTimes(2);
    for (const call of auditLogMock.mock.calls) {
      expect(call[1].mail_accepted).toBe(null);
      expect(call[1].mail_error_reason).toBe("not-configured");
    }
  });

  it("send-failed (SMTP rejected/throw) → audit mail_accepted=false, error_reason='send-failed'", async () => {
    sendMailMock.mockResolvedValue({
      accepted: false,
      reason: "send-failed",
    });
    await sendSignupMails({
      signupKind: "membership",
      locale: "de",
      formData: memberData,
      userEmail: memberData.email,
      adminRecipient: "info@alit.ch",
      rowId: 6,
    });
    expect(auditLogMock).toHaveBeenCalledTimes(2);
    for (const call of auditLogMock.mock.calls) {
      expect(call[1].mail_accepted).toBe(false);
      expect(call[1].mail_error_reason).toBe("send-failed");
    }
  });

  it("sendMail throws unexpected → audit mail_accepted=false, error_reason from err.message", async () => {
    sendMailMock.mockRejectedValue(new Error("Connection refused"));
    await sendSignupMails({
      signupKind: "newsletter",
      locale: "de",
      formData: newsletterData,
      userEmail: newsletterData.email,
      adminRecipient: "info@alit.ch",
      rowId: 7,
    });
    expect(auditLogMock).toHaveBeenCalledTimes(2);
    for (const call of auditLogMock.mock.calls) {
      expect(call[1].mail_accepted).toBe(false);
      expect(call[1].mail_error_reason).toBe("Connection refused");
    }
  });
});

describe("signup-mail — admin-recipient null-skip + outer-rejection-defense", () => {
  beforeEach(() => {
    sendMailMock.mockReset();
    auditLogMock.mockReset();
  });

  it("adminRecipient=null → admin sendMail 0× called, but audit row with no_recipient_configured", async () => {
    sendMailMock.mockResolvedValue({ accepted: true, messageId: "<id>" });
    await sendSignupMails({
      signupKind: "membership",
      locale: "de",
      formData: memberData,
      userEmail: memberData.email,
      adminRecipient: null,
      rowId: 8,
    });
    // sendMail called 1× (user only).
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock.mock.calls[0][0].to).toBe(memberData.email);
    // audit called 2× (user + admin-skip).
    expect(auditLogMock).toHaveBeenCalledTimes(2);
    const adminCall = auditLogMock.mock.calls.find(
      (c) => c[1].mail_recipient_kind === "admin",
    );
    expect(adminCall).toBeDefined();
    expect(adminCall![1]).toMatchObject({
      mail_accepted: null,
      mail_error_reason: "no_recipient_configured",
      mail_type: "member_notify_admin",
    });
  });

  it("R2 #6 outer-defense: auditLog throws synchronously → sendSignupMails resolves OK (no unhandled rejection)", async () => {
    sendMailMock.mockResolvedValue({ accepted: true, messageId: "<id>" });
    auditLogMock.mockImplementation(() => {
      throw new Error("audit-call exploded");
    });
    // Call must NOT throw. If outer-try/catch is missing, this would reject.
    await expect(
      sendSignupMails({
        signupKind: "membership",
        locale: "de",
        formData: memberData,
        userEmail: memberData.email,
        adminRecipient: "info@alit.ch",
        rowId: 9,
      }),
    ).resolves.toBeUndefined();
  });

  it("call-order assertion: sendMail per arm finishes before its audit-log call (in arm)", async () => {
    const callOrder: string[] = [];
    sendMailMock.mockImplementation(async () => {
      callOrder.push("sendMail");
      return { accepted: true, messageId: "<id>" };
    });
    auditLogMock.mockImplementation(() => {
      callOrder.push("auditLog");
    });
    await sendSignupMails({
      signupKind: "membership",
      locale: "de",
      formData: memberData,
      userEmail: memberData.email,
      adminRecipient: "info@alit.ch",
      rowId: 10,
    });
    // For each arm: sendMail → auditLog. With Promise.all both arms can interleave.
    // Min-condition: 2× sendMail before 2× auditLog is NOT required — only that
    // each auditLog comes AFTER at least one sendMail. Simpler check: equal counts
    // and no auditLog before first sendMail.
    expect(callOrder.filter((x) => x === "sendMail")).toHaveLength(2);
    expect(callOrder.filter((x) => x === "auditLog")).toHaveLength(2);
    expect(callOrder[0]).toBe("sendMail");
  });
});
