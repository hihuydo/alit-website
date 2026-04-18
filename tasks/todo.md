# Sprint: Mobile Dashboard Sprint A — Foundations
<!-- Spec: tasks/spec.md (v3 — Codex R1 + R2 Findings eingearbeitet) -->
<!-- Started: 2026-04-18 -->
<!-- Status: Draft v3 — awaiting approval + post-commit Sonnet-Evaluator. Max 2 Codex-Spec-Runden erreicht. -->

## Done-Kriterien

- [ ] `pnpm build` grün, `pnpm test` ≥230 grün (227 bestehend + ≥3 neue MobileTabMenu-Tests), `pnpm audit --prod` 0 HIGH/CRITICAL.
- [ ] Grep: `rg "(md|lg):" src/app/dashboard/ | wc -l` liefert >10 (baseline: ~0).
- [ ] `src/app/dashboard/layout.tsx` body hat inline-style mit `env(safe-area-inset-top)` + `env(safe-area-inset-bottom)`; Visual-Check iPhone-Emulation Header nicht unter Notch.
- [ ] `src/app/dashboard/components/MobileTabMenu.tsx` existiert als Edge-UI-Component, nutzt `<Modal>` primitive für Panel (kein Re-Implement von Focus-Trap/Return/ESC).
- [ ] `MobileTabMenu` Prop-Shape: `tabs`, `active`, `isOpen`, `onOpenChange`, `onSelect`. `onSelect` wird **unconditional** aufgerufen (dumb component — kein `confirmDiscard`-Call intern).
- [ ] `page.tsx` `handleBurgerSelect` ruft `setBurgerOpen(false)` BEVOR `goToTab(tab)` (Single-Modal-Stack-Invariant).
- [ ] `MobileTabMenu` hat matchMedia-Listener `(min-width: 768px)` der `onOpenChange(false)` bei Transition zu match ruft.
- [ ] Burger-Button `md:hidden` + `min-w-11 min-h-11` + `aria-label="Menü öffnen"` + `aria-expanded={isOpen}`.
- [ ] Volle Tab-Leiste `hidden md:flex`, Tab-Buttons `text-xs md:text-sm lg:text-base px-3 md:px-4 py-2 min-w-0 truncate` + `title={tab.label}`.
- [ ] `Modal.tsx` Container `mx-2 md:mx-4 max-w-2xl`, max-h inline-style `calc(90vh - env(safe-area-inset-bottom))`.
- [ ] `Modal.tsx` Close-Button `min-w-11 min-h-11 flex items-center justify-center text-2xl leading-none` + `aria-label="Schließen"`.
- [ ] `DragHandle.tsx` Wrapper `min-w-11 min-h-11 md:min-w-0 md:min-h-0 flex items-center justify-center`, Icon bleibt 16×16.
- [ ] `login/page.tsx` Inputs haben `text-base`, Password-Toggle `min-w-11 min-h-11`. **Kein** extra `paddingTop: env(...)` auf Container — wird vom `dashboard/layout.tsx` body vererbt (Codex R2 #2).
- [ ] `MobileTabMenu.test.tsx` Tests: (1) Render + aria-Labels + min-44, (2) Burger-Button-Click → `onOpenChange(true)`, (3) `isOpen=true` rendert 6 Options, (4) aktiver Tab disabled (Click triggert onSelect nicht), (5) Non-active Tab-Click → `onSelect(tab)` unconditional.
- [ ] **Parent-Integration-Test REQUIRED** (Codex R2 C4): Mechanischer Test der Burger × Dirty-Kette. Mit mocked `confirmDiscard` als spy + dirty-state `setDirty('agenda', true)` — Panel öffnen, Tab klicken. Assertions: (a) `setBurgerOpen(false)` vor `confirmDiscard`-Call, (b) `confirmDiscard` mit Callback gerufen, (c) Callback → `setActive(newTab)`. Test darf `useDirty` stubben oder `DirtyProvider` mocken — implementer-choice.
- [ ] `Modal.test.tsx` 12 Tests bleiben grün (Selektoren ggf. auf `aria-label` gepinnt).
- [ ] Visual-Smoke iPhone 14 Pro Max Emulation: 8 Flows aus Spec §Verification alle PASS.
- [ ] Visual-Smoke iPad Portrait (810×1080): volle Tabs sichtbar, truncation bei longen Labels mit tooltip.

## Tasks

### Phase 1 — Modal.tsx Foundation
- [ ] `src/app/dashboard/components/Modal.tsx`:
  - Dialog-Container: `mx-2 md:mx-4` (war `mx-4`), `max-w-2xl` bleibt.
  - Inline style: `maxHeight: 'calc(90vh - env(safe-area-inset-bottom))'`.
  - Close-Button: `className="min-w-11 min-h-11 flex items-center justify-center text-2xl leading-none"`, `aria-label="Schließen"`.
  - Header `pr-4` prüfen ob mit 44×44 Button kollidiert; bei Bedarf `pr-2 md:pr-4`.
- [ ] `src/app/dashboard/components/Modal.test.tsx`: Selektoren durchchecken, bei Bedarf auf `getByRole('button', { name: 'Schließen' })` umpinnen. 12 Tests grün.

### Phase 2 — Layout + Login Foundation
- [ ] `src/app/dashboard/layout.tsx`:
  - Body `style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}`.
- [ ] `src/app/dashboard/login/page.tsx`:
  - Inputs bekommen `text-base` className (defensive).
  - Password-Toggle-Button: `min-w-11 min-h-11 flex items-center justify-center`.
  - **Kein** extra safe-area-Padding im Container — layout.tsx body vererbt es (Codex R2 #2 vermeidet Doppel-Padding).

### Phase 3 — MobileTabMenu.tsx Creation
- [ ] `src/app/dashboard/components/MobileTabMenu.tsx` NEU:
  - Imports: `useEffect`, `Modal` from `./Modal`.
  - Props-Type: `MobileTabMenuProps` mit tabs/active/isOpen/onOpenChange/onSelect.
  - matchMedia-useEffect: bei `(min-width: 768px)` match → `onOpenChange(false)`. Cleanup mit removeEventListener.
  - Render:
    - Burger-Button (`type="button"`, `className="md:hidden min-w-11 min-h-11 ..."`, `aria-label`, `aria-expanded`, onClick `onOpenChange(true)`).
    - Label-Text: `☰ {activeLabel}` (activeLabel = tabs.find → .label).
    - `<Modal open={isOpen} onClose={() => onOpenChange(false)} title="Tabs">` (Codex R2 #1: Modal.tsx Prop heißt `open`, nicht `isOpen`):
      - Vertikale Button-Liste (ul/li optional):
        - Aktive Option: `<button disabled className="... font-semibold underline">`.
        - Nicht-aktive: `<button onClick={() => onSelect(tab.key)} className="w-full text-left px-4 py-3 min-h-11 border-b hover:bg-gray-50">`.

### Phase 4 — page.tsx Integration
- [ ] `src/app/dashboard/page.tsx`:
  - Import `MobileTabMenu`.
  - `useState` für `burgerOpen: boolean`.
  - `handleBurgerSelect(tab)`:
    ```tsx
    const handleBurgerSelect = (tab: Tab) => {
      setBurgerOpen(false);  // close first
      goToTab(tab);          // then trigger (with existing dirty-guard)
    };
    ```
  - `goToTab` bleibt bestehend — wrapt `confirmDiscard`. Kleine Adjustment: bei `key === active` auch `setBurgerOpen(false)` rufen (damit Burger-Tab-Click auf aktiven Tab schließt Panel).
  - Tab-Bar-Block:
    ```tsx
    <MobileTabMenu
      tabs={tabs}
      active={active}
      isOpen={burgerOpen}
      onOpenChange={setBurgerOpen}
      onSelect={handleBurgerSelect}
    />
    <div className="hidden md:flex gap-2 mb-6">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => goToTab(tab.key)}
          title={tab.label}
          className={`text-xs md:text-sm lg:text-base px-3 md:px-4 py-2 min-w-0 truncate rounded font-medium border border-black transition-colors ${active === tab.key ? 'bg-black text-white' : 'bg-white text-black hover:bg-gray-50'}`}
        >
          {tab.label}
        </button>
      ))}
    </div>
    ```

### Phase 5 — DragHandle Touch-Target
- [ ] `src/app/dashboard/components/DragHandle.tsx`:
  - Wrapping-Element (vermutlich span oder div um Icon): Klassen `min-w-11 min-h-11 md:min-w-0 md:min-h-0 flex items-center justify-center`.
  - Verify: drag-drop-onPointerDown/onMouseDown-Handler funktioniert weiter (Event propagiert durch Wrapper auf/zum Icon).

### Phase 6 — Tests
- [ ] `src/app/dashboard/components/MobileTabMenu.test.tsx` NEU:
  - Test 1: Render → Burger-Button hat `aria-label="Menü öffnen"`, `min-w-11`, `aria-expanded="false"` (wenn isOpen false).
  - Test 2: Button-Click → `onOpenChange(true)`.
  - Test 3: `isOpen=true` → 6 Tab-Options werden gerendert (via getByRole oder getByText).
  - Test 4: Aktiver Tab als `disabled` — Click ändert nichts (onSelect nicht gerufen).
  - Test 5: Non-active-Tab-Click → `onSelect` wird mit tab-key gerufen (unconditional, kein Dirty-Check im Menu).
  - Setup: ggf. mocking `Modal` import oder rendering the real Modal — falls Modal FocusTrap auf Window-Listener geht, ist echter Modal ok; ansonsten `vi.mock('./Modal', () => ...)` mit Pass-Through.
- [ ] **Parent-Integration-Test (required)** — separate Test-File `page.test.tsx` ODER zweite describe-block in `MobileTabMenu.test.tsx`:
  - Rendert Dashboard-page-fragment (Tab-Bar-Block) mit `<DirtyProvider>` wrapper.
  - Mockt `useDirty` oder verwendet echten Provider + `setDirty('agenda', true)`.
  - Spy auf `confirmDiscard` via Mock oder check via Behavior (Modal erscheint).
  - Click Burger-Button → `burgerOpen=true` → Click nicht-aktiven Tab.
  - Assert: Panel zu UND `confirmDiscard`-Modal sichtbar. "Verwerfen" clicken → `active`-State wechselt zu neuem Tab. "Zurück" → `active` unverändert, Panel bleibt zu.

### Phase 7 — Verifikation + Deploy
- [ ] `pnpm build` grün.
- [ ] `pnpm test` ≥230 grün, Modal.test.tsx 12/12 grün.
- [ ] `pnpm audit --prod` 0 HIGH/CRITICAL.
- [ ] Grep-Check: `rg "(md|lg):" src/app/dashboard/` >10 matches.
- [ ] Visual-Smoke `pnpm dev` + Chrome DevTools iPhone 14 Pro Max Emulation:
  - [ ] Login lädt, kein Auto-Zoom beim Input-Focus
  - [ ] Dashboard lädt, Header nicht unter Notch
  - [ ] Burger-Button sichtbar + 44×44
  - [ ] Panel öffnet → 6 Options + aktiver markiert
  - [ ] Non-active Tab-Click → Panel schließt + Content wechselt
  - [ ] Editor-Offen + Non-active Tab-Click → Panel schließt + Dirty-Modal öffnet
  - [ ] "Verwerfen" → Tab-Switch; "Zurück" → kein Switch, Burger bleibt zu
  - [ ] Viewport resize auf 1024 → Panel wenn offen, schließt automatisch
  - [ ] Modal-Open (Delete-Confirm auf Agenda-Row) → Close-Button treffbar per Touch
  - [ ] DragHandle-Touch → 44×44 Tap-Zone, Drag aktiviert
  - [ ] **DragHandle-Row-Abort-Check (Codex R2 C3):** Agenda/Journal/Projekte/Alit-List-Rows auf 375px visuell prüfen. Wenn Actions-Buttons clipped oder Text unreadable truncated → Sprint A pausiert, Row-Redesign aus Sprint B wird in diesen PR mitgezogen. Wenn "etwas enger aber funktional" → Sprint A shippable.
- [ ] iPad Portrait (810×1080) Visual-Smoke: volle Tabs sichtbar, Label-Truncation mit Tooltip bei Bedarf.
- [ ] Spec-Status-Bump (v3 → v3-impl) → post-commit Evaluator läuft gegen Code.
- [ ] ggf. Fixes bis qa-report.md clean.
- [ ] Push → pre-push Sonnet-Gate grün.
- [ ] PR öffnen.
- [ ] Optional: Codex-PR-Review (kann bei reinem UI-PR skipped werden wenn Sonnet clean).
- [ ] Staging-Deploy verify: Huy iPhone Safari smoke-test.
- [ ] Merge auf main → Prod-Deploy verify.
- [ ] Wrap-up: Sprint A erledigt markieren, Sprint B Scope aus Spec §Nice-to-have nach `memory/todo.md`.

## Notes

- **Patterns-Referenz:** `patterns/tailwind.md` (iOS Safari auto-zoom, safe-area-insets), `patterns/admin-ui.md` (Modal Focus-Trap + Focus-Return Sprint 7+8), `patterns/react.md` (dirty-editor sync-during-render patterns).
- **Dirty-Guard-Integration** ist das kritischste Feature — Sprint 7+8 hatten mehrere Regressions. `handleBurgerSelect` Reihenfolge (setBurgerOpen → goToTab) ist Invariante.
- **MobileTabMenu nutzt Modal** als Panel-Host — reuse Focus-Trap, keine Re-Implementation.
- **DragHandle Row-Impact** auf Mobile dokumentiert (Text-Spalte schmaler via flex-1+truncate). Row-Redesign ist Sprint B, nicht hier.
- **Sprint B (Follow-up-PR):** Signups Expand, RichTextEditor Toolbar, Media Grids, PaidHistoryModal, Agenda/Journal/Projekte/Alit Row-Redesigns.
- **Max 2 Codex-Spec-Runden.** R1 durch, R2 nur falls User nach v2-Review noch welche fordert.
