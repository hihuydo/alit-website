# Spec: Mobile Dashboard Sprint B2b — MediaSection + ActionsMenuButton
<!-- Created: 2026-04-18 -->
<!-- Author: Planner (Claude) -->
<!-- Status: v3-impl — Phase 2 complete. Build green, 291 tests (272 pre + 19 new: 11 ActionsMenuButton + 8 MediaSection), audit 0 vulns. Touch-tablet hover-gate + rename-focus-contract + ListRow-refactor + RowAction type-move live. Ready for Staging-Smoke + Codex PR-Review. -->

## Summary

Fokussierter Sprint auf die einzige Mobile-broken Dashboard-Komponente mit echten Correctness-Risiken: **MediaSection**. Grid- und List-View bekommen ein "…"-Menu statt hover-reveal bzw. always-visible 5-Button-Cluster, wobei der Desktop-Grid-hover-reveal auf `(hover: hover)` gegated wird, damit coarse-pointer-Tablets (iPad) die Aktionen nicht verlieren. List-View wird auf das B1-`ListRow`-Primitive umgestellt. Ein shared `ActionsMenuButton` wird aus ListRow's inline-`RowActionsMenu` extrahiert, und `RowAction` wandert in eine shared Type-Datei — beides verhindert Duplikation zwischen ListRow + MediaSection-Grid.

**Aus dem ursprünglichen B2b-Draft entfernt (→ Sprint B2c):** RichTextEditor-Toolbar-Refactor und MediaPicker-Grid-Breakpoints. Beide sind Low-Risk Visual-Polish, zusammen trivialer eigener Sprint.

**Keine Server-/Data-Layer-Änderungen** — pure UI-Sprint.

## Context

