import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";
import { SignJWT } from "jose";

/**
 * requireAuth integration tests — mocks the DB (pool) so we can exercise
 * the three-gate pipeline (JWT verify → token_version check → CSRF) in
 * isolation. Uses real HMAC helpers from csrf.ts for the CSRF branch so
 * the expected-vs-actual token comparison stays wire-accurate.
 */

const JWT_SECRET =
  "test-secret-at-least-32-chars-long-for-hs256-requireauth";

async function makeToken(
  sub: string,
  secret: string,
  tv: number,
): Promise<string> {
  return new SignJWT({ sub, tv })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(new TextEncoder().encode(secret));
}

function fakeReq(opts: {
  method?: string;
  sessionCookie?: string;
  csrfHeader?: string;
  csrfCookie?: string;
}) {
  const cookies = new Map<string, { value: string }>();
  if (opts.sessionCookie) {
    cookies.set("__Host-session", { value: opts.sessionCookie });
    cookies.set("session", { value: opts.sessionCookie });
  }
  if (opts.csrfCookie) {
    cookies.set("__Host-csrf", { value: opts.csrfCookie });
    cookies.set("csrf", { value: opts.csrfCookie });
  }
  const headers = new Map<string, string>();
  if (opts.csrfHeader) headers.set("x-csrf-token", opts.csrfHeader);
  return {
    method: opts.method ?? "GET",
    headers: {
      get: (name: string) => headers.get(name.toLowerCase()) ?? null,
    },
    cookies: {
      get: (name: string) => cookies.get(name),
    },
  } as unknown as import("next/server").NextRequest;
}

