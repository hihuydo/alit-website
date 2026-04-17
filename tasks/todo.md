# Sprint: Cleanup-Sprint — Legacy-Spalten droppen
<!-- Spec: tasks/spec.md v1 -->
<!-- Started: 2026-04-17 -->

## Done-Kriterien

### Phase 1 — Collision-Check blocker
- [ ] `projekte/route.ts` Collision-SELECT: `slug = ANY($1)` raus, nur `slug_de` + `slug_fr`
- [ ] Return-Row-Analyse entsprechend angepasst

### Phase 2 — Dual-Write aus Handlern raus (8 Routes)
- [ ] `agenda POST` (`titel, lead, ort, beschrieb, content` aus INSERT)
- [ ] `agenda PUT [id]`
- [ ] `journal POST` (`title, lines, content, footer`)
- [ ] `journal PUT [id]`
- [ ] `projekte POST` (`slug, titel, kategorie, paragraphs, content`)
- [ ] `projekte PUT [id]`
- [ ] `alit POST` (`title, content`)
- [ ] `alit PUT [id]`
- [ ] `pickLegacyString` / `pickLegacyContent` Helper: Grep-check + löschen wenn ungenutzt

### Phase 3 — Seed i18n-only (`src/lib/seed.ts`)
- [ ] agendaItems INSERT: nur i18n-Spalten
- [ ] journalEntries INSERT: nur i18n-Spalten
- [ ] projekte INSERT: kein legacy slug/titel/kategorie/paragraphs
- [ ] alitSections INSERT: kein legacy title/content, schreibt direkt title_i18n + content_i18n

### Phase 4 — Schema-Migration (`src/lib/schema.ts`)
- [ ] Backfill-Block alit_sections entfernt (lines 181-193)
- [ ] Backfill-Block projekte entfernt (lines 209-246)
- [ ] Backfill-Block agenda_items entfernt (lines 255-298)
- [ ] Backfill-Block journal_entries entfernt (lines 310-351)
- [ ] Slug-Preflight-Check entfernt (lines 362-371)
- [ ] CREATE TABLE `agenda_items` i18n-native (kein `titel, ort, beschrieb` in initial-CREATE)
- [ ] CREATE TABLE `journal_entries` i18n-native
- [ ] CREATE TABLE `projekte` i18n-native (slug_de UNIQUE NOT NULL statt legacy slug)
- [ ] CREATE TABLE `alit_sections` i18n-native
- [ ] DROP-COLUMN-Block idempotent + IF EXISTS für alle 16 Legacy-Spalten

### Phase 5 — Type-Cleanup
- [ ] `AgendaItemData` in `src/components/AgendaItem.tsx`: legacy DB-Fields raus
- [ ] Dashboard `AgendaItem` in `AgendaSection.tsx`
- [ ] Dashboard Journal-Editor-Types
- [ ] Dashboard ProjekteSection Types
- [ ] Dashboard AlitSection Types
- [ ] Seed-Source-Types in `src/content/*.ts` bleiben (sind Input-Shapes)

### Tests + Build
- [ ] Bestehende 165 Tests grün
- [ ] Neuer Test: Schema-Idempotenz (`ensureSchema()` 2× no-error)
- [ ] `pnpm test` grün
- [ ] `pnpm build` grün

### Manuelle Smoke-Tests (Staging)
- [ ] **S1 Schema-State** — `\d+ agenda_items` / projekte / journal_entries / alit_sections → keine legacy-Spalten
- [ ] **S2 Public-Routes** — /de/, /de/projekte/<slug>/, /fr/projekte/<slug>/, /de/alit/ — alle 200
- [ ] **S3 Dashboard-CRUD** — je Create/Edit/Delete für Agenda/Journal/Projekte/Alit
- [ ] **S4 Idempotenz** — Container-Restart, keine DB-Errors
- [ ] **S5 SEO-Routes** — /sitemap.xml hat Projekte, /robots.txt korrekt
- [ ] **S6 DB-Daten-Sanity** — COUNT unverändert pre/post deploy

### Prod-Deploy (manuell, extra Schritte)
- [ ] **Pre-Deploy-Backup**: `pg_dump -Fc` auf Hetzner, File >10KB
- [ ] **Pre-Deploy-Backfill-Check**: 0 rows mit `title_i18n = '{}'::jsonb` auf allen 4 Tabellen
- [ ] **S7 Backup existiert**
- [ ] **S8 Prod S1-S6 analog**
- [ ] `docker compose logs` clean nach Deploy

## Phases

### Phase 1 — Collision-Check säubern
- [ ] projekte/route.ts Collision-SELECT

### Phase 2 — Dual-Write entfernen
- [ ] 8 Routes anpassen
- [ ] Helper aufräumen

### Phase 3 — Seed umbauen
- [ ] seed.ts auf i18n-only

### Phase 4 — Schema migriert
- [ ] Backfill-Blöcke raus
- [ ] CREATE TABLE i18n-native
- [ ] DROP-COLUMN-Block

### Phase 5 — Types
- [ ] 4 Dashboard-Sections + public AgendaItem

### Phase 6 — Verify + Ship
- [ ] pnpm test + build
- [ ] Commit → Sonnet
- [ ] **Codex spec-evaluieren** (Large/irreversible)
- [ ] Push → pre-push Sonnet
- [ ] PR → Codex Review (max 3 Runden)
- [ ] Staging Smoke S1-S6
- [ ] Manual Prod-Backup + Backfill-Check
- [ ] Merge → Prod-Verify S7-S8

## Notes

- Irreversibel auf Prod. Opus darf nicht "fertig" melden ohne manuelle Pre-Deploy-Backup + Backfill-Check.
- Site ist mostly-seed → Re-Seed-Recovery möglich. "Ruhige Deploy-Woche" = jetzt.
- Images (agenda_items + journal_entries) bleiben — nicht i18n, Reader benutzt sie.
- Seed-Source-Types (`src/content/*.ts`) bleiben — Plain-Types wie `{titel, kategorie, ...}` als Input für Seed-Transformer. Nur Dashboard + Public Types droppen Legacy-Felder.
- Reihenfolge P1→P2→P3→P4 ist stringent: P4 löscht Spalten, die P2+P3 noch schreiben würden. Nie umdrehen.
