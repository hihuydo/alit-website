import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { SignJWT } from "jose";

/**
 * These tests exercise `auth-cookie.ts` across NODE_ENV boundaries. Because
 * `SESSION_COOKIE_NAME` is module-level-derived from `NODE_ENV`, each
 * block uses `vi.resetModules()` + dynamic `import()` so the module is
 * re-evaluated with the correct env.
 */

const JWT_SECRET =
  "test-secret-at-least-32-chars-long-aaaaaaaaa";
const OTHER_SECRET =
  "different-secret-for-corrupt-primary-path-bbbb";

async function makeToken(
  sub: string,
  secret: string,
  opts: { expired?: boolean } = {},
): Promise<string> {
  const iat = opts.expired
    ? Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 2
    : Math.floor(Date.now() / 1000);
  const exp = opts.expired ? iat + 60 : iat + 60 * 60;
  const jwt = new SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(iat)
    .setExpirationTime(exp);
  return jwt.sign(new TextEncoder().encode(secret));
}

type CookieMap = Record<string, string>;

function fakeReq(cookies: CookieMap) {
  return {
    cookies: {
      get(name: string) {
        if (name in cookies) return { value: cookies[name] };
        return undefined;
      },
    },
  } as unknown as import("next/server").NextRequest;
}

interface CookieSetCall {
  name: string;
  value: string;
  options: Record<string, unknown>;
}

function fakeRes() {
  const calls: CookieSetCall[] = [];
  const res = {
    cookies: {
      set(name: string, value: string, options: Record<string, unknown>) {
        calls.push({ name, value, options });
      },
    },
  } as unknown as import("next/server").NextResponse;
  return { res, calls };
}

describe("SESSION_COOKIE_NAME resolution", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses __Host-session in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    const mod = await import("./auth-cookie");
    expect(mod.SESSION_COOKIE_NAME).toBe("__Host-session");
    expect(mod.LEGACY_COOKIE_NAME).toBe("session");
  });

  it("uses session in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.resetModules();
    const mod = await import("./auth-cookie");
    expect(mod.SESSION_COOKIE_NAME).toBe("session");
  });

  it("uses session in test env", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.resetModules();
    const mod = await import("./auth-cookie");
    expect(mod.SESSION_COOKIE_NAME).toBe("session");
  });
});

describe("verifySessionDualRead", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", JWT_SECRET);
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("returns {userId, source:'primary'} when primary token is valid", async () => {
    const { verifySessionDualRead } = await import("./auth-cookie");
    const token = await makeToken("42", JWT_SECRET);
    const result = await verifySessionDualRead(
      fakeReq({ "__Host-session": token }),
    );
    expect(result).toEqual({ userId: 42, source: "primary" });
  });

  it("returns {userId, source:'legacy'} when only legacy cookie present", async () => {
    const { verifySessionDualRead } = await import("./auth-cookie");
    const token = await makeToken("7", JWT_SECRET);
    const result = await verifySessionDualRead(fakeReq({ session: token }));
    expect(result).toEqual({ userId: 7, source: "legacy" });
  });

  it("falls back to legacy when primary was signed with a different secret", async () => {
    const { verifySessionDualRead } = await import("./auth-cookie");
    const badPrimary = await makeToken("1", OTHER_SECRET);
    const goodLegacy = await makeToken("1", JWT_SECRET);
    const result = await verifySessionDualRead(
      fakeReq({ "__Host-session": badPrimary, session: goodLegacy }),
    );
    expect(result).toEqual({ userId: 1, source: "legacy" });
  });

  it("falls back to legacy when primary is expired", async () => {
    const { verifySessionDualRead } = await import("./auth-cookie");
    const expired = await makeToken("9", JWT_SECRET, { expired: true });
    const fresh = await makeToken("9", JWT_SECRET);
    const result = await verifySessionDualRead(
      fakeReq({ "__Host-session": expired, session: fresh }),
    );
    expect(result).toEqual({ userId: 9, source: "legacy" });
  });

  it("falls back to legacy when primary has non-numeric sub", async () => {
    const { verifySessionDualRead } = await import("./auth-cookie");
    const badSubPrimary = await makeToken("abc", JWT_SECRET);
    const legacy = await makeToken("3", JWT_SECRET);
    const result = await verifySessionDualRead(
      fakeReq({ "__Host-session": badSubPrimary, session: legacy }),
    );
    expect(result).toEqual({ userId: 3, source: "legacy" });
  });

  it("prefers primary when both are valid", async () => {
    const { verifySessionDualRead } = await import("./auth-cookie");
    const primary = await makeToken("11", JWT_SECRET);
    const legacy = await makeToken("22", JWT_SECRET);
    const result = await verifySessionDualRead(
      fakeReq({ "__Host-session": primary, session: legacy }),
    );
    expect(result).toEqual({ userId: 11, source: "primary" });
  });

  it("returns null when both tokens are invalid", async () => {
    const { verifySessionDualRead } = await import("./auth-cookie");
    const badPrimary = await makeToken("1", OTHER_SECRET);
    const badLegacy = await makeToken("1", OTHER_SECRET);
    const result = await verifySessionDualRead(
      fakeReq({ "__Host-session": badPrimary, session: badLegacy }),
    );
    expect(result).toBeNull();
  });

  it("returns null when both subs are non-numeric", async () => {
    const { verifySessionDualRead } = await import("./auth-cookie");
    const primary = await makeToken("alice", JWT_SECRET);
    const legacy = await makeToken("bob", JWT_SECRET);
    const result = await verifySessionDualRead(
      fakeReq({ "__Host-session": primary, session: legacy }),
    );
    expect(result).toBeNull();
  });

  it("returns null when no cookies are present", async () => {
    const { verifySessionDualRead } = await import("./auth-cookie");
    const result = await verifySessionDualRead(fakeReq({}));
    expect(result).toBeNull();
  });

  it("returns null (no throw) when JWT_SECRET is missing", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "production");
    // JWT_SECRET deliberately not set
    vi.resetModules();
    const { verifySessionDualRead } = await import("./auth-cookie");
    const result = await verifySessionDualRead(
      fakeReq({ "__Host-session": "anything" }),
    );
    expect(result).toBeNull();
  });

  it("rejects negative or zero user IDs", async () => {
    const { verifySessionDualRead } = await import("./auth-cookie");
    // "0" passes /^[0-9]+$/ but validateSub rejects non-positive
    const token = await makeToken("0", JWT_SECRET);
    const result = await verifySessionDualRead(
      fakeReq({ "__Host-session": token }),
    );
    expect(result).toBeNull();
  });
});