describe("requireAuth (Sprint T1-S)", () => {
  const mockQuery = vi.fn();
  const mockBump = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", JWT_SECRET);
    mockQuery.mockReset();
    mockBump.mockReset();
    vi.doMock("./db", () => ({ default: { query: mockQuery } }));
    vi.doMock("./cookie-counter", () => ({
      bumpCookieSource: mockBump,
      deriveEnv: () => "prod",
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.doUnmock("./db");
    vi.doUnmock("./cookie-counter");
  });

  describe("JWT verify gate (gate 1)", () => {
    it("returns 401 Unauthorized when no session cookie present", async () => {
      const { requireAuth } = await import("./api-helpers");
      const result = await requireAuth(fakeReq({ method: "GET" }));
      expect(result).toBeInstanceOf(NextResponse);
      expect((result as NextResponse).status).toBe(401);
      const body = await (result as NextResponse).json();
      expect(body).toMatchObject({ success: false, error: "Unauthorized" });
    });

    it("returns 401 when JWT is invalid", async () => {
      const { requireAuth } = await import("./api-helpers");
      const result = await requireAuth(
        fakeReq({ method: "GET", sessionCookie: "garbage" }),
      );
      expect((result as NextResponse).status).toBe(401);
    });
  });

  describe("token_version gate (gate 2)", () => {
    it("returns 401 Session expired on tv mismatch (JWT.tv=3, DB.tv=4)", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 4 }] });
      const { requireAuth } = await import("./api-helpers");
      const token = await makeToken("42", JWT_SECRET, 3);
      const result = await requireAuth(
        fakeReq({ method: "GET", sessionCookie: token }),
      );
      expect((result as NextResponse).status).toBe(401);
      const body = await (result as NextResponse).json();
      expect(body).toMatchObject({ success: false, error: "Session expired" });
    });

    it("accepts legacy JWT without tv (validates as 0) when DB also returns 0", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // missing row → 0
      const { requireAuth } = await import("./api-helpers");
      // Legacy JWT: construct without tv by casting
      const legacy = await new SignJWT({ sub: "42" })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("24h")
        .sign(new TextEncoder().encode(JWT_SECRET));
      const result = await requireAuth(
        fakeReq({ method: "GET", sessionCookie: legacy }),
      );
      expect(result).not.toBeInstanceOf(NextResponse);
      expect((result as { userId: number; tokenVersion: number }).tokenVersion).toBe(0);
    });

    it("does not bump cookie-counter on tv-mismatch 401", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 99 }] });
      const { requireAuth } = await import("./api-helpers");
      const token = await makeToken("42", JWT_SECRET, 1);
      await requireAuth(fakeReq({ method: "GET", sessionCookie: token }));
      expect(mockBump).not.toHaveBeenCalled();
    });
  });

  describe("CSRF gate (gate 3) — state-changing methods only", () => {
    it("GET skips CSRF validation (no cookie/header needed)", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 7 }] });
      const { requireAuth } = await import("./api-helpers");
      const token = await makeToken("42", JWT_SECRET, 7);
      const result = await requireAuth(
        fakeReq({ method: "GET", sessionCookie: token }),
      );
      expect(result).not.toBeInstanceOf(NextResponse);
    });

    it("POST returns 403 csrf_missing when CSRF cookie absent", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 7 }] });
      const { requireAuth } = await import("./api-helpers");
      const token = await makeToken("42", JWT_SECRET, 7);
      const result = await requireAuth(
        fakeReq({ method: "POST", sessionCookie: token }),
      );
      expect((result as NextResponse).status).toBe(403);
      const body = await (result as NextResponse).json();
      expect(body).toMatchObject({
        success: false,
        error: "CSRF token missing",
        code: "csrf_missing",
      });
    });

    it("POST returns 403 csrf_missing when header absent but cookie present", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 7 }] });
      const { requireAuth } = await import("./api-helpers");
      const token = await makeToken("42", JWT_SECRET, 7);
      const result = await requireAuth(
        fakeReq({
          method: "POST",
          sessionCookie: token,
          csrfCookie: "some-token",
        }),
      );
      const body = await (result as NextResponse).json();
      expect(body.code).toBe("csrf_missing");
    });

    it("POST returns 403 csrf_invalid when header and cookie present but HMAC invalid", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 7 }] });
      const { requireAuth } = await import("./api-helpers");
      const token = await makeToken("42", JWT_SECRET, 7);
      const result = await requireAuth(
        fakeReq({
          method: "POST",
          sessionCookie: token,
          csrfCookie: "forged",
          csrfHeader: "forged",
        }),
      );
      expect((result as NextResponse).status).toBe(403);
      const body = await (result as NextResponse).json();
      expect(body).toMatchObject({
        success: false,
        error: "Invalid CSRF token",
        code: "csrf_invalid",
      });
    });

    it("POST succeeds when CSRF HMAC matches (userId, tv)", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 7 }] });
      const { buildCsrfToken } = await import("./csrf");
      const { requireAuth } = await import("./api-helpers");
      const token = await makeToken("42", JWT_SECRET, 7);
      const csrfToken = await buildCsrfToken(JWT_SECRET, 42, 7);
      const result = await requireAuth(
        fakeReq({
          method: "POST",
          sessionCookie: token,
          csrfCookie: csrfToken,
          csrfHeader: csrfToken,
        }),
      );
      expect(result).not.toBeInstanceOf(NextResponse);
      expect((result as { userId: number }).userId).toBe(42);
    });

    it("does not bump cookie-counter on CSRF 403", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 7 }] });
      const { requireAuth } = await import("./api-helpers");
      const token = await makeToken("42", JWT_SECRET, 7);
      await requireAuth(fakeReq({ method: "POST", sessionCookie: token }));
      expect(mockBump).not.toHaveBeenCalled();
    });

    it("PATCH, PUT, DELETE also require CSRF (same as POST)", async () => {
      for (const method of ["PATCH", "PUT", "DELETE"]) {
        mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 7 }] });
        const { requireAuth } = await import("./api-helpers");
        const token = await makeToken("42", JWT_SECRET, 7);
        const result = await requireAuth(
          fakeReq({ method, sessionCookie: token }),
        );
        expect((result as NextResponse).status).toBe(403);
      }
    });
  });

  describe("happy path returns full context + bumps counter", () => {
    it("GET with valid session → {userId, tokenVersion, source} + bump", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 2 }] });
      const { requireAuth } = await import("./api-helpers");
      const token = await makeToken("42", JWT_SECRET, 2);
      const result = await requireAuth(
        fakeReq({ method: "GET", sessionCookie: token }),
      );
      expect(result).toEqual({
        userId: 42,
        tokenVersion: 2,
        source: "primary",
      });
      expect(mockBump).toHaveBeenCalledOnce();
      expect(mockBump).toHaveBeenCalledWith("primary");
    });
  });
});
