import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Unit tests für `getAgendaItems()` Mapping der Sprint-Agenda-Bilder-Grid-Felder:
 *   - `images_grid_columns` durchgereicht als `imagesGridColumns`
 *   - Defensive Fallback bei Legacy-Rows ohne neue Spalte (`?? 1` für cols)
 *
 * Codex R2 Finding: ohne diesen Test bleibt eine vergessene SELECT-Spalte
 * oder ein vergessenes Mapping silent — alle Unit-Tests grün, Public-Site
 * rendert überall Legacy-Defaults. Dieser Test gated den Public-Read-Path.
 *
 * `images_fit` wurde als Letterbox-Toggle entfernt (User-Feedback). Das
 * Datenbank-Feld bleibt vorerst als orphan column bestehen — DROP COLUMN
 * Follow-up via 3-Phase shared-DB-safe Sprint.
 */
describe("getAgendaItems — images_grid_columns mapping", () => {
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
      title_i18n: { de: "Test-Eintrag" },
      lead_i18n: { de: "" },
      ort_i18n: { de: "Bern" },
      content_i18n: { de: [{ id: "1", type: "paragraph", content: [{ text: "body" }] }] },
      ...overrides,
    };
  }

  it("passes through images_grid_columns=3", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [baseRow({ images_grid_columns: 3 })],
    });
    const { getAgendaItems } = await import("./queries");
    const items = await getAgendaItems("de");
    expect(items.length).toBe(1);
    expect(items[0].imagesGridColumns).toBe(3);
  });

  it("falls back to cols=1 when images_grid_columns is missing/null (legacy row)", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [baseRow({ images_grid_columns: null })],
    });
    const { getAgendaItems } = await import("./queries");
    const items = await getAgendaItems("de");
    expect(items[0].imagesGridColumns).toBe(1);
  });

  it("preserves images_grid_columns=5 (max valid value)", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [baseRow({ images_grid_columns: 5 })],
    });
    const { getAgendaItems } = await import("./queries");
    const items = await getAgendaItems("de");
    expect(items[0].imagesGridColumns).toBe(5);
  });
});
