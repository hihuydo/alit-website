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
    vi.doMock("@/lib/cookie-counter", () => ({
      bumpCookieSource: vi.fn(),
      deriveEnv: () => "prod",
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("POST default: omitted newsletter fields → show_newsletter_signup=false, intro=null", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 5 }] }); // requireAuth tv-check
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // advisory lock
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // collision check (no hit)
      .mockResolvedValueOnce({ rows: [{ id: 99, slug_de: "new", slug_fr: null, archived: false, title_i18n: { de: "t" }, kategorie_i18n: { de: "k" }, content_i18n: { de: [] }, show_newsletter_signup: false, newsletter_signup_intro_i18n: null }] }) // INSERT ... RETURNING *
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
    // INSERT call is the 4th client.query call; verify defaults in params[7]+[8]
    const insertCall = mockClient.query.mock.calls[3];
    const params = insertCall[1] as unknown[];
    expect(params[6]).toBe(false); // show_newsletter_signup default
    expect(params[7]).toBeNull(); // newsletter_signup_intro_i18n default
  });

  it("POST with invalid intro-shape (missing fr key) returns 400, no INSERT", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 5 }] });
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
          newsletter_signup_intro_i18n: { de: [] }, // missing fr
        },
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/both 'de' and 'fr' keys/);
    // No INSERT happened
    expect(mockClient.query).not.toHaveBeenCalled();
  });

  it("POST with whitespace-only paragraph in intro → empty-both collapses to column-null", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 5 }] });
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // advisory lock
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // collision
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // INSERT RETURNING
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
          newsletter_signup_intro_i18n: {
            de: [{ id: "1", type: "paragraph", content: [{ text: "   " }] }],
            fr: null,
          },
        },
      }),
    );
    expect(res.status).toBe(201);
    const params = mockClient.query.mock.calls[3][1] as unknown[];
    expect(params[7]).toBeNull(); // both locales empty → column-null
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
    vi.doMock("@/lib/cookie-counter", () => ({
      bumpCookieSource: vi.fn(),
      deriveEnv: () => "prod",
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
