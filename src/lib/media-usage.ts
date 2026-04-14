import pool from "@/lib/db";

export type MediaUsage = {
  kind: "journal" | "agenda";
  id: number;
  label: string;
};

type MediaRefRow = {
  id: number;
  label: string;
  refText: string;
};

type MediaRefSource = {
  kind: "journal" | "agenda";
  // Fetch all rows that may reference media. Must return {id, label, refText}
  // where refText is a searchable string containing any serialized media
  // references (paths like /api/media/<uuid>/ and/or raw public_ids).
  fetch: () => Promise<MediaRefRow[]>;
};

// Registry of all entities that may reference media. To add a new source:
// append one entry here — the usage scan will pick it up automatically.
export const MEDIA_REF_SOURCES: MediaRefSource[] = [
  {
    kind: "journal",
    fetch: async () => {
      const { rows } = await pool.query<{
        id: number;
        date: string;
        title: string | null;
        content_text: string | null;
        images_text: string | null;
      }>(
        "SELECT id, date, title, content::text as content_text, images::text as images_text FROM journal_entries"
      );
      return rows.map((r) => ({
        id: r.id,
        label: r.title ? `${r.date}: ${r.title}` : r.date,
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
        titel: string;
        content_text: string | null;
        images_text: string | null;
      }>(
        "SELECT id, datum, titel, content::text as content_text, images::text as images_text FROM agenda_items"
      );
      return rows.map((r) => ({
        id: r.id,
        label: `${r.datum}: ${r.titel}`,
        refText: `${r.content_text ?? ""}\n${r.images_text ?? ""}`,
      }));
    },
  },
];

// Fetches all sources in parallel and returns a mapper (publicId → MediaUsage[]).
// Call once per media/GET request; reuse the mapper for every media row.
export async function buildUsageIndex(): Promise<(publicId: string) => MediaUsage[]> {
  const sourceResults = await Promise.all(
    MEDIA_REF_SOURCES.map(async (src) => ({ kind: src.kind, rows: await src.fetch() }))
  );

  return (publicId: string): MediaUsage[] => {
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
  };
}
