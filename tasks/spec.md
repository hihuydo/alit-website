# Spec: Multi-Locale Rollout Journal (Sprint 4 von 4)
<!-- Created: 2026-04-15 -->
<!-- Author: Planner (Claude) -->
<!-- Status: Draft -->

## Summary
Letzter Entity-Sprint der i18n-Migration: `journal_entries` bekommt JSONB-per-field für `title`, `content` und `footer` (legacy `lines` wird in `content_i18n.de` derived). Journal-Hashtags werden auf die in Sprint 3 etablierte `{tag_i18n, projekt_slug}`-Shape migriert. **`author` bleibt single-locale** (personale Gast-Autor:innen). Nach diesem Sprint ist die i18n-Foundation vollständig und der Cleanup-Sprint (Legacy-Spalten droppen) kann folgen.

## Context
- Schema `journal_entries` (`src/lib/schema.ts:26-39`): `date TEXT NOT NULL`, `author TEXT` (nullable), `title TEXT` (nullable), `title_border BOOLEAN`, `lines JSONB` (legacy plain-text-Array), `images JSONB` (nullable — `{src, afterLine}[]`), `content JSONB` (Rich-Text, nullable), `footer TEXT` (nullable), `hashtags JSONB` (`{tag, projekt_slug}[]` — alt-Shape), `sort_order INT`.
- Prod-Data: Autor:innen sind reale Personen — `Annette Hug`, `Donat Blum`, `Elisabeth Wandeler-Deck`, `Jens Nielsen`, `Parwana Amiri`, `Reto Sorg und Michel Mettler`. Personennamen **übersetzen nicht**, also `author` bleibt single-locale.
- Dashboard-Component `JournalEditor.tsx` (329 Zeilen) hat **Debounced Auto-Save** (`setTimeout` + `doAutoSave.current`-Ref-Pattern, siehe `lessons.md` 2026-04-14 "Ref-Mutation during render → use Effect"). Preview via `JournalPreview.tsx`. Hashtag-Editor inline (nicht `HashtagEditor`-Component — muss in Sprint 4 migriert werden).
- Spec-relevante vergangene Lessons:
  - `lessons.md` 2026-04-14 "Autosave mit optionalen Feldern gegen Datenverlust": incomplete drafts dürfen **nicht** als leere Arrays gesendet werden, sondern `undefined` (JSON.stringify dropt sie).
  - `lessons.md` 2026-04-14 "Media-Usage-Scan muss alle Tabellen mit Media-Refs decken": nicht betroffen (kein Schema-Rename).
  - Sprint-2/3-Lessons präventiv: null-guard, dual-write-read-isolation, per-field lang, HashtagEditor `showI18n`-Prop wiederverwenden.
- Reader `getJournalEntries()` (`src/lib/queries.ts:90-107`): returnt `JournalEntry[]` mit Legacy-Shape. Wrapper rendert auf Panel 2 (`/de/`, `/fr/`).

### Feld-Klassifikation
| Feld | Übersetzbar? | Begründung |
|------|--------------|------------|
| `title` | ✅ ja | Eintrag-Titel, oft DE/FR unterschiedlich |
| `content` (Rich-Text) | ✅ ja | Hauptinhalt |
| `lines` (legacy) | ❌ DE-only (legacy-Fallback) | Plain-String-Array. Wird bei Migration in `content_i18n.de` derived via `contentBlocksFromParagraphs`. Spalte bleibt unangetastet (Rollback). |
| `footer` | ✅ ja | Footer-Text unter Einträgen |
| `hashtags[]` | ⚠️ teilweise | Wie in Sprint 3: `tag_i18n: {de, fr}` pro Hashtag-Entry, `projekt_slug` single-locale. Shape-Migration in-place. |
| `author` | ❌ | **Personale Autor:innen** (Annette Hug, Donat Blum, …). Namen übersetzen nicht. Falls später "Editorial-Team" / "Die Redaktion" als Platzhalter genutzt wird → eigener Mini-Sprint. |
| `date` | ❌ | ISO-Date, Formatierung client-side. |
| `title_border` | ❌ | Boolean, UI-Flag. |
| `images` | ❌ | `{src, afterLine}[]` — Referenzen + Positions-Index. `alt` gibt's hier nicht (Image-Schema von Agenda unterscheidet sich). |
| `sort_order` | ❌ | Entity-Metadata. |

