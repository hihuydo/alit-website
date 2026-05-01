// Tests for src/lib/mail.ts — graceful-degrade SMTP transport for signup mails.
// Strategy: dispatch SIGTERM is NOT performed in these tests (would leak
// listeners across the worker). We only assert the flag was set via
// `process.once` mock. afterEach restores the spy.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const { sendMailMock, createTransportMock, closeMock } = vi.hoisted(() => {
  const sendMailMock = vi.fn();
  const closeMock = vi.fn();
  const createTransportMock = vi.fn(() => ({
    sendMail: sendMailMock,
    close: closeMock,
  }));
  return { sendMailMock, createTransportMock, closeMock };
});

vi.mock("nodemailer", () => ({
  default: { createTransport: createTransportMock },
}));

import {
  getTransporter,
  sendMail,
  closeTransporter,
  installMailShutdownHook,
  __resetMailModuleForTests,
} from "./mail";

const ENV_KEYS = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
  "MEMBERSHIP_NOTIFY_RECIPIENT",
];

function clearEnv() {
  for (const key of ENV_KEYS) delete process.env[key];
}

function configureSmtp() {
  process.env.SMTP_HOST = "mail.hihuydo.com";
  process.env.SMTP_PORT = "465";
  process.env.SMTP_SECURE = "true";
  process.env.SMTP_USER = "info@alit.ch";
  process.env.SMTP_PASS = "testpass";
  process.env.SMTP_FROM = "info@alit.ch";
}

