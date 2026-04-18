# Spec: Mobile Dashboard Sprint A — Foundations
<!-- Created: 2026-04-18 -->
<!-- Author: Planner (Claude) -->
<!-- Status: Draft v3 — Codex Runde 2 Findings eingearbeitet (Modal-API-Drift fix, Safe-area-Double-Padding fix, Parent-Integration-Test required, DragHandle Visual-Abort-Criteria). Awaiting user approval. Max 2 Codex-Spec-Runden erreicht. -->

## Summary
Macht `/dashboard/*` auf iPhone Portrait (375–430px) einhändig nutzbar, indem **geteilte Primitives** (Burger-Tab-Nav, Modal, DragHandle, Layout/Safe-Area, Login-Form) für mobile und tablet viewports erweitert werden. Burger-Menu baut auf existierendem `Modal.tsx` auf (reuse Focus-Trap/Return/ESC). Dirty-Guard bleibt beim Parent (`goToTab`-Wrapper) — Burger-Panel schließt VOR dem Tab-Switch-Call, vermeidet stacked modals. Komplexe Section-Level-Row-Redesigns (Signups Expand-Toggle, RichTextEditor-Toolbar, Media-Grid, Agenda/Journal/Projekte/Alit Row-Actions-Layouts) = Sprint B.

## Context

**Audit-Ergebnis (2026-04-18, vor Sprint):** Dashboard ist Desktop-first, keine `md:`/`lg:`-Breakpoints in Components. Worst-Offenders für Sprint A:
- Tab-Nav: 6 Tabs (`"Mitgliedschaft & Newsletter"` ist longest) in `flex gap-2` — overflow ohne scroll auf <768
- Modal: `mx-4` Gutter, Close-Button `text-2xl` ohne padding (<24×24 Touch-Target), kein `env(safe-area-inset-bottom)`
- DragHandle: 16×16px (WCAG AA fordert ≥44×44)
- Layout: kein `env(safe-area-inset-*)` am Dashboard-Body/Header (Notch-Risk)
- Login-Form: funktionell OK laut Audit, aber formell nicht verifiziert

**Sprint-B-scoped (nicht diese Sprint):**
- SignupsSection 9-Column-Tabelle → Expand-Toggle pro Row
- RichTextEditor Toolbar-Buttons (px-2 py-1 text-xs = 24×20px)
- MediaPicker/MediaSection Grid (responsive column count 2/3/4)
- **Row-Action-Layouts in Agenda/Journal/Projekte/Alit-Sections** (wenn DragHandle von 16 auf 44 wächst, werden Text-Spalten ~10% schmaler — Section-Row-Redesign für optimales Layout folgt in Sprint B)

**Stack-Constraint:** Tailwind v4. Breakpoints `md: 768px`, `lg: 1024px`. Dashboard-Components nutzen `md:`/`lg:` inline (NICHT neue `@media`-Rules in globals.css — Public-Site-Accordion-Rules bleiben unberührt).

**`globals.css` hat bereits `font-size: max(16px, 1rem)` für `input/select/textarea` auf Mobile** (`patterns/tailwind.md` iOS-Auto-Zoom-Prevention). Das greift projekt-weit für alle Inputs, nicht nur Public-Site. Dashboard-Login bekommt trotzdem `text-base` explicit als Local-Klarheit + Schutz gegen Future-globals.css-Refactor. **Nicht sprint-contract-kritisch.**

**User-Decisions (vor Spec):**
- Tab-Nav: Burger-Menu <768px; volle Tabs ≥768px
- Sprint-Split: A (Foundations) + B (Sections)
- iPad Portrait (768–1023px): separater Tablet-Layout mit Zwischenvariante (Zwischenschritt zwischen Burger und Desktop-Chrome — Tab-Labels per breakpoint shrink)
- Login-Form: verifizieren + minor Fixes

