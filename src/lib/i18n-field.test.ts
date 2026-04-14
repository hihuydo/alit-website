import { describe, it, expect } from "vitest";
import { t, isEmptyField, hasLocale, type TranslatableField } from "./i18n-field";
import type { JournalContent } from "./journal-types";

describe("isEmptyField", () => {
  it("returns true for null", () => {
    expect(isEmptyField(null)).toBe(true);
  });
  it("returns true for undefined", () => {
    expect(isEmptyField(undefined)).toBe(true);
  });
  it("returns true for empty string", () => {
    expect(isEmptyField("")).toBe(true);
  });
  it("returns true for whitespace-only string", () => {
    expect(isEmptyField("   \n\t ")).toBe(true);
  });
  it("returns false for non-empty string", () => {
    expect(isEmptyField("hello")).toBe(false);
  });
  it("returns true for empty array", () => {
    expect(isEmptyField([])).toBe(true);
  });
  it("returns false for non-empty array", () => {
    const blocks: JournalContent = [
      { id: "a", type: "paragraph", content: [{ text: "hi" }] },
    ];
    expect(isEmptyField(blocks)).toBe(false);
  });
});

describe("t (string field)", () => {
  const field: TranslatableField<string> = { de: "Hallo", fr: "Bonjour" };

  it("returns locale value when present", () => {
    expect(t(field, "de")).toBe("Hallo");
    expect(t(field, "fr")).toBe("Bonjour");
  });

  it("falls back to DE when FR empty", () => {
    expect(t({ de: "Hallo", fr: "" }, "fr")).toBe("Hallo");
    expect(t({ de: "Hallo", fr: "   " }, "fr")).toBe("Hallo");
    expect(t({ de: "Hallo" }, "fr")).toBe("Hallo");
  });

  it("returns null when requested locale empty AND is fallback", () => {
    expect(t({ de: "", fr: "Bonjour" }, "de")).toBe(null);
    expect(t({ fr: "Bonjour" }, "de")).toBe(null);
  });

  it("returns null for null/undefined/empty field", () => {
    expect(t(null, "de")).toBe(null);
    expect(t(undefined, "fr")).toBe(null);
    expect(t({}, "de")).toBe(null);
    expect(t({ de: "", fr: "" }, "fr")).toBe(null);
  });
});

describe("t (JournalContent field)", () => {
  const deBlocks: JournalContent = [
    { id: "p1", type: "paragraph", content: [{ text: "Deutsch" }] },
  ];
  const frBlocks: JournalContent = [
    { id: "p1", type: "paragraph", content: [{ text: "Français" }] },
  ];

  it("returns locale blocks when present", () => {
    const field: TranslatableField<JournalContent> = { de: deBlocks, fr: frBlocks };
    expect(t(field, "fr")).toBe(frBlocks);
  });

  it("falls back to DE blocks when FR is empty array", () => {
    const field: TranslatableField<JournalContent> = { de: deBlocks, fr: [] };
    expect(t(field, "fr")).toBe(deBlocks);
  });

  it("returns null when DE requested and only FR populated", () => {
    const field: TranslatableField<JournalContent> = { de: [], fr: frBlocks };
    expect(t(field, "de")).toBe(null);
  });

  it("returns null when both locales empty", () => {
    expect(t<JournalContent>({ de: [], fr: [] }, "fr")).toBe(null);
  });
});

describe("hasLocale", () => {
  it("true when locale has non-empty content", () => {
    expect(hasLocale({ de: "x", fr: "" }, "de")).toBe(true);
    expect(hasLocale({ de: "x", fr: "" }, "fr")).toBe(false);
  });
  it("false for null/undefined field", () => {
    expect(hasLocale(null, "de")).toBe(false);
    expect(hasLocale(undefined, "fr")).toBe(false);
  });
});
