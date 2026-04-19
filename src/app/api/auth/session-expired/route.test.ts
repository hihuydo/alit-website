import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

function makeReq(search = ""): NextRequest {
  return new NextRequest(
    new URL(`https://example.com/api/auth/session-expired${search}`),
  );
}

describe("GET /api/auth/session-expired", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("303 redirects to /dashboard/login/ by default", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeReq());
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(
      "https://example.com/dashboard/login/",
    );
  });

  it("clears session + legacy + CSRF cookies via Set-Cookie maxAge=0", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeReq());
    const setCookies = res.headers.getSetCookie();
    const names = setCookies
      .map((c) => c.split("=")[0])
      .filter((n) => n === "__Host-session" || n === "session" || n === "__Host-csrf");
    expect(new Set(names)).toEqual(new Set(["__Host-session", "session", "__Host-csrf"]));
    for (const c of setCookies) {
      if (c.startsWith("__Host-") || c.startsWith("session=")) {
        expect(c).toMatch(/Max-Age=0/i);
      }
    }
  });

  it("Cache-Control no-store set on response", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeReq());
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("honors safe ?next parameter (same-origin absolute path)", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeReq("?next=/dashboard/"));
    expect(res.headers.get("location")).toBe("https://example.com/dashboard/");
  });

  it("ignores protocol-relative ?next (open-redirect defense)", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeReq("?next=//evil.com/phishing"));
    expect(res.headers.get("location")).toBe(
      "https://example.com/dashboard/login/",
    );
  });

  it("ignores scheme URLs in ?next", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeReq("?next=https%3A%2F%2Fevil.com%2F"));
    expect(res.headers.get("location")).toBe(
      "https://example.com/dashboard/login/",
    );
  });

  it("ignores empty ?next", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeReq("?next="));
    expect(res.headers.get("location")).toBe(
      "https://example.com/dashboard/login/",
    );
  });

  it("ignores ?next without leading slash", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeReq("?next=dashboard/login/"));
    expect(res.headers.get("location")).toBe(
      "https://example.com/dashboard/login/",
    );
  });
});
