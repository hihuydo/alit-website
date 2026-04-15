import pool from "./db";
import { agendaItems } from "@/content/agenda";
import { journalEntries } from "@/content/de/journal/entries";
import { projekte } from "@/content/projekte";
import { alitSections } from "@/content/de/alit";
import { contentBlocksFromParagraphs } from "./i18n-field";

export async function seedIfEmpty() {
  const { rows } = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM agenda_items)    AS agenda,
       (SELECT COUNT(*) FROM journal_entries) AS journal,
       (SELECT COUNT(*) FROM projekte)        AS projekte,
       (SELECT COUNT(*) FROM alit_sections)   AS alit`
  );
  const counts = rows[0];

  if (Number(counts.agenda) === 0) {
    for (let i = 0; i < agendaItems.length; i++) {
      const item = agendaItems[i];
      const contentBlocks = contentBlocksFromParagraphs(item.beschrieb);
      await pool.query(
        `INSERT INTO agenda_items (datum, zeit, ort, ort_url, titel, beschrieb, sort_order, title_i18n, lead_i18n, ort_i18n, content_i18n)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          item.datum,
          item.zeit,
          item.ort,
          item.ortUrl,
          item.titel,
          JSON.stringify(item.beschrieb),
          i,
          JSON.stringify({ de: item.titel }),
          JSON.stringify({}),
          JSON.stringify({ de: item.ort }),
          JSON.stringify({ de: contentBlocks }),
        ]
      );
    }
    console.log(`[seed] Inserted ${agendaItems.length} agenda items`);
  }

  if (Number(counts.journal) === 0) {
    for (let i = 0; i < journalEntries.length; i++) {
      const entry = journalEntries[i];
      const contentBlocks = contentBlocksFromParagraphs(entry.lines);
      await pool.query(
        `INSERT INTO journal_entries (date, author, title, title_border, lines, images, footer, sort_order, title_i18n, content_i18n, footer_i18n)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          entry.date,
          entry.author ?? null,
          entry.title ?? null,
          entry.titleBorder ?? false,
          JSON.stringify(entry.lines),
          entry.images ? JSON.stringify(entry.images) : null,
          entry.footer ?? null,
          i,
          JSON.stringify(entry.title ? { de: entry.title } : {}),
          JSON.stringify({ de: contentBlocks }),
          JSON.stringify(entry.footer ? { de: entry.footer } : {}),
        ]
      );
    }
    console.log(`[seed] Inserted ${journalEntries.length} journal entries`);
  }

  if (Number(counts.projekte) === 0) {
    for (let i = 0; i < projekte.length; i++) {
      const p = projekte[i];
      const contentBlocks = p.content && p.content.length > 0
        ? p.content
        : contentBlocksFromParagraphs(p.paragraphs);
      await pool.query(
        `INSERT INTO projekte (slug, titel, kategorie, paragraphs, external_url, archived, sort_order, title_i18n, kategorie_i18n, content_i18n)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (slug) DO NOTHING`,
        [
          p.slug,
          p.titel,
          p.kategorie,
          JSON.stringify(p.paragraphs),
          p.externalUrl ?? null,
          p.archived ?? false,
          i,
          JSON.stringify({ de: p.titel }),
          JSON.stringify({ de: p.kategorie }),
          JSON.stringify({ de: contentBlocks }),
        ]
      );
    }
    console.log(`[seed] Inserted ${projekte.length} projekte`);
  }

  if (Number(counts.alit) === 0) {
    for (let i = 0; i < alitSections.length; i++) {
      const section = alitSections[i];
      await pool.query(
        `INSERT INTO alit_sections (title, content, sort_order, locale)
         VALUES ($1, $2, $3, 'de')`,
        [section.title, JSON.stringify(section.content), i]
      );
    }
    console.log(`[seed] Inserted ${alitSections.length} alit sections`);
  }
}
