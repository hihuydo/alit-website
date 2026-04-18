# Spec: Mobile Dashboard Sprint A — Foundations
<!-- Created: 2026-04-18 -->
<!-- Author: Planner (Claude) -->
<!-- Status: Draft v1 — awaiting user approval before post-commit Sonnet-Evaluator -->

## Summary
Macht `/dashboard/*` auf iPhone Portrait (375–430px) einhändig nutzbar, indem **geteilte Primitives** (Tab-Navigation, Modal, DragHandle, Layout/Safe-Area, Login-Form) für mobile und tablet viewports erweitert werden. Komplexe Section-Level-Arbeit (Signups Expand-Toggle, RichTextEditor-Toolbar, Media-Grid) wird in **Sprint B** als Follow-up-PR gemacht — Sprint B baut auf den hier etablierten Primitives auf.

## Context

**Audit-Ergebnis (2026-04-18, vor diesem Sprint):** Dashboard ist Desktop-first, keine `sm:`/`md:`-Breakpoints in Dashboard-Components. Worst-Offenders (in Foundations-Scope dieses Sprints):
- **Tab-Nav**: 6 Tabs mit langen Labels (`"Mitgliedschaft & Newsletter"`) in `flex gap-2` — overflow auf <768px ohne scroll
- **Modal**: `mx-4` (16px Gutter, ~343px auf 375px), Close-Button `text-2xl` ohne Padding → <24×24px Touch-Target, kein `env(safe-area-inset-bottom)`
- **DragHandle**: GripIcon 16×16px auf List-Items → unterhalb WCAG 44×44px
- **Layout**: Kein `env(safe-area-inset-*)` an Dashboard-Header (iPhone Notch-risk bei sticky)
- **Login-Form**: Funktionell mobile-tauglich laut Audit, aber formell nicht verifiziert

**Out-of-Scope-Worst-Offenders für Sprint A** (→ Sprint B):
- SignupsSection 9-Column-Tabelle auf 375px nicht lesbar
- RichTextEditor-Toolbar-Buttons `px-2 py-1 text-xs` (24×20px)
- MediaPicker/MediaSection-Grid ohne responsive column count
- PaidHistoryModal-Row-Widths

**Stack-Constraint:** Tailwind v4 mit `@theme` in globals.css. Breakpoints: default `md: 768px`, `lg: 1024px`. Projekt hat schon Mobile-Layout für Public-Site (nicht Dashboard) in globals.css `@media (max-width: 767px)`. Für Dashboard nutzen wir Tailwind-Breakpoints (`md:`, `lg:`), nicht neue Media-Queries in globals.css.

**User-Decisions (vor Spec):**
- Tab-Nav: Burger-Menu <768px; volle Tabs ≥768px
- Signups (Sprint B): Expand-Toggle pro Row (nicht diese Sprint)
- Sprint-Split: Sprint A (Foundations) + Sprint B (Sections)
- iPad Portrait (768–1023px): separater Tablet-Layout, Zwischenvariante zwischen Mobile und Desktop
- Login-Form: verifizieren + ggf. minor Fix

## Requirements

### Must Have (Sprint Contract)

1. **Dashboard-Layout safe-area-aware:**
   - `src/app/dashboard/layout.tsx` body hat `padding-top: env(safe-area-inset-top)` + `padding-bottom: env(safe-area-inset-bottom)` (beides zusätzlich zu existierendem Padding).
   - Dashboard-Header (Zeile 109 von `page.tsx`) bleibt sticky/top-0 und respektiert die Top-Inset.
   - Visual-Check auf iPhone-Simulator (DevTools "iPhone 14 Pro Max" 430×932 mit Notch): Header-Content nicht unter Notch, Konto/Abmelden-Buttons nicht in Notch.

