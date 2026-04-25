import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SignJWT } from "jose";

const JWT_SECRET = "test-secret-at-least-32-chars-long-journal-sortmode-aa";

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
    url: "https://example.com/api/dashboard/journal/sort-mode/",
    headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
    cookies: { get: (name: string) => cookies.get(name) },
    text: async () => bodyText,
  } as unknown as import("next/server").NextRequest;
}

describe("/api/dashboard/journal/sort-mode/ POST", () => {
  const mockQuery = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", JWT_SECRET);
    mockQuery.mockReset();
    vi.doMock("@/lib/db", () => ({
      default: { query: mockQuery, connect: vi.fn() },
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("mode=auto → site_settings upserted with 'auto'", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] }); // auth
    mockQuery.mockResolvedValueOnce({ rows: [] }); // upsert
    const csrf = await buildCsrf(1, 1);
    const { POST } = await import("./route");
    const res = await POST(
      fakeReq({
        sessionCookie: await makeToken("1", 1),
        csrfCookie: csrf,
        csrfHeader: csrf,
        body: { mode: "auto" },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sortMode).toBe("auto");
    const upsert = mockQuery.mock.calls[1];
    expect(upsert[1]).toEqual(["journal_sort_mode", "auto"]);
  });

  it("mode=manual → site_settings upserted with 'manual'", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const csrf = await buildCsrf(1, 1);
    const { POST } = await import("./route");
    const res = await POST(
      fakeReq({
        sessionCookie: await makeToken("1", 1),
        csrfCookie: csrf,
        csrfHeader: csrf,
        body: { mode: "manual" },
      }),
    );
    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls[1][1]).toEqual(["journal_sort_mode", "manual"]);
  });

  it("invalid mode → 400, no DB write", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
    const csrf = await buildCsrf(1, 1);
    const { POST } = await import("./route");
    const res = await POST(
      fakeReq({
        sessionCookie: await makeToken("1", 1),
        csrfCookie: csrf,
        csrfHeader: csrf,
        body: { mode: "custom" },
      }),
    );
    expect(res.status).toBe(400);
    expect(mockQuery).toHaveBeenCalledTimes(1); // only auth
  });

  it("missing body → 400", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
    const csrf = await buildCsrf(1, 1);
    const { POST } = await import("./route");
    const res = await POST(
      fakeReq({
        sessionCookie: await makeToken("1", 1),
        csrfCookie: csrf,
        csrfHeader: csrf,
        body: {},
      }),
    );
    expect(res.status).toBe(400);
  });

  it("requires auth (no session → 401)", async () => {
    const { POST } = await import("./route");
    const res = await POST(fakeReq({ body: { mode: "auto" } }));
    expect(res.status).toBe(401);
  });
});
