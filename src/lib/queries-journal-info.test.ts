import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("getJournalInfo", () => {
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

  it("falls back to DE dict + isFallback:false when DB row is absent (DE locale)", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const { getJournalInfo } = await import("./queries");
    const res = await getJournalInfo("de");
    expect(res.isFallback).toBe(false);
    expect(res.content).toHaveLength(1);
    expect(res.content[0].type).toBe("paragraph");
    // Dict contains the well-known DE intro sentence
    const block = res.content[0] as { content: { text: string }[] };
    expect(block.content[0].text).toContain("virtuelles Journal");
  });

  it("falls back to FR dict + isFallback:false when DB row is absent (FR locale)", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const { getJournalInfo } = await import("./queries");
    const res = await getJournalInfo("fr");
    expect(res.isFallback).toBe(false);
    const block = res.content[0] as { content: { text: string }[] };
    expect(block.content[0].text).toContain("journal virtuel");
  });

  it("returns stored DE content when present", async () => {
    const storedDe = [
      { id: "a", type: "paragraph", content: [{ text: "Admin DE Text" }] },
    ];
    mockQuery.mockResolvedValueOnce({
      rows: [{ value: JSON.stringify({ de: storedDe, fr: null }) }],
    });
    const { getJournalInfo } = await import("./queries");
    const res = await getJournalInfo("de");
    expect(res.isFallback).toBe(false);
    expect(res.content).toEqual(storedDe);
  });

  it("falls back FR → DE-row when FR is null but DE is set", async () => {
    const storedDe = [
      { id: "a", type: "paragraph", content: [{ text: "Admin DE Text" }] },
    ];
    mockQuery.mockResolvedValueOnce({
      rows: [{ value: JSON.stringify({ de: storedDe, fr: null }) }],
    });
    const { getJournalInfo } = await import("./queries");
    const res = await getJournalInfo("fr");
    expect(res.isFallback).toBe(true);
    expect(res.content).toEqual(storedDe);
  });

  it("falls back FR → dict when both DE and FR rows are empty content", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          value: JSON.stringify({
            de: [{ id: "1", type: "paragraph", content: [{ text: "" }] }],
            fr: null,
          }),
        },
      ],
    });
    const { getJournalInfo } = await import("./queries");
    const res = await getJournalInfo("fr");
    expect(res.isFallback).toBe(false);
    const block = res.content[0] as { content: { text: string }[] };
    expect(block.content[0].text).toContain("journal virtuel");
  });

  it("returns FR-native content when FR is set", async () => {
    const storedFr = [
      { id: "a", type: "paragraph", content: [{ text: "Admin FR texte" }] },
    ];
    mockQuery.mockResolvedValueOnce({
      rows: [{ value: JSON.stringify({ de: null, fr: storedFr }) }],
    });
    const { getJournalInfo } = await import("./queries");
    const res = await getJournalInfo("fr");
    expect(res.isFallback).toBe(false);
    expect(res.content).toEqual(storedFr);
  });

  it("falls back to dict when stored value is invalid JSON", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ value: "not-json{{" }] });
    // Suppress expected stderr warning from the JSON-parse catch
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { getJournalInfo } = await import("./queries");
    const res = await getJournalInfo("de");
    expect(res.isFallback).toBe(false);
    const block = res.content[0] as { content: { text: string }[] };
    expect(block.content[0].text).toContain("virtuelles Journal");
    warnSpy.mockRestore();
  });

  it("falls back to dict when stored value is a non-object JSON", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ value: '"just a string"' }] });
    const { getJournalInfo } = await import("./queries");
    const res = await getJournalInfo("de");
    expect(res.isFallback).toBe(false);
    const block = res.content[0] as { content: { text: string }[] };
    expect(block.content[0].text).toContain("virtuelles Journal");
  });

  it("falls back to dict when stored object has non-array locale values", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ value: JSON.stringify({ de: "oops", fr: 42 }) }],
    });
    const { getJournalInfo } = await import("./queries");
    const res = await getJournalInfo("de");
    expect(res.isFallback).toBe(false);
    const block = res.content[0] as { content: { text: string }[] };
    expect(block.content[0].text).toContain("virtuelles Journal");
  });
});
