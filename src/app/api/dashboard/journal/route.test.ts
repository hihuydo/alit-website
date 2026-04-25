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
  datum: "13.04.2026",
  title_i18n: { de: "Titel" },
  content_i18n: {
    de: [{ id: "1", type: "paragraph", content: [{ text: "Hallo" }] }],
  },
  ...extra,
});

describe("/api/dashboard/journal/ POST datum contract", () => {
  const mockQuery = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", JWT_SECRET);
    mockQuery.mockReset();
    vi.doMock("@/lib/db", () => ({
      default: { query: mockQuery, connect: vi.fn() },
    }));
    vi.doMock("@/lib/agenda-hashtags", () => ({
      validateHashtagsI18n: async () => ({ ok: true, value: [] }),
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("datum canonical → persists; legacy `date` column not referenced in INSERT", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1, datum: "13.04.2026", content_i18n: { de: [{}] } }],
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
    const insertSql = mockQuery.mock.calls[1][0] as string;
    const insertParams = mockQuery.mock.calls[1][1] as unknown[];
    // Phase-2a: INSERT only touches `datum`, `date` column is dormant and
    // nullable (ALTER DROP NOT NULL in ensureSchema). Phase-2b will DROP
    // COLUMN. Param order is (datum, author, title_border, ...).
    expect(insertSql).toContain("INSERT INTO journal_entries (datum,");
    expect(insertSql).not.toContain(" date,");
    expect(insertParams[0]).toBe("13.04.2026");
  });

  it("explicit `date` body field is ignored (no longer accepted from the editor)", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1, datum: "13.04.2026", content_i18n: { de: [{}] } }],
    });
    const csrf = await buildCsrf(1, 1);
    const { POST } = await import("./route");
    const res = await POST(
      fakeReq({
        sessionCookie: await makeToken("1", 1),
        csrfCookie: csrf,
        csrfHeader: csrf,
        body: okBody({ date: "Sondertext" }),
      }),
    );
    expect(res.status).toBe(201);
    // date in body is silently ignored — INSERT uses datum for both columns.
    const insertParams = mockQuery.mock.calls[1][1] as unknown[];
    expect(insertParams[0]).toBe("13.04.2026");
  });

  it("omitted datum → 400, no INSERT (datum is now required)", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
    const csrf = await buildCsrf(1, 1);
    const { POST } = await import("./route");
    const res = await POST(
      fakeReq({
        sessionCookie: await makeToken("1", 1),
        csrfCookie: csrf,
        csrfHeader: csrf,
        body: {
          title_i18n: { de: "Titel" },
          content_i18n: { de: [{ id: "1", type: "paragraph", content: [{ text: "x" }] }] },
        },
      }),
    );
    expect(res.status).toBe(400);
    expect(mockQuery).toHaveBeenCalledTimes(1); // only auth tv-check ran
  });

  it("empty-string datum → 400 (canonical gate rejects it)", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
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
    expect(res.status).toBe(400);
  });

  it("off-spec datum (ISO) → 400, no INSERT", async () => {
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
