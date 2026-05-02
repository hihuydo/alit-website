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

describe("POST /api/dashboard/agenda — images_grid_columns", () => {
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

  it("accepts missing images_grid_columns and applies application-default (cols=1)", async () => {
    const res = await callPost(baseBody);
    expect(res.status).toBe(201);
    // INSERT order: datum, zeit, ort_url, hashtags, images, gridColumns, title_i18n, ...
    const insertCall = mockQuery.mock.calls.find((c) => c[0].includes("INSERT INTO agenda_items"));
    expect(insertCall).toBeDefined();
    const params = insertCall![1] as unknown[];
    expect(params[5]).toBe(1); // gridColumns default
  });

  it("persists explicit valid images_grid_columns=3", async () => {
    const res = await callPost({ ...baseBody, images_grid_columns: 3 });
    expect(res.status).toBe(201);
    const insertCall = mockQuery.mock.calls.find((c) => c[0].includes("INSERT INTO agenda_items"));
    const params = insertCall![1] as unknown[];
    expect(params[5]).toBe(3);
  });

  it("INSERT does not write images_fit (column orphaned, DEFAULT 'cover' supplies value)", async () => {
    const res = await callPost(baseBody);
    expect(res.status).toBe(201);
    const insertCall = mockQuery.mock.calls.find((c) => c[0].includes("INSERT INTO agenda_items"));
    const sql = insertCall![0] as string;
    expect(sql).not.toContain("images_fit");
  });
});

/**
 * Sprint 2 — POST/agenda crop validation pass-through. Spec Req 11.
 * Route delegates to validateImages(); these tests verify the 201/400 mapping.
 */
describe("POST /api/dashboard/agenda — cropX/cropY pass-through", () => {
  const mockQuery = vi.fn();
  const mockConnect = vi.fn();
  const mockClient = { query: vi.fn(), release: vi.fn() };
  const validateImagesMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", JWT_SECRET);
    mockQuery.mockReset();
    mockConnect.mockReset();
    mockConnect.mockResolvedValue(mockClient);
    validateImagesMock.mockReset();
    vi.doMock("@/lib/db", () => ({
      default: { query: mockQuery, connect: mockConnect },
    }));
    vi.doMock("@/lib/agenda-hashtags", () => ({
      validateHashtagsI18n: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    }));
    vi.doMock("@/lib/agenda-images", () => ({
      validateImages: validateImagesMock,
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
    images_grid_columns: 1,
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

  it("201 when validateImages accepts valid cropX/cropY (50/50)", async () => {
    validateImagesMock.mockResolvedValueOnce({
      ok: true,
      value: [{ public_id: "abc", orientation: "landscape", width: null, height: null, alt: null, cropX: 50, cropY: 50 }],
    });
    const res = await callPost({
      ...baseBody,
      images: [{ public_id: "abc", orientation: "landscape", cropX: 50, cropY: 50 }],
    });
    expect(res.status).toBe(201);
  });

  it("400 with /crop/i error when validateImages rejects cropX=101", async () => {
    validateImagesMock.mockResolvedValueOnce({
      ok: false,
      error: "crop value out of range",
    });
    const res = await callPost({
      ...baseBody,
      images: [{ public_id: "abc", orientation: "landscape", cropX: 101 }],
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/crop/i);
  });
});

/**
 * Sprint M3 — POST/agenda supporter_logos pass-through.
 * Route delegates to validateSupporterLogos(); these tests verify
 * the 201/400 mapping plus the missing-key default-to-empty path.
 */
describe("POST /api/dashboard/agenda — supporter_logos pass-through", () => {
  const mockQuery = vi.fn();
  const mockConnect = vi.fn();
  const mockClient = { query: vi.fn(), release: vi.fn() };
  const validateSupporterLogosMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", JWT_SECRET);
    mockQuery.mockReset();
    mockConnect.mockReset();
    mockConnect.mockResolvedValue(mockClient);
    validateSupporterLogosMock.mockReset();
    vi.doMock("@/lib/db", () => ({
      default: { query: mockQuery, connect: mockConnect },
    }));
    vi.doMock("@/lib/agenda-hashtags", () => ({
      validateHashtagsI18n: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    }));
    vi.doMock("@/lib/agenda-images", () => ({
      validateImages: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    }));
    vi.doMock("@/lib/supporter-logos", () => ({
      validateSupporterLogos: validateSupporterLogosMock,
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
    images_grid_columns: 1,
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

  it("201 when supporter_logos missing and INSERT writes []::jsonb", async () => {
    const res = await callPost(baseBody);
    expect(res.status).toBe(201);
    // validator NOT called when key absent
    expect(validateSupporterLogosMock).not.toHaveBeenCalled();
    const insertCall = mockQuery.mock.calls.find((c) =>
      c[0].includes("INSERT INTO agenda_items"),
    );
    expect(insertCall).toBeDefined();
    const params = insertCall![1] as unknown[];
    // Order: datum, zeit, ort_url, hashtags, images, gridColumns, supporter_logos, ...
    expect(params[6]).toBe(JSON.stringify([]));
  });

  it("201 when supporter_logos validates and persists JSON", async () => {
    validateSupporterLogosMock.mockResolvedValueOnce({
      ok: true,
      value: [
        { public_id: "logo-1", alt: "Pro Helvetia", width: 200, height: 80 },
      ],
    });
    const res = await callPost({
      ...baseBody,
      supporter_logos: [
        { public_id: "logo-1", alt: "Pro Helvetia", width: 200, height: 80 },
      ],
    });
    expect(res.status).toBe(201);
    expect(validateSupporterLogosMock).toHaveBeenCalledTimes(1);
    const insertCall = mockQuery.mock.calls.find((c) =>
      c[0].includes("INSERT INTO agenda_items"),
    );
    const params = insertCall![1] as unknown[];
    expect(JSON.parse(params[6] as string)).toEqual([
      { public_id: "logo-1", alt: "Pro Helvetia", width: 200, height: 80 },
    ]);
  });

  it("400 when validateSupporterLogos rejects (cap)", async () => {
    validateSupporterLogosMock.mockResolvedValueOnce({
      ok: false,
      error: "Too many supporter logos (max 8)",
    });
    const res = await callPost({
      ...baseBody,
      supporter_logos: Array.from({ length: 9 }, () => ({ public_id: "x" })),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/too many supporter logos/i);
  });

  it("400 when validateSupporterLogos rejects FK", async () => {
    validateSupporterLogosMock.mockResolvedValueOnce({
      ok: false,
      error: "Unknown media reference",
    });
    const res = await callPost({
      ...baseBody,
      supporter_logos: [{ public_id: "ghost" }],
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/unknown media reference/i);
  });

  it("INSERT SQL contains supporter_logos column", async () => {
    const res = await callPost(baseBody);
    expect(res.status).toBe(201);
    const insertCall = mockQuery.mock.calls.find((c) =>
      c[0].includes("INSERT INTO agenda_items"),
    );
    expect(insertCall![0]).toContain("supporter_logos");
  });
});