2. **Tab-Navigation Burger-Menu auf <768px:**
   - `src/app/dashboard/page.tsx` Tab-Bar (Zeilen 135–150) wird responsive:
     - `<768px`: Ein Burger-Icon-Button (☰ + aktueller Tab-Label als Label-Suffix, z.B. "☰ Agenda") in der Zeile wo aktuell die Tabs sind. Klick öffnet ein Panel/Sheet mit den 6 Tab-Optionen vertikal (min-height 44px pro Option, aktiver Tab hervorgehoben, disabled-state wenn aktiv).
     - `≥768px`: Volle horizontale Tab-Leiste wie bisher (keine Änderung am Aussehen).
   - **Panel-Close-Verhalten**: Klick auf Tab schließt Panel + switched Tab. Klick auf Backdrop schließt Panel ohne Switch. ESC-Keydown schließt Panel.
   - **Dirty-Tracking:** `goToTab(key)` ruft `confirmDiscard(() => setActive(key))` wie bisher. Burger-Menu MUSS denselben Pfad gehen — keine Bypass-Route für Dirty-Check.
   - **A11y:** Burger-Button hat `aria-label="Menü öffnen"` + `aria-expanded`. Panel hat `role="menu"`, Options `role="menuitem"`. Focus-Trap im offenen Panel (reuse vom existierenden Modal-Pattern wenn einfach möglich, sonst minimal inline).
   - **Burger-Button Touch-Target:** ≥44×44px.

3. **Modal.tsx mobile-first:**
   - `src/app/dashboard/components/Modal.tsx` dialog-Container: `mx-2 md:mx-4 max-w-2xl` (statt hard-coded `mx-4`). Auf 375px → 359px Content-Breite.
   - Close-Button (×): `min-w-11 min-h-11 flex items-center justify-center text-2xl` (44×44px Touch-Target, Icon-Größe bleibt).
   - Safe-area-bottom: Modal `max-h: calc(90vh - env(safe-area-inset-bottom))` damit Home-Indicator-Bar auf iPhone nicht Content abschneidet.
   - Focus-Trap + Focus-Return bleiben unverändert (schon in Sprint 7 eingebaut, `Modal.test.tsx` 135 Tests prüfen das).

4. **DragHandle.tsx Touch-Target:**
   - `src/app/dashboard/components/DragHandle.tsx` wrapping: `min-w-11 min-h-11 md:min-w-0 md:min-h-0` (nur auf <768px 44px; Desktop unverändert) + `flex items-center justify-center` um GripIcon zu zentrieren.
   - Visual: Icon bleibt 16×16, aber Tap-Zone ist 44×44 auf Mobile.
   - **Hinweis:** DragHandle-CSS darf Flexbox-Layout der List-Items nicht brechen (wo der Handle in einer Row neben Content sitzt). Current-Layout muss auf md+ pixel-identisch sein.

5. **Login-Form mobile-check + Fix:**
   - `src/app/dashboard/login/page.tsx` auf iPhone-Viewport (375px) visual getestet.
   - Input-Font-Size **≥16px** damit iOS Safari nicht auto-zoomt (pattern `tailwind.md: iOS Safari quirks`): aktuell ist das via browser-default vermutlich 16px, aber explizit mit `text-base` oder `style={{ fontSize: "16px" }}` fixieren.
   - Safe-area-top auf Login-Container.
   - Password-Toggle-Button (👁️) Touch-Target ≥44×44px (aktuell `absolute right-2`).
   - Submit-Button ist `w-full` — unverändert OK.
   - Visual-Pass: Login-Form auf 375px nicht cropped, keine horizontal-scrollbars, keine auto-zoom on focus.

6. **Build + Tests:**
   - `pnpm build` grün.
   - `pnpm test` grün (existing 227 Tests bleiben grün — keine Regressions). Neue Tests sind Nice-to-Have (siehe unten).
   - `pnpm audit --prod` → 0 HIGH/CRITICAL.
   - **Grep-Check:** `rg "md:|lg:" src/app/dashboard/` liefert jetzt >0 Matches (pre-Sprint: ~2 matches globally laut Audit).

