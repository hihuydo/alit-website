import { describe, it, expect } from "vitest";
import type { NextRequest } from "next/server";
import {
  buildCsrfToken,
  validateCsrfPair,
  timingSafeEqualBytes,
  classifyCsrfFailure,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
} from "./csrf";

const TEST_SECRET = "a".repeat(64);
const USER_ID = 42;
const TV = 7;

function makeReq(opts: {
  header?: string | null;
  cookie?: string | null;
}): NextRequest {
  const headers = new Map<string, string>();
  if (opts.header !== null && opts.header !== undefined) {
    headers.set(CSRF_HEADER_NAME, opts.header);
  }
  const cookies = new Map<string, { value: string }>();
  if (opts.cookie !== null && opts.cookie !== undefined) {
    cookies.set(CSRF_COOKIE_NAME, { value: opts.cookie });
  }
  return {
    headers: {
      get: (name: string) => headers.get(name.toLowerCase()) ?? null,
    },
    cookies: {
      get: (name: string) => cookies.get(name),
    },
  } as unknown as NextRequest;
}

describe("timingSafeEqualBytes", () => {
  it("true for equal byte arrays", () => {
    expect(timingSafeEqualBytes(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
  });

  it("false for different byte arrays of same length", () => {
    expect(timingSafeEqualBytes(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
  });

  it("false for length mismatch (early-return)", () => {
    expect(timingSafeEqualBytes(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false);
  });

  it("true for two empty arrays", () => {
    expect(timingSafeEqualBytes(new Uint8Array([]), new Uint8Array([]))).toBe(true);
  });
});

describe("buildCsrfToken", () => {
  it("produces a 43-char base64url HMAC-SHA256", async () => {
    const t = await buildCsrfToken(TEST_SECRET, USER_ID, TV);
    expect(t).toHaveLength(43);
    // base64url alphabet only (no + / =)
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("deterministic for same inputs", async () => {
    const t1 = await buildCsrfToken(TEST_SECRET, USER_ID, TV);
    const t2 = await buildCsrfToken(TEST_SECRET, USER_ID, TV);
    expect(t1).toBe(t2);
  });

  it("different token when userId changes", async () => {
    const t1 = await buildCsrfToken(TEST_SECRET, 1, TV);
    const t2 = await buildCsrfToken(TEST_SECRET, 2, TV);
    expect(t1).not.toBe(t2);
  });

  it("different token when tokenVersion changes", async () => {
    const t1 = await buildCsrfToken(TEST_SECRET, USER_ID, 1);
    const t2 = await buildCsrfToken(TEST_SECRET, USER_ID, 2);
    expect(t1).not.toBe(t2);
  });

  it("different token when secret changes", async () => {
    const t1 = await buildCsrfToken("secret-a".padEnd(32, "x"), USER_ID, TV);
    const t2 = await buildCsrfToken("secret-b".padEnd(32, "x"), USER_ID, TV);
    expect(t1).not.toBe(t2);
  });
});

describe("validateCsrfPair", () => {
  it("true when header + cookie match the expected HMAC", async () => {
    const token = await buildCsrfToken(TEST_SECRET, USER_ID, TV);
    const req = makeReq({ header: token, cookie: token });
    expect(await validateCsrfPair(req, TEST_SECRET, USER_ID, TV)).toBe(true);
  });

  it("false when secret is undefined (misconfigured)", async () => {
    const token = await buildCsrfToken(TEST_SECRET, USER_ID, TV);
    const req = makeReq({ header: token, cookie: token });
    expect(await validateCsrfPair(req, undefined, USER_ID, TV)).toBe(false);
  });

  it("false when header missing", async () => {
    const token = await buildCsrfToken(TEST_SECRET, USER_ID, TV);
    const req = makeReq({ header: null, cookie: token });
    expect(await validateCsrfPair(req, TEST_SECRET, USER_ID, TV)).toBe(false);
  });

  it("false when cookie missing", async () => {
    const token = await buildCsrfToken(TEST_SECRET, USER_ID, TV);
    const req = makeReq({ header: token, cookie: null });
    expect(await validateCsrfPair(req, TEST_SECRET, USER_ID, TV)).toBe(false);
  });

  it("false when header ≠ cookie (double-submit violation)", async () => {
    const token1 = await buildCsrfToken(TEST_SECRET, USER_ID, TV);
    const token2 = await buildCsrfToken(TEST_SECRET, USER_ID, TV + 1);
    const req = makeReq({ header: token1, cookie: token2 });
    expect(await validateCsrfPair(req, TEST_SECRET, USER_ID, TV)).toBe(false);
  });

  it("false when tokenVersion changed (stale token after logout-bump)", async () => {
    const oldToken = await buildCsrfToken(TEST_SECRET, USER_ID, 5);
    const req = makeReq({ header: oldToken, cookie: oldToken });
    // Server has advanced to tv=6
    expect(await validateCsrfPair(req, TEST_SECRET, USER_ID, 6)).toBe(false);
  });

  it("false when userId ≠ token's bound userId (cross-user forgery)", async () => {
    const user1Token = await buildCsrfToken(TEST_SECRET, 1, TV);
    const req = makeReq({ header: user1Token, cookie: user1Token });
    expect(await validateCsrfPair(req, TEST_SECRET, 2, TV)).toBe(false);
  });

  it("domain-separator defense: a raw JWT-ish string is not a valid CSRF token", async () => {
    // JWT signatures don't start with "csrf-v1:" when HMAC'd against the
    // same secret, so even an attacker who obtains a JWT signature can't
    // replay it as a CSRF token. Verify by attempting to use a
    // deterministic HMAC of a JWT-payload-shape message.
    const jwtLikeMessage = `{"sub":"${USER_ID}","tv":${TV}}`;
    const { createHmac } = await import("node:crypto");
    const fakeHmac = createHmac("sha256", TEST_SECRET)
      .update(jwtLikeMessage)
      .digest("base64url");
    const req = makeReq({ header: fakeHmac, cookie: fakeHmac });
    expect(await validateCsrfPair(req, TEST_SECRET, USER_ID, TV)).toBe(false);
  });
});

describe("classifyCsrfFailure", () => {
  it("returns 'csrf_missing' when header missing", () => {
    const req = makeReq({ header: null, cookie: "x" });
    expect(classifyCsrfFailure(req)).toBe("csrf_missing");
  });

  it("returns 'csrf_missing' when cookie missing", () => {
    const req = makeReq({ header: "x", cookie: null });
    expect(classifyCsrfFailure(req)).toBe("csrf_missing");
  });

  it("returns 'csrf_invalid' when both present but presumed mismatched", () => {
    const req = makeReq({ header: "a", cookie: "b" });
    expect(classifyCsrfFailure(req)).toBe("csrf_invalid");
  });
});
