import { describe, expect, it } from "vitest";
import {
  parseIsoDate,
  parseIsoTime,
  formatCanonicalDatum,
  formatCanonicalZeit,
  datumToIsoInput,
  zeitToIsoInput,
  isCanonicalDatum,
  isCanonicalZeit,
  normalizeLegacyZeit,
  isUpcomingDatum,
  pickNearestUpcomingIndex,
} from "./agenda-datetime";

describe("parseIsoDate", () => {
  it("parses valid ISO dates", () => {
    expect(parseIsoDate("2026-05-02")).toEqual({ day: 2, month: 5, year: 2026 });
    expect(parseIsoDate("2024-02-29")).toEqual({ day: 29, month: 2, year: 2024 }); // leap
  });
  it("rejects invalid civil dates", () => {
    expect(parseIsoDate("2025-02-29")).toBeNull(); // non-leap
    expect(parseIsoDate("2025-04-31")).toBeNull(); // April has 30
    expect(parseIsoDate("2025-06-31")).toBeNull();
    expect(parseIsoDate("2025-13-01")).toBeNull(); // no month 13
  });
  it("rejects wrong-format strings", () => {
    expect(parseIsoDate("02.05.2026")).toBeNull(); // canonical, not ISO
    expect(parseIsoDate("2026/05/02")).toBeNull();
    expect(parseIsoDate("")).toBeNull();
    expect(parseIsoDate("abc")).toBeNull();
  });
});

describe("parseIsoTime", () => {
  it("parses valid times", () => {
    expect(parseIsoTime("14:00")).toEqual({ hours: 14, minutes: 0 });
    expect(parseIsoTime("00:00")).toEqual({ hours: 0, minutes: 0 });
    expect(parseIsoTime("23:59")).toEqual({ hours: 23, minutes: 59 });
  });
  it("rejects out-of-range", () => {
    expect(parseIsoTime("24:00")).toBeNull();
    expect(parseIsoTime("12:60")).toBeNull();
    expect(parseIsoTime("-1:00")).toBeNull();
  });
  it("rejects wrong format", () => {
    expect(parseIsoTime("14:00 Uhr")).toBeNull(); // canonical, not ISO
    expect(parseIsoTime("14.00")).toBeNull();
    expect(parseIsoTime("")).toBeNull();
  });
});

describe("formatCanonicalDatum", () => {
  it("zero-pads and uses dots", () => {
    expect(formatCanonicalDatum({ day: 2, month: 5, year: 2026 })).toBe("02.05.2026");
    expect(formatCanonicalDatum({ day: 15, month: 12, year: 2024 })).toBe("15.12.2024");
  });
});

describe("formatCanonicalZeit", () => {
  it("zero-pads HH:MM + space + Uhr", () => {
    expect(formatCanonicalZeit({ hours: 14, minutes: 0 })).toBe("14:00 Uhr");
    expect(formatCanonicalZeit({ hours: 9, minutes: 5 })).toBe("09:05 Uhr");
    expect(formatCanonicalZeit({ hours: 0, minutes: 0 })).toBe("00:00 Uhr");
  });
});

describe("datumToIsoInput", () => {
  it("canonical DE → ISO for <input type=date>", () => {
    expect(datumToIsoInput("02.05.2026")).toBe("2026-05-02");
    expect(datumToIsoInput("29.02.2024")).toBe("2024-02-29"); // leap year
  });
  it("null for off-spec or impossible civil-date", () => {
    expect(datumToIsoInput("2026-05-02")).toBeNull(); // ISO in, not canonical
    expect(datumToIsoInput("2.5.2026")).toBeNull();
    expect(datumToIsoInput("29.02.2025")).toBeNull(); // non-leap
    expect(datumToIsoInput("31.04.2025")).toBeNull();
    expect(datumToIsoInput("")).toBeNull();
    expect(datumToIsoInput("garbage")).toBeNull();
  });
});

describe("zeitToIsoInput", () => {
  it("canonical → ISO for <input type=time>", () => {
    expect(zeitToIsoInput("14:00 Uhr")).toBe("14:00");
    expect(zeitToIsoInput("09:05 Uhr")).toBe("09:05");
  });
  it("null for off-spec (including legacy without space or wrong separator)", () => {
    expect(zeitToIsoInput("14:00Uhr")).toBeNull(); // legacy, no space
    expect(zeitToIsoInput("19.30")).toBeNull(); // legacy separator
    expect(zeitToIsoInput("14:00")).toBeNull(); // missing suffix
    expect(zeitToIsoInput("")).toBeNull();
    expect(zeitToIsoInput("garbage")).toBeNull();
  });
});

