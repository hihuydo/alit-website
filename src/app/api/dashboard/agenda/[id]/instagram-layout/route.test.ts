// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SignJWT } from "jose";
import type { JournalContent } from "@/lib/journal-types";
import {
  flattenContentWithIds,
  type AgendaItemForExport,
  type InstagramLayoutOverride,
  type InstagramLayoutOverrides,
  type Locale,
} from "@/lib/instagram-post";
import {
  computeLayoutHash,
  computeLayoutVersion,
} from "@/lib/instagram-overrides";

const JWT_SECRET = "test-secret-at-least-32-chars-long-instagram-layout-XX";

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
  url?: string;
  method?: string;
  sessionCookie?: string;
  csrfCookie?: string;
  csrfHeader?: string;
  body?: unknown;
}): import("next/server").NextRequest {
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
    method: opts.method ?? "GET",
    url:
      opts.url ??
      "http://localhost/api/dashboard/agenda/1/instagram-layout?locale=de&images=0",
    headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
    cookies: { get: (name: string) => cookies.get(name) },
    text: async () => bodyText,
  } as unknown as import("next/server").NextRequest;
}

function paragraphs(count: number, charsEach: number, prefix = "p"): JournalContent {
  const text = "x".repeat(charsEach);
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${i}`,
    type: "paragraph" as const,
    content: [{ text }],
  }));
}

function baseItem(
  overrides: Partial<AgendaItemForExport> & {
    instagram_layout_i18n?: InstagramLayoutOverrides | null;
  } = {},
): AgendaItemForExport & { instagram_layout_i18n: InstagramLayoutOverrides | null } {
  return {
    id: 1,
    datum: "2026-05-01",
    zeit: "19:00",
    title_i18n: { de: "T", fr: "T" },
    lead_i18n: { de: "L", fr: "L" },
    ort_i18n: { de: "O", fr: "O" },
    content_i18n: { de: paragraphs(2, 30), fr: null },
    hashtags: null,
    images: undefined,
    images_grid_columns: null,
    instagram_layout_i18n: null,
    ...overrides,
  };
}

function makeOverride(
  item: AgendaItemForExport,
  locale: Locale,
  imageCount: number,
  blockGroups: string[][],
): InstagramLayoutOverride {
  return {
    contentHash: computeLayoutHash({ item, locale, imageCount }),
    slides: blockGroups.map((blocks) => ({ blocks })),
  };
}

describe("/api/dashboard/agenda/[id]/instagram-layout", () => {
  const mockQuery = vi.fn();
  const mockConnect = vi.fn();
  const mockClient = { query: vi.fn(), release: vi.fn() };
  const mockResolveActorEmail = vi.fn();
  const mockAuditLog = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", JWT_SECRET);
    mockQuery.mockReset();
    mockConnect.mockReset();
    mockClient.query.mockReset();
    mockClient.release.mockReset();
    mockResolveActorEmail.mockReset().mockResolvedValue("admin@example.com");
    mockAuditLog.mockReset();
    mockConnect.mockResolvedValue(mockClient);

    vi.doMock("@/lib/db", () => ({
      default: { query: mockQuery, connect: mockConnect },
    }));
    vi.doMock("@/lib/signups-audit", () => ({
      resolveActorEmail: mockResolveActorEmail,
    }));
    vi.doMock("@/lib/audit", () => ({
      auditLog: mockAuditLog,
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  // =========================================================================
  // GET
  // =========================================================================

  describe("GET", () => {
    async function callGet(opts: {
      id?: string;
      url?: string;
      withAuth?: boolean;
    } = {}) {
      const id = opts.id ?? "1";
      if (opts.withAuth !== false) {
        mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
      }
      const { GET } = await import("./route");
      return GET(
        fakeReq({
          method: "GET",
          url:
            opts.url ??
            `http://localhost/api/dashboard/agenda/${id}/instagram-layout?locale=de&images=0`,
          sessionCookie:
            opts.withAuth === false ? undefined : await makeToken("1", 1),
        }),
        { params: Promise.resolve({ id }) },
      );
    }

    it("400 bei invalid id (abc)", async () => {
      const res = await callGet({ id: "abc" });
      expect(res.status).toBe(400);
    });

    it("400 bei invalid id (0)", async () => {
      const res = await callGet({ id: "0" });
      expect(res.status).toBe(400);
    });

    it("400 bei missing locale", async () => {
      const res = await callGet({
        url: "http://localhost/api/dashboard/agenda/1/instagram-layout?images=0",
      });
      expect(res.status).toBe(400);
    });

    it("400 bei invalid images param (non-numeric)", async () => {
      const res = await callGet({
        url: "http://localhost/api/dashboard/agenda/1/instagram-layout?locale=de&images=abc",
      });
      expect(res.status).toBe(400);
    });

    it("400 bei images > MAX_BODY_IMAGE_COUNT", async () => {
      const res = await callGet({
        url: "http://localhost/api/dashboard/agenda/1/instagram-layout?locale=de&images=21",
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("image_count_too_large");
    });

    it("401 ohne Auth", async () => {
      const { GET } = await import("./route");
      const res = await GET(
        fakeReq({
          method: "GET",
          url: "http://localhost/api/dashboard/agenda/1/instagram-layout?locale=de&images=0",
        }),
        { params: Promise.resolve({ id: "1" }) },
      );
      expect(res.status).toBe(401);
    });

    it("404 wenn agenda_id nicht existiert", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const { GET } = await import("./route");
      const res = await GET(
        fakeReq({
          method: "GET",
          url: "http://localhost/api/dashboard/agenda/1/instagram-layout?locale=de&images=0",
          sessionCookie: await makeToken("1", 1),
        }),
        { params: Promise.resolve({ id: "1" }) },
      );
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("not_found");
    });

    it("404 mit error: locale_empty wenn isLocaleEmpty", async () => {
      const item = baseItem({
        title_i18n: { de: "T", fr: null },
        lead_i18n: { de: null, fr: null },
        ort_i18n: { de: null, fr: null },
        content_i18n: { de: null, fr: null },
      });
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
      mockQuery.mockResolvedValueOnce({ rows: [item] });
      const { GET } = await import("./route");
      const res = await GET(
        fakeReq({
          method: "GET",
          url: "http://localhost/api/dashboard/agenda/1/instagram-layout?locale=fr&images=0",
          sessionCookie: await makeToken("1", 1),
        }),
        { params: Promise.resolve({ id: "1" }) },
      );
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("locale_empty");
    });

    it("200 mode=auto + layoutVersion=null wenn override absent + block-IDs present", async () => {
      const item = baseItem();
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
      mockQuery.mockResolvedValueOnce({ rows: [item] });
      const { GET } = await import("./route");
      const res = await GET(
        fakeReq({
          method: "GET",
          url: "http://localhost/api/dashboard/agenda/1/instagram-layout?locale=de&images=0",
          sessionCookie: await makeToken("1", 1),
        }),
        { params: Promise.resolve({ id: "1" }) },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.mode).toBe("auto");
      expect(body.layoutVersion).toBeNull();
      expect(body.warnings).toEqual([]);
      expect(body.imageCount).toBe(0);
      expect(body.availableImages).toBe(0);
      expect(body.slides[0].blocks[0].id).toMatch(/^block:/);
      expect(body.slides[0]).toHaveProperty("index", 0);
    });

    it("200 mode=manual + layoutVersion=<16-char> + block-IDs present", async () => {
      const item = baseItem();
      const blocks = flattenContentWithIds(item.content_i18n!.de!);
      const stored = makeOverride(item, "de", 0, [blocks.map((b) => b.id)]);
      const expectedVersion = computeLayoutVersion(stored);
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...item, instagram_layout_i18n: { de: { "0": stored } } }],
      });
      const { GET } = await import("./route");
      const res = await GET(
        fakeReq({
          method: "GET",
          url: "http://localhost/api/dashboard/agenda/1/instagram-layout?locale=de&images=0",
          sessionCookie: await makeToken("1", 1),
        }),
        { params: Promise.resolve({ id: "1" }) },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.mode).toBe("manual");
      expect(body.layoutVersion).toBe(expectedVersion);
      expect(body.layoutVersion).toMatch(/^[0-9a-f]{16}$/);
      expect(
        body.slides.every((s: { blocks: { id: string }[] }) =>
          s.blocks.every((b) => b.id.startsWith("block:")),
        ),
      ).toBe(true);
    });

    it("200 mode=stale + warnings contains layout_stale + block-IDs present", async () => {
      const item = baseItem();
      const blocks = flattenContentWithIds(item.content_i18n!.de!);
      const validHash = computeLayoutHash({ item, locale: "de", imageCount: 0 });
      // Stale: contentHash mutated (per S1a WARN-3 — append "x" to keep 17 chars)
      const stored: InstagramLayoutOverride = {
        contentHash: validHash.slice(0, 15) + "f", // legal hex, deliberately wrong
        slides: [{ blocks: blocks.map((b) => b.id) }],
      };
      const expectedVersion = computeLayoutVersion(stored);
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...item, instagram_layout_i18n: { de: { "0": stored } } }],
      });
      const { GET } = await import("./route");
      const res = await GET(
        fakeReq({
          method: "GET",
          url: "http://localhost/api/dashboard/agenda/1/instagram-layout?locale=de&images=0",
          sessionCookie: await makeToken("1", 1),
        }),
        { params: Promise.resolve({ id: "1" }) },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.mode).toBe("stale");
      expect(body.warnings).toContain("layout_stale");
      expect(body.layoutVersion).toBe(expectedVersion);
      expect(body.slides[0].blocks[0].id).toMatch(/^block:/);
    });

    it("200 mode=stale + warnings=[orphan_image_count] + slides=[] wenn imageCount > availableImages", async () => {
      const item = baseItem({ images: [] });
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
      mockQuery.mockResolvedValueOnce({ rows: [item] });
      const { GET } = await import("./route");
      const res = await GET(
        fakeReq({
          method: "GET",
          url: "http://localhost/api/dashboard/agenda/1/instagram-layout?locale=de&images=2",
          sessionCookie: await makeToken("1", 1),
        }),
        { params: Promise.resolve({ id: "1" }) },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.mode).toBe("stale");
      expect(body.warnings).toEqual(["orphan_image_count"]);
      expect(body.slides).toEqual([]);
      expect(body.contentHash).toBeNull();
    });

    it("200 mit title-only locale: mode=auto + slides=[] + warnings=[]", async () => {
      const item = baseItem({
        title_i18n: { de: "T", fr: "T" },
        lead_i18n: { de: null, fr: null },
        ort_i18n: { de: null, fr: null },
        content_i18n: { de: [], fr: null },
      });
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
      mockQuery.mockResolvedValueOnce({ rows: [item] });
      const { GET } = await import("./route");
      const res = await GET(
        fakeReq({
          method: "GET",
          url: "http://localhost/api/dashboard/agenda/1/instagram-layout?locale=de&images=0",
          sessionCookie: await makeToken("1", 1),
        }),
        { params: Promise.resolve({ id: "1" }) },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.mode).toBe("auto");
      expect(body.slides).toEqual([]);
      expect(body.warnings).toEqual([]);
    });

    it("200 mode=manual + imageCount=1 + grid-backed: slides.length === stored.slides.length", async () => {
      const item = baseItem({
        content_i18n: { de: paragraphs(3, 30), fr: null },
        images: [{ public_id: "img-a" }],
      });
      const blocks = flattenContentWithIds(item.content_i18n!.de!);
      // Manual layout: split blocks across 2 slides
      const stored = makeOverride(item, "de", 1, [
        [blocks[0].id],
        [blocks[1].id, blocks[2].id],
      ]);
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...item, instagram_layout_i18n: { de: { "1": stored } } }],
      });
      const { GET } = await import("./route");
      const res = await GET(
        fakeReq({
          method: "GET",
          url: "http://localhost/api/dashboard/agenda/1/instagram-layout?locale=de&images=1",
          sessionCookie: await makeToken("1", 1),
        }),
        { params: Promise.resolve({ id: "1" }) },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.mode).toBe("manual");
      expect(body.slides.length).toBe(stored.slides.length);
      expect(
        body.slides.every((s: { blocks: { id: string }[] }) =>
          s.blocks.every((b) => b.id.startsWith("block:")),
        ),
      ).toBe(true);
    });

    it("200 mode=manual + oversized block: anti-fragmentation regression", async () => {
      // Single oversized paragraph (~800 chars) — splitOversizedBlock would
      // produce 2+ fragments at render time; manual GET must return 1 block.
      const item = baseItem({
        content_i18n: { de: paragraphs(1, 800), fr: null },
      });
      const blocks = flattenContentWithIds(item.content_i18n!.de!);
      expect(blocks.length).toBe(1);
      const stored = makeOverride(item, "de", 0, [[blocks[0].id]]);
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...item, instagram_layout_i18n: { de: { "0": stored } } }],
      });
      const { GET } = await import("./route");
      const res = await GET(
        fakeReq({
          method: "GET",
          url: "http://localhost/api/dashboard/agenda/1/instagram-layout?locale=de&images=0",
          sessionCookie: await makeToken("1", 1),
        }),
        { params: Promise.resolve({ id: "1" }) },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.slides.length).toBe(1);
      expect(body.slides[0].blocks.length).toBe(1);
      expect(body.slides[0].blocks[0].id).toBe(blocks[0].id);
    });

    it("200 auto-content > cap (text-only) → cap @ 10 + warning", async () => {
      // 12 distinct paragraphs that each become own group (charsEach=400 →
      // ~10*52+22 ≈ 542 px > SLIDE_BUDGET-ish; ensure 1 block per group).
      const item = baseItem({
        content_i18n: { de: paragraphs(12, 400), fr: null },
      });
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
      mockQuery.mockResolvedValueOnce({ rows: [item] });
      const { GET } = await import("./route");
      const res = await GET(
        fakeReq({
          method: "GET",
          url: "http://localhost/api/dashboard/agenda/1/instagram-layout?locale=de&images=0",
          sessionCookie: await makeToken("1", 1),
        }),
        { params: Promise.resolve({ id: "1" }) },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.slides.length).toBe(10);
      expect(body.warnings).toContain("too_many_blocks_for_layout");
    });

    it("200 auto-content > cap (grid-backed) → cap @ 9 + warning", async () => {
      const item = baseItem({
        content_i18n: { de: paragraphs(11, 400), fr: null },
        images: [{ public_id: "img-a" }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
      mockQuery.mockResolvedValueOnce({ rows: [item] });
      const { GET } = await import("./route");
      const res = await GET(
        fakeReq({
          method: "GET",
          url: "http://localhost/api/dashboard/agenda/1/instagram-layout?locale=de&images=1",
          sessionCookie: await makeToken("1", 1),
        }),
        { params: Promise.resolve({ id: "1" }) },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.slides.length).toBe(9);
      expect(body.warnings).toContain("too_many_blocks_for_layout");
    });
  });

  // =========================================================================
  // PUT
  // =========================================================================

  describe("PUT", () => {
    async function callPut(opts: {
      id?: string;
      body?: unknown;
      withAuth?: boolean;
      withCsrf?: boolean;
    }) {
      const id = opts.id ?? "1";
      if (opts.withAuth !== false) {
        mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
      }
      const csrf = await buildCsrf(1, 1);
      const { PUT } = await import("./route");
      return PUT(
        fakeReq({
          method: "PUT",
          url: `http://localhost/api/dashboard/agenda/${id}/instagram-layout`,
          sessionCookie:
            opts.withAuth === false ? undefined : await makeToken("1", 1),
          csrfCookie: opts.withCsrf === false ? undefined : csrf,
          csrfHeader: opts.withCsrf === false ? undefined : csrf,
          body: opts.body,
        }),
        { params: Promise.resolve({ id }) },
      );
    }

    function happyBody(item: AgendaItemForExport, locale: Locale = "de") {
      const blocks = flattenContentWithIds(item.content_i18n![locale]!);
      return {
        locale,
        imageCount: 0,
        contentHash: computeLayoutHash({ item, locale, imageCount: 0 }),
        layoutVersion: null,
        slides: [{ blocks: blocks.map((b) => b.id) }],
      };
    }

    it("400 bei invalid id", async () => {
      const res = await callPut({ id: "abc", body: {} });
      expect(res.status).toBe(400);
    });

    it("400 bei body Zod fail (missing fields)", async () => {
      const res = await callPut({ body: { locale: "de" } });
      expect(res.status).toBe(400);
    });

    it("400 bei blocks-array > EXPORT_BLOCKS_HARD_CAP (Zod)", async () => {
      const item = baseItem();
      const ch = computeLayoutHash({ item, locale: "de", imageCount: 0 });
      const tooMany = Array.from({ length: 201 }, (_, i) => `block:p-${i}`);
      const res = await callPut({
        body: {
          locale: "de",
          imageCount: 0,
          contentHash: ch,
          layoutVersion: null,
          slides: [{ blocks: tooMany }],
        },
      });
      expect(res.status).toBe(400);
    });

    it("400 bei imageCount > MAX_BODY_IMAGE_COUNT (Zod, pre-pool.connect)", async () => {
      const item = baseItem();
      const ch = computeLayoutHash({ item, locale: "de", imageCount: 0 });
      const res = await callPut({
        body: {
          locale: "de",
          imageCount: 21,
          contentHash: ch,
          layoutVersion: null,
          slides: [{ blocks: ["block:p-0"] }],
        },
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      // Zod-shaped error, NOT image_count_exceeded
      expect(body.error).toBe("Invalid body");
      expect(mockConnect).not.toHaveBeenCalled();
    });

    it("400 slides=[] → empty_layout", async () => {
      const item = baseItem();
      const ch = computeLayoutHash({ item, locale: "de", imageCount: 0 });
      const res = await callPut({
        body: {
          locale: "de",
          imageCount: 0,
          contentHash: ch,
          layoutVersion: null,
          slides: [],
        },
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("empty_layout");
    });

    it("400 slides.length > SLIDE_HARD_CAP → too_many_slides", async () => {
      const item = baseItem();
      const ch = computeLayoutHash({ item, locale: "de", imageCount: 0 });
      const eleven = Array.from({ length: 11 }, () => ({
        blocks: ["block:p-0"],
      }));
      const res = await callPut({
        body: {
          locale: "de",
          imageCount: 0,
          contentHash: ch,
          layoutVersion: null,
          slides: eleven,
        },
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("too_many_slides");
    });

    it("400 slides[i].blocks=[] → empty_slide", async () => {
      const item = baseItem();
      const ch = computeLayoutHash({ item, locale: "de", imageCount: 0 });
      const res = await callPut({
        body: {
          locale: "de",
          imageCount: 0,
          contentHash: ch,
          layoutVersion: null,
          slides: [{ blocks: [] }],
        },
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("empty_slide");
    });

    it("400 imageCount > availableImages → image_count_exceeded", async () => {
      const item = baseItem({ images: [] });
      const ch = computeLayoutHash({ item, locale: "de", imageCount: 5 });
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [item] }) // SELECT FOR UPDATE
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
      const csrf = await buildCsrf(1, 1);
      const { PUT } = await import("./route");
      const res = await PUT(
        fakeReq({
          method: "PUT",
          sessionCookie: await makeToken("1", 1),
          csrfCookie: csrf,
          csrfHeader: csrf,
          body: {
            locale: "de",
            imageCount: 5,
            contentHash: ch,
            layoutVersion: null,
            slides: [{ blocks: ["block:p-0"] }],
          },
        }),
        { params: Promise.resolve({ id: "1" }) },
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("image_count_exceeded");
    });

    it("400 grid-backed item + slides.length > 9 → too_many_slides_for_grid", async () => {
      const item = baseItem({
        content_i18n: { de: paragraphs(10, 30), fr: null },
        images: [{ public_id: "img-a" }],
      });
      const ch = computeLayoutHash({ item, locale: "de", imageCount: 1 });
      const blocks = flattenContentWithIds(item.content_i18n!.de!);
      // 10 text-slides, each one block — exceeds grid-aware cap (9)
      const slides = blocks.map((b) => ({ blocks: [b.id] }));
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [item] }) // SELECT FOR UPDATE
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
      const csrf = await buildCsrf(1, 1);
      const { PUT } = await import("./route");
      const res = await PUT(
        fakeReq({
          method: "PUT",
          sessionCookie: await makeToken("1", 1),
          csrfCookie: csrf,
          csrfHeader: csrf,
          body: {
            locale: "de",
            imageCount: 1,
            contentHash: ch,
            layoutVersion: null,
            slides,
          },
        }),
        { params: Promise.resolve({ id: "1" }) },
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("too_many_slides_for_grid");
      expect(mockClient.query.mock.calls.some((c) => c[0] === "ROLLBACK")).toBe(true);
    });

    it("401 ohne Auth", async () => {
      const csrf = await buildCsrf(1, 1);
      const { PUT } = await import("./route");
      const res = await PUT(
        fakeReq({
          method: "PUT",
          csrfCookie: csrf,
          csrfHeader: csrf,
          body: { locale: "de", imageCount: 0, contentHash: "0".repeat(16), layoutVersion: null, slides: [] },
        }),
        { params: Promise.resolve({ id: "1" }) },
      );
      expect(res.status).toBe(401);
    });

    it("403 ohne CSRF (csrf_missing)", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
      const { PUT } = await import("./route");
      const res = await PUT(
        fakeReq({
          method: "PUT",
          sessionCookie: await makeToken("1", 1),
          body: { locale: "de", imageCount: 0, contentHash: "0".repeat(16), layoutVersion: null, slides: [] },
        }),
        { params: Promise.resolve({ id: "1" }) },
      );
      expect(res.status).toBe(403);
    });

    it("404 wenn agenda_id nicht existiert", async () => {
      const item = baseItem();
      const ch = computeLayoutHash({ item, locale: "de", imageCount: 0 });
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SELECT FOR UPDATE → empty
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
      const csrf = await buildCsrf(1, 1);
      const { PUT } = await import("./route");
      const res = await PUT(
        fakeReq({
          method: "PUT",
          sessionCookie: await makeToken("1", 1),
          csrfCookie: csrf,
          csrfHeader: csrf,
          body: {
            locale: "de",
            imageCount: 0,
            contentHash: ch,
            layoutVersion: null,
            slides: [{ blocks: ["block:p-0"] }],
          },
        }),
        { params: Promise.resolve({ id: "1" }) },
      );
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("not_found");
    });

    it("404 mit error: locale_empty", async () => {
      const item = baseItem({
        title_i18n: { de: "T", fr: null },
        content_i18n: { de: paragraphs(1, 30), fr: null },
      });
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [item] }) // SELECT FOR UPDATE
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
      const csrf = await buildCsrf(1, 1);
      const { PUT } = await import("./route");
      const res = await PUT(
        fakeReq({
          method: "PUT",
          sessionCookie: await makeToken("1", 1),
          csrfCookie: csrf,
          csrfHeader: csrf,
          body: {
            locale: "fr",
            imageCount: 0,
            contentHash: "0".repeat(16),
            layoutVersion: null,
            slides: [{ blocks: ["block:p-0"] }],
          },
        }),
        { params: Promise.resolve({ id: "1" }) },
      );
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("locale_empty");
    });

    it("409 mit altem contentHash → content_changed", async () => {
      const item = baseItem();
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [item] }) // SELECT FOR UPDATE
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
      const csrf = await buildCsrf(1, 1);
      const { PUT } = await import("./route");
      const res = await PUT(
        fakeReq({
          method: "PUT",
          sessionCookie: await makeToken("1", 1),
          csrfCookie: csrf,
          csrfHeader: csrf,
          body: {
            locale: "de",
            imageCount: 0,
            contentHash: "0".repeat(16), // wrong but well-formed
            layoutVersion: null,
            slides: [{ blocks: ["block:p-0"] }],
          },
        }),
        { params: Promise.resolve({ id: "1" }) },
      );
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toBe("content_changed");
    });

    it("412 mit altem layoutVersion → layout_modified_by_other", async () => {
      const item = baseItem();
      const blocks = flattenContentWithIds(item.content_i18n!.de!);
      const stored = makeOverride(item, "de", 0, [blocks.map((b) => b.id)]);
      const ch = computeLayoutHash({ item, locale: "de", imageCount: 0 });
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ ...item, instagram_layout_i18n: { de: { "0": stored } } }],
        })
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
      const csrf = await buildCsrf(1, 1);
      const { PUT } = await import("./route");
      const res = await PUT(
        fakeReq({
          method: "PUT",
          sessionCookie: await makeToken("1", 1),
          csrfCookie: csrf,
          csrfHeader: csrf,
          body: {
            locale: "de",
            imageCount: 0,
            contentHash: ch,
            layoutVersion: "deadbeefdeadbeef", // wrong but legal
            slides: [{ blocks: blocks.map((b) => b.id) }],
          },
        }),
        { params: Promise.resolve({ id: "1" }) },
      );
      expect(res.status).toBe(412);
      const body = await res.json();
      expect(body.error).toBe("layout_modified_by_other");
    });

    it("422 mit duplicate block-id → duplicate_block", async () => {
      const item = baseItem();
      const ch = computeLayoutHash({ item, locale: "de", imageCount: 0 });
      const blocks = flattenContentWithIds(item.content_i18n!.de!);
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [item] }) // SELECT FOR UPDATE
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
      const csrf = await buildCsrf(1, 1);
      const { PUT } = await import("./route");
      const res = await PUT(
        fakeReq({
          method: "PUT",
          sessionCookie: await makeToken("1", 1),
          csrfCookie: csrf,
          csrfHeader: csrf,
          body: {
            locale: "de",
            imageCount: 0,
            contentHash: ch,
            layoutVersion: null,
            slides: [{ blocks: [blocks[0].id, blocks[0].id] }],
          },
        }),
        { params: Promise.resolve({ id: "1" }) },
      );
      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.error).toBe("duplicate_block");
    });

    it("422 mit unknown block-id → unknown_block", async () => {
      const item = baseItem();
      const ch = computeLayoutHash({ item, locale: "de", imageCount: 0 });
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [item] }) // SELECT FOR UPDATE
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
      const csrf = await buildCsrf(1, 1);
      const { PUT } = await import("./route");
      const res = await PUT(
        fakeReq({
          method: "PUT",
          sessionCookie: await makeToken("1", 1),
          csrfCookie: csrf,
          csrfHeader: csrf,
          body: {
            locale: "de",
            imageCount: 0,
            contentHash: ch,
            layoutVersion: null,
            slides: [{ blocks: ["block:phantom"] }],
          },
        }),
        { params: Promise.resolve({ id: "1" }) },
      );
      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.error).toBe("unknown_block");
    });

    it("422 mit empty-content locale + non-empty body.slides → unknown_block", async () => {
      const item = baseItem({
        title_i18n: { de: "T", fr: "T" },
        content_i18n: { de: [], fr: null },
      });
      const ch = computeLayoutHash({ item, locale: "de", imageCount: 0 });
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [item] }) // SELECT FOR UPDATE
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
      const csrf = await buildCsrf(1, 1);
      const { PUT } = await import("./route");
      const res = await PUT(
        fakeReq({
          method: "PUT",
          sessionCookie: await makeToken("1", 1),
          csrfCookie: csrf,
          csrfHeader: csrf,
          body: {
            locale: "de",
            imageCount: 0,
            contentHash: ch,
            layoutVersion: null,
            slides: [{ blocks: ["block:phantom"] }],
          },
        }),
        { params: Promise.resolve({ id: "1" }) },
      );
      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.error).toBe("unknown_block");
    });

    it("422 mit incomplete coverage → incomplete_layout", async () => {
      const item = baseItem({ content_i18n: { de: paragraphs(2, 30), fr: null } });
      const ch = computeLayoutHash({ item, locale: "de", imageCount: 0 });
      const blocks = flattenContentWithIds(item.content_i18n!.de!);
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [item] }) // SELECT FOR UPDATE
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
      const csrf = await buildCsrf(1, 1);
      const { PUT } = await import("./route");
      const res = await PUT(
        fakeReq({
          method: "PUT",
          sessionCookie: await makeToken("1", 1),
          csrfCookie: csrf,
          csrfHeader: csrf,
          body: {
            locale: "de",
            imageCount: 0,
            contentHash: ch,
            layoutVersion: null,
            slides: [{ blocks: [blocks[0].id] }], // missing blocks[1]
          },
        }),
        { params: Promise.resolve({ id: "1" }) },
      );
      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.error).toBe("incomplete_layout");
    });

    it("200 happy path: UPDATE + jsonb_set + auditLog", async () => {
      const item = baseItem();
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [item] }) // SELECT FOR UPDATE
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // UPDATE
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
      const csrf = await buildCsrf(1, 1);
      const { PUT } = await import("./route");
      const res = await PUT(
        fakeReq({
          method: "PUT",
          sessionCookie: await makeToken("1", 1),
          csrfCookie: csrf,
          csrfHeader: csrf,
          body: happyBody(item, "de"),
        }),
        { params: Promise.resolve({ id: "1" }) },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.layoutVersion).toMatch(/^[0-9a-f]{16}$/);
      expect(mockAuditLog).toHaveBeenCalledWith(
        "agenda_layout_update",
        expect.objectContaining({
          agenda_id: 1,
          locale: "de",
          image_count: 0,
          slide_count: 1,
        }),
      );
    });

    it("500 bei DB-error mid-transaction → ROLLBACK + 500", async () => {
      const item = baseItem();
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
      // BEGIN throws → catch → ROLLBACK attempt → finally release
      mockClient.query.mockImplementationOnce(() => {
        throw new Error("BEGIN failed");
      });
      // ROLLBACK in catch — succeed quietly
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      const csrf = await buildCsrf(1, 1);
      const { PUT } = await import("./route");
      const res = await PUT(
        fakeReq({
          method: "PUT",
          sessionCookie: await makeToken("1", 1),
          csrfCookie: csrf,
          csrfHeader: csrf,
          body: happyBody(item, "de"),
        }),
        { params: Promise.resolve({ id: "1" }) },
      );
      expect(res.status).toBe(500);
      expect(mockClient.query.mock.calls.some((c) => c[0] === "ROLLBACK")).toBe(true);
      expect(mockClient.release).toHaveBeenCalled();
    });

    it("PUT pre-COMMIT actorResolve invariant: throws → ROLLBACK + no COMMIT", async () => {
      const item = baseItem();
      mockResolveActorEmail.mockRejectedValueOnce(new Error("downstream"));
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [item] }) // SELECT FOR UPDATE
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // UPDATE
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK in catch
      const csrf = await buildCsrf(1, 1);
      const { PUT } = await import("./route");
      const res = await PUT(
        fakeReq({
          method: "PUT",
          sessionCookie: await makeToken("1", 1),
          csrfCookie: csrf,
          csrfHeader: csrf,
          body: happyBody(item, "de"),
        }),
        { params: Promise.resolve({ id: "1" }) },
      );
      expect(res.status).toBe(500);
      const sqlCalls = mockClient.query.mock.calls.map((c) => c[0]);
      expect(sqlCalls).toContain("ROLLBACK");
      expect(sqlCalls).not.toContain("COMMIT");
      expect(mockClient.release).toHaveBeenCalled();
      expect(mockAuditLog).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // DELETE
  // =========================================================================

  describe("DELETE", () => {
    async function buildDeleteReq(opts: {
      id?: string;
      url?: string;
      withAuth?: boolean;
      withCsrf?: boolean;
    }) {
      const id = opts.id ?? "1";
      const csrf = await buildCsrf(1, 1);
      return {
        req: fakeReq({
          method: "DELETE",
          url:
            opts.url ??
            `http://localhost/api/dashboard/agenda/${id}/instagram-layout?locale=de&images=0`,
          sessionCookie:
            opts.withAuth === false ? undefined : await makeToken("1", 1),
          csrfCookie: opts.withCsrf === false ? undefined : csrf,
          csrfHeader: opts.withCsrf === false ? undefined : csrf,
        }),
        ctx: { params: Promise.resolve({ id }) },
      };
    }

    it("400 bei invalid id", async () => {
      const { req, ctx } = await buildDeleteReq({ id: "abc" });
      const { DELETE } = await import("./route");
      const res = await DELETE(req, ctx);
      expect(res.status).toBe(400);
    });

    it("400 bei invalid locale", async () => {
      const { req, ctx } = await buildDeleteReq({
        url: "http://localhost/api/dashboard/agenda/1/instagram-layout?locale=xx&images=0",
      });
      const { DELETE } = await import("./route");
      const res = await DELETE(req, ctx);
      expect(res.status).toBe(400);
    });

    it("400 bei invalid images param", async () => {
      const { req, ctx } = await buildDeleteReq({
        url: "http://localhost/api/dashboard/agenda/1/instagram-layout?locale=de&images=abc",
      });
      const { DELETE } = await import("./route");
      const res = await DELETE(req, ctx);
      expect(res.status).toBe(400);
    });

    it("401 ohne Auth", async () => {
      const { req, ctx } = await buildDeleteReq({ withAuth: false });
      const { DELETE } = await import("./route");
      const res = await DELETE(req, ctx);
      expect(res.status).toBe(401);
    });

    it("403 ohne CSRF", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
      const { req, ctx } = await buildDeleteReq({ withCsrf: false });
      const { DELETE } = await import("./route");
      const res = await DELETE(req, ctx);
      expect(res.status).toBe(403);
    });

    it("404 wenn agenda_id nicht existiert (Phantom-Audit prevention)", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SELECT FOR UPDATE empty
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
      const { req, ctx } = await buildDeleteReq({});
      const { DELETE } = await import("./route");
      const res = await DELETE(req, ctx);
      expect(res.status).toBe(404);
      expect(mockAuditLog).not.toHaveBeenCalled();
    });

    it("204 wenn locale hat keinen Content (kein 404 — orphan-cleanup intentional)", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ instagram_layout_i18n: { fr: { "0": null } } }] }) // SELECT FOR UPDATE
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // Phase 1
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // Phase 2
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
      const { req, ctx } = await buildDeleteReq({});
      const { DELETE } = await import("./route");
      const res = await DELETE(req, ctx);
      expect(res.status).toBe(204);
    });

    it("204 happy path: jsonb_set entfernt key + auditLog", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            {
              instagram_layout_i18n: {
                de: { "0": { contentHash: "0".repeat(16), slides: [] } },
              },
            },
          ],
        }) // SELECT FOR UPDATE
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // Phase 1
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // Phase 2
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
      const { req, ctx } = await buildDeleteReq({});
      const { DELETE } = await import("./route");
      const res = await DELETE(req, ctx);
      expect(res.status).toBe(204);
      expect(mockAuditLog).toHaveBeenCalledWith(
        "agenda_layout_reset",
        expect.objectContaining({
          agenda_id: 1,
          locale: "de",
          image_count: 0,
        }),
      );
    });

    it("204 wenn override für key nicht existiert (idempotent + auditLog)", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ instagram_layout_i18n: null }] }) // SELECT FOR UPDATE
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // Phase 1 no-op
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // Phase 2 no-op
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
      const { req, ctx } = await buildDeleteReq({});
      const { DELETE } = await import("./route");
      const res = await DELETE(req, ctx);
      expect(res.status).toBe(204);
      // INTENTIONAL: auditLog fires AUCH bei no-op DELETE.
      expect(mockAuditLog).toHaveBeenCalledWith(
        "agenda_layout_reset",
        expect.objectContaining({ agenda_id: 1 }),
      );
    });

    it("204 + Phase-2 NEGATIVE: collapse-NULL fires NOT wenn andere locale-entries überleben", async () => {
      const ovA: InstagramLayoutOverride = { contentHash: "a".repeat(16), slides: [] };
      const ovB: InstagramLayoutOverride = { contentHash: "b".repeat(16), slides: [] };
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ instagram_layout_i18n: { de: { "0": ovA }, fr: { "0": ovB } } }],
        }) // SELECT FOR UPDATE
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // Phase 1 — entfernt de.0
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // Phase 2 — fr survives, no NULL
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
      const { req, ctx } = await buildDeleteReq({});
      const { DELETE } = await import("./route");
      const res = await DELETE(req, ctx);
      expect(res.status).toBe(204);
      const sqlCalls = mockClient.query.mock.calls.map((c) => c[0] as string);
      expect(sqlCalls.some((s) => s.includes("#- ARRAY"))).toBe(true);
      expect(sqlCalls.some((s) => s.includes("instagram_layout_i18n = NULL"))).toBe(true);
    });

    it("204 + Phase-2 POSITIVE collapse: SQL contains both phases", async () => {
      const ovA: InstagramLayoutOverride = { contentHash: "a".repeat(16), slides: [] };
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ instagram_layout_i18n: { de: { "0": ovA } } }],
        }) // SELECT FOR UPDATE
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // Phase 1
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // Phase 2 — collapse fires
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
      const { req, ctx } = await buildDeleteReq({});
      const { DELETE } = await import("./route");
      const res = await DELETE(req, ctx);
      expect(res.status).toBe(204);
      const sqlCalls = mockClient.query.mock.calls.map((c) => c[0] as string);
      expect(
        sqlCalls.some((s) => s.includes("#- ARRAY") && s.includes("instagram_layout_i18n")),
      ).toBe(true);
      expect(
        sqlCalls.some(
          (s) => s.includes("instagram_layout_i18n = NULL") && s.includes("jsonb_each"),
        ),
      ).toBe(true);
    });

    it("204 wenn imageCount > MAX_BODY_IMAGE_COUNT (cap-frei intentional)", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ instagram_layout_i18n: null }] })
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
      const { req, ctx } = await buildDeleteReq({
        url: "http://localhost/api/dashboard/agenda/1/instagram-layout?locale=de&images=999",
      });
      const { DELETE } = await import("./route");
      const res = await DELETE(req, ctx);
      expect(res.status).toBe(204);
    });

    it("500 bei DB-error → ROLLBACK + internalError", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
      mockClient.query.mockImplementationOnce(() => {
        throw new Error("BEGIN failed");
      });
      mockClient.query.mockResolvedValueOnce({ rows: [] }); // ROLLBACK in catch
      const { req, ctx } = await buildDeleteReq({});
      const { DELETE } = await import("./route");
      const res = await DELETE(req, ctx);
      expect(res.status).toBe(500);
      expect(mockClient.query.mock.calls.some((c) => c[0] === "ROLLBACK")).toBe(true);
      expect(mockClient.release).toHaveBeenCalled();
    });

    it("DELETE pre-COMMIT actorResolve invariant: throws → ROLLBACK + no COMMIT", async () => {
      const ovA: InstagramLayoutOverride = { contentHash: "a".repeat(16), slides: [] };
      mockResolveActorEmail.mockRejectedValueOnce(new Error("downstream"));
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ instagram_layout_i18n: { de: { "0": ovA } } }],
        }) // SELECT FOR UPDATE
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // Phase 1
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // Phase 2
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK in catch
      const { req, ctx } = await buildDeleteReq({});
      const { DELETE } = await import("./route");
      const res = await DELETE(req, ctx);
      expect(res.status).toBe(500);
      const sqlCalls = mockClient.query.mock.calls.map((c) => c[0]);
      expect(sqlCalls).toContain("ROLLBACK");
      expect(sqlCalls).not.toContain("COMMIT");
      expect(mockClient.release).toHaveBeenCalled();
      expect(mockAuditLog).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Integration
  // =========================================================================

  describe("Integration", () => {
    it("PUT happy → DELETE → GET ergibt mode=auto (full lifecycle)", async () => {
      const item = baseItem();
      const blocks = flattenContentWithIds(item.content_i18n!.de!);
      const ch = computeLayoutHash({ item, locale: "de", imageCount: 0 });
      const csrf = await buildCsrf(1, 1);

      // ---- Step 1: PUT ----
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] }); // requireAuth
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [item] }) // SELECT FOR UPDATE
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // UPDATE
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const { PUT, DELETE, GET } = await import("./route");
      const putRes = await PUT(
        fakeReq({
          method: "PUT",
          sessionCookie: await makeToken("1", 1),
          csrfCookie: csrf,
          csrfHeader: csrf,
          body: {
            locale: "de",
            imageCount: 0,
            contentHash: ch,
            layoutVersion: null,
            slides: [{ blocks: blocks.map((b) => b.id) }],
          },
        }),
        { params: Promise.resolve({ id: "1" }) },
      );
      expect(putRes.status).toBe(200);

      // ---- Step 2: DELETE ----
      mockQuery.mockReset();
      mockClient.query.mockReset();
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] }); // requireAuth
      const persistedOverride: InstagramLayoutOverride = {
        contentHash: ch,
        slides: [{ blocks: blocks.map((b) => b.id) }],
      };
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ instagram_layout_i18n: { de: { "0": persistedOverride } } }],
        }) // SELECT FOR UPDATE
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // Phase 1
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // Phase 2
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const delRes = await DELETE(
        fakeReq({
          method: "DELETE",
          url: "http://localhost/api/dashboard/agenda/1/instagram-layout?locale=de&images=0",
          sessionCookie: await makeToken("1", 1),
          csrfCookie: csrf,
          csrfHeader: csrf,
        }),
        { params: Promise.resolve({ id: "1" }) },
      );
      expect(delRes.status).toBe(204);

      // ---- Step 3: GET → mode=auto ----
      mockQuery.mockReset();
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] }); // requireAuth
      mockQuery.mockResolvedValueOnce({ rows: [item] }); // SELECT (no override)

      const getRes = await GET(
        fakeReq({
          method: "GET",
          url: "http://localhost/api/dashboard/agenda/1/instagram-layout?locale=de&images=0",
          sessionCookie: await makeToken("1", 1),
        }),
        { params: Promise.resolve({ id: "1" }) },
      );
      expect(getRes.status).toBe(200);
      const body = await getRes.json();
      expect(body.mode).toBe("auto");
      expect(body.layoutVersion).toBeNull();
    });

    it("PUT happy + persisted override → second PUT with stale layoutVersion = 412", async () => {
      const item = baseItem();
      const blocks = flattenContentWithIds(item.content_i18n!.de!);
      const ch = computeLayoutHash({ item, locale: "de", imageCount: 0 });
      const csrf = await buildCsrf(1, 1);

      // ---- PUT-A: empty → persist ----
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [item] }) // SELECT FOR UPDATE — no override
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // UPDATE
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const { PUT } = await import("./route");
      const putA = await PUT(
        fakeReq({
          method: "PUT",
          sessionCookie: await makeToken("1", 1),
          csrfCookie: csrf,
          csrfHeader: csrf,
          body: {
            locale: "de",
            imageCount: 0,
            contentHash: ch,
            layoutVersion: null,
            slides: [{ blocks: blocks.map((b) => b.id) }],
          },
        }),
        { params: Promise.resolve({ id: "1" }) },
      );
      expect(putA.status).toBe(200);

      // ---- PUT-B: same layoutVersion=null but row now has stored override → 412 ----
      const persistedOverride: InstagramLayoutOverride = {
        contentHash: ch,
        slides: [{ blocks: blocks.map((b) => b.id) }],
      };
      mockQuery.mockReset();
      mockClient.query.mockReset();
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ ...item, instagram_layout_i18n: { de: { "0": persistedOverride } } }],
        }) // SELECT FOR UPDATE — override present
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const putB = await PUT(
        fakeReq({
          method: "PUT",
          sessionCookie: await makeToken("1", 1),
          csrfCookie: csrf,
          csrfHeader: csrf,
          body: {
            locale: "de",
            imageCount: 0,
            contentHash: ch,
            layoutVersion: null, // stale — server has version
            slides: [{ blocks: blocks.map((b) => b.id) }],
          },
        }),
        { params: Promise.resolve({ id: "1" }) },
      );
      expect(putB.status).toBe(412);
      const body = await putB.json();
      expect(body.error).toBe("layout_modified_by_other");
    });
  });
});
