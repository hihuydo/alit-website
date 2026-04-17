# Spec: Cleanup-Sprint — Legacy-Spalten droppen (4 Entities, i18n-only Reader)
<!-- Created: 2026-04-17 -->
<!-- Author: Planner (Claude Opus 4.7) -->
<!-- Status: v1 draft — pre-implementation -->

## Summary

Nach Sprints 1–5 sind alle 4 Content-Entities (`alit_sections`, `projekte`, `agenda_items`, `journal_entries`) auf JSONB-per-field i18n migriert. Reader lesen nur noch aus `*_i18n`-Spalten. Schreiber schreiben derzeit Dual-Write (legacy + i18n) als Rollback-Safety-Net.

Dieser Sprint droppt **16 Legacy-Spalten** across den 4 Tabellen, entfernt den Dual-Write-Code in den 8 POST/PUT-Routes, cleant das Seed, löscht die idempotenten Backfill-Blöcke + Slug-Preflight-Check in `schema.ts`, und aktualisiert die TypeScript-Types.

**Irreversibel auf Prod.** Kontext macht den Sprint aber jetzt möglich: Die Site besteht aktuell noch weitgehend aus Seed-Daten (Re-Seed-Recovery möglich) — die "ruhige Deploy-Woche"-Anforderung ist erfüllt.

Die Phase-1-Blockade aus der Audit (projekte-Collision-Check referenziert noch legacy `slug`) ist in diesem Sprint enthalten.

## Context