describe("isCanonicalDatum — strict civil-date", () => {
  it("accepts canonical DE dates", () => {
    expect(isCanonicalDatum("02.05.2026")).toBe(true);
    expect(isCanonicalDatum("29.02.2024")).toBe(true); // leap
    expect(isCanonicalDatum("31.12.2099")).toBe(true);
  });
  it("rejects impossible civil dates (Codex Spec-R1 [Correctness] 1)", () => {
    expect(isCanonicalDatum("29.02.2025")).toBe(false); // non-leap
    expect(isCanonicalDatum("31.02.2024")).toBe(false); // Feb has 29
    expect(isCanonicalDatum("31.04.2025")).toBe(false); // April has 30
    expect(isCanonicalDatum("31.06.2025")).toBe(false);
    expect(isCanonicalDatum("31.09.2025")).toBe(false);
    expect(isCanonicalDatum("31.11.2025")).toBe(false);
    expect(isCanonicalDatum("00.05.2026")).toBe(false);
    expect(isCanonicalDatum("32.05.2026")).toBe(false);
    expect(isCanonicalDatum("15.13.2026")).toBe(false);
    expect(isCanonicalDatum("15.00.2026")).toBe(false);
  });
  it("rejects wrong format", () => {
    expect(isCanonicalDatum("2.5.2026")).toBe(false); // no zero-pad
    expect(isCanonicalDatum("02.05.26")).toBe(false); // 2-digit year
    expect(isCanonicalDatum("02-05-2026")).toBe(false);
    expect(isCanonicalDatum("02/05/2026")).toBe(false);
    expect(isCanonicalDatum("")).toBe(false);
  });
});

describe("isCanonicalZeit — strict format + range", () => {
  it("accepts canonical strings", () => {
    expect(isCanonicalZeit("14:00 Uhr")).toBe(true);
    expect(isCanonicalZeit("00:00 Uhr")).toBe(true);
    expect(isCanonicalZeit("23:59 Uhr")).toBe(true);
  });
  it("rejects legacy/off-spec variants", () => {
    expect(isCanonicalZeit("14:00Uhr")).toBe(false); // no space
    expect(isCanonicalZeit("14:00 uhr")).toBe(false); // case
    expect(isCanonicalZeit("19.30 Uhr")).toBe(false); // period separator
    expect(isCanonicalZeit("14:00")).toBe(false); // no suffix
    expect(isCanonicalZeit("9:00 Uhr")).toBe(false); // no zero-pad
    expect(isCanonicalZeit("24:00 Uhr")).toBe(false); // out of range
    expect(isCanonicalZeit("12:60 Uhr")).toBe(false);
    expect(isCanonicalZeit("")).toBe(false);
  });
});

describe("normalizeLegacyZeit — prod-observed variants", () => {
  it("identity on canonical", () => {
    expect(normalizeLegacyZeit("14:00 Uhr")).toBe("14:00 Uhr");
    expect(normalizeLegacyZeit("15:00 Uhr")).toBe("15:00 Uhr");
    expect(normalizeLegacyZeit("19:00 Uhr")).toBe("19:00 Uhr");
    expect(normalizeLegacyZeit("14:15 Uhr")).toBe("14:15 Uhr");
  });
  it("missing-space legacy (prod id=7)", () => {
    expect(normalizeLegacyZeit("14:00Uhr")).toBe("14:00 Uhr");
    expect(normalizeLegacyZeit("09:05Uhr")).toBe("09:05 Uhr");
  });
  it("period-separator without suffix legacy (prod id=6)", () => {
    expect(normalizeLegacyZeit("19.30")).toBe("19:30 Uhr");
  });
  it("period-separator WITH suffix legacy (defensive)", () => {
    expect(normalizeLegacyZeit("19.30 Uhr")).toBe("19:30 Uhr");
    expect(normalizeLegacyZeit("19.30Uhr")).toBe("19:30 Uhr");
  });
  it("colon-only without suffix (defensive)", () => {
    expect(normalizeLegacyZeit("14:00")).toBe("14:00 Uhr");
  });
  it("auto-pads single-digit hours", () => {
    expect(normalizeLegacyZeit("9:05")).toBe("09:05 Uhr");
    expect(normalizeLegacyZeit("9.05 Uhr")).toBe("09:05 Uhr");
  });
  it("trims outer whitespace", () => {
    expect(normalizeLegacyZeit("  14:00 Uhr  ")).toBe("14:00 Uhr");
    expect(normalizeLegacyZeit("14:00Uhr\n")).toBe("14:00 Uhr");
  });
  it("null for unparseable input", () => {
    expect(normalizeLegacyZeit("am Abend")).toBeNull();
    expect(normalizeLegacyZeit("TBD")).toBeNull();
    expect(normalizeLegacyZeit("25:00")).toBeNull(); // out of range
    expect(normalizeLegacyZeit("14:60")).toBeNull();
    expect(normalizeLegacyZeit("")).toBeNull();
    expect(normalizeLegacyZeit("noon")).toBeNull();
  });
});

