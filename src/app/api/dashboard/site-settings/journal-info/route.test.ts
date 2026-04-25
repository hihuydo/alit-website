import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";
import { SignJWT } from "jose";

const JWT_SECRET =
  "test-secret-at-least-32-chars-long-journal-info-route-aa";

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
    headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
    cookies: { get: (name: string) => cookies.get(name) },
    text: async () => bodyText,
  } as unknown as import("next/server").NextRequest;
}

describe("/api/dashboard/site-settings/journal-info/", () => {
  const mockQuery = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", JWT_SECRET);
    mockQuery.mockReset();
    vi.doMock("@/lib/db", () => ({ default: { query: mockQuery } }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.doUnmock("@/lib/db");
  });

  describe("GET", () => {
    it("401 when no session cookie", async () => {
      const { GET } = await import("./route");
      const res = await GET(fakeReq({ method: "GET" }));
      expect(res).toBeInstanceOf(NextResponse);
      expect(res.status).toBe(401);
    });

    it("200 returns {de:null, fr:null} when row absent", async () => {
      // 1st query: token_version lookup in requireAuth
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 5 }] });
      // 2nd query: route SELECT
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const { GET } = await import("./route");
      const res = await GET(
        fakeReq({ method: "GET", sessionCookie: await makeToken("42", 5) }),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ success: true, data: { de: null, fr: null } });
    });

    it("200 returns parsed JSON when row present", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 5 }] });
      const stored = {
        de: [{ id: "1", type: "paragraph", content: [{ text: "Admin DE" }] }],
        fr: null,
      };
      mockQuery.mockResolvedValueOnce({ rows: [{ value: JSON.stringify(stored) }] });
      const { GET } = await import("./route");
      const res = await GET(
        fakeReq({ method: "GET", sessionCookie: await makeToken("42", 5) }),
      );
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual(stored);
    });
  });

  describe("PUT", () => {
    it("401 when no session cookie", async () => {
      const { PUT } = await import("./route");
      const res = await PUT(fakeReq({ method: "PUT", body: { de: null, fr: null } }));
      expect(res.status).toBe(401);
    });

    it("403 when CSRF token missing", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 5 }] });
      const { PUT } = await import("./route");
      const res = await PUT(
        fakeReq({
          method: "PUT",
          sessionCookie: await makeToken("42", 5),
          body: { de: null, fr: null },
        }),
      );
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe("csrf_missing");
    });

    it("happy path: UPSERT persists normalized value", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 5 }] }); // requireAuth
      mockQuery.mockResolvedValueOnce({ rows: [] }); // INSERT ... ON CONFLICT
      const csrf = await buildCsrf(42, 5);
      const { PUT } = await import("./route");
      const deContent = [
        { id: "1", type: "paragraph", content: [{ text: "Admin DE" }] },
      ];
      const res = await PUT(
        fakeReq({
          method: "PUT",
          sessionCookie: await makeToken("42", 5),
          csrfCookie: csrf,
          csrfHeader: csrf,
          body: { de: deContent, fr: null },
        }),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual({ de: deContent, fr: null });
      // The 2nd query (INSERT) was called with JSON string in params
      const upsertCall = mockQuery.mock.calls[1];
      expect(upsertCall[0]).toMatch(/INSERT INTO site_settings/);
      expect(JSON.parse(upsertCall[1][1])).toEqual({ de: deContent, fr: null });
    });

    it("400 on invalid block structure", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 5 }] });
      const csrf = await buildCsrf(42, 5);
      const { PUT } = await import("./route");
      const res = await PUT(
        fakeReq({
          method: "PUT",
          sessionCookie: await makeToken("42", 5),
          csrfCookie: csrf,
          csrfHeader: csrf,
          body: { de: [{ id: "x", type: "not-a-real-type", content: [] }], fr: null },
        }),
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toMatch(/Ungültiges Format \(de\)/);
    });

    it("400 on malformed body {} — cannot silently wipe stored content", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 5 }] });
      const csrf = await buildCsrf(42, 5);
      const { PUT } = await import("./route");
      const res = await PUT(
        fakeReq({
          method: "PUT",
          sessionCookie: await makeToken("42", 5),
          csrfCookie: csrf,
          csrfHeader: csrf,
          body: {},
        }),
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/beide Locales/);
      // UPSERT must NOT have run
      expect(mockQuery.mock.calls.length).toBe(1);
    });

    it("400 on array body — cannot silently wipe stored content", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 5 }] });
      const csrf = await buildCsrf(42, 5);
      const { PUT } = await import("./route");
      const res = await PUT(
        fakeReq({
          method: "PUT",
          sessionCookie: await makeToken("42", 5),
          csrfCookie: csrf,
          csrfHeader: csrf,
          body: [],
        }),
      );
      expect(res.status).toBe(400);
      expect(mockQuery.mock.calls.length).toBe(1);
    });

    it("400 when locale value is a string/number instead of array or null", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 5 }] });
      const csrf = await buildCsrf(42, 5);
      const { PUT } = await import("./route");
      const res = await PUT(
        fakeReq({
          method: "PUT",
          sessionCookie: await makeToken("42", 5),
          csrfCookie: csrf,
          csrfHeader: csrf,
          body: { de: "nope", fr: null },
        }),
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/null oder Array/);
    });

    it("happy path with explicit {de:null, fr:null} is allowed (full reset to dict fallback)", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 5 }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const csrf = await buildCsrf(42, 5);
      const { PUT } = await import("./route");
      const res = await PUT(
        fakeReq({
          method: "PUT",
          sessionCookie: await makeToken("42", 5),
          csrfCookie: csrf,
          csrfHeader: csrf,
          body: { de: null, fr: null },
        }),
      );
      expect(res.status).toBe(200);
      const upsertCall = mockQuery.mock.calls[1];
      expect(JSON.parse(upsertCall[1][1])).toEqual({ de: null, fr: null });
    });

    it("normalizes empty-paragraph to null on save", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 5 }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const csrf = await buildCsrf(42, 5);
      const { PUT } = await import("./route");
      const res = await PUT(
        fakeReq({
          method: "PUT",
          sessionCookie: await makeToken("42", 5),
          csrfCookie: csrf,
          csrfHeader: csrf,
          body: {
            de: [{ id: "1", type: "paragraph", content: [{ text: "   " }] }],
            fr: null,
          },
        }),
      );
      expect(res.status).toBe(200);
      const upsertCall = mockQuery.mock.calls[1];
      expect(JSON.parse(upsertCall[1][1])).toEqual({ de: null, fr: null });
    });
  });
});
