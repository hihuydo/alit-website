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
2. **Dashboard-Toggle:** Checkbox „Bilder als Slider anzeigen (statt Grid)" im Agenda-Editor unterhalb der Bilder-Liste. Disabled (mit Hint-Text) wenn `< 2 Bilder` hochgeladen sind. Speichert via bestehender PUT/POST Roundtrip.
3. **API-Roundtrip:** GET-Detail + GET-Liste returnen `images_as_slider`; POST nimmt's an (Default false bei Omission); PUT akzeptiert es als optionalen Field-Patch (Standard partial-PUT — kein nullable, daher kein CASE-WHEN nötig). Audit-Event `agenda_update` Payload um `images_as_slider` erweitert wenn geändert.
4. **Public Query:** `getAgendaItems(locale)` in `src/lib/queries.ts:76` SELECTet `images_as_slider`, mapped in den `AgendaItemData`-Output als `imagesAsSlider: boolean`.
5. **Frontend-Slider-Component:** Neuer File `src/components/AgendaImageSlider.tsx` (Client Component). CSS scroll-snap horizontal, `scroll-snap-type: x mandatory`, jedes Bild `scroll-snap-align: center`. Container nimmt volle Panel-Breite (negative side-margin = `calc(-1 * var(--spacing-base))`). Fixe Slider-Höhe via inline-style `height: clamp(240px, 30vw, 420px)` (Werte in Phase 3 am Layout feinjustiert). Bilder im Slider mit `height: 100%; width: auto; object-fit: contain` → Breite = Höhe × native Aspect-Ratio, horizontal zentriert via `flex items-center` pro Slide.
6. **Dots-Indikator:** N Buttons unterhalb des Sliders, 1 Dot pro Bild. Aktiver Dot via `IntersectionObserver` (root = scroll-container, threshold = 0.5) erkannt. Klick auf Dot → `slides[i].scrollIntoView({ behavior: getReducedMotion() ? 'auto' : 'smooth', inline: 'center', block: 'nearest' })`. Buttons mit `aria-label="Bild N anzeigen"` + `aria-current="true"` auf aktivem Dot. Mindestens 28×28 Touch-Target (verschmolzen via padding um optisch kleinen Dot).
7. **Renderer-Branching:** `AgendaItem.tsx:165-189` conditional:
   - `images.length >= 2 && imagesAsSlider === true` → render `<AgendaImageSlider images={images} />` (statt Grid-Block, OHNE Side-Padding-Wrapper)
   - sonst (incl. 1-Bild-Fall, Toggle OFF, oder leere Liste) → bisheriges Grid-Verhalten unverändert
8. **Edge: Single-Image-Fallback:** Bei genau 1 Bild ist der Slider sinnlos — Renderer fällt unabhängig vom Toggle auf den bisherigen Single-Image-Grid-Pfad zurück. Toggle-UI im Dashboard ist in diesem Fall disabled mit Hint „Slider braucht mindestens 2 Bilder".
9. **Reduced-Motion:** `scroll-behavior: smooth` nur wenn `prefers-reduced-motion: no-preference`. Implementation via Matchmedia-Check (siehe `patterns/react.md` matchMedia-Pattern) oder CSS-only via `@media (prefers-reduced-motion: reduce) { ... { scroll-behavior: auto } }`.
10. **Tests:**
    - Component-Test `AgendaImageSlider.test.tsx` (JSDOM): rendert N Bilder, N Dots, Klick auf Dot 2 → entsprechender `scrollIntoView` aufgerufen (mock).
    - Branching-Test in `AgendaItem.test.tsx` (neu oder erweitert): (a) `imagesAsSlider=true, 3 Bilder` → Slider gerendert (kein Grid); (b) `imagesAsSlider=true, 1 Bild` → Grid (kein Slider); (c) `imagesAsSlider=false, 3 Bilder` → Grid.
    - Dashboard-Test `AgendaSection.test.tsx` erweitert: Toggle-Checkbox vorhanden, disabled bei <2 Bildern, enabled ab 2, Speichern triggert PUT mit `images_as_slider: true/false`.
    - API-Route-Test `agenda/[id]/route.test.ts` erweitert: GET returnt Feld, PUT updated Feld, POST mit Default false.
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
| `src/components/AgendaItem.tsx` | Modify | `AgendaItemData` Type um `imagesAsSlider?: boolean`, conditional Slider-Render bei `>=2 Bilder && imagesAsSlider` |
| `src/components/AgendaImageSlider.tsx` | Create | Client Component, CSS scroll-snap + IntersectionObserver-driven Dots |
| `src/app/dashboard/components/AgendaSection.tsx` | Modify | Form-State um `images_as_slider: boolean`, Checkbox unter Bilder-Liste, disabled bei <2 Bildern, in POST/PUT-Payload |
| `src/app/api/dashboard/agenda/route.ts` | Modify | GET-Liste SELECTet + returnt Feld; POST nimmt Field, default false bei Omission, INSERT setzt Spalte |
| `src/app/api/dashboard/agenda/[id]/route.ts` | Modify | GET-Detail returnt Feld; PUT akzeptiert optional `images_as_slider`, UPDATE setzt nur wenn übermittelt; Audit-Payload `images_as_slider` mit-auditen wenn geändert |
| `src/components/AgendaImageSlider.test.tsx` | Create | JSDOM Component-Test |
| `src/components/AgendaItem.test.tsx` | Create or modify | Branching-Test (3 Cases) |
| `src/app/dashboard/components/AgendaSection.test.tsx` | Modify | Toggle-Test |
| `src/app/api/dashboard/agenda/[id]/route.test.ts` | Modify | Field-Roundtrip-Test |

### Architecture Decisions

- **CSS scroll-snap statt JS-Library:** Native, mobile-touch-natürlich, ~30 LOC, kein Bundle-Bloat, keine externe Dep. Trade-off: weniger Customization (z.B. kein parallax), aber für 2-N Bilder pro Eintrag overkill-frei.
- **IntersectionObserver für Active-Dot statt scroll-event:** Robust gegen schnelle scroll-events (kein Throttle nötig), funktioniert auch bei programmatischem `scrollIntoView`. Trade-off: 1-Frame-Verzögerung gegenüber synchronem scroll-event — vernachlässigbar.
- **Toggle als Boolean (NOT NULL DEFAULT false), nicht Enum:** Aktuell binär (Slider vs Grid). Falls später ein dritter Modus dazukommt (z.B. „masonry"): Migration auf Enum dann. YAGNI.
- **Renderer-Branching im AgendaItem.tsx, nicht via Slider-Component-with-empty-fallback:** Klarere Read-Path im AgendaItem-Code, Slider-Component ist pure und nimmt nur den happy-path-Input. Bessere Test-Isolation.
- **Standard partial-PUT (kein CASE-WHEN):** `images_as_slider` ist `NOT NULL`, kein nullable-Field — der `COALESCE`-Trap aus `patterns/api.md` betrifft nullable Fields. Wir treffen die Entscheidung „field included in body" via `Object.hasOwn(body, "images_as_slider")` und builden die UPDATE-SET-Clause dynamisch (consistent mit existing pattern in agenda/[id]/route.ts).
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
