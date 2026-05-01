import { describe, expect, it } from "vitest";
import { getDictionary } from "@/i18n/dictionaries";
import {
  MITGLIEDSCHAFT_EDITABLE_KEYS,
  NEWSLETTER_EDITABLE_KEYS,
  type DictMap,
  type SubmissionTextsDisplay,
  type SubmissionTextsRaw,
  mergeWithDefaults,
  pickEditableFields,
  stripDictEqual,
} from "./submission-form-fields";

const dictMap: DictMap = { de: getDictionary("de"), fr: getDictionary("fr") };

describe("pickEditableFields", () => {
  it("projects only editable mitgliedschaft keys, ignores form-labels", () => {
    const picked = pickEditableFields("mitgliedschaft", dictMap.de.mitgliedschaft);
    expect(Object.keys(picked).sort()).toEqual([...MITGLIEDSCHAFT_EDITABLE_KEYS].sort());
    expect("vorname" in picked).toBe(false);
    expect("submit" in picked).toBe(false);
  });

  it("projects only editable newsletter keys, drops intro", () => {
    const picked = pickEditableFields("newsletter", dictMap.fr.newsletter);
    expect(Object.keys(picked).sort()).toEqual([...NEWSLETTER_EDITABLE_KEYS].sort());
    expect("intro" in picked).toBe(false);
    expect("vorname" in picked).toBe(false);
  });

  it("returns empty strings when source is null/undefined", () => {
    const picked = pickEditableFields("mitgliedschaft", null);
    for (const k of MITGLIEDSCHAFT_EDITABLE_KEYS) {
      expect(picked[k]).toBe("");
    }
  });

  it("coerces non-string values to empty string", () => {
    const picked = pickEditableFields("newsletter", {
      heading: "ok",
      consent: 42,
      privacy: null,
      successTitle: undefined,
    } as unknown as Record<string, unknown>);
    expect(picked.heading).toBe("ok");
    expect(picked.consent).toBe("");
    expect(picked.privacy).toBe("");
    expect(picked.successTitle).toBe("");
  });
});

describe("mergeWithDefaults", () => {
  it("fully populates both forms × both locales from empty raw", () => {
    const merged = mergeWithDefaults({}, dictMap);
    expect(merged.mitgliedschaft.de.heading).toBe(dictMap.de.mitgliedschaft.heading);
    expect(merged.mitgliedschaft.fr.heading).toBe(dictMap.fr.mitgliedschaft.heading);
    expect(merged.newsletter.de.privacy).toBe(dictMap.de.newsletter.privacy);
    expect(merged.newsletter.fr.privacy).toBe(dictMap.fr.newsletter.privacy);
  });

  it("respects null/undefined raw input", () => {
    const fromNull = mergeWithDefaults(null, dictMap);
    const fromUndef = mergeWithDefaults(undefined, dictMap);
    expect(fromNull).toEqual(fromUndef);
    expect(fromNull.mitgliedschaft.de.intro).toBe(dictMap.de.mitgliedschaft.intro);
  });

  it("uses stored value when non-empty", () => {
    const raw: SubmissionTextsRaw = {
      mitgliedschaft: { de: { heading: "Custom Heading" }, fr: {} },
      newsletter: { de: {}, fr: {} },
    };
    const merged = mergeWithDefaults(raw, dictMap);
    expect(merged.mitgliedschaft.de.heading).toBe("Custom Heading");
    // other fields fall back
    expect(merged.mitgliedschaft.de.intro).toBe(dictMap.de.mitgliedschaft.intro);
    // other locale unaffected
    expect(merged.mitgliedschaft.fr.heading).toBe(dictMap.fr.mitgliedschaft.heading);
  });

  it("falls back on empty-string AND whitespace-only-string (trim-aware)", () => {
    const raw: SubmissionTextsRaw = {
      mitgliedschaft: {
        de: { heading: "" as never, intro: "   \t\n " as never },
        fr: {},
      },
      newsletter: { de: {}, fr: {} },
    };
    const merged = mergeWithDefaults(raw, dictMap);
    expect(merged.mitgliedschaft.de.heading).toBe(dictMap.de.mitgliedschaft.heading);
    expect(merged.mitgliedschaft.de.intro).toBe(dictMap.de.mitgliedschaft.intro);
  });

  it("ignores unknown keys in raw payload", () => {
    const raw = {
      mitgliedschaft: {
        de: { heading: "X", bogus: "should-be-dropped" },
        fr: {},
      },
      newsletter: { de: {}, fr: {} },
    } as unknown as SubmissionTextsRaw;
    const merged = mergeWithDefaults(raw, dictMap);
    expect((merged.mitgliedschaft.de as Record<string, unknown>).bogus).toBeUndefined();
    expect(merged.mitgliedschaft.de.heading).toBe("X");
  });
});

