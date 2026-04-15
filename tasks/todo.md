# Sprint 2: Multi-Locale Rollout Projekte
<!-- Spec: tasks/spec.md -->
<!-- Started: 2026-04-15 -->

## Done-Kriterien
> Alle müssen PASS sein bevor der Sprint als fertig gilt.

- [ ] `pnpm build` läuft ohne TypeScript-/Lint-Fehler durch
- [ ] `pnpm test` grün — insb. neue Tests für `contentBlocksFromParagraphs`
- [ ] `schema.ts`-Bootstrap fügt `title_i18n`/`kategorie_i18n`/`content_i18n` auf `projekte` hinzu und backfillt idempotent (zweiter Boot touched keine Zeile)
- [ ] Alle Projekte haben nach Backfill nicht-leere `content_i18n.de` + `title_i18n.de` + `kategorie_i18n.de`
- [ ] `GET /api/dashboard/projekte/` returnt jede Row mit `title_i18n`, `kategorie_i18n`, `content_i18n`, `completion: {de, fr}`
- [ ] `POST /api/dashboard/projekte/` akzeptiert Payload mit `title_i18n` + `kategorie_i18n` + `content_i18n` und writet auch Legacy-Felder (`titel`, `kategorie`, `content`) via Dual-Write
- [ ] `PUT /api/dashboard/projekte/[id]/` akzeptiert Payload mit `title_i18n` + `kategorie_i18n` + `content_i18n`, partial-update-safe (nur gesendete Felder updated)
- [ ] Dashboard-Editor zeigt Tabs `[DE] [FR]` mit Live-Completion-Badge (✓/–), Editoren bleiben parallel mounted (kein Remount beim Tab-Wechsel)
- [ ] Listen-Row zeigt pro Projekt zwei Status-Badges (DE / FR)
- [ ] Slug-Kollision (`POST` 409) blendet Slug-Feld ein, vorbefüllt mit Auto-Slug, manuell editierbar
- [ ] `/de/projekte` und `/de/projekte/<slug>` rendern identisch zum aktuellen Stand (visual smoke-test im Browser)
- [ ] `/fr/projekte` rendert alle migrierten Projekte; Wrapper-`<div>` hat `lang="de"`-Attribut für FR-Fallback-Items
- [ ] Panel-3-Projekte-Liste rendert auf allen Routen (`/de/alit`, `/de/newsletter`, etc.) wie vorher
- [ ] `memory/lessons.md` + `memory/todo.md` vor Merge aktualisiert

## Tasks

### Phase 1 — Migration + Helper
- [ ] `src/lib/i18n-field.ts` (oder neu `projekte-migration.ts`): `contentBlocksFromParagraphs(paragraphs: string[]): JournalContent` implementieren
- [ ] Unit-Tests für `contentBlocksFromParagraphs` (leer, ein Paragraph, mehrere, Special-Chars, `undefined`-Input)
- [ ] `src/lib/schema.ts`: `ALTER TABLE projekte ADD COLUMN title_i18n/kategorie_i18n/content_i18n` + idempotenter JS-Loop-Backfill
- [ ] Check ob `src/lib/seed.ts` projekte schreibt — falls ja, auf neue `*_i18n`-Form umstellen
- [ ] Lokal testen: DB-Volume wegwerfen, frischer Boot → Tabelle existiert mit `*_i18n`, Seed-Projekte migriert

### Phase 2 — API
- [ ] `src/app/api/dashboard/projekte/route.ts`: GET returnt `title_i18n`/`content_i18n`/`completion`; POST akzeptiert neues Schema + Dual-Write auf Legacy-Spalten
- [ ] `src/app/api/dashboard/projekte/[id]/route.ts`: PUT auf neues Schema + Dual-Write, partial-update via `setClauses`-Pattern wie heute
- [ ] `src/lib/queries.ts`: `getProjekte(locale: Locale)` — liest `*_i18n`, resolved via `t()`, returned `isFallback`
- [ ] `src/content/projekte.ts`: `Projekt`-Type um `isFallback?: boolean` erweitern
- [ ] `src/app/[locale]/layout.tsx`: `getProjekte(locale)` statt `getProjekte()`
- [ ] Smoke-Test via curl: GET returnt erwartetes Shape; POST/PUT funktionieren mit neuem Payload

### Phase 3 — Dashboard-UI
- [ ] `src/app/dashboard/components/ProjekteSection.tsx`: State auf `{slug, external_url, archived, de: {titel, kategorie, html}, fr: {titel, kategorie, html}}` umstellen
- [ ] Editor-Form: Locale-Tabs oben, pro Locale ein `<RichTextEditor>` + Titel-Input + Kategorie-Input, inaktive via `hidden`
- [ ] Listen-Row: Completion-Badges DE/FR (analog `AlitSection.tsx`)
- [ ] Slug-Kollision-Handling: bei 409 Slug-Feld einblenden, vorbefüllt, editierbar, Fehlermeldung anzeigen
- [ ] Slug bleibt im Edit-Flow read-only wie jetzt
- [ ] Edit-Open liest direkt aus `item.title_i18n`/`item.kategorie_i18n`/`item.content_i18n` (keine paragraphs-Konvertierung mehr)

### Phase 4 — Public Rendering
- [ ] `src/components/ProjekteList.tsx`: `lang="de"` auf Wrapper wenn `p.isFallback` — sonst kein Attribut
- [ ] Projekt mit komplett leerem Content (beide Sprachen) wird gefiltert (nicht gerendert)
- [ ] Lokaler Test: `/de/projekte` visuell unverändert; `/fr/projekte` zeigt DE-Inhalte mit lang-Attribut

### Phase 5 — Ship
- [ ] Feature-Branch `feat/i18n-projekte` erstellen, committen, pushen
- [ ] Staging-Deploy grün — URL + Smoke-Test + Logs clean (siehe CLAUDE.md "Deploy-Verifikation")
- [ ] PR eröffnen, Codex-Review einholen
- [ ] Findings gegen Sprint Contract bewerten (max 2 Runden)
- [ ] Nach Merge: Production-Deploy verifizieren (CI + Health + Smoke + Logs)
- [ ] `memory/lessons.md` + `memory/todo.md` updaten (neue Learnings, PR #X als [x] markieren)

## Notes
- Pattern-Referenzen: `AlitSection.tsx` (Sprint 1 Dashboard-Multi-Locale-Vorlage), `src/lib/schema.ts:122-160` (Alit-Migration als Vorlage, aber OHNE FR-Precondition-Abort weil `projekte` kein `locale`-Feld hat), `memory/lessons.md` 2026-04-15 (JSONB-per-field + parallel-mounted editors + Re-Run-Safety).
- Codex-Review: PR wird locale-Scoping auf `sort_order` hinterfragen — die Antwort ist "`projekte` hat keinen locale-Scope mehr, eine Row pro Entity, `sort_order` ist single". Siehe `memory/lessons.md` 2026-04-14 "sort_order-Namespace muss per-locale sein" — das Lesson gilt für Row-per-Locale, nicht für JSONB-per-field.
