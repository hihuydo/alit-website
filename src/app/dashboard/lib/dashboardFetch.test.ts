// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * dashboardFetch client-side tests. Uses vi.stubGlobal('fetch', ...)
 * to intercept calls. The helper lives in an ESM module with module-
 * scope state (`cachedCsrfToken`) so every test calls
 * `clearCsrfCacheForTest()` in beforeEach.
 */

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("dashboardFetch", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { clearCsrfCacheForTest } = await import("./dashboardFetch");
    clearCsrfCacheForTest();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("GET path (no CSRF needed)", () => {
    it("passes through with credentials:'same-origin' and no x-csrf-token header", async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
      const { dashboardFetch } = await import("./dashboardFetch");
      const res = await dashboardFetch("/api/foo");
      expect(res.status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe("/api/foo");
      expect(init.credentials).toBe("same-origin");
      expect(init.headers).toBeUndefined();
    });
  });

  describe("POST happy path with cached token", () => {
    it("attaches x-csrf-token from seedCsrfToken and succeeds without extra fetch", async () => {
      const { seedCsrfToken, dashboardFetch } = await import("./dashboardFetch");
      seedCsrfToken("seeded-token-abc");

      fetchSpy.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
      const res = await dashboardFetch("/api/mutate", {
        method: "POST",
        body: JSON.stringify({ k: "v" }),
      });
      expect(res.status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [, init] = fetchSpy.mock.calls[0];
      const headers = init.headers as Headers;
      expect(headers.get("x-csrf-token")).toBe("seeded-token-abc");
    });
  });

  describe("POST without cached token — lazy-fetches /api/auth/csrf", () => {
    it("fetches token then attaches on original mutation", async () => {
      fetchSpy
        .mockResolvedValueOnce(jsonResponse(200, { csrfToken: "lazy-token" }))
        .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
      const { dashboardFetch } = await import("./dashboardFetch");
      const res = await dashboardFetch("/api/mutate", { method: "POST" });
      expect(res.status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(fetchSpy.mock.calls[0][0]).toBe("/api/auth/csrf");
      expect(fetchSpy.mock.calls[1][0]).toBe("/api/mutate");
      const [, init] = fetchSpy.mock.calls[1];
      expect((init.headers as Headers).get("x-csrf-token")).toBe("lazy-token");
    });
  });

  describe("403 csrf_invalid → refresh + retry once", () => {
    it("retries with fresh token, succeeds on retry", async () => {
      const { seedCsrfToken, dashboardFetch } = await import("./dashboardFetch");
      seedCsrfToken("stale-token");

      fetchSpy
        .mockResolvedValueOnce(jsonResponse(403, { code: "csrf_invalid" }))
        .mockResolvedValueOnce(jsonResponse(200, { csrfToken: "fresh-token" }))
        .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

      const res = await dashboardFetch("/api/mutate", { method: "POST" });
      expect(res.status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledTimes(3);
      const retryHeaders = fetchSpy.mock.calls[2][1].headers as Headers;
      expect(retryHeaders.get("x-csrf-token")).toBe("fresh-token");
    });

    it("handles 403 csrf_missing the same as csrf_invalid", async () => {
      const { seedCsrfToken, dashboardFetch } = await import("./dashboardFetch");
      seedCsrfToken("stale");

      fetchSpy
        .mockResolvedValueOnce(jsonResponse(403, { code: "csrf_missing" }))
        .mockResolvedValueOnce(jsonResponse(200, { csrfToken: "new" }))
        .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

      const res = await dashboardFetch("/api/mutate", { method: "POST" });
      expect(res.status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it("does NOT retry if refresh fetch itself fails", async () => {
      const { seedCsrfToken, dashboardFetch } = await import("./dashboardFetch");
      seedCsrfToken("stale");

      fetchSpy
        .mockResolvedValueOnce(jsonResponse(403, { code: "csrf_invalid" }))
        .mockResolvedValueOnce(jsonResponse(500, { error: "Server down" }));

      const res = await dashboardFetch("/api/mutate", { method: "POST" });
      expect(res.status).toBe(403); // original 403 bubbles up
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe("non-CSRF 403 bubbles without retry", () => {
    it("role-gate 403 (no code) passes through", async () => {
      const { seedCsrfToken, dashboardFetch } = await import("./dashboardFetch");
      seedCsrfToken("token");
      fetchSpy.mockResolvedValueOnce(
        jsonResponse(403, { error: "Forbidden" }),
      );
      const res = await dashboardFetch("/api/mutate", { method: "POST" });
      expect(res.status).toBe(403);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("403 with unrecognized code does not refresh", async () => {
      const { seedCsrfToken, dashboardFetch } = await import("./dashboardFetch");
      seedCsrfToken("token");
      fetchSpy.mockResolvedValueOnce(
        jsonResponse(403, { code: "rate_limited" }),
      );
      const res = await dashboardFetch("/api/mutate", { method: "POST" });
      expect(res.status).toBe(403);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("401 redirect", () => {
    it("on POST 401 sets window.location.href = /dashboard/login/", async () => {
      const { seedCsrfToken, dashboardFetch } = await import("./dashboardFetch");
      seedCsrfToken("token");
      const hrefSpy = vi.fn();
      Object.defineProperty(window, "location", {
        value: {
          get href() { return ""; },
          set href(v: string) { hrefSpy(v); },
        },
        writable: true,
      });

      fetchSpy.mockResolvedValueOnce(jsonResponse(401, { error: "Unauthorized" }));
      await dashboardFetch("/api/mutate", { method: "POST" });
      expect(hrefSpy).toHaveBeenCalledWith("/dashboard/login/");
    });

    it("on GET 401 also redirects", async () => {
      const hrefSpy = vi.fn();
      Object.defineProperty(window, "location", {
        value: {
          get href() { return ""; },
          set href(v: string) { hrefSpy(v); },
        },
        writable: true,
      });
      fetchSpy.mockResolvedValueOnce(jsonResponse(401, {}));
      const { dashboardFetch } = await import("./dashboardFetch");
      await dashboardFetch("/api/me");
      expect(hrefSpy).toHaveBeenCalledWith("/dashboard/login/");
    });
  });

  describe("seedCsrfToken populates module cache", () => {
    it("avoids the /api/auth/csrf round-trip on first mutation", async () => {
      const { seedCsrfToken, dashboardFetch } = await import("./dashboardFetch");
      seedCsrfToken("from-login-response");

      fetchSpy.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
      await dashboardFetch("/api/mutate", { method: "POST" });

      // Only ONE fetch: the mutation itself (no prefetch)
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy.mock.calls[0][0]).toBe("/api/mutate");
    });
  });
});
