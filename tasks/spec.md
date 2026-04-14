# Spec: Multi-Locale Foundation + Über-Alit (Sprint 1 von ~4)
<!-- Created: 2026-04-14 -->
<!-- Author: Planner (Claude) -->
<!-- Status: Proposed -->

## Summary
Französische Website ermöglichen durch ein **einheitliches i18n-Modell**: JSONB-per-Field für übersetzbare Inhalte, eine Zeile pro logischer Entität, DE-Fallback bei fehlender FR-Übersetzung. Sprint 1 baut das Fundament und migriert `alit_sections` als Proof-of-Concept end-to-end (DB → API → Dashboard → Website). Agenda, Journal, Projekte folgen in Sprint 2-4 nach demselben Pattern.

## Context
- DB hat bereits `locale`-Spalte auf `alit_sections` (row-per-locale). Andere Tabellen sind single-locale.
- Dashboard-Alit-Tab ist aktuell hardcoded auf DE (`/api/dashboard/alit/` ohne `?locale=`). Kein Locale-Picker im UI.
- Website rendert `/de/alit` via `getAlitSections(locale)`. `/fr/alit` würde aktuell leer sein, weil keine FR-Zeilen in DB.
- Admin-Login: ein Admin bearbeitet beide Sprachen, kein getrenntes User-Modell.
- Die 3 übrigen Entities (agenda_items, journal_entries, projekte) haben **kein** Locale-Feld. Sie folgen in späteren Sprints.

## Requirements

### Must Have (Sprint Contract)
1. **DB-Migration alit_sections auf JSONB-per-field**
   - Neue Spalten: `title_i18n JSONB NOT NULL DEFAULT '{}'::jsonb`, `content_i18n JSONB NOT NULL DEFAULT '{}'::jsonb` (Shape: `{ "de": <value>, "fr": <value> }`, keys optional).
   - Migration kopiert bestehende `title` + `content` in `title_i18n.de` / `content_i18n.de` (falls `locale='de'`) bzw. `.fr` (falls `locale='fr'`); rows derselben Entität werden per Heuristik gemerged (siehe Technical Approach).
   - Alte Spalten `title`, `content`, `locale` bleiben vorerst bestehen (Dual-Write in API) — Cleanup in einem Follow-up-Sprint nachdem alle Tabellen migriert sind.
   - Tabelle behält Single-`sort_order` pro Entität (keine locale-Scope mehr).
2. **i18n-Helper `t(field, locale, fallback='de')`** in `src/lib/i18n-field.ts`
   - Liest `{de, fr}`-JSONB-Shape, returned `locale`-Wert wenn nicht leer, sonst `fallback`-Wert, sonst leerer String / leere Blöcke.
   - Leer-Definition: `string` → `""` oder nur whitespace; `JournalContent` (Block-Array) → Länge 0. Unit-Tests für beide Fälle.
3. **API `/api/dashboard/alit/` akzeptiert multi-locale Payload**
   - `POST` / `PUT` empfängt `{ title_i18n: {de, fr}, content_i18n: {de, fr} }`.
   - `GET` returned alle Sektionen mit vollem `title_i18n` / `content_i18n` plus abgeleitetem `completion: { de: boolean, fr: boolean }` (basiert auf "content_i18n[locale] nicht leer").
4. **Dashboard Alit-Tab mit Locale-Tabs im Editor**
   - Editor-Modal oben: Zwei Tabs "DE" | "FR". Aktiv-State visuell klar. Titel + Content-Editor reagieren auf aktiven Tab (persistieren pro Locale im lokalen Form-State, submit sendet JSONB).
   - Liste zeigt pro Sektion zwei Status-Badges: "DE ✓ / DE –" und "FR ✓ / FR –" (grüner Haken bei vorhandenem non-empty content, grauer Strich sonst).
   - Drag-Reorder bleibt single (eine Entität = eine Position, beide Sprachen gekoppelt).
5. **Website rendert FR mit DE-Fallback**
   - `getAlitSections(locale)` returned `{ id, title, content }` bereits **locale-aufgelöst** via `t()` — Consumer bleibt unverändert.
   - Fehlt FR-Übersetzung für eine Sektion → DE wird gerendert (kein Leer-Platz, kein 404).
   - FR-Fallback-Sektionen bekommen `lang="de"` Attribut auf dem Wrapper (Accessibility: Screenreader liest korrekte Sprache).
