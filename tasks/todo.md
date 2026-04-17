# Sprint: Cleanup-Prep (PR 1) — Legacy-Reader-Elimination + Dual-Write-Removal
<!-- Spec: tasks/spec.md v2 -->
<!-- Started: 2026-04-17 -->
<!-- Strategie: SPLIT nach Codex — PR 1 = Prep/Soak (App-Code), PR 2 = DROP COLUMN (DB) -->

## Done-Kriterien

### A — Legacy-Reader-Elimination (neu identifiziert durch Codex)
- [ ] `src/lib/agenda-hashtags.ts`: beide Validator-SELECTs `slug` → `slug_de`
- [ ] `src/lib/media-usage.ts`: 3 SELECTs, `title_i18n->>'de'` + `content_i18n::text`
- [ ] `src/app/api/dashboard/journal/migrate/route.ts`: **Datei löschen**
- [ ] `src/app/dashboard/components/JournalSection.tsx`: "Migrate"-Button/Call entfernen (wenn vorhanden)
- [ ] `src/lib/queries.ts::getProjekte()`: `paragraphs` aus SELECT
- [ ] `src/lib/queries.ts::Projekt` Type: `paragraphs` raus
- [ ] `src/components/ProjekteList.tsx`: `p.paragraphs`-Fallback raus (nur `p.content`)
- [ ] `src/lib/journal-types.ts::DashboardJournalEntry`: Legacy-Fields raus
- [ ] `src/app/dashboard/components/JournalEditor.tsx::initialPerLocale`: Legacy-Fallback raus
- [ ] Dashboard-GET (agenda/journal/projekte): explizite Spalten-Liste statt `SELECT *` (falls nötig)

### B — Projekte Collision-Check säubern
- [ ] `projekte/route.ts` Collision-SELECT: `slug = ANY` raus, nur `slug_de` + `slug_fr`
- [ ] Row-Analyse: `row.slug` droppen

### C — Dual-Write entfernen (8 Routes)
- [ ] `agenda POST`: kein `titel, lead, ort, beschrieb, content` mehr
- [ ] `agenda PUT [id]`
- [ ] `journal POST`: kein `title, lines, content, footer` mehr
- [ ] `journal PUT [id]`
- [ ] `projekte POST`: kein `slug, titel, kategorie, paragraphs, content` mehr
- [ ] `projekte PUT [id]`
- [ ] `alit POST`: kein `title, content` mehr
- [ ] `alit PUT [id]`
- [ ] `pickLegacyString` / `pickLegacyContent` Helper: Grep-check + löschen wenn ungenutzt

### D — Seed i18n-only (`src/lib/seed.ts`)
- [ ] agendaItems INSERT: nur i18n-Spalten + Metadaten
- [ ] journalEntries INSERT: nur i18n-Spalten + Metadaten
- [ ] projekte INSERT: kein legacy slug/titel/kategorie/paragraphs/content
- [ ] alitSections INSERT: schreibt direkt title_i18n + content_i18n

### E — Type-Cleanup (Dashboard-Types)
- [ ] AgendaSection DB-Type: Legacy-Fields raus
- [ ] ProjekteSection DB-Type: Legacy-Fields raus (inkl. `slug`, `titel`, `kategorie`, `paragraphs`, `content`)
- [ ] AlitSection DB-Type: Legacy-Fields raus
- [ ] JournalSection (via `journal-types.ts`) — bereits in A abgedeckt

### F — NICHT in diesem PR (kommt in PR 2)
- [ ] ~~DROP COLUMN Migration~~
- [ ] ~~schema.ts CREATE TABLE i18n-native rewrite~~
- [ ] ~~Backfill-Block entfernen~~
- [ ] ~~Slug-Preflight-Check entfernen~~
- [ ] ~~Pre-Deploy-Backup-Runbook~~

### Tests + Build
- [ ] Bestehende 165 Tests grün
- [ ] `pnpm test` grün
- [ ] `pnpm build` grün
- [ ] **Legacy-Grep-Check (P1-Guard)**: `rg "\.title\b|\.titel\b|\.paragraphs\b|\.lines\b|\.beschrieb\b|\.kategorie\b" src/ --ignore-dir=content` — Audit: keine Legacy-DB-Reads mehr (resolved-reader-fields OK, DB-row access NOT OK)

### Manuelle Smoke-Tests (Staging)
- [ ] **S1 Public-Routes** — /de/, /de/projekte/<slug>/, /fr/projekte/<slug>/, /de/alit/ → 200
- [ ] **S2 Hashtag-Links** — Agenda-Hashtag → /de/projekte/<slug>/ funktioniert
- [ ] **S3 Dashboard-CRUD** — je Create+Edit+Delete für Agenda/Journal/Projekte/Alit
- [ ] **S4 Media-Usage-Scan** — Test-Bild in Journal-Entry embedden, in Media-Tab als "verwendet in" sichtbar
- [ ] **S5 Legacy-Grep** — wie oben
- [ ] **S7 Projekte ohne paragraphs-Fallback** — verify rendering mit nur `content_i18n`-Source

### Post-Merge (PR 1 → PR 2 Gate)
- [ ] CI staging + prod grün
- [ ] **S6 24h-Log-Soak**: `docker logs alit-web | grep -i "error\|column"` — keine column-reference-errors
- [ ] Wenn S6 grün → PR 2 (DROP COLUMN) eröffnen als separater Sprint
- [ ] Wenn S6 Fehler: Hotfix in PR 1.1, Soak neu starten

## Phases

### Phase A — Legacy-Reader-Elimination
- [ ] agenda-hashtags, media-usage, journal/migrate, getProjekte, ProjekteList, journal-types, JournalEditor

### Phase B — Collision-Check + Dual-Write + Seed
- [ ] 8 Routes Dual-Write
- [ ] Collision-Check
- [ ] Seed

### Phase C — Type-Cleanup
- [ ] 3 Dashboard-Section-Types

### Phase D — Verify + Ship
- [ ] pnpm test + build
- [ ] Legacy-Grep-Check
- [ ] Commit → post-commit Sonnet
- [ ] Push → pre-push Sonnet
- [ ] PR → Codex Review (max 3 Runden)
- [ ] Staging S1–S5
- [ ] Merge → Prod S1–S4 + 24h-Soak S6

## Notes

- Split-Rationale von Codex: Soak zwischen PR 1 und PR 2 gibt Observation-Zeit, um versteckte Legacy-Reads in Prod-Logs zu fangen.
- Mostly-seed-Site macht Recovery einfach, aber dieselbe Split-Logik gilt: PR 1 rollbackable via git revert, PR 2 braucht pg_restore.
- Legacy-Reader-Surface (A) war initial unterschätzt — Codex hat 7 Consumer gefunden, Audit-Agent nur die Routes. Lesson: bei Migrationen immer cross-search nach Column-Namen, nicht nur nach Entity-Namen.
- Reihenfolge A → B → C → D ist locker (commits können gebündelt werden), aber jedes A/B/C-Item ist unabhängig testbar mit `pnpm build + test`.
