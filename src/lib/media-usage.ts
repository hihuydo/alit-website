import pool from "@/lib/db";

export type MediaUsage = {
  kind: "journal" | "agenda" | "alit";
  id: number;
  label: string;
};

export type MediaRefRow = {
  id: number;
  label: string;
  refText: string;
};

export type MediaRefSource = {
  kind: "journal" | "agenda" | "alit";
  // Fetch all rows that may reference media. Must return {id, label, refText}
  // where refText is a searchable string containing any serialized media
  // references (paths like /api/media/<uuid>/ and/or raw public_ids).
  fetch: () => Promise<MediaRefRow[]>;
};

type SourceResult = { kind: MediaUsage["kind"]; rows: MediaRefRow[] };

// Pure matcher: given pre-fetched source rows, returns all usages of publicId.
// Extracted so it is testable without a DB. buildUsageIndex wraps this with
// the concrete DB fetch.
export function findUsageIn(sourceResults: readonly SourceResult[], publicId: string): MediaUsage[] {
  const mediaPath = `/api/media/${publicId}`;
  const usage: MediaUsage[] = [];
  for (const { kind, rows } of sourceResults) {
    for (const row of rows) {
      // Match either form — some columns store paths (journal content,
      // agenda rich-text), others store raw public_ids (agenda images JSON).
      if (row.refText.includes(mediaPath) || row.refText.includes(publicId)) {
        usage.push({ kind, id: row.id, label: row.label });
      }
    }
  }
  return usage;
}

// Registry of all entities that may reference media. To add a new source:
// append one entry here — the usage scan will pick it up automatically.
export const MEDIA_REF_SOURCES: readonly MediaRefSource[] = Object.freeze([
  {
    kind: "journal",
    fetch: async () => {
      // content_i18n::text serialisiert beide Locales als JSON — scannt
      // auch FR-only media-references (Bonus gegenüber legacy content-Scan).
      // Label nutzt DE-Fallback; Admin-UI ist DE-only.
      const { rows } = await pool.query<{
        id: number;
        date: string;
        title_de: string | null;
        content_text: string | null;
        images_text: string | null;
      }>(
        "SELECT id, date, title_i18n->>'de' as title_de, content_i18n::text as content_text, images::text as images_text FROM journal_entries"
      );
      return rows.map((r) => ({
        id: r.id,
        label: r.title_de ? `${r.date}: ${r.title_de}` : r.date,
        refText: `${r.content_text ?? ""}\n${r.images_text ?? ""}`,
      }));
    },
  },
  {
    kind: "agenda",
    fetch: async () => {
      const { rows } = await pool.query<{
        id: number;
        datum: string;
        titel_de: string | null;
        content_text: string | null;
        images_text: string | null;
      }>(
        "SELECT id, datum, title_i18n->>'de' as titel_de, content_i18n::text as content_text, images::text as images_text FROM agenda_items"
      );
      return rows.map((r) => ({
        id: r.id,
        label: r.titel_de ? `${r.datum}: ${r.titel_de}` : r.datum,
        refText: `${r.content_text ?? ""}\n${r.images_text ?? ""}`,
      }));
    },
  },
  {
    kind: "alit",
    fetch: async () => {
      // Scans content_i18n (beide Locales als serialized JSON) nach
      // /api/media/<uuid>-Referenzen in Rich-Text-Link-Hrefs.
      const { rows } = await pool.query<{
        id: number;
        title_de: string | null;
        content_text: string | null;
      }>(
        "SELECT id, title_i18n->>'de' as title_de, content_i18n::text as content_text FROM alit_sections"
      );
      return rows.map((r) => ({
        id: r.id,
        label: r.title_de ?? "(Intro)",
        refText: r.content_text ?? "",
      }));
    },
  },
]);

// Fetches all sources in parallel and returns a mapper (publicId → MediaUsage[]).
// Call once per media request; reuse the mapper for every media row.
export async function buildUsageIndex(
  sources: readonly MediaRefSource[] = MEDIA_REF_SOURCES
): Promise<(publicId: string) => MediaUsage[]> {
  const sourceResults = await Promise.all(
    sources.map(async (src) => ({ kind: src.kind, rows: await src.fetch() }))
  );
  return (publicId: string) => findUsageIn(sourceResults, publicId);
}
