import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SignJWT } from "jose";

const JWT_SECRET = "test-secret-at-least-32-chars-long-agenda-reorder-aaaaa";

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
    url: "https://example.com/api/dashboard/agenda/reorder/",
    headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
    cookies: { get: (name: string) => cookies.get(name) },
    text: async () => bodyText,
  } as unknown as import("next/server").NextRequest;
}

describe("/api/dashboard/agenda/reorder/ POST", () => {
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

  it("inverted assignment: ids[0] gets n-1, ids[n-1] gets 0 (display DESC)", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ c: 3 }] }) // COUNT
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
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
    // calls[0]=BEGIN, calls[1]=COUNT, calls[2..4]=UPDATEs, calls[5]=COMMIT
    // n=3: ids[0]=10 → sort_order=2, ids[1]=20 → 1, ids[2]=30 → 0
    expect(mockClient.query.mock.calls[2]).toEqual([
      "UPDATE agenda_items SET sort_order = $1 WHERE id = $2",
      [2, 10],
    ]);
    expect(mockClient.query.mock.calls[3]).toEqual([
      "UPDATE agenda_items SET sort_order = $1 WHERE id = $2",
      [1, 20],
    ]);
    expect(mockClient.query.mock.calls[4]).toEqual([
      "UPDATE agenda_items SET sort_order = $1 WHERE id = $2",
      [0, 30],
    ]);
  });

  it("requires auth (no session → 401)", async () => {
    const { POST } = await import("./route");
    const res = await POST(fakeReq({ body: { ids: [1] } }));
    expect(res.status).toBe(401);
    expect(mockClient.query).not.toHaveBeenCalled();
  });

  it("empty ids array → 400", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
    const csrf = await buildCsrf(1, 1);
    const { POST } = await import("./route");
    const res = await POST(
      fakeReq({
        sessionCookie: await makeToken("1", 1),
        csrfCookie: csrf,
        csrfHeader: csrf,
        body: { ids: [] },
      }),
    );
    expect(res.status).toBe(400);
    expect(mockClient.query).not.toHaveBeenCalled();
  });

  it("rowCount!=1 (stale id) → 400 + ROLLBACK", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ c: 1 }] }) // COUNT matches ids.length
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
  });

  it("duplicate ids → 400 pre-transaction, no DB touched", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
    const csrf = await buildCsrf(1, 1);
    const { POST } = await import("./route");
    const res = await POST(
      fakeReq({
        sessionCookie: await makeToken("1", 1),
        csrfCookie: csrf,
        csrfHeader: csrf,
        body: { ids: [5, 5, 7] },
      }),
    );
    expect(res.status).toBe(400);
    expect(mockClient.query).not.toHaveBeenCalled();
  });

  it("count mismatch (stale subset) → 409 + ROLLBACK", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ c: 5 }] }) // server has 5 rows, client sent 3
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
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
    expect(res.status).toBe(409);
    const rollbacks = mockClient.query.mock.calls.filter((c) => c[0] === "ROLLBACK");
    expect(rollbacks.length).toBe(1);
  });

  it("rejects non-integer id with 400 (Number.isInteger)", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
    const csrf = await buildCsrf(1, 1);
    const { POST } = await import("./route");
    const res = await POST(
      fakeReq({
        sessionCookie: await makeToken("1", 1),
        csrfCookie: csrf,
        csrfHeader: csrf,
        body: { ids: [1.5, 2] },
      }),
    );
    expect(res.status).toBe(400);
    expect(mockClient.query).not.toHaveBeenCalled();
  });
});