**Sprint-Reihe:**
- Sprint A (PR #73), B1 (PR #74), B2a (PR #75), Hotfix cookie (PR #76) bereits merged
- **B2b**: MediaSection + ActionsMenuButton — fokussierter Sprint mit echten Correctness-Risiken
- **B2c (zukünftig)**: RichTextEditor Toolbar + MediaPicker — Low-Risk Visual-Polish

**Warum dieser Split (Codex Spec-Review R1, SPLIT RECOMMENDED):**
- MediaSection hat zwei konkrete Correctness-Risiken (touch-tablet-hover-hole + rename-focus-race), die einen fokussierten Codex-PR-Review verdienen.
- RichTextEditor + MediaPicker sind unabhängig (kein shared code), kleiner Footprint, können separat schnell durch.
- ActionsMenuButton-extract blockt nur MediaSection, nicht die anderen beiden.

**Relevante Bausteine:**
- `ListRow.tsx` (B1) — hat inline `RowActionsMenu` mit close-before-action + matchMedia-close-on-resize. Wird zu `ActionsMenuButton` extrahiert.
- `Modal.tsx` (Sprint A) — mobile-first, 44×44 close, z-50, safe-area. Macht focus-trap und focus-return (`patterns/react.md`).
- `globals.css:3-5` — hat bereits `@media (hover: hover)` utility (wird in Grid-hover-reveal genutzt).
- **Pattern refs:** `patterns/react.md` (close-menu-before-action outcome-test, typed props), `patterns/nextjs.md` (CSS-Dual-DOM), `patterns/tailwind.md` (Touch-Targets, hover-affordances via `(hover: hover)`), `patterns/admin-ui.md` (ListRow-Reuse).

**Scope-Size:** Medium (4-5 Files). Ein Sprint, ein PR.

## Requirements

### Must Have (Sprint Contract)

1. **`RowAction` Type in eigene Datei:**
   - `src/app/dashboard/components/actions-menu-types.ts` als NEU mit:
     ```ts
     export interface RowAction {
       label: string;
       onClick: () => void;
       variant?: "default" | "danger";
       disabled?: boolean;
     }
     ```
   - `ListRow.tsx` importiert aus `./actions-menu-types` statt zu definieren; re-exportiert weiterhin `RowAction` für Rückwärtskompatibilität (4 already-merged ListRow-Adopter unverändert).
   - `ActionsMenuButton.tsx` importiert aus `./actions-menu-types`.
   - `MediaSection.tsx` importiert aus `./actions-menu-types` direkt.

2. **`ActionsMenuButton` extrahieren (NEU):**
   - `src/app/dashboard/components/ActionsMenuButton.tsx` als NEU.
   - API:
     ```ts
     interface ActionsMenuButtonProps {
       actions: RowAction[];
       triggerClassName?: string;   // APPENDED to base trigger classes (not replace). See contract below.
       triggerLabel?: string;       // aria-label on trigger button. Default "Aktionen".
       modalTitle?: string;         // Modal title. Default "Aktionen".
     }
     ```
   - **Trigger-Class Contract (normativ):**
     - **Base-Class** (immer applied, nie überschrieben): `min-w-11 min-h-11 flex items-center justify-center text-gray-500 hover:text-black text-xl leading-none rounded hover:bg-gray-50`
     - Base enthält **KEINE Visibility-Classes** (kein `md:hidden`, kein `hidden`, kein `hoverable:`) — Visibility wird vom Caller via `triggerClassName` gesteuert.
     - `triggerClassName` wird mit Leerzeichen ans Ende der base-class-string gehängt (Tailwind-merge nicht nötig, keine konkurrierenden Utilities in Base).
     - ListRow-Caller passt z.B. `triggerClassName="md:hidden"` für B1-Behavior-Preservation.
     - MediaSection-Grid-Caller passt z.B. `triggerClassName="md:hoverable:hidden absolute top-1 right-1 bg-white/80"` für komplementäre Visibility (siehe Must-Have 5).
   - Render: `<button className={`${BASE_CLASS} ${triggerClassName}`.trim()} ...>…</button>` + `<Modal>` mit vertikaler action-list.
   - Close-before-action (Pflicht, aus `patterns/react.md`): `setOpen(false)` → `action.onClick()`.
   - matchMedia-Listener schließt Menu bei Viewport ≥768px (SSR-safe mit `typeof window === "undefined"` Check).
   - `aria-label`, `aria-expanded={open}`, `aria-haspopup="menu"` auf dem Trigger.
   - Danger-variant: `text-red-600` auf Modal-action-button.
   - Disabled action: `<button disabled>` im Modal.
   - **Test:** Rendering mit `triggerClassName="X"` zeigt im DOM-Klassen-String sowohl BASE-Klassen ALS AUCH X enthalten (append-not-replace guarantee).

3. **`ListRow.tsx` interner Refactor:**
   - `RowActionsMenu`-inline-function entfernen, `<ActionsMenuButton>` importieren.
   - Die Trigger-Position (am Row-Ende inline) wird via `triggerClassName`-Default vom ListRow aus gesteuert.
   - ListRow externe Props + Tests bleiben unverändert; alle B1-ListRow-Tests müssen nach Refactor grün bleiben (drop-in).

4. **MediaSection Grid-View Desktop-hover-cluster — `(hover: hover)`-gated (Touch-Tablet-Fix):**
   - Aktuell: `absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity`.
   - Neu: der **gesamte** Desktop-hover-cluster wird auf `@media (hover: hover) and (pointer: fine)` gated. Realisierung via Tailwind v4 `hoverable:`-Variant (existiert in `globals.css:3-5`) ODER inline-Style-Block mit `@container`/`@media`. Decision: **Tailwind-Variant** (konsistent zum Rest).
   - Syntax: Hover-cluster wrapped in `<div className="hidden md:group-[.hoverable]:flex absolute top-1 right-1 gap-1 opacity-0 group-hover:opacity-100 transition-opacity">` oder equivalent — implementation-dependent. **Must-Have:** auf coarse-pointer-Tablets (iPad Portrait/Landscape ≥768px, ohne hover) ist der hover-cluster NICHT sichtbar und die Mobile-"…"-Button-Actions sind erreichbar.
   - **Test:** class-string-match für `(hover: hover)` / `hoverable:`-gate auf dem hover-cluster.

5. **MediaSection Grid-View Mobile "…"-Button:**
   - Pro Tile: `<ActionsMenuButton triggerClassName="md:hoverable:hidden absolute top-1 right-1 bg-white/80" actions={buildMediaActions(item)} />`.
   - **Exact gating class: `md:hoverable:hidden`** (normativ, keine equivalent-Varianten erlaubt):
     - `<md` (beliebige hover-capability) → `md:`-prefix nicht aktiv → class wirkt nicht → trigger **visible** ✓
     - `≥md` + `hoverable` (Desktop mit Mouse) → class aktiv → `hidden` → trigger **hidden** ✓ (Desktop-hover-cluster übernimmt)
     - `≥md` + `!hoverable` (iPad coarse-pointer) → `hoverable:`-prefix nicht aktiv → class wirkt nicht → trigger **visible** ✓ (Kern-Fix)
   - `hoverable:` ist Tailwind-v4-arbitrary-variant. Falls nicht native verfügbar, Generator fügt in `globals.css` hinzu:
     ```css
     @variant hoverable (@media (hover: hover) and (pointer: fine));
     ```
     (Check: `src/app/globals.css:3-5` hat bereits `@custom-variant hoverable`). Wenn ja — direkt nutzen; wenn nein — anlegen.
   - Actions (5): Link intern, Link extern, Download, Umbenennen, Löschen. Löschen hat `variant: "danger"` und ist last.
   - Download-Action-onClick: programmatic `<a>`-creation mit `download` attribute + click + cleanup (mimiced behavior von existing `<a href={downloadUrl} download>`).
   - **Test:** class-string-match für `md:hoverable:hidden` (exakter token, keine Approximation).

6. **MediaSection List-View auf ListRow:**
   - Jede List-Row via `<ListRow />`, keine `draggable`, keine `badges`, content-slot + actions.
   - `content`-Prop: inline JSX mit thumbnail + rename-input-or-filename + metadata — identisches DOM wie aktuell.
   - Actions: gleicher 5-Element-Array aus `buildMediaActions(item)` wie Grid-View (shared helper).
   - Dynamic labels für State-Feedback:
     - copy-Actions: `"Kopiert"` wenn `copied?.id === item.id && copied.kind === "internal"/"external"` sonst `"Link intern"` / `"Link extern"`
     - rename-Action: `"Speichert…"` bei `renameState.saving === true`, `"Wird bearbeitet…"` bei `renameState.id === item.id && !saving`, sonst `"Umbenennen"`. `disabled: renameState !== null && renameState.id !== item.id`.
   - **Desktop UX-Change (explicit approval):** bisher waren Actions `opacity-0 group-hover:opacity-100` (hover-reveal), nach Refactor sind sie always-visible (ListRow-Desktop-Cluster `hidden md:flex gap-2`). Das ist konsistent zum B1-Pattern der 4 anderen Sections (Agenda/Journal/Projekte/Alit). **User hat diesen Change explizit für B2b angenommen** (siehe Architecture Decision #3). Falls später zurückgerollt werden soll: ListRow bekommt ein `hoverRevealOnDesktop`-prop (Follow-up).

7. **Rename-Focus-Contract bei Mobile-Menu-triggered Rename:**
   - Wenn User auf Mobile "…"-Menu → "Umbenennen" klickt:
     - Modal schließt (close-before-action)
     - `startRename(item)` öffnet inline-input mit `autoFocus`
   - **Problem (Codex R1 Correctness):** Modal's focus-return logic (`Modal.tsx:40-83`) schickt focus zurück zum Trigger-Button nach close; der `autoFocus` auf dem neuen input konkurriert. In der Reihenfolge:
     1. Modal schließt, focus-return versucht zum "…"-Trigger-Button zurück
     2. Im gleichen Tick ruft `action.onClick()` → `startRename(item)` setzt renameState
     3. Re-render rendert `<input autoFocus>`
     4. autoFocus "gewinnt" weil es nach dem focus-return kommt
   - **Must-Have:** Test asserted dass nach Mobile-"Umbenennen"-Click der rename-`<input>` den activeElement-focus hat (nicht der "…"-Trigger).
   - **Fallback:** Falls autoFocus nicht reicht (race), `useEffect` im rename-state-change bump explicit `inputRef.current?.focus()` nach renderCommit. Spec lässt Implementer wählen — Test ist das Kriterium.

8. **Shared Helper `buildMediaActions(item)`:**
   - **Inside-Component Closure** (NICHT Pure Function) in `MediaSection.tsx`.
   - Definiert innerhalb der `MediaSection`-Component-function, schließt über component-state (`copied`, `renameState`) + handlers (`copyUrl`, `startRename`, `setDeleting`, Download-Helper).
   - Signatur: `const buildMediaActions = (item: MediaItem): RowAction[] => [...]`.
   - Returns 5-Element `RowAction[]` mit korrekten dynamic labels + disabled-flags.
   - Wird von **sowohl** Grid-"…"-Menu als auch List-ListRow-Actions aufgerufen — single source of truth, keine Duplikation zwischen Views.

9. **i18n erweitert:**
   - Neuer `dashboardStrings.mediaActions`-Block in `i18n.tsx` mit:
     - `linkInternal`, `linkExternal`, `download`, `rename`, `delete` (5 labels)
     - `copied`, `saving`, `editing` (3 dynamic-state-Varianten)
     - `menuLabel` ("Medien-Aktionen")

10. **Touch-Targets 44×44 auf Mobile:** Grid-Tile-"…"-Button, List-Row-"…"-Button (wird von ActionsMenuButton getragen).

11. **Tests:**
    - `ActionsMenuButton.test.tsx` create ≥5 Tests: trigger-aria (label+expanded+haspopup), click öffnet Modal mit N action-buttons, close-before-action (outcome: follow-up-modal-scenario statt order-spy), matchMedia-Listener-close, danger + disabled styling class-match.
    - `MediaSection.test.tsx` create ≥6 Tests: Grid-tile Dual-DOM Desktop-hover-cluster (`(hover: hover)`-class) + Mobile-"…"-Trigger beide im DOM, Grid-Mobile-Menu öffnet Modal mit 5 actions, List-View rendert mit `<ListRow>` (no more `.flex.items-center.gap-3.p-2.bg-white.border.rounded`), List-Row-Actions öffnen Modal auf Mobile, Rename-State in content-slot, Copy-State-Transition ("Link intern" → "Kopiert"), Rename-Focus-Contract (nach Menu-"Umbenennen"-Click: `document.activeElement` === rename-input).
    - `ListRow.test.tsx`: verify B1 tests unverändert grün. Wenn Tests auf interner `RowActionsMenu`-Struktur assertieren (unwahrscheinlich): nachziehen.

12. **Sprint Contract Pflicht:**
    - `pnpm build` grün
    - `pnpm test` ≥283 (272 baseline + ≥11 neu)
    - `pnpm audit --prod` 0 HIGH/CRITICAL
    - Sonnet pre-push CLEAN
    - Codex PR-Review keine in-scope Findings
    - Staging + Prod Deploy grün (nicht als mechanischer Done-Kriterion aufgelistet, sondern als Release-Gate — siehe B2a-Pattern)

### Nice to Have (Follow-up, NICHT dieser Sprint)

1. **Sprint B2c** — RichTextEditor Toolbar + MediaPicker — eigenständige Spec
2. RichTextEditor `role="toolbar"` + arrow-key-navigation (volle Editor-A11y, eigener Sprint)
3. MediaSection Grid-View Tile-Selection-Mode (Bulk-Delete auf Mobile) — analog zu B2a
4. `RowAction` Type-Union mit `href?: string` für Download-Links ohne onClick-anchor-hack
5. ListRow `hoverRevealOnDesktop?: boolean` prop — falls Desktop-hover-reveal explizit zurückgefordert wird

### Out of Scope

- RichTextEditor-Toolbar-Refactor (→ B2c)
- MediaPicker-Grid/Width-Buttons (→ B2c)
- Sprint C Cookie-Flip
- JWT_SECRET-Fail-Mode-Normalisierung
- MediaPicker Drag-Drop-Upload
- RichTextEditor Content-Editable Refactor (Lexical/ProseMirror)

## Technical Approach

### Files to Change

| File | Change Type | Description |
|------|-------------|-------------|
| `src/app/dashboard/components/actions-menu-types.ts` | Create | Shared `RowAction` type. |
| `src/app/dashboard/components/ActionsMenuButton.tsx` | Create | Extracted shared "…"-menu button + modal. |
| `src/app/dashboard/components/ListRow.tsx` | Modify | Internal refactor: inline RowActionsMenu → `<ActionsMenuButton>`. Import RowAction from `./actions-menu-types`, re-export. External API unchanged. |
| `src/app/dashboard/components/MediaSection.tsx` | Modify | `buildMediaActions()` helper, Grid-tile `(hover:hover)`-gated Desktop-cluster + Mobile-"…"-ActionsMenuButton, List-view Row via ListRow. |
| `src/app/dashboard/i18n.tsx` | Modify | +`mediaActions` block. |
| `src/app/dashboard/components/ActionsMenuButton.test.tsx` | Create | ≥5 tests. |
| `src/app/dashboard/components/MediaSection.test.tsx` | Create | ≥6 tests inkl. Rename-Focus-Contract. |
| `src/app/dashboard/components/ListRow.test.tsx` | Maybe modify | Only if internal RowActionsMenu assertions break. |

### Architecture Decisions

1. **`RowAction` Typ-Location:** eigene `actions-menu-types.ts`. Vorher in `ListRow.tsx`, was die Typ-Abhängigkeit über den high-level Consumer invertiert hätte (MediaSection → ListRow-via-re-export). Jetzt: `actions-menu-types.ts` ist die Basis, ListRow + ActionsMenuButton + MediaSection alle importieren direkt. Re-export aus ListRow bleibt als Rückwärtskompatibilität für die 4 B1-Adopter.

2. **`ActionsMenuButton` extrahieren (statt inline in ListRow lassen und duplizieren):**
   - Alternative verworfen: "Duplikate close-before-action + matchMedia-Logic" — zwei Code-Pfade für dieselbe Invariante, zukünftige Drift.
   - Alternative verworfen: "ListRow exports RowActionsMenu, MediaSection importiert" — komponenten-lokale View + global-reused wird awkward.
   - Gewählt: separate `ActionsMenuButton.tsx` mit `triggerClassName`-Prop für Position/Größe-Variation. Klein genug (~80 LOC) für einen File, reused an 3 Orten (ListRow-inline, Grid-tile-absolute, List-row-inline-via-ListRow).

3. **Grid-Tile `(hover: hover)`-Gating (Touch-Tablet-Fix):**
   - **Problem:** Aktuell ist Desktop-hover-cluster nur via `opacity-0 group-hover:opacity-100` sichtbar. iPad (`≥768px`, coarse-pointer) triggert `:hover` bei Scroll + Tap → actions sind effektiv unreachable.
   - **Lösung:** `(hover: hover) and (pointer: fine)`-Media-Query gated den Desktop-cluster. Ohne hover-capability wird der cluster `display: none`, und die Mobile-"…"-ActionsMenuButton bleibt sichtbar.
   - **Implementation:** Tailwind v4 erlaubt `@media (hover: hover)`-Variants via arbitrary-media-query syntax `[@media(hover:hover)]:flex`. Oder globals.css definiert eine `hoverable` utility + gate via `hoverable:flex`. Generator-Entscheidung, Test assertet das Verhalten (class-match auf ein valid-gating Pattern).
   - **Test:** Grid-Tile rendert mit beiden Varianten im DOM; hover-cluster hat hover-media-gate im className-String; "…"-Button hat komplementäres gate.

4. **Programmatic Download-Action (statt `<a>`):**
   - Existing: `<a href={downloadUrl(item)} download={item.filename}>`.
   - Nach RowAction-shape mit `onClick: () => void` brauchen wir programmatic:
     ```ts
     onClick: () => {
       const a = document.createElement("a");
       a.href = downloadUrl(item);
       a.download = item.filename;
       document.body.appendChild(a);
       a.click();
       document.body.removeChild(a);
     }
     ```
   - Gleiche User-facing Semantik (Browser triggert Download via `?download=1` + content-disposition). Test spy auf `document.createElement('a')` + assert `a.download === item.filename`.

5. **Rename-Focus-Race Fix:**
   - **Problem:** Modal.close → focus-return auf Trigger. startRename-Re-render → `<input autoFocus>`. Race-Fenster 1 tick.
   - **Lösung:** `<input autoFocus>` ist React's native autoFocus on mount. Standard-React-Verhalten: autoFocus fires during commit-phase, was NACH Modal.close (was handler-phase ist) passiert. Sollte eigentlich gewinnen. Falls nicht → explicit `inputRef.current?.focus()` in `useLayoutEffect` bei renameState-start.
   - **Test-Contract:** nach Menu-"Umbenennen"-click, `document.activeElement === renameInput`. Implementation-frei, Test ist das Gate.

6. **List-View Desktop UX-Change explicit:**
   - Bisher: List-row Actions sind `opacity-0 group-hover:opacity-100` (hover-reveal).
   - Nach ListRow-refactor: always-visible `hidden md:flex gap-2` (wie 4 B1-Sections).
   - **User hat dieses für B2b akzeptiert** (aus dieser Spec-Revision). Rollback-Pfad: ListRow gets `hoverRevealOnDesktop?: boolean` prop (Nice-to-Have 5).

7. **`buildMediaActions(item)`-Helper als Inside-Component-Closure:**
   - Definiert innerhalb der `MediaSection`-function-component:
     ```ts
     function MediaSection(...) {
       const [copied, ...] = useState(...);
       const [renameState, ...] = useState(...);
       const buildMediaActions = (item: MediaItem): RowAction[] => [...];
       // reused in grid + list render via buildMediaActions(item)
     }
     ```
   - Closure über state + handlers. **Nicht** pure/module-level — dynamic labels und disabled-flags hängen von per-item + global component state ab.
   - Beide Views mappen identisch — single source of truth, keine Duplikation.

### Dependencies

- Extern: keine neuen deps.
- Intern: Modal (Sprint A), ListRow (B1).
- Blocks nothing — B2c (RichTextEditor + MediaPicker) ist unabhängig und wartet nicht auf B2b.

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| iPad Portrait (768px, coarse-pointer, kein hover) | Desktop-hover-cluster = `display: none` via `(hover:hover)`-gate. Mobile-"…"-Button sichtbar → actions reachable. ✓ |
| iPad mit External-Mouse (hover + fine-pointer auf `≥768px`) | Desktop-hover-cluster aktiv (hover + fine). "…"-Button hidden. ✓ |
| Desktop hover mit Touch-Gerät connected (hybrid) | Primäre pointer-capability entscheidet via `pointer: fine`. Auf Desktop mit Touchscreen: `fine` (Mouse präsent). ✓ |
| Mobile Safari Grid-tile: `:hover` sticky nach tap (iOS bug) | `(hover: hover)`-gate verhindert dass der hover-cluster auf iOS je sichtbar wird — hover wird dort niemals true gemeldet. ✓ |
| Mobile Menu → "Umbenennen" click | Modal schließt, rename-inline-input im content-slot, `document.activeElement === renameInput` (per Must-Have 7). |
| Mobile Menu → Multiple rapid Umbenennen-clicks auf verschiedene Rows | Race-Guard `disabled: renameState !== null && renameState.id !== item.id` macht andere Actions disabled im Menu. |
| Rename-Save läuft, User öffnet erneut Menu auf derselben Row | rename-action label = "Speichert…", disabled. Keine concurrent rename-trigger. |
| Copy-URL Success → label flip "Kopiert" | copied-state wird per `setCopied({ id, kind })` gesetzt, label via dynamic-label-closure. Visible in Modal-action-button (falls noch offen) + in any re-render downstream. |
| Grid-Tile-"…"-Button Focus → Open Modal → Escape | Modal focus-return zum Trigger-Button (absolute top-right). Browser focus-outline visible. A11y-ok. |
| ActionsMenuButton-Trigger ist absolute-positioned in Grid-tile, parent unmounts (z.B. item delete) | Modal-focus-return guarded via `document.contains(previouslyFocused)` (existing Modal.tsx:78-81). ✓ |
| Screen-Reader Navigation | Dual-DOM: nur sichtbare Variante (via `display:none` von media-query) wird angesagt. ✓ |

## Risks

- **Risk:** Tailwind v4 `@media (hover: hover)`-Variant funktioniert nicht wie erwartet.
  **Mitigation:** Fallback via inline-CSS `@media` in globals.css (bereits exists) + utility class `hoverable:` customization. Generator testet `pnpm build` output für class-presence.
- **Risk:** Rename-Focus-Race: autoFocus gewinnt nicht immer gegen Modal-focus-return.
  **Mitigation:** Test-Contract ist explicit. Falls autoFocus unzuverlässig, Implementation nutzt `useLayoutEffect` + `inputRef.current?.focus()` nach renameState-change — Runtime-kontrolliertes timing.
- **Risk:** ListRow-Refactor bricht 4 B1-Section-Tests.
  **Mitigation:** ListRow externe Props unverändert. Tests sollten weiterhin funktionieren. Build + Test run vor Commit zeigt Regressions sofort.
- **Risk:** MediaSection List-View Desktop-UX-Change (hover-reveal → always-visible) wird als Regression wahrgenommen.
  **Mitigation:** Architecture Decision #6 + Nice-to-Have 5 als Rollback-Pfad. User hat es für B2b explicit akzeptiert.
- **Risk:** `RowAction` Type-Move bricht Import-Paths in bereits-merged Sections.
  **Mitigation:** Re-export aus ListRow.tsx bleibt, alle existing Imports arbeiten weiter. Nur ActionsMenuButton + MediaSection importieren direkt aus `actions-menu-types.ts`.
- **Risk:** `(hover: hover)` auf Mobile mit gemountetem External-Mouse meldet plötzlich hover=true und "…"-Button verschwindet.
  **Mitigation:** Das ist desired Verhalten — wenn fine-pointer verfügbar ist (Mouse), Desktop-Cluster ist bedienbar, "…"-Button ist redundant. Edge-case (Mobile + Bluetooth-Mouse) akzeptiert als "Desktop-Experience".

## Verifikations-Strategie (nach Implementation)

1. `pnpm test` grün (272 → ≥283)
2. `pnpm build` ohne TS-Errors
3. `pnpm audit --prod` 0 HIGH/CRITICAL
4. Dev-Server + DevTools iPhone SE (375px):
   - Medien-Tab Grid-View: "…"-Button oben-rechts auf jedem Tile, Click öffnet Modal mit 5 actions
   - Medien-Tab List-View: Jede Row via ListRow, "…"-Button rechts, Click → Modal. Rename öffnet inline-input.
5. Dev-Server + DevTools iPad Air Portrait (820×1180, coarse-pointer emulation):
   - Grid-Tile: Desktop-hover-cluster NICHT sichtbar (hover-gate blockt), "…"-Button sichtbar. ← Kern-Fix.
6. Desktop ≥1024px mit Maus:
   - Grid hover-reveal: unverändert funktionsfähig, "…"-Button hidden
   - List-View: actions always-visible (bewusst, UX-change dokumentiert)
7. Mobile-Safari Rename-flow:
   - User klickt "…" auf List-Row → Modal öffnet
   - User klickt "Umbenennen" → Modal schließt, rename-input hat focus (keyboard öffnet auf iOS)
   - Type new name, Enter → commit (existing flow)
8. Staging iPhone Safari echter Device: pull-to-refresh eingeloggt bleiben (B2a+Hotfix bereits live).
