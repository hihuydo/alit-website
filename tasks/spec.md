# Spec: Multi-Locale Rollout Projekte (Sprint 2 von ~4)
<!-- Created: 2026-04-15 -->
<!-- Author: Planner (Claude) -->
<!-- Status: Draft -->

## Summary
Zweiter Schritt der i18n-Migration: `projekte` bekommt JSONB-per-field für die übersetzbaren Felder (`title_i18n`, `content_i18n`), analog zum Sprint-1-Pattern auf `alit_sections`. Dashboard-Editor bekommt DE/FR-Tabs, Liste zeigt Completion-Badges, Public-Rendering nutzt DE-Fallback via `t()`. Agenda (Sprint 3) und Journal (Sprint 4) folgen danach.

## Context
- Schema `projekte` (siehe `src/lib/schema.ts:40-51`): `slug`, `titel TEXT NOT NULL`, `kategorie TEXT NOT NULL`, `paragraphs JSONB` (legacy plaintext-Array), `content JSONB` (Rich-Text, optional), `external_url`, `archived`, `sort_order`. **Keine `locale`-Spalte** — anders als `alit_sections` ist `projekte` seit jeher single-locale-per-row, also keine FR-Precondition-Klausel wie in Sprint 1 nötig (idempotenter Skip bleibt trotzdem drin).
- Dashboard-UI (`ProjekteSection.tsx`): ein Formular mit Titel, Slug, Kategorie, URL, Rich-Text-Editor, Archiviert-Flag. Kein Locale-Picker. `creating`-Flow auto-sluggt, `editing`-Flow macht Slug read-only (Slug bleibt fix).
- Public-Rendering (`ProjekteList.tsx`): liest `content`-Blöcke via `JournalBlockRenderer`, fällt bei leerem `content` auf `paragraphs` zurück. Wird vom `Wrapper` auf **jeder** Route in Panel 3 gerendert (nicht nur `/projekte`).
- i18n-Helper (`src/lib/i18n-field.ts`) + Alit-Reader-Pattern (`getAlitSections(locale)`) existieren bereits aus Sprint 1 → wiederverwenden.
- `projekte`-Slug ist URL-stabil und **darf nicht übersetzt werden** (SEO, Hashtag-Referenzen aus Agenda/Journal). Siehe Sprint-1 Spec "Out of Scope — URL-Slug-Übersetzung".

### Feld-Klassifikation
| Feld | Übersetzbar? | Begründung |
|------|--------------|------------|
| `titel` | ✅ ja | Anzeigen-Text, DE/FR unterscheiden sich |
| `kategorie` | ✅ ja | Werte wie "Publikationsreihe", "Anthologie" werden vom Admin manuell FR übersetzt |
| `content` (Rich-Text) | ✅ ja | Hauptinhalt |
| `paragraphs` (legacy) | ❌ DE-only (legacy-fallback) | Plain-String-Array, wird durch `content_i18n` abgelöst. Bleibt als Read-Fallback für Projekte, die noch kein Rich-Text haben. In Sprint 2 werden keine neuen paragraphs mehr gefüllt — Editor schreibt ausschließlich `content_i18n`. |
| `slug` | ❌ nie | URL-Stabilität |
| `external_url` | ❌ | URL pro Projekt, nicht pro Locale |
| `archived`, `sort_order`, `id` | ❌ | Entity-Metadata, shared |

## Requirements

### Must Have (Sprint Contract)
1. **DB-Migration `projekte` auf JSONB-per-field**
   - Additive `ALTER TABLE`: `title_i18n JSONB NOT NULL DEFAULT '{}'::jsonb`, `kategorie_i18n JSONB NOT NULL DEFAULT '{}'::jsonb`, `content_i18n JSONB NOT NULL DEFAULT '{}'::jsonb`.
   - Idempotenter Backfill in `schema.ts`: für jede Row mit `content_i18n = '{}' AND title_i18n = '{}' AND kategorie_i18n = '{}'` → `title_i18n = {de: titel}`, `kategorie_i18n = {de: kategorie}`, `content_i18n = {de: content ?? <derived-from-paragraphs>}`. Zeilen mit bereits befüllten `*_i18n`-Spalten werden nicht angefasst (Re-Run-Safe).
   - `paragraphs`-Derivation: Wenn `content` NULL/leer ist, baue `content_i18n.de` aus `paragraphs` als einfaches `JournalContent`-Array (je Paragraph ein `paragraph`-Block mit `content: [{text: "...", bold: false, italic: false}]`). Logik in reiner SQL nicht zumutbar → als JS-Loop in `schema.ts` nach dem `ALTER TABLE`, analog zum Media-`public_id`-Backfill-Pattern in derselben Datei.
   - Alte Spalten (`titel`, `paragraphs`, `content`) bleiben bestehen (Dual-Column-Phase, Cleanup nach Sprint 4).
