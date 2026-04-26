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
- [ ] **DK-16** API: List-GET (`agenda/route.ts`) liefert `images_as_slider` automatisch via `SELECT *` (kein Code-Change in der Route nötig); POST default false bei Omission, INSERT erweitert; PUT (`agenda/[id]/route.ts`) updated nur wenn Field im Body (`Object.hasOwn`-Pattern, NICHT COALESCE auf Boolean); Boolean-Type-Validation `if ('images_as_slider' in body && typeof body.images_as_slider !== 'boolean') return 400`. **Kein neuer GET-Handler in `[id]/route.ts`** — Route hat nur PUT + DELETE.
- [ ] **DK-17** Kein neues Audit-Event in diesem Sprint. Comprehensive `agenda_update`-Audit-Coverage als Follow-up nach `memory/todo.md` loggen (Begründung: existing `agenda/[id]/route.ts` hat aktuell keinen `auditLog()`-Call — eigenständige Sprint-Diskussion)
- [ ] **DK-18** `AgendaItemData` Type um optionales `imagesAsSlider?: boolean` erweitert — bestehende Seed-Fixture (`src/content/agenda.ts`) typchecked ohne Update
- [ ] **DK-19** Branching-Test in `AgendaItem.test.tsx` (neu erstellt) deckt 3 Cases (Slider-aktiv, 1-Bild-Fallback, Toggle-OFF). Render mit `defaultExpanded={true}` (sonst Accordion collapsed → vacuous assertions). Mocks: `vi.mock("next/navigation", () => ({ useParams: () => ({ locale: "de" }) }))` + `vi.mock("@/components/AgendaImageSlider", ...)` für Branching-Isolation
- [ ] **DK-23** Slider-Test `AgendaImageSlider.test.tsx`: JSDOM-Mocks am Top-of-File (`vi.stubGlobal("IntersectionObserver", ...)` + `Element.prototype.scrollIntoView = vi.fn()`) sowie `useReducedMotion`-Mock — sonst wirft Mount-Time
- [ ] **DK-24** `src/lib/use-reduced-motion.ts` neu: SSR-safe Hook, `typeof window === 'undefined' → false`, matchMedia + addEventListener-cleanup
- [ ] **DK-25** Slider-Component: alle browser-only APIs (IntersectionObserver, scrollIntoView, matchMedia) in `useEffect` (nicht Render-Body, nicht Module-Level) — verhindert SSR-Crash
- [ ] **DK-26** Slider-Bilder bekommen `alt={img.alt ?? ""}` — konsistent mit `AgendaItem.tsx:183` Grid-Renderer (WCAG 1.1.1)
- [ ] **DK-27** Stable Slide-Refs via `useRef<HTMLDivElement[]>([])` mit `ref={el => { if (el) slidesRef.current[i] = el }}`-Callback — vermeidet `useCallback`-deps-Trap aus `lessons.md` 2026-04-22 PR #110
- [ ] **DK-28** `makeItem()`-Helper in existing `AgendaSection.test.tsx` um `images_as_slider: false` erweitert — sonst TypeScript-Build-Fail bei Type-Erweiterung
- [ ] **DK-29** Dashboard-`AgendaItem`-Interface in `AgendaSection.tsx` (Z. 32–45) bekommt `images_as_slider: boolean`; `emptyForm`-Constant (Z. 62–73) bekommt `images_as_slider: false` — sonst TS-Fail bei Form-State-Assignment + leere Form-State-Shape im `openCreate()`-Flow
- [ ] **DK-30** Slider-Container nimmt volle Panel-Breite via `width: 100%` ohne side-padding-Wrapper (`AgendaItem.tsx` hat selbst kein side-padding — Padding wird per-child gesetzt). Negative-Margin / 100vw-Bleed werden NICHT verwendet (overflow-hidden parent würde clippen, 100vw würde ins Nachbarpanel ragen)
- [ ] **DK-31** Scroll-Container hat Cross-Browser-Scrollbar-Hiding `[scrollbar-width:none] [&::-webkit-scrollbar]:hidden` (konsistent mit `tailwind.md` + RichTextEditor-Toolbar PR #78)
- [ ] **DK-32** Reduced-Motion CSS-Defense via Tailwind `motion-reduce:[scroll-behavior:auto]` (oder built-in `motion-reduce:scroll-auto`) auf Scroll-Container — kein `<style>`-Tag, kein globales CSS
- [ ] **DK-33** `containerRef = useRef<HTMLDivElement>(null)` auf Scroll-Container; IntersectionObserver mit `{ root: containerRef.current, threshold: 0.5 }` — sonst falsche Active-Detection wenn Panel teilweise scrolled
- [ ] **DK-34** `parseBody<{...}>`-Generic in BEIDEN API-Routes (POST `agenda/route.ts`, PUT `agenda/[id]/route.ts`) bekommt `images_as_slider?: boolean` ergänzt — sonst `body.images_as_slider`-Access TS-Fail
- [ ] **DK-35** `AgendaItemData.imagesAsSlider` ist **optional** (`?: boolean`), Mapping `imagesAsSlider: r.images_as_slider === true`, Renderer-Check `imagesAsSlider === true`. Seed-Fixture (`src/content/agenda.ts`) bleibt unangetastet
- [ ] **DK-36** Slide-Wrapper bekommt `flex-shrink: 0` (zwingend) — sonst stauchen alle Slides zu 1/N-Container-Breite, Aspect-Ratio-Sizing kaputt
- [ ] **DK-37** Slides bekommen `scroll-snap-stop: always` — verhindert dass schnelle Touch-Swipes mehrere Slides auf einmal überspringen
- [ ] **DK-38** `useReducedMotion()` ist via `useSyncExternalStore` implementiert (NICHT `useState + useEffect`) — siehe `patterns/react.md`-Regel für `window.matchMedia`-Reads. Server-Snapshot deterministisch false, Client-Snapshot live. Kein Hydration-Mismatch
- [ ] **DK-39** Dot-Touch-Target konkret: Dot-Visual `w-2 h-2` (8px), Button-Padding `p-3` (12px) → 32×32 Touch-Target ≥ WCAG 2.5.5
- [ ] **DK-40** API-Field-Detection: `const { images_as_slider } = body; if (images_as_slider !== undefined)` — exakt das destructuring + `!== undefined`-Pattern der existing Route (NICHT `'in'`, NICHT `Object.hasOwn`); Boolean-Validierung `if (images_as_slider !== undefined && typeof images_as_slider !== 'boolean') return 400`
- [ ] **DK-41** Slider-`<img>` braucht HTML-Attribute `width={img.width ?? (img.orientation === "portrait" ? 3 : 4)}` + `height={img.height ?? (img.orientation === "portrait" ? 4 : 3)}` (CLS-Fallback für Legacy-Rows mit `null`-Dimensions, identisch zu `AgendaItem.tsx:174-184`); plus `loading="lazy"`
- [ ] **DK-42** Active-Dot-Visual via Conditional className `${activeSlide === i ? "opacity-100" : "opacity-50"}` (NICHT Tailwind `aria-current:` Variant — die ist self-referential und matcht nur das Element das `aria-current` selbst trägt; `<button>` trägt das, aber Dot-Span ist Child → Variant feuert nie)
- [ ] **DK-43** Dots-Container: semantischer Wrapper `<nav aria-label="Bilder-Navigation">` (oder `<div role="group" aria-label="...">`) — WCAG 1.3.6 Grouping
- [ ] **DK-44** `useEffect`-Body beginnt mit `if (!containerRef.current) return;` — defensive für JSDOM-Tests ohne mounted Container (sonst implicit `root: null` = viewport-default = falsche Test-Behavior)
- [ ] **DK-45** Edit-Open Form-Init in `AgendaSection.tsx`: Beim Öffnen existing Item für Edit (`openEdit(item)` o.ä.) wird `form.images_as_slider = item.images_as_slider ?? false` gesetzt — sonst silent data-loss bei jedem Save. Test: render existing Item mit `images_as_slider=true`, Edit-Modal öffnen, Save klicken → PUT-Payload enthält `images_as_slider: true` (nicht false)
- [ ] **DK-46** IO-Callback-Body explizit in `AgendaImageSlider.tsx`: für jeden `entry.isIntersecting === true` → `slidesRef.current.indexOf(entry.target)` → `setActiveSlide(idx)`. Plus `observer.observe(slide)`-Loop nach IO-Construction, sonst feuert IO nie und Dots bleiben auf Slide 0 stuck
- [ ] **DK-47** `useReducedMotion`-`subscribe`/`getSnapshot`/`getServerSnapshot` Module-level definiert (NICHT inline im Hook-Body) — sonst neue Function-Reference pro Render → useSyncExternalStore tear-down + re-subscribe der matchMedia-Listener pro Render (Performance-Regression)
- [ ] **DK-48** Scroll-Container-Klassen vollständig: `flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden` + scroll-snap. **`overflow-x-auto` ist zwingend** — sonst kein Overflow-Context, scroll-snap-type ist no-op, Slider scrollt gar nicht
- [ ] **DK-49** Slide-Wrapper hat stabilen `key={img.public_id}` (Fallback `key={i}`) — sonst react/jsx-key ESLint-Error → `pnpm build` fail
- [ ] **DK-50** `AgendaImageSlider` ist **named export** (`export function AgendaImageSlider(...)`) konsistent mit `AgendaItem`/`JournalSidebar`-Pattern in `src/components/`. Test-Mock matcht named-export-Key: `vi.mock(..., () => ({ AgendaImageSlider: vi.fn(...) }))` — sonst greift Mock nicht, echter Slider wird gerendert statt Mock, Branching-Tests fail
- [ ] **DK-51** `previewItem` useMemo in `AgendaSection.tsx` (Z. 219) mappt `imagesAsSlider: form.images_as_slider` ins return-Object — sonst zeigt Dashboard-Live-Preview immer Grid, silent UX-regression (TS fängt Omission nicht weil Field optional)
- [ ] **DK-52** IO-`useEffect` Dep ist `[images]` (NICHT `[images.length]`) — Reorder mit gleicher Länge erzeugt neue DOM-Elemente via key-Änderung, length-only-Dep verpasst das → IO observed detached old elements, Dot-Indicator freezes

## Known Codex-R1 Targets (deferred)

> Diese Findings sind aus Sonnet-R5 bekannt aber nicht im Sprint-Contract — werden bewusst Codex-R1 überlassen weil low-risk + test-granular.

- **scrollIntoView-Mock-Granularität:** Prototype-level Mock kann nicht differenzieren welcher Slide aufgerufen wurde. Codex wird vorschlagen Per-Element-Spy via `vi.spyOn(slidesRef.current[N], 'scrollIntoView')` oder Wrapper-Function. Generator kann Best-Effort-Test schreiben; Codex-Refinement in R1 OK.
- **`display: flex` auf Scroll-Container nur impliziert via flex-shrink-Mechanik** — DK-48 sagt explizit `flex`, sollte also greifen. Falls Generator das `flex` versehentlich weglässt, ist das ein P3-Code-Quality-Finding für Codex.
- **`slidesRef.current` Stale-Entries:** Wenn slide-count von 5 auf 3 sinkt, bleiben Indices 3+4 in `slidesRef.current` als stale. `useEffect`-Dep `[images]` resettet IO, aber slidesRef wird nicht gecleart. Low-impact (Length-bound iteration via `images.map`), Codex-R1 könnte's vorschlagen — Generator kann `if (el) slidesRef.current[i] = el; else slidesRef.current[i] = null;` schreiben oder bei Re-Render `slidesRef.current.length = images.length` trimmen.
- **`scrollIntoView`-Test-Args-Granularität:** Generator schreibt initial `expect(scrollIntoViewMock).toHaveBeenCalled()`. Codex könnte Per-Argument-Assertions vorschlagen (`expect.objectContaining({ behavior: "smooth", inline: "center" })`) plus separater reduced-motion-Test mit `behavior: "auto"`. Test-quality-Refinement, nicht funktional.

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
- [ ] `AgendaSection.tsx`: (a) `AgendaItem`-Interface (Z. 32–45) um `images_as_slider: boolean`; (b) `emptyForm` (Z. 62–73) um `images_as_slider: false`; (c) Form-State + Checkbox-UI + disabled-bei-<2-Bildern + Auto-Reset im `removeImage`-Handler
- [ ] `makeItem()` in `AgendaSection.test.tsx` um `images_as_slider: false` erweitern (sonst TS-Fail)
- [ ] `agenda/route.ts` (POST) INSERT um `images_as_slider`-Spalte erweitern, Default false bei Omission. **List-GET unverändert** (SELECT * liefert Feld automatisch).
- [ ] `agenda/[id]/route.ts` (PUT) `Object.hasOwn`-Patch + Boolean-Type-Validation 400. **Kein neuer GET-Handler.** **Kein Audit-Call.**
- [ ] Tests: `AgendaSection.test.tsx` Toggle + Auto-Reset, `agenda/route.test.ts` List-GET-enthält-Feld + POST-default-false, `agenda/[id]/route.test.ts` PUT-Roundtrip + 400-bei-String + partial-PUT-Preserve
- [ ] Commit: `feat(dashboard): add agenda image-slider toggle`

### Phase 3 — Frontend-Slider-Component + Renderer-Integration
- [ ] `src/lib/use-reduced-motion.ts` neu (SSR-safe matchMedia-Hook)
- [ ] `AgendaImageSlider.tsx` neue Component:
  - `width: 100%` ohne side-padding-Wrapper, `height: clamp(240px, 30vw, 420px)`
  - CSS scroll-snap, scroll-container mit `[scrollbar-width:none] [&::-webkit-scrollbar]:hidden` + `motion-reduce:scroll-auto`
  - alle browser-only APIs in `useEffect`, stable `useRef<HTMLDivElement[]>` für Slides
  - `useReducedMotion`-Hook für Dot-Click-Behavior
  - `alt={img.alt ?? ""}` auf jedem `<img>`
- [ ] `AgendaItem.tsx` Branching `images.length >= 2 && imagesAsSlider` — Slider OHNE padding-wrapper rendern, Grid-Pfad mit padding-wrapper bit-identisch
- [ ] Tests: `AgendaImageSlider.test.tsx` mit JSDOM-Mocks (`IntersectionObserver`, `scrollIntoView`, `useReducedMotion`) + `AgendaItem.test.tsx` neu erstellen mit `useParams`-Mock + Slider-Component-Mock + `defaultExpanded={true}` pro Render
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
