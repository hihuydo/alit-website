# Sprint: URL-Slug-Übersetzung für Projekte
<!-- Spec: tasks/spec.md -->
<!-- Started: 2026-04-15 -->

## Done-Kriterien
> Alle müssen PASS sein bevor der Sprint als fertig gilt.

- [ ] `pnpm build` clean — 0 TypeScript errors, 0 lint errors, alle Routes generieren.
- [ ] `pnpm test` alle Tests grün (bestehende 69 + neue für slug-validator).
- [ ] Schema-Migration `slug_de NOT NULL`, `slug_fr` nullable, beide UNIQUE (partial für FR) via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. Idempotenter JS-Backfill `slug_de = slug`. Re-run-safe (zweiter Boot skip).
- [ ] `getProjekte(locale)` returnt `slug_de, slug_fr, urlSlug` — Reader ignoriert Legacy `slug`-Spalte komplett.
- [ ] Dashboard POST/PUT akzeptiert `slug_de` (required) + `slug_fr` (nullable-optional) mit Regex-Validierung (lowercase + hyphen), Cross-Column-Uniqueness-Check. 409 mit spezifischer Fehlermeldung DE vs FR.
- [ ] Dashboard-UI hat zwei Slug-Inputs mit Auto-Suggest FR-von-DE (ohne Auto-Kopie beim Save).
- [ ] `[locale]/projekte/[slug]/page.tsx` resolved via `slug_de OR slug_fr`, 301-Repair bei Locale/Slug-Mismatch, `generateMetadata` mit `alternates.languages`.
- [ ] ProjekteList + AgendaItem + JournalSidebar verwenden `urlSlug` bzw. `projektSlugMap[projekt_slug]?.urlSlug` für hrefs. Wrapper reicht Map durch.
- [ ] `src/app/sitemap.ts` emittiert valides XML mit beiden Locales + `alternates.languages` für jeden Projekt + statische Routen.
- [ ] Seed schreibt `slug_de` + `slug_fr=null` + Dual-Write Legacy `slug`.
- [ ] `/de/projekte/<slug>` visuell identisch. `/fr/projekte/<slug_de>` 200 mit DE-Fallback, `/fr/projekte/<slug_fr>` 200 mit FR-Content, `/fr/projekte/<slug_de>` mit vorhandenem `slug_fr` → 301.
- [ ] `memory/lessons.md` + `memory/todo.md` vor Merge aktualisiert. `memory/project.md` bei architekturrelevanten Erkenntnissen.

## Tasks

### Phase 1 — Schema + Migration + Seed
- [ ] `src/lib/schema.ts`: `ALTER TABLE projekte ADD COLUMN IF NOT EXISTS slug_de TEXT, ADD COLUMN IF NOT EXISTS slug_fr TEXT`. Idempotenter Backfill-Loop (SELECT rows mit `slug_de IS NULL OR slug_de = ''`, UPDATE `slug_de = slug`).
- [ ] `src/lib/schema.ts`: UNIQUE-Constraint `projekte_slug_de_unique` + Partial-UNIQUE `projekte_slug_fr_unique ON (slug_fr) WHERE slug_fr IS NOT NULL` (idempotent via `ADD CONSTRAINT IF NOT EXISTS` oder pg_constraint-Check).
- [ ] `src/lib/schema.ts`: Post-Backfill `ALTER COLUMN slug_de SET NOT NULL` (mit Precondition-Check: alle Rows haben `slug_de` non-null).
- [ ] `src/lib/seed.ts`: INSERT schreibt `slug_de` + `slug_fr: null` + `slug` (Dual-Write) aus `src/content/projekte.ts`.
- [ ] Manueller Test auf lokaler DB: schema.ts laufen lassen, `SELECT slug, slug_de, slug_fr FROM projekte;` prüft Backfill.

### Phase 2 — Reader + Types
- [ ] `src/content/projekte.ts`: `Projekt`-Type: `slug: string` → `slug_de: string; slug_fr: string | null; urlSlug: string`. `urlSlug` ist der für die Render-Locale aufgelöste Slug.
- [ ] `src/lib/queries.ts`: `getProjekte(locale)` selektiert `slug_de, slug_fr`, berechnet `urlSlug = locale === 'fr' ? (slug_fr ?? slug_de) : slug_de`. Legacy `slug` nicht mehr im SELECT.
- [ ] Helper `buildProjektSlugMap(projekte): Record<string, {slug_de, slug_fr, urlSlug}>` (keyed by `slug_de`) in `queries.ts` oder neuem `src/lib/projekt-slug.ts`.

### Phase 3 — Dashboard API
- [ ] `src/app/api/dashboard/projekte/route.ts` POST:
  - Body: `slug_de` (required, regex validate), `slug_fr` (optional: undefined/null/string).
  - `validateSlug(s)`: regex `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`, length 1-100.
  - Cross-Column-Uniqueness-Check via Pre-Insert-SELECT: `SELECT id FROM projekte WHERE slug_de = $1 OR slug_de = $2 OR slug_fr = $1 OR slug_fr = $2`.
  - INSERT mit Dual-Write: `slug = slug_de`.
  - 409 bei DE-Collision vs FR-Collision differenziert (Error-Message).
- [ ] `src/app/api/dashboard/projekte/[id]/route.ts` PUT:
  - Partial-safe: `slug_de` kann geändert werden (mit Collision-Check), `slug_fr` kann gesetzt/gecleared werden (`CASE WHEN sent THEN val ELSE slug_fr END`).
  - Dual-Write: bei `slug_de`-Änderung auch Legacy `slug = slug_de` syncen.
