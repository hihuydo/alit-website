import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const JWT_SECRET =
  "test-secret-at-least-32-chars-long-login-route-test-aaaa";

function makeReq(body: object): NextRequest {
  return new NextRequest(new URL("https://example.com/api/auth/login"), {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": "1.2.3.4" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/login — Sprint T1-S CSRF integration", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", JWT_SECRET);
    vi.stubEnv("BCRYPT_ROUNDS", "4");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("200 + csrfToken in body + __Host-csrf cookie on successful login", async () => {
    // Mock login() to return a fake JWT that decodes deterministically
    const { SignJWT } = await import("jose");
    const fakeToken = await new SignJWT({ sub: "42", tv: 3 })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("24h")
      .sign(new TextEncoder().encode(JWT_SECRET));

    vi.doMock("@/lib/auth", () => ({
      login: vi.fn().mockResolvedValue(fakeToken),
    }));

    const { POST } = await import("./route");
    const res = await POST(
      makeReq({ email: "admin@test.local", password: "secret" }),
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.csrfToken).toBe("string");
    expect(body.csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const setCookies = res.headers.getSetCookie();
    const sessionCookie = setCookies.find((h) => h.startsWith("__Host-session="));
    const csrfCookie = setCookies.find((h) => h.startsWith("__Host-csrf="));
    expect(sessionCookie).toBeDefined();
    expect(csrfCookie).toBeDefined();
    expect(csrfCookie).toMatch(/Secure/);
    expect(csrfCookie).toMatch(/SameSite=strict/i);
    expect(csrfCookie).not.toMatch(/HttpOnly/i);
  });

  it("CSRF cookie value equals body.csrfToken (double-submit seed)", async () => {
    const { SignJWT } = await import("jose");
    const fakeToken = await new SignJWT({ sub: "7", tv: 0 })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("24h")
      .sign(new TextEncoder().encode(JWT_SECRET));

    vi.doMock("@/lib/auth", () => ({
      login: vi.fn().mockResolvedValue(fakeToken),
    }));

    const { POST } = await import("./route");
    const res = await POST(
      makeReq({ email: "admin@test.local", password: "secret" }),
    );
    const body = await res.json();
    const csrfCookie = res.headers
      .getSetCookie()
      .find((h) => h.startsWith("__Host-csrf="))!;
    const cookieValue = csrfCookie.split(";")[0].split("=")[1];
    expect(cookieValue).toBe(body.csrfToken);
  });

  it("401 + no csrfToken when credentials invalid", async () => {
    vi.doMock("@/lib/auth", () => ({
      login: vi.fn().mockResolvedValue(null),
    }));

    const { POST } = await import("./route");
    const res = await POST(
      makeReq({ email: "admin@test.local", password: "wrong" }),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.csrfToken).toBeUndefined();
  });
});