7. **Manueller Visual-Check:**
   - Per `pnpm dev` + Chrome DevTools Mobile Emulation (iPhone 14 Pro Max, 430×932) alle Flows verifiziert:
     - Dashboard-Login → in Burger-Menu Tab-Switch → Sections-Content sichtbar (auch wenn Sections selbst noch nicht mobile-optimiert sind, Sprint B)
     - Modal öffnen (Delete-Confirm, Media-Picker, Paid-History) → Close-Button treffbar, kein Overflow
     - Drag-Handle tappen auf Agenda/Journal/Projekte-List (1 Finger, keine Frustration)
     - Safe-area: kein Content unter Notch oder Home-Indicator
   - **Screenshot-Vergleich**: Nicht Pflicht, aber dokumentiert bei bekannten Breakpoints `375`, `430`, `768`, `1024`.

### Nice to Have (explicit follow-up, NOT this sprint → Sprint B / `memory/todo.md`)

1. **Sprint B (nächster PR):**
   - SignupsSection Expand-Toggle pro Row auf <768px (Basic-Info + Actions visible, Details auf Tap)
   - RichTextEditor-Toolbar responsive: Buttons `min-h-11` auf Mobile, Horizontal-Scroll bei Overflow, ggf. icon-only-mode
   - MediaSection + MediaPicker Grid responsive columns: 2/3/4 für mobile/tablet/desktop
   - PaidHistoryModal Row-Layout auf <375px checken
2. **Tests für Burger-Menu** (focus-trap, ESC-close, backdrop-close) — aktuell minimal manuell + bestehendes Modal-Test-Muster als Referenz.
3. **Screenshot-Matrix als CI-Gate** — Playwright visual-regression an Standard-Breakpoints.
4. **Dashboard-Landscape-Layout** — nicht Teil dieser Spec (iPhone Portrait-only).

### Out of Scope

- Alle Sprint-B-Items oben
- Dashboard für Android-Chrome-specific-Quirks (Fokus iOS Safari)
- Public-Site `/de/`, `/fr/` (bereits mobile-optimiert per globals.css-Accordion)
- Pull-to-Refresh auf Dashboard-Lists
- Swipe-Gesten für Tab-Switch
- PWA-Install-Prompt für Dashboard

## Technical Approach

### Files to Change

| File | Change Type | Description |
|------|-------------|-------------|
| `src/app/dashboard/layout.tsx` | Modify | Body-Padding um safe-area-insets top+bottom erweitern. |
| `src/app/dashboard/page.tsx` | Modify | Tab-Bar responsive: Burger <768, volle Tabs ≥768. Neue interne `<MobileTabMenu>`-Subcomponent inline in page.tsx (keine separate File). Dirty-Guard-Integration. |
| `src/app/dashboard/components/Modal.tsx` | Modify | `mx-2 md:mx-4`, Close-Button 44×44, max-h mit safe-area-bottom. |
| `src/app/dashboard/components/DragHandle.tsx` | Modify | Wrapping-Div mit `min-w-11 min-h-11 md:min-w-0 md:min-h-0`, flex-center. |
| `src/app/dashboard/login/page.tsx` | Modify | Explicit `text-base` auf Inputs, safe-area-top auf Container, Password-Toggle 44×44. |
| `src/app/dashboard/components/Modal.test.tsx` | Modify | Evtl. Test-Anpassung wenn Close-Button-Selector ändert. Existing tests müssen grün bleiben. |

### Architecture Decisions

1. **Tailwind-Breakpoints statt globals.css Media-Queries für Dashboard:**
   - Dashboard-Components nutzen `md:` (768) und `lg:` (1024) Prefixes inline.
   - globals.css `@media (max-width: 767px)` bleibt für Public-Site-Wrapper-Accordion.
   - Begründung: Co-located Responsive-Rules (inline im JSX) = leichter zu verstehen bei Component-Edit, kein Cross-File-Jump zu globals.css. Tailwind-Utility-First-Philosophie.

