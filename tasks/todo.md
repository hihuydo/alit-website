# Sprint: Mobile Dashboard Sprint B1 — Row-Redesigns + ListRow Primitive
<!-- Spec: tasks/spec.md (v2) -->
<!-- Started: 2026-04-18 -->
<!-- Status: Draft v2 — Codex R1 Findings eingearbeitet. Max 2 Codex-Spec-Runden, next ist PR-Review. -->

## Done-Kriterien

- [ ] `pnpm build` grün, `pnpm test` ≥245 grün (237 pre + ≥8 neu), `pnpm audit --prod` 0 HIGH/CRITICAL.
- [ ] Grep `rg "flex items-center justify-between gap-3 p-3" src/app/dashboard/components/{Agenda,Journal,Projekte,Alit}Section.tsx` → 0 matches (alle migriert).
- [ ] `src/app/dashboard/components/ListRow.tsx` existiert mit Props `dragHandle?`, `content`, `badges?` (opaque ReactNode — kein BadgeSpec-Type), `actions: RowAction[]`, **+ Drag-Props `draggable`/`onDragStart`/`onDragEnter`/`onDragOver`/`onDragEnd`/`rowId`** (Codex R1 #1).
- [ ] `ListRow` rendert auf ≥md horizontale Action-Buttons (`hidden md:flex`), auf <md ein "…"-Button (`md:hidden`) + `RowActionsMenu`-Modal. CSS-Dual-DOM, kein `useMediaQuery` für Layout.
- [ ] Drag-Props (draggable, onDragStart/Enter/Over/End, rowId) werden auf Container-`<div>` gesetzt und `rowId` wird als `data-row-id`-Attribut gerendert.
- [ ] `RowActionsMenu` hat matchMedia-Listener der Menu-Modal bei Viewport-Resize ≥768 schließt (analog MobileTabMenu Sprint A).
- [ ] `RowActionsMenu` nutzt `<Modal>` primitive (reuse Focus-Trap/Return/ESC aus Sprint A).
- [ ] Action-Click schließt Menu-Modal BEVOR action.onClick aufgerufen wird (Single-Modal-Stack).
- [ ] "…"-Button hat `aria-label="Aktionen"`, `aria-expanded`, `aria-haspopup="menu"`, `min-w-11 min-h-11`.
- [ ] `variant="danger"`-Actions haben `text-red-600` Styling im Mobile-Menu.
- [ ] `disabled: true` Actions sind im Mobile-Menu als `<button disabled>` gerendert.
- [ ] AgendaSection/JournalSection/ProjekteSection/AlitSection rendern ihre Rows über `<ListRow>`. Bestehende onEdit/onDelete/confirmDiscard-Logik unverändert.
- [ ] `ListRow.test.tsx` hat ≥10 Tests (Codex R1 #3 + #4): Render-Basics, Desktop-class-Presence (`hidden md:flex`), Mobile-class-Presence (`md:hidden`), aria-attributes auf "…"-Button, Menu-Open-on-Click, **Spy-backed Close-before-Action Order** (call_order-Array-Assertion — Menu-closed VOR action-invoked), Desktop-Button-Click triggers action direkt, Variant-Danger-Styling, Disabled-Action, **Drag-Props-Forwarding auf Container** (spy auf onDragStart mit draggable=true).
- [ ] Existing `MobileTabMenu.test.tsx` (10) + `Modal.test.tsx` (13) + restliche 214 Tests bleiben grün.
- [ ] Visual-Smoke iPhone 14 Pro Max: alle 4 Sections zeigen "…"-Button statt 2 full-width Buttons, Menu öffnet + schließt, actions funktionieren.
- [ ] iPad Portrait: volle horizontale Buttons sichtbar (Desktop-Layout), kein "…"-Button.

## Tasks

### Phase 1 — ListRow Primitive + Tests
- [ ] `src/app/dashboard/components/ListRow.tsx` erstellen:
  - Type-Definitionen `RowAction`, `ListRowProps`.
  - Render-Struktur: container `flex items-center justify-between gap-3 p-3`.
  - `dragHandle`-Slot links.
  - `content`-Slot `flex-1 min-w-0`.
  - `badges`-Slot `shrink-0 flex gap-2` (versteckt auf <320px? optional).
  - Desktop actions-cluster: `hidden md:flex gap-2 shrink-0` mit `<button>` pro action.
  - Mobile actions: `<RowActionsMenu actions={actions} className="md:hidden" />`.
- [ ] `src/app/dashboard/components/RowActionsMenu.tsx` erstellen:
  - Inline in ListRow.tsx (≤40 LOC) ODER separate File.
  - Lokaler `useState` für menuOpen.
  - Burger-"…"-Button: 44×44, aria-labels.
  - `<Modal open={menuOpen} onClose={() => setMenuOpen(false)} title="Aktionen">`:
    - Vertikale Button-Liste, eine Zeile pro action.
    - Action-Click: `setMenuOpen(false); action.onClick();` (synchron, close-first).
    - `variant="danger"` → `text-red-600`.
    - `disabled` → button disabled.
- [ ] `src/app/dashboard/components/ListRow.test.tsx` erstellen:
  - Test 1: Rendert content, badges, dragHandle korrekt.
  - Test 2: Desktop (`md:`-match): alle actions als separate Buttons sichtbar, kein "…".
  - Test 3: Mobile (`<md`): nur "…"-Button sichtbar, actions nicht direkt gerendert.
  - Test 4: "…"-Click öffnet Modal mit allen actions.
  - Test 5: Action-Click im Modal schließt Menu, ruft action.onClick.
  - Test 6: `variant="danger"` → `text-red-600` class present.
  - Test 7: `disabled` action → `<button disabled>` im Modal.
  - Test 8: aria-attributes auf "…"-Button korrekt gesetzt.

### Phase 2 — Section Refactors
- [ ] `src/app/dashboard/components/AgendaSection.tsx`:
  - Row-Map-Block identifizieren (ca. Zeile 599–629 laut Audit).
  - `<div className="flex items-center justify-between gap-3 p-3">...</div>` ersetzen durch `<ListRow dragHandle={...} content={...} badges={...} actions={...} />`.
  - Bestehende onEdit/onDelete handlers unverändert als callbacks.
- [ ] `src/app/dashboard/components/JournalSection.tsx`:
  - Analog, Row-Map Zeile ~195–239.
- [ ] `src/app/dashboard/components/ProjekteSection.tsx`:
  - Analog, Zeile ~429–464. `archived`-Badge conditional in `badges`-Array.
- [ ] `src/app/dashboard/components/AlitSection.tsx`:
  - Analog, Zeile ~289–319.

### Phase 3 — Verifikation + Deploy
- [ ] `pnpm build` grün.
- [ ] `pnpm test` ≥245 grün.
- [ ] `pnpm audit --prod` clean.
- [ ] Grep-Check: pattern `flex items-center justify-between gap-3 p-3` nicht mehr in den 4 Section-Files.
- [ ] Visual-Smoke iPhone 14 Pro Max Emulation:
  - [ ] Agenda: Row zeigt DragHandle + truncated Text + 2 Badges + "…"-Button
  - [ ] "…"-Click öffnet "Aktionen"-Modal
  - [ ] "Bearbeiten" → Modal zu → Edit-Form offen
  - [ ] "Löschen" (rot) → Modal zu → DeleteConfirm offen
  - [ ] Journal / Projekte / Alit: gleiche Flows
- [ ] Visual-Check iPad Portrait (810×1080): volle horizontale Buttons, kein "…".
- [ ] Visual-Check Desktop (1280): Layout unverändert zu pre-Sprint.
- [ ] Spec-Status-Bump (v1 → v1-impl) committen → post-commit Sonnet-Evaluator.
- [ ] ggf. Fixes bis qa-report.md clean.
- [ ] Push → pre-push Sonnet-Gate grün.
- [ ] PR öffnen → Codex-Review (1-2 Runden max).
- [ ] Staging-Deploy verify: Huy iPhone Safari smoke-test.
- [ ] Merge auf main → Prod-Deploy verify.
- [ ] Wrap-up: Sprint B1 erledigt, Sprint B2 scope + updated memory.

## Notes

- **Shared Primitive reuses Sprint A Modal** — kein Neu-Build von Focus-Trap/Return/ESC.
- **Single-Modal-Stack-Invariant** (aus Sprint A `patterns/auth.md` / `admin-ui.md`): Action-Click schließt Menu-Modal BEVOR action.onClick. Verhindert stacked modals bei Delete-triggered DeleteConfirm.
- **Per-Row menuOpen State** — kein globaler Zustand. Jede ListRow-Instanz hat ihren eigenen. Nie >1 Menu offen in der Praxis.
- **Drag-Drop-Handler hängen am Row-CONTAINER** (Codex R1 #1 — korrigiert gegenüber v1): ListRow forwards `draggable`/`onDragStart/Enter/Over/End`/`rowId` als explizite Props an den Container-div. Section-Code bleibt unverändert.
- **KEIN Dirty-Guard auf Row-Actions** (Codex R1 #2): Current code hat `confirmDiscard` nur auf Tab-Switch + Logout. Row-Edit-Handlers sind plain setters. ListRow bleibt purer View-Layer.
- **Action-Ordering-Konvention**: primary first, destructive last. ListRow rendert in-order, sortiert nicht.
- **Badges-Slot opaque**: `ReactNode`, kein BadgeSpec-Type. Projekte's `archiviert`-Marker geht in `content`-Slot nicht `badges`.
- **Sprint B2 Follow-up-Scope dokumentiert** — SignupsSection Card-Layout, MediaSection 5-Button-Cluster, RichTextEditor-Toolbar, PaidHistoryModal responsive email, MediaPicker base grid-cols, MediaPicker Volle/Halbe-Breite-Buttons stacken.
- **Max 2 Codex-Runden.** Wenn nach R2 noch [Critical] offen → Sprint-Splitten (sehr unwahrscheinlich bei diesem Scope, B1 ist ausreichend fokussiert).
- **Patterns-Referenzen:** `patterns/admin-ui.md` (Modal-Reuse, Dirty-Guard-Integration), `patterns/tailwind.md` (responsive breakpoints, touch targets 44×44).
