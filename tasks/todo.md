# Sprint: Agenda Image-Slider (Frontend Panel 1)
<!-- Spec: tasks/spec.md -->
<!-- Started: 2026-04-26 -->

## Done-Kriterien (Sprint Contract)

> Alle müssen PASS sein bevor der Sprint als fertig gilt.

### Mechanical (pre-push verifizierbar)

- [ ] **DK-1** `pnpm build` passes — keine TS-Errors
- [ ] **DK-2** `pnpm test` passes — alle bestehenden + neue Tests grün (~639 + Δ; Generator dokumentiert finale Zahl im PR-Body)
- [ ] **DK-3** `pnpm audit --prod` — 0 HIGH/CRITICAL
- [ ] **DK-4** `grep -rn "images_as_slider" src/lib/schema.ts` zeigt `ALTER TABLE agenda_items ADD COLUMN IF NOT EXISTS images_as_slider BOOLEAN NOT NULL DEFAULT false`
- [ ] **DK-5** `grep -rn "images_as_slider\|imagesAsSlider" src/lib/queries.ts` zeigt SELECT-Erweiterung + Output-Mapping
- [ ] **DK-6** `src/components/AgendaImageSlider.tsx` existiert, exportiert default `AgendaImageSlider`-Component
- [ ] **DK-7** `src/components/AgendaImageSlider.test.tsx` existiert, mindestens 3 Test-Cases (render N Bilder, render N Dots, Klick auf Dot triggert scrollIntoView-Mock)

### Semantic (Code-Review verifizierbar)

- [ ] **DK-8** Schema: idempotente additive Migration in `ensureSchema()`, NICHT in der initialen `CREATE TABLE`-Block (= konsistent mit existing pattern für `images JSONB` aus PR-Historie)
- [ ] **DK-9** Public Renderer `AgendaItem.tsx`: bei `images.length >= 2 && imagesAsSlider === true` rendert `<AgendaImageSlider>` (kein Grid-Block); sonst bisheriger Grid-Pfad bit-identisch
- [ ] **DK-10** Slider-Container nimmt volle Panel-Breite via negative side-margin `calc(-1 * var(--spacing-base))`, fixed height `clamp(240px, 30vw, 420px)`, Bilder mit `height:100%; width:auto; object-fit:contain`, horizontal zentriert
- [ ] **DK-11** Dots: 1 Button pro Bild mit `aria-label="Bild N anzeigen"` + `aria-current="true"` auf aktivem Dot, Touch-Target ≥ 28×28 (via Padding)
- [ ] **DK-12** Active-Dot via IntersectionObserver auf scroll-container (root=container, threshold=0.5), nicht via scroll-event
- [ ] **DK-13** Klick auf Dot N → `slides[N].scrollIntoView({ behavior: <reduced-motion-aware>, inline:'center', block:'nearest' })`
- [ ] **DK-14** `prefers-reduced-motion: reduce` deaktiviert smooth scroll-behavior
- [ ] **DK-15** Dashboard-Toggle: Checkbox „Bilder als Slider anzeigen (statt Grid)" unter Bilder-Liste, disabled bei `< 2 Bildern` mit Hint-Text. **Auto-Reset** im `removeImage`-Handler: Bei Drop unter 2 + `images_as_slider===true` → Form-State auf `false` zurücksetzen (DK-15-Test verifiziert)
- [ ] **DK-16** API GET-Detail + GET-Liste returnen `images_as_slider`; POST default false bei Omission; PUT updated nur wenn Field im Body (`Object.hasOwn`-Pattern, NICHT COALESCE auf Boolean); Boolean-Type-Validation `if ('images_as_slider' in body && typeof body.images_as_slider !== 'boolean') return 400`
- [ ] **DK-17** Kein neues Audit-Event in diesem Sprint. Comprehensive `agenda_update`-Audit-Coverage als Follow-up nach `memory/todo.md` loggen (Begründung: existing `agenda/[id]/route.ts` hat aktuell keinen `auditLog()`-Call — eigenständige Sprint-Diskussion)
- [ ] **DK-18** `AgendaItemData` Type um optionales `imagesAsSlider?: boolean` erweitert — bestehende Seed-Fixture (`src/content/agenda.ts`) typchecked ohne Update
- [ ] **DK-19** Branching-Test in `AgendaItem.test.tsx` (neu erstellt) deckt 3 Cases (Slider-aktiv, 1-Bild-Fallback, Toggle-OFF). Mocks: `vi.mock("next/navigation", () => ({ useParams: () => ({ locale: "de" }) }))` + `vi.mock("@/components/AgendaImageSlider", ...)` für Branching-Isolation
- [ ] **DK-23** Slider-Test `AgendaImageSlider.test.tsx`: JSDOM-Mocks am Top-of-File (`vi.stubGlobal("IntersectionObserver", ...)` + `Element.prototype.scrollIntoView = vi.fn()`) sowie `useReducedMotion`-Mock — sonst wirft Mount-Time
- [ ] **DK-24** `src/lib/use-reduced-motion.ts` neu: SSR-safe Hook, `typeof window === 'undefined' → false`, matchMedia + addEventListener-cleanup
- [ ] **DK-25** Slider-Component: alle browser-only APIs (IntersectionObserver, scrollIntoView, matchMedia) in `useEffect` (nicht Render-Body, nicht Module-Level) — verhindert SSR-Crash
- [ ] **DK-26** Slider-Bilder bekommen `alt={img.alt ?? ""}` — konsistent mit `AgendaItem.tsx:183` Grid-Renderer (WCAG 1.1.1)
- [ ] **DK-27** Stable Slide-Refs via `useRef<HTMLDivElement[]>([])` mit `ref={el => { if (el) slidesRef.current[i] = el }}`-Callback — vermeidet `useCallback`-deps-Trap aus `lessons.md` 2026-04-22 PR #110
- [ ] **DK-28** `makeItem()`-Helper in existing `AgendaSection.test.tsx` um `images_as_slider: false` erweitert — sonst TypeScript-Build-Fail bei Type-Erweiterung

