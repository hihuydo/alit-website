# Sprint 3: Multi-Locale Rollout Agenda
<!-- Spec: tasks/spec.md -->
<!-- Started: 2026-04-15 -->

## Done-Kriterien
> Alle müssen PASS sein bevor der Sprint als fertig gilt.

- [ ] `pnpm build` clean, `pnpm test` alle 52 Tests grün
- [ ] Migration fügt `title_i18n`/`lead_i18n`/`ort_i18n`/`content_i18n` auf `agenda_items` hinzu + idempotenter JS-Backfill (zweiter Boot touched keine Zeile)
- [ ] Alle Events nach Backfill mit nicht-leeren `content_i18n.de` (beschrieb oder content derived)
- [ ] `GET /api/dashboard/agenda/` returnt jeden Event mit `title_i18n`/`lead_i18n`/`ort_i18n`/`content_i18n`/`completion`
- [ ] `POST /api/dashboard/agenda/` akzeptiert `*_i18n`-Payload + Dual-Write; **rejectet `null` mit 400** (Sprint-2-Lesson)
- [ ] `PUT /api/dashboard/agenda/[id]/` partial-update-safe, `undefined`=skip, `null`=400, Dual-Write auf Legacy
- [ ] Dashboard-Editor zeigt Tabs `[DE] [FR]`, Titel+Lead+Ort+Editor **pro Locale parallel mounted** (inaktive via `hidden`)
- [ ] Listen-Row zeigt Completion-Badges DE/FR
- [ ] Auto-Save sendet incomplete i18n-Drafts als `undefined`-Felder (nicht als leere Objekte) — keine Datenverlust-Regression
- [ ] `/de/` rendert Agenda visuell identisch zu pre-Sprint (Homepage smoke-test)
- [ ] `/fr/` rendert Agenda mit **per-Feld** `lang="de"`-Attributen (h3, lead-p, ort-div, content-div — NICHT card-wrapper)
- [ ] Reader `getAgendaItems(locale)` skipped Entries ohne DE-Content bei DE-Locale (keine FR→DE Reverse-Fallback, Sprint-2-Lesson P2)
- [ ] **Hashtags i18n**: DB-Shape `{tag_i18n: {de, fr}, projekt_slug}[]`, Migration transformiert alte Shape in-place (idempotent)
- [ ] Reader resolved Hashtag-Labels per Locale, returnt Public-Shape `{tag, projekt_slug}[]` (Legacy-kompatibel, `AgendaItem.tsx` unverändert)
- [ ] Dashboard-Hashtag-Editor zeigt pro Hashtag-Row zwei Label-Inputs (DE + FR) nebeneinander + Projekt-Picker (single)
- [ ] `seed.ts` schreibt bei Fresh-DB direkt in `*_i18n` (nicht nur Legacy)
- [ ] `memory/lessons.md` + `memory/todo.md` vor Merge aktualisiert

## Tasks

### Phase 1 — Migration
- [ ] `src/lib/schema.ts`: `ALTER TABLE agenda_items ADD COLUMN *_i18n` + JS-Loop-Backfill analog zu projekte-Migration (wiederverwendet `contentBlocksFromParagraphs` aus Sprint 2)
- [ ] `src/lib/schema.ts`: **Hashtag-Shape-Migration** — `UPDATE agenda_items SET hashtags = ...` JSONB-map, nur wenn `typeof element.tag === 'string'` (idempotent)
- [ ] `src/lib/seed.ts`: Fresh-Seed schreibt auch `title_i18n`/`lead_i18n`/`ort_i18n`/`content_i18n` + Hashtags mit neuer Shape
- [ ] Lokal verifizieren: DB-Volume wegwerfen → frischer Boot → Tabellen haben `*_i18n` mit DE-Daten + Hashtags in neuer Shape

### Phase 2 — API
- [ ] `src/app/api/dashboard/agenda/route.ts`: GET+POST auf i18n-Payload, Validator (undefined=skip, null=400)
- [ ] `src/app/api/dashboard/agenda/[id]/route.ts`: PUT auf i18n, partial-update via `setClauses`-Pattern, Dual-Write auf `titel`/`lead`/`ort`/`content`
- [ ] `src/lib/queries.ts`: `getAgendaItems(locale: Locale)` — liest nur `*_i18n`, resolved via `t()`, returnt `*IsFallback`-Flags, skipt Entries bei DE-Locale wenn DE-Content leer
- [ ] `src/components/AgendaItem.tsx`: `AgendaItemData`-Interface um `titleIsFallback`, `leadIsFallback`, `ortIsFallback`, `contentIsFallback` erweitern
- [ ] `src/app/[locale]/layout.tsx`: `getAgendaItems(locale)` durchreichen
- [ ] Smoke-Test via curl: GET shape, POST/PUT mit `*_i18n`, 400 auf `{"title_i18n": null}`

### Phase 3 — Dashboard-UI
- [ ] `src/app/dashboard/components/AgendaSection.tsx`: Form-State auf `{shared:{datum,zeit,ort_url,images,hashtags}, de:{titel,lead,ort,html}, fr:{...}}`
- [ ] Locale-Tabs mit parallel-mounted Inputs/Editoren (per Locale: Titel + Lead + Ort + RichTextEditor; inaktive via `hidden`)
- [ ] Live-Completion-Badges auf Tabs + Listen-Row
- [ ] Auto-Save-Payload: incomplete-i18n-Felder als `undefined` (nicht leere Objekte) → DB-Wert bleibt bei Teil-Drafts
- [ ] Edit-Open liest `item.*_i18n` statt Legacy-Felder

### Phase 4 — Public Rendering
- [ ] `src/components/AgendaItem.tsx`: `lang={item.*IsFallback ? "de" : undefined}` auf `<h3>` (Titel), `<p>` (Lead), `<div>` (Ort), Content-Wrapper — pro Feld einzeln
- [ ] Kein card-weites `lang`-Attribut
- [ ] `/de/` und `/fr/` visuell testen

### Phase 5 — Ship
- [ ] Feature-Branch `feat/i18n-agenda`, committen, pushen → Staging-Deploy verifizieren (CI + URL + Smoke + Logs)
- [ ] PR eröffnen, Codex-Review einholen (max 2 Runden)
- [ ] Findings gegen Sprint Contract bewerten
- [ ] Nach Merge: Production-Deploy verifizieren
- [ ] `memory/lessons.md` (nur wenn neue Learnings) + `memory/todo.md` updaten

## Notes
- Pattern-Referenzen:
  - `ProjekteSection.tsx` + `projekte`-API + `getProjekte(locale)` aus Sprint 2 sind die direkte Vorlage.
  - `AlitSection.tsx` für Locale-Tabs-UX.
  - `patterns/database.md` — Dual-Write-Read-Isolation.
  - `patterns/api.md` — Partial-PUT undefined vs null.
  - `patterns/seo.md` — per-field lang-Attribut.
- `ort` ist übersetzbar — wenn User das doch single-locale haben will, ist das ein kleiner Revert (Validator + Migration + Editor). Im PR als offene Frage flaggen wenn relevant.
- `agenda_items` hat **kein** `locale`-Scope-Problem wie `alit_sections` (single row per event) — kein FR-Precondition-Abort nötig.
- Auto-Save existiert bereits in `AgendaSection.tsx` (anders als Projekte/Alit) — hier besonders sorgfältig mit i18n-Shape + Null-Payload sein.
