# Spec: Cleanup-Prep (PR 1 of 2) — Legacy-Reader-Elimination + Dual-Write-Removal
<!-- Created: 2026-04-17 -->
<!-- Author: Planner (Claude Opus 4.7) -->
<!-- Status: v2 — Codex SPLIT-RECOMMENDED umgesetzt; DROP COLUMN nach PR 2 verschoben -->

## Summary

**Stage 1 von 2** für den Cleanup-Sprint. Entfernt ALLE App-Code-Dependencies auf die 16 Legacy-Spalten (Reads + Writes + Types), lässt die Spalten aber noch in der DB stehen. Danach 1–2 Deploy-Zyklen "Soak" (verify in Prod-Logs dass nichts Legacy liest), dann separate PR 2 mit der one-time `DROP COLUMN`-Migration.

Codex Spec-Review-Verdict war `SPLIT RECOMMENDED` auf v1 wegen: (a) Legacy-Reader-Surface war größer als Audit ergab, (b) DROP-in-`ensureSchema()`-Pattern ist unsicher im Rolling-Deploy-Window, (c) Rollback-Plan war nicht operational-real. v2 addressiert (a) vollständig und verschiebt (b)+(c) nach PR 2, wo sie als separate kleine PR mit voller Aufmerksamkeit behandelt werden.

## Context

- Sprints 1–5 haben 4 Content-Entities auf JSONB-per-field i18n migriert.
- Codex-Audit hat 7 versteckte Legacy-Consumer aufgedeckt, die nach DROP 500en würden:
  1. `src/lib/agenda-hashtags.ts` — 2× `SELECT slug FROM projekte` (Validierung von Hashtag-Projekt-Verweisen)
  2. `src/lib/media-usage.ts` — 3× SELECT mit `title`/`titel`/`content::text` aus journal/agenda/alit (für Media-Usage-Scan)
  3. `src/app/api/dashboard/journal/migrate/route.ts` — One-Time-Legacy-Migration (liest `lines`+`images`, schreibt `content`; jetzt dead code nach Sprint 4)
  4. `src/lib/queries.ts::getProjekte()` — selektiert `paragraphs`, returnt es im `Projekt`-Type
  5. `src/components/ProjekteList.tsx:99-107` — rendert `p.paragraphs` als Fallback wenn `content_i18n` leer ist
  6. `src/lib/journal-types.ts::DashboardJournalEntry` — Type hat noch `title, lines, content, footer` (aus DB selektiert via `SELECT *` im Dashboard-GET)
  7. `src/app/dashboard/components/JournalEditor.tsx:73-84` — expliziter Legacy-Fallback `entry.content || entry.lines` in Editor-Seed-Logic

Sobald diese 7 eliminiert sind + Dual-Write raus + Seed i18n-only, ist die DB-Spalte sicher droppbar in PR 2.

## Requirements

### Must Have (Sprint Contract)

1. **Legacy-Reader-Elimination** (neu):
   - `src/lib/agenda-hashtags.ts`: beide Funktionen (`validateHashtags` + `validateHashtagsI18n`) — `SELECT slug FROM projekte WHERE slug = ANY($1)` → `SELECT slug_de FROM projekte WHERE slug_de = ANY($1)`. Validation-Semantik identisch (Hashtags verweisen auf `slug_de` = kanonische ID).
   - `src/lib/media-usage.ts`: alle 3 SELECTs umbauen
     - Label: `title_i18n->>'de' as title` / `title_i18n->>'de' as titel`
     - Content-Scan: `content_i18n::text as content_text` (scannt alle Locales als Serialized-JSON auf UUID-Referenzen — besser als vorher, weil auch FR-only media gefunden wird)
     - Agenda: `title_i18n->>'de' as titel, content_i18n::text as content_text`
     - Journal: `title_i18n->>'de' as title, content_i18n::text as content_text`
     - Alit: `title_i18n->>'de' as title, content_i18n::text as content_text`
   - `src/app/api/dashboard/journal/migrate/route.ts`: **Endpoint löschen** (dead code nach Sprint 4). Vorher: `rg "journal/migrate" src/` um Konsumenten zu finden (vermutet: ein UI-Button in JournalSection, der mit weg muss).
   - `src/lib/queries.ts::getProjekte()`: `paragraphs` aus SELECT entfernen. `Projekt`-Type: `paragraphs`-Feld raus. Jede Konsument-Stelle anpassen.
   - `src/components/ProjekteList.tsx:99-107`: Fallback `p.paragraphs.map(...)` raus. Content kommt ausschließlich aus `p.content` (JournalContent-Blocks). Wenn leer: nichts rendern (Reader filtert sowieso leere locale-hidden Einträge aus).
   - `src/lib/journal-types.ts::DashboardJournalEntry`: Felder `title, lines, content, footer` raus. Nur i18n-Versionen + Metadaten bleiben. Achtung: `images` bleibt (wird von Reader konsumiert).
   - `src/app/dashboard/components/JournalEditor.tsx`: Legacy-Fallback-Branch löschen. `initialPerLocale()` liest nur noch `contentI18n?.[loc]` (+ `titleI18n` / `footerI18n`). Wenn leer: Editor startet mit Empty-Content.
   - **Dashboard-GET-Routes** (`/api/dashboard/agenda`, `/api/dashboard/journal`, `/api/dashboard/projekte`): falls `SELECT *` verwendet wird, explizit auf i18n + Metadaten einschränken. Ansonsten kehren nach DROP in PR 2 Felder mit `undefined` zurück — OK aber unsauber.