6. **Build grün + existierende Routes unverändert funktional**
   - `pnpm build` erfolgreich.
   - `/de/alit` rendert exakt wie vorher (keine visuelle Regression).
   - `/fr/alit` rendert mit übersetzten Sektionen wo vorhanden, sonst DE.

### Nice to Have (explicit follow-up, NOT this sprint)
1. Translation-Progress-Dashboard (Übersicht über alle Tabellen: "Über Alit: 80% FR, Agenda: 0% FR, …").
2. Bulk-Translation-Import aus einem JSON/CSV-File.
3. KI-unterstützte Übersetzungsvorschläge (DeepL/Claude API im Editor).
4. Cleanup der alten Spalten (`title`, `content`, `locale`) auf alit_sections — nach vollständiger Migration aller Tables.
5. FR für Hashtag-Labels (Tags selbst bleiben DE-Slug, nur Anzeige-Label übersetzbar).
6. Agenda-Migration (→ Sprint 3)
7. Journal-Migration (→ Sprint 4)
8. Projekte-Migration (→ Sprint 2)

### Out of Scope
- **Schema- oder Daten-Änderungen an agenda_items / journal_entries / projekte.** Diese Sprints laufen separat.
- **FR-Übersetzung von Dict-Files** (`src/i18n/dictionaries/fr.ts`) — nicht Content, sondern UI-Strings, existieren schon.
- **URL-Slug-Übersetzung.** `/fr/alit/` bleibt, kein `/fr/a-propos/`. Ein Sprint wert, aber gefährdet SEO-Stabilität.
- **Auto-Detect der Browser-Sprache oder Redirect-Logik.** Locale kommt weiterhin aus der URL.
- **Übersetzungs-Audit-Log** (wer hat wann was übersetzt).

## Technical Approach

### Architekturentscheidung: JSONB-per-field statt Row-per-Locale

**Gewählt:** JSONB-per-field. Eine Zeile pro logischer Entität, übersetzbare Felder als `{de, fr}`-JSONB.

**Warum:**
- Shared Metadata (sort_order, images, URLs, slugs, Datum/Ort) bleibt natürlich an einer Stelle — kein "sync reorder zwischen Locales"-Problem.
- Übersetzungsstatus trivial ableitbar (`!!content_i18n.fr`).
- Admin-UX: eine Zeile in der Liste mit zwei Badges statt zwei Zeilen (alit_sections aktuell) oder zwei getrennter Entities.
- Dashboard-Editor: Locale-Tab toggelt im selben Modal, kein Kontext-Switch.

**Verworfen — Row-per-Locale (aktuelles alit_sections-Pattern):**
- `sort_order` muss per-locale-scoped gepflegt werden (→ `sort_order`-Namespace-Pattern aus `database.md`). Fehlerquelle.
- Verbundene Metadaten (bei Agenda: datum/ort/images) müssten pro Locale dupliziert und manuell synchron gehalten werden.
- Listen-Rendering muss join/group-by machen um "eine Entität" darzustellen.

**Verworfen — Separate Translations-Tabelle (`i18n_alit_sections`):**
- Clean-normalisiert, aber jede Query braucht JOIN. Unnötige Komplexität bei 3-4 übersetzbaren Feldern.
- Kein Mehrwert gegenüber JSONB für diesen Use Case (wenige Sprachen, wenige Felder).

