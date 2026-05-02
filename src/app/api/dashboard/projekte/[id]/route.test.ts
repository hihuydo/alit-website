import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SignJWT } from "jose";

const JWT_SECRET = "test-secret-at-least-32-chars-long-projekte-id-route-aaaa";

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
  method: "GET" | "PUT";
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
    url: "https://example.com/api/dashboard/projekte/7/",
    headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
    cookies: { get: (name: string) => cookies.get(name) },
    text: async () => bodyText,
  } as unknown as import("next/server").NextRequest;
}

describe("/api/dashboard/projekte/[id]/ GET + PUT — newsletter-signup fields", () => {
  const mockQuery = vi.fn();
  const mockConnect = vi.fn();
  const mockClient = { query: vi.fn(), release: vi.fn() };
  const mockAuditLog = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", JWT_SECRET);
    mockQuery.mockReset();
    mockConnect.mockReset();
    mockClient.query.mockReset();
    mockClient.release.mockReset();
    mockAuditLog.mockReset();
    mockConnect.mockResolvedValue(mockClient);
    vi.doMock("@/lib/db", () => ({
      default: { query: mockQuery, connect: mockConnect },
    }));
    vi.doMock("@/lib/audit", () => ({ auditLog: mockAuditLog }));
    vi.doMock("@/lib/signups-audit", () => ({ resolveActorEmail: vi.fn().mockResolvedValue("admin@test") }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("GET returns new fields in response body", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ token_version: 5 }] }) // requireAuth
      .mockResolvedValueOnce({
        rows: [
          {
            id: 7,
            slug_de: "p",
            slug_fr: null,
            archived: false,
            title_i18n: { de: "T" },
            kategorie_i18n: { de: "K" },
            content_i18n: { de: [] },
            show_newsletter_signup: true,
            newsletter_signup_intro_i18n: { de: [{ id: "1", type: "paragraph", content: [{ text: "intro" }] }], fr: null },
          },
        ],
      });
    const { GET } = await import("./route");
    const res = await GET(
      fakeReq({ method: "GET", sessionCookie: await makeToken("42", 5) }),
      { params: Promise.resolve({ id: "7" }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.show_newsletter_signup).toBe(true);
    expect(body.data.newsletter_signup_intro_i18n.de[0].content[0].text).toBe("intro");
  });

  it("PUT Partial-safe: body without show_newsletter_signup does NOT overwrite DB (no CASE WHEN, no COALESCE trap)", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 5 }] });
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // advisory lock
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ show_newsletter_signup: true, content_i18n: { de: [] } }] }) // UPDATE RETURNING
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    const csrf = await buildCsrf(42, 5);
    const { PUT } = await import("./route");
    const res = await PUT(
      fakeReq({
        method: "PUT",
        sessionCookie: await makeToken("42", 5),
        csrfCookie: csrf,
        csrfHeader: csrf,
        body: { title_i18n: { de: "Only title changed" } },
      }),
      { params: Promise.resolve({ id: "7" }) },
    );
    expect(res.status).toBe(200);
    // Verify the UPDATE SQL contains title_i18n = but NOT show_newsletter_signup =
    // or newsletter_signup_intro_i18n = (the absent keys are preserved, not overwritten).
    const updateCall = mockClient.query.mock.calls[2];
    const sql = updateCall[0] as string;
    expect(sql).toMatch(/title_i18n = /);
    expect(sql).not.toMatch(/show_newsletter_signup = /);
    expect(sql).not.toMatch(/newsletter_signup_intro_i18n = /);
  });

  it("PUT silently drops obsolete newsletter_signup_intro_i18n key (no validator any more)", async () => {
    // Stale clients (cached browser bundle) sending the retired field
    // must not 400. The server just ignores the key — show_newsletter_signup
    // is the only newsletter-related write left.
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 5 }] });
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // lock
      .mockResolvedValueOnce({ rows: [{ slug_fr: null, slug_de: "p", show_newsletter_signup: false }] }) // snapshot
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ show_newsletter_signup: true, content_i18n: { de: [] } }] }) // UPDATE
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    const csrf = await buildCsrf(42, 5);
    const { PUT } = await import("./route");
    const res = await PUT(
      fakeReq({
        method: "PUT",
        sessionCookie: await makeToken("42", 5),
        csrfCookie: csrf,
        csrfHeader: csrf,
        body: {
          show_newsletter_signup: true,
          newsletter_signup_intro_i18n: { de: [{ id: "1", type: "paragraph", content: [{ text: "x" }] }], fr: null },
        },
      }),
      { params: Promise.resolve({ id: "7" }) },
    );
    expect(res.status).toBe(200);
    // UPDATE SQL must NOT mention newsletter_signup_intro_i18n any more.
    const updateSql = mockClient.query.mock.calls[3][0] as string;
    expect(updateSql).not.toMatch(/newsletter_signup_intro_i18n = /);
  });

  it("PUT audit event fires on show_newsletter_signup change", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 5 }] });
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // lock
      .mockResolvedValueOnce({ rows: [{ slug_fr: null, slug_de: "p", show_newsletter_signup: false }] }) // snapshot: old=false
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ show_newsletter_signup: true, content_i18n: { de: [] } }] }) // UPDATE
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    const csrf = await buildCsrf(42, 5);
    const { PUT } = await import("./route");
    await PUT(
      fakeReq({
        method: "PUT",
        sessionCookie: await makeToken("42", 5),
        csrfCookie: csrf,
        csrfHeader: csrf,
        body: { show_newsletter_signup: true },
      }),
      { params: Promise.resolve({ id: "7" }) },
    );
    expect(mockAuditLog).toHaveBeenCalledWith(
      "projekt_newsletter_signup_update",
      expect.objectContaining({
        projekt_id: 7,
        show_newsletter_signup_changed: true,
        show_newsletter_signup_new: true,
      }),
    );
  });

  it("PUT audit event silent on no-op (same value re-submitted)", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 5 }] });
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // lock
      .mockResolvedValueOnce({ rows: [{ slug_fr: null, slug_de: "p", show_newsletter_signup: true }] }) // snapshot: old=true
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ show_newsletter_signup: true, content_i18n: { de: [] } }] }) // UPDATE (same value)
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    const csrf = await buildCsrf(42, 5);
    const { PUT } = await import("./route");
    await PUT(
      fakeReq({
        method: "PUT",
        sessionCookie: await makeToken("42", 5),
        csrfCookie: csrf,
        csrfHeader: csrf,
        body: { show_newsletter_signup: true }, // unchanged
      }),
      { params: Promise.resolve({ id: "7" }) },
    );
    // No projekt_newsletter_signup_update event — the slug_fr_change branch
    // shouldn't fire either.
    expect(mockAuditLog).not.toHaveBeenCalled();
  });
});
