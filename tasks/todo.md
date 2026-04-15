# Sprint: URL-Slug-Übersetzung für Projekte
<!-- Spec: tasks/spec.md (v3) -->
<!-- Started: 2026-04-15 -->

## Done-Kriterien
> Alle müssen PASS sein. Getestete Invarianten aus spec.md:
> 1. `slug_de` immutable nach Create
> 2. `slug_fr` mutable (skip/clear/set)
> 3. `urlSlug` derived-only
> 4. Global Slug-Uniqueness (Cross-Column)
> 5. Legacy `slug` Write-only
> 6. Route-Resolution via `getProjekte(locale)` (locale-visibility-safe)

- [ ] `pnpm build` clean — 0 TS errors, 0 lint errors, alle Routes inkl. `/sitemap.xml`.
- [ ] `pnpm test` grün — 69 bestehende + neue (validateSlug, site-url, buildProjektSlugMap).
- [ ] Schema: `slug_de NOT NULL`, `slug_fr` nullable, UNIQUE + Partial UNIQUE, idempotent, Duplicate-Preflight auf Legacy `slug`, Re-run-safe.
- [ ] `getProjekte(locale)` returnt `slug_de, slug_fr, urlSlug`. Neuer locale-neutraler `getProjekteForSitemap()`.
- [ ] Dashboard POST: slug_de required + slug_fr nullable + **Cross-Column-Global-Uniqueness** (pre-SELECT + 23505-catch). 409 differenziert (welches Feld betroffen).
- [ ] Dashboard PUT: **rejected slug_de in Body mit 400** (Immutability-Invariant). Akzeptiert slug_fr undefined/null/string. Partial-safe via CASE WHEN. Cross-Column-Uniqueness.
- [ ] Dashboard UI: slug_de disabled im Edit-Modal, nur bei Create editierbar. slug_fr Auto-Suggest. Getrenntes Fehler-Handling.
- [ ] `[locale]/projekte/[slug]/page.tsx`: Resolve **via `getProjekte(locale)`** (nicht direkter DB-Query), 308-Repair, `generateMetadata` mit absoluten `alternates.languages` URLs.
- [ ] ProjekteList/AgendaItem/JournalSidebar/Wrapper/layout verwenden `urlSlug` bzw. `projektSlugMap[projekt_slug]?.urlSlug`.
- [ ] **Dashboard-Preview-Pfad** (nur AgendaSection-Preview — nutzt produktives `AgendaItem`) baut lokalen `projektSlugMap` aus Dashboard-Projekte-Liste. `JournalPreview` out-of-scope (rendert Hashtags als span ohne Link).
- [ ] `src/lib/site-url.ts` + `src/app/layout.tsx` `metadataBase: getSiteUrl()`. Env `SITE_URL` respektiert.
- [ ] `src/app/sitemap.ts` emittiert **absolute URLs** (via `metadataBase` oder `new URL(path, getSiteUrl())`), beide Locales, `alternates.languages` pro Eintrag, `force-dynamic` + `Cache-Control: no-cache`.
- [ ] Seed schreibt `slug_de`, `slug_fr=null`, Dual-Write `slug = slug_de`.
- [ ] **Automated Tests** — Unit + Integration:
  - [ ] Unit: validateSlug regex (valid, reject: uppercase, leading/trailing-hyphen, unicode, length-101, empty).
  - [ ] Unit: site-url helper (Default, Env-Override).
  - [ ] Unit: buildProjektSlugMap round-trip.
  - [ ] Integration API: POST Cross-Column-Collision (A.slug_de = B.slug_fr bzw. A.slug_fr = B.slug_de) → 409.
  - [ ] Integration API: PUT `{slug_de:"x"}` → 400; `{slug_fr:null}` = clear; `{slug_fr:undefined}` = skip.
  - [ ] Integration Route: DE-only Projekt auf `/fr/projekte/<slug_de>` → 200 mit DE-Fallback; DE-only Projekt auf `/de/projekte/<slug>` wenn DE-Content leer → notFound.
  - [ ] Integration Sitemap: absolute URLs (enthalten `https://`), `alternates.languages` korrekt, DE-only-Projekt emittiert KEINEN FR-Eintrag.
- [ ] **Manual/staging-verifikation**:
  - [ ] `/de/projekte/<slug_de>` → 200
  - [ ] `/fr/projekte/<slug_de>` mit slug_fr=NULL → 200 DE-Fallback
  - [ ] `/fr/projekte/<slug_de>` mit slug_fr gesetzt → 308 → slug_fr
  - [ ] `/de/projekte/<slug_fr>` → 308 → slug_de
  - [ ] `/de/projekte/<slug>` bei DE-leerem Projekt → notFound
  - [ ] `/sitemap.xml` → valide, absolute URLs, hreflang-Alternates
  - [ ] PUT mit `{slug_de: "x"}` → 400
  - [ ] POST Cross-Column-Collision (A.slug_de = B.slug_fr) → 409
