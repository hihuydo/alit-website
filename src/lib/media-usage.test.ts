import { describe, it, expect } from "vitest";
import { findUsageIn, buildUsageIndex, type MediaRefSource } from "./media-usage";

const UUID_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const UUID_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("findUsageIn", () => {
  it("returns empty array when no sources match", () => {
    const result = findUsageIn(
      [{ kind: "journal", rows: [{ id: 1, label: "Entry 1", refText: "nothing here" }] }],
      UUID_A,
    );
    expect(result).toEqual([]);
  });

  it("matches /api/media/<uuid> path in refText (journal content pattern)", () => {
    const result = findUsageIn(
      [
        {
          kind: "journal",
          rows: [{ id: 42, label: "2026-01-01: Post", refText: `<img src="/api/media/${UUID_A}/">` }],
        },
      ],
      UUID_A,
    );
    expect(result).toEqual([{ kind: "journal", id: 42, label: "2026-01-01: Post" }]);
  });

  it("matches raw public_id in refText (agenda images JSON pattern)", () => {
    const result = findUsageIn(
      [
        {
          kind: "agenda",
          rows: [{ id: 7, label: "2026-03-12: Lesung", refText: `[{"public_id":"${UUID_A}","orientation":"portrait"}]` }],
        },
      ],
      UUID_A,
    );
    expect(result).toEqual([{ kind: "agenda", id: 7, label: "2026-03-12: Lesung" }]);
  });

  it("does not match unrelated UUIDs", () => {
    const result = findUsageIn(
      [
        {
          kind: "journal",
          rows: [{ id: 1, label: "Entry", refText: `/api/media/${UUID_B}` }],
        },
      ],
      UUID_A,
    );
    expect(result).toEqual([]);
  });

  it("returns multiple hits across sources and rows", () => {
    const result = findUsageIn(
      [
        {
          kind: "journal",
          rows: [
            { id: 1, label: "J1", refText: `/api/media/${UUID_A}` },
            { id: 2, label: "J2", refText: "no match" },
          ],
        },
        {
          kind: "agenda",
          rows: [{ id: 99, label: "A1", refText: `"public_id":"${UUID_A}"` }],
        },
      ],
      UUID_A,
    );
    expect(result).toEqual([
      { kind: "journal", id: 1, label: "J1" },
      { kind: "agenda", id: 99, label: "A1" },
    ]);
  });

  it("matches alit sections that link a media URL in rich-text content", () => {
    const result = findUsageIn(
      [
        {
          kind: "alit",
          rows: [
            {
              id: 8,
              label: "Impressum",
              refText: `<a href="/api/media/${UUID_A}/">Datenschutz</a>`,
            },
          ],
        },
      ],
      UUID_A,
    );
    expect(result).toEqual([{ kind: "alit", id: 8, label: "Impressum" }]);
  });
});

describe("buildUsageIndex", () => {
  it("fetches all sources in parallel and builds a reusable lookup", async () => {
    let journalFetchCount = 0;
    let agendaFetchCount = 0;
    const sources: MediaRefSource[] = [
      {
        kind: "journal",
        fetch: async () => {
          journalFetchCount++;
          return [{ id: 1, label: "J1", refText: `/api/media/${UUID_A}` }];
        },
      },
      {
        kind: "agenda",
        fetch: async () => {
          agendaFetchCount++;
          return [{ id: 2, label: "A1", refText: `"public_id":"${UUID_B}"` }];
        },
      },
    ];

    const lookup = await buildUsageIndex(sources);

    expect(lookup(UUID_A)).toEqual([{ kind: "journal", id: 1, label: "J1" }]);
    expect(lookup(UUID_B)).toEqual([{ kind: "agenda", id: 2, label: "A1" }]);
    expect(lookup("unrelated")).toEqual([]);

    // Sources fetched exactly once even after multiple lookups
    expect(journalFetchCount).toBe(1);
    expect(agendaFetchCount).toBe(1);
  });
});
