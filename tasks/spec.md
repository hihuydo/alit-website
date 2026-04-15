# Spec: URL-Slug-Übersetzung für Projekte
<!-- Created: 2026-04-15 -->
<!-- Author: Planner (Claude) -->
<!-- Status: Draft -->

## Summary
Pro Projekt einen locale-spezifischen Slug (`slug_de` required, `slug_fr` optional) einführen, damit `/fr/projekte/<slug>` französische URLs tragen kann. Detail-Route wird locale-aware mit 301-Repair bei Locale/Slug-Mismatch. Hashtag-Referenzen (agenda + journal) bleiben auf single `projekt_slug`, werden aber zur Render-Zeit per Locale-Map auf den richtigen URL-Slug aufgelöst. Sitemap + `hreflang` auf Detail-Seite setzen die SEO-Foundation.

## Context
- `projekte.slug TEXT UNIQUE NOT NULL` heute einzige Slug-Spalte; identisch auf `/de/projekte/<slug>` und `/fr/projekte/<slug>` (letzteres mit DE-Fallback-Content, aber FR-User sehen DE-URL).
- Sprint 2 (PR #35) hat Titel/Kategorie/Content per JSONB i18n-ready gemacht — Slug ist der letzte monolinguale Anker.
- Hashtags auf Agenda+Journal tragen `projekt_slug` als single String (= aktueller `slug`). Sprint 3+4 haben `tag_i18n` i18n-ready gemacht, `projekt_slug` bewusst als stabile ID belassen.
- Routing: `src/app/[locale]/projekte/[slug]/page.tsx` validiert nur Slug-Existenz, ProjekteList rendert in panel 3 via Wrapper mit `useParams().slug` für Expansion.
- Kein `sitemap.ts`/`robots.ts`, keine `generateMetadata` mit `alternates.languages`.
- Dual-Column-Phase — Legacy `slug`-Spalte bleibt bestehen (Writer-only). Kein Cleanup in diesem Sprint (separater Sprint nach Stabilisierung, per `memory/todo.md`).

Relevante Lessons:
- `lessons.md` 2026-04-15 „Dual-Write Legacy-Fallback leakt cross-locale auf Reader-Seite" → Reader liest ausschließlich `slug_de`/`slug_fr`, niemals Legacy `slug`.
- `lessons.md` 2026-04-15 „Null-Payload in Partial-PUT" → `slug_fr === null` = clear, `undefined` = skip. Validator muss trennen.
- `lessons.md` 2026-04-14 „CASE WHEN für nullable partial updates" → `slug_fr` ist nullable; PUT muss `CASE WHEN sent THEN val ELSE slug_fr END`.
- `lessons.md` 2026-04-15 „Schema-Migration Precondition-Abort mit Re-Run-Safety" → Backfill muss idempotent sein.

## Requirements

### Must Have (Sprint Contract)

**Schema + Migration**
1. `projekte.slug_de TEXT NOT NULL`, `projekte.slug_fr TEXT` (nullable) additiv per `ALTER TABLE ADD COLUMN IF NOT EXISTS`.
2. UNIQUE-Constraint `projekte_slug_de_unique` auf `slug_de`. Partial UNIQUE `projekte_slug_fr_unique ON (slug_fr) WHERE slug_fr IS NOT NULL`.
3. Idempotenter JS-Backfill: für Rows mit `slug_de IS NULL OR slug_de = ''` → `slug_de = slug`. `slug_fr` bleibt NULL.
4. Legacy `slug`-Spalte bleibt bestehen und wird im Writer dual-geschrieben (`slug = slug_de`) für Rollback-Safety. Reader liest ausschließlich `slug_de`/`slug_fr`.

**Dashboard API**
5. POST/PUT `/api/dashboard/projekte` akzeptiert `slug_de` (required, 1-100 chars) + `slug_fr` (optional, null oder 1-100 chars). Legacy `slug`-Feld wird im Request nicht mehr akzeptiert.
6. Validator: `slug_de` required non-empty; `slug_fr` = undefined (skip), null (clear), oder string (set). Beide Felder nach demselben Regex wie bisher (`/^[a-z0-9]+(?:-[a-z0-9]+)*$/`, kleine Buchstaben + Bindestrich).
7. POST: 409 bei `slug_de`-Kollision ODER `slug_fr`-Kollision mit spezifischer Fehlermeldung (welcher Slug ist betroffen).
8. PUT: partial-safe, nullable-safe via `CASE WHEN sent THEN val ELSE col END` für `slug_fr`.
9. GET returnt `slug_de` + `slug_fr` zusätzlich (Legacy `slug` bleibt aus Kompatibilität, wird aber vom Dashboard-Reader ignoriert).

**Dashboard UI (ProjekteSection)**
10. Form-State hat `slug_de` + `slug_fr` getrennt. `slug_de` required, `slug_fr` optional mit Placeholder „leer lassen = DE-Slug wird verwendet".
11. 409-UX: bei Kollision ist der Fehler dem richtigen Feld zugeordnet (DE-Slug vs FR-Slug).
12. Auto-Suggest: beim ersten Tippen in FR-Slug-Feld wird der aktuelle DE-Slug vorgeschlagen (falls FR leer ist) — gleiche UX wie Hashtag-Editor FR-Auto-Sync aus PR #37. **Keine Auto-Kopie** beim Speichern — wenn User FR leer lässt, bleibt FR NULL.

**Reader + Types**
13. `getProjekte(locale)` in `queries.ts` selektiert `slug_de, slug_fr`, gibt `{slug_de, slug_fr, urlSlug}` zurück mit `urlSlug = locale === 'fr' ? (slug_fr ?? slug_de) : slug_de`.
14. `Projekt`-Type in `src/content/projekte.ts` erweitert um `slug_de`, `slug_fr`. Alle internen Referenzen (`p.slug` → `p.slug_de`), öffentliche Anchors (`href`) nutzen `urlSlug`.

**Routing + Redirect**
15. `src/app/[locale]/projekte/[slug]/page.tsx` wird Server Component die:
    - Row findet via `WHERE slug_de = $1 OR slug_fr = $1`
    - wenn keine Row → `notFound()`
    - wenn Row gefunden und `urlSlug` für aktuelle Locale ≠ gesuchter Slug → `permanentRedirect` auf den korrekten Locale-Slug (z.B. `/fr/projekte/<slug_de>` → `/fr/projekte/<slug_fr>` wenn `slug_fr` vorhanden)
    - wenn Row gefunden und URL-Slug korrekt → render (ProjekteList in Wrapper übernimmt)
16. Performance: Lookup ist eine einzige SQL-Query `SELECT slug_de, slug_fr FROM projekte WHERE slug_de = $1 OR slug_fr = $1 LIMIT 1`.

**Hashtag-Resolver (Option A: kein Hashtag-Migration)**
17. `projekt_slug` in agenda/journal-Hashtags bleibt **single string** und referenziert `slug_de` als stabile ID. Kein Schema-Change auf `agenda_items.hashtags` oder `journal_entries.hashtags`.
18. Layout baut projekt-slug-Map `{slug_de: {slug_de, slug_fr}}[]` aus `getProjekte(locale)` und gibt sie an Wrapper → AgendaItem + JournalSidebar durch.
19. `AgendaItem.tsx` + `JournalSidebar.tsx` resolvieren Hashtag-href zur Render-Zeit: `href = /{locale}/projekte/{projektSlugMap[h.projekt_slug]?.urlSlug ?? h.projekt_slug}` (Fallback: wenn slug nicht in Map → nutze gespeicherten Wert, resultiert in notFound wenn obsolet).

**SEO: Sitemap + hreflang**
20. Neuer `src/app/sitemap.ts` generiert `MetadataRoute.Sitemap`:
    - Für jeden Projekt: DE-URL + FR-URL als separate Einträge mit `alternates.languages: {de, fr, 'x-default': '/de/...'}`.
    - Statische Routen (`/de/`, `/de/alit/`, `/de/newsletter/`, `/de/mitgliedschaft/`) analog mit beiden Locales.
    - `force-dynamic` export (DB-gestützt).
21. `generateMetadata` in `[locale]/projekte/[slug]/page.tsx` setzt `alternates.languages: {de: '/de/projekte/<slug_de>', fr: '/fr/projekte/<slug_fr ?? slug_de>', 'x-default': '/de/projekte/<slug_de>'}`.

**Seed**
22. `src/lib/seed.ts` schreibt Fresh-DB direkt mit `slug_de = <existing slug>`, `slug_fr = null`. Legacy `slug`-Spalte mit selbem Wert dual-geschrieben.

**Integration + Docs**
23. Build grün (`pnpm build`, `pnpm test`, `pnpm lint`).
24. `/de/projekte/<slug>` rendert visuell identisch zu pre-Sprint.
25. `/fr/projekte/<slug_de>` (FR ohne eigenen Slug): 200 + DE-Fallback-Content (Status quo).
26. Nach manuellem Setzen eines `slug_fr` in einem Test-Projekt: `/fr/projekte/<slug_fr>` → 200, `/fr/projekte/<slug_de>` → 301 auf `/fr/projekte/<slug_fr>`.
27. `memory/lessons.md` + `memory/todo.md` vor Merge aktualisiert (Sprint-Wrap).

### Nice to Have (explicit follow-up, NOT this sprint)
- **robots.ts** mit `Sitemap:` reference — eigener Mini-Sprint SEO-Hardening.
- **Slug-Rename mit History-Table** (`projekte_slug_history` mit TTL-Redirects) — größerer Feature-Sprint wenn Umbenennungen nötig werden.
- **Sitemap-URLs für `/alit`-Sub-Sektionen** (falls später Deep-Linking nötig wird).
- **Cleanup-Sprint: Legacy `slug`-Spalte droppen** — zusammen mit dem großen i18n-Cleanup-Sprint aus `memory/todo.md`.
- **Codex-Spec-Evaluierung** — dieser Sprint ist Medium-groß, Option je nach QA-Report-Ergebnis.

### Out of Scope
- Keine Änderung an Hashtag-Editor UI (`HashtagEditor.tsx` bleibt unverändert — Resolver-Pattern erfordert keinen FR-Slug-Input).
- Kein Schema-Change auf `agenda_items.hashtags` oder `journal_entries.hashtags`.
- Keine Änderung am Legacy `slug`-Column-Drop (bleibt für Rollback-Safety).
- Kein `robots.ts` in diesem Sprint.
- Keine Migration von Datenschutz-PDF-Link oder statischen Asset-Pfaden.

## Technical Approach

### Files to Change

| File | Change | Description |
|------|--------|-------------|
| `src/lib/schema.ts` | Modify | `ALTER TABLE projekte ADD COLUMN slug_de/slug_fr`, UNIQUE constraints, idempotenter Backfill |
| `src/lib/queries.ts` | Modify | `getProjekte(locale)` liest `slug_de`/`slug_fr`, gibt `urlSlug` zurück; ggf. Helper `resolveProjektUrlSlug(locale, map)` |
| `src/content/projekte.ts` | Modify | `Projekt`-Type: `slug` → `slug_de`, `slug_fr?`, `urlSlug` |
| `src/app/api/dashboard/projekte/route.ts` | Modify | POST akzeptiert `slug_de`/`slug_fr`, doppelte Unique-Collision mit spezifischer Fehlermeldung, Dual-Write legacy |
| `src/app/api/dashboard/projekte/[id]/route.ts` | Modify | PUT mit `CASE WHEN` für `slug_fr`, Dual-Write legacy |
| `src/app/dashboard/components/ProjekteSection.tsx` | Modify | Form-Felder `slug_de` + `slug_fr`, Auto-Suggest, 409-UX |
| `src/app/[locale]/projekte/[slug]/page.tsx` | Modify | Locale-aware Resolve + Redirect + `generateMetadata` mit `alternates.languages` |
| `src/components/ProjekteList.tsx` | Modify | `href` nutzt `p.urlSlug`, `isExpanded` matched gegen `p.slug_de OR p.slug_fr` |
| `src/components/AgendaItem.tsx` | Modify | Hashtag-`href` via `projektSlugMap[h.projekt_slug]?.urlSlug` |
| `src/components/JournalSidebar.tsx` | Modify | Dito |
| `src/components/Wrapper.tsx` | Modify | `projektSlugMap` als Prop, weiterreichen an AgendaItem + JournalSidebar |
| `src/app/[locale]/layout.tsx` | Modify | Map aus `getProjekte(locale)` bauen, an Wrapper geben |
| `src/lib/seed.ts` | Modify | Seed schreibt `slug_de` + `slug_fr=null` |
| `src/app/sitemap.ts` | **Create** | `MetadataRoute.Sitemap` mit `alternates.languages` für jede Route + Projekt |

**Count:** 13 Files (12 Modify + 1 Create).

### Architecture Decisions

**Option A (Resolver) für Hashtags, nicht Option B ({de, fr}-Shape).**
- Grund: `projekt_slug` ist eine **stabile interne ID**, keine Display-Content. `tag_i18n` ist Display (deshalb i18n-migriert), Slug ist Anchor.
- Resolver-Pattern: projekt-slug-Map (`{slug_de → urlSlug}`) wird einmal pro Request gebaut (im Layout bereits, `getProjekte` wird sowieso aufgerufen), Komplexität O(1) pro Render.
- Zero Migration auf `agenda_items`+`journal_entries.hashtags` — kein Risiko für Sprint-3/4-Daten.
- Trade-off: Admin der `slug_de` umbenennen will, muss selbst alle Hashtag-Referenzen anpassen (ist heute auch so). Rename-History ist explizit out-of-scope.

**Legacy `slug`-Column dual-written, nicht gelesen.**
- Writer: `INSERT/UPDATE ... slug = slug_de`. Für Rollback.
- Reader: `SELECT slug_de, slug_fr FROM projekte`. Niemals `slug`.
- Lesson 2026-04-15 „Dual-Write Legacy-Fallback leakt cross-locale" — dieselbe Isolation wie bei Titel/Kategorie.

**`permanentRedirect` statt `redirect`.**
- Locale/Slug-Mismatch ist eine permanente Umleitung (308). Suchmaschinen dürfen Ziel-Slug cachen.

**Sitemap als eigener `sitemap.ts` mit `force-dynamic`.**
- DB-gestützt (Slugs kommen aus `projekte`-Tabelle). Static Sitemap würde bei Slug-Änderung stale.
- `MetadataRoute.Sitemap` ist Next.js 13+ Standard, braucht keinen XML-Boilerplate.

### Dependencies
- Keine externen. Keine neuen NPM-Pakete. Keine env vars.
- Intern: Sprint 2 (i18n-Reader `getProjekte` mit locale), Sprint 3 (Hashtag-Shape `tag_i18n`), PR #37 (FR-Auto-Sync-UX-Pattern für ProjekteSection).

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| User visits `/fr/projekte/<slug_de>` and `slug_fr` is NULL | 200 mit DE-Fallback-Content, URL stays at `slug_de` (kein Redirect, weil kein anderer Slug existiert) |
| User visits `/fr/projekte/<slug_de>` and `slug_fr` exists | 301 auf `/fr/projekte/<slug_fr>` |
| User visits `/de/projekte/<slug_fr>` (wrong locale) | 301 auf `/de/projekte/<slug_de>` (locale-repair) |
| User visits `/de/projekte/<non-existent>` | `notFound()` |
| Admin POST mit kollidierendem `slug_de` | 409 `{error: "Slug (DE) already exists"}` |
| Admin POST mit kollidierendem `slug_fr` | 409 `{error: "Slug (FR) already exists"}` |
| Admin PUT setzt `slug_fr: null` | Clear — SET slug_fr = NULL, UNIQUE-Partial erlaubt beliebig viele NULLs |
| Admin PUT lässt `slug_fr` weg (`undefined`) | Skip — keine Änderung am Feld |
| Admin POST mit leerem `slug_de` (empty string) | 400 `{error: "slug_de is required"}` |
| Admin POST mit `slug_fr = ""` (empty string) | 400 `{error: "slug_fr must be null or non-empty"}` (leer = kein valider Slug) |
| Admin POST mit `slug_de = slug_fr` (selbes Projekt, beide Werte gleich) | 200 — erlaubt, UNIQUE-Partial auf `slug_fr` matcht nur über Rows, nicht innerhalb einer Row. DE- und FR-URLs werden identisch sein; ist UX-mäßig ungewöhnlich aber nicht kaputt |
| Hashtag mit `projekt_slug` der auf gelöschtes/umbenanntes Projekt zeigt | Map-Lookup returnt `undefined`, Fallback auf gespeicherten Wert → Link → notFound beim Klick (Status quo) |
| Sitemap für Projekt mit `slug_fr = NULL` | DE-Eintrag + FR-Eintrag mit `url: /fr/projekte/<slug_de>`, `alternates.languages.fr` zeigt auf selbe URL |

## Risks

**Risk 1: Bestehende Hashtags referenzieren Slugs, die Admin später renamed**
- Heute schon so (`slug` → Hashtag-Referenz bricht bei Rename). Kein neues Risiko.
- Mitigation: Slug-Rename ist out-of-scope. Falls je benötigt → History-Table als eigenes Feature.

**Risk 2: Slug-Kollision zwischen `slug_de` eines Projekts A und `slug_fr` eines Projekts B**
- Beispiel: Projekt A hat `slug_de = "lecture"`, Projekt B hat `slug_fr = "lecture"`. Beide URLs `/de/projekte/lecture` + `/fr/projekte/lecture` zeigen auf verschiedene Projekte.
- Resolve-Query `WHERE slug_de = $1 OR slug_fr = $1` findet BEIDE Rows → nicht deterministisch.
- Mitigation: Schema-Constraint CHECK, dass Slug global unique ist (nicht nur pro Spalte). Alternative: Resolve priorisiert Locale-Spalte (`WHERE slug_de = $1 AND locale='de'` hätte Sinn gehabt, aber wir haben keinen `locale`-Spalten-Scope).
- **Entscheidung:** ADD CONSTRAINT via CHECK oder Trigger ist messy in PG. Pragmatisch: Resolve-Query priorisiert Locale-Match:
  ```sql
  SELECT slug_de, slug_fr FROM projekte
  WHERE (CASE WHEN $1 = 'de' THEN slug_de ELSE slug_fr END) = $2
     OR (CASE WHEN $1 = 'de' THEN slug_fr ELSE slug_de END) = $2
  ORDER BY (CASE WHEN $1 = 'de' THEN slug_de ELSE slug_fr END) = $2 DESC
  LIMIT 1
  ```
  Locale-Match gewinnt → `/fr/projekte/lecture` zeigt auf Projekt B.
- **Zusätzlich:** Dashboard-Validator prüft bei POST/PUT auch Cross-Column-Kollision und gibt Warnung aus (non-blocking 200, aber WARNING-Response).

**Risk 3: Turbopack-CSS-Dedup / stale Build nach Schema-Change**
- `lessons.md` „stale Build Symptome". `docker compose up --build -d` nach Schema-Migration.

**Risk 4: `instrumentation.ts` Race mit DB**
- Schema-Migration läuft in `instrumentation.ts` beim Boot. Bei PG-nicht-ready kommt es zum Retry-Loop (pattern in nextjs.md).
- Mitigation: Migration ist additiv + idempotent (`ADD COLUMN IF NOT EXISTS` + Backfill mit Precondition-Check). Kein Race.

## Deployment-Verifikation (Pflicht nach Staging + Production)

- CI grün (`gh run watch`)
- `/api/health/` → 200
- `/de/projekte/<slug>` → 200, Content visuell identisch zu pre-Sprint
- `/fr/projekte/<slug_de>` → 200 (DE-Fallback), oder 301 wenn slug_fr existiert
- Admin: POST neues Projekt mit `slug_fr`, FR-URL funktioniert
- `/sitemap.xml` → valides XML mit beiden Locales + `hreflang`-Alternates
- Container logs clean
