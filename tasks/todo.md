# Sprint: Multi-Locale Foundation + Über-Alit
<!-- Spec: tasks/spec.md -->
<!-- Started: 2026-04-14 -->

## Done-Kriterien
> Alle müssen PASS sein bevor der Sprint als fertig gilt.

- [ ] `pnpm build` erfolgreich ohne TypeScript-Fehler
- [ ] `pnpm test` grün (neue Unit-Tests für `t()` + `isEmptyField()`)
- [ ] DB hat nach Deploy die Spalten `alit_sections.title_i18n` + `alit_sections.content_i18n` (`\d alit_sections` zeigt beide, NOT NULL)
- [ ] Alle existierenden `alit_sections`-Zeilen haben `content_i18n` populiert (SQL: `SELECT count(*) FROM alit_sections WHERE content_i18n = '{}'::jsonb` → 0)
- [ ] `curl -s https://<host>/api/dashboard/alit/ -H "cookie: …"` returned Objekte mit `title_i18n`, `content_i18n`, `completion.{de,fr}`-Flags
- [ ] Dashboard → Über-Alit → Edit Modal zeigt zwei Tabs (DE | FR), Tab-Wechsel ändert Titel+Content-Felder ohne Reload
- [ ] Dashboard → Über-Alit-Liste zeigt pro Sektion zwei Badges ("DE ✓/–", "FR ✓/–") basierend auf Content-Non-Empty
- [ ] `/de/alit` rendert unverändert zu Pre-Migration (visueller Diff = 0)
- [ ] `/fr/alit` rendert FR-übersetzte Sektionen wo vorhanden, sonst DE-Fallback mit `lang="de"` auf dem Wrapper
- [ ] Sonnet-Gate clean (`tasks/review.md` keine `[Critical]` im Scope)
- [ ] Codex-Review clean für alle in-scope Findings (Sprint-Contract-Verletzung oder Security/Correctness)

## Tasks

### Phase 1 — DB-Schema + Migration
- [ ] `src/lib/schema.ts`: `ALTER TABLE alit_sections ADD COLUMN IF NOT EXISTS title_i18n JSONB NOT NULL DEFAULT '{}'`
- [ ] `src/lib/schema.ts`: `ALTER TABLE alit_sections ADD COLUMN IF NOT EXISTS content_i18n JSONB NOT NULL DEFAULT '{}'`
- [ ] Backfill-Migration: Für jede Zeile mit `content_i18n = '{}'` → kopiere alten `title` in `title_i18n[locale]` und `content` in `content_i18n[locale]`. Idempotent (nur wenn `content_i18n` leer).
- [ ] Edge-Case-Schutz: Wenn zwei Zeilen mit identischem `sort_order` existieren → abort mit Fehler, manuelles Eingreifen nötig (kein blinder Auto-Merge).

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
- [ ] Tabs oben im Modal (DE | FR) mit Badge-Indicator live aus Form-State
- [ ] Form-State hält beide Locales parallel (`form.title_i18n`, `form.content_i18n` als Objekt)
- [ ] Rich-Text-Editor re-mounted bei Tab-Wechsel mit neuem `content_i18n[activeLocale]`
- [ ] Liste rendert zwei Badges pro Sektion (aus API-`completion`)
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
