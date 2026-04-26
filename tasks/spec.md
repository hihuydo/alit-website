# Spec: Agenda Image-Slider (Frontend Panel 1)
<!-- Created: 2026-04-26 -->
<!-- Author: Planner (Claude) -->
<!-- Status: Draft -->

## Summary

Admin kann pro Agenda-Eintrag wählen, dass mehrere Bilder im Public-Frontend (Panel 1) als horizontaler Slider statt als 2-Spalten-Grid gerendert werden. Slider nutzt CSS-only `scroll-snap` (kein JS-Lib), nimmt die volle Panel-1-Breite (Padding aufgehoben), hat eine fixe Höhe (fluid via `clamp()`), Bildbreite ergibt sich aus `Höhe × native Aspect-Ratio` → kein Layout-Jumping beim Wechseln. Default OFF für alle Bestands-Einträge → bit-identisches Verhalten für Live-Content.

## Context

- Aktuell rendert `src/components/AgendaItem.tsx:165-189` `images: AgendaImage[]` als 2-Spalten-Grid (`col-span-2` für Landscape, `col-span-1` für Portrait), eingebettet im normalen `var(--spacing-base)`-Side-Padding. Nur sichtbar wenn der Eintrag expanded ist.
- Bilder werden aus `agenda_items.images JSONB` gelesen (siehe `src/lib/schema.ts:82` und `src/lib/queries.ts:147`). Schema-Shape: `{ public_id, orientation, width?, height?, alt? }[]`.
- Dashboard-Editor in `src/app/dashboard/components/AgendaSection.tsx:67/156/241/363` liest/schreibt `images` als Form-Field via Multi-Upload + Reorder.
- Dashboard-API: `GET/PUT /api/dashboard/agenda/[id]` für Detail, `GET/POST /api/dashboard/agenda` für Liste.
- Stack: Next.js 16 App Router, Tailwind v4, JSDOM-Vitest. Shared DB Prod ↔ Staging — Staging-Push **ist** DDL-Deploy.

## Requirements

### Must Have (Sprint Contract)