2. **Burger-Menu inline in `page.tsx` statt separate Component:**
   - Sub-Component `<MobileTabMenu>` wird **inline in page.tsx** definiert (nicht als eigene File in `components/`).
   - Begründung: Tight coupling mit `goToTab`, `active`, `tabs`-Array aus DashboardInner-Scope. Als separate File müsste man 4+ Props reinreichen und die `Tab`-Type exportieren — mehr Boilerplate als Gewinn. Wenn Menu in Sprint B/C wächst (z.B. separate Bottom-Nav-Pattern), refactoren.
   - Begrenzung: inline Sub-Component ≤ 80 LOC, sonst splitten.

3. **Burger auf <768, volle Tabs ≥768** (nicht lg als Cut):
   - Alternative `lg:` (1024) abgelehnt: iPad Portrait (810px) soll "Zwischenvariante" sein, keinesfalls Burger. User-Decision 4 explizit.
   - Bei 768–1023px volle Tabs — labels passen gerade so rein (rechnet: 6 Tabs × ~95–120px = 570–720px, max-w-5xl auf 768px = 720px content-breite ≈ passend). Falls an der Grenze overflow entsteht: `text-xs md:text-sm` für Labels auf Tablet oder `truncate` + `title`-Attribut. Lässt sich iterativ feinschleifen ohne Scope-Change.

4. **`min-w-11 min-h-11` = Tailwind 44px:**
   - Tailwind `w-11`/`h-11` = 2.75rem = 44px (bei default 16px root-font-size). Exakt WCAG-AA-Ziel.
   - Auf Desktop (`md:`) wieder `min-w-0 min-h-0` damit Original-Layout unverändert bleibt.

5. **Login-Form-Inputs: `text-base` explicit:**
   - Browser-Default ist meistens 16px, aber Tailwind `reset` setzt `font-size: inherit` auf inputs (passt), und Global CSS könnte jederzeit auf <16px reset brechen. Explicit `text-base` (16px) oder `style={{fontSize: "16px"}}` als Robustheits-Safeguard gegen iOS-Autozoom.
   - Alternative `input[type="..."] { font-size: max(16px, 1em) }` in globals.css abgelehnt: globaler Override betrifft auch Public-Signup-Form — ungewollte Kopplung.

6. **Modal Safe-Area-Bottom:**
   - `max-h: calc(90vh - env(safe-area-inset-bottom))` garantiert dass Modal-Content nicht unter Home-Indicator rutscht.
   - Alternative `padding-bottom: env(...)` abgelehnt: Padding würde den gesamten inneren Scrollbereich verschieben; besser den Modal-Höhen-Cap direkt anpassen.

### Dependencies

- **Keine neuen npm-Packages.**
- **Keine DB-Änderungen.**
- **Keine neuen Env-Vars.**
- **Internal:** Reuse existing `useDirty().confirmDiscard` aus `DirtyContext.tsx`.

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| Burger-Panel geöffnet + User tippt aktiven Tab | Panel schließt, aber kein `confirmDiscard`-Modal (Tab-Switch no-op, `key === active` returnt early in goToTab). |
| Burger-Panel geöffnet + User hat dirty editor + tippt anderen Tab | `confirmDiscard` → Dirty-Modal erscheint zusätzlich zum offenen Burger-Panel. Burger bleibt offen bis User im Dirty-Modal entscheidet. Wenn user "Verwerfen" → Tab switched + Burger-Panel schließt. Wenn "Zurück" → Burger-Panel bleibt offen, User kann neuen Tab wählen. |
| Viewport-Resize während Burger-Panel offen | Wenn Viewport ≥768px während offen → Panel sollte automatisch schließen (resize listener OR CSS `@media` um Panel auszublenden). Lösung: Tailwind `md:hidden` auf Panel-Backdrop → bei resize automatisch weg. |
| iOS Safari Sleep → Wake Home-Indicator-Geometrie ändert sich | Safe-area-inset-CSS-Variablen werden vom Browser live geupdated. Kein App-Code nötig. |
| Close-Button 44×44 überlappt neuen Padding-Bereich | Modal-Header hat `pr-4`: prüfen dass 44×44 Close-Button nicht durch das Header-Padding clipped wird. Gebenenfalls `pr-2 md:pr-4` oder Close absolut positioniert mit `top-2 right-2`. |
| DragHandle 44×44 auf Mobile bricht Horizontal-Row-Layout | Falls `flex-row` mit `gap-2` + 44px Drag-Handle + sonstigem Content auf 375px too wide: Content muss shrinken (flex-1 + truncate), nicht DragHandle. Verifiziert im Visual-Check. |
| Login-Input mit `text-base` aber Browser hat >16px root-font-size | `text-base` ist rem-based (1rem), scaled mit root. Kein Problem. |
| Safe-area-inset auf non-Notch-Device | `env(safe-area-inset-top)` = 0 auf Desktop / älteren Phones. Kein Layout-Shift. |

