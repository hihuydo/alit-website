# Spec: PR 2 — DROP 16 Legacy-Columns (Cleanup-Finalize)
<!-- Created: 2026-04-17 -->
<!-- Author: Planner (Claude Opus 4.7) -->
<!-- Status: v1 implemented — schema.ts geshrinkt (4 Backfill-Blöcke + 4 Legacy-Column-Definitionen + 3 ALTER ADD + 5 DROP NOT NULL + slug-backfill entfernt), 4 DROP COLUMN Statements hinzugefügt, 2 orphan imports entfernt. 165/165 Tests, build clean. -->

## Summary

Finalisiert den Cleanup-Sprint: droppt die 16 Legacy-i18n-ersetzten Spalten aus der DB, entfernt die zugehörigen Backfill-Blöcke + NOT-NULL-Relaxations + Initial-CREATE-TABLE-Definitionen in `schema.ts`. Irreversible Prod-DB-Änderung. Rollback via pg_restore.

**Vorbereitung abgeschlossen:**
- PR #59 (Cleanup-Prep) hat App-Code von Legacy-Reads/Writes befreit — Prod hat ohne Fehler gestartet, Logs clean.
- PR #60 hat `external_url` separat entfernt.
- Pre-Deploy-Sanity-Query 2026-04-17 12:07: `title_i18n`/`content_i18n`/`ort_i18n`-Populationen auf Prod OK (null-Einträge nur für intentional-leere Felder wie title-lose Journal-Einträge).
- Prod-DB-Backup erstellt: `hd-server:/backup/alit-pre-cleanup-legacy-drop-2026-04-17.dump` (14 MB, pg_dump -Fc).

## Requirements

### Must Have (Sprint Contract)

1. **Schema.ts Cleanup — 5 Blöcke entfernen (Reihenfolge kritisch):**
   - **Block 1:** `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` für entfernte Legacy-Columns (Zeilen ~90-108: journal.content, agenda.content, agenda.lead) — nur die für zu-droppende Columns. `hashtags`/`images` sind keine Legacy, bleiben.
   - **Block 2:** Backfill `alit_sections` (Zeilen ~181-193) — SELECT `title` + `content` → UPDATE `title_i18n`/`content_i18n`.
   - **Block 3:** Backfill `projekte` (Zeilen ~209-246) — SELECT `titel, kategorie, paragraphs, content`.
   - **Block 4:** Backfill `agenda_items` (Zeilen ~255-298) — SELECT `titel, lead, ort, beschrieb, content`.
   - **Block 5:** Backfill `journal_entries` (Zeilen ~310-351) — SELECT `title, lines, images, content, footer`.
   - **Block 6 (Sub-block in projekte slug-Migration):** Das idempotente `UPDATE projekte SET slug_de = slug WHERE slug_de IS NULL OR slug_de = ''` (line ~391-393) — liest legacy `slug`. Muss raus, SONST Boot-Fehler nach DROP COLUMN slug.

2. **Schema.ts Cleanup — Initial-CREATE-TABLE bereinigen:**
   - `agenda_items` (Zeilen ~46-57): `titel TEXT NOT NULL, beschrieb JSONB ... '[]'` raus. `ort TEXT NOT NULL` raus. Fresh DBs erstellen direkt ohne Legacy-Felder.
   - `journal_entries` (Zeilen ~59-72): `title TEXT, lines JSONB ... '[]', content JSONB, footer TEXT` raus.
   - `projekte` (Zeilen ~74-85): `slug TEXT UNIQUE NOT NULL, titel TEXT NOT NULL, kategorie TEXT NOT NULL, paragraphs JSONB ... '[]'` raus.
   - `alit_sections` (Zeilen ~142-148): `title TEXT, content JSONB ... '[]'::jsonb` raus.

3. **Schema.ts Cleanup — idempotente ALTER-Statements entfernen:**
   - `ALTER TABLE agenda_items ADD COLUMN IF NOT EXISTS content JSONB` + `lead TEXT` (da legacy).
   - `ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS content JSONB` (legacy).
   - `ALTER TABLE projekte ADD COLUMN IF NOT EXISTS content JSONB` (legacy).
   - `images` / `hashtags` bleiben (nicht legacy).