describe("isUpcomingDatum — Zurich-local inclusive today", () => {
  // Reference date: 2026-04-21 mid-morning UTC (= 2026-04-21 noon Zurich CEST)
  const today = new Date("2026-04-21T09:00:00Z");

  it("future date → true", () => {
    expect(isUpcomingDatum("03.06.2026", today)).toBe(true);
    expect(isUpcomingDatum("22.04.2026", today)).toBe(true); // tomorrow
    expect(isUpcomingDatum("01.01.2030", today)).toBe(true);
  });

  it("same day as 'today' → true (inclusive)", () => {
    expect(isUpcomingDatum("21.04.2026", today)).toBe(true);
  });

  it("past date → false", () => {
    expect(isUpcomingDatum("20.04.2026", today)).toBe(false); // yesterday
    expect(isUpcomingDatum("15.03.2025", today)).toBe(false);
    expect(isUpcomingDatum("31.12.2020", today)).toBe(false);
  });

  it("off-spec input → false (defensive)", () => {
    expect(isUpcomingDatum("", today)).toBe(false);
    expect(isUpcomingDatum("garbage", today)).toBe(false);
    expect(isUpcomingDatum("2026-04-21", today)).toBe(false); // ISO, not canonical
    expect(isUpcomingDatum("29.02.2025", today)).toBe(false); // impossible civil date
  });

  it("Zurich-local boundary: UTC-evening event-day stays 'today' for Zurich admins", () => {
    // 23:30 UTC on 2026-04-21 = 01:30 CEST on 2026-04-22 in Zurich —
    // Zurich has already rolled over to the next day.
    const lateUtc = new Date("2026-04-21T23:30:00Z");
    expect(isUpcomingDatum("22.04.2026", lateUtc)).toBe(true); // Zurich's today
    expect(isUpcomingDatum("21.04.2026", lateUtc)).toBe(false); // Zurich's yesterday
  });
});

describe("pickNearestUpcomingIndex", () => {
  const today = new Date("2026-04-21T10:00:00Z");

  it("returns -1 on empty list", () => {
    expect(pickNearestUpcomingIndex([], today)).toBe(-1);
  });

  it("returns -1 when all rows are past", () => {
    expect(
      pickNearestUpcomingIndex(
        [{ datum: "20.04.2026" }, { datum: "01.01.2026" }],
        today,
      ),
    ).toBe(-1);
  });

  it("picks the single nearest-future row regardless of position", () => {
    // Scrambled order (admin drag-sort) — must still find nearest-upcoming
    // (22.04.2026) even though it is not the first match encountered.
    const rows = [
      { datum: "01.06.2026" }, // far future
      { datum: "20.04.2026" }, // past (today is 21.04)
      { datum: "22.04.2026" }, // nearest upcoming
      { datum: "15.05.2026" }, // mid future
      { datum: "21.04.2026" }, // today → counts as upcoming, but not the winner (same as today — see below)
    ];
    const idx = pickNearestUpcomingIndex(rows, today);
    // Today (21.04) is upcoming per isUpcomingDatum (>= today); it is the
    // smallest future key → it wins, not 22.04.
    expect(idx).toBe(4);
    expect(rows[idx].datum).toBe("21.04.2026");
  });

  it("selects exactly one row when multiple future rows match", () => {
    const rows = [
      { datum: "01.06.2026" },
      { datum: "22.04.2026" },
      { datum: "15.05.2026" },
    ];
    const idx = pickNearestUpcomingIndex(rows, today);
    expect(idx).toBe(1); // 22.04 is nearest
  });

  it("skips off-format datum entries without crashing", () => {
    const rows = [
      { datum: "not a date" },
      { datum: "22.04.2026" },
    ];
    expect(pickNearestUpcomingIndex(rows, today)).toBe(1);
  });
});
