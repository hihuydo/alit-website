import pool from "./db";
import { contentBlocksFromParagraphs } from "./i18n-field";

export async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id         SERIAL PRIMARY KEY,
      email      TEXT UNIQUE NOT NULL,
      password   TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS agenda_items (
      id         SERIAL PRIMARY KEY,
      datum      TEXT NOT NULL,
      zeit       TEXT NOT NULL,
      ort        TEXT NOT NULL,
      ort_url    TEXT NOT NULL,
      titel      TEXT NOT NULL,
      beschrieb  JSONB NOT NULL DEFAULT '[]',
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS journal_entries (
      id           SERIAL PRIMARY KEY,
      date         TEXT NOT NULL,
      author       TEXT,
      title        TEXT,
      title_border BOOLEAN DEFAULT FALSE,
      lines        JSONB NOT NULL DEFAULT '[]',
      images       JSONB,
      content      JSONB,
      footer       TEXT,
      sort_order   INT NOT NULL DEFAULT 0,
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      updated_at   TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS projekte (
      id           SERIAL PRIMARY KEY,
      slug         TEXT UNIQUE NOT NULL,
      titel        TEXT NOT NULL,
      kategorie    TEXT NOT NULL,
      paragraphs   JSONB NOT NULL DEFAULT '[]',
      external_url TEXT,
      archived     BOOLEAN DEFAULT FALSE,
      sort_order   INT NOT NULL DEFAULT 0,
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      updated_at   TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Additive migrations: add content columns if missing (for existing DBs)
  await pool.query(`
    ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS content JSONB;
  `);
  await pool.query(`
    ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS hashtags JSONB NOT NULL DEFAULT '[]';
  `);
  await pool.query(`
    ALTER TABLE agenda_items ADD COLUMN IF NOT EXISTS content JSONB;
  `);
  await pool.query(`
    ALTER TABLE agenda_items ADD COLUMN IF NOT EXISTS hashtags JSONB NOT NULL DEFAULT '[]';
  `);
  await pool.query(`
    ALTER TABLE agenda_items ADD COLUMN IF NOT EXISTS lead TEXT;
  `);
  await pool.query(`
    ALTER TABLE agenda_items ADD COLUMN IF NOT EXISTS images JSONB NOT NULL DEFAULT '[]';
  `);
  await pool.query(`
    ALTER TABLE projekte ADD COLUMN IF NOT EXISTS content JSONB;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS media (
      id         SERIAL PRIMARY KEY,
      public_id  TEXT UNIQUE NOT NULL,
      filename   TEXT NOT NULL,
      mime_type  TEXT NOT NULL,
      size       INT NOT NULL,
      data       BYTEA NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Additive migration: add public_id to media if missing (for existing DBs)
  await pool.query(`
    ALTER TABLE media ADD COLUMN IF NOT EXISTS public_id TEXT UNIQUE;
  `);
  // Backfill missing public_ids with app-generated UUIDs (no pgcrypto dependency)
  const { rows: missing } = await pool.query(
    `SELECT id FROM media WHERE public_id IS NULL`
  );
  for (const row of missing) {
    await pool.query(
      `UPDATE media SET public_id = $1 WHERE id = $2`,
      [crypto.randomUUID(), row.id]
    );
  }
  await pool.query(`
    ALTER TABLE media ALTER COLUMN public_id SET NOT NULL;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS alit_sections (
      id         SERIAL PRIMARY KEY,
      title      TEXT,
      content    JSONB NOT NULL DEFAULT '[]'::jsonb,
      sort_order INT NOT NULL DEFAULT 0,
      locale     TEXT NOT NULL DEFAULT 'de',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_alit_sections_sort ON alit_sections(locale, sort_order);
  `);

  // i18n migration: JSONB-per-field columns + DE-only backfill
  await pool.query(`
    ALTER TABLE alit_sections
      ADD COLUMN IF NOT EXISTS title_i18n   JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS content_i18n JSONB NOT NULL DEFAULT '{}'::jsonb;
  `);

  // Precondition: Sprint 1 supports only DE-only backfill.
  // If any FR rows exist, abort — operator must run a manual merge script.
  const { rows: fallbackCheck } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM alit_sections WHERE locale = 'fr'`,
  );
  if ((fallbackCheck[0]?.n ?? 0) > 0) {
    const { rows: backfilled } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM alit_sections WHERE content_i18n <> '{}'::jsonb OR title_i18n <> '{}'::jsonb`,
    );
    if ((backfilled[0]?.n ?? 0) === 0) {
      throw new Error(
        "[schema] alit_sections i18n backfill aborted: FR rows present. " +
          "Sprint 1 supports DE-only backfill. Run a manual merge script before re-deploying.",
      );
    }
    // else: backfill already ran in a previous boot — skip silently (idempotent)
  } else {
    // Idempotent DE-only backfill: only touch rows that haven't been migrated yet
    await pool.query(`
      UPDATE alit_sections
      SET
        title_i18n = CASE
          WHEN title IS NOT NULL AND title <> ''
          THEN jsonb_build_object('de', title)
          ELSE '{}'::jsonb
        END,
        content_i18n = jsonb_build_object('de', COALESCE(content, '[]'::jsonb))
      WHERE locale = 'de'
        AND content_i18n = '{}'::jsonb
        AND title_i18n = '{}'::jsonb;
    `);
  }

  // Sprint 2 i18n migration on projekte: JSONB-per-field columns + DE backfill.
  // No FR-precondition abort needed — projekte has no `locale` column, one row
  // per logical entity from the start.
  await pool.query(`
    ALTER TABLE projekte
      ADD COLUMN IF NOT EXISTS title_i18n     JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS kategorie_i18n JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS content_i18n   JSONB NOT NULL DEFAULT '{}'::jsonb;
  `);

  // Idempotent backfill: only touch rows whose *_i18n columns are all '{}'.
  // paragraphs → JournalContent derivation lives in JS, so we fetch candidate
  // rows and write one UPDATE per row.
  const { rows: toMigrate } = await pool.query<{
    id: number;
    titel: string;
    kategorie: string;
    paragraphs: unknown;
    content: unknown;
  }>(`
    SELECT id, titel, kategorie, paragraphs, content
      FROM projekte
     WHERE title_i18n = '{}'::jsonb
       AND kategorie_i18n = '{}'::jsonb
       AND content_i18n = '{}'::jsonb
  `);
  for (const row of toMigrate) {
    const hasRichContent =
      Array.isArray(row.content) && row.content.length > 0;
    const contentBlocks = hasRichContent
      ? row.content
      : contentBlocksFromParagraphs(
          Array.isArray(row.paragraphs) ? (row.paragraphs as string[]) : [],
        );
    const titleObj = row.titel && row.titel.length > 0 ? { de: row.titel } : {};
    const katObj =
      row.kategorie && row.kategorie.length > 0 ? { de: row.kategorie } : {};
    await pool.query(
      `UPDATE projekte
          SET title_i18n     = $1::jsonb,
              kategorie_i18n = $2::jsonb,
              content_i18n   = $3::jsonb
        WHERE id = $4`,
      [
        JSON.stringify(titleObj),
        JSON.stringify(katObj),
        JSON.stringify({ de: contentBlocks }),
        row.id,
      ],
    );
  }

  // Sprint 3 i18n migration on agenda_items: JSONB-per-field + hashtag shape.
  await pool.query(`
    ALTER TABLE agenda_items
      ADD COLUMN IF NOT EXISTS title_i18n   JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS lead_i18n    JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS ort_i18n     JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS content_i18n JSONB NOT NULL DEFAULT '{}'::jsonb;
  `);

  const { rows: agendaToMigrate } = await pool.query<{
    id: number;
    titel: string;
    lead: string | null;
    ort: string;
    beschrieb: unknown;
    content: unknown;
  }>(`
    SELECT id, titel, lead, ort, beschrieb, content
      FROM agenda_items
     WHERE title_i18n = '{}'::jsonb
       AND lead_i18n = '{}'::jsonb
       AND ort_i18n = '{}'::jsonb
       AND content_i18n = '{}'::jsonb
  `);
  for (const row of agendaToMigrate) {
    const hasRichContent =
      Array.isArray(row.content) && row.content.length > 0;
    const contentBlocks = hasRichContent
      ? row.content
      : contentBlocksFromParagraphs(
          Array.isArray(row.beschrieb) ? (row.beschrieb as string[]) : [],
        );
    const titleObj = row.titel && row.titel.length > 0 ? { de: row.titel } : {};
    const leadObj = row.lead && row.lead.length > 0 ? { de: row.lead } : {};
    const ortObj = row.ort && row.ort.length > 0 ? { de: row.ort } : {};
    await pool.query(
      `UPDATE agenda_items
          SET title_i18n   = $1::jsonb,
              lead_i18n    = $2::jsonb,
              ort_i18n     = $3::jsonb,
              content_i18n = $4::jsonb
        WHERE id = $5`,
      [
        JSON.stringify(titleObj),
        JSON.stringify(leadObj),
        JSON.stringify(ortObj),
        JSON.stringify({ de: contentBlocks }),
        row.id,
      ],
    );
  }

  // Hashtag shape migration: {tag, projekt_slug}[] → {tag_i18n: {de, fr}, projekt_slug}[]
  // In-place JSONB transformation, idempotent via `typeof h.tag === 'string'` check.
  // Default: FR = DE (brand names typically identical across locales).
  const { rows: rowsWithOldHashtagShape } = await pool.query<{ id: number; hashtags: unknown }>(`
    SELECT id, hashtags FROM agenda_items
     WHERE jsonb_typeof(hashtags) = 'array'
       AND jsonb_array_length(hashtags) > 0
       AND EXISTS (
         SELECT 1 FROM jsonb_array_elements(hashtags) AS h
         WHERE jsonb_typeof(h->'tag') = 'string'
       )
  `);
  for (const row of rowsWithOldHashtagShape) {
    if (!Array.isArray(row.hashtags)) continue;
    const migrated = row.hashtags.map((h: unknown) => {
      if (typeof h !== "object" || h === null) return h;
      const obj = h as { tag?: unknown; projekt_slug?: unknown; tag_i18n?: unknown };
      if (typeof obj.tag === "string") {
        return { tag_i18n: { de: obj.tag, fr: obj.tag }, projekt_slug: obj.projekt_slug };
      }
      return obj;
    });
    await pool.query(
      `UPDATE agenda_items SET hashtags = $1::jsonb WHERE id = $2`,
      [JSON.stringify(migrated), row.id],
    );
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS site_settings (
      key        TEXT PRIMARY KEY,
      value      TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}
