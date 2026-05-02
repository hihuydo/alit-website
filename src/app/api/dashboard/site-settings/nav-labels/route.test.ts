import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";
import { SignJWT } from "jose";

const JWT_SECRET = "test-secret-at-least-32-chars-long-nav-labels-route-bbbbbb";

async function makeToken(sub: string, tv: number): Promise<string> {
  return new SignJWT({ sub, tv })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(new TextEncoder().encode(JWT_SECRET));
}

async function buildCsrf(userId: number, tv: number): Promise<string> {
  const { buildCsrfToken } = await import("@/lib/csrf");
  return buildCsrfToken(JWT_SECRET, userId, tv);
}

function fakeReq(opts: {
  method: "GET" | "PUT";
  sessionCookie?: string;
  csrfCookie?: string;
  csrfHeader?: string;
  body?: unknown;
}) {
  const cookies = new Map<string, { value: string }>();
  if (opts.sessionCookie) {
    cookies.set("__Host-session", { value: opts.sessionCookie });
    cookies.set("session", { value: opts.sessionCookie });
  }
  if (opts.csrfCookie) cookies.set("__Host-csrf", { value: opts.csrfCookie });
  const bodyText = opts.body === undefined ? "" : JSON.stringify(opts.body);
  const headers = new Map<string, string>();
  if (opts.csrfHeader) headers.set("x-csrf-token", opts.csrfHeader);
  if (opts.body !== undefined) headers.set("content-length", String(bodyText.length));
  return {
    method: opts.method,
    headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
    cookies: { get: (name: string) => cookies.get(name) },
    text: async () => bodyText,
  } as unknown as import("next/server").NextRequest;
}

const filledLabels = {
  agenda: "Termine",
  projekte: "Werke",
  alit: "Verein",
  mitgliedschaft: "Beitritt",
  newsletter: "Updates",
};

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("/api/dashboard/site-settings/nav-labels/", () => {
  const mockQuery = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", JWT_SECRET);
    mockQuery.mockReset();
    vi.doMock("@/lib/db", () => ({ default: { query: mockQuery } }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.doUnmock("@/lib/db");
  });

  it("GET 200 returns stored row when present", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 5 }] });
    mockQuery.mockResolvedValueOnce({
      rows: [{ value: JSON.stringify({ de: filledLabels, fr: null }) }],
    });
    const { GET } = await import("./route");
    const res = await GET(fakeReq({ method: "GET", sessionCookie: await makeToken("42", 5) }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.de).toEqual(filledLabels);
    expect(body.data.fr).toBe(null);
  });

  it("GET 200 returns {de:null, fr:null} when row absent (fallback to dict at render-time)", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 5 }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const { GET } = await import("./route");
    const res = await GET(fakeReq({ method: "GET", sessionCookie: await makeToken("42", 5) }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, data: { de: null, fr: null } });
  });

  it("PUT 200 happy path persists labels and triggers revalidatePath", async () => {
    const { revalidatePath } = await import("next/cache");
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 5 }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const csrf = await buildCsrf(42, 5);
    const { PUT } = await import("./route");
    const res = await PUT(
      fakeReq({
        method: "PUT",
        sessionCookie: await makeToken("42", 5),
        csrfCookie: csrf,
        csrfHeader: csrf,
        body: { de: filledLabels, fr: null },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.de).toEqual(filledLabels);
    expect(revalidatePath).toHaveBeenCalledWith("/de", "layout");
    expect(revalidatePath).toHaveBeenCalledWith("/fr", "layout");
  });

  it("PUT 400 when missing 'fr' locale key", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 5 }] });
    const csrf = await buildCsrf(42, 5);
    const { PUT } = await import("./route");
    const res = await PUT(
      fakeReq({
        method: "PUT",
        sessionCookie: await makeToken("42", 5),
        csrfCookie: csrf,
        csrfHeader: csrf,
        body: { de: filledLabels },
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/de.*fr/i);
  });

  it("PUT 400 when string field exceeds max length", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 5 }] });
    const csrf = await buildCsrf(42, 5);
    const { PUT } = await import("./route");
    const res = await PUT(
      fakeReq({
        method: "PUT",
        sessionCookie: await makeToken("42", 5),
        csrfCookie: csrf,
        csrfHeader: csrf,
        body: { de: { ...filledLabels, agenda: "x".repeat(201) }, fr: null },
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/zu lang/i);
  });

  it("PUT 400 when field is missing string type", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 5 }] });
    const csrf = await buildCsrf(42, 5);
    const { PUT } = await import("./route");
    const res = await PUT(
      fakeReq({
        method: "PUT",
        sessionCookie: await makeToken("42", 5),
        csrfCookie: csrf,
        csrfHeader: csrf,
        body: { de: { ...filledLabels, mitgliedschaft: 42 }, fr: null },
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/string/i);
  });

  it("PUT 401 without session cookie (auth gate)", async () => {
    const { PUT } = await import("./route");
    const res = await PUT(
      fakeReq({ method: "PUT", body: { de: filledLabels, fr: null } }),
    );
    expect(res).toBeInstanceOf(NextResponse);
    expect(res.status).toBe(401);
  });

  it("PUT 403 without CSRF token (csrf gate)", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 5 }] });
    const { PUT } = await import("./route");
    const res = await PUT(
      fakeReq({
        method: "PUT",
        sessionCookie: await makeToken("42", 5),
        body: { de: filledLabels, fr: null },
      }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toMatch(/csrf/);
  });
});
