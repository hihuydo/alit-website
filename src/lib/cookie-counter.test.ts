import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { deriveEnv } from "./cookie-counter";

describe("deriveEnv", () => {
  it("returns 'staging' when SITE_URL hostname starts with staging.", () => {
    expect(deriveEnv("https://staging.alit.hihuydo.com")).toBe("staging");
  });

  it("returns 'prod' for the production host", () => {
    expect(deriveEnv("https://alit.hihuydo.com")).toBe("prod");
  });

  it("returns 'prod' when SITE_URL is undefined (production-safe default)", () => {
    expect(deriveEnv(undefined)).toBe("prod");
  });

  it("returns 'prod' on empty string", () => {
    expect(deriveEnv("")).toBe("prod");
  });

  it("returns 'prod' on whitespace-only", () => {
    expect(deriveEnv("   ")).toBe("prod");
  });

  it("returns 'prod' on malformed URL (does not throw)", () => {
    expect(deriveEnv("not a url")).toBe("prod");
  });

  it("reads process.env.SITE_URL when no arg given", () => {
    const original = process.env.SITE_URL;
    try {
      process.env.SITE_URL = "https://staging.example.test";
      expect(deriveEnv()).toBe("staging");
    } finally {
      if (original === undefined) delete process.env.SITE_URL;
      else process.env.SITE_URL = original;
    }
  });
});

describe("bumpCookieSource", () => {
  let querySpy: ReturnType<typeof vi.fn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.resetModules();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("calls pool.query once with INSERT ... ON CONFLICT DO UPDATE", async () => {
    querySpy = vi.fn().mockResolvedValue({ rowCount: 1 });
    vi.doMock("./db", () => ({ default: { query: querySpy } }));
    const { bumpCookieSource } = await import("./cookie-counter");
    bumpCookieSource("primary");
    await new Promise((r) => setImmediate(r));

    expect(querySpy).toHaveBeenCalledTimes(1);
    const [sql, params] = querySpy.mock.calls[0];
    expect(sql).toContain("INSERT INTO auth_method_daily");
    expect(sql).toContain("ON CONFLICT (date, source, env)");
    expect(sql).toContain("count = auth_method_daily.count + 1");
    expect(params).toEqual(["primary", expect.any(String)]);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it("swallows DB errors and emits stdout fallback", async () => {
    querySpy = vi.fn().mockRejectedValue(new Error("db down"));
    vi.doMock("./db", () => ({ default: { query: querySpy } }));
    const { bumpCookieSource } = await import("./cookie-counter");

    expect(() => bumpCookieSource("legacy")).not.toThrow();
    await new Promise((r) => setImmediate(r));

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[cookie-counter] bump failed"),
      "db down",
    );
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const loggedJson = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);
    expect(loggedJson).toMatchObject({
      type: "cookie_bump_fallback",
      source: "legacy",
      env: expect.stringMatching(/^(prod|staging)$/),
    });
    expect(loggedJson.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof loggedJson.timestamp).toBe("string");
  });

  it("returns void and does not block the caller (no await needed)", async () => {
    querySpy = vi.fn(() => new Promise((r) => setTimeout(() => r({ rowCount: 1 }), 50)));
    vi.doMock("./db", () => ({ default: { query: querySpy } }));
    const { bumpCookieSource } = await import("./cookie-counter");

    const before = Date.now();
    const result = bumpCookieSource("primary");
    const elapsed = Date.now() - before;

    expect(result).toBeUndefined();
    expect(elapsed).toBeLessThan(10);
  });

  it("env param reflects SITE_URL at module load", async () => {
    vi.stubEnv("SITE_URL", "https://staging.alit.hihuydo.com");
    querySpy = vi.fn().mockResolvedValue({ rowCount: 1 });
    vi.doMock("./db", () => ({ default: { query: querySpy } }));
    vi.resetModules();
    const { bumpCookieSource } = await import("./cookie-counter");
    bumpCookieSource("primary");
    await new Promise((r) => setImmediate(r));
    expect(querySpy.mock.calls[0][1]).toEqual(["primary", "staging"]);
  });
});
