# Sprint: Multi-Locale Foundation + Über-Alit
<!-- Spec: tasks/spec.md -->
<!-- Started: 2026-04-14 -->

## Done-Kriterien
> Alle müssen PASS sein bevor der Sprint als fertig gilt. Jedes Kriterium ist entweder per Kommando scriptbar (🔧) oder explizit manuell (👤).

**Mechanisch (scriptbar):**
- [ ] 🔧 `pnpm build` erfolgreich ohne TypeScript-Fehler
- [ ] 🔧 `pnpm test` grün (neue Unit-Tests für `t()` + `isEmptyField()`, min. 4 Fälle jeweils)
- [ ] 🔧 `psql -c "\d alit_sections"` zeigt beide Spalten mit `NOT NULL DEFAULT '{}'::jsonb`: `title_i18n jsonb`, `content_i18n jsonb`
- [ ] 🔧 **Precondition-Check bestanden**: `SELECT count(*) FROM alit_sections WHERE locale = 'fr'` → `0` VOR Backfill (sonst Migration abort mit Fehler)
- [ ] 🔧 **Backfill-Vollständigkeit** für alle DE-Zeilen: `SELECT count(*) FROM alit_sections WHERE locale = 'de' AND NOT (content_i18n ? 'de')` → `0`
- [ ] 🔧 **JSONB-Key-Validität**: `SELECT count(*) FROM alit_sections WHERE (content_i18n - 'de' - 'fr') <> '{}'::jsonb OR (title_i18n - 'de' - 'fr') <> '{}'::jsonb` → `0` (nur `de`/`fr` als Keys erlaubt)
- [ ] 🔧 `curl -s -b "auth=…" https://<host>/api/dashboard/alit/` | `jq '.data[0] | has("title_i18n") and has("content_i18n") and (.completion | has("de") and has("fr"))'` → `true`
- [ ] 🔧 `curl -I https://<host>/de/alit` → `200`, `curl -I https://<host>/fr/alit` → `200`
- [ ] 🔧 `curl -s https://<host>/fr/alit | grep -c 'lang="de"'` ≥ Anzahl Sektionen ohne FR-Content (DE-Fallback wird gerendert)
- [ ] 🔧 Dashboard-DOM: `[data-testid="locale-tab-de"]` und `[data-testid="locale-tab-fr"]` existieren im Editor-Modal; Liste hat pro Sektion `[data-completion-de]` + `[data-completion-fr]` Attribute mit Wert `"true"` oder `"false"`
- [ ] 🔧 `pnpm test:e2e` (oder manueller Playwright-Run): Tab-Wechsel im Editor ändert angezeigten Titel-Wert ohne Network-Request (kein `/api/` Call beim Tab-Klick)
- [ ] 🔧 Sonnet-Gate clean (`tasks/review.md` keine `[Critical]` im Scope)
- [ ] 🔧 Codex-Review clean für alle in-scope Findings

**Manuell (reviewer-judgement, explizit markiert):**
- [ ] 👤 Visueller Vergleich `/de/alit` vor/nach Migration — Screenshot identisch (keine Layout-Regression)
- [ ] 👤 Rich-Text-Editor: beim Tab-Wechsel bleibt beide-Sprachen-Eingabe erhalten (Typing-Test in DE → Tab FR → Tab DE → Eingabe noch da)

## Tasks

### Phase 1 — DB-Schema + Migration
- [ ] `src/lib/schema.ts`: `ALTER TABLE alit_sections ADD COLUMN IF NOT EXISTS title_i18n JSONB NOT NULL DEFAULT '{}'::jsonb`
- [ ] `src/lib/schema.ts`: `ALTER TABLE alit_sections ADD COLUMN IF NOT EXISTS content_i18n JSONB NOT NULL DEFAULT '{}'::jsonb`
- [ ] **Precondition-Check VOR Backfill**: `SELECT count(*) FROM alit_sections WHERE locale = 'fr'` — wenn `> 0` → throw mit klarer Fehlermeldung ("Sprint 1 unterstützt nur DE-only Backfill. FR-Zeilen vorhanden — manuelles Migrationsscript erforderlich").
- [ ] Backfill (DE-only, idempotent): Für jede Zeile mit `locale = 'de'` AND `content_i18n = '{}'::jsonb` → `UPDATE alit_sections SET title_i18n = jsonb_build_object('de', title), content_i18n = jsonb_build_object('de', content) WHERE id = $1`.
- [ ] **Kein** `sort_order`-Heuristik-Merge. **Kein** Auto-Merge über FR/DE-Rows.

