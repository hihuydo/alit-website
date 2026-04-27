import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("getLeisteLabels", () => {
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
    const { getLeisteLabels } = await import("./queries");
    const res = await getLeisteLabels("de");
    expect(res.verein).toBe("Agenda");
    expect(res.literatur).toBe("Discours Agités");
    expect(res.stiftung).toBe("Netzwerk für Literatur*en");
    expect(res.vereinSub).toBe("");
  });

  it("returns stored DE labels when row contains them", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          value: JSON.stringify({
            de: {
              verein: "Termine",
              vereinSub: "Veranstaltungen",
              literatur: "Texte",
              literaturSub: "",
              stiftung: "Verein",
              stiftungSub: "Stiftung",
            },
            fr: null,
          }),
        },
      ],
    });
    const { getLeisteLabels } = await import("./queries");
    const res = await getLeisteLabels("de");
    expect(res.verein).toBe("Termine");
    expect(res.vereinSub).toBe("Veranstaltungen");
    expect(res.literatur).toBe("Texte");
    expect(res.stiftung).toBe("Verein");
    expect(res.stiftungSub).toBe("Stiftung");
  });

  it("per-field fallback to dict default when stored field is empty/whitespace", async () => {
    // Admin set only `verein`, left other 5 empty → dict defaults fill the rest.
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          value: JSON.stringify({
            de: {
              verein: "Termine",
              vereinSub: "  ", // whitespace-only counts as empty
              literatur: "",
              literaturSub: "",
              stiftung: "",
              stiftungSub: "",
            },
            fr: null,
          }),
        },
      ],
    });
    const { getLeisteLabels } = await import("./queries");
    const res = await getLeisteLabels("de");
    expect(res.verein).toBe("Termine"); // admin override
    expect(res.literatur).toBe("Discours Agités"); // dict default
    expect(res.stiftung).toBe("Netzwerk für Literatur*en"); // dict default
    expect(res.vereinSub).toBe(""); // dict default also ""
  });

  it("falls back to dict default when invalid JSON in DB", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ value: "not-json{{" }] });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { getLeisteLabels } = await import("./queries");
    const res = await getLeisteLabels("de");
    expect(res.verein).toBe("Agenda");
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("FR locale falls to dict default when fr-row is null and de-row is set (no DE→FR fallback by design)", async () => {
    // Per-locale isolation: admin's DE override does NOT leak into FR. FR
    // falls directly to dict default when FR-row is null.
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          value: JSON.stringify({
            de: { verein: "Termine", vereinSub: "", literatur: "", literaturSub: "", stiftung: "", stiftungSub: "" },
            fr: null,
          }),
        },
      ],
    });
    const { getLeisteLabels } = await import("./queries");
    const res = await getLeisteLabels("fr");
    expect(res.verein).toBe("Agenda"); // FR dict default, NOT DE admin override
  });
});
