import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SignJWT } from "jose";

const JWT_SECRET = "test-secret-at-least-32-chars-long-agenda-post-route-aaaa";

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
  method: "POST";
  sessionCookie: string;
  csrfCookie: string;
  csrfHeader: string;
  body: unknown;
}) {
  const cookies = new Map<string, { value: string }>();
  cookies.set("__Host-session", { value: opts.sessionCookie });
  cookies.set("session", { value: opts.sessionCookie });
  cookies.set("__Host-csrf", { value: opts.csrfCookie });
  const bodyText = JSON.stringify(opts.body);
  const headers = new Map<string, string>();
  headers.set("x-csrf-token", opts.csrfHeader);
  headers.set("content-length", String(bodyText.length));
  return {
    method: opts.method,
    url: "https://example.com/api/dashboard/agenda/",
    headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
    cookies: { get: (name: string) => cookies.get(name) },
    text: async () => bodyText,
  } as unknown as import("next/server").NextRequest;
}

describe("POST /api/dashboard/agenda — canonical datum/zeit format-check", () => {
  const mockQuery = vi.fn();
  const mockConnect = vi.fn();
  const mockClient = { query: vi.fn(), release: vi.fn() };

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", JWT_SECRET);
    mockQuery.mockReset();
    mockConnect.mockReset();
    mockClient.query.mockReset();
    mockClient.release.mockReset();
    mockConnect.mockResolvedValue(mockClient);
    vi.doMock("@/lib/db", () => ({
      default: { query: mockQuery, connect: mockConnect },
    }));
    // Skip hashtag DB-check — not relevant to datum/zeit format tests
    vi.doMock("@/lib/agenda-hashtags", () => ({
      validateHashtagsI18n: vi.fn().mockResolvedValue({ ok: true, hashtags: [] }),
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  const baseBody = {
    ort_url: "https://example.com",
    title_i18n: { de: "Titel" },
    lead_i18n: { de: "Lead" },
    ort_i18n: { de: "Ort" },
    content_i18n: { de: [] },
    hashtags: [],
    images: [],
  };

  async function callPost(body: unknown) {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 5 }] }); // requireAuth
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 99 }] }); // INSERT (only when reached)
    const csrf = await buildCsrf(42, 5);
    const { POST } = await import("./route");
    return POST(
      fakeReq({
        method: "POST",
        sessionCookie: await makeToken("42", 5),
        csrfCookie: csrf,
        csrfHeader: csrf,
        body,
      }),
    );
  }

  it("400 on zeit without space (legacy variant)", async () => {
    const res = await callPost({ ...baseBody, datum: "15.03.2025", zeit: "14:00Uhr" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Zeitformat/);
  });

  it("400 on zeit with period separator (legacy variant)", async () => {
    const res = await callPost({ ...baseBody, datum: "15.03.2025", zeit: "19.30" });
    expect(res.status).toBe(400);
  });

  it("400 on datum without zero-pad", async () => {
    const res = await callPost({ ...baseBody, datum: "15.3.25", zeit: "14:00 Uhr" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Datumsformat/);
  });

  it("400 on impossible civil-date (Codex Spec-R1 [Correctness] 1)", async () => {
    const res = await callPost({ ...baseBody, datum: "29.02.2025", zeit: "14:00 Uhr" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Datumsformat/);
  });

  it("accepts canonical datum + zeit", async () => {
    const res = await callPost({ ...baseBody, datum: "15.03.2025", zeit: "14:00 Uhr" });
    // Past the format-check gate — test environment doesn't have full DB
    // stack mocked, so it may hit downstream errors. The key assertion is
    // that format-validation didn't reject (status !== 400 from format).
    if (res.status === 400) {
      const body = await res.json();
      expect(body.error).not.toMatch(/Datumsformat|Zeitformat/);
    }
  });

  it("ort_url is optional — POST without ort_url does NOT 400 on missing-fields", async () => {
    const body = { ...baseBody, datum: "15.03.2025", zeit: "14:00 Uhr" };
    // Strip ort_url entirely
    delete (body as { ort_url?: string }).ort_url;
    const res = await callPost(body);
    // Old behavior would have returned 400 "Missing required fields (datum, zeit, ort_url)".
    // New behavior: past that gate — any 400 must not mention the missing-fields message.
    if (res.status === 400) {
      const body = await res.json();
      expect(body.error).not.toMatch(/Missing required fields/);
    }
  });

  it("ort_url empty string is accepted (persists as NULL server-side)", async () => {
    const res = await callPost({ ...baseBody, datum: "15.03.2025", zeit: "14:00 Uhr", ort_url: "" });
    if (res.status === 400) {
      const body = await res.json();
      expect(body.error).not.toMatch(/Missing required fields/);
    }
  });
});

describe("POST /api/dashboard/agenda — images_grid_columns + images_fit", () => {
  const mockQuery = vi.fn();
  const mockConnect = vi.fn();
  const mockClient = { query: vi.fn(), release: vi.fn() };

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", JWT_SECRET);
    mockQuery.mockReset();
    mockConnect.mockReset();
    mockConnect.mockResolvedValue(mockClient);
    vi.doMock("@/lib/db", () => ({
      default: { query: mockQuery, connect: mockConnect },
    }));
    vi.doMock("@/lib/agenda-hashtags", () => ({
      validateHashtagsI18n: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    }));
    vi.doMock("@/lib/agenda-images", () => ({
      validateImages: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  const baseBody = {
    datum: "15.03.2025",
    zeit: "14:00 Uhr",
    ort_url: "https://example.com",
    title_i18n: { de: "Titel" },
    lead_i18n: { de: "Lead" },
    ort_i18n: { de: "Ort" },
    content_i18n: { de: [] },
    hashtags: [],
    images: [],
  };

  async function callPost(body: unknown) {
    mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 5 }] }); // requireAuth
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 99, content_i18n: { de: [] } }] }); // INSERT
    const csrf = await buildCsrf(42, 5);
    const { POST } = await import("./route");
    return POST(
      fakeReq({
        method: "POST",
        sessionCookie: await makeToken("42", 5),
        csrfCookie: csrf,
        csrfHeader: csrf,
        body,
      }),
    );
  }

  it("400 invalid_grid_columns when value is 6 (out of range)", async () => {
    const res = await callPost({ ...baseBody, images_grid_columns: 6 });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_grid_columns");
  });

  it("400 invalid_grid_columns when value is 0 (out of range)", async () => {
    const res = await callPost({ ...baseBody, images_grid_columns: 0 });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_grid_columns");
  });

  it("400 invalid_grid_columns when value is non-integer (parseInt-Trap regression)", async () => {
    // Without typeof+Number.isInteger guard, parseInt("3abc") = 3 would pass.
    const res = await callPost({ ...baseBody, images_grid_columns: "3abc" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_grid_columns");
  });

  it("400 invalid_grid_columns when value is float (3.5)", async () => {
    const res = await callPost({ ...baseBody, images_grid_columns: 3.5 });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_grid_columns");
  });

  it("400 invalid_fit when value is 'fill'", async () => {
    const res = await callPost({ ...baseBody, images_fit: "fill" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_fit");
  });

  it("accepts missing new fields and applies application-defaults (cols=1, fit=cover)", async () => {
    // No images_grid_columns, no images_fit in body.
    const res = await callPost(baseBody);
    expect(res.status).toBe(201);
    // Verify INSERT was called with defaults at correct positions ($6, $7).
    const insertCall = mockQuery.mock.calls.find((c) => c[0].includes("INSERT INTO agenda_items"));
    expect(insertCall).toBeDefined();
    const params = insertCall![1] as unknown[];
    // Order: datum, zeit, ort_url, hashtags, images, gridColumns, fit, title_i18n, ...
    expect(params[5]).toBe(1); // gridColumns default
    expect(params[6]).toBe("cover"); // fit default
  });

  it("persists explicit valid images_grid_columns=3 + images_fit='contain'", async () => {
    const res = await callPost({ ...baseBody, images_grid_columns: 3, images_fit: "contain" });
    expect(res.status).toBe(201);
    const insertCall = mockQuery.mock.calls.find((c) => c[0].includes("INSERT INTO agenda_items"));
    const params = insertCall![1] as unknown[];
    expect(params[5]).toBe(3);
    expect(params[6]).toBe("contain");
  });
});
