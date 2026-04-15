import pool from "./db";
import { contentBlocksFromParagraphs } from "./i18n-field";
import { migrateLinesToContent } from "./journal-migration";

// Idempotent hashtag shape migration: converts each row's hashtags JSONB array
// from `{tag, projekt_slug}[]` to `{tag_i18n: {de, fr}, projekt_slug}[]`.
// Default: FR = DE (brand names typically identical). Admin can override per
// hashtag in the dashboard afterwards. Only touches rows with at least one
// element still in the legacy shape (`typeof h.tag === 'string'`).
async function migrateHashtagShape(tableName: "agenda_items" | "journal_entries") {
  const { rows } = await pool.query<{ id: number; hashtags: unknown }>(`
    SELECT id, hashtags FROM ${tableName}
     WHERE jsonb_typeof(hashtags) = 'array'
       AND jsonb_array_length(hashtags) > 0
       AND EXISTS (
         SELECT 1 FROM jsonb_array_elements(hashtags) AS h
         WHERE jsonb_typeof(h->'tag') = 'string'
       )
  `);
  for (const row of rows) {
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
      `UPDATE ${tableName} SET hashtags = $1::jsonb WHERE id = $2`,
      [JSON.stringify(migrated), row.id],
    );
  }
}

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

  await migrateHashtagShape("agenda_items");

  // Sprint 4 i18n migration on journal_entries: JSONB-per-field + hashtag shape.
  await pool.query(`
    ALTER TABLE journal_entries
      ADD COLUMN IF NOT EXISTS title_i18n   JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS content_i18n JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS footer_i18n  JSONB NOT NULL DEFAULT '{}'::jsonb;
  `);

  const { rows: journalToMigrate } = await pool.query<{
    id: number;
    title: string | null;
    lines: unknown;
    images: unknown;
    content: unknown;
    footer: string | null;
  }>(`
    SELECT id, title, lines, images, content, footer
      FROM journal_entries
     WHERE title_i18n = '{}'::jsonb
       AND content_i18n = '{}'::jsonb
       AND footer_i18n = '{}'::jsonb
  `);
  for (const row of journalToMigrate) {
    const hasRichContent =
      Array.isArray(row.content) && row.content.length > 0;
    // Use image-aware conversion when deriving from legacy lines — otherwise
    // inline image placements (afterLine) get dropped and the public renderer
    // shows text-only entries after migration. Codex P1.
    const contentBlocks = hasRichContent
      ? row.content
      : migrateLinesToContent(
          Array.isArray(row.lines) ? (row.lines as string[]) : [],
          Array.isArray(row.images) ? (row.images as { src: string; afterLine: number }[]) : null,
        );
    const titleObj = row.title && row.title.length > 0 ? { de: row.title } : {};
    const footerObj = row.footer && row.footer.length > 0 ? { de: row.footer } : {};
    await pool.query(
      `UPDATE journal_entries
          SET title_i18n   = $1::jsonb,
              content_i18n = $2::jsonb,
              footer_i18n  = $3::jsonb
        WHERE id = $4`,
      [
        JSON.stringify(titleObj),
        JSON.stringify({ de: contentBlocks }),
        JSON.stringify(footerObj),
        row.id,
      ],
    );
  }

  await migrateHashtagShape("journal_entries");

  // Sprint 5: locale-specific URL slugs for projekte.
  // slug_de is immutable after create and doubles as the stable internal
  // ID referenced by agenda/journal hashtags. slug_fr is optional; when
  // null, /fr/projekte/<slug_de> renders with DE fallback content.
  // Legacy `slug` column stays write-only (dual-written = slug_de) for
  // rollback safety. Reader code must not touch it.

  // Preflight: legacy `slug` is already UNIQUE NOT NULL by schema, so
  // duplicates and NULLs are structurally impossible. Defensive check
  // against empty strings and regressions — throws with an actionable
  // message so the operator can fix data before boot retry.
  const { rows: emptySlugRows } = await pool.query<{ count: string }>(
    `SELECT count(*)::text as count FROM projekte WHERE slug IS NULL OR slug = ''`,
  );
  if (parseInt(emptySlugRows[0].count, 10) > 0) {
    throw new Error(
      `[schema] projekte has ${emptySlugRows[0].count} row(s) with NULL or empty slug. Fix the data before boot.`,
    );
  }
  const { rows: dupSlugRows } = await pool.query<{ slug: string; count: string }>(
    `SELECT slug, count(*)::text as count FROM projekte GROUP BY slug HAVING count(*) > 1`,
  );
  if (dupSlugRows.length > 0) {
    const list = dupSlugRows.map((r) => `${r.slug} (${r.count}x)`).join(", ");
    throw new Error(`[schema] projekte has duplicate slug(s): ${list}. Fix the data before boot.`);
  }

  await pool.query(`
    ALTER TABLE projekte
      ADD COLUMN IF NOT EXISTS slug_de TEXT,
      ADD COLUMN IF NOT EXISTS slug_fr TEXT;
  `);

  // Idempotent backfill: slug_de copies legacy slug for rows that haven't
  // been migrated yet. slug_fr stays NULL — admins opt in per projekt.
  await pool.query(`
    UPDATE projekte SET slug_de = slug
     WHERE slug_de IS NULL OR slug_de = '';
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS projekte_slug_de_unique ON projekte (slug_de);
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS projekte_slug_fr_unique ON projekte (slug_fr)
      WHERE slug_fr IS NOT NULL;
  `);

  // SET NOT NULL is idempotent in PG (no-op when already NOT NULL); safe
  // after the backfill above guarantees every row has slug_de.
  await pool.query(`ALTER TABLE projekte ALTER COLUMN slug_de SET NOT NULL;`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS site_settings (
      key        TEXT PRIMARY KEY,
      value      TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}
