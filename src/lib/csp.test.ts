import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  generateNonce,
  buildCspPolicy,
  normalizeCspReport,
  CSP_DIRECTIVES,
  CSP_REPORT_ENDPOINT,
} from "./csp";

describe("generateNonce", () => {
  it("returns base64 string with ≥22 chars (128-bit entropy)", () => {
    const nonce = generateNonce();
    expect(nonce).toMatch(/^[A-Za-z0-9+/]{22,}={0,2}$/);
    expect(nonce.length).toBeGreaterThanOrEqual(22);
  });

  it("returns a unique value on each call (100 iterations)", () => {
    const nonces = new Set(
      Array.from({ length: 100 }, () => generateNonce()),
    );
    expect(nonces.size).toBe(100);
  });
});

describe("buildCspPolicy", () => {
  const nonce = "TEST_NONCE_base64value==";
  const policy = buildCspPolicy(nonce);

  it("emits all 14 directives in CSP_DIRECTIVES order (structural, not byte-for-byte)", () => {
    const directiveNames = policy
      .split(";")
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => d.split(/\s+/)[0]);
    expect(directiveNames).toEqual([...CSP_DIRECTIVES]);
  });

  it("interpolates the nonce into script-src with strict-dynamic", () => {
    expect(policy).toMatch(
      new RegExp(
        `script-src[^;]*'nonce-${nonce.replace(/[=+/]/g, "\\$&")}'[^;]*'strict-dynamic'`,
      ),
    );
  });

  it("report-uri points to CSP_REPORT_ENDPOINT", () => {
    expect(policy).toContain(`report-uri ${CSP_REPORT_ENDPOINT}`);
  });

  it("report-to names csp-endpoint", () => {
    expect(policy).toContain("report-to csp-endpoint");
  });
});

describe("normalizeCspReport — legacy application/csp-report", () => {
  it("extracts dashed-keys from top-level csp-report object", () => {
    const body = {
      "csp-report": {
        "blocked-uri": "eval",
        "violated-directive": "script-src",
        "source-file": "https://example.com/",
        "line-number": 42,
        referrer: "https://example.com/ref",
      },
    };
    const result = normalizeCspReport(body, "application/csp-report");
    expect(result).toEqual([
      {
        blocked_uri: "eval",
        violated_directive: "script-src",
        source_file: "https://example.com/",
        line_number: 42,
        referrer: "https://example.com/ref",
      },
    ]);
  });

  it("tolerates Content-Type suffix (charset) via startsWith", () => {
    const body = {
      "csp-report": {
        "blocked-uri": "x",
        "violated-directive": "script-src",
      },
    };
    const result = normalizeCspReport(body, "application/csp-report; charset=utf-8");
    expect(result).toHaveLength(1);
    expect(result[0].blocked_uri).toBe("x");
  });
});

describe("normalizeCspReport — modern application/reports+json", () => {
  it("extracts camelCase keys from envelope body", () => {
    const body = [
      {
        type: "csp-violation",
        body: {
          blockedURL: "inline",
          effectiveDirective: "style-src",
          sourceFile: "https://example.com/",
          lineNumber: 100,
          referrer: "",
        },
      },
    ];
    const result = normalizeCspReport(body, "application/reports+json");
    expect(result).toEqual([
      {
        blocked_uri: "inline",
        violated_directive: "style-src",
        source_file: "https://example.com/",
        line_number: 100,
        referrer: "",
      },
    ]);
  });

  it("filters non-csp-violation reports from a mixed batch (N-way)", () => {
    const body = [
      { type: "deprecation", body: { message: "foo" } },
      {
        type: "csp-violation",
        body: {
          blockedURL: "x1",
          effectiveDirective: "script-src",
          sourceFile: "",
          lineNumber: 0,
          referrer: "",
        },
      },
      { type: "intervention", body: { message: "bar" } },
      {
        type: "csp-violation",
        body: {
          blockedURL: "x2",
          effectiveDirective: "style-src",
          sourceFile: "",
          lineNumber: 0,
          referrer: "",
        },
      },
    ];
    const result = normalizeCspReport(body, "application/reports+json");
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.blocked_uri)).toEqual(["x1", "x2"]);
  });
});

describe("normalizeCspReport — malformed / unsupported input", () => {
  it("returns empty array for null / non-object / non-array", () => {
    expect(normalizeCspReport(null, "application/csp-report")).toEqual([]);
    expect(normalizeCspReport("string", "application/csp-report")).toEqual([]);
    expect(normalizeCspReport({}, "application/csp-report")).toEqual([]);
    expect(normalizeCspReport([], "application/reports+json")).toEqual([]);
    expect(
      normalizeCspReport([{ type: "csp-violation" }], "application/reports+json"),
    ).toEqual([]);
    expect(normalizeCspReport({ foo: "bar" }, "text/plain")).toEqual([]);
  });

  it("application/json fallback tries both shapes", () => {
    const legacy = { "csp-report": { "blocked-uri": "L" } };
    const modern = [
      {
        type: "csp-violation",
        body: { blockedURL: "M", effectiveDirective: "script-src" },
      },
    ];
    expect(normalizeCspReport(legacy, "application/json")[0].blocked_uri).toBe("L");
    expect(normalizeCspReport(modern, "application/json")[0].blocked_uri).toBe("M");
  });
});

describe("Edge-Safe guard — file content", () => {
  it("csp.ts does not import Node-only modules (pg, bcryptjs, ./db, ./audit, ./auth)", () => {
    const filePath = path.resolve(__dirname, "csp.ts");
    const source = readFileSync(filePath, "utf8");
    const forbidden = /from\s+["'](pg|bcryptjs|\.\/db|\.\/audit|\.\/auth)["']/;
    const matches = source.match(forbidden);
    expect(matches, `Node-only module leaked: ${matches?.[0]}`).toBeNull();
  });
});