## Requirements

### Must Have (Sprint Contract)
1. **DB-Migration `journal_entries` auf JSONB-per-field**
   - Additive `ALTER TABLE`: `title_i18n`, `content_i18n`, `footer_i18n` — alle `JSONB NOT NULL DEFAULT '{}'::jsonb`.
   - Idempotenter JS-Backfill: für Rows mit allen drei `*_i18n = '{}'` → `{de: <legacy>}` kopieren. `content_i18n.de` wird aus `content` (falls non-empty) ODER `lines` via `contentBlocksFromParagraphs` derived.
   - **Hashtag-Shape-Migration auf `journal_entries.hashtags`**: identisch zu Sprint 3 — `{tag, projekt_slug}[]` → `{tag_i18n: {de: tag, fr: tag}, projekt_slug}[]`. Idempotent via `typeof h.tag === 'string'`-Check.
   - Empty-String-Behandlung: leere legacy-Werte → `{}` (nicht `{de: ""}`).
   - Legacy-Spalten (`title`, `lines`, `content`, `footer`, `hashtags`) bleiben bestehen (Dual-Column-Phase).
2. **API `/api/dashboard/journal/` akzeptiert multi-locale Payload**
   - POST/PUT empfangen `{title_i18n, content_i18n, footer_i18n, date, author, title_border, images, hashtags}`. Alte Felder (`title`, `lines`, `content`, `footer`) werden nicht mehr akzeptiert. `author` bleibt als String.
   - **Validator-Regel (Sprint-2-Lesson):** `undefined = skip`, `null = 400 invalid` für i18n-Objekte.
   - **Hashtag-Validator:** wiederverwendet `validateHashtagsI18n` aus `src/lib/agenda-hashtags.ts` (identisches Allowlist-Verhalten).
   - **Dual-Write für Legacy-Spalten:** `title = pickLegacy(title_i18n)`, `content = pickLegacyContent(content_i18n)`, `footer = pickLegacy(footer_i18n)`. `lines` bleibt bei `'[]'::jsonb` bei Insert, unverändert bei Update.
   - GET returnt `*_i18n`-Spalten + `completion: {de, fr}` (content-basiert).
3. **Reader `getJournalEntries(locale)` locale-aufgelöst + per-field Fallback-Flags**
   - Signatur ändert: `getJournalEntries(locale: Locale): Promise<JournalEntry[]>`.
   - `JournalEntry` erweitert um `titleIsFallback`, `contentIsFallback`, `footerIsFallback`.
   - DE-Locale-Isolation: wenn DE-Content UND DE-Title beide leer → Entry skipped (kein FR→DE Reverse-Fallback).
   - Legacy-Spalten werden **nicht gelesen** — `*_i18n` ist Source-of-Truth post-Migration.
   - **Hashtag-Resolution:** Reader transformiert `{tag_i18n, projekt_slug}[]` zurück zu Public-Shape `{tag, projekt_slug}[]` mit `t(h.tag_i18n, locale)` — identisch zu Sprint 3 Agenda-Transform. Public-Komponenten (`JournalPreview.tsx` + Wrapper-Rendering auf Panel 2) bleiben auf Legacy-Shape.
