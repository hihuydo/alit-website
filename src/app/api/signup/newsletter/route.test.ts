// Tests for /api/signup/newsletter — covers conditional mail-send (anti-enum)
// + locale + adminRecipient resolution (Sprint M2a).
import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockQuery, mockSendSignupMails } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockSendSignupMails: vi.fn(async () => undefined),
}));

vi.mock("@/lib/db", () => ({
  default: { query: mockQuery },
}));

vi.mock("@/lib/signup-mail", () => ({
  sendSignupMails: mockSendSignupMails,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
}));

vi.mock("@/lib/ip-hash", () => ({
  hashIp: vi.fn(() => "deadbeef"),
}));

import { POST } from "./route";

function makeReq(body: unknown, ip: string = "1.2.3.4") {
  const headers = new Map<string, string>([
    ["x-real-ip", ip],
    ["content-type", "application/json"],
  ]);
  return {
    headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
    json: async () => body,
  } as unknown as import("next/server").NextRequest;
}

const validBody = {
  vorname: "Anna",
  nachname: "Müller",
  woher: "Empfehlung",
  email: "anna@example.com",
  consent: true,
};

describe("POST /api/signup/newsletter — runtime pin", () => {
  it("file declares `export const runtime = \"nodejs\"` (R2 Finding #4)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const source = fs.readFileSync(
      path.join(__dirname, "route.ts"),
      "utf-8",
    );
    const matches = source.match(
      /^export\s+const\s+runtime\s*=\s*["']nodejs["'];?\s*$/gm,
    );
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(1);
  });
});

describe("POST /api/signup/newsletter — adminRecipient uses ||-chain not ??", () => {
  it("source uses single ||-chain in adminRecipient declaration", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const source = fs.readFileSync(
      path.join(__dirname, "route.ts"),
      "utf-8",
    );
    const adminRecipientMatch = source.match(
      /function\s+resolveAdminRecipient\s*\([\s\S]*?\}/,
    );
    expect(adminRecipientMatch).not.toBeNull();
    const slice = adminRecipientMatch![0];
    expect(slice).not.toMatch(/\?\?/);
    expect(slice).toContain("||");
  });
});

describe("POST /api/signup/newsletter — conditional mail-send (anti-enum)", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockSendSignupMails.mockClear();
    process.env.MEMBERSHIP_NOTIFY_RECIPIENT = "info@alit.ch";
    delete process.env.SMTP_FROM;
  });

  it("first-time signup (rowCount=1, returning id=99) → sendSignupMails called 1×", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 99 }],
      rowCount: 1,
    });

    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });
    expect(mockSendSignupMails).toHaveBeenCalledTimes(1);
    expect(mockSendSignupMails).toHaveBeenCalledWith({
      signupKind: "newsletter",
      locale: "de",
      formData: expect.objectContaining({
        vorname: "Anna",
        woher: "Empfehlung",
        email: "anna@example.com",
      }),
      userEmail: "anna@example.com",
      adminRecipient: "info@alit.ch",
      rowId: 99,
    });
  });

  it("repeat signup (ON CONFLICT DO NOTHING, rows empty) → sendSignupMails NOT called (Anti-Enum)", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
      rowCount: 0,
    });

    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    // Identical UI response (Anti-Enum):
    expect(json).toEqual({ ok: true });
    expect(mockSendSignupMails).not.toHaveBeenCalled();
  });

  it("fire-and-forget: sendSignupMails reject doesn't break 200 response", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 99 }],
      rowCount: 1,
    });
    mockSendSignupMails.mockRejectedValue(new Error("mail-fanout-broken"));

    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/signup/newsletter — locale parsing", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockSendSignupMails.mockClear();
    process.env.MEMBERSHIP_NOTIFY_RECIPIENT = "info@alit.ch";
  });

  const cases: Array<[string, unknown, "de" | "fr"]> = [
    ['locale="de"', "de", "de"],
    ['locale="fr"', "fr", "fr"],
    ['locale="FR"', "FR", "fr"],
    ['locale="  fr  "', "  fr  ", "fr"],
    ["locale missing", undefined, "de"],
    ["locale=null", null, "de"],
    ['locale=""', "", "de"],
    ['locale="en"', "en", "de"],
    ["locale=42", 42, "de"],
    ['locale="fr-CH"', "fr-CH", "de"],
  ];

  it.each(cases)("%s → %s", async (_label, localeIn, expected) => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 });
    const body = { ...validBody, locale: localeIn };
    await POST(makeReq(body));
    expect(mockSendSignupMails).toHaveBeenCalledWith(
      expect.objectContaining({ locale: expected }),
    );
    mockSendSignupMails.mockClear();
  });
});
