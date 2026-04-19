import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";
import { SignJWT } from "jose";

const JWT_SECRET =
  "test-secret-at-least-32-chars-long-csrf-endpoint-abcdef";

async function makeToken(sub: string, tv: number): Promise<string> {
  return new SignJWT({ sub, tv })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(new TextEncoder().encode(JWT_SECRET));
}

function fakeReq(opts: { method?: string; sessionCookie?: string }) {
  const cookies = new Map<string, { value: string }>();
  if (opts.sessionCookie) {
    cookies.set("__Host-session", { value: opts.sessionCookie });
    cookies.set("session", { value: opts.sessionCookie });
  }
  return {
    method: opts.method ?? "GET",
    headers: { get: () => null },
    cookies: { get: (name: string) => cookies.get(name) },
  } as unknown as import("next/server").NextRequest;
}

describe("GET /api/auth/csrf", () => {
  const mockQuery = vi.fn();
  const mockBump = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", JWT_SECRET);
    mockQuery.mockReset();
    mockBump.mockReset();
    vi.doMock("@/lib/db", () => ({ default: { query: mockQuery } }));
    vi.doMock("@/lib/cookie-counter", () => ({
      bumpCookieSource: mockBump,
      deriveEnv: () => "prod",
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.doUnmock("@/lib/db");
    vi.doUnmock("@/lib/cookie-counter");
  });

  it("401 when no session cookie present", async () => {
    const { GET } = await import("./route");
    const res = await GET(fakeReq({}));
    expect(res).toBeInstanceOf(NextResponse);
    expect(res.status).toBe(401);
  });

  it("401 when JWT tv does not match DB tv", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 9 }] });
    const { GET } = await import("./route");
    const res = await GET(
      fakeReq({ sessionCookie: await makeToken("1", 3) }),
    );
    expect(res.status).toBe(401);
  });

  it("200 + embeds csrfToken in body + sets __Host-csrf cookie on happy path", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 5 }] });
    const { GET } = await import("./route");
    const res = await GET(
      fakeReq({ sessionCookie: await makeToken("42", 5) }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.csrfToken).toBe("string");
    expect(body.csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

    // Cookie set header inspection
    const setCookieHeaders = res.headers.getSetCookie();
    const csrfHeader = setCookieHeaders.find((h) => h.startsWith("__Host-csrf="));
    expect(csrfHeader).toBeDefined();
    expect(csrfHeader).toMatch(/Path=\//);
    expect(csrfHeader).toMatch(/Secure/);
    expect(csrfHeader).toMatch(/SameSite=strict/i);
    expect(csrfHeader).not.toMatch(/HttpOnly/i);
  });

  it("token is bound to (userId, tokenVersion) — HMAC roundtrip", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 7 }] });
    const { GET } = await import("./route");
    const res = await GET(
      fakeReq({ sessionCookie: await makeToken("42", 7) }),
    );
    const body = await res.json();

    const { buildCsrfToken } = await import("@/lib/csrf");
    const expected = await buildCsrfToken(JWT_SECRET, 42, 7);
    expect(body.csrfToken).toBe(expected);
  });

  it("Cookie value matches the body token (double-submit contract)", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
    const { GET } = await import("./route");
    const res = await GET(
      fakeReq({ sessionCookie: await makeToken("42", 1) }),
    );
    const body = await res.json();
    const setCookie = res.headers
      .getSetCookie()
      .find((h) => h.startsWith("__Host-csrf="))!;
    const cookieValue = setCookie.split(";")[0].split("=")[1];
    expect(cookieValue).toBe(body.csrfToken);
  });
});