describe("setSessionCookie", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("sets __Host-session AND clears session in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    const { setSessionCookie } = await import("./auth-cookie");
    const { res, calls } = fakeRes();
    setSessionCookie(res, "token-123");

    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      name: "__Host-session",
      value: "token-123",
      options: {
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        path: "/",
        maxAge: 86400,
      },
    });
    expect(calls[1]).toMatchObject({
      name: "session",
      value: "",
      options: { path: "/", maxAge: 0 },
    });
  });

  it("sets only session in dev (no double-clear of itself)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.resetModules();
    const { setSessionCookie } = await import("./auth-cookie");
    const { res, calls } = fakeRes();
    setSessionCookie(res, "dev-token");

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      name: "session",
      value: "dev-token",
      options: {
        httpOnly: true,
        secure: false,
        sameSite: "strict",
        path: "/",
        maxAge: 86400,
      },
    });
  });
});

describe("clearSessionCookies", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("clears both cookie names with maxAge=0 in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    const { clearSessionCookies } = await import("./auth-cookie");
    const { res, calls } = fakeRes();
    clearSessionCookies(res);

    expect(calls).toHaveLength(2);
    expect(calls.map((c) => c.name).sort()).toEqual(
      ["__Host-session", "session"].sort(),
    );
    for (const call of calls) {
      expect(call.value).toBe("");
      expect(call.options).toMatchObject({ path: "/", maxAge: 0 });
    }
  });

  it("clears once in dev (single name)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.resetModules();
    const { clearSessionCookies } = await import("./auth-cookie");
    const { res, calls } = fakeRes();
    clearSessionCookies(res);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      name: "session",
      value: "",
      options: { maxAge: 0, path: "/" },
    });
  });
});

describe("Edge-Safe guard — file content", () => {
  it("does not import Node-only modules (pg, bcryptjs, ./db, ./audit, ./auth)", () => {
    const filePath = path.resolve(__dirname, "auth-cookie.ts");
    const source = readFileSync(filePath, "utf8");
    const forbidden = /from\s+["'](pg|bcryptjs|\.\/db|\.\/audit|\.\/auth)["']/;
    const matches = source.match(forbidden);
    expect(
      matches,
      `auth-cookie.ts must not import Node-only modules, found: ${matches?.[0]}`,
    ).toBeNull();
  });
});
