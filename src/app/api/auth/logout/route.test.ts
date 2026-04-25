import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";

const JWT_SECRET =
  "test-secret-at-least-32-chars-long-logout-route-test-abc";

async function makeToken(sub: string, tv: number | undefined): Promise<string> {
  const payload: Record<string, unknown> = { sub };
  if (tv !== undefined) payload.tv = tv;
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(new TextEncoder().encode(JWT_SECRET));
}

async function buildCsrfFor(userId: number, tv: number): Promise<string> {
  const { buildCsrfToken } = await import("@/lib/csrf");
  return buildCsrfToken(JWT_SECRET, userId, tv);
}

function makeReq(opts: {
  sessionCookie?: string;
  csrfCookie?: string;
  csrfHeader?: string;
}): NextRequest {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-real-ip": "1.2.3.4",
  };
  if (opts.csrfHeader) headers["x-csrf-token"] = opts.csrfHeader;

  const cookieParts: string[] = [];
  if (opts.sessionCookie) cookieParts.push(`__Host-session=${opts.sessionCookie}`);
  if (opts.csrfCookie) cookieParts.push(`__Host-csrf=${opts.csrfCookie}`);
  if (cookieParts.length) headers["cookie"] = cookieParts.join("; ");

  return new NextRequest(new URL("https://example.com/api/auth/logout"), {
    method: "POST",
    headers,
  });
}

describe("POST /api/auth/logout", () => {
  const mockQuery = vi.fn();
  const mockBump = vi.fn();
  const mockAudit = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", JWT_SECRET);
    mockQuery.mockReset();
    mockBump.mockReset();
    mockAudit.mockReset();
    vi.doMock("@/lib/db", () => ({ default: { query: mockQuery } }));
    vi.doMock("@/lib/session-version", () => ({
      getTokenVersion: async (_userId: number, _env: string) => {
        // Replay the first mocked DB query result
        const { rows } = await mockQuery();
        return rows.length === 0 ? 0 : rows[0].token_version;
      },
      bumpTokenVersionForLogout: mockBump,
    }));
    vi.doMock("@/lib/audit", () => ({
      auditLog: mockAudit,
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.doUnmock("@/lib/db");
    vi.doUnmock("@/lib/session-version");
    vi.doUnmock("@/lib/audit");
  });

  describe("idempotent no-session paths", () => {
    it("200 + clear cookies when no cookies sent (double-click retry)", async () => {
      const { POST } = await import("./route");
      const res = await POST(makeReq({}));
      expect(res.status).toBe(200);
      const setCookies = res.headers.getSetCookie();
      expect(setCookies.some((c) => c.startsWith("__Host-session="))).toBe(true);
      expect(setCookies.some((c) => c.startsWith("__Host-csrf="))).toBe(true);
      // bump must not have fired
      expect(mockBump).not.toHaveBeenCalled();
      // audit must not have fired (nothing to audit)
      expect(mockAudit).not.toHaveBeenCalled();
    });

    it("200 + clear when JWT invalid/garbage", async () => {
      const { POST } = await import("./route");
      const res = await POST(makeReq({ sessionCookie: "garbage" }));
      expect(res.status).toBe(200);
      expect(mockBump).not.toHaveBeenCalled();
    });

    it("200 + clear on tv mismatch (stale session after another tab logout)", async () => {
      // getTokenVersion returns 5, JWT says tv=3
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 5 }] });
      const { POST } = await import("./route");
      const token = await makeToken("42", 3);
      const res = await POST(makeReq({ sessionCookie: token }));
      expect(res.status).toBe(200);
      expect(mockBump).not.toHaveBeenCalled();
    });
  });

  describe("CSRF failure propagates (no silent logout via forgery)", () => {
    it("403 csrf_missing when session ok but CSRF absent", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 7 }] });
      const { POST } = await import("./route");
      const token = await makeToken("42", 7);
      const res = await POST(makeReq({ sessionCookie: token }));
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe("csrf_missing");
      // Did NOT bump
      expect(mockBump).not.toHaveBeenCalled();
    });

    it("403 csrf_invalid when header/cookie mismatch HMAC", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 7 }] });
      const { POST } = await import("./route");
      const token = await makeToken("42", 7);
      const res = await POST(
        makeReq({
          sessionCookie: token,
          csrfHeader: "forged",
          csrfCookie: "forged",
        }),
      );
      expect(res.status).toBe(403);
      expect(mockBump).not.toHaveBeenCalled();
    });
  });

  describe("happy path — valid session bumps tv + clears + audits", () => {
    it("200 + bumpTokenVersionForLogout + audit + clear cookies", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 7 }] });
      mockBump.mockResolvedValueOnce(8);
      const { POST } = await import("./route");
      const token = await makeToken("42", 7);
      const csrfToken = await buildCsrfFor(42, 7);

      const res = await POST(
        makeReq({
          sessionCookie: token,
          csrfCookie: csrfToken,
          csrfHeader: csrfToken,
        }),
      );

      expect(res.status).toBe(200);
      expect(mockBump).toHaveBeenCalledTimes(1);
      expect(mockBump).toHaveBeenCalledWith(42, "prod", 7);
      expect(mockAudit).toHaveBeenCalledWith("logout", {
        ip: "1.2.3.4",
        user_id: 42,
      });
      // Clear-cookies headers present
      const setCookies = res.headers.getSetCookie();
      const session = setCookies.find((c) => c.startsWith("__Host-session="));
      const csrf = setCookies.find((c) => c.startsWith("__Host-csrf="));
      expect(session).toMatch(/Max-Age=0/i);
      expect(csrf).toMatch(/Max-Age=0/i);
    });

    it("still 200 + clear on TOCTOU conflict (bumpTokenVersionForLogout → null)", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 7 }] });
      mockBump.mockResolvedValueOnce(null); // concurrent dual-tab lost
      const { POST } = await import("./route");
      const token = await makeToken("42", 7);
      const csrfToken = await buildCsrfFor(42, 7);

      const res = await POST(
        makeReq({
          sessionCookie: token,
          csrfCookie: csrfToken,
          csrfHeader: csrfToken,
        }),
      );

      expect(res.status).toBe(200);
      // Cookies still cleared
      expect(res.headers.getSetCookie().some((c) => c.includes("Max-Age=0"))).toBe(true);
    });

    it("legacy JWT (no tv claim) takes the upsert/INSERT path via tv=0", async () => {
      // getTokenVersion returns 0 (missing row); JWT.tv is also 0
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockBump.mockResolvedValueOnce(1);
      const { POST } = await import("./route");
      const legacyToken = await makeToken("42", undefined);
      const csrfToken = await buildCsrfFor(42, 0);

      const res = await POST(
        makeReq({
          sessionCookie: legacyToken,
          csrfCookie: csrfToken,
          csrfHeader: csrfToken,
        }),
      );

      expect(res.status).toBe(200);
      expect(mockBump).toHaveBeenCalledWith(42, "prod", 0);
    });
  });
});
