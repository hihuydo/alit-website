import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SignJWT } from "jose";

const JWT_SECRET = "test-secret-at-least-32-chars-long-journal-reorder-modeAA";

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
    url: "https://example.com/api/dashboard/journal/reorder/",
    headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
    cookies: { get: (name: string) => cookies.get(name) },
    text: async () => bodyText,
  } as unknown as import("next/server").NextRequest;
}

describe("/api/dashboard/journal/reorder/ POST", () => {
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
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("inverted assignment + flips mode to manual in same transaction", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] }); // auth
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ c: 3 }] }) // COUNT
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // UPDATE id=10 → 2
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // UPDATE id=20 → 1
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // UPDATE id=30 → 0
      .mockResolvedValueOnce({ rows: [] }) // INSERT sort_mode
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const csrf = await buildCsrf(1, 1);
    const { POST } = await import("./route");
    const res = await POST(
      fakeReq({
        sessionCookie: await makeToken("1", 1),
        csrfCookie: csrf,
        csrfHeader: csrf,
        body: { ids: [10, 20, 30] },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sortMode).toBe("manual");

    // Last mutating call before COMMIT is the mode-flip INSERT
    const modeFlipCall = mockClient.query.mock.calls[5][0] as string;
    expect(modeFlipCall).toContain("'journal_sort_mode'");
    expect(modeFlipCall).toContain("'manual'");
    expect(mockClient.query.mock.calls[6][0]).toBe("COMMIT");
  });

  it("rowCount!=1 → 400 + ROLLBACK, no mode flip, no COMMIT", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ c: 1 }] }) // COUNT matches
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // stale id
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    const csrf = await buildCsrf(1, 1);
    const { POST } = await import("./route");
    const res = await POST(
      fakeReq({
        sessionCookie: await makeToken("1", 1),
        csrfCookie: csrf,
        csrfHeader: csrf,
        body: { ids: [999] },
      }),
    );
    expect(res.status).toBe(400);
    const commits = mockClient.query.mock.calls.filter((c) => c[0] === "COMMIT");
    expect(commits.length).toBe(0);
    const modeFlips = mockClient.query.mock.calls.filter(
      (c) => typeof c[0] === "string" && c[0].includes("journal_sort_mode"),
    );
    expect(modeFlips.length).toBe(0);
  });

  it("count mismatch → 409 + ROLLBACK (stale subset)", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ c: 5 }] }) // server has 5, client sent 2
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    const csrf = await buildCsrf(1, 1);
    const { POST } = await import("./route");
    const res = await POST(
      fakeReq({
        sessionCookie: await makeToken("1", 1),
        csrfCookie: csrf,
        csrfHeader: csrf,
        body: { ids: [4, 7] },
      }),
    );
    expect(res.status).toBe(409);
  });

  it("duplicate ids → 400 pre-transaction", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
    const csrf = await buildCsrf(1, 1);
    const { POST } = await import("./route");
    const res = await POST(
      fakeReq({
        sessionCookie: await makeToken("1", 1),
        csrfCookie: csrf,
        csrfHeader: csrf,
        body: { ids: [3, 3] },
      }),
    );
    expect(res.status).toBe(400);
    expect(mockClient.query).not.toHaveBeenCalled();
  });

  it("requires auth (no session → 401)", async () => {
    const { POST } = await import("./route");
    const res = await POST(fakeReq({ body: { ids: [1] } }));
    expect(res.status).toBe(401);
    expect(mockClient.query).not.toHaveBeenCalled();
  });
});