2. **Projekte Collision-Check säubern** (ex-Phase-1):
   - `src/app/api/dashboard/projekte/route.ts` Collision-SELECT: `slug = ANY($1)` raus, nur `slug_de` + `slug_fr`.
   - Row-Analyse: `row.slug` droppen, nur `row.slug_de`/`row.slug_fr`.

3. **Dual-Write entfernen** (ex-Phase-2) — 8 Routes:
   - POST + PUT für agenda/journal/projekte/alit: kein INSERT/UPDATE mehr auf Legacy-Spalten.
   - `pickLegacyString`/`pickLegacyContent`-Helper (wahrscheinlich in `src/lib/i18n-field.ts` oder similar): Grep-check + löschen wenn ungenutzt.

4. **Seed i18n-only** (ex-Phase-3) — `src/lib/seed.ts`:
   - agendaItems INSERT: kein `titel, beschrieb`, nur i18n + Metadaten.
   - journalEntries INSERT: kein `title, lines, footer`, nur i18n + Metadaten. `content` (JSONB, legacy) auch raus.
   - projekte INSERT: kein `slug, titel, kategorie, paragraphs, content`. `slug_de` (neu, canonical) bleibt.
   - alitSections INSERT: kein `title, content`. Schreibt direkt `title_i18n + content_i18n`.
   - Seed-Source-Types in `src/content/*.ts` bleiben unverändert (Plain-Input für Transformer).

5. **Type-Cleanup** (ex-Phase-5):
   - Dashboard-Section-Types für 4 Entities: Legacy-DB-Shape-Felder raus. Behalten: i18n-Versionen + Metadaten.
   - Public-Reader-Types (`AgendaItemData`, `JournalEntry`, `Projekt`, `AlitSection`): resolved-Felder (`titel`, `ort`, `content`) bleiben (sie sind reader-output, nicht DB-read). Aber: `paragraphs` raus aus `Projekt`, `lines` raus aus `JournalEntry` falls noch da.

6. **Columns bleiben in DB**:
   - `schema.ts` unverändert für die legacy CREATE TABLE / ALTER ADD COLUMN-Blöcke.
   - Backfill-Blöcke bleiben (idempotent, no-op auf bereits gebackfilleten Prod-DBs — harmlos).
   - Slug-Preflight-Check bleibt (prüft auf legacy `slug`, Spalte existiert noch).
   - **Rationale**: Soak-Zeit erforderlich. PR 2 entfernt diese Schema-Code-Blöcke zusammen mit DROP COLUMN.

7. **Tests**:
   - Bestehende 165 Tests grün.
   - Pre-Drop-Sanity-Test (optional, kann als Follow-up): query `SELECT COUNT(*) FROM <table> WHERE title_i18n = '{}' OR title_i18n IS NULL`, `COUNT(*) FROM projekte WHERE content_i18n = '{}' OR content_i18n IS NULL`, etc. Dient als Guard für PR 2. Jetzt noch nicht nötig, aber Logik dokumentiert in PR 2.
   - `pnpm test` + `pnpm build` grün.

