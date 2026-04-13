import pool from "./db";
import type { AgendaItemData } from "@/components/AgendaItem";
import type { JournalEntry } from "@/content/de/journal/entries";
import type { Projekt } from "@/content/projekte";

export async function getAgendaItems(): Promise<AgendaItemData[]> {
  const { rows } = await pool.query(
    "SELECT datum, zeit, ort, ort_url, titel, lead, beschrieb, content, hashtags FROM agenda_items ORDER BY sort_order DESC"
  );
  return rows.map((r) => ({
    datum: r.datum,
    zeit: r.zeit,
    ort: r.ort,
    ortUrl: r.ort_url,
    titel: r.titel,
    lead: r.lead ?? undefined,
    beschrieb: r.beschrieb,
    content: r.content ?? undefined,
    hashtags: Array.isArray(r.hashtags) ? r.hashtags : [],
  }));
}

export async function getJournalEntries(): Promise<JournalEntry[]> {
  const { rows } = await pool.query(
    "SELECT date, author, title, title_border, lines, images, content, footer FROM journal_entries ORDER BY sort_order ASC"
  );
  return rows.map((r) => ({
    date: r.date,
    author: r.author ?? undefined,
    title: r.title ?? undefined,
    titleBorder: r.title_border,
    lines: r.lines,
    images: r.images ?? undefined,
    content: r.content ?? undefined,
    footer: r.footer ?? undefined,
  }));
}

export async function getProjekte(): Promise<Projekt[]> {
  const { rows } = await pool.query(
    "SELECT slug, titel, kategorie, paragraphs, content, external_url, archived FROM projekte ORDER BY sort_order ASC"
  );
  return rows.map((r) => ({
    slug: r.slug,
    titel: r.titel,
    kategorie: r.kategorie,
    paragraphs: r.paragraphs,
    content: r.content ?? undefined,
    externalUrl: r.external_url ?? undefined,
    archived: r.archived,
  }));
}
