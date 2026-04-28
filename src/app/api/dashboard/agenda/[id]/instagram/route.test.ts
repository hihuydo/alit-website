// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SignJWT } from "jose";

const JWT_SECRET =
  "test-secret-at-least-32-chars-long-ig-metadata-abcdefg";

async function makeToken(sub: string, tv: number): Promise<string> {
  return new SignJWT({ sub, tv })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(new TextEncoder().encode(JWT_SECRET));
}

function fakeReq(opts: {
  url?: string;
  sessionCookie?: string;
}): import("next/server").NextRequest {
  const cookies = new Map<string, { value: string }>();
  if (opts.sessionCookie) {
    cookies.set("__Host-session", { value: opts.sessionCookie });
    cookies.set("session", { value: opts.sessionCookie });
  }
  return {
    url: opts.url ?? "http://localhost/api/dashboard/agenda/1/instagram?locale=de",
    method: "GET",
    headers: { get: () => null },
    cookies: { get: (name: string) => cookies.get(name) },
  } as unknown as import("next/server").NextRequest;
}

describe("GET /api/dashboard/agenda/[id]/instagram (metadata)", () => {
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

  it("400 on invalid id path-param", async () => {
    const { GET } = await import("./route");
    const res = await GET(fakeReq({}), { params: Promise.resolve({ id: "abc" }) });
    expect(res.status).toBe(400);
  });

  it("400 on missing locale query-param", async () => {
    const { GET } = await import("./route");
    const res = await GET(
      fakeReq({
        url: "http://localhost/api/dashboard/agenda/1/instagram",
      }),
      { params: Promise.resolve({ id: "1" }) },
    );
    expect(res.status).toBe(400);
  });

  it("401 when no session cookie", async () => {
    const { GET } = await import("./route");
    const res = await GET(fakeReq({}), { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(401);
  });

  it("404 Not found when agenda row does not exist", async () => {
    // 1st query = admin_session_version token_version check (requireAuth)
    // 2nd query = agenda_items SELECT returning empty
    mockQuery
      .mockResolvedValueOnce({ rows: [{ token_version: 5 }] }) // requireAuth tv-check
      .mockResolvedValueOnce({ rows: [] }); // agenda_items SELECT
    const { GET } = await import("./route");
    const res = await GET(
      fakeReq({ sessionCookie: await makeToken("1", 5) }),
      { params: Promise.resolve({ id: "9999" }) },
    );
    expect(res.status).toBe(404);
  });

  it("404 locale_empty when locale has no exportable text", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ token_version: 5 }] }) // requireAuth
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            datum: "2026-05-01",
            zeit: "19:00",
            title_i18n: { de: "Nur DE", fr: "" }, // FR empty
            lead_i18n: { de: "", fr: "" },
            ort_i18n: { de: "Basel", fr: "" },
            content_i18n: null, // no content in either locale
            hashtags: null,
            images: null,
          },
        ],
      });
    const { GET } = await import("./route");
    const res = await GET(
      fakeReq({
        sessionCookie: await makeToken("1", 5),
        url: "http://localhost/api/dashboard/agenda/1/instagram?locale=fr",
      }),
      { params: Promise.resolve({ id: "1" }) },
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("locale_empty");
  });

  it("200 JSON {slideCount, warnings:[]} on happy path (short content)", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ token_version: 5 }] }) // requireAuth
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            datum: "2026-05-01",
            zeit: "19:00",
            title_i18n: { de: "Titel", fr: "Titre" },
            lead_i18n: { de: "Lead", fr: "" },
            ort_i18n: { de: "Basel", fr: "" },
            content_i18n: {
              de: [
                {
                  id: "p1",
                  type: "paragraph",
                  content: [{ text: "kurzer inhalt" }],
                },
              ],
              fr: null,
            },
            hashtags: null,
            images: null,
          },
        ],
      });
    const { GET } = await import("./route");
    const res = await GET(
      fakeReq({ sessionCookie: await makeToken("1", 5) }),
      { params: Promise.resolve({ id: "1" }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.slideCount).toBe(1);
    expect(body.warnings).toEqual([]);
  });

  it("200 with warnings:['too_long'] + slideCount clamped to 10 on overflow", async () => {
    // 30 paragraphs × 500 chars at scale=l (threshold=800) → raw 30 → clamp 10
    const paragraphs = Array.from({ length: 30 }, (_, i) => ({
      id: `p${i}`,
      type: "paragraph" as const,
      content: [{ text: "x".repeat(500) }],
    }));
    mockQuery
      .mockResolvedValueOnce({ rows: [{ token_version: 5 }] }) // requireAuth
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            datum: "2026-05-01",
            zeit: "19:00",
            title_i18n: { de: "T", fr: null },
            lead_i18n: null,
            ort_i18n: { de: "Basel", fr: null },
            content_i18n: { de: paragraphs, fr: null },
            hashtags: null,
            images: null,
          },
        ],
      });
    const { GET } = await import("./route");
    const res = await GET(
      fakeReq({
        sessionCookie: await makeToken("1", 5),
        url: "http://localhost/api/dashboard/agenda/1/instagram?locale=de",
      }),
      { params: Promise.resolve({ id: "1" }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.slideCount).toBe(10); // clamped
    expect(body.warnings).toEqual(["too_long"]);
  });
});
