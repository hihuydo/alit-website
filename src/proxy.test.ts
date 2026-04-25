import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Mock verifySession BEFORE importing proxy so the edge-safe leaf's
 * JWT verification is stubbed. `vi.hoisted` ensures the mock fn
 * reference exists at module-evaluation time.
 */
const mockVerifySession = vi.hoisted(() => vi.fn());
vi.mock("./lib/auth-cookie", () => ({
  verifySession: mockVerifySession,
}));

import { proxy, config } from "./proxy";

describe("proxy — matcher config (bypass verified via config shape, not function-call)", () => {
  it("config.matcher[0].source excludes the critical non-document paths", () => {
    const source = (config.matcher[0] as { source: string }).source;
    expect(source).toContain("_next/static(?:/|$)");
    expect(source).toContain("_next/image(?:/|$)");
    expect(source).toContain("api(?:/|$)");
    expect(source).toContain("fonts(?:/|$)");
    expect(source).toContain("favicon\\.ico$");
    expect(source).toContain(".+\\.[^/]+$");
  });

  it("matcher source regex actually bypasses public static assets + passes app routes", () => {
    // Verify the regex mechanically against representative URLs — the
    // URL segment after the leading slash is what the lookahead sees.
    const source = (config.matcher[0] as { source: string }).source;
    // Strip the leading `/(` and trailing `)` that wrap the body.
    const inner = source.replace(/^\/\(/, "").replace(/\)$/, "");
    const re = new RegExp(`^${inner}$`);

    // App routes (document requests) — should match.
    expect(re.test("de/")).toBe(true);
    expect(re.test("de/projekte/")).toBe(true);
    expect(re.test("dashboard/")).toBe(true);
    expect(re.test("dashboard/login/")).toBe(true);

    // Public static assets + framework + API — should NOT match.
    expect(re.test("journal/trobadora-buch.png")).toBe(false);
    expect(re.test("robots.txt")).toBe(false);
    expect(re.test("sitemap.xml")).toBe(false);
    expect(re.test("_next/static/chunks/foo.js")).toBe(false);
    expect(re.test("api/health/")).toBe(false);
    expect(re.test("api/csp-report/")).toBe(false);
    expect(re.test("fonts/PPFragment-SansRegular.woff2")).toBe(false);
    expect(re.test("favicon.ico")).toBe(false);
  });

  it("config.matcher[0].missing has both prefetch-guard headers", () => {
    const missing = (config.matcher[0] as { missing: unknown[] }).missing;
    expect(missing).toEqual([
      { type: "header", key: "next-router-prefetch" },
      { type: "header", key: "purpose", value: "prefetch" },
    ]);
  });
});

describe("proxy — document-request CSP attachment", () => {
  beforeEach(() => {
    mockVerifySession.mockReset();
  });

  it("pass-through (non-dashboard) sets CSP-Report-Only + Reporting-Endpoints + nonce", async () => {
    const req = new NextRequest(new URL("https://example.com/de/"));
    const res = await proxy(req);

    expect(res).toBeDefined();
    const csp = res.headers.get("content-security-policy-report-only");
    expect(csp).toBeTruthy();
    expect(csp).toMatch(/nonce-[A-Za-z0-9+/]{22,}={0,2}/);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("strict-dynamic");

    expect(res.headers.get("reporting-endpoints")).toBe(
      'csp-endpoint="/api/csp-report/"',
    );
  });

  it("nonce differs between two consecutive pass-through requests", async () => {
    const req1 = new NextRequest(new URL("https://example.com/de/"));
    const req2 = new NextRequest(new URL("https://example.com/de/"));
    const nonce1 = (
      await proxy(req1)
    ).headers.get("content-security-policy-report-only");
    const nonce2 = (
      await proxy(req2)
    ).headers.get("content-security-policy-report-only");
    const extractNonce = (h: string | null) =>
      h?.match(/'nonce-([^']+)'/)?.[1] ?? "";
    expect(extractNonce(nonce1)).not.toBe("");
    expect(extractNonce(nonce1)).not.toBe(extractNonce(nonce2));
  });
});

describe("proxy — dashboard auth fail-closed (outside try/catch)", () => {
  beforeEach(() => {
    mockVerifySession.mockReset();
  });

  it("/dashboard/ without session → 307 redirect to /dashboard/login/", async () => {
    mockVerifySession.mockResolvedValue(null);
    const req = new NextRequest(new URL("https://example.com/dashboard/"));
    const res = await proxy(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/dashboard/login/");
  });

  it("/dashboard/ with valid session → pass-through + CSP attached", async () => {
    mockVerifySession.mockResolvedValue({ userId: 1, source: "primary" });
    const req = new NextRequest(new URL("https://example.com/dashboard/"));
    const res = await proxy(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy-report-only")).toBeTruthy();
  });

  it("/dashboard/login does NOT trigger auth check (bypass for unauthed login page)", async () => {
    mockVerifySession.mockResolvedValue(null);
    const req = new NextRequest(new URL("https://example.com/dashboard/login/"));
    const res = await proxy(req);

    // Not redirected — login page is always accessible
    expect(res.status).toBe(200);
    expect(mockVerifySession).not.toHaveBeenCalled();
    // CSP still attached
    expect(res.headers.get("content-security-policy-report-only")).toBeTruthy();
  });
});

describe("proxy — CSP fail-open does NOT weaken auth decision", () => {
  beforeEach(() => {
    mockVerifySession.mockReset();
  });

  it("CSP-gen throw still returns the redirect + logs to stderr; auth is preserved", async () => {
    mockVerifySession.mockResolvedValue(null);
    const cryptoSpy = vi
      .spyOn(crypto, "getRandomValues")
      .mockImplementationOnce(() => {
        throw new Error("simulated CSP-gen failure");
      });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const req = new NextRequest(new URL("https://example.com/dashboard/"));
    const res = await proxy(req);

    // Auth decision unaffected — redirect still returned
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/dashboard/login/");
    expect(errorSpy).toHaveBeenCalledWith(
      "[proxy] CSP decoration failed",
      expect.any(Error),
    );
    // Redirect has no CSP headers (fail-open left them unset)
    expect(res.headers.get("content-security-policy-report-only")).toBeNull();

    cryptoSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