describe("stripDictEqual", () => {
  it("returns empty leaf objects when display equals defaults everywhere", () => {
    const display = mergeWithDefaults({}, dictMap);
    const stripped = stripDictEqual(display, dictMap);
    expect(stripped.mitgliedschaft.de).toEqual({});
    expect(stripped.mitgliedschaft.fr).toEqual({});
    expect(stripped.newsletter.de).toEqual({});
    expect(stripped.newsletter.fr).toEqual({});
  });

  it("keeps only fields that diverge from default", () => {
    const display = mergeWithDefaults({}, dictMap);
    const mutated: SubmissionTextsDisplay = {
      ...display,
      mitgliedschaft: {
        ...display.mitgliedschaft,
        de: { ...display.mitgliedschaft.de, heading: "Custom" },
      },
    };
    const stripped = stripDictEqual(mutated, dictMap);
    expect(stripped.mitgliedschaft.de).toEqual({ heading: "Custom" });
    expect(stripped.mitgliedschaft.fr).toEqual({});
  });

  it("preserves the full top-level structure (DK-1 requires all 4 form×locale)", () => {
    const display = mergeWithDefaults({}, dictMap);
    const stripped = stripDictEqual(display, dictMap);
    expect(Object.keys(stripped).sort()).toEqual(["mitgliedschaft", "newsletter"]);
    expect(Object.keys(stripped.mitgliedschaft).sort()).toEqual(["de", "fr"]);
    expect(Object.keys(stripped.newsletter).sort()).toEqual(["de", "fr"]);
  });

  it("round-trips: merge(strip(display)) === display", () => {
    const display = mergeWithDefaults(
      {
        mitgliedschaft: {
          de: { heading: "Hi DE", intro: "Intro DE" },
          fr: { heading: "Hi FR" },
        },
        newsletter: { de: { privacy: "Privacy DE" }, fr: {} },
      },
      dictMap,
    );
    const stripped = stripDictEqual(display, dictMap);
    const reMerged = mergeWithDefaults(stripped, dictMap);
    expect(reMerged).toEqual(display);
  });

  it("treats whitespace-only display value as a non-default override (kept in payload)", () => {
    // Whitespace-only inputs should round-trip through the editor, but stripDictEqual
    // is purely value-equal-vs-default. Whitespace !== default → kept; merge then re-trims it.
    const display = mergeWithDefaults({}, dictMap);
    const mutated: SubmissionTextsDisplay = {
      ...display,
      newsletter: {
        ...display.newsletter,
        de: { ...display.newsletter.de, heading: "   " },
      },
    };
    const stripped = stripDictEqual(mutated, dictMap);
    expect(stripped.newsletter.de.heading).toBe("   ");
    // re-merge falls back to default (trim-aware), so the user-visible behavior is consistent
    const reMerged = mergeWithDefaults(stripped, dictMap);
    expect(reMerged.newsletter.de.heading).toBe(dictMap.de.newsletter.heading);
  });
});