- **Sprint 1** (PR #33): `alit_sections` auf `title_i18n` + `content_i18n` migriert, DE-only Backfill.
- **Sprint 2** (PR #35): `projekte` auf `title_i18n` + `kategorie_i18n` + `content_i18n`, dazu `content` (legacy JSONB intermediate).
- **Sprint 3** (PR #36/37): `agenda_items` auf `title_i18n` + `lead_i18n` + `ort_i18n` + `content_i18n`, dazu Hashtag-Shape-Migration.
- **Sprint 4** (PR #38): `journal_entries` auf `title_i18n` + `content_i18n` + `footer_i18n`.
- **Sprint 5** (PR #42): `projekte.slug` → `slug_de` (immutable) + `slug_fr` (nullable). Legacy `slug` hält bisher als write-only Dual-Write.

Reader sind bereits i18n-only (audit-verifiziert):
- `getAgendaItems()` selektiert `datum, zeit, ort_url, hashtags, images, title_i18n, lead_i18n, ort_i18n, content_i18n`.
- `getJournalEntries()` selektiert `date, author, title_border, images, hashtags, title_i18n, content_i18n, footer_i18n`.
- `getProjekte()` selektiert `title_i18n, kategorie_i18n, content_i18n, slug_de, slug_fr` (plus Metadaten). Kein `slug` / `titel` / `kategorie` / `paragraphs` / `content`.
- `getAlitSections()` selektiert `title_i18n, content_i18n` (+ locale-Filter auf `'de'`).

**Images stays**: sowohl `agenda_items.images` als auch `journal_entries.images` sind NICHT i18n-legacy — sie halten Image-Metadaten (public_id, orientation, alt) und werden vom Reader konsumiert. Nicht gedroppt.

## Requirements

### Must Have (Sprint Contract)

1. **Phase 1 — Collision-Check säubern** (`src/app/api/dashboard/projekte/route.ts`):
   - SELECT-Clause umbauen: `slug_de = ANY($1) OR slug_fr = ANY($1) OR slug = ANY($1)` → `slug_de = ANY($1) OR slug_fr = ANY($1)`.
   - Return-Row-Analyse: `hit = [row.slug_de, row.slug_fr]` (kein `row.slug`).
   - Alles vor Phase 4 committen können, weil der Code bis DROP COLUMN noch ok läuft (legacy `slug` Spalte existiert noch, wird nur nicht mehr geprüft).

2. **Phase 2 — Dual-Write entfernen** aus allen POST/PUT-Handlern (8 Routes):
   - `POST /api/dashboard/agenda` + `PUT /api/dashboard/agenda/[id]`: kein `titel, lead, ort, beschrieb, content` mehr im INSERT/SET. `pickLegacyString` / `pickLegacyContent` Aufrufe entfernen.
   - `POST /api/dashboard/projekte` + `PUT /api/dashboard/projekte/[id]`: kein `slug, titel, kategorie, paragraphs, content` mehr. `slug_de` bleibt (neu, immutable).
   - `POST /api/dashboard/journal` + `PUT /api/dashboard/journal/[id]`: kein `title, lines, content, footer` mehr.
   - `POST /api/dashboard/alit` + `PUT /api/dashboard/alit/[id]`: kein `title, content` mehr.
   - Helper `pickLegacyString` / `pickLegacyContent` können gelöscht werden, wenn nicht anderweitig genutzt (Grep-Verifikation).

3. **Phase 3 — Seed-Schreiben i18n-only** (`src/lib/seed.ts`):
   - `agendaItems.forEach` INSERT: entfernt `titel, beschrieb` aus VALUES + Column-List. Schreibt nur `datum, zeit, ort, ort_url, sort_order, title_i18n, lead_i18n, ort_i18n, content_i18n, hashtags, images`.
     - Wait — `ort_url` NOT NULL, Seed-Data hat `ortUrl`. `ort` aus Seed (Plain-String) geht in `ort_i18n.de`. `titel` wird `title_i18n.de`.
   - `journalEntries.forEach` INSERT: nur `date, author, title_border, sort_order, title_i18n, content_i18n, footer_i18n, hashtags, images`.
   - `projekte.forEach` INSERT: kein `slug, titel, kategorie, paragraphs, content`. `slug_de` aus Seed. `title_i18n.de = seedEntry.titel`, etc.
   - `alitSections.forEach` INSERT: kein `title, content`. Seed schreibt `title_i18n + content_i18n` direkt (statt dem bisherigen "Seed writes legacy, backfill fills i18n"-Muster).
   - **Seed-Source-Types (in `src/content/…`) bleiben unverändert.** Seed transformiert die Plain-Types in i18n-JSONB beim INSERT.

4. **Phase 4 — Schema-Migration + Backfill-Cleanup** (`src/lib/schema.ts`):
   - **Schritt 4a (vor DROP COLUMN)**: Alle Backfill-Blöcke entfernen:
     - alit_sections Backfill (lines 181-193).
     - projekte Backfill (lines 209-246).
     - agenda_items Backfill (lines 255-298).
     - journal_entries Backfill (lines 310-351).
     - Slug-Preflight-Check (lines 362-371) — selektiert `slug` aus projekte, wird nach DROP COLUMN fehlschlagen.
   - **Schritt 4b — CREATE TABLE IF NOT EXISTS anpassen** für frische DBs:
     - `agenda_items` initial-CREATE ändert: kein `titel, ort, beschrieb` mehr in CREATE TABLE. `ort` und `titel` waren `NOT NULL` — auf einer frischen DB (keine ALTER-History) will der Code sie gar nicht erst. Analog für alle 4 Tabellen.
     - `projekte` initial-CREATE: kein `slug UNIQUE NOT NULL, titel NOT NULL, kategorie NOT NULL, paragraphs NOT NULL`. `slug_de` wird stattdessen UNIQUE NOT NULL in der CREATE gelegt (bisher via ALTER).
     - **Trade-off**: Die Backfill-Chain war idempotent — auf existierenden Prod-DBs schon durchgelaufen, kann entfernt werden. Auf frischen Dev/Staging-DBs muss die CREATE TABLE i18n-Spalten direkt enthalten (NOT NULL DEFAULT '{}'::jsonb). Alternativ: CREATE bleibt minimal + ALTER ADD COLUMN IF NOT EXISTS i18n-cols — funktional äquivalent, was idempotent.
   - **Schritt 4c — DROP COLUMN Idempotent**:
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
   - `DROP COLUMN IF EXISTS` droppt auch automatisch UNIQUE-Index auf `projekte.slug`. Kein separates `DROP INDEX`.
   - Reihenfolge: in **einer** Transaction committen (Pool.query für alles ATAC). Wenn eines fehlschlägt, rollback.

5. **Phase 5 — Type-Cleanup**:
   - `src/components/AgendaItem.tsx::AgendaItemData`: Remove `titel, lead, beschrieb`. Keep `title_i18n, lead_i18n, ort_i18n, content_i18n` (used by dashboard editor). Keep `ort`, `content` als **resolved output fields** (Reader produziert die aus i18n).
     - Sub-Task: Check alle Konsumenten der Type. Manche lesen `item.titel` — die auf `item.titel` via resolved-field-from-reader umstellen, oder Type bleibt bei `titel: string` (resolved), nur DB-Query schreibt nicht mehr in die Spalte.
   - `src/app/dashboard/components/AgendaSection.tsx::AgendaItem`: Remove `titel, lead, beschrieb, content`-DB-Shape-Fields. Behalten: `title_i18n, lead_i18n, ort_i18n, content_i18n`.
   - `src/lib/queries.ts::Projekt`: verify kein `slug, titel, kategorie, paragraphs` in Type.
   - `src/content/agenda.ts`, `src/content/projekte.ts`, `src/content/de/journal/entries.ts`, `src/content/de/alit.ts` — Seed-Source-Types bleiben. Aber: Seed-Code in `seed.ts` liest diese Types und transformiert in i18n.
   - Falls irgendwo `item.titel`/`item.ort`/`entry.title`/… als DB-read verwendet wird (nicht resolved), das auf resolved-field via Reader umstellen. Audit-Agent fand keine solchen Reads in Prod-Code. Nur Dashboard-Form-State hat legacy-Feldnamen — die sind entkoppelt vom DB-Schema und brauchen die Felder nicht.

6. **Tests**:
   - Bestehende 165 Tests grün.
   - **Neuer Test**: Schema-Idempotenz. `src/lib/schema-idempotent.test.ts` — call `ensureSchema()` zweimal, kein Fehler. (Unit-Test, mit pg-mock oder realer Test-DB.)
   - **Manueller Smoke-Test auf Staging + Prod**: beide alle 4 Entities CRUD-fähig (POST/PUT/GET/DELETE), Public-Routes rendern alle Contents.

7. **`pnpm test` + `pnpm build` grün.**

### Nice to Have (Follow-up → memory/todo.md)

- Slug-Rename-Feature (via History-Table) bleibt out-of-scope (eigenes Feature, nicht Cleanup).
- Audit-Logging für `slug_fr`-Mutationen (siehe memory/todo.md) — eigener Sprint.
- Server-side Version-Guard für Autosave (siehe memory/todo.md) — eigener Sprint.

### Out of Scope

- **DB-Backup-Restore-Drill**: Prod-DB-Dump wird als manueller Vor-Deploy-Schritt im Sprint gemacht, nicht automatisiert.
- **Change-Data-Capture / Rollback-Plan**: Wenn DROP fehlschlägt oder Post-Deploy-Bug auftaucht, ist Rollback = DB-Restore aus Backup. Kein DB-Schema-Downgrade (Legacy-Spalten sind auf Prod bereits fast leer / redundant — Re-Hydration erfordert Backup-Restore, kein magisches Re-Populate).
- **App-Code-Downgrade**: Git revert funktioniert weil Schema-Änderung additive-resistant ist — alter Code mit neuen Spalten läuft, aber ohne legacy-Columns 500. Also: revert + DB-restore.

## Technical Approach

### Files to Change

| File | Phase | Change Type | Description |
|------|-------|-------------|-------------|
| `src/app/api/dashboard/projekte/route.ts` | 1 | Modify | Collision-Check SELECT: `slug` raus. |
| `src/app/api/dashboard/agenda/route.ts` | 2 | Modify | POST: `titel, lead, ort, beschrieb, content` raus aus INSERT. |
| `src/app/api/dashboard/agenda/[id]/route.ts` | 2 | Modify | PUT: Dual-Write SET-Clauses raus. |
| `src/app/api/dashboard/journal/route.ts` | 2 | Modify | POST-Handler analog. |
| `src/app/api/dashboard/journal/[id]/route.ts` | 2 | Modify | PUT-Handler analog. |
| `src/app/api/dashboard/projekte/route.ts` | 2 | Modify | POST-Handler analog. |
| `src/app/api/dashboard/projekte/[id]/route.ts` | 2 | Modify | PUT-Handler analog. |
| `src/app/api/dashboard/alit/route.ts` | 2 | Modify | POST + `pickLegacy*` drop. |
| `src/app/api/dashboard/alit/[id]/route.ts` | 2 | Modify | PUT analog. |
| `src/lib/i18n-helpers.ts` (oder wo `pickLegacyString`/`pickLegacyContent` liegen) | 2 | Modify/Delete | Ungenutzte Helper löschen. |
| `src/lib/seed.ts` | 3 | Modify | INSERTs i18n-only, keine Legacy-Cols. |
| `src/lib/schema.ts` | 4 | Modify | Backfill-Blöcke + Slug-Preflight raus. DROP-COLUMN-Block hinzufügen. CREATE TABLE i18n-native. |
| `src/components/AgendaItem.tsx` | 5 | Modify | `AgendaItemData` Type: legacy DB-Fields raus. |
| `src/app/dashboard/components/AgendaSection.tsx` | 5 | Modify | `AgendaItem` Type analog. |
| `src/app/dashboard/components/JournalSection.tsx` (oder `journal-editor-types.ts`) | 5 | Modify | Type analog. |
| `src/app/dashboard/components/ProjekteSection.tsx` | 5 | Modify | Type analog. |
| `src/app/dashboard/components/AlitSection.tsx` | 5 | Modify | Type analog. |
| `src/lib/schema-idempotent.test.ts` | 6 | New | Unit-Test für Schema-Idempotenz. |

### Architecture Decisions

- **Eine Migration, eine Transaction**: Alle DROP COLUMNs in einem `ensureSchema()`-Call, sequentiell (keine Transaction wegen DDL-Komplexität in pg-pool, aber monotone Reihenfolge). `IF EXISTS` macht jeden Step idempotent — Re-Boot ist safe.
- **Phase 1 vs Phase 4 Trennung**: Phase 1 (Collision-Check) könnte technisch auch in Phase 4 laufen, wird aber früh gemacht — falls der DROP COLUMN aus irgendeinem Grund am Boot fehlschlägt, soll der Collision-Check nicht mehr auf der nicht-existenten Spalte SELECTen.
- **Backfill-Blöcke weg statt skippen**: Jede Boot-Sekunde, die wir SELECT/UPDATE auf eh-idempotente Daten machen, ist Verschwendung. Die Blöcke sind One-Time-Migrations, abgeschlossen in Prod+Staging. Wir archivieren sie via git-history — falls je gebraucht, via git show wiederhol-bar. Dead-code-on-boot vs git-history-recoverability: letzteres gewinnt.
- **Seed-Source-Types bleiben**: `src/content/*.ts` hat Types wie `{titel, kategorie, paragraphs}` — das sind Schreib-Eingaben für den Seed, nicht DB-Rows. Seed transformiert beim INSERT. Das bleibt stabil (nur Struktur-Wrapper um JSON/TypeScript-Content-Daten aus der ursprünglichen alit.ch-Migration).
- **DROP COLUMN statt DROP + re-add**: Auf Staging war die Option erwogen "DB neu seeden" — aber: Staging-DB könnte editorielle Test-Daten haben. DROP COLUMN ist non-destructive für Nicht-legacy-Daten.

### Dependencies

- Intern: keine neuen imports.
- Extern: keine. PostgreSQL DDL-only.
- Deploy-Werkzeuge: `pg_dump` aus `.env`-DATABASE_URL via SSH vor Prod-Deploy (manueller Schritt).

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| DROP COLUMN auf nicht-existierender Spalte (z.B. fresh DB nach Schema-Rewrite) | `IF EXISTS` macht es No-Op. |
| Zwei Boot-Prozesse parallel (Docker-Swarm, kein Lock) | Jeder führt `ALTER TABLE DROP COLUMN IF EXISTS` aus. Zweiter sieht Column schon weg → No-Op. PG ist concurrent-safe hier. |
| Dashboard offen während Migration (Admin mit stale-UI) | Dashboard-Types haben post-deploy kein `titel`/`title`-Field mehr im GET-Response. Dashboard-UI lädt beim Tab-Wechsel frische Daten (refetch-on-mount pattern). Worst Case: 1× unknown-field in Form-State, nächster Klick reload → ok. Nicht ship-blocker. |
| Fresh Dev-DB (kein Seed, kein Prod-Dump) | `ensureSchema()` führt CREATE TABLE aus (neue Schemas ohne legacy cols), Seed schreibt i18n-only. Komplett funktional. |
| Staging-DB wurde via Prod-Clone aktualisiert | Prod-Clone hat Legacy-Spalten mit Daten → DROP verliert Daten. Mitigation: Staging-Deploy erfolgt VOR Prod-Deploy, Staging-DB wird vor Test-Suite geclonet (bereits Standard-Workflow). |
| Seed-Content hat Leer-Strings (z.B. Seed-Item mit `titel: ""`) | Seed schreibt `title_i18n.de = undefined` (weil `{de: undefined}` JSON-stringified zu `{}`), was NOT NULL JSONB-Constraint braucht `{}::jsonb` als Default. Entweder Spec: Seed-Content hat nicht-leere Titel (ist aktuell der Fall), oder explizit `title_i18n: row.titel ? {de: row.titel} : {}` (bereits Pattern in Backfill). |
| Reader-Test mit mock-DB die legacy-Spalten zurückgibt | Reader selektiert längst nur i18n. Legacy-Spalten im mock werden ignoriert. Keine Breakage. |
| Production-Boot schlägt fehl durch unerwarteten Spalten-Constraint (z.B. Foreign-Key von dritter Tabelle) | Codex-Spec-Review prüft. Bisher keine FKs auf legacy cols identifiziert. Falls doch: `DROP COLUMN … CASCADE` oder vorheriges `DROP CONSTRAINT`. |
| Fallback beim Re-Seed: Seed schreibt legacy-Content-Datei (pre-i18n Format) in nicht-mehr-existierende Spalte | **Phase-3-Validation**: Seed MUSS vor Phase 4 angepasst sein. Reihenfolge der Phases schützt. |
| `agenda_items.ort NOT NULL` auf existing rows: kann DROP funktionieren? | NOT NULL Constraint ist auf Column-Level. `ALTER TABLE DROP COLUMN` droppt automatisch den Constraint mit. Keine Issue. |
| `projekte.slug UNIQUE NOT NULL` → hat Unique-Index | `DROP COLUMN` droppt Column + dependent Objects (inkl. Unique-Index). PG-Default-Verhalten. |
| Rollback nach Prod-Deploy (App-Bug entdeckt) | Git revert App-Code → funktioniert bis DB-Schema passt. Schema ist schon gedroppt — App-Code der legacy-Spalten liest 500. Rollback = Git-revert + DB-restore aus Dump. User erklärt: manuelle Prod-Backup-Verifikation VOR Deploy ist Pflicht. |

## Risks

- **P0 — Irreversible DB-Change auf Prod ohne Backup**: Wenn Backup-Verifikation übersprungen wird und Deploy fehlschlägt mit Daten-Korruption: total loss. Mitigation: **Done-Definition requires manueller Prod-DB-Dump + Restore-Test VOR Prod-Deploy**. Dokumentiert im Deploy-Verify-Schritt. Opus darf nicht "fertig" melden ohne.
- **P1 — Dashboard-Form-State referenziert unknown-field**: Admin tippt Titel im Dashboard, Field ist jetzt nur i18n, State-Feld ist anders. Code-Audit (Phase 5) hat keine Konsumenten identifiziert — alle Konsumenten nutzen i18n-Fields. Risiko niedrig aber nicht null. Mitigation: Phase 5 manuelles Code-Read der 4 Dashboard-Sections.
- **P2 — Seed-Re-Run auf existing Prod-DB** (z.B. durch versehentliches `seedIfEmpty()` mit leeren Tabellen-Check): würde i18n-only-Seed duplizieren. Bereits durch `seedIfEmpty()` Count-Check gated — unverändert. Keine neue Risiko-Fläche.
- **P2 — Backfill war nicht vollständig auf Prod** (obscure data, nicht durch Sprint-1–5-Logic erfasst): wenn `title_i18n = '{}'::jsonb` noch in Prod-Rows ist, würde i18n-only-Reader leere Titel zurückgeben. Mitigation: Pre-Deploy-Query auf Prod: `SELECT COUNT(*) FROM agenda_items WHERE title_i18n = '{}'::jsonb` (und analog für andere Entities). Wenn > 0: stop, manuell nach-backfillen vor DROP.
- **P3 — Codex spotet Edge-Case in backfill-Removal** (z.B. "alit_sections alte locale-Handling"): wird in Codex-Spec-Review abgeholt.

## Verification (Smoke Test Plan)

Nach Staging-Deploy:

1. **S1 Schema-State**: SSH + `docker exec alit-staging-db psql -U alit_user -d alit -c '\d+ agenda_items'` (analog für alle 4 Tabellen) → **keine** legacy-Spalten, nur i18n + hashtags + images + meta.
2. **S2 Public-Routes rendern**: `curl https://staging.alit.hihuydo.com/de/` + `/de/projekte/<slug>/` + `/fr/projekte/<slug>/` → 200 + HTML enthält Seed-Titel (z.B. Agenda-Titel sichtbar). Auch `/de/alit/` + `/de/newsletter/` (Forms rendern).
3. **S3 Dashboard-CRUD**: Login, je 1 Create + 1 Edit + 1 Delete pro Entity (4× Agenda/Journal/Projekte/Alit):
   - Create: Form submitten, List zeigt neuen Eintrag.
   - Edit: Title ändern + Save, List zeigt Update.
   - Delete: Row weg.
4. **S4 Migration-Idempotenz**: Container-Restart (ensureSchema läuft erneut). Boot erfolgreich, keine DB-Errors in Logs.
5. **S5 Sitemap + Robots**: `/sitemap.xml` enthält alle Seed-Projekte. `/robots.txt` Staging-only Disallow.
6. **S6 DB-Daten-Sanity**: `SELECT COUNT(*) FROM agenda_items` = Pre-Deploy-Count (keine Daten-Verlust). Nur Schema-Change. Analog für alle 4 Tabellen.

Nach **Prod-Deploy** (mit separatem manuellen Backup-Schritt):

1. **S7 DB-Backup existiert** (manuell): `ssh hetzner "pg_dump -Fc alit > /backup/alit-pre-cleanup-2026-04-17.dump"` vor dem Merge. Verify dump is >10KB.
2. **S8 Prod S1-S6 analog** auf `https://alit.hihuydo.com/`.

## Deploy & Verify

### Pre-Deploy (manuell, vor Merge)

```bash
ssh hetzner 'docker exec alit-db pg_dump -U alit_user -Fc alit > /backup/alit-pre-cleanup-2026-04-17.dump && ls -lh /backup/alit-pre-cleanup-2026-04-17.dump'
```

Erwartet: File >10KB. Dump-Format = custom (`-Fc`) für `pg_restore`-Kompatibilität.

### Staging-Deploy

1. Branch push → auto-deploy via deploy-staging.yml.
2. `gh run watch` bis grün.
3. S1-S6 durchgehen.
4. Bei Fehler: debug auf Staging, push fix. NICHT auf Prod-Deploy springen.

### Merge + Prod-Deploy

1. Merge PR via gh pr merge --squash.
2. Prod-Backup-Query: `SELECT COUNT(*) FROM agenda_items WHERE title_i18n = '{}'::jsonb` — erwartet 0. Analog projekte/journal_entries/alit_sections.
3. Wenn > 0: stop. Nach-backfill machen (SQL-Patch), dann deploy.
4. Wenn 0: gh run watch → green.
5. S7 (backup existiert) + S8 (Prod S1-S6).
6. Browser Hard Refresh (Cmd+Shift+R) auf alit.hihuydo.com — alle 3 Panels sichtbar.
7. `docker compose logs --tail=50 alit-web` → keine Errors.

### Rollback (falls Prod-Deploy schief geht)

1. `git revert <merge-commit>` auf main push.
2. auto-deploy back to pre-cleanup Code.
3. `pg_restore -d alit /backup/alit-pre-cleanup-2026-04-17.dump` (drops+restores).
4. Verify Count nach Restore.

### Done-Definition (hart)

- CI grün (staging + prod).
- S1-S6 green on staging.
- **Pre-deploy backup existiert und ist >10KB.**
- **Pre-deploy backfill-check: 0 rows with empty `title_i18n = '{}'::jsonb` auf allen 4 Tabellen.**
- S7 + S8 green on prod.
- `memory/todo.md` updated, Sprint-Done.