### Manual (Dev-Browser-verifiziert vor PR)

- [ ] **DK-20** `pnpm dev` lokal: Agenda-Eintrag mit 3+ Bildern erstellt, Toggle aktiviert, Public Panel 1 rendert Slider — Touch-Swipe (Browser DevTools Mobile-Emulation auf 375px) und Maus-Scroll zentrieren auf Snap-Position. Dots reagieren auf Klick + reflektieren aktuellen Slide.
- [ ] **DK-21** Reduced-Motion-Toggle in DevTools (Rendering-Tab → emulate `prefers-reduced-motion: reduce`) → smooth scroll deaktiviert (instant jump auf Dot-Klick).
- [ ] **DK-22** Toggle-OFF-Eintrag (oder bestehender, unmigrierter) rendert bit-identisches Grid wie heute — visuelle Smoke gegen Prod-URL.

## Phasen-Schnitt (Generator-Hinweis)

Empfohlen: **EIN PR mit drei Commits** in der Reihenfolge unten. Phase 1 ist additive DDL → safe für shared-DB Co-Deploy. Falls Codex-Diff zu groß wird, kann Generator splitten — Sprint-Contract bleibt identisch.

### Phase 1 — DB + Public Query Foundation
- [ ] Schema-Migration `images_as_slider` additive ALTER in `ensureSchema()`
- [ ] `getAgendaItems()` SELECT erweitert + Output-Mapping
- [ ] `AgendaItemData` Type um optionales `imagesAsSlider?: boolean`
- [ ] Commit: `feat(agenda): add images_as_slider column + public-query mapping`

### Phase 2 — Dashboard-Toggle + API-Roundtrip
- [ ] `AgendaSection.tsx` Form-State + Checkbox-UI + disabled-bei-<2-Bildern + Auto-Reset im `removeImage`-Handler
- [ ] `makeItem()` in `AgendaSection.test.tsx` um `images_as_slider: false` erweitern (sonst TS-Fail)
- [ ] `agenda/route.ts` (GET-Liste + POST) inkl. Default false
- [ ] `agenda/[id]/route.ts` (GET-Detail + PUT) mit `Object.hasOwn`-Patch + Boolean-Type-Validation
- [ ] Tests: `AgendaSection.test.tsx` Toggle-Verhalten + Auto-Reset, `agenda/[id]/route.test.ts` Field-Roundtrip + 400 bei String-statt-Boolean
- [ ] Commit: `feat(dashboard): add agenda image-slider toggle`

### Phase 3 — Frontend-Slider-Component + Renderer-Integration
- [ ] `src/lib/use-reduced-motion.ts` neu (SSR-safe matchMedia-Hook)
- [ ] `AgendaImageSlider.tsx` neue Component: CSS scroll-snap, alle browser-only APIs in `useEffect`, stable `useRef<HTMLDivElement[]>` für Slides, `useReducedMotion`-Hook für Dot-Click-Behavior, `alt`-Attribute auf jedem `<img>`
- [ ] `AgendaItem.tsx` Branching `images.length >= 2 && imagesAsSlider`
- [ ] Tests: `AgendaImageSlider.test.tsx` mit JSDOM-Mocks (`IntersectionObserver`, `scrollIntoView`, `useReducedMotion`) + `AgendaItem.test.tsx` neu erstellen mit `useParams`-Mock + Slider-Component-Mock
- [ ] Manual Dev-Browser-Verify (DK-20/21/22)
- [ ] Commit: `feat(agenda): render image-slider on public panel 1`

## PMC (Post-Merge, manuell)

- [ ] **PMC-1** CI-Deploy grün auf Staging-Push
- [ ] **PMC-2** CI-Deploy grün auf Prod-Merge
- [ ] **PMC-3** `/api/health/` 200 auf staging + prod nach Deploy
- [ ] **PMC-4** Staging-DB-Sanity: `psql -c "SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_name='agenda_items' AND column_name='images_as_slider'"` zeigt die neue Spalte als `NOT NULL DEFAULT false`
- [ ] **PMC-5** Auf prod testweise einen Agenda-Eintrag mit ≥2 Bildern auf Slider togglen + Public-View klicken (DE + FR)
- [ ] **PMC-6** Real-iOS-Safari-Test (iPhone): Touch-Swipe + Snap-Verhalten verifizieren

## Notes

- Reference: `patterns/api.md` Partial-PUT (für Boolean: kein CASE-WHEN nötig, `Object.hasOwn` reicht da NOT NULL).
- Reference: `patterns/deployment-staging.md` Shared-DB DDL (additive ADD COLUMN ist Phase-1-safe, im Gegensatz zu DROP).
- Reference: `patterns/tailwind.md` `clamp()`-Tokens (analog zum bestehenden `var(--text-*)`-System).
- Reference: `patterns/react.md` matchMedia für `prefers-reduced-motion`.
- Reference: `lessons.md` 2026-04-22 PR #110 (Image-rendering-Patterns) — gilt für Satori, hier irrelevant (Browser-native), aber Mindset „explizite width/height + style-doppelt" gilt analog für Slider-Layout-Stability.

## Done

(noch nichts)