4. **Dashboard `JournalEditor.tsx` + `JournalSection.tsx` mit Locale-Tabs**
   - Tabs `[DE ✓] [FR –]` mit Live-Completion (content-basiert).
   - **Parallel-mounted per Locale:** Title-Input, Footer-Textarea, RichTextEditor — pro Locale eine Instanz, inaktive via `hidden`.
   - **Auto-Save-Safe-Pattern:** Payload sendet `*_i18n`-Objekte nur wenn non-empty. Bei incomplete FR-Draft → `{de: <...>, fr: null}` statt komplett-leer — **aber:** mein Dashboard-Pattern ist "beide Sprachen immer senden", wir haben kein Feld-Weglassen wie Agenda-Hashtags. Stattdessen: Server-seitig `{de: "", fr: ""}` = cleared; Server ignoriert beim PUT nicht-gesendete Keys (undefined = skip). Incomplete-Draft-Schutz greift nicht für volle i18n-Objekte. Für Hashtag-Drafts weiterhin Filter mit "DE must be set".
   - Shared Felder (Date, Author, Title-Border, Images) sind **eine** Instanz (single-locale).
   - Hashtag-Editor: `HashtagEditor`-Component wiederverwenden (aus Sprint 3) — ersetzt die aktuelle inline-Hashtag-Logik in `JournalEditor.tsx`. Mit `showI18n` aktiv.
   - Listen-Row (`JournalSection.tsx`) zeigt Completion-Badges DE/FR.
5. **Public-Rendering: Per-Feld `lang="de"`-Attribute auf Fallback-Wrappern**
   - Wrapper rendert Journal-Einträge auf Panel 2. Per-Feld-lang auf `<h2>` (title), `<div>` (content), `<p>` (footer).
   - Für Legacy-Lines-Fallback-Rendering: sollte nicht mehr auftreten nach Migration, aber defensiv Wrapper mit `lang="de"` wenn `contentIsFallback`.
6. **Seed-Sync:** `src/lib/seed.ts` schreibt Journal auch direkt in `*_i18n` + neue Hashtag-Shape.
7. **Build grün + 52 Tests grün + existierende Routes unverändert funktional**
   - `pnpm build`, `pnpm test`.
   - `/de/` (Journal auf Panel 2) visuell identisch.
   - `/fr/` rendert Journal mit DE-Fallback + per-Feld `lang="de"`-Attributen.

### Nice to Have (explicit follow-up, NOT this sprint)
1. **Cleanup-Sprint** — nach Sprint 4: Legacy-Spalten droppen (`titel`, `title`, `lines`, `paragraphs`, `beschrieb`, `content` etc.), Dual-Write entfernen, Reader-Fallback-Handling vereinfachen. Separater PR mit irreversibler DB-Änderung — braucht Backup-Check.
2. **Translation-Progress-Dashboard** — zentrale Übersicht über Completion aller Entities (Alit/Projekte/Agenda/Journal) mit DE/FR-Status pro Zeile. Sprint-1-Nice-to-have, bleibt offen.
3. **Author-Role-Translation** — falls Editorial-Labels ("Die Redaktion") eingeführt werden.
4. **Images `alt`-Text-Übersetzung** — sowohl für Agenda als auch Journal.
5. **URL-Slug-Übersetzung** — weiterhin offen, siehe `memory/todo.md`.

### Out of Scope
- **Schema-/Datenänderungen an alit_sections/projekte/agenda_items** — alle drei sind bereits migriert.
- **Author-Feld als übersetzbar** — siehe oben, Rationale.
- **Journal-Image-Schema-Erweiterung** (z.B. alt-Texte) — Journal-Images sind `{src, afterLine}[]` ohne Metadaten, Erweiterung ist ein eigenes Thema.
- **Legacy-Spalten-Cleanup** — Follow-up-Sprint.

## Technical Approach

### Migration (in `src/lib/schema.ts` nach agenda-Block)

```sql
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS title_i18n   JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS content_i18n JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS footer_i18n  JSONB NOT NULL DEFAULT '{}'::jsonb;
```

JS-Loop-Backfill analog Agenda-Sprint:
```ts
const { rows: toMigrate } = await pool.query(`
  SELECT id, title, lines, content, footer FROM journal_entries
  WHERE title_i18n='{}'::jsonb AND content_i18n='{}'::jsonb AND footer_i18n='{}'::jsonb
`);
for (const row of toMigrate) {
  const contentBlocks = Array.isArray(row.content) && row.content.length > 0
    ? row.content
    : contentBlocksFromParagraphs(Array.isArray(row.lines) ? row.lines : []);
  await pool.query(`
    UPDATE journal_entries
       SET title_i18n   = $1::jsonb,
           content_i18n = $2::jsonb,
           footer_i18n  = $3::jsonb
     WHERE id = $4
  `, [
    JSON.stringify(row.title ? {de: row.title} : {}),
    JSON.stringify({de: contentBlocks}),
    JSON.stringify(row.footer ? {de: row.footer} : {}),
    row.id,
  ]);
}
```

