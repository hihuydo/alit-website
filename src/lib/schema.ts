import pool from "./db";

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
      ort_url    TEXT,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS journal_entries (
      id           SERIAL PRIMARY KEY,
      date         TEXT NOT NULL,
      author       TEXT,
      title_border BOOLEAN DEFAULT FALSE,
      images       JSONB,
      sort_order   INT NOT NULL DEFAULT 0,
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      updated_at   TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS projekte (
      id           SERIAL PRIMARY KEY,
      archived     BOOLEAN DEFAULT FALSE,
      sort_order   INT NOT NULL DEFAULT 0,
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      updated_at   TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Additive migrations: add columns if missing (for existing DBs).
  // Legacy-intermediate columns (content/lead) sind in PR 2 (DROP-Sprint)
  // entfernt; nur nicht-legacy-Extensions bleiben hier.
  await pool.query(`
    ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS hashtags JSONB NOT NULL DEFAULT '[]';
  `);
  await pool.query(`
    ALTER TABLE agenda_items ADD COLUMN IF NOT EXISTS hashtags JSONB NOT NULL DEFAULT '[]';
  `);
  await pool.query(`
    ALTER TABLE agenda_items ADD COLUMN IF NOT EXISTS images JSONB NOT NULL DEFAULT '[]';
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
      sort_order INT NOT NULL DEFAULT 0,
      locale     TEXT NOT NULL DEFAULT 'de',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_alit_sections_sort ON alit_sections(locale, sort_order);
  `);

  // i18n-Spalten für alle 4 Content-Entities. Backfill aus Legacy-Spalten
  // (Sprint 1-4) ist nicht mehr nötig — PR 2 droppt die Legacy-Spalten,
  // seit PR 1 schreibt App/Seed nur noch i18n. Auf Prod sind alle Rows
  // längst i18n-gefüllt (verifiziert per Sanity-Query vor PR 2 Merge).
  await pool.query(`
    ALTER TABLE alit_sections
      ADD COLUMN IF NOT EXISTS title_i18n   JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS content_i18n JSONB NOT NULL DEFAULT '{}'::jsonb;
  `);

  await pool.query(`
    ALTER TABLE projekte
      ADD COLUMN IF NOT EXISTS title_i18n     JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS kategorie_i18n JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS content_i18n   JSONB NOT NULL DEFAULT '{}'::jsonb;
  `);

  await pool.query(`
    ALTER TABLE agenda_items
      ADD COLUMN IF NOT EXISTS title_i18n   JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS lead_i18n    JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS ort_i18n     JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS content_i18n JSONB NOT NULL DEFAULT '{}'::jsonb;
  `);

  await pool.query(`
    ALTER TABLE journal_entries
      ADD COLUMN IF NOT EXISTS title_i18n   JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS content_i18n JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS footer_i18n  JSONB NOT NULL DEFAULT '{}'::jsonb;
  `);

  await migrateHashtagShape("agenda_items");
  await migrateHashtagShape("journal_entries");

  // Sprint 5: locale-specific URL slugs for projekte.
  // slug_de ist der immutable canonical-ID, referenziert von agenda/journal
  // hashtags. slug_fr ist optional; bei null rendert /fr/projekte/<slug_de>
  // mit DE-Fallback-Content.
  await pool.query(`
    ALTER TABLE projekte
      ADD COLUMN IF NOT EXISTS slug_de TEXT,
      ADD COLUMN IF NOT EXISTS slug_fr TEXT;
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS projekte_slug_de_unique ON projekte (slug_de);
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS projekte_slug_fr_unique ON projekte (slug_fr)
      WHERE slug_fr IS NOT NULL;
  `);

  // slug_de SET NOT NULL ist idempotent — fresh DBs bekommen slug_de via
  // Dashboard-POST/Seed direkt, Prod hat alle Rows via PR 1-Backfill befüllt.
  await pool.query(`ALTER TABLE projekte ALTER COLUMN slug_de SET NOT NULL;`);

  // Cleanup-Finalize (PR 2): Legacy-i18n-ersetzte Columns droppen.
  // Voraussetzung: App-Code liest seit PR #59 nur noch i18n-Spalten,
  // Pre-Deploy-Sanity-Query bestätigt alle Rows i18n-populated, Backup
  // auf hd-server:/backup/alit-pre-cleanup-legacy-drop-2026-04-17.dump.
  // IF EXISTS macht Re-Boot + fresh-DB-Boot idempotent.
  await pool.query(`
    ALTER TABLE agenda_items
      DROP COLUMN IF EXISTS titel,
      DROP COLUMN IF EXISTS lead,
      DROP COLUMN IF EXISTS ort,
      DROP COLUMN IF EXISTS beschrieb,
      DROP COLUMN IF EXISTS content;
  `);
  await pool.query(`
    ALTER TABLE journal_entries
      DROP COLUMN IF EXISTS title,
      DROP COLUMN IF EXISTS lines,
      DROP COLUMN IF EXISTS footer,
      DROP COLUMN IF EXISTS content;
  `);
  await pool.query(`
    ALTER TABLE projekte
      DROP COLUMN IF EXISTS slug,
      DROP COLUMN IF EXISTS titel,
      DROP COLUMN IF EXISTS kategorie,
      DROP COLUMN IF EXISTS paragraphs,
      DROP COLUMN IF EXISTS content,
      DROP COLUMN IF EXISTS external_url;
  `);
  await pool.query(`
    ALTER TABLE alit_sections
      DROP COLUMN IF EXISTS title,
      DROP COLUMN IF EXISTS content;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS site_settings (
      key        TEXT PRIMARY KEY,
      value      TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // CITEXT gives native case-insensitive UNIQUE; app still normalizes via
  // normalizeEmail() so a TEXT fallback (no extension privileges) is safe.
  try {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS citext;`);
  } catch {
    // non-superuser installs can't create extensions — app-layer lowercase carries uniqueness
  }

  const emailType = await pool
    .query(`SELECT 1 FROM pg_type WHERE typname = 'citext'`)
    .then((r) => (r.rowCount ? "CITEXT" : "TEXT"))
    .catch(() => "TEXT");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS memberships (
      id                 SERIAL PRIMARY KEY,
      vorname            TEXT NOT NULL,
      nachname           TEXT NOT NULL,
      strasse            TEXT NOT NULL,
      nr                 TEXT NOT NULL,
      plz                TEXT NOT NULL,
      stadt              TEXT NOT NULL,
      email              ${emailType} NOT NULL UNIQUE,
      newsletter_opt_in  BOOLEAN NOT NULL DEFAULT false,
      consent_at         TIMESTAMPTZ NOT NULL,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ip_hash            TEXT
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS memberships_created_at_idx
      ON memberships (created_at DESC, id DESC);
  `);

  // Additive migration: track paid status so the Verein doesn't have to
  // maintain a parallel external spreadsheet. `paid` is the authoritative
  // flag; `paid_at` is stamped on OFF→ON transitions and preserved on
  // untoggle ("zuletzt bezahlt"-Semantik — untoggle ist versehentlich-
  // rückgängig-machbar, Original-Timestamp bleibt sichtbar). Audit-Trail
  // lebt in audit_events via `membership_paid_toggle`.
  await pool.query(`
    ALTER TABLE memberships
      ADD COLUMN IF NOT EXISTS paid    BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
  `);

  // Audit events — secondary, queryable store for events that auditLog()
  // already writes to stdout. Stdout stays the first-source-of-truth so a
  // DB-outage never loses events; the Dashboard uses this table for the
  // per-row history view introduced alongside the membership paid-toggle.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_events (
      id           SERIAL PRIMARY KEY,
      event        TEXT NOT NULL,
      actor_email  TEXT,
      entity_type  TEXT,
      entity_id    INTEGER,
      details      JSONB NOT NULL DEFAULT '{}'::jsonb,
      ip           TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS audit_events_entity_idx
      ON audit_events (entity_type, entity_id, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS audit_events_event_idx
      ON audit_events (event, created_at DESC);
  `);

  // Sprint B — Cookie-Migration observability counter. Bumped once per
  // authenticated request (see src/lib/cookie-counter.ts). Dropped in
  // Sprint C once the flip criterion is satisfied.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_method_daily (
      date    DATE    NOT NULL,
      source  TEXT    NOT NULL,
      env     TEXT    NOT NULL,
      count   INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (date, source, env)
    );
  `);

  // Sprint T1-S — env-scoped session-version counter. Logout bumps
  // token_version per (user_id, env); login reads the current value into
  // the JWT `tv` claim; requireAuth + dashboard/layout.tsx verify the JWT
  // claim matches the DB value. Env-scope prevents a staging-logout from
  // invalidating prod sessions (staging + prod share admin_users).
  // Missing row = treated as tv=0, keeps legacy JWTs without tv claim
  // valid until the next logout.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_session_version (
      user_id       INT NOT NULL,
      env           TEXT NOT NULL,
      token_version INT NOT NULL DEFAULT 0,
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, env)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS newsletter_subscribers (
      id          SERIAL PRIMARY KEY,
      vorname     TEXT NOT NULL,
      nachname    TEXT NOT NULL,
      woher       TEXT NOT NULL,
      email       ${emailType} NOT NULL UNIQUE,
      consent_at  TIMESTAMPTZ NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ip_hash     TEXT,
      source      TEXT NOT NULL CHECK (source IN ('form','membership'))
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS newsletter_subscribers_created_at_idx
      ON newsletter_subscribers (created_at DESC, id DESC);
  `);

  // Sprint: Newsletter-Signup auf Discours-Agités-Projekt — zwei neue Spalten
  // auf projekte. Flag aktiviert die Signup-Section auf der Public-Projekt-
  // Seite; JSONB speichert den per-Locale editierbaren Intro-Text (full-object
  // write semantics — Partial-PUT gilt nur auf Top-Level, nicht nested).
  await pool.query(`
    ALTER TABLE projekte
      ADD COLUMN IF NOT EXISTS show_newsletter_signup BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS newsletter_signup_intro_i18n JSONB;
  `);

  // One-time slug-typo fix: discours-agits → discours-agites. Idempotent
  // via WHERE-Clause (second run matches 0 rows). Verified 0 hashtag-refs
  // to the typo slug, but the old slug was a live URL — a route-handler
  // at /[locale]/projekte/discours-agits/ provides a 308 redirect to
  // preserve bookmarks + cached crawls + shared-DB deploy-window resilience.
  await pool.query(`
    UPDATE projekte SET slug_de = 'discours-agites', updated_at = NOW()
    WHERE slug_de = 'discours-agits';
  `);

  await migrateAgendaDatetime();

  // Sprint: ort_url optional machen. Bestehender CREATE TABLE oben hat
  // `ort_url TEXT NOT NULL` — neue Einträge sollen keinen Pflicht-URL mehr
  // brauchen. Idempotent via PG: DROP NOT NULL auf einer bereits-nullable
  // Spalte ist ein No-Op + loggt keine Warnung.
  await pool.query(`
    ALTER TABLE agenda_items ALTER COLUMN ort_url DROP NOT NULL;
  `);

  await restoreSortOrderContinuity();
}