- [ ] `memory/lessons.md` + `memory/todo.md` vor Merge aktualisiert.

## Tasks

### Phase 1 — SEO Foundation (Vorbedingung, muss zuerst)
- [ ] `src/lib/site-url.ts` + `src/lib/site-url.test.ts` — URL-Helper mit Env-Override, 3 Tests.
- [ ] `src/app/layout.tsx` — `metadataBase: getSiteUrl()` setzen.
- [ ] **Staging-Env-Update:** `/opt/apps/alit-website-staging/.env` mit `SITE_URL=https://staging.alit.hihuydo.com` ergänzen (per SSH oder manuell durch User). Ohne dieses Env ergeben Staging-Canonicals prod-URLs → SEO-Leak. Prod-`.env` analog mit `SITE_URL=https://alit.hihuydo.com` (klärend, nicht zwingend wegen Default).
- [ ] Phase 1 separate-committable: ja, ABER Staging-Env muss zeitgleich gesetzt sein.

### Phase 2 — Schema + Migration + Seed
- [ ] `src/lib/schema.ts`:
  - Preflight: SELECT count(*) FROM projekte WHERE slug IS NULL OR slug = '' → throw.
  - Preflight: SELECT slug, count(*) FROM projekte GROUP BY slug HAVING count > 1 → throw.
  - `ALTER TABLE projekte ADD COLUMN IF NOT EXISTS slug_de TEXT, ADD COLUMN IF NOT EXISTS slug_fr TEXT`.
  - Idempotenter JS-Backfill `slug_de = slug` für NULL/empty-Rows.
  - `CREATE UNIQUE INDEX IF NOT EXISTS projekte_slug_de_unique ON projekte (slug_de)`.
  - `CREATE UNIQUE INDEX IF NOT EXISTS projekte_slug_fr_unique ON projekte (slug_fr) WHERE slug_fr IS NOT NULL`.
  - Post-Backfill `ALTER COLUMN slug_de SET NOT NULL` (mit idempotent-check oder try/catch).
- [ ] `src/lib/seed.ts`: INSERT schreibt slug_de + slug_fr=null + Dual-Write `slug = slug_de`.
- [ ] Lokaler Test: schema.ts laufen lassen, `SELECT slug, slug_de, slug_fr FROM projekte;` prüft Backfill.

### Phase 3 — Reader + Types + Helper
- [ ] `src/content/projekte.ts`: `Projekt`-Type — `slug` → `slug_de`, `slug_fr`, `urlSlug`.
- [ ] `src/lib/queries.ts`:
  - `getProjekte(locale)` selektiert slug_de/slug_fr, berechnet urlSlug, Legacy `slug` nicht mehr im SELECT.
  - Neuer `getProjekteForSitemap()` locale-neutral (für Sitemap + generateMetadata).
- [ ] `src/lib/projekt-slug.ts` + test: `buildProjektSlugMap` Helper.

### Phase 4 — Dashboard API
- [ ] `src/app/api/dashboard/projekte/route.ts` POST:
  - `validateSlug(s)` regex-Validator extrahieren (Unit-tested).
  - Body: slug_de required, slug_fr optional (undefined/null/string).
  - Pre-Insert Cross-Column-Uniqueness-Check (inkl. legacy `slug`).
  - 409 differenziert DE-Coll vs FR-Coll.
  - INSERT mit Dual-Write `slug = slug_de`.
  - 23505-catch als Race-Fallback.
- [ ] `src/app/api/dashboard/projekte/[id]/route.ts` PUT:
  - Body darf `slug_de` nicht enthalten → 400.
  - slug_fr: undefined skip / null clear / string set (regex + cross-column-uniqueness).
  - `CASE WHEN $sent THEN $val ELSE slug_fr END` Pattern.
- [ ] Unit-Test für `validateSlug`.

### Phase 5 — Dashboard UI
- [ ] `src/app/dashboard/components/ProjekteSection.tsx`:
  - Form: slug_de + slug_fr.
  - Create-Modus: slug_de editierbar.
  - Edit-Modus: slug_de disabled + Hinweis „URL-Slug kann nach Create nicht geändert werden".
  - slug_fr Auto-Suggest (onFocus wenn leer → Fill mit slug_de; User-Tipp überschreibt).
  - Getrennte Fehler-Felder (setSlugDeError vs setSlugFrError).
  - Save: `slug_fr: form.slug_fr.trim() || null`.

### Phase 6 — Routing + Metadata
- [ ] `src/app/[locale]/projekte/[slug]/page.tsx`:
  - Holt `getProjekte(locale)` — locale-gefilterte Liste.
  - Findet Match `slug_de === params.slug || slug_fr === params.slug`.
  - notFound wenn keine Match (oder locale-gefiltert).
  - `permanentRedirect` wenn urlSlug !== params.slug.
- [ ] `generateMetadata` für Detail-Seite via `getProjekteForSitemap()`, `alternates.canonical` + `.languages`.

