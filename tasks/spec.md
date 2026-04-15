# Spec: URL-Slug-Übersetzung für Projekte
<!-- Created: 2026-04-15 -->
<!-- Revised: 2026-04-15 (v2 — Codex-Spec-Review Findings eingearbeitet) -->
<!-- Author: Planner (Claude) -->
<!-- Status: Draft v2 -->

## Summary
Pro Projekt einen locale-spezifischen Slug (`slug_de` immutable required, `slug_fr` mutable nullable) einführen, damit `/fr/projekte/<slug>` französische URLs tragen kann. Detail-Route wird locale-aware mit **308-Repair** bei Locale/Slug-Mismatch. Hashtag-Referenzen bleiben auf single `projekt_slug` (= stabiler `slug_de`), werden zur Render-Zeit per Locale-Map aufgelöst. Sitemap + `hreflang` auf Basis einer **locale-neutralen Helper-Query**, root `layout.tsx` bekommt `metadataBase` als SEO-Foundation.

## Invariants (normativ — jede Verletzung ist ein Bug)

1. **`slug_de` ist immutable nach Create.** Weder Dashboard-UI noch PUT-Endpoint erlauben eine Änderung. Rationale: `slug_de` dient gleichzeitig als stabile interne ID für Hashtag-Referenzen in `agenda_items.hashtags` und `journal_entries.hashtags`. Ein Rename würde alle Hashtag-Referenzen silent brechen. Rename-Feature ist explizit separater Sprint mit History-Table.
2. **`slug_fr` ist mutable** (set via string, clear via `null`, skip via `undefined`). Darf beim Edit frei geändert werden.
3. **`urlSlug` ist derived-only** — niemals in der DB, nur Render-Zeit-Ableitung: `urlSlug = locale === 'fr' ? (slug_fr ?? slug_de) : slug_de`.
4. **Global Slug-Uniqueness:** Kein Slug (weder `slug_de` noch `slug_fr`) darf gleichzeitig als `slug_de` oder `slug_fr` eines anderen Projekts existieren. Hart erzwungen per Pre-Insert-SELECT + DB-Unique-23505-Catch.
5. **Legacy `slug`-Spalte ist Write-only** (dual-geschrieben `slug = slug_de`). Reader nutzen sie NIE (Lesson 2026-04-15 Dual-Write-Reader-Isolation).
6. **Route-Resolution nutzt die locale-gefilterte Liste** (`getProjekte(locale)`), **nicht** einen direkten DB-Query — sonst könnte `/de/projekte/<slug>` 200 zurückgeben für Projekte, die in der DE-Panel-3-Liste herausgefiltert sind (fehlender DE-Content).

