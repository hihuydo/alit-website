// Sprint M2a — signup-mail.ts: combines transport + templates + audit for the
// post-COMMIT mail-fan-out from /api/signup/{mitgliedschaft,newsletter} routes.
//
// Imports: ./mail (transport), ./mail-templates (render), ./audit (emit).
// NO DB imports — defaults are static constants in M2a (M2b will replace
// DEFAULT_TEMPLATES lookup with a getSubmissionMailTexts(locale) DB-loader).
import * as mailMod from "./mail";
import {
  DEFAULT_TEMPLATES,
  mailTypeFor,
  renderMailFromTemplate,
  type MembershipFormData,
  type NewsletterFormData,
  type RecipientKind,
  type SignupKind,
} from "./mail-templates";
import { auditLog } from "./audit";
import type { Locale } from "@/i18n/config";

export interface SendSignupMailsInput {
  signupKind: SignupKind;
  locale: Locale;
  formData: MembershipFormData | NewsletterFormData;
  userEmail: string;
  /**
   * Resolved by caller from `MEMBERSHIP_NOTIFY_RECIPIENT || SMTP_FROM` (single
   * `||`-chain — see DK-7). Null = both env-vars empty → admin-notify is
   * skipped + `mail_accepted: null, mail_error_reason: "no_recipient_configured"`
   * audit row is emitted.
   */
  adminRecipient: string | null;
  rowId: number;
}

/**
 * Send 2 mails (user-confirmation + admin-notify) in parallel, post-COMMIT.
 *
 * **Guarantees** (Sprint M2a R2 #6 / R3 #1):
 * - Outer try/catch around `Promise.all([...])` swallows any unhandled
 *   rejection (defense-in-depth gegen audit-call schema-mismatch).
 * - Each `sendOne` arm has its own try/catch that resolves audit-emission
 *   regardless of whether sendMail succeeded, returned a failure-shape, or
 *   threw synchronously.
 * - Caller invokes as `void sendSignupMails(...)` — function never rejects.
 */
export async function sendSignupMails(
  input: SendSignupMailsInput,
): Promise<void> {
  try {
    await Promise.all([
      sendOne("user", input.userEmail, input),
      input.adminRecipient
        ? sendOne("admin", input.adminRecipient, input)
        : sendAdminSkipAudit(input),
    ]);
  } catch {
    // Outer net — defense-in-depth gegen unerwartete throws aus audit/render.
    // Caller's `void sendSignupMails(...)` MUST NOT see an unhandled-rejection.
  }
}

async function sendOne(
  recipientKind: RecipientKind,
  to: string,
  input: SendSignupMailsInput,
): Promise<void> {
  const mailType = mailTypeFor(input.signupKind, recipientKind);
  try {
    const template = DEFAULT_TEMPLATES[mailType][input.locale];
    const rendered = renderMailFromTemplate({
      kind: mailType,
      locale: input.locale,
      template,
      formData: input.formData,
    });
    const result = await mailMod.sendMail({
      to,
      replyTo: recipientKind === "admin" ? input.userEmail : undefined,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
    auditLog("signup_mail_sent", {
      ip: "",
      signup_kind: input.signupKind,
      row_id: input.rowId,
      mail_type: mailType,
      mail_recipient_kind: recipientKind,
      mail_accepted: result.accepted
        ? true
        : result.reason === "not-configured"
          ? null
          : false,
      mail_error_reason: result.accepted ? undefined : result.reason,
    });
  } catch (err) {
    // Synchronous throw inside render or audit (extremely rare). Emit a
    // best-effort audit row — also wrapped in try-catch so a thrown audit
    // does not propagate into the outer Promise.all.
    try {
      auditLog("signup_mail_sent", {
        ip: "",
        signup_kind: input.signupKind,
        row_id: input.rowId,
        mail_type: mailType,
        mail_recipient_kind: recipientKind,
        mail_accepted: false,
        mail_error_reason: err instanceof Error ? err.message : String(err),
      });
    } catch {
      // outer try/catch in sendSignupMails will catch this.
    }
  }
}

/**
 * Skip the admin-notify mail (no recipient configured) but still emit an
 * audit row so the operator can see "admin-notify was attempted but skipped".
 * Returns Promise<void> so it slots into the Promise.all next to sendOne.
 */
async function sendAdminSkipAudit(input: SendSignupMailsInput): Promise<void> {
  const mailType = mailTypeFor(input.signupKind, "admin");
  try {
    auditLog("signup_mail_sent", {
      ip: "",
      signup_kind: input.signupKind,
      row_id: input.rowId,
      mail_type: mailType,
      mail_recipient_kind: "admin",
      mail_accepted: null,
      mail_error_reason: "no_recipient_configured",
    });
  } catch {
    // Outer try/catch in sendSignupMails will catch this.
  }
}