**Codex R1 (9 Findings, in v2 addressed):**
- [Contract] Dirty-Guard-Ownership klar: Parent `goToTab` ist Single-Wrapper, Burger schließt VOR Aufruf
- [Contract] A11y Focus-Trap via Reuse von `Modal.tsx` primitive (nicht reimplementing)
- [Contract] DragHandle 44×44 dokumentiert mit Row-Layout-Impact; Row-Redesign = Sprint B
- [Contract] Mechanischer Unit-Test für Burger × Dirty-Integration
- [Correctness] `useEffect` + `matchMedia` für Viewport-Resize-State-Sync
- [Correctness] Keine stacked modals: Burger-Panel schließt bevor Dirty-Modal öffnet
- [UX] Tab-Label-Response: `text-xs md:text-sm lg:text-base` + `truncate` + `title`
- [Architecture] `MobileTabMenu.tsx` als separate File (nicht inline in page.tsx)
- [Nice-to-have] globals.css-font-size-Regel bereits global wirksam; `text-base` ist nur Local-Klarheit

## Requirements

### Must Have (Sprint Contract)

1. **Dashboard-Layout safe-area-aware:**
   - `src/app/dashboard/layout.tsx` body hat `paddingTop: env(safe-area-inset-top)` + `paddingBottom: env(safe-area-inset-bottom)` (inline style).
   - Visual-Check iPhone 14 Pro Max Emulation (430×932): Header-Content nicht unter Notch.

2. **Modal.tsx mobile-first:**
   - Dialog-Container Klassen: `mx-2 md:mx-4 max-w-2xl` (war `mx-4`).
   - Close-Button: `min-w-11 min-h-11 flex items-center justify-center text-2xl leading-none`, `aria-label="Schließen"` (explicit).
   - Container `max-h` via inline style: `calc(90vh - env(safe-area-inset-bottom))`.
   - **Modal-Header-Padding** parallel mitgeschoben wenn Close-Button 44×44 braucht: aktuell `pr-4` → prüfen dass Button nicht clipped; falls knapp, `pr-2 md:pr-4`.
   - Focus-Trap + Focus-Return + ESC + Backdrop-Click bleiben unverändert (Sprint 7+8 bestehend, 12 Tests in `Modal.test.tsx`).

3. **`MobileTabMenu.tsx` als separate Component (NEU):**
   - `src/app/dashboard/components/MobileTabMenu.tsx` exportiert `<MobileTabMenu>`:
     - Props: `tabs: { key: Tab; label: string }[]`, `active: Tab`, `isOpen: boolean`, `onOpenChange: (open: boolean) => void`, `onSelect: (tab: Tab) => void`.
     - Render: Burger-Button (`md:hidden`, `aria-label="Menü öffnen"`, `aria-expanded={isOpen}`, `min-w-11 min-h-11`), Label `"☰ {activeLabel}"`.
     - Wenn `isOpen` → `<Modal open={isOpen} onClose={() => onOpenChange(false)} title="Tabs">` (HINWEIS: Modal-Primitive akzeptiert Prop-Name `open`, nicht `isOpen` — MobileTabMenu-externer Prop bleibt aus Klarheits-Gründen `isOpen`, intern gemappt auf `open={isOpen}`). Children = vertikale Liste der 6 Tab-Options als `<button>` (`w-full text-left px-4 py-3 min-h-11 border-b`, aktiver tab `font-semibold underline` + disabled).
     - **Focus-Trap, Focus-Return, ESC, Backdrop-Click = gratis aus Modal.tsx** (keine Re-Implementation).
   - **Dumb component contract:** `onSelect(tab)` wird unconditional aufgerufen. Menu macht KEINEN `confirmDiscard`-Call. Parent ist Dirty-Gate-Owner.

4. **Tab-Navigation in `page.tsx` responsive:**
   - Burger-Button-Layer: `<MobileTabMenu ... />` nimmt Position der bestehenden Tab-Bar ein.
   - Volle Tab-Leiste bleibt als `hidden md:flex` Container.
   - Tab-Buttons bekommen: `text-xs md:text-sm lg:text-base px-3 md:px-4 py-2 min-w-0 truncate` + `title={tab.label}`. Verhindert Label-Overflow auf 768-900px.
   - **Dirty-Guard-Ownership klar:**
     ```tsx
     const [burgerOpen, setBurgerOpen] = useState(false);
     const goToTab = (key: Tab) => {
       if (key === active) { setBurgerOpen(false); return; }
       confirmDiscard(() => setActive(key));
     };
     const handleBurgerSelect = (tab: Tab) => {
       setBurgerOpen(false);    // <-- schließt Burger-Panel VOR der Discard-Prüfung
       goToTab(tab);
     };
     ```
   - **Regel:** `MobileTabMenu` ruft `onSelect(tab)` → Parent's `handleBurgerSelect` schließt Panel erst, ruft dann `goToTab`. Wenn `goToTab` das Dirty-Modal öffnet, ist Burger-Panel bereits weg. Keine gestackten modals, klares Focus-Model.

