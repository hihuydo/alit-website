import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST, GET, PUT, DELETE, PATCH, HEAD, OPTIONS } from "./route";

/**
 * Rate-limit store is module-scoped in src/lib/rate-limit.ts. Each test
 * uses a unique IP so tests stay isolated without needing store-reset.
 */
function makeReq(
  method: string,
  headers: Record<string, string>,
  body?: string,
): NextRequest {
  return new NextRequest(new URL("https://example.com/api/csp-report"), {
    method,
    headers,
    body: body ?? undefined,
  });
}

const LEGACY_BODY = {
  "csp-report": {
    "blocked-uri": "eval",
    "violated-directive": "script-src",
    "source-file": "https://alit.hihuydo.com/",
    "line-number": 42,
    referrer: "https://alit.hihuydo.com/de",
  },
};

const MODERN_BODY = [
  {
    type: "csp-violation",
    body: {
      blockedURL: "inline",
      effectiveDirective: "script-src",
      sourceFile: "https://alit.hihuydo.com/",
      lineNumber: 12,
      referrer: "",
    },
  },
];

describe("POST /api/csp-report — happy paths", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("legacy application/csp-report returns 204 + single structured log line", async () => {
    const res = await POST(
      makeReq(
        "POST",
        {
          "content-type": "application/csp-report",
          "x-real-ip": "1.2.3.4",
          host: "alit.hihuydo.com",
        },
        JSON.stringify(LEGACY_BODY),
      ),
    );
    expect(res.status).toBe(204);
    expect(logSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(logged).toMatchObject({
      type: "csp_violation",
      blocked_uri: "eval",
      violated_directive: "script-src",
      source_file: "https://alit.hihuydo.com/",
      line_number: 42,
      referrer: "https://alit.hihuydo.com/de",
      ip: "1.2.3.4",
      host: "alit.hihuydo.com",
    });
  });

  it("modern application/reports+json with single entry returns 204 + one log", async () => {
    const res = await POST(
      makeReq(
        "POST",
        {
          "content-type": "application/reports+json",
          "x-real-ip": "1.2.3.5",
          host: "alit.hihuydo.com",
        },
        JSON.stringify(MODERN_BODY),
      ),
    );
    expect(res.status).toBe(204);
    expect(logSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(logged.blocked_uri).toBe("inline");
    expect(logged.ip).toBe("1.2.3.5");
  });

  it("modern batch with 3 csp-violations + 2 filtered types → 3 log lines, 204", async () => {
    const batch = [
      ...MODERN_BODY,
      { type: "deprecation", body: {} },
      { type: "csp-violation", body: { blockedURL: "x2", effectiveDirective: "style-src" } },
      { type: "intervention", body: {} },
      { type: "csp-violation", body: { blockedURL: "x3", effectiveDirective: "img-src" } },
    ];
    const res = await POST(
      makeReq(
        "POST",
        {
          "content-type": "application/reports+json",
          "x-real-ip": "1.2.3.6",
          host: "alit.hihuydo.com",
        },
        JSON.stringify(batch),
      ),
    );
    expect(res.status).toBe(204);
    expect(logSpy).toHaveBeenCalledTimes(3);
    const uris = logSpy.mock.calls.map(
      (c: unknown[]) => JSON.parse(c[0] as string).blocked_uri,
    );
    expect(uris).toEqual(["inline", "x2", "x3"]);
  });

  it("Content-Type with charset suffix passes startsWith check", async () => {
    const res = await POST(
      makeReq(
        "POST",
        {
          "content-type": "application/csp-report; charset=utf-8",
          "x-real-ip": "1.2.3.7",
        },
        JSON.stringify(LEGACY_BODY),
      ),
    );
    expect(res.status).toBe(204);
  });
});

describe("POST /api/csp-report — rejects", () => {
  it("text/plain Content-Type returns 415 without reading body", async () => {
    const res = await POST(
      makeReq("POST", { "content-type": "text/plain", "x-real-ip": "2.2.2.1" }, "plain"),
    );
    expect(res.status).toBe(415);
  });

  it("missing Content-Type returns 415", async () => {
    const res = await POST(
      makeReq("POST", { "x-real-ip": "2.2.2.2" }, "{}"),
    );
    expect(res.status).toBe(415);
  });

  it("Content-Length exceeds 10 KB returns 413 before body-read", async () => {
    const res = await POST(
      makeReq(
        "POST",
        {
          "content-type": "application/csp-report",
          "content-length": String(20 * 1024),
          "x-real-ip": "2.2.2.3",
        },
        "x",
      ),
    );
    expect(res.status).toBe(413);
  });

  it("body exceeding 10 KB (post-read) returns 413", async () => {
    const big = JSON.stringify({ "csp-report": { "blocked-uri": "x".repeat(12 * 1024) } });
    const res = await POST(
      makeReq(
        "POST",
        { "content-type": "application/csp-report", "x-real-ip": "2.2.2.4" },
        big,
      ),
    );
    expect(res.status).toBe(413);
  });

  it("multi-byte UTF-8 body whose BYTE length > 10 KB returns 413 even if char count fits (Codex R2 [P2])", async () => {
    // `漢` is 3 UTF-8 bytes. 4096 copies = ~12 KB bytes but only ~4096 chars.
    const padding = "漢".repeat(4096);
    const big = JSON.stringify({ "csp-report": { "blocked-uri": padding } });
    // Sanity: JS string length (UTF-16 code units) stays below the 10 KB char mark.
    expect(big.length).toBeLessThan(10 * 1024);
    // But byte length exceeds it — must be rejected.
    expect(new TextEncoder().encode(big).length).toBeGreaterThan(10 * 1024);
    const res = await POST(
      makeReq(
        "POST",
        { "content-type": "application/csp-report", "x-real-ip": "2.2.2.4b" },
        big,
      ),
    );
    expect(res.status).toBe(413);
  });

  it("malformed JSON returns 400", async () => {
    const res = await POST(
      makeReq(
        "POST",
        { "content-type": "application/csp-report", "x-real-ip": "2.2.2.5" },
        "{not-json",
      ),
    );
    expect(res.status).toBe(400);
  });

  it("rate-limit exceeded (31st request from same IP) returns 429", async () => {
    const ip = "9.9.9.99"; // unique per test
    for (let i = 0; i < 30; i++) {
      const ok = await POST(
        makeReq(
          "POST",
          { "content-type": "application/csp-report", "x-real-ip": ip },
          JSON.stringify(LEGACY_BODY),
        ),
      );
      expect(ok.status).toBe(204);
    }
    const over = await POST(
      makeReq(
        "POST",
        { "content-type": "application/csp-report", "x-real-ip": ip },
        JSON.stringify(LEGACY_BODY),
      ),
    );
    expect(over.status).toBe(429);
  });
});

describe("method gating", () => {
  it("GET returns 405 with Allow: POST", async () => {
    const res = await GET();
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
  });

  it("PUT/PATCH/DELETE/HEAD/OPTIONS also return 405", async () => {
    for (const h of [PUT, PATCH, DELETE, HEAD, OPTIONS]) {
      const res = await h();
      expect(res.status).toBe(405);
      expect(res.headers.get("allow")).toBe("POST");
    }
  });
});
