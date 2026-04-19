// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SignJWT } from "jose";

const JWT_SECRET =
  "test-secret-at-least-32-chars-long-ig-slide-fontfail";

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
    url:
      opts.url ??
      "http://localhost/api/dashboard/agenda/1/instagram-slide/0?locale=de&scale=m",
    method: "GET",
    headers: { get: () => null },
    cookies: { get: (name: string) => cookies.get(name) },
  } as unknown as import("next/server").NextRequest;
}

describe("GET /api/dashboard/agenda/[id]/instagram-slide/[slideIdx] — font fail-closed", () => {
  const mockQuery = vi.fn();
  const mockLoadFonts = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", JWT_SECRET);
    mockQuery.mockReset();
    mockLoadFonts.mockReset();
    vi.doMock("@/lib/db", () => ({ default: { query: mockQuery } }));
    vi.doMock("@/lib/cookie-counter", () => ({
      bumpCookieSource: vi.fn(),
      deriveEnv: () => "prod",
    }));
    vi.doMock("@/lib/instagram-fonts", () => ({
      loadInstagramFonts: mockLoadFonts,
      FONT_FAMILY: "PP Fragment Sans",
      FONT_FILES: {
        300: "PPFragment-SansLight.woff",
        400: "PPFragment-SansRegular.woff",
        800: "PPFragment-SansExtraBold.woff",
      },
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.doUnmock("@/lib/db");
    vi.doUnmock("@/lib/cookie-counter");
    vi.doUnmock("@/lib/instagram-fonts");
  });

  const validAgendaRow = {
    id: 1,
    datum: "2026-05-01",
    zeit: "19:00",
    title_i18n: { de: "Titel", fr: null },
    lead_i18n: null,
    ort_i18n: { de: "Basel", fr: null },
    content_i18n: {
      de: [
        {
          id: "p1",
          type: "paragraph",
          content: [{ text: "valid content" }],
        },
      ],
      fr: null,
    },
    hashtags: null,
    images: null,
  };

  it("returns 500 with error='font_load_failed' when weight 300 fails", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ token_version: 5 }] }) // requireAuth tv-check
      .mockResolvedValueOnce({ rows: [validAgendaRow] });
    mockLoadFonts.mockReturnValue({
      ok: false,
      weight: 300,
      error: new Error("fake-light-fail"),
    });

    const { GET } = await import("./route");
    const res = await GET(fakeReq({ sessionCookie: await makeToken("1", 5) }), {
      params: Promise.resolve({ id: "1", slideIdx: "0" }),
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("font_load_failed");
    expect(body.weight).toBe(300);
  });

  it("returns 500 with error='font_load_failed' when weight 400 fails", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ token_version: 5 }] })
      .mockResolvedValueOnce({ rows: [validAgendaRow] });
    mockLoadFonts.mockReturnValue({
      ok: false,
      weight: 400,
      error: new Error("fake-regular-fail"),
    });

    const { GET } = await import("./route");
    const res = await GET(fakeReq({ sessionCookie: await makeToken("1", 5) }), {
      params: Promise.resolve({ id: "1", slideIdx: "0" }),
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("font_load_failed");
    expect(body.weight).toBe(400);
  });

  it("returns 500 with error='font_load_failed' when weight 800 fails", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ token_version: 5 }] })
      .mockResolvedValueOnce({ rows: [validAgendaRow] });
    mockLoadFonts.mockReturnValue({
      ok: false,
      weight: 800,
      error: new Error("fake-bold-fail"),
    });

    const { GET } = await import("./route");
    const res = await GET(fakeReq({ sessionCookie: await makeToken("1", 5) }), {
      params: Promise.resolve({ id: "1", slideIdx: "0" }),
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("font_load_failed");
    expect(body.weight).toBe(800);
  });

  it("400 on invalid id", async () => {
    const { GET } = await import("./route");
    const res = await GET(fakeReq({}), {
      params: Promise.resolve({ id: "abc", slideIdx: "0" }),
    });
    expect(res.status).toBe(400);
  });

  it("400 on invalid slideIdx", async () => {
    const { GET } = await import("./route");
    const res = await GET(fakeReq({}), {
      params: Promise.resolve({ id: "1", slideIdx: "-1" }),
    });
    expect(res.status).toBe(400);
  });

});
