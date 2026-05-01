// Tests for /api/signup/mitgliedschaft — covers mail-send wiring + locale
// + adminRecipient resolution (Sprint M2a).
import { describe, it, expect, beforeEach, vi } from "vitest";

// vi.hoisted runs before any import so the mocks are in place when the route
// loads its own dependencies.
const { mockQuery, mockConnect, mockClient, mockSendSignupMails } = vi.hoisted(
  () => {
    const mockQuery = vi.fn();
    const mockClient = {
      query: mockQuery,
      release: vi.fn(),
    };
    const mockConnect = vi.fn(async () => mockClient);
    const mockSendSignupMails = vi.fn(async () => undefined);
    return { mockQuery, mockConnect, mockClient, mockSendSignupMails };
  },
);

vi.mock("@/lib/db", () => ({
  default: { connect: mockConnect, query: mockQuery },
}));

vi.mock("@/lib/signup-mail", () => ({
  sendSignupMails: mockSendSignupMails,
}));

// Rate-limiter is in-memory; reset between tests via env-key trick.
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
}));

vi.mock("@/lib/ip-hash", () => ({
  hashIp: vi.fn(() => "deadbeef"),
}));

import { POST } from "./route";

function makeReq(body: unknown, ip: string = "1.2.3.4") {
  const bodyText = JSON.stringify(body);
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
  strasse: "Bahnhofstrasse",
  nr: "12",
  plz: "8001",
  stadt: "Zürich",
  email: "anna@example.com",
  consent: true,
};

describe("POST /api/signup/mitgliedschaft — runtime pin", () => {
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

describe("POST /api/signup/mitgliedschaft — adminRecipient uses ||-chain not ??", () => {
  it("source uses single ||-chain in adminRecipient declaration (R2 #1 anti-?? guard)", async () => {
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

describe("POST /api/signup/mitgliedschaft — mail-send happy path", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockConnect.mockClear();
    mockClient.release.mockClear();
    mockSendSignupMails.mockClear();
    process.env.MEMBERSHIP_NOTIFY_RECIPIENT = "info@alit.ch";
    delete process.env.SMTP_FROM;
  });

  it("happy path: COMMIT, then sendSignupMails with rowId, signupKind, formData", async () => {
    // Sequence: BEGIN, INSERT memberships RETURNING id=42, INSERT newsletter, COMMIT
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 42 }], rowCount: 1 }) // INSERT memberships
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT newsletter
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // COMMIT

    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });

    expect(mockSendSignupMails).toHaveBeenCalledTimes(1);
    expect(mockSendSignupMails).toHaveBeenCalledWith({
      signupKind: "membership",
      locale: "de",
      formData: expect.objectContaining({
        vorname: "Anna",
        nachname: "Müller",
        email: "anna@example.com",
      }),
      userEmail: "anna@example.com",
      adminRecipient: "info@alit.ch",
      rowId: 42,
    });
  });

  it("fire-and-forget: route returns 200 even if sendSignupMails rejects in background", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: 42 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    mockSendSignupMails.mockRejectedValue(new Error("mail-fanout-broken"));

    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(200);
  });

  it("admin-recipient empty + SMTP_FROM set → falls back to SMTP_FROM (||-chain)", async () => {
    delete process.env.MEMBERSHIP_NOTIFY_RECIPIENT;
    process.env.SMTP_FROM = "info@alit.ch";
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await POST(makeReq(validBody));
    expect(mockSendSignupMails).toHaveBeenCalledWith(
      expect.objectContaining({ adminRecipient: "info@alit.ch" }),
    );
  });

  it("admin-recipient whitespace-only + SMTP_FROM set → falls back (trim)", async () => {
    process.env.MEMBERSHIP_NOTIFY_RECIPIENT = "   ";
    process.env.SMTP_FROM = "info@alit.ch";
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await POST(makeReq(validBody));
    expect(mockSendSignupMails).toHaveBeenCalledWith(
      expect.objectContaining({ adminRecipient: "info@alit.ch" }),
    );
  });

  it("admin-recipient empty + SMTP_FROM empty → adminRecipient is null", async () => {
    delete process.env.MEMBERSHIP_NOTIFY_RECIPIENT;
    delete process.env.SMTP_FROM;
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await POST(makeReq(validBody));
    expect(mockSendSignupMails).toHaveBeenCalledWith(
      expect.objectContaining({ adminRecipient: null }),
    );
  });
});

describe("POST /api/signup/mitgliedschaft — already_registered (23505) skips mail", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockConnect.mockClear();
    mockClient.release.mockClear();
    mockSendSignupMails.mockClear();
    process.env.MEMBERSHIP_NOTIFY_RECIPIENT = "info@alit.ch";
  });

  it("INSERT 23505 → 409, sendSignupMails 0× called", async () => {
    const dupErr = Object.assign(new Error("duplicate"), { code: "23505" });
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
      .mockRejectedValueOnce(dupErr) // INSERT memberships throws
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // ROLLBACK

    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json).toEqual({ error: "already_registered" });
    expect(mockSendSignupMails).not.toHaveBeenCalled();
  });
});

describe("POST /api/signup/mitgliedschaft — locale parsing (R2 #4 expanded)", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockSendSignupMails.mockClear();
    process.env.MEMBERSHIP_NOTIFY_RECIPIENT = "info@alit.ch";
    mockQuery
      .mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1 });
  });

  // Helper to set up the 4-query happy-path mock.
  function mockHappyPath() {
    mockQuery.mockReset();
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 }) // INSERT memberships
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT newsletter
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // COMMIT
  }

  const cases: Array<[string, unknown, "de" | "fr"]> = [
    ['locale="de"', "de", "de"],
    ['locale="fr"', "fr", "fr"],
    ['locale="FR" (uppercase)', "FR", "fr"],
    ['locale="  fr  " (whitespace)', "  fr  ", "fr"],
    ["locale missing/undefined", undefined, "de"],
    ["locale=null", null, "de"],
    ['locale="" (empty)', "", "de"],
    ['locale="en" (other)', "en", "de"],
    ["locale=42 (number)", 42, "de"],
    ['locale="fr-CH" (region-tagged → de in M2a)', "fr-CH", "de"],
  ];

  it.each(cases)(
    "%s → %s",
    async (_label, localeIn, expected) => {
      mockHappyPath();
      const body = { ...validBody, locale: localeIn };
      await POST(makeReq(body));
      expect(mockSendSignupMails).toHaveBeenCalledWith(
        expect.objectContaining({ locale: expected }),
      );
      mockSendSignupMails.mockClear();
    },
  );
});
