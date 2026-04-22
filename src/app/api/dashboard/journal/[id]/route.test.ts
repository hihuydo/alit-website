import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SignJWT } from "jose";

const JWT_SECRET = "test-secret-at-least-32-chars-long-journal-id-datum-aa";

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
    method: "PUT",
    url: "https://example.com/api/dashboard/journal/7/",
    headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
    cookies: { get: (name: string) => cookies.get(name) },
    text: async () => bodyText,
  } as unknown as import("next/server").NextRequest;
}

const params = Promise.resolve({ id: "7" });

describe("/api/dashboard/journal/[id]/ PUT datum validation", () => {
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

  it("canonical datum → SET clause includes `datum = $N`", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] }); // auth
    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ id: 7, datum: "13.04.2026", content_i18n: { de: [] } }],
    });
    const csrf = await buildCsrf(1, 1);
    const { PUT } = await import("./route");
    const res = await PUT(
      fakeReq({
        sessionCookie: await makeToken("1", 1),
        csrfCookie: csrf,
        csrfHeader: csrf,
        body: { datum: "13.04.2026" },
      }),
      { params },
    );
    expect(res.status).toBe(200);
    const updateSql = mockQuery.mock.calls[1][0] as string;
    const updateParams = mockQuery.mock.calls[1][1] as unknown[];
    expect(updateSql).toContain("datum = $");
    // First positional param should be the canonical datum
    expect(updateParams[0]).toBe("13.04.2026");
  });

  it("null datum → persists as NULL (clear)", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ id: 7, datum: null, content_i18n: { de: [] } }],
    });
    const csrf = await buildCsrf(1, 1);
    const { PUT } = await import("./route");
    const res = await PUT(
      fakeReq({
        sessionCookie: await makeToken("1", 1),
        csrfCookie: csrf,
        csrfHeader: csrf,
        body: { datum: null },
      }),
      { params },
    );
    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls[1][1][0]).toBeNull();
  });

  it("empty-string datum → persists as NULL", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ id: 7, datum: null, content_i18n: { de: [] } }],
    });
    const csrf = await buildCsrf(1, 1);
    const { PUT } = await import("./route");
    const res = await PUT(
      fakeReq({
        sessionCookie: await makeToken("1", 1),
        csrfCookie: csrf,
        csrfHeader: csrf,
        body: { datum: "" },
      }),
      { params },
    );
    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls[1][1][0]).toBeNull();
  });

  it("off-spec datum (ISO form) → 400, no UPDATE", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
    const csrf = await buildCsrf(1, 1);
    const { PUT } = await import("./route");
    const res = await PUT(
      fakeReq({
        sessionCookie: await makeToken("1", 1),
        csrfCookie: csrf,
        csrfHeader: csrf,
        body: { datum: "2026-04-13" },
      }),
      { params },
    );
    expect(res.status).toBe(400);
    expect(mockQuery).toHaveBeenCalledTimes(1); // only auth tv-check
  });

  it("impossible civil date (29.02.2025) → 400", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
    const csrf = await buildCsrf(1, 1);
    const { PUT } = await import("./route");
    const res = await PUT(
      fakeReq({
        sessionCookie: await makeToken("1", 1),
        csrfCookie: csrf,
        csrfHeader: csrf,
        body: { datum: "29.02.2025" },
      }),
      { params },
    );
    expect(res.status).toBe(400);
  });

  it("omitted datum with only other fields → SET includes those fields, not datum/date", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ id: 7, datum: "01.01.2026", content_i18n: { de: [] } }],
    });
    const csrf = await buildCsrf(1, 1);
    const { PUT } = await import("./route");
    const res = await PUT(
      fakeReq({
        sessionCookie: await makeToken("1", 1),
        csrfCookie: csrf,
        csrfHeader: csrf,
        body: { author: "Neuer Autor" }, // only author change, no datum
      }),
      { params },
    );
    expect(res.status).toBe(200);
    const updateSql = mockQuery.mock.calls[1][0] as string;
    expect(updateSql).not.toContain("datum =");
    expect(updateSql).not.toContain("date =");
    expect(updateSql).toContain("author =");
  });

  it("canonical datum → SET clause updates only `datum` (Phase-2a, no more date mirror)", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ id: 7, datum: "13.04.2026", content_i18n: { de: [] } }],
    });
    const csrf = await buildCsrf(1, 1);
    const { PUT } = await import("./route");
    const res = await PUT(
      fakeReq({
        sessionCookie: await makeToken("1", 1),
        csrfCookie: csrf,
        csrfHeader: csrf,
        body: { datum: "13.04.2026" },
      }),
      { params },
    );
    expect(res.status).toBe(200);
    const updateSql = mockQuery.mock.calls[1][0] as string;
    expect(updateSql).toContain("datum = $1");
    // Phase-2a: legacy date column no longer touched by UPDATE.
    expect(updateSql).not.toContain("date = ");
    const updateParams = mockQuery.mock.calls[1][1] as unknown[];
    expect(updateParams[0]).toBe("13.04.2026");
  });

  it("null datum clears `datum` only (legacy `date` column untouched and now nullable)", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ id: 7, datum: null, content_i18n: { de: [] } }],
    });
    const csrf = await buildCsrf(1, 1);
    const { PUT } = await import("./route");
    const res = await PUT(
      fakeReq({
        sessionCookie: await makeToken("1", 1),
        csrfCookie: csrf,
        csrfHeader: csrf,
        body: { datum: null },
      }),
      { params },
    );
    expect(res.status).toBe(200);
    const updateSql = mockQuery.mock.calls[1][0] as string;
    expect(updateSql).toContain("datum = $1");
    expect(updateSql).not.toContain("date = ");
    const updateParams = mockQuery.mock.calls[1][1] as unknown[];
    expect(updateParams[0]).toBeNull();
  });
});