2. **API `/api/dashboard/projekte/` akzeptiert multi-locale Payload**
   - `POST` / `PUT` empfängt `{ title_i18n: {de, fr}, kategorie_i18n: {de, fr}, content_i18n: {de, fr}, slug, external_url, archived }`. Alte Payload-Form (`titel`, `kategorie`, `content`, `paragraphs`) wird nicht mehr akzeptiert — Dashboard ist einziger Client, bekommt neue Form.
   - **Dual-Write für Legacy-Spalten** (analog Sprint 1): Server schreibt zusätzlich `titel = title_i18n.de ?? title_i18n.fr ?? ''`, `kategorie = kategorie_i18n.de ?? kategorie_i18n.fr ?? ''`, `content = content_i18n.de ?? null`. `paragraphs` bleibt bei neuen Edits unverändert (oder `'[]'::jsonb` bei Insert) — Legacy-Read-Fallback ist DE-only. Rationale: ermöglicht Rollback auf alten Reader-Code ohne Datenverlust, bis Sprint 4 abgeschlossen ist.
   - `GET /api/dashboard/projekte/` returnt vollständige `title_i18n`/`kategorie_i18n`/`content_i18n` + abgeleitete `completion: {de, fr}`-Flags (`content_i18n[locale]` non-empty — Completion bleibt content-basiert, kategorie allein reicht nicht).
3. **Helper `contentBlocksFromParagraphs(paragraphs: string[])`** in `src/lib/i18n-field.ts` (oder neuem `src/lib/projekte-migration.ts`)
   - Pure function: `string[]` → minimales `JournalContent`-Array. Unit-Tests für leeres Array, einzelnen Paragraph, Special-Chars.
   - Wiederverwendet von Migration-Code + optional vom Editor-Open-Path (aktuell `linesToHtml` → `htmlToBlocks`, aber für Konsistenz).
4. **Dashboard `ProjekteSection.tsx` mit Locale-Tabs**
   - Editor-Form oben: Tabs `[DE ✓] [FR –]` (mit Live-Completion-Indikator aus Form-State, basiert auf `html` non-empty).
   - **Parallel-mounted Editors**: pro Locale je ein `<RichTextEditor>` + Titel-Input + Kategorie-Input, inaktive via `hidden`-Attribut (kein Remount-Data-Loss — siehe `memory/lessons.md` 2026-04-15 "Multi-Locale Form"). Titel- und Kategorie-Inputs sind zwar nicht async/debounced, werden aber der Konsistenz halber auch parallel gemounted.
   - Form-State: `{slug, external_url, archived, de: {titel, kategorie, html}, fr: {titel, kategorie, html}}`. Save sendet `title_i18n` + `kategorie_i18n` + `content_i18n` beider Sprachen.
   - Slug, URL, Archiviert-Flag sind **eine** Instanz (nicht per-locale).
   - Listen-Row zeigt pro Projekt zwei Status-Badges (DE✓/– und FR✓/–), analog `AlitSection.tsx`.
   - Edit-Open liest aus `item.title_i18n` + `item.content_i18n`, keine paragraphs-Migration im Client mehr nötig (schon von Server-Migration erledigt).
5. **`getProjekte(locale)` locale-aufgelöst**
   - Signature ändert sich: `getProjekte(locale: Locale): Promise<Projekt[]>`. Returned `{slug, titel, kategorie, paragraphs, content, externalUrl, archived, isFallback}` — `titel`, `kategorie` und `content` bereits via `t()` aufgelöst, `isFallback: boolean` pro Entity (true wenn `content_i18n[locale]` leer war und DE-Fallback griff — title/kategorie-only-Fallback triggert isFallback nicht, da Content der Haupt-Sprachträger ist).
   - Aufrufer in `src/app/[locale]/layout.tsx` reicht `locale` durch.