1. **DB-Migration:** additive Spalte `agenda_items.images_as_slider BOOLEAN NOT NULL DEFAULT false` via `ALTER TABLE … ADD COLUMN IF NOT EXISTS …` in `ensureSchema()`. Idempotent, shared-DB-safe, alter Code ignoriert die neue Column.
2. **Dashboard-Toggle:** Checkbox „Bilder als Slider anzeigen (statt Grid)" im Agenda-Editor unterhalb der Bilder-Liste. Disabled (mit Hint-Text) wenn `< 2 Bilder` hochgeladen sind. Speichert via bestehender PUT/POST Roundtrip. **Auto-Reset:** Wenn die Bildanzahl (durch Löschen) unter 2 fällt UND `images_as_slider===true` im Form-State steht, wird der Form-State auf `false` zurückgesetzt (in `removeImage`-Handler) — verhindert DB-Inkonsistenz „Toggle ON ohne Wirkung". **Type-Surface-Updates** (sonst TS-Fail bei `pnpm build`): (a) Dashboard-`AgendaItem`-Interface in `AgendaSection.tsx` (Z. 32–45) bekommt `images_as_slider: boolean`; (b) `emptyForm`-Constant (Z. 62–73) bekommt `images_as_slider: false`; (c) Form-State-Type bekommt `images_as_slider: boolean`. Audit-Trail: kein neues Audit-Event in diesem Sprint (siehe Req #3 Note).
3. **API-Roundtrip:** GET-Liste (`agenda/route.ts`) returnt `images_as_slider` automatisch (`SELECT *`-Pattern existiert bereits — nur die DDL muss laufen, kein Code-Change in der Route nötig); POST (`agenda/route.ts`) nimmt's an (Default false bei Omission), INSERT-Statement um `images_as_slider`-Spalte erweitert; PUT (`agenda/[id]/route.ts`) akzeptiert es als optionalen Field-Patch (Standard partial-PUT — kein nullable, daher kein CASE-WHEN nötig). **Kein GET-Handler in `[id]/route.ts`** — die Route hat aktuell nur PUT + DELETE, Dashboard liest Detail via List-GET-Iteration; kein neuer GET-Handler in diesem Sprint (wäre Scope-Creep ohne Caller). **Type-Surface in beiden Routes:** Der `parseBody<{...}>`-Generic (POST in `agenda/route.ts`, PUT in `agenda/[id]/route.ts`) bekommt `images_as_slider?: boolean` ergänzt — sonst `body.images_as_slider`-Access TS-Fail. **Boolean-Validierung im PUT** (und symmetrisch im POST falls Field present): `if ('images_as_slider' in body && typeof body.images_as_slider !== 'boolean') return 400`. **Konsistenz-Regel:** Beide Routes verwenden `'images_as_slider' in body`-Check (NICHT `Object.hasOwn`) — konsistent mit existing per-field-validation Pattern. Eine Schreibweise pro Route, kein Mix. **Audit:** Kein neues Audit-Event in diesem Sprint. Begründung: Die existing `agenda/[id]/route.ts` hat aktuell **keinen** `auditLog()`-Call (verifiziert) — „erweitern" hat nichts zu erweitern; comprehensive `agenda_update` Audit-Coverage ist eine eigenständige Diskussion (Scope, Schema, Pre-SELECT für Diff) und kein Slider-Concern. Als Follow-up in `memory/todo.md` loggen.
4. **Public Query:** `getAgendaItems(locale)` in `src/lib/queries.ts:76` SELECTet `images_as_slider`, mapped in den `AgendaItemData`-Output als **`imagesAsSlider?: boolean` (optional)**. Begründung: `src/content/agenda.ts` exportiert ~20 hardcoded Fixture-Objekte ohne das Field — required-Type würde alle brechen. Mapping-Code: `imagesAsSlider: r.images_as_slider === true`. Renderer-Branching nutzt truthy-check (`imagesAsSlider === true`) der `undefined` korrekt als false behandelt.
5. **Frontend-Slider-Component:** Neuer File `src/components/AgendaImageSlider.tsx` (Client Component). CSS scroll-snap horizontal, `scroll-snap-type: x mandatory`, jedes Bild `scroll-snap-align: center` + **`scroll-snap-stop: always`** (verhindert dass schnelle Touch-Swipes mehrere Slides überspringen). **Full-Panel-Width via `width: 100%` ohne side-padding-Wrapper** — `AgendaItem.tsx` hat selbst kein side-padding (Padding wird per-child gesetzt), also reicht es, den Slider OHNE den `padding: 0 var(--spacing-base) var(--spacing-base)`-Wrapper zu rendern, dann nimmt er automatisch die volle AgendaItem-Breite = volle Panel-Breite. **Negative-Margin / `100vw + translateX(-50%)` werden NICHT verwendet** — der Parent `<div className="overflow-hidden">` (Accordion-Animation-Wrapper, Z. 164) clippt visuell alles außerhalb seiner content-box, und `100vw` würde über die Panel-Grenze ins Nachbarpanel hinausragen. Fixe Slider-Höhe via inline-style `height: clamp(240px, 30vw, 420px)` (Werte in Phase 3 am Layout feinjustiert). **Slide-Wrapper:** `display: flex; align-items: center; justify-content: center; flex-shrink: 0; height: 100%`. `flex-shrink: 0` ist **zwingend** — Default `flex-shrink: 1` würde alle Slides zu gleichmäßig 1/N-Container-Breite stauchen und die Aspect-Ratio-Sizing zerstören. Bilder im Slider mit `height: 100%; width: auto; object-fit: contain` → Breite = Höhe × native Aspect-Ratio, horizontal zentriert per Slide-Wrapper. **Jedes `<img>` braucht `alt={img.alt ?? ""}`** — konsistent mit existing grid renderer in `AgendaItem.tsx:183`. **Cross-Browser-Scrollbar-Hiding** auf dem Scroll-Container: Tailwind-Arbitrary-Values `[scrollbar-width:none] [&::-webkit-scrollbar]:hidden` (konsistent mit `tailwind.md`-Pattern und RichTextEditor-Toolbar aus PR #78). **SSR-Safety:** Alle browser-only APIs (`IntersectionObserver`, `Element.scrollIntoView`, `window.matchMedia`) MÜSSEN in `useEffect(() => {...}, [...])`-Bodies leben — nie im Component-Render-Body, nie auf Module-Level. Next.js App Router rendert auch `"use client"` Components SSR-seitig im ersten HTML-Pass, sonst `ReferenceError` zur Request-Time.
6. **Dots-Indikator:** N Buttons unterhalb des Sliders, 1 Dot pro Bild. **Container-Ref + IO-root:** `const containerRef = useRef<HTMLDivElement>(null)` wird auf den Scroll-Container gesetzt. IO im `useEffect`: `new IntersectionObserver(callback, { root: containerRef.current, threshold: 0.5 })` — **`root` MUSS der Scroll-Container sein**, nicht null/viewport (sonst falsche Active-Detection wenn Panel teilweise scrolled). **Stabile Slide-Refs via `slidesRef = useRef<HTMLDivElement[]>([])`** (kein State-Array, vermeidet `useCallback`-deps-Drift / stale-closure-Trap aus `lessons.md` 2026-04-22 PR #110). **Active-State:** `const [activeSlide, setActiveSlide] = useState(0)` — initial 0 ist safe vs Hydration-Mismatch, weil `useReducedMotion` (Req #9) als `useSyncExternalStore` SSR=client=0 garantiert; IO feuert erst nach Mount und kann `activeSlide` ohne Render-Reconciliation-Fehler aktualisieren. Klick-Handler: `(i: number) => slidesRef.current[i]?.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', inline: 'center', block: 'nearest' })` — `prefersReducedMotion` kommt aus dem in Req #9 spezifizierten Hook. Buttons mit `aria-label="Bild N anzeigen"` + `aria-current="true"` auf aktivem Dot. **Touch-Target ≥28×28 konkret:** Dot-Visual `w-2 h-2` (8px), Button-Padding `p-3` (12px), ergibt 32×32 Touch-Target ≥ WCAG-2.5.5-Minimum. Klassen: `<button className="p-3 inline-flex items-center justify-center"><span className="block w-2 h-2 rounded-full bg-current opacity-50 aria-current:opacity-100">...</span></button>`.
7. **Renderer-Branching:** `AgendaItem.tsx:165-189` conditional:
   - `images.length >= 2 && imagesAsSlider === true` → render `<AgendaImageSlider images={images} />` (statt Grid-Block, OHNE Side-Padding-Wrapper)
   - sonst (incl. 1-Bild-Fall, Toggle OFF, oder leere Liste) → bisheriges Grid-Verhalten unverändert
8. **Edge: Single-Image-Fallback:** Bei genau 1 Bild ist der Slider sinnlos — Renderer fällt unabhängig vom Toggle auf den bisherigen Single-Image-Grid-Pfad zurück. Toggle-UI im Dashboard ist in diesem Fall disabled mit Hint „Slider braucht mindestens 2 Bilder".
9. **Reduced-Motion:** Single Implementation via neuem `useReducedMotion()` Hook in `src/lib/use-reduced-motion.ts`. **Pflicht-Pattern: `useSyncExternalStore`** (siehe `patterns/react.md` — `window.matchMedia`-Reads sind explizit als `useSyncExternalStore`-Case gelistet, NICHT `useState + useEffect`). Implementation:
    ```ts
    export function useReducedMotion(): boolean {
      return useSyncExternalStore(
        (cb) => {
          const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
          mql.addEventListener("change", cb);
          return () => mql.removeEventListener("change", cb);
        },
        () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,  // client snapshot
        () => false                                                            // server snapshot
      );
    }
    ```
    Vorteil: Kein Hydration-Mismatch (Server snapshot deterministisch false, Client tausch nach Mount), keine race-condition. **Kein CSS-only-Fallback** — die JS-side `scrollIntoView({behavior:'smooth'})` auf Dot-Klick wird durch CSS `@media`-Query NICHT abgedeckt (WCAG 2.3.3 violation), daher muss der Hook autoritativ sein. Zusätzlich Tailwind-v4-Klasse `motion-reduce:[scroll-behavior:auto]` (arbitrary variant) ODER built-in `motion-reduce:scroll-auto` auf dem Scroll-Container als defense-in-depth für native Touch-Swipe — kein `<style>`-Tag, kein globales CSS.
10. **Tests:**
    - Component-Test `AgendaImageSlider.test.tsx` (JSDOM, `// @vitest-environment jsdom`): rendert N Bilder, N Dots, Klick auf Dot 2 → entsprechender `scrollIntoView` aufgerufen (mock). **Test-Setup-Block** (top-of-file, vor describe):
      ```ts
      vi.stubGlobal("IntersectionObserver", vi.fn().mockImplementation(() => ({
        observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn(),
      })));
      Element.prototype.scrollIntoView = vi.fn();
      ```
      Plus `useReducedMotion`-Hook mocken (z.B. `vi.mock("@/lib/use-reduced-motion", () => ({ useReducedMotion: () => false }))`) für deterministische Behavior-Tests.
    - Branching-Test `src/components/AgendaItem.test.tsx` **neu erstellen** (existiert nicht): (a) `imagesAsSlider=true, 3 Bilder` → `<AgendaImageSlider>` gerendert (Mock auf den Slider-Component, assert Mock-Call), kein Grid; (b) `imagesAsSlider=true, 1 Bild` → Grid (kein Slider-Mock-Call); (c) `imagesAsSlider=false, 3 Bilder` → Grid. **Render mit `defaultExpanded={true}`** — sonst ist der Accordion-Body collapsed (`grid-rows-[0fr]` + `inert`) und alle Slider/Grid-Assertions sind vacuous oder werfen „not found". **Test-Setup**: `vi.mock("next/navigation", () => ({ useParams: () => ({ locale: "de" }) }))` UND `vi.mock("@/components/AgendaImageSlider", () => ({ default: vi.fn(() => <div data-testid="slider-mock" />) }))` — letzteres isoliert AgendaItem-Branching-Logic vom Slider-Internal.
    - Dashboard-Test `AgendaSection.test.tsx` erweitert: (1) Toggle-Checkbox vorhanden, disabled bei <2 Bildern, enabled ab 2; (2) Speichern triggert PUT mit `images_as_slider: true/false`; (3) Auto-Reset-Test: `images_as_slider=true` + Bilder von 3 auf 1 reduziert → Form-State auf `false` zurückgesetzt. **`makeItem()`-Helper-Update**: existing Helper muss `images_as_slider: false` als Default-Field returnen, sonst brechen TypeScript-Builds wenn das Field zum Type hinzugefügt wird.
    - List-API-Test `agenda/route.test.ts` (NICHT `[id]/route.test.ts` — die Detail-Route hat keinen GET-Handler): (1) GET-Liste returnt `images_as_slider` nach Migration (SELECT *-Pattern); (2) POST mit Default false bei Omission.
    - Detail-API-Test `agenda/[id]/route.test.ts` erweitert: (1) PUT updated Feld bei Boolean-Wert; (2) PUT mit `images_as_slider: "true"` (String statt Boolean) → 400 Boolean-Validation-Test; (3) PUT ohne Field im Body → bestehender Wert bleibt unangetastet (partial-PUT-Pattern).
11. **Verification:**
    - `pnpm build` keine TS-Errors
    - `pnpm test` grün (alle bestehenden + neue)
    - `pnpm audit --prod` 0 HIGH/CRITICAL
    - Dev-Server: Slider tatsächlich im Browser klicken, Touch-Swipe auf Mobile-Viewport (375px) testen, Reduced-Motion in DevTools toggeln und verifizieren

> **Wichtig:** Nur Must-Have-Items sind Teil des Sprint Contracts und werden im Codex-Review hart durchgesetzt.

### Nice to Have (explicit follow-up, NOT this sprint)

1. Pfeile (Prev/Next-Buttons) für Desktop-Maus-User. *Begründung Defer:* Touch+Trackpad-Scroll deckt 95% ab; Pfeile addieren UI-Komplexität ohne klaren UX-Gewinn bei N=2-5 Bildern.
2. Auto-Rotate. *Begründung Defer:* UX-Anti-Pattern (lenkt ab beim Lesen), explizit vom User abgelehnt.
3. Lightbox/Zoom (Klick auf Slide → fullscreen). *Begründung Defer:* Out-of-Scope, eigenständiges Feature.
4. Swipe-Hint-Animation („Wischen Sie für mehr") als Pulse beim ersten Sichtbarwerden. *Begründung Defer:* Slider-Affordance ist durch Dots klar; A11y-neutraler ohne extra Animation.

> **Regel:** Nice-to-Have wird im aktuellen Sprint NICHT gebaut. Beim Wrap-Up wandern diese Items nach `memory/todo.md`.

### Out of Scope

- Slider für Discours-Agités (`journal_entries`) — gleiche Datenstruktur, aber separater Renderer-Pfad. Falls gewünscht: eigener Sprint nach diesem.
- Slider für Projekte-Detail-Seiten.
- Reorder-Mechanik der Bilder im Slider (existierende Drag-Reihenfolge im Dashboard wird übernommen — Slide-Reihenfolge = `images[]`-Reihenfolge).
- Image-Preloading-Strategie über `loading="lazy"` hinaus. Aktuelles `loading="lazy"` bleibt — Browser entscheidet.

## Technical Approach

### Files to Change

| File | Change Type | Description |
|------|-------------|-------------|
| `src/lib/schema.ts` | Modify | `ALTER TABLE agenda_items ADD COLUMN IF NOT EXISTS images_as_slider BOOLEAN NOT NULL DEFAULT false;` als idempotente Migration |
| `src/lib/queries.ts` | Modify | SELECT erweitert um `images_as_slider`, Output-Mapping fügt `imagesAsSlider: r.images_as_slider === true` hinzu |
| `src/components/AgendaItem.tsx` | Modify | `AgendaItemData` Type um `imagesAsSlider?: boolean` (optional — siehe Req #4 Begründung), conditional Slider-Render bei `images.length >= 2 && imagesAsSlider === true` |
| `src/components/AgendaImageSlider.tsx` | Create | Client Component, CSS scroll-snap + IntersectionObserver-driven Dots |
| `src/lib/use-reduced-motion.ts` | Create | Shared SSR-safe Hook für `prefers-reduced-motion: reduce` Detection |
| `src/app/dashboard/components/AgendaSection.tsx` | Modify | (a) Dashboard-`AgendaItem`-Interface (Z. 32–45) bekommt `images_as_slider: boolean`; (b) `emptyForm` (Z. 62–73) bekommt `images_as_slider: false`; (c) Form-State + Checkbox-UI + disabled-bei-<2-Bildern + Auto-Reset im `removeImage`-Handler; (d) POST/PUT-Payload schickt Field |
| `src/app/api/dashboard/agenda/route.ts` | Modify | POST nimmt Field, default false bei Omission, INSERT setzt Spalte. **List-GET unverändert** — `SELECT *`-Pattern liefert das neue Feld automatisch nach Migration. |
| `src/app/api/dashboard/agenda/[id]/route.ts` | Modify | PUT akzeptiert optional `images_as_slider`, Boolean-Type-Validation 400, UPDATE setzt nur wenn übermittelt (`Object.hasOwn`-Pattern). **Kein neuer GET-Handler** — Route hat aktuell nur PUT + DELETE. **Kein Audit-Call** — existing Route hat keinen `auditLog()`, comprehensive Audit-Coverage als Follow-up. |
| `src/components/AgendaImageSlider.test.tsx` | Create | JSDOM Component-Test |
| `src/components/AgendaItem.test.tsx` | Create or modify | Branching-Test (3 Cases) |
| `src/app/dashboard/components/AgendaSection.test.tsx` | Modify | `makeItem()` + Toggle-Test + Auto-Reset-Test |
| `src/app/api/dashboard/agenda/route.test.ts` | Modify | List-GET enthält Feld + POST default-false |
| `src/app/api/dashboard/agenda/[id]/route.test.ts` | Modify | PUT-Field-Roundtrip + 400-bei-String + partial-PUT-Preserve |

### Architecture Decisions

- **CSS scroll-snap statt JS-Library:** Native, mobile-touch-natürlich, ~30 LOC, kein Bundle-Bloat, keine externe Dep. Trade-off: weniger Customization (z.B. kein parallax), aber für 2-N Bilder pro Eintrag overkill-frei.
- **IntersectionObserver für Active-Dot statt scroll-event:** Robust gegen schnelle scroll-events (kein Throttle nötig), funktioniert auch bei programmatischem `scrollIntoView`. Trade-off: 1-Frame-Verzögerung gegenüber synchronem scroll-event — vernachlässigbar.
- **Toggle als Boolean (NOT NULL DEFAULT false), nicht Enum:** Aktuell binär (Slider vs Grid). Falls später ein dritter Modus dazukommt (z.B. „masonry"): Migration auf Enum dann. YAGNI.
- **Renderer-Branching im AgendaItem.tsx, nicht via Slider-Component-with-empty-fallback:** Klarere Read-Path im AgendaItem-Code, Slider-Component ist pure und nimmt nur den happy-path-Input. Bessere Test-Isolation.
- **Standard partial-PUT (kein CASE-WHEN):** `images_as_slider` ist `NOT NULL`, kein nullable-Field — der `COALESCE`-Trap aus `patterns/api.md` betrifft nullable Fields. Wir treffen die Entscheidung „field included in body" via **`'images_as_slider' in body`** und builden die UPDATE-SET-Clause dynamisch (consistent mit existing pattern in agenda/[id]/route.ts). Plus expliziter Boolean-Type-Check vor dem UPDATE (siehe Req #3). **Eine Schreibweise pro Route** — kein Mix aus `'in'` und `Object.hasOwn`.
- **Stabile Slide-Refs via `useRef<HTMLDivElement[]>`:** Vermeidet das `useCallback`-Stale-Closure-Pattern aus `lessons.md` 2026-04-22 (PR #110). Slides-Array wird im Render-Body via `ref={(el) => { if (el) slidesRef.current[i] = el }}`-Callback gesetzt. Dot-Click-Handler liest `slidesRef.current[i]` zur Call-Time → kein dep-array nötig, kein stale-closure möglich.
- **`useReducedMotion()` als shared Hook in `src/lib/use-reduced-motion.ts`:** Nicht ad-hoc inline in der Slider-Component, weil das Pattern auch außerhalb wiederverwendbar ist (zukünftige animated Components). SSR-safe `typeof window === 'undefined' → false`. Single source of truth für reduced-motion-Detection im Projekt.
- **IntersectionObserver-Setup zwingend in `useEffect`:** Nicht im Render-Body, nicht auf Module-Level — Browser-only API, SSR-Crash sonst. Setup im `useEffect(() => {...}, [])` (mount-once), Cleanup via `observer.disconnect()` im return.
- **Phase-1+2+3 in EINEM PR mit drei Commits**, nicht 3 separate PRs. Begründung: Feature ist atomic — Phase 1 (DDL) alleine bringt nichts (kein UI), Phase 2 (Toggle) alleine bringt nichts (kein Renderer). Schema-Migration ist additive (alter Code unbeeinflusst, neuer Code mit DEFAULT-fallback safe). Co-Deploy reduziert Codex-Roundbudget-Verbrauch und Merge-Overhead. Falls Codex pro-Phase splitten will: Generator entscheidet anhand der Diff-Größe.

### Dependencies

- Keine neuen npm-Packages.
- Keine neuen Env-Vars.
- DB-Migration läuft idempotent in `ensureSchema()` bei jedem Container-Boot — kein separater Migration-Step.
- Shared-DB-Pattern: Staging-Push triggert ALTER auf prod-shared-DB. Da DEFAULT false und alter Prod-Code die Spalte ignoriert (kein SELECT *), ist das safe (siehe `patterns/deployment-staging.md` und `lessons.md` 2026-04-22 PR #106→#108-Pattern für additive Migrations — DROP braucht 3 Phasen, ADD nicht).

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| 0 Bilder, Toggle ON | Bilder-Block wird nicht gerendert (wie heute). Toggle-Wert in DB bleibt unbeachtet (no-op). |
| 1 Bild, Toggle ON | Single-Image im bisherigen Grid (1 Bild = `col-span-1` portrait oder `col-span-2` landscape). Kein Slider. |
| 1 Bild, Toggle OFF | Identisch wie heute — Single-Image im Grid. |
| 2+ Bilder, Toggle ON | Slider gerendert. |
| 2+ Bilder, Toggle OFF | Bisheriges 2-Spalten-Grid. |
| Bestehende DB-Row vor Migration | DEFAULT false → kein Slider. Bit-identisches Verhalten zu heute. |
| Slider mit Bildern verschiedener Aspect-Ratios | Fixe Slider-Höhe, jedes Bild width = height × aspect, horizontal zentriert (Portrait wirkt schmal mit Leerraum links+rechts, Landscape füllt eher). Kein Layout-Jumping beim Snap. |
| `prefers-reduced-motion: reduce` | scroll-behavior: auto (kein smooth scrolling). Touch-Swipe bleibt nativ. |
| Keyboard-User | Dots als `<button>`, native Tab-Reihenfolge, Enter/Space triggert scrollIntoView. |
| Bild-404 (public_id existiert nicht mehr) | Browser-default broken-image — kein Render-Crash. Out-of-Scope für besseren Fallback. |
| SSR-First-Render | Slider rendert SSR ohne `currentSlide`-State (alle Dots inactive bis client-hydration). Acceptable — invisible bis Eintrag expanded ist, und IntersectionObserver feuert sofort nach Mount. |

## Risks

- **Risk: Inline-style mit CSS-Variablen (`calc(-1 * var(--spacing-base))`) negative Margins brechen das Container-Layout** auf bestimmten Viewport-Breaks. *Mitigation:* In Phase 3 manuell auf Mobile (375px) + Tablet (768px) + Desktop (1280px) verifizieren bevor PR auf.
- **Risk: scroll-snap auf Safari iOS hat historisch bugs** mit `scroll-snap-type: x mandatory` + `width: auto` Childs (Snap fängt schmale Kinder nicht zentriert ein). *Mitigation:* Test auf echtem iOS-Gerät (Huy's iPhone 13/Safari). Fallback: `scroll-snap-type: x proximity` ist toleranter, falls mandatory bockt.
- **Risk: Audit-Event-Payload-Inflation** — wenn jeder kleinste UI-Toggle ins Audit geht, wird das log-noisy. *Mitigation:* Nur auditen wenn der Field-Wert *geändert* wurde (diff alt vs neu). Konsistent mit bestehender Pattern in `agenda_update`.
- **Risk: Generator könnte vergessen, dass `AgendaItemData` aus `src/content/agenda.ts` (Seed-Fixture) auch typcheckt.** *Mitigation:* `imagesAsSlider?: boolean` als optional-Field am Type — Seed-Fixture braucht keinen Update.
- **Risk: Sprint-Bloat durch „während wir dabei sind"-Drift** (z.B. Lightbox, Auto-Rotate). *Mitigation:* Out-of-Scope-Block oben halten Generator on-track; Codex-Review filtert Off-Scope-Findings via `memory/todo.md`.
