# Sprint: Mobile Dashboard Sprint A — Foundations
<!-- Spec: tasks/spec.md -->
<!-- Started: 2026-04-18 -->
<!-- Status: Draft — awaiting approval + post-commit Sonnet-Evaluator -->

## Done-Kriterien
> Alle müssen PASS sein bevor der Sprint als fertig gilt.

- [ ] `pnpm build` grün, `pnpm test` 227/227 grün, `pnpm audit --prod` 0 HIGH/CRITICAL.
- [ ] Grep: `rg "(md|lg):" src/app/dashboard/ | wc -l` liefert >5 (baseline vor Sprint: ~0 Dashboard-Matches).
- [ ] Dashboard-Body respektiert `env(safe-area-inset-top)` + `env(safe-area-inset-bottom)` (visual-check via DevTools iPhone 14 Pro Max Emulation, Header nicht unter Notch).
- [ ] Tab-Nav: auf <768px wird ein Burger-Button statt voller Tab-Leiste gezeigt; Burger hat ≥44×44px Touch-Target; Klick öffnet vertikales Panel mit 6 Tab-Optionen (jeweils min-h 44px); Klick auf Tab schließt Panel + switched Tab; Backdrop-Click + ESC schließen Panel.
- [ ] Tab-Nav: auf ≥768px bleibt volle horizontale Tab-Leiste sichtbar (Aussehen pixel-identisch mit pre-Sprint-Desktop).
- [ ] Burger-Menu-Tab-Wechsel ruft `confirmDiscard` wenn dirty editor (Dirty-Guard bleibt intakt).
- [ ] `Modal.tsx`: `mx-2 md:mx-4`, Close-Button ≥44×44px (mit `aria-label="Schließen"`), `max-h: calc(90vh - env(safe-area-inset-bottom))`.
- [ ] `DragHandle.tsx`: Wrapping-Div `min-w-11 min-h-11 md:min-w-0 md:min-h-0` mit flex-center. Icon bleibt 16×16, Tap-Zone 44×44 auf Mobile.
- [ ] Login-Form: Inputs `text-base` explicit, Password-Toggle Touch-Target ≥44px, safe-area-top auf Container.
- [ ] Keine Regression im `Modal.test.tsx` (bestehende 12 Tests bleiben grün).
- [ ] Visual-Smoke auf iPhone-Emulation (430×932): Dashboard-Login → Burger öffnet → Tab wechseln (Editor-Offen triggered Dirty-Modal) → Modal öffnen (Delete-Confirm) → Close-Button treffbar. Keine horizontale Scrollbar, kein Content unter Notch/Home-Indicator.

## Tasks

### Phase 1 — Foundation Files
- [ ] `src/app/dashboard/layout.tsx`:
  - Body `style` um `paddingTop: "env(safe-area-inset-top)"`, `paddingBottom: "env(safe-area-inset-bottom)"` erweitern (inline-style reicht; Tailwind hat kein Arbitrary-Property-Support für `env()` out-of-box — inline style ist cleaner).
- [ ] `src/app/dashboard/components/Modal.tsx`:
  - Dialog-Container Klassen anpassen: `mx-2 md:mx-4 max-w-2xl` + max-h-Logik auf `calc(90vh - env(safe-area-inset-bottom))` via inline `style`.
  - Close-Button: `className="min-w-11 min-h-11 flex items-center justify-center text-2xl leading-none"`, `aria-label="Schließen"` falls nicht schon drin.
  - `Modal.test.tsx` durchlesen — Selektoren-Check ob refactor Tests bricht. Gegebenenfalls Selektor auf `aria-label` pinnen.
- [ ] `src/app/dashboard/components/DragHandle.tsx`:
  - Wrapping-Element bekommt Klassen `min-w-11 min-h-11 md:min-w-0 md:min-h-0 flex items-center justify-center`.
  - Verifizieren dass bestehende drag-drop-Handler (onPointerDown etc.) nicht von Wrapping-Element gestört werden.
- [ ] `src/app/dashboard/login/page.tsx`:
  - Inputs bekommen `text-base` className (oder falls schon vorhanden, belassen).
  - Password-Toggle-Button: `min-w-11 min-h-11 flex items-center justify-center` (statt `absolute right-2` minimal — behält right-Positioning).
  - Container: `paddingTop` um `env(safe-area-inset-top)` ergänzt (inline style im outer div).

