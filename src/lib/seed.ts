import pool from "./db";
import { agendaItems } from "@/content/agenda";
import { journalEntries } from "@/content/de/journal/entries";
import { projekte } from "@/content/projekte";

export async function seedIfEmpty() {
  const { rows } = await pool.query(
    "SELECT (SELECT COUNT(*) FROM agenda_items) AS agenda, (SELECT COUNT(*) FROM journal_entries) AS journal, (SELECT COUNT(*) FROM projekte) AS projekte"
  );
  const counts = rows[0];

  if (Number(counts.agenda) === 0) {
    for (let i = 0; i < agendaItems.length; i++) {
      const item = agendaItems[i];
      await pool.query(
        `INSERT INTO agenda_items (datum, zeit, ort, ort_url, titel, beschrieb, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [item.datum, item.zeit, item.ort, item.ortUrl, item.titel, JSON.stringify(item.beschrieb), i]
      );
    }
    console.log(`[seed] Inserted ${agendaItems.length} agenda items`);
  }

  if (Number(counts.journal) === 0) {
    for (let i = 0; i < journalEntries.length; i++) {
      const entry = journalEntries[i];
      await pool.query(
        `INSERT INTO journal_entries (date, author, title, title_border, lines, images, footer, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          entry.date,
          entry.author ?? null,
          entry.title ?? null,
          entry.titleBorder ?? false,
          JSON.stringify(entry.lines),
          entry.images ? JSON.stringify(entry.images) : null,
          entry.footer ?? null,
          i,
        ]
      );
    }
    console.log(`[seed] Inserted ${journalEntries.length} journal entries`);
  }

  if (Number(counts.projekte) === 0) {
    for (let i = 0; i < projekte.length; i++) {
      const p = projekte[i];
      await pool.query(
        `INSERT INTO projekte (slug, titel, kategorie, paragraphs, external_url, archived, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (slug) DO NOTHING`,
        [p.slug, p.titel, p.kategorie, JSON.stringify(p.paragraphs), p.externalUrl ?? null, p.archived ?? false, i]
      );
    }
    console.log(`[seed] Inserted ${projekte.length} projekte`);
  }
}