### Nice to Have (Follow-up → memory/todo.md)

- Pre-Drop-Sanity-Test als CI-Check integrieren.
- Schema-Idempotenz-Test (braucht Test-DB-Setup, existiert noch nicht) — sinnvoll für PR 2.
- Audit-Logging für Schema-Migrations (aktuell nur stdout) — separater Sprint.

### Out of Scope (kommt in PR 2)

- **`ALTER TABLE ... DROP COLUMN`** für alle 16 Legacy-Spalten.
- **Schema-CREATE-TABLE Cleanup** (kein Legacy-Column in initial-CREATE).
- **Backfill-Block-Removal** in `schema.ts`.
- **Slug-Preflight-Check-Removal**.
- **One-time Migration-Pattern** (separater `migrations/`-Ordner oder explizit-getriggerter Step).
- **Operational Rollback-Runbook** (Docker-basiert, App-Stop-Order, Verify-Query).
- **Pre-Deploy-Backfill-Sanity-Check** als Gate.

## Technical Approach

### Files to Change

| File | Change Type | Description |
|------|-------------|-------------|
| `src/lib/agenda-hashtags.ts` | Modify | Beide Validator-SELECTs: `slug` → `slug_de`. |
| `src/lib/media-usage.ts` | Modify | 3 SELECTs: `title_i18n->>'de'` für Label, `content_i18n::text` für Scan. |
| `src/app/api/dashboard/journal/migrate/route.ts` | Delete | One-Time-Migration, dead code. |
| `src/app/dashboard/components/JournalSection.tsx` | Modify | "Migrate"-Button/Call entfernen (wenn vorhanden). |
| `src/lib/queries.ts` | Modify | `getProjekte()`: `paragraphs` aus SELECT + Type. |
| `src/components/ProjekteList.tsx` | Modify | `p.paragraphs`-Fallback raus, Content nur via `p.content`. |
| `src/lib/journal-types.ts` | Modify | `DashboardJournalEntry`: `title/lines/content/footer` raus. |
| `src/app/dashboard/components/JournalEditor.tsx` | Modify | Legacy-Fallback in `initialPerLocale()` raus. |
| `src/app/api/dashboard/projekte/route.ts` | Modify | Collision-SELECT: `slug` raus. POST: Dual-Write raus. |
| `src/app/api/dashboard/projekte/[id]/route.ts` | Modify | PUT: Dual-Write raus. |
| `src/app/api/dashboard/agenda/route.ts` | Modify | POST: Dual-Write raus. |
| `src/app/api/dashboard/agenda/[id]/route.ts` | Modify | PUT: Dual-Write raus. |
| `src/app/api/dashboard/journal/route.ts` | Modify | POST: Dual-Write raus. |
| `src/app/api/dashboard/journal/[id]/route.ts` | Modify | PUT: Dual-Write raus. |
| `src/app/api/dashboard/alit/route.ts` | Modify | POST: Dual-Write raus. |
| `src/app/api/dashboard/alit/[id]/route.ts` | Modify | PUT: Dual-Write raus. |
| `src/lib/i18n-field.ts` (falls dort) | Modify/Delete | `pickLegacyString`/`pickLegacyContent` entfernen wenn ungenutzt. |
| `src/lib/seed.ts` | Modify | 4 INSERTs i18n-only. |
| `src/app/dashboard/components/AgendaSection.tsx` | Modify | Type: Legacy-DB-Fields raus. |
| `src/app/dashboard/components/ProjekteSection.tsx` | Modify | Type: Legacy-DB-Fields raus. |
| `src/app/dashboard/components/AlitSection.tsx` | Modify | Type: Legacy-DB-Fields raus. |

**~20 Files, alle i18n-only-konvergierend, keine Schema-Änderung.**

### Architecture Decisions