### Phase 2 — Burger-Menu in page.tsx
- [ ] `src/app/dashboard/page.tsx`: neue inline sub-component `<MobileTabMenu>` über DashboardInner oder innerhalb des Render-Blocks definieren. Nimmt als props: `tabs`, `active`, `onSwitch(tab: Tab): void`. Renderer:
  - Burger-Button sichtbar `md:hidden` mit `aria-label="Menü öffnen"`, `aria-expanded`, ≥44×44px, Text `"☰ {tabLabel(active)}"`.
  - Volle Tab-Leiste `hidden md:flex` — unverändert vom aktuellen Layout.
  - Panel (State `isOpen`): Backdrop `fixed inset-0 bg-black/40 z-40`, Panel `fixed top-0 left-0 right-0 bg-white z-50 shadow-lg` mit 6 Tab-Options `button` jeweils `min-h-11 w-full text-left px-4 py-3 border-b`.
  - `onSwitch` wird `confirmDiscard(() => { setActive(tab); setOpen(false); })` gewrappt.
  - ESC-Key via `useEffect` + `window.addEventListener`.
  - Backdrop-Click schließt Panel (ohne Tab-Switch).
  - Aktiver Tab im Panel: `font-semibold underline` + disabled-Handler (no-op Klick).
- [ ] Integration in DashboardInner: statt bestehender `{tabs.map(...)}`-Block, `<MobileTabMenu tabs={tabs} active={active} onSwitch={goToTab} />` einsetzen. `goToTab` bleibt in DashboardInner-Scope, wrapt `confirmDiscard`.

### Phase 3 — Verifikation
- [ ] `pnpm build` — TypeScript clean, kein Lint-Error.
- [ ] `pnpm test` — 227/227 grün.
- [ ] `pnpm audit --prod` — 0 HIGH/CRITICAL.
- [ ] `pnpm dev` starten, in Chrome DevTools Mobile-Emulation (iPhone 14 Pro Max 430×932) den Smoke-Test durchgehen:
  - [ ] Login lädt, Inputs nicht zoom-on-focus
  - [ ] Dashboard lädt, Header nicht unter Notch
  - [ ] Burger-Button sichtbar, 44×44 Tap-Zone
  - [ ] Burger-Panel öffnet, ESC + Backdrop-Click schließen
  - [ ] Tab-Switch triggert Dirty-Guard wenn Editor offen
  - [ ] DragHandle auf Agenda-Item: Tap-Zone groß genug
  - [ ] Modal öffnen (Delete-Confirm z.B.), Close-Button treffbar
- [ ] Visual-Check auch bei 768px (iPad Portrait-ähnlich) und 1024px (Desktop) dass keine Regression.
- [ ] Spec-Status-Bump (v1 → v1-impl) committen → triggert post-commit Sonnet-Evaluator gegen Code.
- [ ] ggf. Fixes bis qa-report.md clean.
- [ ] Push → pre-push Sonnet-Gate grün.
- [ ] PR öffnen → Codex-Review (optional, kann bei UX-only-PR skipped werden wenn Sonnet clean).
- [ ] Staging-Deploy verify: DevTools mobile emulation auf `staging.alit.hihuydo.com`.
- [ ] Merge auf main → Prod-Deploy verify.
- [ ] Wrap-up: `memory/todo.md` Sprint B next-up, Sprint-A-Lessons.

## Notes

- **Sprint B (Follow-up-PR) nach Sprint A merged:**
  - SignupsSection Expand-Toggle pro Row (Mobile: Basic-Card, Tap für Details)
  - RichTextEditor Toolbar: Button-Sizing + Horizontal-Scroll
  - MediaSection + MediaPicker Grid responsive (2/3/4 cols)
  - PaidHistoryModal Row-Layout <375px
- **Patterns-Referenz:** `patterns/tailwind.md` iOS Safari quirks (auto-zoom, safe-area).
- **Patterns-Referenz:** `patterns/admin-ui.md` Modal Focus-Trap + Focus-Return (Sprint 7+8).
- **Modal.test.tsx** hat 12 bestehende Tests — Close-Button-Selektor-Change prüfen, sonst auf `aria-label` pinnen.
- **Dirty-Guard-Integration** für Burger-Menu ist kritisch. Sprint 7+8 Pattern einhalten: `confirmDiscard(action)` wrappt den State-Change.
- **Inline-Sub-Component** in page.tsx statt separate File — wenn >80 LOC, splitten.
- **Tailwind-Breakpoints** (`md:`, `lg:`) statt neue globals.css Media-Queries.
- **iPhone-Portrait nur** — Landscape-Layout ist Out-of-Scope dieser Sprint.