4. **Schema.ts Cleanup — DROP NOT NULL-Statements aus PR #59 entfernen:**
   - Die 5 `ALTER COLUMN ... DROP NOT NULL`-Zeilen für titel/ort/slug/titel/kategorie sind ab jetzt obsolet, weil die Columns gedroppt werden.

5. **Neuer DROP-Block in schema.ts:**
   ```sql
   ALTER TABLE agenda_items
     DROP COLUMN IF EXISTS titel,
     DROP COLUMN IF EXISTS lead,
     DROP COLUMN IF EXISTS ort,
     DROP COLUMN IF EXISTS beschrieb,
     DROP COLUMN IF EXISTS content;

   ALTER TABLE journal_entries
     DROP COLUMN IF EXISTS title,
     DROP COLUMN IF EXISTS lines,
     DROP COLUMN IF EXISTS footer,
     DROP COLUMN IF EXISTS content;

   ALTER TABLE projekte
     DROP COLUMN IF EXISTS slug,
     DROP COLUMN IF EXISTS titel,
     DROP COLUMN IF EXISTS kategorie,
     DROP COLUMN IF EXISTS paragraphs,
     DROP COLUMN IF EXISTS content;

   ALTER TABLE alit_sections
     DROP COLUMN IF EXISTS title,
     DROP COLUMN IF EXISTS content;
   ```
   - Als separate Query-Aufrufe (pool.query) — DDL ist pro Statement auto-committed in PG.
   - `IF EXISTS` → Re-Boot ist safe.
   - Code-Kommentar erklärt: "PR 2 finale DROP. App-Code seit PR #59 frei von Legacy-Reads."

6. **Keine Code-Changes außerhalb schema.ts** — App-Reader, Writer, Types, Seed sind durch PR #59 + #60 bereits clean.

7. **Tests**: bestehende 165 grün. Build clean.

### Nice to Have (Follow-up → memory/todo.md)

- Schema-Idempotency-Test mit echter Test-DB (Testcontainers) — Infra-Sprint.
- Audit-Log für Schema-Migrations (stdout-only heute) — separater Sprint.

### Out of Scope

- Type-Cleanup im App-Code — bereits in PR #59.
- Docker-Rollback-Script — dokumentiert hier, wird nicht automatisiert.

## Technical Approach

### Files to Change

| File | Change Type | Description |
|------|-------------|-------------|
| `src/lib/schema.ts` | Modify | 4 Backfill-Blöcke raus, 1 projekte-slug-UPDATE raus, 4 CREATE-TABLE-Initial-Columns raus, 3 ALTER-ADD-COLUMN-Statements raus, 5 DROP-NOT-NULL raus, 1 neuer DROP-COLUMN-Block rein. |

**Nur 1 File touched.** Reduces surface, klares Diff.

### Architecture Decisions

- **Eine Migration pro Boot, idempotent via IF EXISTS**: Gleicher Pattern wie alle anderen Migrations. Rolling-Deploy-Window (alte App-Version noch running während neue bootet): alte App liest nur i18n-Columns → funktional OK. Alte App schreibt nicht in dropped columns → funktional OK. Kein Race.
- **Kein expliziter Transaction-Block um die 4 DROP-TABLE-Aufrufe**: DDL auto-committed, ein einzelner failedstatement lässt die anderen committed zurück. Das ist akzeptabel — IF EXISTS-Idempotenz heilt Re-Runs.
- **CREATE TABLE i18n-native für fresh DBs**: Initial-Schema ist "clean" — fresh Dev-DBs bekommen direkt nur i18n-Columns, ohne Legacy-Ballast. Ideal weil Sprint 1–5 Backfills post-seed nicht mehr nötig sind (seed schreibt i18n-only).

### Dependencies

