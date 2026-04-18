# Sprint: Mobile Dashboard Sprint B2b — MediaSection + ActionsMenuButton
<!-- Spec: tasks/spec.md (v2) -->
<!-- Started: 2026-04-18 -->
<!-- Status: Draft v3 — Codex R2 addressed (3 findings). Max 2 Codex-Spec-Runden erreicht. Ready für Implementation nach User-Approval. -->

## Done-Kriterien

- [ ] `pnpm build` passes without TypeScript errors
- [ ] `pnpm test` ≥283 passing (272 baseline + ≥11 neu)
- [ ] `pnpm audit --prod` 0 HIGH/CRITICAL
- [ ] `src/app/dashboard/components/actions-menu-types.ts` existiert mit exported `RowAction` interface
- [ ] `src/app/dashboard/components/ActionsMenuButton.tsx` existiert mit API {actions, triggerClassName?, triggerLabel?, modalTitle?}
- [ ] ActionsMenuButton-Trigger hat `aria-label`, `aria-expanded={open}`, `aria-haspopup="menu"`
- [ ] ActionsMenuButton: close-before-action verifiziert via follow-up-modal-scenario-test (patterns/react.md)
- [ ] ActionsMenuButton: matchMedia-Listener schließt Menu bei viewport ≥768px (unit test)
- [ ] `ListRow.tsx` importiert `RowAction` aus `./actions-menu-types` und re-exportiert (Rückwärtskompatibilität für 4 B1-Adopter)
- [ ] `ListRow.tsx` nutzt intern `<ActionsMenuButton>` — externe Props unverändert, alle B1-ListRow-Tests grün
- [ ] MediaSection: `buildMediaActions(item)` returns 5-Element `RowAction[]` (Link intern, Link extern, Download, Umbenennen, Löschen — Löschen variant="danger" last)
- [ ] MediaSection Grid-Tile: Desktop-hover-cluster gegated auf `hoverable:` variant (match `@media (hover: hover) and (pointer: fine)`)
- [ ] MediaSection Grid-Tile: Mobile-"…"-Button hat exakt `md:hoverable:hidden` class-token + `absolute top-1 right-1` (komplementäres gating, class-match normativ)
- [ ] `ActionsMenuButton` Base-Classes enthalten KEINE Visibility-Token (`hidden`/`md:hidden`/`hoverable:`) — Test assertet Base + triggerClassName beide im DOM-String (append-not-replace)
- [ ] MediaSection Grid-Tile: click auf "…" öffnet Modal mit exakt 5 action-buttons (class-match count)
- [ ] MediaSection List-View: jede Row via `<ListRow>` (grep-check: keine `.flex.items-center.gap-3.p-2.bg-white.border.rounded` mehr)
- [ ] MediaSection List-Row Rename-State: inline `<input>` erscheint im ListRow content-slot bei `renameState?.id === item.id`
- [ ] MediaSection List-Row Copy-State: label "Kopiert" ersetzt "Link intern"/"Link extern" nach copyUrl-Aufruf
- [ ] MediaSection Download-Action onClick triggert programmatic `<a>`-element mit `download` attribute === `item.filename` (spy on `document.createElement('a')`)
- [ ] Rename-Focus-Contract: nach Mobile-Menu-"Umbenennen"-click, `document.activeElement === rename-input` (explicit focus-handoff test)
- [ ] Neuer `dashboardStrings.mediaActions`-Block mit 5 labels + 3 dynamic-state-Varianten + `menuLabel`
- [ ] 44×44 Touch-Targets auf Grid-Tile-"…"-Button und List-Row-"…"-Button (ActionsMenuButton-trigger-default + triggerClassName-Override)
- [ ] Sonnet pre-push Gate: keine `[Critical]` in `tasks/review.md`
- [ ] Codex PR-Review: keine in-scope Findings (Contract/Correctness/Security)
- [ ] Staging + Production Deploy grün (release gates, siehe B2a-Pattern — nicht als separates Test-Kriterium)

## Tasks

