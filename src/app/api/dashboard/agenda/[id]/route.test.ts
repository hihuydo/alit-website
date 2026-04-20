import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SignJWT } from "jose";

const JWT_SECRET = "test-secret-at-least-32-chars-long-agenda-id-route-aaaa";

async function makeToken(sub: string, tv: number): Promise<string> {
  return new SignJWT({ sub, tv })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(new TextEncoder().encode(JWT_SECRET));
}

async function buildCsrf(userId: number, tv: number): Promise<string> {
  const { buildCsrfToken } = await import("@/lib/csrf");
  return buildCsrfToken(JWT_SECRET, userId, tv);
}

function fakeReq(opts: {
  sessionCookie: string;
  csrfCookie: string;
  csrfHeader: string;
  body: unknown;
}) {
  const cookies = new Map<string, { value: string }>();
  cookies.set("__Host-session", { value: opts.sessionCookie });
  cookies.set("session", { value: opts.sessionCookie });
  cookies.set("__Host-csrf", { value: opts.csrfCookie });
  const bodyText = JSON.stringify(opts.body);
  const headers = new Map<string, string>();
  headers.set("x-csrf-token", opts.csrfHeader);
  headers.set("content-length", String(bodyText.length));
  return {
    method: "PUT",
    url: "https://example.com/api/dashboard/agenda/7/",
    headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
    cookies: { get: (name: string) => cookies.get(name) },
    text: async () => bodyText,
  } as unknown as import("next/server").NextRequest;
}

describe("PUT /api/dashboard/agenda/[id] — partial-safe datum/zeit format gate", () => {
  const mockQuery = vi.fn();
  const mockConnect = vi.fn();
  const mockClient = { query: vi.fn(), release: vi.fn() };

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", JWT_SECRET);
    mockQuery.mockReset();
    mockConnect.mockReset();
    mockClient.query.mockReset();
    mockClient.release.mockReset();
    mockConnect.mockResolvedValue(mockClient);
    vi.doMock("@/lib/db", () => ({
      default: { query: mockQuery, connect: mockConnect },
    }));
    vi.doMock("@/lib/cookie-counter", () => ({
      bumpCookieSource: vi.fn(),
      deriveEnv: () => "prod",
    }));
    vi.doMock("@/lib/agenda-hashtags", () => ({
      validateHashtagsI18n: vi.fn().mockResolvedValue({ ok: true, hashtags: [] }),
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function callPut(body: unknown) {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 5 }] }); // requireAuth
    // Remaining queries would be UPDATE; mock once just in case.
    mockQuery.mockResolvedValue({ rows: [{ id: 7, datum: "01.01.2026", zeit: "14:00 Uhr" }] });
    const csrf = await buildCsrf(42, 5);
    const { PUT } = await import("./route");
    return PUT(
      fakeReq({
        sessionCookie: await makeToken("42", 5),
        csrfCookie: csrf,
        csrfHeader: csrf,
        body,
      }),
      { params: Promise.resolve({ id: "7" }) },
    );
  }

  it("Partial-PUT without datum/zeit skips the format gate (DK-3)", async () => {
    const res = await callPut({ title_i18n: { de: "Neuer Titel" } });
    // Format-gate must NOT reject a body that doesn't touch datum/zeit.
    if (res.status === 400) {
      const body = await res.json();
      expect(body.error).not.toMatch(/Datumsformat|Zeitformat/);
    }
  });

  it("PUT with invalid zeit → 400, UPDATE does not run", async () => {
    const res = await callPut({ zeit: "14:00Uhr" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Zeitformat/);
    // Only the requireAuth token_version query ran; no UPDATE.
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("PUT with invalid datum → 400 (impossible civil-date)", async () => {
    const res = await callPut({ datum: "31.04.2025" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Datumsformat/);
  });

  it("PUT with canonical datum+zeit passes the format gate", async () => {
    const res = await callPut({ datum: "15.03.2025", zeit: "19:00 Uhr" });
    if (res.status === 400) {
      const body = await res.json();
      expect(body.error).not.toMatch(/Datumsformat|Zeitformat/);
    }
  });
});
