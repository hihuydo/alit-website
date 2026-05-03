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
      "http://localhost/api/dashboard/agenda/1/instagram-slide/0?locale=de",
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

// ---------------------------------------------------------------------------
// M4a A6: MAX_GRID_IMAGES clamp on the PNG-render route. Pre-M4a this route
// resolved `instagram_layout_i18n[locale][String(imageCount)]` with the raw
// `requestedImages`, allowing legacy "5"/"10" override keys to render >4
// images while the layout/metadata endpoints already capped — route-to-route
// inconsistency. Codex R1 HIGH (Correctness).
// ---------------------------------------------------------------------------

describe("GET /api/dashboard/agenda/[id]/instagram-slide/[slideIdx] — MAX_GRID_IMAGES clamp", () => {
  const mockQuery = vi.fn();
  const mockResolve = vi.fn();
  const mockLoadSupporters = vi.fn();
  const mockLoadFonts = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", JWT_SECRET);
    mockQuery.mockReset();
    mockResolve.mockReset();
    mockLoadSupporters.mockReset();
    mockLoadFonts.mockReset();
    vi.doMock("@/lib/db", () => ({ default: { query: mockQuery } }));
    vi.doMock("@/lib/instagram-overrides", () => ({
      resolveInstagramSlides: mockResolve,
    }));
    vi.doMock("@/lib/supporter-logos", () => ({
      loadSupporterSlideLogos: mockLoadSupporters,
    }));
    // Force fail-closed before Satori, so we never need to render JSX in node.
    vi.doMock("@/lib/instagram-fonts", () => ({
      loadInstagramFonts: mockLoadFonts,
      FONT_FAMILY: "PP Fragment Sans",
      FONT_FILES: {
        300: "x.woff",
        400: "y.woff",
        800: "z.woff",
      },
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.doUnmock("@/lib/db");
    vi.doUnmock("@/lib/instagram-overrides");
    vi.doUnmock("@/lib/supporter-logos");
    vi.doUnmock("@/lib/instagram-fonts");
  });

  it("Codex R1 HIGH: ?images=5 with availableImages=6 + override at '4' → resolver receives imageCount=4 + the '4'-key override", async () => {
    const overrideAt5 = {
      contentHash: "deadbeef00000005",
      slides: [{ blocks: ["block:p1"] }],
    };
    const overrideAt4 = {
      contentHash: "deadbeef00000004",
      slides: [{ blocks: ["block:p1"] }],
    };
    mockQuery
      .mockResolvedValueOnce({ rows: [{ token_version: 5 }] }) // requireAuth tv-check
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            datum: "2026-05-01",
            zeit: "19:00",
            title_i18n: { de: "T", fr: null },
            lead_i18n: null,
            ort_i18n: { de: "Basel", fr: null },
            content_i18n: {
              de: [{ id: "p1", type: "paragraph", content: [{ text: "x" }] }],
              fr: null,
            },
            hashtags: null,
            images: Array.from({ length: 6 }, (_, i) => ({
              public_id: `img-${i}`,
              orientation: "landscape",
              width: 1200,
              height: 800,
            })),
            images_grid_columns: 2,
            supporter_logos: [],
            instagram_layout_i18n: {
              de: { "4": overrideAt4, "5": overrideAt5 },
            },
          },
        ],
      });
    mockLoadSupporters.mockResolvedValueOnce([]);
    mockResolve.mockReturnValueOnce({
      slides: [],
      warnings: [],
      mode: "auto",
      contentHash: "x",
    });

    const { GET } = await import("./route");
    const res = await GET(
      fakeReq({
        sessionCookie: await makeToken("1", 5),
        url: "http://localhost/api/dashboard/agenda/1/instagram-slide/0?locale=de&images=5",
      }),
      { params: Promise.resolve({ id: "1", slideIdx: "0" }) },
    );
    // Resolver returned slides=[] → route falls through to 404 slide_not_found.
    expect(res.status).toBe(404);

    // The contract assertion: resolver MUST have been called with the clamped
    // imageCount (3rd arg) and the "4"-key override (4th arg) — NOT the "5".
    expect(mockResolve).toHaveBeenCalledTimes(1);
    const [, , imageCount, override] = mockResolve.mock.calls[0];
    expect(imageCount).toBe(4); // MAX_GRID_IMAGES clamp
    expect(override).toEqual(overrideAt4); // legacy "5" key unreachable
  });
});

// DK-20 / Codex R1 #3 — per-image try/catch isolation lives in
// loadGridImageDataUrls. Tested directly (not via the route) so we don't
// have to evaluate the JSX at <SlideTemplate /> in a node test env.
// The route handler itself is a thin wrapper that just calls this helper
// when slide.kind === "grid".