### Files to Change
| File | Change Type | Description |
|------|-------------|-------------|
| `src/lib/schema.ts` | Modify | `ALTER TABLE alit_sections ADD COLUMN title_i18n/content_i18n`, one-time backfill-migration aus alten Spalten (idempotent) |
| `src/lib/i18n-field.ts` | Create | `t(field, locale, fallback)` Helper + `isEmptyField(field)` Prädikat |
| `src/lib/i18n-field.test.ts` | Create | Unit-Tests: `t()` mit leer/nur-DE/nur-FR/beide, `isEmptyField()` für string + JournalContent |
| `src/lib/queries.ts` | Modify | `getAlitSections(locale)` liest aus `*_i18n` mit `t()`-Auflösung + DE-Fallback, returned schon locale-resolved |
| `src/app/api/dashboard/alit/route.ts` | Modify | Payload-Shape auf `*_i18n`, Response enthält `completion`-Flags |
| `src/app/api/dashboard/alit/[id]/route.ts` | Modify | PUT-Shape auf `*_i18n` |
| `src/app/dashboard/components/AlitSection.tsx` | Modify | Editor-Modal: Locale-Tabs + per-Locale Form-State, Liste mit DE/FR-Badges |
| `src/app/[locale]/alit/page.tsx` | Modify (falls nötig) | Locale aus params an `getAlitSections(locale)` durchreichen, `lang`-Attribut auf fallback-gerenderten Sektionen |

### Migration-Strategie

Dual-Column-Phase (Sprint 1 shippt das):
1. Neue Spalten `title_i18n`, `content_i18n` hinzufügen (NOT NULL DEFAULT '{}').
2. Idempotenter Backfill: für jede existierende Zeile Wert der alten Spalte unter key `locale` einfügen in `*_i18n`. Wenn zwei Zeilen dieselbe "logische" Entität sind (aktuell: alit_sections hat nur DE-Zeilen, also keine Kollision), mergen. Bei FR-Zeilen die parallel existieren: in dieselbe Zeile einmergen via `sort_order` als Matching-Key wenn gleiche Position — erstmal nur DE gespiegelt, FR-Zeilen werden im Dashboard re-populated oder via separatem Migration-Script (falls Prod schon FR-Daten hätte; aktuell nicht).
3. API schreibt fortan nur noch in die neuen Spalten (`*_i18n`). Alte Spalten werden aber nicht gedroppt — Backup-Lesbarkeit und Rollback-Fähigkeit bleiben erhalten.
4. Reader (`getAlitSections`) liest aus den neuen Spalten.

Cleanup der alten Spalten ist explizit Nice-to-have und kommt nach Sprint 4 (alle Tabellen migriert).

### Dashboard UX-Details

**Locale-Tabs im Editor:**
```
┌─────────────────────────────────────────┐
│ Über Alit bearbeiten              [X]   │
├─────────────────────────────────────────┤
│ [ DE ✓ ]  [ FR – ]                      │  ← aktive Tab hervorgehoben
├─────────────────────────────────────────┤
│ Titel (Deutsch)                         │
│ [ Impressum                           ] │
│                                         │
│ Content (Deutsch)                       │
│ [ Rich-Text-Editor …                  ] │
│                                         │
│                          [Abbrechen] [Speichern]
└─────────────────────────────────────────┘
```
- Tab-Wechsel ist **kein** Save-Trigger — Form-State hält beide Sprachen im Speicher, Save schreibt beide auf einmal.
- Tab-Badge "✓" / "–" zeigt **Live-Status des aktuellen Form-States**, nicht DB-State (damit sieht Admin sofort ob FR-Form noch leer ist).
- Kein Save-Button-Gate auf "alle Sprachen müssen ausgefüllt sein" — FR-only-Save, DE-only-Save, beides ok.

**Listen-Badges:**
```
┌──────────────────────────────────────────┐
│ ⋮⋮ Impressum             DE✓  FR✓   ✎ ×  │
│ ⋮⋮ Newsletter            DE✓  FR–   ✎ ×  │
│ ⋮⋮ Mitgliedschaft        DE✓  FR–   ✎ ×  │
└──────────────────────────────────────────┘
```
- Grüner Haken: non-empty-content für die Locale.
- Grauer Strich: leer / nie ausgefüllt.
- Badges sind nicht klickbar (nur Status-Indikator). Klick auf Edit öffnet Modal, dort Tab-Wechsel.

### Dependencies
- Keine neuen Env Vars. Kein Package-Add geplant (Tests via vitest wie bisher).
- Pattern-Referenzen: `database.md` (Schema-Migration additive), `nextjs.md` (force-dynamic bleibt auf sitemap/robots, betrifft /alit nicht), `admin-ui.md` (Locale-Tab = Structured Section Pattern: content-keyed, nicht positions-keyed).

