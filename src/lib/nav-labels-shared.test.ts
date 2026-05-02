import { describe, it, expect } from "vitest";
import {
  DEFAULT_NAV_LABELS_DE,
  DEFAULT_NAV_LABELS_FR,
  NAV_FIELD_KEYS,
  isNavLabelsEmpty,
  type NavLabels,
} from "./nav-labels-shared";

const allEmpty: NavLabels = {
  agenda: "",
  projekte: "",
  alit: "",
  mitgliedschaft: "",
  newsletter: "",
};

describe("isNavLabelsEmpty", () => {
  it("returns true when all 5 fields are empty strings", () => {
    expect(isNavLabelsEmpty(allEmpty)).toBe(true);
  });

  it("returns false when at least 1 field is filled", () => {
    expect(isNavLabelsEmpty({ ...allEmpty, agenda: "Agenda" })).toBe(false);
    expect(isNavLabelsEmpty({ ...allEmpty, newsletter: "x" })).toBe(false);
  });

  it("returns true for null/undefined input + whitespace-only fields", () => {
    expect(isNavLabelsEmpty(null)).toBe(true);
    expect(isNavLabelsEmpty(undefined)).toBe(true);
    expect(isNavLabelsEmpty({ ...allEmpty, alit: "   " })).toBe(true);
  });
});

describe("NAV_FIELD_KEYS", () => {
  it("contains all 5 nav label keys", () => {
    expect(NAV_FIELD_KEYS).toEqual(["agenda", "projekte", "alit", "mitgliedschaft", "newsletter"]);
  });
});

describe("DEFAULT_NAV_LABELS_DE/FR", () => {
  it("DE defaults match dictionary nav labels", () => {
    expect(DEFAULT_NAV_LABELS_DE).toEqual({
      agenda: "Agenda",
      projekte: "Projekte",
      alit: "Über Alit",
      mitgliedschaft: "Mitgliedschaft",
      newsletter: "Newsletter",
    });
  });

  it("FR defaults match dictionary nav labels", () => {
    expect(DEFAULT_NAV_LABELS_FR).toEqual({
      agenda: "Agenda",
      projekte: "Projets",
      alit: "À propos",
      mitgliedschaft: "Adhésion",
      newsletter: "Newsletter",
    });
  });
});
