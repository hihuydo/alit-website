import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";
import { SignJWT } from "jose";

const JWT_SECRET = "test-secret-at-least-32-chars-long-projekte-newsletter-aaaa";

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
  method: "GET" | "POST" | "PUT";
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
    method: opts.method,
    url: "https://example.com/api/dashboard/projekte/",
    headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
    cookies: { get: (name: string) => cookies.get(name) },
    text: async () => bodyText,
  } as unknown as import("next/server").NextRequest;
}

describe("/api/dashboard/projekte/ (POST newsletter-signup fields)", () => {
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
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("POST default: omitted show_newsletter_signup → false (intro field gone)", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 5 }] });
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // advisory lock
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // collision check (no hit)
      .mockResolvedValueOnce({ rows: [{ id: 99, slug_de: "new", slug_fr: null, archived: false, title_i18n: { de: "t" }, kategorie_i18n: { de: "k" }, content_i18n: { de: [] }, show_newsletter_signup: false }] }) // INSERT ... RETURNING *
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const csrf = await buildCsrf(42, 5);
    const { POST } = await import("./route");
    const res = await POST(
      fakeReq({
        method: "POST",
        sessionCookie: await makeToken("42", 5),
        csrfCookie: csrf,
        csrfHeader: csrf,
        body: {
          slug_de: "new-projekt",
          title_i18n: { de: "Titel" },
          kategorie_i18n: { de: "Kategorie" },
        },
      }),
    );
    expect(res.status).toBe(201);
    // INSERT call is the 4th client.query call; verify defaults
    const insertCall = mockClient.query.mock.calls[3];
    const params = insertCall[1] as unknown[];
    expect(params).toHaveLength(7); // no intro param anymore
    expect(params[6]).toBe(false); // show_newsletter_signup default
  });

  it("POST silently ignores client-sent newsletter_signup_intro_i18n (field retired)", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 5 }] });
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // advisory lock
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // collision
      .mockResolvedValueOnce({ rows: [{ id: 99 }] }) // INSERT RETURNING
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    const csrf = await buildCsrf(42, 5);
    const { POST } = await import("./route");
    const res = await POST(
      fakeReq({
        method: "POST",
        sessionCookie: await makeToken("42", 5),
        csrfCookie: csrf,
        csrfHeader: csrf,
        body: {
          slug_de: "x",
          title_i18n: { de: "t" },
          kategorie_i18n: { de: "k" },
          newsletter_signup_intro_i18n: { de: [{ id: "1", type: "paragraph", content: [{ text: "ignored" }] }] },
        },
      }),
    );
    // Stale clients sending the obsolete field still succeed — server just
    // drops it (no validator any more). 201 + 7-param INSERT.
    expect(res.status).toBe(201);
    const insertCall = mockClient.query.mock.calls[3];
    const params = insertCall[1] as unknown[];
    expect(params).toHaveLength(7);
  });
});

describe("/api/dashboard/projekte/ GET", () => {
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

  it("GET round-trip: new fields present in response items", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 5 }] }); // requireAuth
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          slug_de: "p",
          slug_fr: null,
          archived: false,
          sort_order: 0,
          title_i18n: { de: "T" },
          kategorie_i18n: { de: "K" },
          content_i18n: { de: [] },
          show_newsletter_signup: true,
          newsletter_signup_intro_i18n: { de: [{ id: "1", type: "paragraph", content: [{ text: "hi" }] }], fr: null },
        },
      ],
    });
    const { GET } = await import("./route");
    const res = await GET(
      fakeReq({ method: "GET", sessionCookie: await makeToken("42", 5) }),
    );
    expect(res).toBeInstanceOf(NextResponse);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data[0].show_newsletter_signup).toBe(true);
    expect(body.data[0].newsletter_signup_intro_i18n).toBeDefined();
    expect(body.data[0].newsletter_signup_intro_i18n.de[0].content[0].text).toBe("hi");
  });
});