## Edge Cases
| Case | Expected Behavior |
|------|-------------------|
| Sektion existiert nur in DE, User besucht `/fr/alit` | DE-Inhalt rendert mit `lang="de"` Attribut auf dem Abschnitt-Wrapper |
| Sektion existiert nur in FR, User besucht `/de/alit` | DE-Fallback: leerer Titel/leerer Content → Sektion wird **nicht gerendert** (skipped). Alternative "FR rendern mit lang=fr" wäre verwirrend für DE-Besucher |
| Admin erstellt neue Sektion, füllt nur DE | Liste: DE✓ FR–. `/fr/alit` fällt zurück auf DE |
| Admin speichert Sektion mit leerem Titel aber Content | Erlaubt (existing behavior: title ist nullable → Intro-Style-Render). JSONB-Shape: `title_i18n = {}` oder `{de: null}` — beide als "kein Titel" behandelt |
| Zwei Admins bearbeiten gleichzeitig verschiedene Locales | Last-write-wins auf Row-Ebene: PUT sendet komplettes `{de, fr}`-Objekt → überschreibt parallele FR-Änderungen vom anderen Admin. Akzeptiert als Known-Limit (nur 1 Admin aktuell) |
| Migration läuft zweimal (re-deploy) | Idempotent: `ADD COLUMN IF NOT EXISTS` + Backfill prüft ob `*_i18n` bereits populiert ist, überschreibt nicht |
| FR-Build/Deploy ohne Content in DB | `/fr/alit` rendert leer statt crash — Reader muss leere Array-Response korrekt handhaben |
| Dashboard-Session mit FR-Browser-Locale | Locale-Tabs zeigen immer "DE" | "FR" (Content-Sprache), unabhängig von Dashboard-UI-Sprache |

## Risks
- **Migration mergt falsch:** Wenn Prod-DB FR-Zeilen enthielte (aktuell nein, aber Staging möglicherweise), könnte Auto-Merge nach `sort_order` falsch zuordnen. **Mitigation:** Migration-Script vor Ausführung Zeilen zählen; wenn >1 Zeile für selbe sort_order existiert → abort mit Fehler statt raten. Admin kann manuell re-populieren.
- **Alter Code (Consumer von `title`/`content` direkt) bleibt bestehen** während Dual-Write-Phase. **Mitigation:** `queries.ts` ist Single-Read-Path, Änderung dort verbreitet sich automatisch. Server-Action/Route-Consumer auditieren (grep `alit_sections`).
- **Rich-Text-Editor mit Per-Locale-State:** Wenn Editor-Component `content` als Prop nimmt und intern mit `contentEditable` arbeitet, kann Tab-Wechsel die Cursor-Position / Undo-Stack killen. **Mitigation:** Beim Tab-Wechsel aktuellen Editor-Inhalt nach State committen, beim Re-Mount mit neuem Locale-Content frisch initialisieren. Akzeptiere: Undo-Stack geht pro Tab-Wechsel verloren (dokumentiert, bewusst).
- **Invisible FR-Content in Admin-Liste** bei DE-only Fokus: Badges müssen prominent sein, sonst merkt Admin nicht wo FR fehlt. **Mitigation:** Badges rechts neben Titel + Spalte „Übersetzungsstatus" im Hover-Tooltip.

## Phasen-Roadmap (Info, nicht Teil des Sprint Contracts)

Sprint 2 (Projekte) — nach Sprint 1 clean-through:
- Felder übersetzbar: `titel`, `kategorie` (?), `paragraphs`, `content`. Slug bleibt fix.
- Kleinster Migration-Aufwand (keine bestehenden FR-Zeilen) → nächste Sprint.

Sprint 3 (Agenda) — komplexer:
- Übersetzbar: `titel`, `lead`, `beschrieb`, `content`, `ort` (evtl.).
- Nicht übersetzbar: `datum`, `zeit`, `ort_url`, `images`, `hashtags`.

Sprint 4 (Journal / Discours Agités):
- Übersetzbar: `title`, `author` (bei Gast-Autor evtl. nein), `lines`, `content`, `footer`.
- `date` bleibt, `hashtags` bleiben.

Nach Sprint 4: Cleanup der alten Spalten (Legacy-`title`/`content`/`locale`) in einem Hardening-Sprint. Optional: Translation-Progress-Dashboard als Nice-to-have.