### Phase 2 — i18n-Helper + Tests
- [ ] `src/lib/i18n-field.ts` mit `t<T>(field: {de?: T, fr?: T}, locale: string, fallback: 'de'): T | null` und `isEmptyField<T>(v: T | null | undefined): boolean`
- [ ] `src/lib/i18n-field.test.ts`: Tests für empty-string, whitespace-only-string, null, leeres Block-Array, non-empty für beide Typen
- [ ] `t()` auf `undefined`-Field robust (returned fallback oder null)

### Phase 3 — API
- [ ] `src/app/api/dashboard/alit/route.ts` GET: liest `title_i18n`, `content_i18n` raw aus DB, returned zusätzlich `completion: { de: !isEmpty(content_i18n.de), fr: !isEmpty(content_i18n.fr) }`
- [ ] `src/app/api/dashboard/alit/route.ts` POST: akzeptiert `{ title_i18n, content_i18n }` (beide keys optional), validiert Struktur (nur `de`/`fr`-Keys erlaubt), schreibt in neue Spalten
- [ ] `src/app/api/dashboard/alit/[id]/route.ts` PUT: analog
- [ ] Dashboard-Types (`AlitSectionItem` in `AlitSection.tsx`): um `title_i18n`, `content_i18n`, `completion` erweitern

### Phase 4 — Dashboard UI
- [ ] `src/app/dashboard/components/AlitSection.tsx`: State für `editingLocale: 'de' | 'fr'` im Editor-Modal
- [ ] Tabs oben im Modal mit `data-testid="locale-tab-de"` + `data-testid="locale-tab-fr"`, Badge-Indicator live aus Form-State
- [ ] Form-State hält beide Locales parallel (`form.title_i18n`, `form.content_i18n` als `{ de, fr }`-Objekt)
- [ ] **Zwei Rich-Text-Editor-Instanzen parallel mounted** (je eine pro Locale); inaktive Locale via CSS `hidden` Attribut ausgeblendet. **KEIN Remount bei Tab-Wechsel** — vermeidet unsaved-keystroke-Loss durch debounced onChange.
- [ ] Titel-Input analog: zwei Inputs, einer pro Locale, inaktiver `hidden`
- [ ] Liste rendert zwei Badges pro Sektion (aus API-`completion`) mit `data-completion-de="true|false"` und `data-completion-fr="true|false"` Attributen
- [ ] Save-Button submittet beide Locales gleichzeitig (keine Locale-Gates)

### Phase 5 — Website-Rendering
- [ ] `src/lib/queries.ts`: `getAlitSections(locale)` liest aus `*_i18n`, ruft `t()` auf, returned `{ id, title, content, isFallback: boolean }` (isFallback = FR-Request aber DE-Wert verwendet)
- [ ] `src/app/[locale]/alit/page.tsx`: locale aus params, an `getAlitSections(locale)` durchreichen
- [ ] Rendering: Wenn `isFallback` → `lang="de"` auf Wrapper-Element der Sektion
- [ ] Edge-Case: Sektion nur FR vorhanden, `/de/alit` requested → skippen (nicht rendern)

### Phase 6 — Verifikation
- [ ] `curl -I https://<host>/de/alit` + `/fr/alit` → beide 200
- [ ] DB-Verifikation: `\d alit_sections` zeigt neue Spalten
- [ ] Screenshot-Vergleich `/de/alit` vor/nach = identisch
- [ ] Manueller Dashboard-Test: neue Sektion erstellen, nur DE → Liste zeigt "DE ✓ FR –", Frontend `/fr/alit` fällt zurück

## Notes
- `alit_sections.locale`-Spalte bleibt bestehen für Rollback. Kein DROP in diesem Sprint.
- Row-per-Locale-Daten (falls in Staging vorhanden) werden beim ersten Backfill in JSONB gemergt — aber nur wenn `sort_order` eindeutig. Sonst abort.
- Pattern-Referenz `admin-ui.md`: Content-Keyed Rendering — Badges hängen an `completion`-Flag aus DB, nicht an Array-Position.
- Pattern-Referenz `database.md`: Migration additive, idempotent, NOT NULL mit DEFAULT für backward compat.
- Generator darf NICHT:
  - Agenda/Journal/Projekte anfassen (kommt in späteren Sprints)
  - Alte Spalten droppen
  - FR-Dict-Files anpassen (UI-Strings, nicht Content)
  - URL-Slugs für FR übersetzen (`/fr/alit` bleibt)