## Risks

- **Burger-Menu + Dirty-Tracking Integration-Bug:** Dirty-State hat in Sprint 7+8 mehrere Regressions produziert. Neue Confirm-Pfade können das stören. Mitigation: Visual-Test mit Editor-Offen + Burger-Tab-Click auf ≥2 Sections.
- **Modal-Close-Button-Refactor bricht Tests:** `Modal.test.tsx` hat 12 Tests (Sprint 7+8). Mitigation: Test-Run nach jeder Modal-Edit, selektoren auf `aria-label="Schließen"` statt auf `className` pinnen.
- **Login-Form iOS-Autozoom-Regression:** Schwer zu testen ohne echtes iOS-Device. Mitigation: explicit `text-base` + Visual-Doc auf iPhone-Simulator-DevTools.
- **iPad-Portrait (810px) fällt versehentlich in Burger-Case:** md: ist 768px, d.h. ≥768 = Desktop-Pfad. iPad Portrait im Safari = 810px. Kein Risk, aber Visual-Check auf 810px im Sprint einmal nötig.
- **globals.css-Public-Site-Regression:** Wenn aus Versehen Public-Site-Mobile-Accordion-Rules modifiziert werden. Mitigation: alle CSS-Änderungen NUR in Tailwind-Utilities inline, globals.css nur lesen nicht modifizieren (außer dokumentierten neuen Utility-Classes — siehe Must-Have).

## Verification Strategy

### Pre-Merge (lokal)
1. `pnpm build` grün
2. `pnpm test` 227/227 grün
3. `pnpm audit --prod` 0 vulns
4. `pnpm dev` + Chrome DevTools "iPhone 14 Pro Max" Mobile Emulation:
   - Login-Flow → Dashboard landet auf /dashboard/
   - Burger-Menu öffnet/schließt per Klick + Backdrop + ESC
   - Tab-Switch via Burger → Content ändert sich, Dirty-Guard funktioniert bei Editor-Offen
   - Modal-Open (z.B. via Agenda-Item-Delete): Close-Button treffbar per Touch
   - Drag-Handle per Touch (1 Finger-Tap-and-Hold) wird nicht versehentlich ausgelöst beim Scroll
   - Screenshot iPhone-Portrait (430×932) + iPad-Portrait (810×1080) dokumentiert (optional als PR-Artefakt)

### Staging-Deploy
1. CI grün, docker logs clean
2. curl auf `https://staging.alit.hihuydo.com/dashboard/login/` → 200 + `cache-control: private, no-cache, ...`
3. Eigener Safari iOS (falls verfügbar) oder weiterhin Chrome DevTools Emulation — UI auf Mobile sichtbar ohne Overflow

### Post-Merge auf Prod
1. CI deploy.yml green
2. Dashboard-Login auf Prod via iPhone → Burger-Menu sichtbar, funktioniert
3. `docker logs` clean

## Open Questions (keine — alle in User-Decisions geklärt)

---

**Ende Spec v1.** Awaiting approval → Commit → post-commit Sonnet-Evaluator → ggf. Fix-Loop → Generator startet.
