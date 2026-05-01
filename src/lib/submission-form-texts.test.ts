import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getDictionary } from "@/i18n/dictionaries";

describe("getSubmissionFormTexts", () => {
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
    const { getSubmissionFormTexts } = await import("./submission-form-texts");
    const dict = getDictionary("de");
    const res = await getSubmissionFormTexts("de");
    expect(res.mitgliedschaft.heading).toBe(dict.mitgliedschaft.heading);
    expect(res.mitgliedschaft.intro).toBe(dict.mitgliedschaft.intro);
    expect(res.newsletter.heading).toBe(dict.newsletter.heading);
    expect(res.newsletter.privacy).toBe(dict.newsletter.privacy);
  });

  it("returns dict defaults (FR) when no DB row exists", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const { getSubmissionFormTexts } = await import("./submission-form-texts");
    const dict = getDictionary("fr");
    const res = await getSubmissionFormTexts("fr");
    expect(res.mitgliedschaft.heading).toBe(dict.mitgliedschaft.heading);
    expect(res.newsletter.privacy).toBe(dict.newsletter.privacy);
  });

  it("uses stored value when row contains a non-empty field", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          value: JSON.stringify({
            mitgliedschaft: { de: { heading: "Custom Heading DE" }, fr: {} },
            newsletter: { de: { heading: "Custom NL DE" }, fr: {} },
          }),
        },
      ],
    });
    const { getSubmissionFormTexts } = await import("./submission-form-texts");
    const dict = getDictionary("de");
    const res = await getSubmissionFormTexts("de");
    expect(res.mitgliedschaft.heading).toBe("Custom Heading DE");
    // other fields fall back to dict
    expect(res.mitgliedschaft.intro).toBe(dict.mitgliedschaft.intro);
    expect(res.newsletter.heading).toBe("Custom NL DE");
  });

  it("per-field fallback when stored field is empty-string OR whitespace-only", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          value: JSON.stringify({
            mitgliedschaft: {
              de: { heading: "Custom", intro: "", consent: "   \t " },
              fr: {},
            },
            newsletter: { de: {}, fr: {} },
          }),
        },
      ],
    });
    const { getSubmissionFormTexts } = await import("./submission-form-texts");
    const dict = getDictionary("de");
    const res = await getSubmissionFormTexts("de");
    expect(res.mitgliedschaft.heading).toBe("Custom");
    expect(res.mitgliedschaft.intro).toBe(dict.mitgliedschaft.intro);
    expect(res.mitgliedschaft.consent).toBe(dict.mitgliedschaft.consent);
  });

  it("ignores unknown / non-editable keys in stored payload", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          value: JSON.stringify({
            mitgliedschaft: {
              de: { heading: "Hi", bogus: "leak", vorname: "Hijack" },
              fr: {},
            },
            newsletter: { de: {}, fr: {} },
          }),
        },
      ],
    });
    const { getSubmissionFormTexts } = await import("./submission-form-texts");
    const dict = getDictionary("de");
    const res = await getSubmissionFormTexts("de");
    expect(res.mitgliedschaft.heading).toBe("Hi");
    // form-labels stay hardcoded — overlay must not bleed into them
    expect("vorname" in res.mitgliedschaft).toBe(false);
    // dict slice doesn't include vorname either
    expect(dict.mitgliedschaft.vorname).toBeDefined();
  });

  it("FR isolation — DE override does NOT leak into FR", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          value: JSON.stringify({
            mitgliedschaft: { de: { heading: "DE Custom" }, fr: {} },
            newsletter: { de: {}, fr: {} },
          }),
        },
      ],
    });
    const { getSubmissionFormTexts } = await import("./submission-form-texts");
    const dictFr = getDictionary("fr");
    const res = await getSubmissionFormTexts("fr");
    expect(res.mitgliedschaft.heading).toBe(dictFr.mitgliedschaft.heading);
  });

  it("falls back to dict on invalid JSON in DB", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ value: "not-json{{" }] });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { getSubmissionFormTexts } = await import("./submission-form-texts");
    const dict = getDictionary("de");
    const res = await getSubmissionFormTexts("de");
    expect(res.mitgliedschaft.heading).toBe(dict.mitgliedschaft.heading);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("falls back to dict on DB pool error (NOT crash — diverges from getLeisteLabels)", async () => {
    mockQuery.mockRejectedValueOnce(new Error("connection refused"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { getSubmissionFormTexts } = await import("./submission-form-texts");
    const dict = getDictionary("de");
    const res = await getSubmissionFormTexts("de");
    expect(res.mitgliedschaft.heading).toBe(dict.mitgliedschaft.heading);
    expect(res.newsletter.privacy).toBe(dict.newsletter.privacy);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("falls back when stored value is not a plain object", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ value: JSON.stringify([1, 2, 3]) }] });
    const { getSubmissionFormTexts } = await import("./submission-form-texts");
    const dict = getDictionary("de");
    const res = await getSubmissionFormTexts("de");
    expect(res.mitgliedschaft.heading).toBe(dict.mitgliedschaft.heading);
  });

  it("handles partial nested payload (only one form populated)", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          value: JSON.stringify({
            mitgliedschaft: { de: { heading: "Only DE Mitglied" } },
            // newsletter completely missing
          }),
        },
      ],
    });
    const { getSubmissionFormTexts } = await import("./submission-form-texts");
    const dict = getDictionary("de");
    const res = await getSubmissionFormTexts("de");
    expect(res.mitgliedschaft.heading).toBe("Only DE Mitglied");
    expect(res.newsletter.heading).toBe(dict.newsletter.heading);
  });
});
