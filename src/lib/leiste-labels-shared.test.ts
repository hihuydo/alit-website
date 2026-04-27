import { describe, it, expect } from "vitest";
import { isLeisteLabelsEmpty, type LeisteLabels } from "./leiste-labels-shared";

const allEmpty: LeisteLabels = {
  verein: "",
  literatur: "",
  stiftung: "",
};

describe("isLeisteLabelsEmpty", () => {
  it("returns true when all 3 fields are empty strings", () => {
    expect(isLeisteLabelsEmpty(allEmpty)).toBe(true);
  });

  it("returns false when at least 1 field is filled", () => {
    expect(isLeisteLabelsEmpty({ ...allEmpty, verein: "Agenda" })).toBe(false);
    expect(isLeisteLabelsEmpty({ ...allEmpty, stiftung: "x" })).toBe(false);
  });

  it("returns true for null/undefined input + whitespace-only fields", () => {
    expect(isLeisteLabelsEmpty(null)).toBe(true);
    expect(isLeisteLabelsEmpty(undefined)).toBe(true);
    expect(isLeisteLabelsEmpty({ ...allEmpty, verein: "   " })).toBe(true);
  });
});
