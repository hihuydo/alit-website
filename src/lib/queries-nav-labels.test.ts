import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("getNavLabels", () => {
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

  it("returns dict defaults (DE) when no DB row exists", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const { getNavLabels } = await import("./queries");
    const res = await getNavLabels("de");
    expect(res.agenda).toBe("Agenda");
    expect(res.projekte).toBe("Projekte");
    expect(res.alit).toBe("Über Alit");
    expect(res.mitgliedschaft).toBe("Mitgliedschaft");
    expect(res.newsletter).toBe("Newsletter");
  });

  it("returns dict defaults (FR) when no DB row exists", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const { getNavLabels } = await import("./queries");
    const res = await getNavLabels("fr");
    expect(res.projekte).toBe("Projets");
    expect(res.alit).toBe("À propos");
    expect(res.mitgliedschaft).toBe("Adhésion");
  });

  it("returns stored DE labels when row contains them", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          value: JSON.stringify({
            de: {
              agenda: "Termine",
              projekte: "Werke",
              alit: "Verein",
              mitgliedschaft: "Beitritt",
              newsletter: "Updates",
            },
            fr: null,
          }),
        },
      ],
    });
    const { getNavLabels } = await import("./queries");
    const res = await getNavLabels("de");
    expect(res.agenda).toBe("Termine");
    expect(res.projekte).toBe("Werke");
    expect(res.newsletter).toBe("Updates");
  });

  it("per-field fallback to dict default when stored field is empty/whitespace", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          value: JSON.stringify({
            de: {
              agenda: "Termine",
              projekte: "  ",
              alit: "",
              mitgliedschaft: "Beitritt",
              newsletter: "",
            },
            fr: null,
          }),
        },
      ],
    });
    const { getNavLabels } = await import("./queries");
    const res = await getNavLabels("de");
    expect(res.agenda).toBe("Termine");
    expect(res.projekte).toBe("Projekte");
    expect(res.alit).toBe("Über Alit");
    expect(res.mitgliedschaft).toBe("Beitritt");
    expect(res.newsletter).toBe("Newsletter");
  });

  it("falls back to dict default when invalid JSON in DB", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ value: "not-json{{" }] });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { getNavLabels } = await import("./queries");
    const res = await getNavLabels("de");
    expect(res.agenda).toBe("Agenda");
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("FR locale falls to FR dict defaults when FR-row is null (no DE→FR leak)", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          value: JSON.stringify({
            de: {
              agenda: "Termine",
              projekte: "Werke",
              alit: "Verein",
              mitgliedschaft: "Beitritt",
              newsletter: "Updates",
            },
            fr: null,
          }),
        },
      ],
    });
    const { getNavLabels } = await import("./queries");
    const res = await getNavLabels("fr");
    expect(res.agenda).toBe("Agenda");
    expect(res.projekte).toBe("Projets");
    expect(res.alit).toBe("À propos");
  });
});