- [ ] `src/app/api/dashboard/projekte/[id]/route.ts` GET (falls existiert): returnt beide Slugs.

### Phase 4 — Dashboard UI
- [ ] `src/app/dashboard/components/ProjekteSection.tsx`:
  - Form-State: `{slug_de, slug_fr}` statt `{slug}`.
  - Zwei Input-Felder mit Labels „URL-Slug (DE)" + „URL-Slug (FR)".
  - FR-Input mit Placeholder „leer = DE-Slug wird verwendet" + Auto-Suggest (beim Focus mit leerem FR-Wert → fülle mit aktuellem DE-Wert, wenn User weiter tippt bleibt das tippende; Auto-Clear wenn User FR-Feld wieder leert).
  - 409-UX: setError setzt entweder `slugDeError` oder `slugFrError` je nach Response-Body.
  - Speichern sendet `slug_fr: form.slug_fr.trim() || null`.

### Phase 5 — Routing + Redirect
- [ ] `src/app/[locale]/projekte/[slug]/page.tsx`:
  - Server Component, DB-Lookup via `WHERE slug_de = $1 OR slug_fr = $1 LIMIT 1` mit Locale-Priority (siehe spec.md „Risk 2").
  - Wenn nicht gefunden → `notFound()`.
  - Wenn gefunden: `correctSlug = locale === 'fr' ? (row.slug_fr ?? row.slug_de) : row.slug_de`. Wenn `correctSlug !== params.slug` → `permanentRedirect(`/${locale}/projekte/${correctSlug}`)`.
  - Sonst: render null (ProjekteList im Wrapper übernimmt Expansion via `useParams().slug`).
- [ ] `generateMetadata` exportieren: `alternates.languages: {de: /de/projekte/<slug_de>, fr: /fr/projekte/<slug_fr ?? slug_de>, 'x-default': /de/...}`.

### Phase 6 — Hashtag-Resolver in Renderern
- [ ] `src/app/[locale]/layout.tsx`: Map via `buildProjektSlugMap(projekte)` bauen, an Wrapper als Prop.
- [ ] `src/components/Wrapper.tsx`: `projektSlugMap`-Prop definieren, an AgendaItem + JournalSidebar weitergeben.
- [ ] `src/components/AgendaItem.tsx`: Hashtag-href: `/{locale}/projekte/{projektSlugMap[h.projekt_slug]?.urlSlug ?? h.projekt_slug}`.
- [ ] `src/components/JournalSidebar.tsx`: dito.
- [ ] `src/components/ProjekteList.tsx`: `href` nutzt `p.urlSlug`, `isExpanded` matched gegen `params.slug === p.slug_de || params.slug === p.slug_fr`.

### Phase 7 — SEO: Sitemap
- [ ] `src/app/sitemap.ts` erstellen (neue Datei):
  - `export const dynamic = 'force-dynamic'`
  - Fetch `getProjekte('de')` (um slug_de + slug_fr zu kennen, locale-neutrale Query wäre auch OK — zur Sprint-Simplizität reicht getProjekte('de')).
  - Emit für jede Route (`/`, `/projekte`, `/projekte/<slug>`, `/alit`, `/newsletter`, `/mitgliedschaft`) beide Locales mit `alternates: {languages: {de: ..., fr: ..., 'x-default': ...}}`.
  - `return MetadataRoute.Sitemap`.

### Phase 8 — Wrap-up
- [ ] `pnpm build` + `pnpm test` + `pnpm lint`.
- [ ] Commit: Phase-weise oder als ein Sprint-Commit (Opus-Entscheidung je nach Umfang).
- [ ] Staging-Push → Deploy-Verifikation (CI, URL, Health, Logs).
- [ ] PR eröffnen + Codex-Review (max 2 Runden).
- [ ] Merge → Production-Deploy-Verifikation.
- [ ] `memory/lessons.md`: neue Sprint-Lessons (wenn identifiziert).
- [ ] `memory/todo.md`: Sprint-2-Erledigt-Eintrag, Todo #2 verschieben nach Erledigt.
- [ ] `memory/project.md`: falls Routing-Architektur (locale-aware redirects, sitemap) als neues Pattern relevant.

## Notes

- **Hashtag-Resolver statt Shape-Migration**: Bewusste Architektur-Entscheidung (spec.md „Architecture Decisions"). Sparen uns Sprint-3/4-equivalent auf zwei Tabellen. Beide Sprints hatten je 2-3 Codex-Runden wegen Partial-PUT-Feinheiten — das Vermeiden ist ein Win.
- **Lesson-Referenzen**: Partial-PUT (lessons 2026-04-14 + 2026-04-15), Dual-Write-Reader-Isolation (2026-04-15), Precondition-Abort (2026-04-15) alle aktiv anwenden.
- **Codex-Review-Scope-Erwartung**: Partial-PUT für nullable `slug_fr` (undefined/null/string) ist der Hotspot, wurde in Sprint 2 mit P1-Crash gefunden, wurde in Sprint 3/4 präventiv angewandt. Hier analog.
- **Scope-Trennung**: Robots, Slug-Rename-History, Cleanup-Sprint = separate Todos. Codex-Findings dazu sind Follow-ups, keine Blocker.
- **Erwarteter Umfang**: Medium — 13 Files, 4-6h Implementation. Wenn beim Bauen Unerwartetes auftaucht, **spec.md aktualisieren** (Living Document per planner-Skill-Regel).
