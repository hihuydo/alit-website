import pool from "./db";

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

  // Additive migration: add content column if missing (for existing DBs)
  await pool.query(`
    ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS content JSONB;
  `);

  // Additive migration: add public_id to media if missing
  await pool.query(`
    ALTER TABLE media ADD COLUMN IF NOT EXISTS public_id TEXT UNIQUE;
  `);
  // Backfill any rows missing public_id
  await pool.query(`
    UPDATE media SET public_id = gen_random_uuid()::text WHERE public_id IS NULL;
  `);
  // Make NOT NULL after backfill
  await pool.query(`
    ALTER TABLE media ALTER COLUMN public_id SET NOT NULL;
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
}
