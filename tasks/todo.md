# Sprint: PR 2 — DROP 16 Legacy-Columns
<!-- Spec: tasks/spec.md v1 -->
<!-- Started: 2026-04-17 -->

## Pre-Deploy ✅
- [x] Backfill-Sanity-Query auf Prod (0 empty i18n-Felder außer intentional-optional)
- [x] pg_dump -Fc Backup: hd-server:/backup/alit-pre-cleanup-legacy-drop-2026-04-17.dump (14 MB)

## Schema.ts Cleanup

### CREATE TABLE initial-Blöcke bereinigen
- [ ] `agenda_items`: titel/ort/beschrieb aus CREATE TABLE raus (keine NOT NULL mehr)
- [ ] `journal_entries`: title/lines/content/footer aus CREATE TABLE raus
- [ ] `projekte`: slug/titel/kategorie/paragraphs aus CREATE TABLE raus (slug_de ist canonical)
- [ ] `alit_sections`: title/content aus CREATE TABLE raus

### ALTER ADD COLUMN entfernen (waren später-added legacy-extensions)
- [ ] `agenda_items.content` + `.lead` ALTER-Statements raus
- [ ] `journal_entries.content` ALTER-Statement raus
- [ ] `projekte.content` ALTER-Statement raus

### Backfill-Blöcke entfernen
- [ ] alit_sections backfill (SELECT title, content)
- [ ] projekte backfill (SELECT titel, kategorie, paragraphs, content)
- [ ] agenda_items backfill (SELECT titel, lead, ort, beschrieb, content)
- [ ] journal_entries backfill (SELECT title, lines, images, content, footer)
- [ ] projekte slug→slug_de UPDATE-Statement

### DROP NOT NULL aus PR #59 entfernen
- [ ] agenda_items titel/ort + projekte slug/titel/kategorie (werden ja gleich gedroppt)

### Neuer DROP-COLUMN-Block
- [ ] 4× ALTER TABLE ... DROP COLUMN IF EXISTS für 16 Columns

## Tests + Build
- [ ] 165/165 grün
- [ ] pnpm build clean

## Staging
- [ ] **S1 Schema \d+** — keine Legacy-Columns
- [ ] **S2 Public-Routes** 200 mit Content
- [ ] **S3 Dashboard-CRUD** 4 Entities (Create/Edit/Delete)
- [ ] **S4 Container-Restart** clean boot
- [ ] **S5 Row-Counts** unverändert

## Prod
- [ ] Merge + gh run watch grün
- [ ] `/api/health/` 200
- [ ] **S6 Prod S1-S4 analog**
- [ ] **S7 24h Log-Soak**: `grep -i "error|column does not exist"` → 0
- [ ] **S8 Backup-Readability** via pg_restore --list

## Rollback-Runbook (nur bei Blow-up)
- Siehe spec.md "Rollback-Runbook"
- pg_restore aus /backup/alit-pre-cleanup-legacy-drop-2026-04-17.dump

## Notes

- Irreversibel auf Prod, Backup existiert.
- Alle App-Code-Pfade seit PR #59 frei von Legacy-Reads (verifiziert: 6h Prod-Soak clean).
- Nur 1 File touched (schema.ts). Kleiner Change-Surface trotz großer Scope (16 Columns).
