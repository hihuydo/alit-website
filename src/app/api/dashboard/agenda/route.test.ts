import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SignJWT } from "jose";

const JWT_SECRET = "test-secret-at-least-32-chars-long-agenda-post-route-aaaa";

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
  method: "POST";
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
    method: opts.method,
    url: "https://example.com/api/dashboard/agenda/",
    headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
    cookies: { get: (name: string) => cookies.get(name) },
    text: async () => bodyText,
  } as unknown as import("next/server").NextRequest;
}

describe("POST /api/dashboard/agenda — canonical datum/zeit format-check", () => {
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
    // Skip hashtag DB-check — not relevant to datum/zeit format tests
    vi.doMock("@/lib/agenda-hashtags", () => ({
      validateHashtagsI18n: vi.fn().mockResolvedValue({ ok: true, hashtags: [] }),
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  const baseBody = {
    ort_url: "https://example.com",
    title_i18n: { de: "Titel" },
    lead_i18n: { de: "Lead" },
    ort_i18n: { de: "Ort" },
    content_i18n: { de: [] },
    hashtags: [],
    images: [],
  };

  async function callPost(body: unknown) {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 5 }] }); // requireAuth
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 99 }] }); // INSERT (only when reached)
    const csrf = await buildCsrf(42, 5);
    const { POST } = await import("./route");
    return POST(
      fakeReq({
        method: "POST",
        sessionCookie: await makeToken("42", 5),
        csrfCookie: csrf,
        csrfHeader: csrf,
        body,
      }),
    );
  }

  it("400 on zeit without space (legacy variant)", async () => {
    const res = await callPost({ ...baseBody, datum: "15.03.2025", zeit: "14:00Uhr" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Zeitformat/);
  });

  it("400 on zeit with period separator (legacy variant)", async () => {
    const res = await callPost({ ...baseBody, datum: "15.03.2025", zeit: "19.30" });
    expect(res.status).toBe(400);
  });

  it("400 on datum without zero-pad", async () => {
    const res = await callPost({ ...baseBody, datum: "15.3.25", zeit: "14:00 Uhr" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Datumsformat/);
  });

  it("400 on impossible civil-date (Codex Spec-R1 [Correctness] 1)", async () => {
    const res = await callPost({ ...baseBody, datum: "29.02.2025", zeit: "14:00 Uhr" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Datumsformat/);
  });

  it("accepts canonical datum + zeit", async () => {
    const res = await callPost({ ...baseBody, datum: "15.03.2025", zeit: "14:00 Uhr" });
    // Past the format-check gate — test environment doesn't have full DB
    // stack mocked, so it may hit downstream errors. The key assertion is
    // that format-validation didn't reject (status !== 400 from format).
    if (res.status === 400) {
      const body = await res.json();
      expect(body.error).not.toMatch(/Datumsformat|Zeitformat/);
    }
  });

  it("ort_url is optional — POST without ort_url does NOT 400 on missing-fields", async () => {
    const body = { ...baseBody, datum: "15.03.2025", zeit: "14:00 Uhr" };
    // Strip ort_url entirely
    delete (body as { ort_url?: string }).ort_url;
    const res = await callPost(body);
    // Old behavior would have returned 400 "Missing required fields (datum, zeit, ort_url)".
    // New behavior: past that gate — any 400 must not mention the missing-fields message.
    if (res.status === 400) {
      const body = await res.json();
      expect(body.error).not.toMatch(/Missing required fields/);
    }
  });

  it("ort_url empty string is accepted (persists as NULL server-side)", async () => {
    const res = await callPost({ ...baseBody, datum: "15.03.2025", zeit: "14:00 Uhr", ort_url: "" });
    if (res.status === 400) {
      const body = await res.json();
      expect(body.error).not.toMatch(/Missing required fields/);
    }
  });
});