- **PR-Split-Rationale (Codex)**: Zwei Risiken werden entkoppelt. PR 1 = pure App-Code-Change (rollback via git revert). PR 2 = irreversible DB-Change (rollback braucht pg_restore). Beide zusammen in einem PR mischen die beiden Risiken und machen Debugging beim Incident erheblich schwerer. Split ist Branch-Investment, aber Recovery-Multiplier.
- **Soak-Definition**: Nach PR 1 Merge, 1–2 Deploy-Zyklen warten + Prod-Logs beobachten. Signal: wenn in 24h keine unerwarteten Errors auftauchen und mindestens 1× alle 4 Dashboard-CRUD-Flows manuell durchgetestet sind → PR 2 green-lighted. Nicht strenger Zeit-Gate sondern Observation-Gate.
- **Dashboard-GET `SELECT *` Verhalten nach DROP**: `SELECT *` returnt nur existierende Spalten. Nach DROP sind Legacy-Felder einfach nicht im Response — JS-Code liest `row.title` → `undefined` → wenn nirgendwo mit Fallback, OK. Das ist der Grund warum PR 1 Type-Cleanup nötig ist: wenn ein Dashboard-Reducer `row.title ?? row.title_i18n.de` tut, dann wird sich nach DROP nichts ändern (weil `title` weg → undefined → fallback greift). Das wäre also *funktional* kein Bug. ABER: Types dokumentieren was erwartet wird → Legacy-Felder raus aus Types hilft Maintenance.
- **`journal/migrate`-Route löschen statt "deprecated markieren"**: Tote Routes sind Angriffsfläche + kognitive Last. Wenn niemand sie mehr aufruft (UI-Button weg), weg damit. Git-history recovery falls je gebraucht.
- **`ProjekteList.paragraphs`-Fallback entfernen statt deprecaten**: Fallback würde nach PR 2 nie mehr feuern (keine DB-Col) aber Code wirkt "fragile". Cleaner removal.
- **Seed-Content-Types bleiben**: Plain-TS-Objekte mit `{titel, kategorie, paragraphs}`-Shape sind Seed-Input. Seed-Code transformiert in i18n beim INSERT. Quelle der Daten (`src/content/*.ts`) bleibt unverändert — das ist ein redaktioneller Input, kein DB-Schema.
- **Backfill bleibt drin in `schema.ts`**: Idempotent, no-op auf bereits gebackfilleten Prod-DBs. Gibt PR 2 den sauberen Entfernungs-Schritt zusammen mit `DROP COLUMN`. Kognitive Last während PR 1-Soak: gering (Boot-Zeit +~100ms für SELECT-Count).

### Dependencies

- Intern: kein neues Module, alle Changes in bestehenden Files.
- Extern: keine neuen npm-deps.

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| `content_i18n::text` Scan matched mehr als `content::text` (weil beide Locales serialisiert) | Besser: findet auch FR-only media-references in media-usage. Funktional ein Bonus, nicht Bug. |
| Admin öffnet Journal-Editor, Entry hat `content_i18n.de === null` aber legacy `content` noch in DB | Editor startet mit Empty-Content (Legacy-Fallback weg). Mitigation: Pre-PR-1-Sanity-Query prüfen, dass alle Journal-Rows mit legacy `content != NULL` auch `content_i18n.de != NULL` haben. Backfill hat das bereits gelöst → 0 Ausnahmen erwartet. |
| Hashtag-Validation sieht Projekt mit `slug_de IS NULL` (obscure edge) | Kein Treffer → "Unknown project" Error. Das ist korrekt. Projekte ohne `slug_de` sollten nicht existieren (Sprint-5-Schema-Constraint). |
| `journal/migrate` wird von externem Client aufgerufen (z.B. jemand hat die URL gebookmarkt) | 404 nach Delete. Akzeptabel — Route war immer Admin-only intern. |
| PR 1 merged, PR 2 NICHT gemerged, 2 Wochen später neuer Sprint | Legacy-Spalten sind in DB, Backfill läuft weiterhin idempotent at boot. Kein Funktions-Problem. PR 2 kann jederzeit weitergehen. |
| Dashboard-Editor zeigt nach PR 1 eine Form mit i18n-Feldern für existierendes entry | Form-State initialisiert aus `row.title_i18n.de` etc. Legacy `row.title` ist nicht mehr im Type deklariert → TS-Compile-Check würde failen wenn irgendwo dran gelesen wird. Guard. |
| Rolling Deploy mit zwei App-Versionen, eine alt (Dual-Write), eine neu (i18n-only) | Beide schreiben i18n. Alte schreibt zusätzlich legacy. Neue ignoriert legacy. Konsistent. Nach Deploy-Ende: alle neu. PR 2 Rolling-Deploy ist der viel heiklere Fall (deshalb separate PR). |

