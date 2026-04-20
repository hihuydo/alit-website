import { describe, it, expect } from "vitest";
import { isJournalInfoEmpty, wrapDictAsParagraph } from "./journal-info-shared";

describe("isJournalInfoEmpty", () => {
  it("returns true for null", () => {
    expect(isJournalInfoEmpty(null)).toBe(true);
  });

  it("returns true for undefined", () => {
    expect(isJournalInfoEmpty(undefined)).toBe(true);
  });

  it("returns true for empty array", () => {
    expect(isJournalInfoEmpty([])).toBe(true);
  });

  it("returns true for a paragraph with only empty text", () => {
    expect(
      isJournalInfoEmpty([
        { id: "1", type: "paragraph", content: [{ text: "" }] },
      ]),
    ).toBe(true);
  });

  it("returns true for a paragraph with only whitespace", () => {
    expect(
      isJournalInfoEmpty([
        { id: "1", type: "paragraph", content: [{ text: "   \n\t" }] },
      ]),
    ).toBe(true);
  });

  it("returns false for a paragraph with real text", () => {
    expect(
      isJournalInfoEmpty([
        { id: "1", type: "paragraph", content: [{ text: "hello" }] },
      ]),
    ).toBe(false);
  });

  it("returns false for an image block even without text", () => {
    expect(
      isJournalInfoEmpty([
        { id: "1", type: "image", src: "https://example.com/a.jpg" },
      ]),
    ).toBe(false);
  });

  it("returns true for a spacer-only array (no renderable text)", () => {
    expect(
      isJournalInfoEmpty([{ id: "1", type: "spacer", size: "m" }]),
    ).toBe(true);
  });

  it("returns false when any block among many has text", () => {
    expect(
      isJournalInfoEmpty([
        { id: "1", type: "paragraph", content: [{ text: "" }] },
        { id: "2", type: "paragraph", content: [{ text: "yo" }] },
      ]),
    ).toBe(false);
  });
});

describe("wrapDictAsParagraph", () => {
  it("wraps a plain string in a single paragraph block", () => {
    const result = wrapDictAsParagraph("Hallo Welt");
    expect(result).toEqual([
      { id: "dict-fallback", type: "paragraph", content: [{ text: "Hallo Welt" }] },
    ]);
  });

  it("is idempotent for the empty string (still a paragraph, detected empty downstream)", () => {
    const result = wrapDictAsParagraph("");
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("paragraph");
    expect(isJournalInfoEmpty(result)).toBe(true);
  });
});