/**
 * Sprint: D&D-Sortierung für alle 4 Tabs zurückbringen.
 *
 * Zwischen PR #102 (D&D entfernt) und diesem PR liefen die Dashboard-Listen
 * für agenda_items, journal_entries, projekte auf anderen ORDER-BYs
 * (datum DESC / created_at DESC). Bestehende `sort_order`-Werte stammen
 * aus der Zeit davor und spiegeln nicht mehr den aktuellen sichtbaren
 * Zustand — ein direkter Switch auf `ORDER BY sort_order` würde den Admin
 * nach Deploy mit einer veralteten Reihenfolge konfrontieren.
 *
 * Diese Migration renumeriert `sort_order` pro Tabelle so, dass die
 * Reihenfolge NACH dem Switch der GET-Queries der Reihenfolge VOR dem
 * Switch entspricht. Alit wird nicht angefasst, weil dort die `sort_order`-
 * Kontinuität ohnehin erhalten blieb.
 *
 * Idempotenz via marker-row in `site_settings`: zweiter Boot matched die
 * key-lookup und skipped den UPDATE-Block. Jede Tabelle hat einen eigenen
 * marker, damit ein selektives Rerun (z.B. nach Bug-Fix) möglich wäre,
 * ohne die anderen Tabellen zu touchen.
 */