### Phase 1 — Spec-Review
- [x] Spec v1 (Draft mit RichTextEditor + MediaPicker inkludiert)
- [x] `codex-spec-evaluieren` R1 — SPLIT RECOMMENDED + 8 Findings
- [x] Spec v2 — auf MediaSection + ActionsMenuButton scoped, touch-tablet + rename-focus + List-UX-explicit eingebaut
- [x] `codex-spec-evaluieren` R2 — 3 findings (ActionsMenuButton append-not-replace, md:hoverable:hidden exact, buildMediaActions closure-not-pure)
- [x] Spec v3 — alle 3 R2-findings addressed (max 2 Runden erreicht)
- [ ] User-Approval für v3 → Phase 2 startet

### Phase 2 — Implementation

#### 2a. Types + Primitive
- [ ] `actions-menu-types.ts` create mit `RowAction` interface
- [ ] `ActionsMenuButton.tsx` create: trigger-button + Modal + state + matchMedia + close-before-action
- [ ] `ActionsMenuButton.test.tsx` create (≥5 tests: aria, open+close, close-before-action outcome, matchMedia-resize-close, danger/disabled class-match)

#### 2b. ListRow Refactor
- [ ] `ListRow.tsx`: import RowAction aus `./actions-menu-types`, re-export
- [ ] `ListRow.tsx`: inline `RowActionsMenu`-function entfernen, `<ActionsMenuButton>` import + use
- [ ] `ListRow.test.tsx` verify grün; nachziehen nur falls interne Assertions brechen

#### 2c. MediaSection
- [ ] `buildMediaActions(item)` helper innerhalb MediaSection (closure über state)
- [ ] Grid-Tile: existing hover-cluster wrappen in `(hover: hover)`-gate, add `<ActionsMenuButton>` komplementär gegated mit `absolute top-1 right-1 ...`
- [ ] Download-Action onClick: programmatic a.click pattern
- [ ] List-Row: ersetze `<div ...>` durch `<ListRow content=... actions={buildMediaActions(item)} />`
- [ ] Content-slot: thumbnail + rename-input-or-filename + metadata (unchanged HTML)
- [ ] `MediaSection.test.tsx` create (≥6 tests: Grid-Dual-DOM, Grid-Mobile-Menu-opens, List-via-ListRow, List-Rename-state, List-Copy-state-transition, Rename-Focus-Contract)

#### 2d. i18n
- [ ] `dashboardStrings.mediaActions` block mit 5 labels + 3 state-Varianten + menuLabel
- [ ] MediaSection konsumiert zentral

### Phase 3 — Verifikation + Merge
- [ ] `pnpm build` + `pnpm test` + `pnpm audit --prod` lokal grün
- [ ] Dev-Server iPhone-SE Smoke: Grid-"…" + List-"…" + Rename-flow
- [ ] Dev-Server iPad-Air Portrait (coarse-pointer): Grid-"…" sichtbar, hover-cluster NICHT sichtbar (Kern-Fix)
- [ ] Desktop 1024+: Grid hover-reveal unverändert, List actions always-visible (bewusst)
- [ ] Push → Staging-Deploy verifizieren
- [ ] PR → Codex-Review autonom triagen (Contract/Correctness → fix, Nice-to-have → memory/todo.md)
- [ ] Merge → Prod verifizieren

## Notes

- **Scope angepasst nach Codex R1 SPLIT RECOMMENDED** (Spec v2). RichTextEditor + MediaPicker sind jetzt B2c (future).
- **Pattern refs:**
  - `patterns/react.md` — close-menu-before-action outcome-test + primitive typed-props
  - `patterns/nextjs.md` — CSS-Dual-DOM
  - `patterns/tailwind.md` — Touch-Targets 44×44, hover affordances via `(hover: hover)` (existing pattern)
  - `patterns/admin-ui.md` — ListRow-Reuse
- **Kern-Correctness-Gates** (Codex-R1-highlighted):
  1. Touch-Tablet-hover-hole fixed via `(hover: hover)`-gate
  2. Rename-Focus-Contract explicit tested
  3. List Desktop-UX-change explicit user-accepted (Architecture Decision 6 + Nice-to-Have 5 rollback)
- **RowAction-type-move** fixt die Architecture-Dependency-Inversion (consumer-owned type → shared type file).
- **Scope-Größe:** Medium (4 Files geändert + 3 neue + 1 Type-File). 1 PR.
- **Nach Merge:** Sprint B2c als neuer kleiner Sprint (RichTextEditor + MediaPicker) planen — Low-Risk Visual-Polish.