5. **Viewport-Resize-State-Sync:**
   - `MobileTabMenu` hat intern `useEffect` mit `window.matchMedia('(min-width: 768px)')` Listener. Bei Transition zu match (→ Desktop-Layout) wird `onOpenChange(false)` gerufen.
   - `md:hidden` auf Burger-Button versteckt zwar UI, aber State-Reset via Listener ist autoritativ.

6. **DragHandle.tsx Touch-Target:**
   - Wrapping-Div bekommt `min-w-11 min-h-11 md:min-w-0 md:min-h-0 flex items-center justify-center`.
   - Auf Mobile: Tap-Zone 44×44, Icon bleibt 16×16 innen zentriert.
   - **Dokumentierter Row-Impact:** Text-Spalte wird auf <768 ~28px schmaler (16→44 Delta). Rows nutzen `flex-1 min-w-0 truncate` bereits → Text truncated länger auf Mobile. Action-Buttons bleiben `shrink-0` wie bisher. **Vollständiges Row-Redesign ist Sprint B.**

7. **Login-Form mobile-check + minor Fixes:**
   - `src/app/dashboard/login/page.tsx` auf 375px visual OK: keine horizontal-scrollbar, kein Crop.
   - Inputs bekommen `text-base` className (defensive, redundant zu globals.css aber klar).
   - Password-Toggle-Button (👁️): `min-w-11 min-h-11 flex items-center justify-center` (bleibt `absolute right-2`).
   - **Kein** extra `paddingTop: env(...)` auf Login-Container — `/dashboard/login/` liegt unter `dashboard/layout.tsx` body, das bereits das Safe-Area-Top-Padding anwendet. Doppel-Padding auf Notch-Geräten wird dadurch verhindert (Codex R2 #2).

8. **Tests:**
   - `src/app/dashboard/components/MobileTabMenu.test.tsx` NEU:
     - Render-Test: Burger-Button hat `aria-label`, `min-w-11 min-h-11`.
     - Burger-Button-Click triggert `onOpenChange(true)`.
     - `isOpen=true` rendert 6 Tab-Options.
     - Aktiver Tab disabled (Click triggert `onSelect` nicht).
     - Nicht-aktiver Tab-Click triggert `onSelect(tab)` (unconditional, kein Dirty-Check im Menu).
   - **Parent-Integration-Test REQUIRED** (Codex R2 C4): dedizierter Test — entweder in `MobileTabMenu.test.tsx` oder separater Test-File — der die Burger × Dirty-Kette mechanisch verifiziert. Mit mocked `DirtyContext` (`confirmDiscard` als spy + `setDirty('agenda', true)` für dirty-state) rendert die Tab-Bar inkl. MobileTabMenu, öffnet Panel, klickt nicht-aktiven Tab. Assertions: (a) `setBurgerOpen(false)` State-Change passiert VOR `confirmDiscard`-Call, (b) `confirmDiscard` wird mit einer Callback-Fn gerufen, (c) Callback-Aufruf führt zu `setActive(newTab)`. Der Test darf `DirtyProvider` mocken oder die `useDirty`-Return-shape stubben — Implementierer wählt saubere Variante.
   - Bestehende `Modal.test.tsx` (12 Tests) bleiben grün.
   - `pnpm test` 227+ grün (mindestens 230 mit MobileTabMenu-Tests).

9. **Build + Audit:**
   - `pnpm build` grün.
   - `pnpm audit --prod` 0 HIGH/CRITICAL.
   - Grep: `rg "(md|lg):" src/app/dashboard/ | wc -l` liefert >10.

10. **Manueller Visual-Check:**
    - iPhone 14 Pro Max Emulation (430×932):
      - Login → Dashboard lädt, Header nicht unter Notch
      - Burger-Button sichtbar + 44×44
      - Burger öffnet, 6 Optionen sichtbar, aktiver Tab markiert
      - Tab-Switch im Burger → Panel schließt + content wechselt (Dirty-Guard triggered wenn editor offen)
      - Viewport-Transition >768 mit offenem Panel → Panel schließt automatisch
      - Modal öffnen (z.B. Delete-Confirm) → Close-Button treffbar
    - iPad Portrait (810×1080): volle Tab-Leiste sichtbar, Labels nicht overflowing, nicht truncated wenn Platz da ist.
    - **DragHandle-Row-Abort-Criteria (Codex R2 C3):** Auf 375px Agenda/Journal/Projekte/Alit-List-Rows visuell prüfen. Wenn (a) Actions-Buttons clipped/off-screen sind, ODER (b) Text-Spalte so knapp truncated dass Row-Identifikation unmöglich wird — dann wird Sprint A **PAUSIERT** und Row-Redesign aus Sprint B wird in diesen PR mitgezogen (nicht split). Wenn Rows nur "etwas enger aber funktional" sind: Sprint A shippable, Row-Redesign bleibt Sprint B.

### Nice to Have (explicit follow-up, NOT this sprint → Sprint B / `memory/todo.md`)

1. **Sprint B (nächster PR):**
   - SignupsSection Expand-Toggle pro Row auf <768
   - RichTextEditor-Toolbar responsive Buttons + Horizontal-Scroll
   - MediaSection + MediaPicker Grid responsive columns (2/3/4)
   - PaidHistoryModal Row-Overflow auf <375
   - **Row-Redesign** in AgendaSection/JournalSection/ProjekteSection/AlitSection — Actions wrappen oder stacken auf Mobile, damit 44×44 DragHandle + viel Text + Actions auf 375px sauber passen
2. Playwright-E2E-Smoke-Tests für Burger-Menu × Dirty-Integration (über reinen Unit-Test hinaus).
3. Screenshot-Matrix als CI-Gate an Standard-Breakpoints (375, 430, 768, 1024, 1440).
4. Dashboard-Landscape-Layout (iPhone Landscape, Full-width Tablet-Landscape).
5. Swipe-Gesten für Tab-Switch.

### Out of Scope

- Alle Sprint-B-Items oben
- Android-Chrome-specific-Quirks (Fokus iOS Safari)
- Public-Site (bereits mobile via globals.css)
- Dark-Mode für Dashboard
- Offline-Support / Service-Worker

## Technical Approach

### Files to Change

| File | Change Type | Description |
|------|-------------|-------------|
| `src/app/dashboard/layout.tsx` | Modify | Body inline-style `paddingTop`/`paddingBottom` mit `env(safe-area-inset-*)`. |
| `src/app/dashboard/page.tsx` | Modify | Tab-Bar-Block: `hidden md:flex` + `<MobileTabMenu>` davor. Neue `handleBurgerSelect`-Fn. Tab-Button-Klassen responsive erweitert. |
| `src/app/dashboard/components/Modal.tsx` | Modify | `mx-2 md:mx-4`, Close-Button 44×44 + aria-label, max-h-style mit safe-area-bottom. |
| `src/app/dashboard/components/MobileTabMenu.tsx` | **Create** | Burger-Button + Modal-based Panel. Matchmedia-resize-sync. Zero Dirty-Guard (dumb). |
| `src/app/dashboard/components/MobileTabMenu.test.tsx` | **Create** | Render, Click, aktiver Tab disabled, dumb-callback-Behavior. |
| `src/app/dashboard/components/DragHandle.tsx` | Modify | Wrapping-Div min-44 auf Mobile, min-0 auf Desktop. |
| `src/app/dashboard/login/page.tsx` | Modify | Inputs `text-base`, Password-Toggle 44×44, safe-area-top auf Container. |
| `src/app/dashboard/components/Modal.test.tsx` | Modify (minor) | Falls Close-Button-Selektor auf className statt aria-label lag — auf aria-label umstellen. |

### Architecture Decisions

1. **MobileTabMenu baut auf `Modal.tsx`** (Codex R1 #2+#8):
   - Reuse Focus-Trap, Focus-Return, Initial-Focus, ESC, Backdrop-Click, aria-modal=true — alles schon in Modal.tsx.
   - Panel-Content = `<Modal>`-children = einfache `<button>`-Liste.
   - **Rejected:** Inline Sub-Component in page.tsx. Begründung (R1 #8): mit Focus-Trap + Resize-Effect + ESC ist der Component >80 LOC und hat dialog-like Behavior — gehört in eigene File und wird testbar.

2. **Dirty-Guard bleibt bei Parent, Burger ist dumb** (Codex R1 #1):
   - `MobileTabMenu` ruft `onSelect(tab)` unconditional.
   - Parent `handleBurgerSelect(tab)` schließt Panel zuerst (`setBurgerOpen(false)`), DANN `goToTab(tab)` (der confirmDiscard wrapt wenn dirty).
   - **Rejected:** Menu-internal `confirmDiscard`-Call. Doppel-Wrapping-Risk (sowohl `goToTab` als auch Menu callen), oder Parent müsste stop-wrapping (brechen Keyboard-Nav-Tab-Click-Flows).

3. **Keine stacked modals** (Codex R1 #6):
   - Burger-Panel schließt VOR Dirty-Modal-Open → nur ein aria-modal-Dialog zu einer Zeit. Klares Focus-Model.
   - Wenn User "Zurück" im Dirty-Modal klickt → Burger-Panel bleibt geschlossen (User re-öffnet manuell). Einfacher als re-open-coordination.

4. **matchMedia-Listener für State-Sync** (Codex R1 #5):
   - `useEffect(() => { const mql = window.matchMedia('(min-width: 768px)'); const handler = (e) => { if (e.matches) onOpenChange(false); }; mql.addEventListener('change', handler); return () => mql.removeEventListener('change', handler); }, [onOpenChange]);`
   - `md:hidden` auf Button = cosmetic. State-Reset via matchMedia = autoritativ.
   - **Rejected:** `window.addEventListener('resize')` — matchMedia ist billiger + semantisch korrekter.

5. **Tab-Label-Response statt Label-Shortening** (Codex R1 #7):
   - `text-xs md:text-sm lg:text-base` + `min-w-0 truncate` + `title={tab.label}` pro Tab-Button.
   - Langer Label wird auf 768-900px truncated, voll lesbar auf ≥1024. Hover-tooltip zeigt vollen Label.
   - **Rejected:** Label-Shortening (`"Mitgliedschaft & Newsletter"` → `"Signups"`). Cross-Viewport-Label-Inconsistency = verwirrend, zwei Labels zu pflegen.

6. **DragHandle bleibt in Sprint A, Row-Redesign = Sprint B** (Codex R1 #3):
   - Row-Impact auf Mobile: Text-Spalte ~10% schmaler, Actions-Buttons bleiben `shrink-0`. Existing `flex-1 min-w-0 truncate` fängt den Unterschied ab — Text truncated etwas früher, nicht broken.
   - **Rejected:** DragHandle ganz nach Sprint B verschieben. Begründung: Primitive-Foundations-Fokus bleibt — Touch-Target ≥44px ist WCAG-AA, primäres Mobile-Audit-Finding. Row-Redesign ist Scope-Creep für 4 Section-Files, gehört strukturell nach Sprint B wo Sections eh touched werden.

7. **Login `text-base` trotz globals.css-Schutz** (Codex R1 #9):
   - `globals.css:692` hat bereits `input/select/textarea { font-size: max(16px, 1rem); }` projekt-weit auf Mobile. Das verhindert iOS-Autozoom unabhängig von Dashboard-Inputs.
   - `text-base` ergänzend in Dashboard-Login = Local-Klarheit + Defensive-Safeguard gegen Future-globals.css-Refactor. Kein Sprint-Contract-Kritischer-Punkt.

8. **Tailwind-Breakpoints, keine globals.css-Media-Queries für Dashboard**:
   - Co-located Responsive-Rules im JSX, kein Cross-File-Jump.
   - globals.css-Mobile-Section bleibt für Public-Site-Wrapper-Accordion.

### Dependencies

- **Keine neuen npm-Packages.**
- **Keine DB-Änderungen.**
- **Keine Env-Var-Änderungen.**
- **Internal:** Reuse `Modal.tsx`, `DirtyContext.tsx` (`useDirty().confirmDiscard`).

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| Burger-Panel offen, User tippt aktiven Tab | Panel schließt (setBurgerOpen(false) in handleBurgerSelect), aber kein Dirty-Modal (goToTab returnt early bei `key === active`). |
| Burger-Panel offen, dirty editor, User tippt anderen Tab | handleBurgerSelect schließt Panel → goToTab → confirmDiscard öffnet Dirty-Modal. Burger-Panel bereits zu. Single-Modal-Stack. |
| Dirty-Modal "Verwerfen" → Tab-Switch passiert. | |
| Dirty-Modal "Zurück" → Tab-Switch nicht passiert. Burger-Panel bleibt geschlossen (User kann via Burger-Button neu öffnen). | |
| Viewport-Transition <768 → ≥768 mit offenem Burger-Panel | matchMedia-Listener feuert `onOpenChange(false)`. Panel-State geht auf false. Auf Desktop-Layout sichtbar volle Tab-Leiste. |
| Viewport-Transition ≥768 → <768 | Kein automatischer Open des Burger — User muss manuell klicken (Panel-State = false). Korrektes default. |
| iOS-Safari-Autozoom bei Login-Input-Focus | `globals.css:692` `input/select/textarea { font-size: max(16px, 1rem); }` greift projekt-weit. `text-base` im Dashboard-Login ist Defensive-Backup. |
| Safe-area-insets auf non-Notch-Device | `env()` returnt 0. Kein Layout-Shift. |
| iOS Sleep → Wake, Home-Indicator-Geometrie ändert sich | `env()` CSS-Variablen werden live vom Browser geupdated. Kein App-Code. |
| DragHandle 44×44 + Row-Content auf 375px | Text-Spalte `flex-1 min-w-0 truncate` shrinked früher, Actions `shrink-0` bleiben. Lesbar, nicht gebrochen. Optimales Row-Redesign = Sprint B. |
| Modal Close-Button Padding clipped | Visual-Check iPhone; falls `pr-4 + min-w-11` zu breit: `pr-2 md:pr-4` fallback. |
| MobileTabMenu.test.tsx mockt useDirty | Das Menu IST dumb — ruft keinen confirmDiscard. Unit-Test mockt nur `onSelect` und verifiziert dass es unconditional gerufen wird. Parent-Integration (setBurgerOpen→goToTab) ist separater Test in Parent-Ebene ODER Visual-Smoke (akzeptabel). |

## Risks

- **Modal.tsx-Refactor bricht 12 Tests:** Mitigation: Selektoren auf `aria-label="Schließen"` pinnen. Falls Test-Selektor bisher auf `className`/text `×` lag → in derselben Edit-Session fixen.
- **Burger-Menu × Dirty × confirmDiscard Race:** Sprint 7+8 hatten mehrere Dirty-Regressions. Mitigation: Panel-Close-Reihenfolge (setBurgerOpen(false) vor goToTab) + mechanischer Unit-Test für MobileTabMenu.
- **Tab-Label-Truncate-Sichtbarkeit:** Auf 768-900px werden einige Labels abgeschnitten. Acceptable mit `title`-Tooltip. User muss wissen was hinter "Mitgliedschaf..." steht — die anderen 5 kürzeren Labels sind Context genug.
- **matchMedia-Listener-Leak:** useEffect-cleanup über `removeEventListener`. Standard React-Pattern, kein Risk wenn richtig implementiert.
- **iOS-Real-Device-Test fehlt:** Nur DevTools-Emulation. Risiko: Viewport-Behaviors (Notch-Inset, Auto-Zoom) können auf echtem iOS anders wirken als in Chrome-Emu. Mitigation: Staging-Deploy + Prod-Deploy-Verify über Huy iPhone Safari.
- **DragHandle-Row-Impact ist dokumentiert aber ungetestet:** Visual-Check auf 375px muss prüfen dass Rows nicht broken wirken. Falls broken entsteht, Sprint B fixt Row-Redesign — aber Sprint A DragHandle-Change bleibt gemerged.

## Verification Strategy

### Pre-Merge (lokal)
1. `pnpm build` grün
2. `pnpm test` ≥230 (227 bestehend + neue MobileTabMenu-Tests), Modal.test.tsx 12 Tests grün
3. `pnpm audit --prod` 0 vulns
4. Grep `rg "(md|lg):" src/app/dashboard/ | wc -l` >10
5. `pnpm dev` + Chrome DevTools iPhone 14 Pro Max Emulation:
   - Login → Inputs kein Auto-Zoom-on-Focus
   - Dashboard → Header nicht unter Notch
   - Burger-Button sichtbar, 44×44
   - Panel öffnet → 6 Optionen sichtbar
   - Non-active Tab Click → Panel schließt + Tab wechselt
   - Editor-Offen + Non-active Tab Click → Panel schließt + Dirty-Modal öffnet
   - "Verwerfen" → Tab-Switch; "Zurück" → kein Switch, Burger zu
   - Viewport auf 1024 resize → Panel (wenn offen) schließt, volle Tabs sichtbar
   - Modal (Delete-Confirm) → Close-Button treffbar
   - DragHandle auf Agenda-Item Touch → 44×44 Tap-Zone, Drag funktioniert
6. iPad Portrait (810×1080): volle Tab-Leiste, Labels wenn nötig truncated mit Tooltip

### Staging-Deploy
1. CI grün, docker logs clean
2. Huy iPhone Safari auf `https://staging.alit.hihuydo.com/dashboard/` — Burger + Modals funktionieren auf Real-Device

### Post-Merge auf Prod
1. CI deploy.yml green
2. Prod-Dashboard auf iPhone Safari → Burger funktioniert
3. `docker logs` clean

---

## Codex R1 Findings → Eingearbeitet (v2)

- ✅ **C1 [Contract]** Dirty-Guard-Ownership: Parent-only via `handleBurgerSelect` (setBurgerOpen(false) + goToTab). MobileTabMenu dumb.
- ✅ **C2 [Contract]** A11y Focus-Trap: MobileTabMenu nutzt bestehenden `Modal.tsx` primitive — gratis Focus-Trap/Return/ESC.
- ✅ **C3 [Contract]** DragHandle Row-Impact dokumentiert mit flex-1-min-w-0-truncate Fallback; Row-Redesign = Sprint B.
- ✅ **C4 [Contract]** Mechanischer Unit-Test `MobileTabMenu.test.tsx` als Must-Have.
- ✅ **C5 [Correctness]** matchMedia `(min-width: 768px)` Listener für State-Sync statt nur `md:hidden`.
- ✅ **C6 [Correctness]** Single-Modal-Stack: Burger schließt VOR Dirty-Modal via handleBurgerSelect-Reihenfolge.
- ✅ **C7 [UX]** Tab-Label-Response: `text-xs md:text-sm lg:text-base` + `min-w-0 truncate` + `title`.
- ✅ **C8 [Architecture]** `MobileTabMenu.tsx` als separate File (nicht inline in page.tsx).
- ✅ **C9 [Nice-to-have]** Rationale für `text-base` im Login dokumentiert; globals.css-Schutz erwähnt.

## Codex R2 Findings → Eingearbeitet (v3)

- ✅ **R2 #1 Modal-API-Drift (C2 Partial-Fix):** Spec zeigt jetzt `<Modal open={isOpen} ...>` mit Hinweis dass MobileTabMenu-Prop `isOpen` ist aber Modal `open` akzeptiert. Mapping im JSX explizit.
- ✅ **R2 #2 Safe-area-Double-Padding:** Login-Container-`paddingTop` entfernt. Safe-Area-Top wird nur am Dashboard-`layout.tsx` body appliziert (Login liegt darunter, inheritet).
- ✅ **R2 C4 (Still-Open) Parent-Integration-Test REQUIRED:** "optional" entfernt aus Must-Have. Mechanischer Test für `handleBurgerSelect → setBurgerOpen(false) → confirmDiscard` Reihenfolge ist Sprint-Contract-Kriterium.
- ✅ **R2 C3 (Partial) DragHandle Visual-Abort-Criteria:** "falls Actions clipped/Text unreadable auf 375 → Sprint A pausiert, Row-Redesign aus Sprint B wird mitgezogen" als harte Abbruchkante im Visual-Smoke.
- ⏸️ **Keine weitere Codex-Spec-Runde** — max 2 erreicht. Nächster Deep-Review am PR.