describe("lib/mail — getTransporter graceful-degrade + idempotent + isolated", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearEnv();
    __resetMailModuleForTests();
    sendMailMock.mockReset();
    createTransportMock.mockClear();
    closeMock.mockReset();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("returns null and warns once when SMTP_HOST is missing (Phase 1)", () => {
    expect(getTransporter()).toBe(null);
    expect(getTransporter()).toBe(null);
    expect(getTransporter()).toBe(null);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(/SMTP not configured/);
  });

  it("initializes lazily and reuses the singleton on repeat calls", () => {
    configureSmtp();
    const first = getTransporter();
    const second = getTransporter();
    expect(first).not.toBe(null);
    expect(first).toBe(second);
    expect(createTransportMock).toHaveBeenCalledTimes(1);
  });

  it("returns null + logs error when SMTP_FROM domain is not alit.ch (SPF/DMARC alignment guard)", () => {
    configureSmtp();
    process.env.SMTP_FROM = "attacker@gmail.com";
    expect(getTransporter()).toBe(null);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toMatch(/SMTP init failed/);
    // Domain is mentioned in the throw, surfaces via error-arg-2 of console.error.
    const err = errorSpy.mock.calls[0][1];
    expect(String(err)).toMatch(/alit\.ch/);
    // Cached failure: next call returns null without re-throwing or re-logging.
    expect(getTransporter()).toBe(null);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("re-import in cleared-env does NOT throw (no module-level fail-fast)", async () => {
    // Module already imported at top — re-trigger reset to verify idempotent re-init.
    clearEnv();
    __resetMailModuleForTests();
    expect(() => getTransporter()).not.toThrow();
  });
});

describe("lib/mail — sendMail", () => {
  beforeEach(() => {
    clearEnv();
    __resetMailModuleForTests();
    sendMailMock.mockReset();
    createTransportMock.mockClear();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns not-configured when SMTP_HOST is missing", async () => {
    const result = await sendMail({
      to: "user@example.com",
      subject: "Test",
      text: "body",
      html: "<p>body</p>",
    });
    expect(result).toEqual({ accepted: false, reason: "not-configured" });
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("sends with given input shape and uses SMTP_FROM as default sender", async () => {
    configureSmtp();
    sendMailMock.mockResolvedValueOnce({ messageId: "<abc@host>" });
    const result = await sendMail({
      to: "user@example.com",
      replyTo: "reply@alit.ch",
      subject: "Subject",
      text: "Hello",
      html: "<p>Hello</p>",
    });
    expect(result).toEqual({ accepted: true, messageId: "<abc@host>" });
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const arg = sendMailMock.mock.calls[0][0] as Record<string, string>;
    expect(arg.from).toBe("info@alit.ch");
    expect(arg.to).toBe("user@example.com");
    expect(arg.replyTo).toBe("reply@alit.ch");
    expect(arg.subject).toBe("Subject");
    expect(arg.text).toBe("Hello");
    expect(arg.html).toBe("<p>Hello</p>");
  });

  it("returns send-failed and logs error on SMTP throw", async () => {
    configureSmtp();
    const errSpy = vi.spyOn(console, "error");
    sendMailMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const result = await sendMail({
      to: "user@example.com",
      subject: "S",
      text: "body",
      html: "<p>body</p>",
    });
    expect(result).toEqual({ accepted: false, reason: "send-failed" });
    expect(errSpy).toHaveBeenCalledWith(
      "[mail] SMTP send failed",
      expect.any(Error),
    );
  });

  it("uses caller-provided `from` when given (overrides SMTP_FROM)", async () => {
    configureSmtp();
    sendMailMock.mockResolvedValueOnce({ messageId: "<id>" });
    await sendMail({
      from: "custom@alit.ch",
      to: "user@example.com",
      subject: "S",
      text: "body",
      html: "<p>body</p>",
    });
    const arg = sendMailMock.mock.calls[0][0] as Record<string, string>;
    expect(arg.from).toBe("custom@alit.ch");
  });
});

describe("lib/mail — closeTransporter + installMailShutdownHook idempotent", () => {
  let processOnceSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearEnv();
    __resetMailModuleForTests();
    sendMailMock.mockReset();
    createTransportMock.mockClear();
    closeMock.mockReset();
    processOnceSpy = vi.spyOn(process, "once").mockImplementation(() => process);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    processOnceSpy.mockRestore();
  });

  it("closeTransporter is idempotent (no error on repeat call, close called once)", async () => {
    configureSmtp();
    getTransporter();
    await closeTransporter();
    await expect(closeTransporter()).resolves.toBeUndefined();
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it("installMailShutdownHook registers SIGTERM only once across N calls", () => {
    installMailShutdownHook();
    installMailShutdownHook();
    installMailShutdownHook();
    const sigtermCalls = processOnceSpy.mock.calls.filter(
      (c: unknown[]) => c[0] === "SIGTERM",
    );
    expect(sigtermCalls).toHaveLength(1);
  });
});

describe("lib/mail — module purity (no DB/audit/fs/net imports)", () => {
  it("source contains no imports of pool/db/audit/fs/net", () => {
    const filePath = path.join(__dirname, "mail.ts");
    const source = fs.readFileSync(filePath, "utf-8");
    // Allow only nodemailer + node:type-imports — anything else from server-deps fails.
    const forbidden = [
      /from ["']\.\/db["']/,
      /from ["']\.\/audit["']/,
      /from ["']\.\/pool["']/,
      /from ["']pg["']/,
      /from ["']node:fs["']/, // mail.ts only uses nodemailer + console + process
    ];
    for (const re of forbidden) {
      expect(source).not.toMatch(re);
    }
  });
});

describe("lib/mail — runtime=nodejs pin in signup routes (Sprint M2a Finding #4)", () => {
  // Anchored regex: `/^export\s+const\s+runtime\s*=\s*["']nodejs["'];?\s*$/m`.
  // Multiline-flag, line-anchored — verhindert false-positive bei comments
  // oder string-literals. Asserts genau 1 match per file.
  const RUNTIME_PIN_REGEX = /^export\s+const\s+runtime\s*=\s*["']nodejs["'];?\s*$/m;

  it("mitgliedschaft route has top-level `export const runtime = \"nodejs\"`", () => {
    const filePath = path.join(__dirname, "../app/api/signup/mitgliedschaft/route.ts");
    const source = fs.readFileSync(filePath, "utf-8");
    const matches = source.match(new RegExp(RUNTIME_PIN_REGEX.source, "gm"));
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(1);
  });

  it("newsletter route has top-level `export const runtime = \"nodejs\"`", () => {
    const filePath = path.join(__dirname, "../app/api/signup/newsletter/route.ts");
    const source = fs.readFileSync(filePath, "utf-8");
    const matches = source.match(new RegExp(RUNTIME_PIN_REGEX.source, "gm"));
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(1);
  });

  it("anti-comment regex test: `// const runtime = \"edge\"` does NOT match the pin regex", () => {
    const fixture = `// const runtime = "edge"\nexport const foo = 1;\n`;
    expect(RUNTIME_PIN_REGEX.test(fixture)).toBe(false);
  });

  it("anti-string-literal regex test: pin inside template-string does NOT match", () => {
    const fixture = `const x = \`export const runtime = "nodejs"\`;\n`;
    expect(RUNTIME_PIN_REGEX.test(fixture)).toBe(false);
  });
});