## Risks

- **P1 — Legacy-Reader übersehen**: Codex hat 7 identifiziert. Könnte noch mehr geben. Mitigation: vor Merge `rg` über Codebase nach jedem Legacy-Column-Namen (titel, kategorie, slug, paragraphs, beschrieb, content, lines, footer — ohne `_i18n` Suffix). **Must-have pre-commit-grep-check** im Done-Kriterium.
- **P2 — Dashboard-Form-State-Breakage**: Wenn alter Dashboard-JS-Code noch `row.title` liest und neuer GET `title` nicht mehr zurückgibt (SELECT-Restriktion) → undefined. Mitigation: Types-Cleanup ist Must-Have, TS compiler würde es flaggen.
- **P3 — `ProjekteList.paragraphs`-Fallback ist sichtbares UI-Verhalten**: Wenn ein Projekt tatsächlich leeres `content_i18n` hat, würde es jetzt nichts rendern (vorher legacy `paragraphs`). Mitigation: Pre-Sanity-Check `SELECT id FROM projekte WHERE content_i18n = '{}'::jsonb` — erwartet 0. Falls > 0: nach-backfillen VOR PR 1 Merge.
- **P3 — `journal/migrate`-Deletion**: wenn UI-Button noch existiert und Admin ihn klickt → 404. Mitigation: UI-Audit, beiden zusammen entfernen.

## Verification (Smoke Test Plan)

Nach Staging-Deploy:

1. **S1 Public-Routes rendern**: `/de/`, `/de/projekte/<slug>/`, `/fr/projekte/<slug>/`, `/de/alit/` alle 200.
2. **S2 Hashtag-Rendering**: Agenda-Item mit Hashtag anzeigen → Link auf `/de/projekte/<slug>/` funktioniert (keine 404).
3. **S3 Dashboard-CRUD** je Entity: Create + Edit + Delete funktional.
4. **S4 Media-Usage-Scan**: Dashboard-Media-Tab → "Verwendet in" pro File zeigt korrekte References (scan erkannt-Medien via i18n-Content). Upload ein Test-Bild, embedde es via MediaPicker in einem Journal-Entry, verify es taucht in Media-Usage auf.
5. **S5 Legacy-Grep**: `rg "\.title\b|\.titel\b|\.paragraphs\b|\.lines\b|\.beschrieb\b|\.kategorie\b" src/ --ignore-dir=content --ignore-dir=dashboard/components/JournalEditor` — darf nur resolved-Reader-Output-Fields matchen (erwartet klein, auditieren).
6. **S6 DB-Soak-Observation** (post-merge, in Prod): `docker logs alit-web | grep -i "error\|column" | tail -20` nach 24h — keine column-reference-errors.
7. **S7 Projekte-Rendering ohne `paragraphs`-Fallback**: Einen Test-Projekt-Eintrag mit absichtlich-leerem `content_i18n` erstellen (oder verify an existing empty) → Frontend rendert nichts statt legacy-paragraphs. Kein Regression-Visueller-Unterschied auf realen Daten (alle content_i18n nicht-leer).

## Deploy & Verify

Nach Merge PR 1:
1. CI grün (`gh run watch`)
2. `https://alit.hihuydo.com/api/health/` → 200
3. Prod S1–S4 stichprobenartig
4. 24h-Soak mit Log-Observation (S6)
5. Wenn grün → PR 2 (DROP COLUMN) als separater Sprint eröffnen
6. Wenn Logs Legacy-Access-Errors zeigen: Hotfix in PR 1.1, PR 2 verschoben bis Logs clean

**Done-Definition (PR 1):**
- Sonnet pre-push CLEAN
- Codex PR-R1 CLEAN (oder nur Nice-to-have/Out-of-scope Findings)
- CI green auf Staging + Prod
- S1–S5 geprüft auf Staging
- Legacy-Grep-Check: keine verbleibenden Legacy-Reads in App-Code
- 24h-Log-Soak auf Prod ohne column-errors → signal für PR 2 go