## Context
- `projekte.slug TEXT UNIQUE NOT NULL` heute einzige Slug-Spalte; identisch auf `/de/projekte/<slug>` und `/fr/projekte/<slug>` (letzteres mit DE-Fallback-Content, aber FR-User sehen DE-URL).
- Sprint 2 (PR #35) hat Titel/Kategorie/Content per JSONB i18n-ready gemacht — Slug ist der letzte monolinguale Anker.
- Hashtags auf Agenda+Journal tragen `projekt_slug` als single String (= aktueller `slug`). Sprint 3+4 haben `tag_i18n` i18n-ready gemacht, `projekt_slug` bewusst als stabile ID belassen.
- Routing: `src/app/[locale]/projekte/[slug]/page.tsx` validiert nur Slug-Existenz, ProjekteList rendert in panel 3 via Wrapper mit `useParams().slug` für Expansion.
- Kein `sitemap.ts`/`robots.ts`, kein `metadataBase` im root layout, keine `generateMetadata` mit `alternates.languages`.
- Dual-Column-Phase — Legacy `slug`-Spalte bleibt bestehen (Writer-only). Kein Cleanup in diesem Sprint.

Relevante Lessons:
- `lessons.md` 2026-04-15 „Dual-Write Legacy-Fallback leakt cross-locale" → Reader liest nur `slug_de`/`slug_fr`, niemals Legacy `slug`.
- `lessons.md` 2026-04-15 „Null-Payload in Partial-PUT" → `slug_fr === null` = clear, `undefined` = skip, validator trennt.
- `lessons.md` 2026-04-14 „CASE WHEN für nullable partial updates" → `slug_fr` nullable; PUT via `CASE WHEN sent THEN val ELSE slug_fr END`.
- `lessons.md` 2026-04-15 „Schema-Migration Precondition-Abort mit Re-Run-Safety" → Backfill idempotent + Duplicate-Preflight auf Legacy-`slug`.
- `patterns/seo.md` — `metadataBase` + Env-basierter Site-URL-Helper ist dokumentiert.

## Requirements

### Must Have (Sprint Contract)

**Schema + Migration**
1. `projekte.slug_de TEXT`, `projekte.slug_fr TEXT` additiv per `ADD COLUMN IF NOT EXISTS`. Nullable in Create-Statement; `NOT NULL` auf `slug_de` erst nach Backfill (Precondition-sicher).
2. **Migration-Preflight** vor Unique-Constraints: prüft `SELECT count(*) FROM projekte WHERE slug IS NULL OR slug = ''` → bei >0 → throw mit Fehlermeldung. Prüft `SELECT slug FROM projekte GROUP BY slug HAVING count(*) > 1` → bei >0 → throw. (Legacy `slug` ist bereits `UNIQUE NOT NULL`, diese Checks sind Defensive gegen verdorbene Daten und dokumentieren die Erwartung.)
3. Idempotenter JS-Backfill: für Rows mit `slug_de IS NULL OR slug_de = ''` → `UPDATE SET slug_de = slug`. Zweiter Boot ist No-Op.
4. Unique-Constraints idempotent (via `CREATE UNIQUE INDEX IF NOT EXISTS`):
   - `projekte_slug_de_unique ON (slug_de)`
   - `projekte_slug_fr_unique ON (slug_fr) WHERE slug_fr IS NOT NULL`
5. Post-Backfill `ALTER COLUMN slug_de SET NOT NULL` (idempotent — skipped wenn bereits NOT NULL via pg_attribute-Check oder try/catch).
6. Legacy `slug` bleibt, wird dual-geschrieben (`slug = slug_de` in POST und bei künftigen slug_de-Sets — aber slug_de ist immutable, also einmal beim POST). Reader ignorieren legacy `slug`.

**Dashboard API — POST (create)**
7. POST akzeptiert `slug_de` (required), `slug_fr` (optional nullable). Validator:
   - `validateSlug(s: string)`: regex `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`, length 1-100.
   - `slug_de`: required, muss Regex passen.
   - `slug_fr`: `undefined` = null-at-insert; `null` = null-at-insert; `string` muss Regex passen; empty string = 400.
8. **Cross-Column-Global-Uniqueness-Check:** Pre-Insert `SELECT id FROM projekte WHERE slug_de IN ($1, $2) OR slug_fr IN ($1, $2) OR slug IN ($1, $2) LIMIT 1` (mit `$1=slug_de, $2=slug_fr_or_null`). Bei Treffer → 409 mit Identifikation welcher Slug + welches Ziel-Feld betroffen ist. Zusätzlich DB-Side `23505`-catch fängt Race-Window (pre-SELECT → INSERT).
9. Dual-Write bei INSERT: `slug = slug_de` (Rollback-Safety).

**Dashboard API — PUT (update)**
10. PUT akzeptiert **NICHT** `slug_de`. Falls Body `slug_de` enthält → 400 `{error: "slug_de is immutable after create"}`. Stable-ID-Invariant.
11. PUT akzeptiert `slug_fr`: `undefined` = skip, `null` = clear, `string` muss Regex passen; empty string = 400. Partial-safe via `CASE WHEN sent THEN val ELSE slug_fr END`.
12. **Cross-Column-Uniqueness-Check** bei `slug_fr`-Set: Pre-Update `SELECT id FROM projekte WHERE id <> $1 AND (slug_de = $2 OR slug_fr = $2 OR slug = $2)`. Bei Treffer → 409. Plus DB-Side 23505-catch.

**Dashboard API — GET**
13. GET returnt `slug_de, slug_fr` zusätzlich (Legacy `slug` bleibt in Response aus Kompat, wird aber vom Dashboard-Reader nicht angezeigt).

**Dashboard UI (ProjekteSection)**
14. Form-State: `{slug_de, slug_fr}` statt `{slug}`.
15. Zwei Input-Felder: „URL-Slug (DE)" + „URL-Slug (FR)". `slug_de` im Edit-Modal **disabled** (Immutability-Invariant). Create-Modus: `slug_de` editierbar.
16. `slug_fr` mit Placeholder „leer = DE-Slug wird für FR-URL verwendet" + Auto-Suggest beim Focus (füllt mit aktuellem `slug_de` wenn FR leer; User kann weitertippen/clearen). Beim Save: `slug_fr.trim() || null`.
17. 409-UX: Error wird dem betroffenen Feld zugeordnet (setSlugDeError vs setSlugFrError), Fehlermeldung benennt Ziel-Feld.

**Reader + Types**
18. `src/content/projekte.ts`: `Projekt`-Type — `slug: string` → `slug_de: string; slug_fr: string | null; urlSlug: string`. Alle Call-Sites (`p.slug`) migriert.
19. `src/lib/queries.ts`: `getProjekte(locale)` selektiert `slug_de, slug_fr`, gibt `urlSlug` derived zurück. Legacy `slug` nicht mehr im SELECT.
20. **Neuer locale-neutraler Helper** `getProjekteForSitemap(): Promise<{id, slug_de, slug_fr, has_de_content, has_fr_content}[]>` in `queries.ts`. Liest Raw-DB ohne Locale-Filter. Verwendung: nur Sitemap + Routing.
21. Helper `buildProjektSlugMap(projekte): Record<string, {slug_de, slug_fr, urlSlug}>` (keyed by `slug_de`). In `src/lib/projekt-slug.ts` oder inline in `queries.ts`.

**Routing + Redirect**
22. `src/app/[locale]/projekte/[slug]/page.tsx`:
    - Holt die locale-gefilterte Liste via `getProjekte(locale)` (Invariant 6).
    - Findet Row wo `slug_de === params.slug || slug_fr === params.slug`.
    - Wenn nicht gefunden → `notFound()` (sowohl wenn Slug unbekannt als auch wenn in aktueller Locale weggefiltert — z.B. DE-only-Projekt auf `/fr/`).
    - Wenn gefunden und `urlSlug !== params.slug` → `permanentRedirect(/{locale}/projekte/{urlSlug})` (Status 308).
    - Sonst: render null (ProjekteList im Wrapper übernimmt).
23. `export async function generateMetadata({params})`:
    - Nutzt `getProjekteForSitemap()` (nicht `getProjekte(locale)` — damit Canonical/Alternates auch dann richtig sind, wenn Content einer Locale fehlt).
    - `alternates: {canonical: /${locale}/projekte/${urlSlug}, languages: {de: /de/projekte/<slug_de>, fr: /fr/projekte/<slug_fr ?? slug_de>, 'x-default': /de/projekte/<slug_de>}}`.

**Hashtag-Resolver**
24. Kein Schema-Change auf `agenda_items.hashtags` oder `journal_entries.hashtags`. `projekt_slug` bleibt single string und referenziert `slug_de` (Immutability-Invariant garantiert Stabilität).
25. `src/app/[locale]/layout.tsx` baut `projektSlugMap` aus `getProjekte(locale)` und gibt an Wrapper. `Wrapper.tsx` definiert Prop, reicht an `AgendaItem` + `JournalSidebar` durch.
26. `AgendaItem.tsx` + `JournalSidebar.tsx`: hashtag-href = `/{locale}/projekte/{projektSlugMap[h.projekt_slug]?.urlSlug ?? h.projekt_slug}`. Fallback auf gespeicherten Wert wenn Map-Miss (z.B. Projekt gelöscht) → notFound beim Klick.
27. `ProjekteList.tsx`: `href` nutzt `p.urlSlug`, `isExpanded` matched `params.slug === p.slug_de || params.slug === p.slug_fr`.
28. Dashboard-Preview-Pfade (`AgendaItem` in `AgendaSection.tsx`-Preview, `JournalPreview.tsx`): bauen lokalen `projektSlugMap` aus der Dashboard-Projekte-Liste und reichen durch. Kein broken Preview-Link.

**SEO Foundation**
29. `src/lib/site-url.ts` (neu): `getSiteUrl(): URL` liest `process.env.SITE_URL ?? 'https://alit.hihuydo.com'`, returnt `URL`-Objekt. Env-Read kapseln (Pattern aus `patterns/seo.md` — Env-Vars für SEO, NICHT `NEXT_PUBLIC_*`).
30. `src/app/layout.tsx` setzt `export const metadata: Metadata = { metadataBase: getSiteUrl(), ... }`. Alle `alternates.*`-URLs werden dann automatisch absolute mit dieser Base.

**SEO: Sitemap**
31. `src/app/sitemap.ts` (neu):
    - `export const dynamic = 'force-dynamic'`.
    - Nutzt `getProjekteForSitemap()` (locale-neutral).
    - Für jeden Projekt: emittiert zwei Einträge (DE-URL + FR-URL), je mit `alternates.languages: {de, fr, 'x-default'}`. Absolute URLs via `new URL(path, getSiteUrl())`.
    - Statische Routen (`/`, `/projekte`, `/alit`, `/newsletter`, `/mitgliedschaft`) analog.
    - Optional: filtert Projekte ohne `has_de_content && has_fr_content`-Kombinationen nach Locale (z.B. Projekt ohne FR-Content: FR-Eintrag zeigt auf DE-Fallback-URL).

**Seed**
32. `src/lib/seed.ts` schreibt Fresh-DB direkt mit `slug_de = <slug aus content/projekte.ts>`, `slug_fr = null`, Dual-Write `slug = slug_de`.

**Automated Tests (Vitest)**
33. `src/lib/projekt-slug.test.ts` (falls Helper dort): `buildProjektSlugMap` round-trip.
34. `src/app/api/dashboard/projekte/__tests__/validation.test.ts` oder inline: `validateSlug`-Regex (valid, uppercase→reject, leading-hyphen→reject, unicode→reject, length-101→reject, empty→reject).
35. `src/lib/site-url.test.ts`: URL-Helper returns absolute URL, Env-Override greift.

**Integration + Docs**
36. `pnpm build` clean (0 TS errors, 0 lint errors, alle Routes generieren).
37. `pnpm test` alle Tests grün (bestehende 69 + neue).
38. `/de/projekte/<slug>` visuell identisch zu pre-Sprint.
39. Route-Verhalten (manuell auf Staging verifiziert):
    - `/de/projekte/<slug_de>` → 200.
    - `/fr/projekte/<slug_de>` mit `slug_fr=null` → 200 (DE-Fallback-Content, URL bleibt).
    - `/fr/projekte/<slug_de>` mit `slug_fr` gesetzt → 308 → `/fr/projekte/<slug_fr>`.
    - `/de/projekte/<slug_fr>` (wrong locale) → 308 → `/de/projekte/<slug_de>`.
    - `/de/projekte/<slug>` wenn Projekt kein DE-Content hat → `notFound()` (locale-visibility-Filter greift).
    - `/sitemap.xml` → 200, valides XML, absolute URLs, `alternates.languages` für jeden Eintrag.
40. `memory/lessons.md` + `memory/todo.md` aktualisiert.

### Nice to Have (explicit follow-up, NOT this sprint)
- **Audit-Logging für slug_fr-Mutationen** (actor, project id, old/new slug_fr, timestamp) — SEO-kritische Mutation, sinnvoll für Audit-Trail. Landet in `memory/todo.md`.
- **Feature-Flag / Kill-Switch** für neues Routing/Reader — via Env `ENABLE_SLUG_I18N=false` könnte alter Resolver reaktiviert werden. Nicht in diesem Sprint, aber als Rollback-Option bei Prod-Problemen.
- **robots.ts** mit `Sitemap:`-reference — eigener Mini-Sprint SEO-Hardening.
- **Slug-Rename-Feature** mit History-Table + Hashtag-Rebinding + TTL-Redirects — großes Feature, nur wenn Redaktion das wirklich braucht.
- **Cleanup-Sprint**: Legacy `slug`-Spalte droppen — zusammen mit großem i18n-Cleanup.
- **Sitemap-URLs für `/alit`-Sub-Sektionen** (Deep-Linking).

### Out of Scope
- Kein Schema-Change auf `agenda_items.hashtags`, `journal_entries.hashtags`.
- Kein `robots.ts`.
- Kein `slug_de`-Rename (UI disabled, API rejected).
- Kein Cleanup der Legacy `slug`-Spalte.
- Kein Audit-Log in diesem Sprint.
- Kein Feature-Flag in diesem Sprint.

## Technical Approach

### Files to Change

| File | Change | Description |
|------|--------|-------------|
| `src/lib/schema.ts` | Modify | `ADD COLUMN slug_de/slug_fr`, Preflight, idempotenter Backfill, UNIQUE-Indices, `NOT NULL` |
| `src/lib/queries.ts` | Modify | `getProjekte(locale)` liest slug_de/slug_fr + urlSlug; neuer `getProjekteForSitemap()` locale-neutral |
| `src/lib/projekt-slug.ts` | **Create** | `buildProjektSlugMap` Helper |
| `src/lib/site-url.ts` | **Create** | `getSiteUrl(): URL` Env-kapselnd |
| `src/lib/site-url.test.ts` | **Create** | Unit-Tests für URL-Helper |
| `src/content/projekte.ts` | Modify | `Projekt`-Type: slug_de/slug_fr/urlSlug |
| `src/app/layout.tsx` | Modify | `metadataBase: getSiteUrl()` |
| `src/app/api/dashboard/projekte/route.ts` | Modify | POST slug_de required + slug_fr nullable + Cross-Column-Uniqueness + Dual-Write |
| `src/app/api/dashboard/projekte/[id]/route.ts` | Modify | PUT rejected slug_de, akzeptiert slug_fr (skip/clear/set) + CASE WHEN + Cross-Column-Uniqueness |
| `src/app/dashboard/components/ProjekteSection.tsx` | Modify | slug_de Input (Create only), slug_fr Input + Auto-Suggest + getrenntes Fehler-Handling |
| `src/app/[locale]/projekte/[slug]/page.tsx` | Modify | Locale-aware Resolve via getProjekte(locale), 308-Repair, generateMetadata |
| `src/components/ProjekteList.tsx` | Modify | urlSlug-hrefs, isExpanded matched beide Locales |
| `src/components/AgendaItem.tsx` | Modify | Hashtag-href via projektSlugMap |
| `src/components/JournalSidebar.tsx` | Modify | Hashtag-href via projektSlugMap |
| `src/components/Wrapper.tsx` | Modify | projektSlugMap-Prop durchreichen |
| `src/app/[locale]/layout.tsx` | Modify | Map aus getProjekte(locale), an Wrapper |
| `src/app/dashboard/components/AgendaSection.tsx` | Modify | Preview-Pfad: lokaler projektSlugMap-Build |
| `src/app/dashboard/components/JournalPreview.tsx` | Modify | Preview-Pfad: lokaler projektSlugMap-Build |
| `src/lib/seed.ts` | Modify | slug_de/slug_fr + Dual-Write |
| `src/app/sitemap.ts` | **Create** | Locale-neutrale Sitemap mit absoluten URLs + alternates |

**Count:** 20 Files (16 Modify + 4 Create). Scope ist ein Ticken größer als v1, aber alles zusammengehörig und ohne Split tragfähig (Codex bestätigt).

### Architecture Decisions (v2)

**slug_de immutable — Invariant 1**
- Alternative (rename erlauben): hätte Hashtag-Rebinding via slug-History-Table, alle fan-out-Referenzen automatisch updaten, + TTL-Redirects. = eigenes Feature.
- Entscheidung: immutable im Sprint, Rename als separater Feature-Sprint wenn je benötigt.

**Global Uniqueness enforced, nicht warning-only**
- Hart: Pre-Insert/Pre-Update-SELECT auf `slug_de IN ($new_de, $new_fr) OR slug_fr IN ($new_de, $new_fr) OR slug IN (...) WHERE id <> $me`. DB-23505 fängt Race-Window.
- Warum kein CHECK-Constraint / Trigger: PG-seitig clean lösbar nur per TRIGGER oder EXCLUDE CONSTRAINT mit GiST — Überkill für die Rate an POST/PUT-Calls. App-level + DB-Unique pro Spalte + 23505-catch reicht.

**Route nutzt `getProjekte(locale)`, nicht direkte DB-Query**
- Invariant 6: locale-visibility-Filter aus dem Reader wird automatisch durchgesetzt.
- Trade-off: Route-Resolution lädt ganze Projekt-Liste. Aber die wird im selben Layout bereits geladen (für Panel 3), also null-Overhead.

**Sitemap nutzt locale-neutralen Helper**
- `getProjekteForSitemap()` liest Raw-DB ohne Locale-Filter — Sitemap soll alle Projekte listen, auch solche ohne FR-Content (FR-Eintrag zeigt dann auf DE-Fallback).

**`metadataBase` per Env-Var, nicht hardcoded**
- `src/lib/site-url.ts` mit `process.env.SITE_URL ?? 'https://alit.hihuydo.com'`. Dev-Setup kann `SITE_URL=http://localhost:3000` setzen (Staging analog).
- Kein `NEXT_PUBLIC_*` — nur Server-Side verwendet (siehe `patterns/seo.md`).

**`permanentRedirect` (308) durchgängig — kein „301"-Wording**
- Next.js 16 `permanentRedirect()` aus `next/navigation` returnt HTTP 308. Alle Done-Kriterien + Docs sprechen konsistent von 308.

### Dependencies
- Env-Var `SITE_URL` (optional, Default `https://alit.hihuydo.com`). Für Staging setzen: `SITE_URL=https://staging.alit.hihuydo.com`.
- Keine NPM-Pakete.
- Intern: Sprint 2 (i18n-Reader `getProjekte`), Sprint 3 (Hashtag-Shape), PR #37 (FR-Auto-Sync-UX).

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| `/fr/projekte/<slug_de>` mit slug_fr=NULL | 200 mit DE-Fallback-Content, URL bleibt |
| `/fr/projekte/<slug_de>` mit slug_fr gesetzt | 308 → `/fr/projekte/<slug_fr>` |
| `/de/projekte/<slug_fr>` wrong locale | 308 → `/de/projekte/<slug_de>` |
| `/de/projekte/<slug>` Projekt ohne DE-Content (wegfiltriert) | notFound() — locale-visibility |
| `/de/projekte/<non-existent>` | notFound() |
| POST `slug_de` kollidiert mit existing `slug_de` | 409 „Slug (DE) already exists" |
| POST `slug_de` kollidiert mit existing `slug_fr` | 409 „Slug (DE) kollidiert mit existing Slug (FR) eines anderen Projekts" |
| POST `slug_fr` kollidiert mit existing `slug_de` | 409 analog |
| POST `slug_fr = ""` | 400 „slug_fr must be null or non-empty" |
| POST `slug_de = slug_fr` (selbes Projekt) | 400 — Cross-Column-Check greift auch intra-row: slug_de und slug_fr derselben Row dürfen nicht identisch sein (Sonderfall von Uniqueness) |
| PUT `{slug_de: "new"}` | 400 „slug_de is immutable after create" |
| PUT `{slug_fr: null}` | Clear — SET slug_fr=NULL |
| PUT `{slug_fr: undefined}` (nicht gesendet) | Skip |
| PUT `{slug_fr: ""}` | 400 |
| PUT `{slug_fr: "...", ...}` kollidiert | 409 |
| Hashtag-projekt_slug auf gelöschtes Projekt | Map-Miss → Fallback auf gespeicherten Wert → `/fr/projekte/<alter_slug>` → notFound beim Klick (Status quo) |
| Sitemap bei Projekt mit slug_fr=NULL | DE-Eintrag + FR-Eintrag mit url=`/fr/projekte/<slug_de>`, `alternates.languages.fr` = selbe URL |
| Dashboard-Preview (Staging oder Panel-2-Preview) mit Hashtag | Preview-Komponente baut lokalen projektSlugMap aus der Dashboard-Projekte-Liste, href korrekt |

## Risks

**Risk 1 (High): metadataBase-Regression in bestehenden Seiten**
- Wenn `metadataBase` neu gesetzt wird, emittiert Next.js alle bisher relativen URLs plötzlich mit Host-Prefix. Theoretisch Breaking bei JSON-LD oder OG-URLs die `absolute` erwartet hatten.
- Mitigation: grep `src/app/**/*.tsx` nach `metadata:` und `openGraph:` / `twitter:` — kein Eintrag setzt absolute URLs heute (Code hat aktuell fast keine Metadata-Setups). Risk: klein.

**Risk 2 (Medium): Bootstrap-Migration failed auf Legacy-DB mit duplicate `slug`**
- Wenn DB-Daten durch manuelle Ops mal duplicate `slug` haben, crasht Preflight.
- Mitigation: Preflight-Fehlermeldung ist aktionable („duplicate legacy slug found: X, fix manually before restart"). Container restart fängt in `instrumentation.ts` (pattern `nextjs.md`) und kommt ins Retry-Loop bis Admin manuell eingreift.

**Risk 3 (Low): Cross-Column-Race-Window**
- Zwischen Pre-SELECT und INSERT könnte paralleler POST colliden.
- Mitigation: DB-Unique (slug_de, slug_fr partial) + `23505`-catch im Handler. App-level Check reduziert Race-Fenster auf unter 10ms, DB fängt den Rest.

**Risk 4 (Medium): Sitemap-Stale-Cache bei schnellem Slug-Toggle**
- `force-dynamic` sollte das verhindern, aber CDN-Caching könnte hängen.
- Mitigation: `force-dynamic` + `Cache-Control: no-cache` im sitemap.ts Response-Header erzwingen.

**Risk 5 (Low): Stale Build nach Schema-Change**
- `lessons.md` „stale Build Symptome". `docker compose up --build -d` nach Migration.

## Rollback-Plan
- Legacy `slug`-Spalte wird dual-geschrieben → revert-Deploy funktioniert mit altem Code-Pfad ohne Datenverlust.
- Neue `slug_de/slug_fr`-Spalten bleiben additiv liegen → kein Downgrade-Migration nötig.
- Feature-Flag ist Nice-to-Have; bei Prod-Issue genügt Revert-Deploy.

## Deployment-Verifikation (Pflicht nach Staging + Production)
- CI grün (`gh run watch`)
- `/api/health/` → 200
- `/de/projekte/<slug>` → 200, visuell identisch
- `/fr/projekte/<slug_de>` → 200 (DE-Fallback) oder 308 bei slug_fr
- Admin POST: neues Projekt mit `slug_fr` → UI-Success, `/fr/projekte/<neu>` funktioniert
- Admin PUT: slug_fr ändern → funktioniert; slug_de-Änderungsversuch → 400
- `/sitemap.xml` → 200, absolute URLs, hreflang-Alternates
- Container logs clean