async function restoreSortOrderContinuity() {
  const tables: Array<{
    key: string;
    table: string;
    // SQL ORDER BY expression that represents the current pre-switch visual
    // order. Rows are numbered by this ordering; the numbering policy
    // (ASC / DESC assignment) matches the target display direction.
    sourceOrder: string;
    // "asc" → sort_order = rn-1 (top of visual list = sort_order 0)
    // "desc" → sort_order = N-rn (top of visual list = highest sort_order)
    targetDirection: "asc" | "desc";
  }> = [
    {
      key: "migration_sort_order_restore_v1_agenda",
      table: "agenda_items",
      sourceOrder:
        "CASE WHEN datum ~ '^\\d{2}\\.\\d{2}\\.\\d{4}$' THEN TO_DATE(datum, 'DD.MM.YYYY') END DESC NULLS LAST, zeit DESC, id DESC",
      targetDirection: "desc",
    },
    {
      key: "migration_sort_order_restore_v1_journal",
      table: "journal_entries",
      sourceOrder: "created_at DESC, id DESC",
      targetDirection: "desc",
    },
    {
      key: "migration_sort_order_restore_v1_projekte",
      table: "projekte",
      sourceOrder: "created_at DESC, id DESC",
      targetDirection: "asc",
    },
  ];

  for (const t of tables) {
    // Check marker first without writing — we only want to know if the
    // migration already ran. Writing the marker is deferred to a single
    // transaction with the UPDATE below (Codex R1 [P2]): if the process
    // crashes between marker-insert and renumbering, the old sequencing
    // would skip the migration forever on reboot with stale sort_orders
    // in prod. Atomic: either both happen or neither does.
    const existing = await pool.query(
      "SELECT 1 FROM site_settings WHERE key = $1",
      [t.key],
    );
    if ((existing.rowCount ?? 0) > 0) continue;

    const expr =
      t.targetDirection === "asc"
        ? `rn - 1`
        : `(SELECT COUNT(*) FROM ${t.table}) - rn`;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const res = await client.query(
        `UPDATE ${t.table} AS tgt
           SET sort_order = src.new_sort_order
           FROM (
             SELECT id,
                    ${expr} AS new_sort_order
             FROM (
               SELECT id, ROW_NUMBER() OVER (ORDER BY ${t.sourceOrder}) AS rn
               FROM ${t.table}
             ) s
           ) src
           WHERE tgt.id = src.id`,
      );
      // ON CONFLICT protects against a second boot racing in between the
      // SELECT and this INSERT — the transaction still commits its UPDATE,
      // and the marker insert is a no-op if one already exists.
      await client.query(
        `INSERT INTO site_settings (key, value) VALUES ($1, '1')
         ON CONFLICT (key) DO NOTHING`,
        [t.key],
      );
      await client.query("COMMIT");
      console.log(
        "[sort-order-restore] %s: renumbered %d rows (direction=%s)",
        t.table,
        res.rowCount ?? 0,
        t.targetDirection,
      );
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}

/**
 * Sprint: Agenda Datum + Uhrzeit vereinheitlichen.
 * Scannt agenda_items und normalisiert off-spec zeit-Werte auf das
 * canonical "HH:MM Uhr"-Format. Datum wird nur geprüft + gewarnt, nicht
 * automatisch umgeschrieben (per Spec — kein normalizeLegacyDatum).
 * Idempotent: zweiter Run UPDATEt 0 Rows, weil alle bereits canonical.
 * Partial-Success: eine nicht parse-bare Row (z.B. zeit="am Abend")
 * wird geloggt + unverändert gelassen, andere Rows werden migriert.
 */
async function migrateAgendaDatetime() {
  // Lazy import to keep the ensureSchema module edge-safe (agenda-datetime
  // is pure but the boot chain should stay explicit about dependencies).
  const { isCanonicalDatum, isCanonicalZeit, normalizeLegacyZeit } =
    await import("./agenda-datetime");

  const { rows } = await pool.query<{ id: number; datum: string; zeit: string }>(
    "SELECT id, datum, zeit FROM agenda_items",
  );

  let normalized = 0;
  let skipped = 0;
  for (const row of rows) {
    const datumCanonical = isCanonicalDatum(row.datum);
    if (!datumCanonical) {
      console.warn(
        "[agenda-migration] row %d datum=%s not canonical, manual fix required",
        row.id,
        row.datum,
      );
      skipped++;
    }

    if (!isCanonicalZeit(row.zeit)) {
      const fixed = normalizeLegacyZeit(row.zeit);
      if (fixed === null) {
        console.warn(
          "[agenda-migration] row %d zeit=%s could not be normalized, manual fix required",
          row.id,
          row.zeit,
        );
        skipped++;
      } else {
        await pool.query("UPDATE agenda_items SET zeit = $1 WHERE id = $2", [
          fixed,
          row.id,
        ]);
        normalized++;
      }
    }
  }

  console.log(
    "[agenda-migration] scanned %d rows, normalized %d, skipped %d",
    rows.length,
    normalized,
    skipped,
  );
}