Hashtag-Shape-Migration auf `journal_entries.hashtags` — **identischer Code** wie Sprint 3 auf `agenda_items.hashtags`. Factor out in Helper-Function um Duplikation zu vermeiden? **Ja**, siehe Files to Change.

### Files to Change

| File | Change Type | Description |
|------|-------------|-------------|
| `src/lib/schema.ts` | Modify | `ALTER TABLE journal_entries` + JS-Backfill. Hashtag-Shape-Migration als Helper-Function wiederverwendet. |
| `src/lib/queries.ts` | Modify | `getJournalEntries(locale)` liest `*_i18n`, resolved via `t()`, Per-Feld Fallback-Flags, DE-Skip. Hashtag-Transform zurück zu Legacy-Shape. |
| `src/content/de/journal/entries.ts` | Modify | `JournalEntry`-Type erweitern um `titleIsFallback`, `contentIsFallback`, `footerIsFallback`. |
| `src/app/api/dashboard/journal/route.ts` | Modify | POST + GET auf `*_i18n` + `completion`. Validator mit null-guard. `validateHashtagsI18n` aus `agenda-hashtags.ts`. |
| `src/app/api/dashboard/journal/[id]/route.ts` | Modify | PUT partial-update mit Dual-Write. |
| `src/app/dashboard/components/JournalEditor.tsx` | Modify | Form-State auf `{shared:{date,author,title_border,images,hashtags}, de:{title,footer,html}, fr:{...}}`. Locale-Tabs + parallel-mounted. Inline-Hashtag-Logik durch `HashtagEditor` mit `showI18n` ersetzen. Auto-Save bleibt. |
| `src/app/dashboard/components/JournalSection.tsx` | Modify | Completion-Badges in Listen-Row. |
| `src/app/dashboard/components/JournalPreview.tsx` | Modify (minimal) | Per-Feld-lang-Attribute, wenn relevant. |
| `src/app/dashboard/components/journal-editor-types.ts` | Modify | `DashboardJournalEntry`-Type um `*_i18n`-Felder + `completion`. |
| `src/components/Wrapper.tsx` (oder wo Journal gerendert wird) | Modify | Per-Feld `lang="de"`-Attribute auf Journal-Rendering. |
| `src/lib/seed.ts` | Modify | Fresh-Seed schreibt `*_i18n` + neue Hashtag-Shape. |
| `src/app/[locale]/layout.tsx` | Modify | `getJournalEntries(locale as Locale)`. |

### Architecture Decisions
- **Wiederverwendung maximal:** Schema-Migration-Helper, `validateHashtagsI18n`, `HashtagEditor`, `contentBlocksFromParagraphs` — alles aus Sprint 2+3 vorhanden.
- **`author` bleibt single-locale** — Begründung oben. Falls der User später Editorial-Rollen will, ist das ein kleiner Zusatz-Sprint (neue Spalte `author_i18n` oder explicit `editorial_team_role` Flag).
- **Hashtag-Shape-Migration als Helper:** Sprint 3 hatte den Code inline in schema.ts. Jetzt zweimal gleich → extrahieren als `migrateHashtagShape(tableName: string)` in schema.ts. Reduziert Copy-Paste + Test-Surface.
- **Auto-Save-Pattern bleibt:** bestehender Pattern schützt bereits incomplete Drafts via field-weglassen. Für i18n-Strings: wir senden immer das volle `{de, fr}`-Objekt, nie `null`-Felder einzeln → keine Regression.

### Dependencies
- Kein neues Package, kein neues Env-Var.
- Alle Helper aus Sprint 2+3 bereits da.
- Pattern-Referenzen: `patterns/database.md` (Dual-Write-Read-Isolation), `patterns/api.md` (undefined/null), `patterns/seo.md` (per-field lang).

