import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Unit tests für `getAgendaItems()` Mapping der neuen Sprint-Felder:
 *   - `images_grid_columns` durchgereicht als `imagesGridColumns`
 *   - `images_fit` durchgereicht als `imagesFit`
 *   - Defensive Fallbacks bei Legacy-Rows ohne neue Spalten
 *     (`?? 1` für cols, `=== "contain" ? "contain" : "cover"` für fit)
 *
 * Codex R2 Finding: ohne diesen Test bleibt eine vergessene SELECT-Spalte
 * oder ein vergessenes Mapping silent — alle Unit-Tests grün, Public-Site
 * rendert überall Legacy-Defaults. Dieser Test gated den Public-Read-Path.
 */
describe("getAgendaItems — images_grid_columns + images_fit mapping", () => {
  const mockQuery = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    mockQuery.mockReset();
    vi.doMock("@/lib/db", () => ({ default: { query: mockQuery } }));
  });

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/db");
  });

  function baseRow(overrides: Record<string, unknown> = {}) {
    return {
      datum: "01.06.2026",
      zeit: "19:00",
      ort_url: null,
      hashtags: [],
      images: [],
      images_grid_columns: 1,
      images_fit: "cover",
      title_i18n: { de: "Test-Eintrag" },
      lead_i18n: { de: "" },
      ort_i18n: { de: "Bern" },
      content_i18n: { de: [{ id: "1", type: "paragraph", content: [{ text: "body" }] }] },
      ...overrides,
    };
  }

  it("passes through images_grid_columns=3 and images_fit='contain'", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [baseRow({ images_grid_columns: 3, images_fit: "contain" })],
    });
    const { getAgendaItems } = await import("./queries");
    const items = await getAgendaItems("de");
    expect(items.length).toBe(1);
    expect(items[0].imagesGridColumns).toBe(3);
    expect(items[0].imagesFit).toBe("contain");
  });

  it("falls back to cols=1 when images_grid_columns is missing/null (legacy row)", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [baseRow({ images_grid_columns: null, images_fit: null })],
    });
    const { getAgendaItems } = await import("./queries");
    const items = await getAgendaItems("de");
    expect(items[0].imagesGridColumns).toBe(1);
    expect(items[0].imagesFit).toBe("cover");
  });

  it("falls back to cover when images_fit is an unknown string", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [baseRow({ images_fit: "fill" })], // not a valid enum
    });
    const { getAgendaItems } = await import("./queries");
    const items = await getAgendaItems("de");
    expect(items[0].imagesFit).toBe("cover");
  });

  it("preserves images_grid_columns=5 (max valid value)", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [baseRow({ images_grid_columns: 5, images_fit: "contain" })],
    });
    const { getAgendaItems } = await import("./queries");
    const items = await getAgendaItems("de");
    expect(items[0].imagesGridColumns).toBe(5);
    expect(items[0].imagesFit).toBe("contain");
  });
});
