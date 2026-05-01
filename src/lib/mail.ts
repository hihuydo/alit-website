import nodemailer, { type Transporter } from "nodemailer";

export interface SendMailInput {
  to: string;
  from?: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
}

export type MailSendResult =
  | { accepted: true; messageId: string }
  | { accepted: false; reason: "not-configured" | "send-failed" };

const ALLOWED_SENDER_DOMAIN = "alit.ch";

let transporter: Transporter | null = null;
let transporterInitialized = false;
let missingConfigWarned = false;
let shutdownHookInstalled = false;

function resolveSenderAddress(): string | null {
  const from = process.env.SMTP_FROM?.trim();
  if (!from) return null;
  const domain = from.split("@").pop()?.toLowerCase() ?? "";
  if (domain !== ALLOWED_SENDER_DOMAIN) {
    throw new Error(
      `SMTP_FROM must be on ${ALLOWED_SENDER_DOMAIN} domain for SPF/DMARC alignment (got "${from}")`,
    );
  }
  return from;
}

export function getTransporter(): Transporter | null {
  if (transporterInitialized) return transporter;

  const host = process.env.SMTP_HOST?.trim();
  if (!host) {
    if (!missingConfigWarned) {
      console.warn("[mail] SMTP not configured — signup mails will be skipped (Phase 1 graceful-degrade)");
      missingConfigWarned = true;
    }
    transporter = null;
    transporterInitialized = true;
    return null;
  }

  try {
    resolveSenderAddress();

    const port = Number.parseInt(process.env.SMTP_PORT ?? "465", 10);
    const secure = (process.env.SMTP_SECURE ?? "true").toLowerCase() !== "false";
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS;

    transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 5_000,
      socketTimeout: 15_000,
    });
  } catch (err) {
    console.error("[mail] SMTP init failed — signup mails will be skipped", err);
    transporter = null;
  }

  transporterInitialized = true;
  return transporter;
}

export async function sendMail(input: SendMailInput): Promise<MailSendResult> {
  const t = getTransporter();
  if (!t) return { accepted: false, reason: "not-configured" };

  const from = input.from?.trim() || resolveSenderAddress();
  if (!from) return { accepted: false, reason: "not-configured" };

  try {
    const info = await t.sendMail({
      from,
      to: input.to,
      replyTo: input.replyTo,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    const messageId = info.messageId ?? "";
    return { accepted: true, messageId };
  } catch (err) {
    console.error("[mail] SMTP send failed", err);
    return { accepted: false, reason: "send-failed" };
  }
}

export async function closeTransporter(): Promise<void> {
  if (!transporter) {
    transporterInitialized = false;
    return;
  }
  try {
    transporter.close();
  } finally {
    transporter = null;
    transporterInitialized = false;
  }
}

export function installMailShutdownHook(): void {
  if (shutdownHookInstalled) return;
  shutdownHookInstalled = true;
  process.once("SIGTERM", () => {
    void closeTransporter();
  });
}

/** Test-only reset — cleans module-level state between tests. */
export function __resetMailModuleForTests(): void {
  transporter = null;
  transporterInitialized = false;
  missingConfigWarned = false;
  shutdownHookInstalled = false;
}