## Edge Cases
| Case | Expected Behavior |
|------|-------------------|
| Journal-Entry nur in DE, User auf `/fr/` | Per-Feld-Fallback, `<h2 lang="de">`, Content-Div mit `lang="de"` |
| Entry mit leerem Title (Intro-Style) | `title_i18n = {}`, rendert ohne Title-Wrapper (existing behavior). Intro-Pattern entity-keyed, nicht position-keyed (`lessons.md` 2026-04-14). |
| Entry mit `{title_i18n: null}` Payload | 400 Invalid |
| Entry ohne Content in keiner Locale | Skipped bei Reader (auch DE — defensiv). |
| Auto-Save während FR-Editing mit incompletem Draft | Volle `{de, fr}`-Objekte senden, keine Datenverlust-Regression (kein partial field-weglassen bei i18n-Strings) |
| Journal-Image-Positionierung via `afterLine` | Unverändert — bezieht sich auf `lines`-Array-Index, der Legacy bleibt |
| Migration läuft zweimal | Idempotent (`WHERE *_i18n = '{}'`) |
| Hashtag-Migration auf journal_entries zweimal | Idempotent (`typeof h.tag === 'string'`-Check, wie in Sprint 3) |

## Risks
- **JournalEditor komplexer als erwartet:** 329 Zeilen mit Auto-Save, inline-Hashtag-Logik, Image-Positionierung. Viel Refactor-Oberfläche. **Mitigation:** Pattern von Sprint 3 `AgendaSection.tsx` direkt übernehmen. HashtagEditor-Wiederverwendung reduziert den Change.
- **Auto-Save-Payload-Compat:** neue Server-Validation könnte auf alten Auto-Save-Payloads (vor Frontend-Rebuild) mit 400 reagieren. **Mitigation:** kein Problem — Deploy ist atomar (Frontend + Backend in einem Container), Auto-Save-Draft-State ist clientseitig und überlebt keinen Full-Reload. Kein Backwards-Compat-Bedarf.
- **Image-Positionierung `afterLine` + Legacy `lines`:** Der Journal-Editor verwaltet Image-Platzierung basierend auf `lines`-Array-Indizes. Wenn wir auf `content_i18n` als Source-of-Truth umstellen, wird das nicht mehr direkt verwendet. **Mitigation:** `images.afterLine` bleibt als bestehende Legacy-Referenz, das Public-Rendering (`Wrapper.tsx`) nutzt es weiter über den Legacy-Pfad. Wenn `content_i18n.de` gefüllt ist (was nach Migration immer der Fall ist), rendert der Renderer über content. Images bleiben ein separates Thema — Out of Scope.
- **Hashtag-Editor-Pattern-Wechsel:** JournalEditor nutzt inline Hashtag-Rendering, AgendaSection nutzt `HashtagEditor`. Wenn wir in Journal auf `HashtagEditor` umstellen, ändert sich die UI-Struktur leicht. **Mitigation:** OK — UI-Konsistenz über beide Editors ist ein Plus, nicht ein Risiko.
- **Per-Sprint-Regression-Test fehlt:** keine Unit-Tests für Reader-Transformationen. **Mitigation:** post-Sprint-4 ein eigener Test-Sprint sinnvoll. Nice-to-have, nicht Blocker.

## Post-Sprint-4 Überblick
Nach Merge sind **alle 4 Entities** migriert:
- ✅ `alit_sections` (Sprint 1)
- ✅ `projekte` (Sprint 2)
- ✅ `agenda_items` (Sprint 3)
- ✅ `journal_entries` (Sprint 4)

Cleanup-Sprint-Inhalt (Out-of-scope in Sprint 4):
- Legacy-Spalten droppen: `titel`, `title`, `lead`, `ort`, `beschrieb`, `paragraphs`, `kategorie`, `content`, `footer`, `lines` — jeweils wo `*_i18n`-Ersatz existiert.
- Dual-Write-Code aus POST/PUT-Handlern entfernen.
- Reader auf i18n-only umstellen (bereits jetzt der Fall, aber Fallback-Code im Client kann weg).
- Type-Cleanup: `JournalEntry.lines?`, `AgendaItemData.beschrieb` etc. droppen wenn nicht mehr nötig.