- SSH + pg_dump Backup ist erledigt (14MB auf hd-server:/backup/).
- Pre-Deploy-Sanity-Check erledigt.

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| Re-Boot nach erfolgreichem DROP | `DROP COLUMN IF EXISTS` = no-op. Keine Errors. |
| Fresh DB (kein ALTER-Pfad durchlaufen) | `DROP COLUMN IF EXISTS` = no-op, weil CREATE TABLE ohne Legacy-Columns. ✓ |
| Prod-DB-Restore auf pre-cleanup-Backup | Legacy-Columns sind wieder da. Neuer Boot droppt sie erneut. Akzeptabel. |
| Concurrent Boot (2 Container starten gleichzeitig) | Jeder führt DROP aus, einer sieht Column noch, droppt. Anderer sieht sie schon weg, IF EXISTS macht no-op. PG concurrent-safe. |
| Rolling-Deploy: alte Version läuft + neue bootet + droppt Columns | Alte Version liest nur i18n (durch PR #59), schreibt nur i18n. Keine Abhängigkeit von Legacy. Keine Requests failed. |
| Boot-Fehler nach DROP (unerwarteter Foreign-Key) | Audit: keine FKs auf Legacy-Columns existent (überprüft via information_schema). Sollte nicht passieren. Fallback: pg_restore vom Backup. |

## Risks

- **P1 — Unerwartete Legacy-Reference in nicht-audit-tem Code**: Codex+Audit haben alle sichtbaren Pfade abgedeckt, aber ein dynamisch-konstruiertes SQL oder ein unbekannter Hook könnte noch legacy column-name referencen. Mitigation: **24h Post-Deploy Log-Soak** nach PR 2 Merge. Wenn keine "column does not exist"-Errors in Prod-Logs: alles gut.
- **P2 — Backup unleserlich bei Rollback-Bedarf**: pg_dump -Fc erstellt custom-format, kompatibel mit pg_restore. Verify-check: `pg_restore --list /backup/alit-pre-cleanup-legacy-drop-2026-04-17.dump | head` sollte lesbare Objekte zeigen.
- **P3 — Rollback-Zeit**: pg_restore auf 14MB-Dump = ~1-2 Minuten Downtime. Akzeptabel für Admin-Tool, nicht für E-Commerce (das wäre Alit nicht).

## Verification (Smoke Test Plan)

Nach Staging-Deploy:
1. **S1 Schema-State**: `\d+ agenda_items` / `journal_entries` / `projekte` / `alit_sections` → keine Legacy-Columns sichtbar.
2. **S2 Public-Routes rendern**: `/de/`, `/de/projekte/<slug>/`, `/fr/projekte/<slug>/`, `/de/alit/` alle 200 mit Content sichtbar.
3. **S3 Dashboard-CRUD**: 1× Create + 1× Edit + 1× Delete je Agenda/Journal/Projekte/Alit.
4. **S4 Container-Restart**: `docker compose restart alit-staging` → Boot clean, keine Errors.
5. **S5 Row-Count-Sanity**: `SELECT COUNT(*)` auf alle 4 Tabellen = Pre-Deploy-Counts (nur Schema-Change, keine Daten-Verlust).

Nach Prod-Deploy:
6. **S6 Prod S1-S4 analog**.
7. **S7 Log-Soak 24h**: `docker compose logs alit-web | grep -i "error|column does not exist"` → 0 matches.
8. **S8 Backup-Readability Check**: `pg_restore --list /backup/...dump | head` → saubere Object-Liste.

## Deploy & Verify

### Pre-Deploy ✅ (erledigt)
1. Backfill-Sanity-Query: Daten-Check OK.
2. Backup: `/backup/alit-pre-cleanup-legacy-drop-2026-04-17.dump` (14 MB).

### Staging
1. Branch push → auto-deploy.
2. `gh run watch` → green.
3. S1-S5 ausführen.

### Prod
1. PR merge.
2. `gh run watch` → green.
3. S6-S8 innerhalb 2h initial + 24h Log-Soak.

### Rollback-Runbook (nur bei Prod-Blow-up)

```bash
# 1. App stoppen
ssh hd-server 'cd /opt/apps/alit-website && docker compose stop alit-web'

# 2. Git revert (schließt DROP-Code aus, bringt ALTER-Statements zurück)
ssh hd-server 'cd /opt/apps/alit-website && git revert --no-edit <merge-commit-sha> && git push origin main'

# 3. DB restore aus Backup
ssh hd-server 'sudo -u postgres pg_restore --clean --if-exists -d alit /backup/alit-pre-cleanup-legacy-drop-2026-04-17.dump'

# 4. Verify
ssh hd-server 'sudo -u postgres psql alit -c "\d projekte" | grep -E "slug|titel"'
# Erwartet: Legacy-Columns wieder da.

# 5. App starten
ssh hd-server 'cd /opt/apps/alit-website && docker compose up -d alit-web'

# 6. Health check
curl -s https://alit.hihuydo.com/api/health/
```

Kommt nur zum Einsatz wenn 24h-Log-Soak Column-Errors zeigt. Erwartet: nicht nötig.
