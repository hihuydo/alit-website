import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SignJWT } from "jose";

const JWT_SECRET = "test-secret-at-least-32-chars-long-journal-datum-aaaaa";

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
  sessionCookie?: string;
  csrfCookie?: string;
  csrfHeader?: string;
  body?: unknown;
}) {
  const cookies = new Map<string, { value: string }>();
  if (opts.sessionCookie) {
    cookies.set("__Host-session", { value: opts.sessionCookie });
    cookies.set("session", { value: opts.sessionCookie });
  }
  if (opts.csrfCookie) cookies.set("__Host-csrf", { value: opts.csrfCookie });
  const bodyText = opts.body === undefined ? "" : JSON.stringify(opts.body);
  const headers = new Map<string, string>();
  if (opts.csrfHeader) headers.set("x-csrf-token", opts.csrfHeader);
  if (opts.body !== undefined) headers.set("content-length", String(bodyText.length));
  return {
    method: "POST",
    url: "https://example.com/api/dashboard/journal/",
    headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
    cookies: { get: (name: string) => cookies.get(name) },
    text: async () => bodyText,
  } as unknown as import("next/server").NextRequest;
}

const okBody = (extra: Record<string, unknown> = {}) => ({
  date: "13. April 2026",
  title_i18n: { de: "Titel" },
  content_i18n: {
    de: [{ id: "1", type: "paragraph", content: [{ text: "Hallo" }] }],
  },
  ...extra,
});

describe("/api/dashboard/journal/ POST datum validation", () => {
  const mockQuery = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", JWT_SECRET);
    mockQuery.mockReset();
    vi.doMock("@/lib/db", () => ({
      default: { query: mockQuery, connect: vi.fn() },
    }));
    vi.doMock("@/lib/cookie-counter", () => ({
      bumpCookieSource: vi.fn(),
      deriveEnv: () => "prod",
    }));
    vi.doMock("@/lib/agenda-hashtags", () => ({
      validateHashtagsI18n: async () => ({ ok: true, value: [] }),
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("omitted datum → persists as null", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1, date: "13. April 2026", datum: null, content_i18n: { de: [{}] } }],
    });
    const csrf = await buildCsrf(1, 1);
    const { POST } = await import("./route");
    const res = await POST(
      fakeReq({
        sessionCookie: await makeToken("1", 1),
        csrfCookie: csrf,
        csrfHeader: csrf,
        body: okBody(),
      }),
    );
    expect(res.status).toBe(201);
    const insertCall = mockQuery.mock.calls[1];
    expect(insertCall[1][1]).toBeNull(); // datum param is 2nd positional
  });

  it("canonical datum → persists as string", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1, date: "13. April 2026", datum: "13.04.2026", content_i18n: { de: [{}] } }],
    });
    const csrf = await buildCsrf(1, 1);
    const { POST } = await import("./route");
    const res = await POST(
      fakeReq({
        sessionCookie: await makeToken("1", 1),
        csrfCookie: csrf,
        csrfHeader: csrf,
        body: okBody({ datum: "13.04.2026" }),
      }),
    );
    expect(res.status).toBe(201);
    expect(mockQuery.mock.calls[1][1][1]).toBe("13.04.2026");
  });

  it("empty-string datum → persists as null", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1, datum: null, content_i18n: { de: [{}] } }],
    });
    const csrf = await buildCsrf(1, 1);
    const { POST } = await import("./route");
    const res = await POST(
      fakeReq({
        sessionCookie: await makeToken("1", 1),
        csrfCookie: csrf,
        csrfHeader: csrf,
        body: okBody({ datum: "" }),
      }),
    );
    expect(res.status).toBe(201);
    expect(mockQuery.mock.calls[1][1][1]).toBeNull();
  });

  it("off-spec datum → 400, no INSERT", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
    const csrf = await buildCsrf(1, 1);
    const { POST } = await import("./route");
    const res = await POST(
      fakeReq({
        sessionCookie: await makeToken("1", 1),
        csrfCookie: csrf,
        csrfHeader: csrf,
        body: okBody({ datum: "2026-04-13" }), // ISO, not canonical
      }),
    );
    expect(res.status).toBe(400);
    expect(mockQuery).toHaveBeenCalledTimes(1); // only auth tv-check ran
  });

  it("impossible civil date (29.02.2025) → 400", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
    const csrf = await buildCsrf(1, 1);
    const { POST } = await import("./route");
    const res = await POST(
      fakeReq({
        sessionCookie: await makeToken("1", 1),
        csrfCookie: csrf,
        csrfHeader: csrf,
        body: okBody({ datum: "29.02.2025" }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