6. **Public-Rendering: `/fr/projekte` zeigt FR-Inhalte mit DE-Fallback + `lang="de"` auf Fallback-Wrappern**
   - `ProjekteList`-Item mit `isFallback=true` bekommt `lang="de"`-Attribut auf dem Wrapper-`<div>`. Andernfalls kein `lang`-Attribut (erbt `<html lang>`).
   - Projekt mit leerem DE UND FR wird **nicht gerendert** (wie in Alit-Pattern). Analog wenn `titel` komplett leer ist — unwahrscheinlich, aber defensiv handhaben.
   - `paragraphs`-Legacy-Fallback bleibt im Client — aber nur noch als Safety-Net für den Fall, dass `content_i18n` leer ist UND Legacy-`paragraphs` existiert. In der Praxis nach Migration nie der Fall (Migration füllt `content_i18n.de` aus paragraphs).
7. **Dashboard Slug-Kollisions-UX** (ursprünglich als Follow-up aus PR #32 in `memory/todo.md`, wird hier mitgenommen weil wir `POST`/`PUT` eh anfassen)
   - Wenn `POST /api/dashboard/projekte/` 409 returnt: Slug-Feld im Form wird eingeblendet (bei `creating` sonst versteckt), vorbefüllt mit Auto-Slug, editierbar. Fehlermeldung "Slug bereits vergeben — bitte anpassen".
   - Nice-to-have-Verschärfung, aber klein genug um im selben Sprint mitzulaufen.
8. **Build grün + existierende Routes unverändert funktional**
   - `pnpm build` ohne Fehler.
   - `pnpm test` grün (neue Tests für `contentBlocksFromParagraphs`).
   - `/de/projekte`, `/de/projekte/<slug>`, Panel-3-List auf `/de/*` rendern **visuell identisch** zu pre-Sprint.
   - `/fr/projekte` rendert alle Projekte mit DE-Content und `lang="de"`-Fallback-Wrappern (bis Admin FR-Übersetzungen eingibt).

### Nice to Have (explicit follow-up, NOT this sprint)
1. **`paragraphs`-Spalten-Drop** — erst nach Sprint 4 (alle Tabellen migriert).
3. Translation-Progress-Dashboard (Sprint 1 Nice-to-have, weiterhin offen).
4. FR-`paragraphs_i18n` falls irgendwer entscheidet, dass Legacy-Paragraphs doch pro Locale differieren sollen. Unwahrscheinlich — `paragraphs` ist faktisch eingefroren.
5. `hreflang`-Alternate-Links auf `<head>` von Projekte-Detail-Seiten — SEO-Sprint nach Sprint 4.

### Out of Scope
- **Schema-Änderungen an `agenda_items` / `journal_entries` / `alit_sections`** — Sprint 3/4.
- **URL-Slug-Übersetzung** (`/fr/projets/...`) — wie in Sprint 1 out-of-scope.
- **Automatische Übersetzungsvorschläge** (DeepL/Claude API).
- **Bulk-Re-Order im Dashboard** — Reorder bleibt single-locale-agnostisch (ein `sort_order` pro Entity, wie aktuell).
- **Migration von bestehenden `content`-JSONB zu lokalisierter Form rückwärts-kompatibel lesbar halten** — Nein, nach Migration ist `content_i18n` Source-of-Truth. `content`-Spalte bleibt beschrieben (Dual-Write), aber Reader nutzt nur `content_i18n`.
- **Rename von `projekte`-Fields auf englisch** — bleibt deutsch (`titel`, `kategorie`), keine Gelegenheits-Refactors.

## Technical Approach

### Migration (in `src/lib/schema.ts` nach dem bestehenden Alit-Migration-Block)

```sql
-- 1. Additive Spalten
ALTER TABLE projekte
  ADD COLUMN IF NOT EXISTS title_i18n     JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS kategorie_i18n JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS content_i18n   JSONB NOT NULL DEFAULT '{}'::jsonb;
```

Anschließend in JS (weil JournalContent-Derivation aus `paragraphs` in SQL hässlich ist):

```ts
// Idempotent: nur Zeilen anfassen die noch nicht migriert sind
const { rows: toMigrate } = await pool.query(`
  SELECT id, titel, kategorie, paragraphs, content FROM projekte
  WHERE title_i18n = '{}'::jsonb
    AND kategorie_i18n = '{}'::jsonb
    AND content_i18n = '{}'::jsonb
`);
for (const row of toMigrate) {
  const contentBlocks = (row.content && Array.isArray(row.content) && row.content.length > 0)
    ? row.content
    : contentBlocksFromParagraphs(row.paragraphs ?? []);
  await pool.query(
    `UPDATE projekte
       SET title_i18n     = jsonb_build_object('de', $1::text),
           kategorie_i18n = jsonb_build_object('de', $2::text),
           content_i18n   = jsonb_build_object('de', $3::jsonb)
     WHERE id = $4`,
    [row.titel, row.kategorie, JSON.stringify(contentBlocks), row.id],
  );
}
```

Keine FR-Precondition-Abort nötig (kein `locale`-Spalte in `projekte`). Idempotenz via `WHERE *_i18n = '{}'`.

### Files to Change

| File | Change Type | Description |
|------|-------------|-------------|
| `src/lib/schema.ts` | Modify | `ALTER TABLE projekte ADD COLUMN title_i18n/kategorie_i18n/content_i18n` + JS-Loop-Backfill |
| `src/lib/i18n-field.ts` | Modify | `contentBlocksFromParagraphs(paragraphs: string[]): JournalContent` hinzufügen (oder in eigenes File `projekte-migration.ts`) |
| `src/lib/i18n-field.test.ts` | Modify | Unit-Tests für `contentBlocksFromParagraphs` |
| `src/lib/queries.ts` | Modify | `getProjekte(locale: Locale)` liest `*_i18n`, resolved via `t()`, returned `isFallback`-Flag |
| `src/content/projekte.ts` | Modify | `Projekt`-Type um `isFallback?: boolean` erweitern. `projekte`-Konstante (Seed-Data) bleibt im aktuellen Shape — wird von der Seed-Logik in `src/lib/seed.ts` (falls genutzt) in `*_i18n` geschrieben. **Check ob seed.ts `projekte` benutzt** und anpassen. |
| `src/app/api/dashboard/projekte/route.ts` | Modify | POST/GET-Payload auf `*_i18n` + Dual-Write Legacy; GET returnt `completion`-Flags |
| `src/app/api/dashboard/projekte/[id]/route.ts` | Modify | PUT-Payload auf `*_i18n` + Dual-Write Legacy |
| `src/app/dashboard/components/ProjekteSection.tsx` | Modify | Form-State per-locale, Tabs mit parallel-mounted Editors, Completion-Badges in Listen-Row, Slug-Konflikt-UX (409-Handling) |
| `src/app/[locale]/layout.tsx` | Modify | `getProjekte(locale)` statt `getProjekte()` |
| `src/components/ProjekteList.tsx` | Modify | `lang="de"` auf Fallback-Wrappern wenn `p.isFallback` |
| `src/app/[locale]/projekte/[slug]/page.tsx` | No change | Slug-Check ist locale-agnostisch, bleibt |

### Architecture Decisions
- **Einheitliches JSONB-per-field-Pattern** wie Sprint 1 — bewährt, Codex-clean reviewed, reduziert kognitive Last.
- **Paragraphs→Content-Migration im Schema-Init**, nicht im Client: Server-Migration ist einmalig, deterministisch, vor Rollout prüfbar. Client-seitige Migration wäre ein Trust-Boundary-Bruch (Admin-JS könnte die Form nie erreichen → stale Daten).
- **`kategorie` bleibt single-locale** — bewusste Scope-Entscheidung, um Sprint klein zu halten. Follow-up dokumentiert.
- **Slug bleibt single-locale** — SEO-Stabilität, Hashtag-Referenzen aus Agenda/Journal zeigen auf `slug`, nicht auf lokalisierten Pfad.

### Dependencies
- Keine neuen npm-Packages.
- Keine neuen Env Vars.
- Pattern-Referenzen: `database.md` (additive migration), `admin-ui.md` (Structured Section Pattern, content-keyed Rendering), `memory/lessons.md` 2026-04-15 (JSONB-per-field, parallel-mounted editors, Schema-Migration Re-Run-Safety).

## Edge Cases
| Case | Expected Behavior |
|------|-------------------|
| Projekt existiert nur in DE, User besucht `/fr/projekte` | DE-Content rendert mit `lang="de"` auf Wrapper |
| Projekt mit leerem DE + leerem FR (kaputt/ungepflegt) | Wird nicht gerendert (skipped) — analog Alit |
| Admin öffnet bestehendes Projekt (Pre-Migration-Zustand, sollte nicht vorkommen weil Migration im Bootstrap läuft) | Migration läuft im `schema.ts` beim App-Start, also kein Pre-Migration-State im Runtime. Falls doch (z.B. neu angelegte Prod-DB ohne Backfill): `title_i18n.de` wird `""` sein → Tab zeigt "DE –". |
| Admin speichert mit leerem DE-Titel, gefülltem FR-Titel | Erlaubt. Listen-Badges: DE –, FR ✓. Public `/de/projekte` fällt mangels DE-Content auf … nichts zurück (FR wäre falsche Sprache für DE-Besucher) → skipped. `/fr/projekte` zeigt FR. |
| Admin ändert Kategorie | Kategorie ist single-locale, Änderung gilt für beide Sprach-Views. |
| Admin ändert Slug | Slug ist editierbar nur über Kollisions-UX im Create-Flow. Im Edit-Modus read-only (wie jetzt). |
| Zwei Admins editieren parallel DE und FR | Last-write-wins auf Row-Ebene. Akzeptiert (single-Admin-Realität). |
| Migration läuft zweimal (Container-Neustart) | Idempotent: `WHERE *_i18n = '{}'` — zweiter Run touched nichts. |
| Projekt hat `content` als leeren Array `[]` + nicht-leere paragraphs | Backfill nutzt paragraphs-Derivation (Content-Check: `content && Array.isArray && length > 0`). |
| Projekt hat NULL-paragraphs und NULL-content | `contentBlocksFromParagraphs([])` returnt `[]` → `content_i18n.de = []`. Render fällt auf "nicht rendern" zurück. |
| Slug-Kollision beim Erstellen | POST 409 → Slug-Feld einblenden, vorbefüllt mit Auto-Slug, editierbar. Nach manueller Anpassung erneuter Submit. |

## Risks
- **Paragraphs-Derivation produziert ungewollte Block-Struktur** (z.B. Markdown-Artefakte in `paragraphs` werden nicht interpretiert, landen als Plain-Text). **Mitigation:** Akzeptiert — aktuelle `paragraphs` sind bereits Plain-Text ohne Markdown-Semantik (Seed-Daten und Admin-Input historisch). Tests auf Edge Cases (Special-Chars, leere Strings, undefined).
- **Dashboard-Form wird komplexer** (zwei Editor-Instanzen + verschachtelter State). **Mitigation:** State-Shape explizit typisieren, Save-Handler sendet komplettes `{de, fr}`-Paar. Wiederverwendet Pattern aus `AlitSection.tsx`.
- **Public `ProjekteList` erwartet heute `projekte: Projekt[]` mit locale-agnostischen Feldern.** Signature bleibt kompatibel (Felder `titel`, `content`, `paragraphs` sind weiter da — jetzt bereits locale-aufgelöst vom Server).
- **`ProjekteList` ist Client-Component** und bekommt `isFallback` als neues optionales Prop — keine Breaking-Changes, aber `lang`-Attribut nur rendern wenn truthy (vermeidet React-Hydration-Mismatch).
- **Seed-Script (`src/lib/seed.ts`) ist potenziell inkompatibel** mit neuem API-Shape. **Mitigation:** vor Start prüfen, ob seed.ts existiert und projekte-Writes macht. Ggf. im Sprint mit anpassen.
- **Slug-Kollisions-UX** ist Scope-Creep-Risiko. Klein halten: Feld einblenden + editierbar machen, keine Auto-Suggestion-Logic. Bei Zeitdruck rausziehen und als Follow-up belassen.

## Phasen-Roadmap (Info, nicht Teil des Sprint Contracts)
- **Sprint 3 (Agenda)** — `titel`, `lead`, `content`; `datum`/`zeit`/`ort`/`images`/`hashtags` single-locale.
- **Sprint 4 (Journal)** — `title`, `lines`/`content`, evtl. `author`, `footer`; `date`/`hashtags`/`authorSlug` single-locale.
- **Nach Sprint 4** — Cleanup-Sprint: alte Spalten droppen (`titel`, `content`, `paragraphs`, `title`, `lines` etc.), optional `kategorie_i18n` / `paragraphs_i18n` falls Bedarf, Translation-Progress-Dashboard.