### Phase 7 — Hashtag-Resolver
- [ ] `src/app/[locale]/layout.tsx`: buildProjektSlugMap + an Wrapper.
- [ ] `src/components/Wrapper.tsx`: Prop durchreichen.
- [ ] `src/components/AgendaItem.tsx` + `src/components/JournalSidebar.tsx`: **Map-Hit → `<a href>`; Map-Miss → `<span>` ohne Link** (locale-hidden projekt erzeugt keine 404-Link). Label bleibt sichtbar.
- [ ] `src/components/ProjekteList.tsx`: href `p.urlSlug`, isExpanded matched beide Locales.
- [ ] **Dashboard-Preview-Pfad (nur Agenda)**: `src/app/dashboard/components/AgendaSection.tsx`-Preview baut lokalen Map aus Dashboard-Projekte-Liste. `JournalPreview` out-of-scope (keine Links).

### Phase 8 — Sitemap
- [ ] `src/app/sitemap.ts`:
  - `export const dynamic = 'force-dynamic'`.
  - Nutzt `getProjekteForSitemap()`.
  - **Emission-Regel (spec.md §31):**
    - DE+FR vorhanden → zwei Einträge mit `alternates.languages {de, fr, x-default}`.
    - Nur DE → ein Eintrag `/de/...` mit `alternates.languages {de, x-default}`, KEIN FR-Eintrag.
    - Ohne DE → skip.
  - Statische Routes (`/`, `/projekte`, `/alit`, `/newsletter`, `/mitgliedschaft`) mit beiden Locales.
  - Absolute URLs via `metadataBase`-Auflösung oder `new URL(path, getSiteUrl())`.
  - **Keine manuelle Cache-Control** — `force-dynamic` reicht; `MetadataRoute.Sitemap` unterstützt keine Response-Headers.

### Phase 9 — Wrap-up
- [ ] Build/Test/Lint clean.
- [ ] Phase-weise Commits (Phase 1 Foundation ist committable-as-is → 1 Commit; Phase 2+3 Schema+Reader zusammen; Phase 4+5 API+UI zusammen; Phase 6+7 Routing+Hashtag; Phase 8 Sitemap separat).
- [ ] Staging-Push → Deploy-Verifikation (CI, URL, Health, sitemap.xml, Logs).
- [ ] PR eröffnen + Codex-Review (max 2 Runden).
- [ ] Merge → Production-Deploy-Verifikation.
- [ ] `memory/lessons.md`: Sprint-Lessons (Invariant-first-Spec, immutable-ID-Pattern, metadataBase-Foundation).
- [ ] `memory/todo.md`: Sprint 5 als erledigt, Follow-ups (Audit-Log, Feature-Flag, Slug-Rename, Cleanup-Sprint, robots.ts).

## Notes

- **Changes v2 → v3** (aus Codex-Spec-Review Runde 2):
  - Hashtag-Map-Miss = `<span>` ohne Link statt broken `<a>`-href (verhindert absichtliche 404-Links bei locale-hidden projekten).
  - Sitemap-Emission-Regel eindeutig: DE-only-Projekte emittieren KEINEN FR-Eintrag (kein fake-hreflang).
  - Integration-Tests für Cross-Column-Collision, locale-hidden-Route-notFound, sitemap-absolute-URLs ergänzt.
  - Staging-Env `SITE_URL` explizit als Phase-1-Voraussetzung (sonst Canonical-Leak).
  - Cache-Control aus Sitemap entfernt (MetadataRoute.Sitemap unterstützt's nicht).
  - `JournalPreview` aus Scope — rendert Hashtags ohne Link, braucht keine Map.
- **Changes v1 → v2** (aus Codex-Review Runde 1):
  - Neuer Invariant-Block (6 Invarianten) oben im Spec.
  - slug_de immutable (kein PUT-Edit, Dashboard-UI disabled).
  - Cross-Column-Global-Uniqueness hart erzwungen (war warning-only in v1).
  - `metadataBase` + `src/lib/site-url.ts` als Phase 1 Foundation.
  - Route nutzt `getProjekte(locale)` (nicht direkter DB-Query) — locale-visibility-safe.
  - Sitemap nutzt `getProjekteForSitemap()` (locale-neutral, nicht getProjekte).
  - 308/permanentRedirect konsistent (kein „301"-Wording).
  - Dashboard-Preview-Pfade explizit in Scope (AgendaSection-Preview, JournalPreview).
  - Automated Tests für validateSlug, site-url, buildProjektSlugMap verpflichtend.
  - Rollback-Plan-Section.
- **Audit-Log + Feature-Flag** → Nice-to-Have, `memory/todo.md`.
- **Erwarteter Umfang**: Medium-Large — 20 Files (16 Modify + 4 Create), 5-7h Implementation. Phase 1 Foundation ist 1h und isoliert (SEO-Hardening-Win for free).
- **Phase 1 kann direkt auf main gemergt werden** (isolierte Foundation, kein Slug-Bezug). Rest dann auf diesem Branch.
