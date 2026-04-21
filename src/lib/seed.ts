import pool from "./db";
import { agendaItems } from "@/content/agenda";
import { journalEntries } from "@/content/de/journal/entries";
import { projekte } from "@/content/projekte";
import { alitSections } from "@/content/de/alit";
import { contentBlocksFromParagraphs } from "./i18n-field";
import { migrateLinesToContent } from "./journal-migration";

// Seed-Quelldaten (src/content/*) tragen noch Plain-Strings (titel, beschrieb,
// paragraphs etc.) — Seed transformiert beim INSERT direkt in die i18n-JSONB-
// Spalten. Legacy-DB-Spalten werden nicht mehr geschrieben (Cleanup-Sprint
// PR 1); der DB-DROP selbst kommt in PR 2.

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
        `INSERT INTO agenda_items (datum, zeit, ort_url, sort_order, title_i18n, lead_i18n, ort_i18n, content_i18n)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          item.datum,
          item.zeit,
          item.ortUrl,
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
      // Image-aware conversion preserves afterLine placements in the
      // derived content_i18n.de — otherwise seeded journal images vanish
      // from the live site (Codex P1 Sprint 4).
      const contentBlocks = migrateLinesToContent(entry.lines, entry.images ?? null);
      await pool.query(
        // DB `date` column is NOT NULL legacy — mirror `datum` into it so
        // seed inserts don't violate the constraint. `datum` drives the
        // public-list sort after PR #103; non-canonical seed values fall
        // through to `created_at` via the roundtrip guard.
        `INSERT INTO journal_entries (date, datum, author, title_border, images, sort_order, title_i18n, content_i18n, footer_i18n)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          entry.datum,
          entry.datum,
          entry.author ?? null,
          entry.titleBorder ?? false,
          entry.images ? JSON.stringify(entry.images) : null,
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
      // slug aus Seed wird slug_de (canonical immutable-ID für hashtag-refs).
      // slug_fr bleibt NULL — Admin setzt es später pro Projekt via Dashboard.
      await pool.query(
        `INSERT INTO projekte (slug_de, slug_fr, archived, sort_order, title_i18n, kategorie_i18n, content_i18n)
         VALUES ($1, NULL, $2, $3, $4, $5, $6)
         ON CONFLICT (slug_de) DO NOTHING`,
        [
          p.slug,
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
        `INSERT INTO alit_sections (sort_order, locale, title_i18n, content_i18n)
         VALUES ($1, 'de', $2, $3)`,
        [
          i,
          JSON.stringify(section.title ? { de: section.title } : {}),
          JSON.stringify({ de: section.content }),
        ]
      );
    }
    console.log(`[seed] Inserted ${alitSections.length} alit sections`);
  }
}
