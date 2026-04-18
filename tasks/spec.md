# Spec: Mobile Dashboard Sprint B1 — Row-Redesigns + ListRow Primitive
<!-- Created: 2026-04-18 -->
<!-- Author: Planner (Claude) -->
<!-- Status: Draft v1 — awaiting user approval before post-commit Sonnet-Evaluator -->

## Summary
Refactored die 4 Section-List-Rows (Agenda/Journal/Projekte/Alit) auf einen gemeinsamen `<ListRow>`-Primitive mit responsive Actions-Cluster. Auf `<md:768` werden die Row-Actions (Edit/Delete) in ein Dropdown-Menu eingeklappt (1 "…"-Button → Mobile-Modal mit Actions), auf `≥md` bleibt die bestehende horizontale Button-Zeile. Sprint B1 ist Foundation für Sprint B2 (SignupsSection-Card-Layout, MediaSection-List-Actions, RichTextEditor-Toolbar, PaidHistoryModal, MediaPicker-Base-Grid).

## Context

**Sprint A Post-Merge (PR #73):** Modal primitive mobile-first, DragHandle 44×44 auf <md, Layout safe-area-aware, MobileTabMenu für Tab-Navigation. User-reported bei Visual-Smoke: Section-Rows brechen auf 375px — Actions-Buttons clipped oder Text unreadable truncated wegen DragHandle-44px-Kombination.

**Audit-Resultate (Agent, 2026-04-18):**
- AgendaSection, JournalSection, ProjekteSection, AlitSection nutzen identische Row-Struktur: `flex items-center justify-between gap-3 p-3` mit (1) DragHandle (2) text-content (3) badges (4) action-buttons.
- Text-Column hat bereits `flex-1 min-w-0 truncate`. Action-Buttons `shrink-0` drängeln den Text auf <400px oder forcieren wrap-to-next-row.
- Shared Row-Pattern = offensichtlicher Extract-Candidate.

**User-Decisions (vor Spec):**
- Sprint-Split (B1 Row-Redesigns + Primitive) + Sprint B2 (Sections polish) ✓
- Actions-Strategie: Dropdown-Menu mit "…"-Trigger auf Mobile ✓
- SignupsSection Card-Layout → **Sprint B2**, nicht B1
- RichTextEditor-Toolbar Text-Labels behalten + Buttons auf 44×44 → **Sprint B2**
- Shared `ListRow`-Primitive extrahieren ✓

**Stack-Constraint:** Tailwind v4. Reuse `<Modal>` primitive für Dropdown-Menu (hat bereits Focus-Trap/Return/ESC/Safe-Area aus Sprint A). Kein neues NPM-Package.

## Requirements

### Must Have (Sprint Contract)

1. **`ListRow.tsx` als shared Primitive (NEU):**
   - `src/app/dashboard/components/ListRow.tsx`
   - Prop-Shape:
     ```ts
     interface ListRowProps {
       dragHandle?: ReactNode;       // optional, meistens <DragHandle />
       content: ReactNode;           // text-content-column (title + subline)
       badges?: ReactNode;           // optional badge cluster (z.B. DE/FR completion)
       actions: RowAction[];         // non-empty, normiert
     }
     interface RowAction {
       label: string;                // human-readable, used for aria-label + menu-label
       onClick: () => void;
       variant?: "default" | "danger";
       disabled?: boolean;
     }
     ```
   - Render-Verhalten:
     - `≥md` (768+): horizontale Buttons wie bisher. Layout: `flex items-center justify-between gap-3 p-3`. Badges + Actions side-by-side rechts.
     - `<md` (<768): Actions werden in ein `<RowActionsMenu>` zusammengelegt (siehe Item 2). Badges bleiben sichtbar. Text-Column bekommt mehr Raum zurück. Layout bleibt horizontal-flex.
   - Keine State-Verwaltung intern (außer menuOpen für RowActionsMenu, scoped pro ListRow-Instanz).
   - Generic-Type nicht nötig — actions sind untyped-by-callback (jeder Section hat ihre eigenen action-Fns).

2. **`RowActionsMenu.tsx` als NEU für Mobile:**
   - `src/app/dashboard/components/RowActionsMenu.tsx` ODER inline in `ListRow.tsx` wenn ≤40 LOC
   - Auf `<md`: rendert single "…"-Button (`min-w-11 min-h-11`, `aria-label="Aktionen"`, `aria-expanded`, `aria-haspopup="menu"`).
   - Click "…" → öffnet Modal (reuse `<Modal>` primitive aus Sprint A, `title="Aktionen"`) mit den actions vertikal als Buttons.
   - **Nur einer pro Zeit offen** — lokaler useState pro ListRow-Instanz, Modal setzt isOpen=false on Action-Click + onClose.
   - Action-Callback wird nach Modal-Close gerufen (Reihenfolge: close menu → action). Wenn action opens another modal (z.B. DeleteConfirm), kein Stacking — RowActionsMenu ist schon zu.
   - `variant="danger"` action bekommt rote Styling (`text-red-600`).
   - Disabled actions sind `disabled` im Modal-Button.
   - Desktop (`hidden md:flex`): rendert KEIN "…"-Button, actions erscheinen direkt als horizontale Buttons in der ListRow.

3. **AgendaSection.tsx Row-Refactor:**
   - Bestehendes Row-Markup (Zeilen 599–629) durch `<ListRow>` ersetzen.
   - `content`-Prop: `datum + zeit + title + ort` (wie bisher).
   - `badges`-Prop: 2 completion-Badges (DE/FR).
   - `actions`-Prop: `[{label: "Bearbeiten", onClick: …}, {label: "Löschen", onClick: …, variant: "danger"}]`.
   - Agenda-spezifische Logik (edit-form, delete-confirm) bleibt unverändert. Nur das Row-Layout zieht durch ListRow.

4. **JournalSection.tsx Row-Refactor:**
   - Analog AgendaSection, Zeilen 195–239. `content`: date + title + author. `badges`: DE/FR. `actions`: Bearbeiten/Löschen.

5. **ProjekteSection.tsx Row-Refactor:**
   - Analog, Zeilen 429–464. `content`: title + kategorie + slug-display. `badges`: DE/FR + archived-tag (wenn archived, dritter Badge). `actions`: Bearbeiten/Löschen.

6. **AlitSection.tsx Row-Refactor:**
   - Analog, Zeilen 289–319. `content`: title (optional) + preview-text-truncated. `badges`: DE/FR. `actions`: Bearbeiten/Löschen.

7. **Tests:**
   - `src/app/dashboard/components/ListRow.test.tsx` NEU:
     - Render: content, badges, actions rendered correctly.
     - Desktop (`≥md`): actions rendered as horizontal buttons, no "…"-Button visible.
     - Mobile (`<md`): only "…"-Button visible, actions in RowActionsMenu panel.
     - Click "…" → Modal opens with action list.
     - Click action in panel → onClick called, Modal closes.
     - `variant="danger"` styling applied.
     - `disabled` actions nicht clickable.
   - **Simulate viewport** via `window.matchMedia` mock (vitest) ODER explicit prop-override wenn matchMedia zu fragile.
   - Bestehende Tests (Modal, MobileTabMenu, 237 total) bleiben grün.
   - Min. 8 neue Tests.

8. **Build + Audit:**
   - `pnpm build` grün.
   - `pnpm test` grün (baseline 237 + ≥8 neu = ≥245).
   - `pnpm audit --prod` → 0 HIGH/CRITICAL.
   - Grep: `rg "flex items-center justify-between gap-3 p-3" src/app/dashboard/components/` — sollte danach nur noch in ListRow.tsx auftauchen (plus evtl. SignupsSection-internals, die in Sprint B2 refactored werden).

9. **Manueller Visual-Check iPhone 14 Pro Max (430×932):**
   - Agenda-Liste: Row zeigt DragHandle + Text (truncated ok) + Badges + "…"-Button. "…" öffnet Modal mit "Bearbeiten" + "Löschen". Beide Actions funktionieren.
   - Journal-/Projekte-/Alit-Listen: dito.
   - iPad Portrait (810×1080): volle horizontale Buttons sichtbar (Desktop-Verhalten), kein "…"-Button.
   - Dirty-Editor-Guard: Edit-Action auf einer Row triggert `confirmDiscard` wie bisher (keine Regression).

### Nice to Have (explicit follow-up, NOT this sprint → Sprint B2 / `memory/todo.md`)

1. **Sprint B2 (nächster PR):**
   - SignupsSection Card-Layout <768 (Table → Card-Stack, Basic-Info + Primary-Action visible, "Details"-Toggle)
   - RichTextEditor Toolbar Buttons 44×44 auf Mobile, Horizontal-Scroll
   - MediaSection List-View Action-Cluster (5 Buttons → "…"-Menu mit ListRow-Primitive reuse wo sinnvoll)
   - PaidHistoryModal responsive email-column (`max-w-[14rem]` → breakpoint-basiert)
   - MediaPicker base grid-cols `grid-cols-2 sm:grid-cols-3 md:grid-cols-4` (aktuell `grid-cols-3 sm:grid-cols-4`)
   - MediaPicker "Volle/Halbe Breite" Buttons stacken auf <400px
2. Playwright E2E-Smoke für ListRow responsive behavior.
3. Animation für "…"-Modal-Open/Close (slide-up from bottom für echtes bottom-sheet-Gefühl).
4. Long-Press gesture für Actions-Menu (alternative zu "…"-Button).
5. Keyboard-Shortcut (e.g. `E` für Edit, `D` für Delete) auf focused Row.

### Out of Scope

- Alle Sprint-B2-Items oben
- SignupsSection-Tabellen (keine Row-Struktur — Tabelle bleibt in B1 unangetastet)
- Badge-Styling-Refactor (bleibt section-lokal)
- `DragHandle`-Änderung (Sprint A ist final)
- Cross-Section Batch-Actions (z.B. multi-select in Agenda)
- Section-spezifische zusätzliche Actions (z.B. Publish/Archive — bleiben inline oder in die actions-Liste erweitern section-lokal)

## Technical Approach

### Files to Change

| File | Change Type | Description |
|------|-------------|-------------|
| `src/app/dashboard/components/ListRow.tsx` | **Create** | Shared Row-Primitive mit Props `dragHandle/content/badges/actions`. Rendert responsive: Desktop = inline Buttons, Mobile = "…"-Dropdown. |
| `src/app/dashboard/components/RowActionsMenu.tsx` | **Create** | Mobile-only "…"-Button + Modal-basiertes Action-Panel. Reuse `<Modal>` primitive. |
| `src/app/dashboard/components/ListRow.test.tsx` | **Create** | Tests für Render, Desktop-vs-Mobile-Layout, Action-Click-Flow, Variants, Disabled. |
| `src/app/dashboard/components/AgendaSection.tsx` | Modify | Row-Markup → `<ListRow>`. Alle existing handlers (onEdit/onDelete) bleiben. |
| `src/app/dashboard/components/JournalSection.tsx` | Modify | Analog. |
| `src/app/dashboard/components/ProjekteSection.tsx` | Modify | Analog + `archived`-Badge-Handling. |
| `src/app/dashboard/components/AlitSection.tsx` | Modify | Analog. |

### Architecture Decisions

1. **Shared `ListRow` über per-Section-Tweaks:**
   - Audit bestätigt identische Row-Struktur in 4 Sections → DRY ist natürlich, kein Over-Engineering.
   - Einmaliger Refactor-Aufwand, dann konsistente responsive Semantik.
   - Sprint B2 Items (SignupsSection, MediaSection-List) können optional ListRow auch nutzen wenn passend — nicht forced.

2. **Dropdown-Menu via Modal-Reuse, keine custom Floating-Library:**
   - `<Modal>` hat Focus-Trap/Return/ESC/Safe-Area gratis (Sprint A).
   - Nachteil: Zentrierung statt bottom-sheet. Akzeptabel für Sprint B1 — bottom-sheet-Animation ist Nice-to-Have.
   - Alternative abgelehnt: Tailwind arbitrary floating via `absolute top-10 right-0` — Click-outside + Focus-Trap + ESC müssten neu gebaut werden, Sprint B2-Size.

3. **Per-Row menuOpen State statt Global:**
   - Jede `<ListRow>` hat lokale `useState` für Menu-Open. Nicht global weil zwischen Rows nicht kommuniziert werden muss.
   - Trade-off: gleichzeitig können 2 Menus auf Desktop (…theoretisch) offen sein — in der Praxis klickst nur ein "…" pro Session, Modal-FocusTrap verhindert zweites Click sowieso.

4. **Action-Callback nach Modal-Close:**
   - Reihenfolge: User click action-button im Modal → setMenuOpen(false) → action.onClick() (sync).
   - Verhindert stacked modals falls action z.B. DeleteConfirm öffnet. Sprint-A-Pattern: immer nur ein aria-modal gleichzeitig.

5. **Generic-Type vs untyped actions:**
   - Gewählt: untyped (actions: `RowAction[]`, callback `onClick: () => void`).
   - Alternative abgelehnt: `ListRow<T>` mit `onAction: (type: T) => void` — nicht nötig, jede Section hat fix 2 actions (Bearbeiten/Löschen), Callbacks sind pre-bound.

6. **Keine Änderung am DragHandle-Rendering:**
   - DragHandle bleibt 44×44 auf Mobile (Sprint A).
   - In ListRow als `dragHandle`-Slot, Section übergibt weiterhin `<DragHandle />`.
   - Die drag-drop-Handler (onPointerDown etc.) sind nicht Teil des ListRow-Contracts; bleiben auf Section-Row-Container.
   - **Caveat:** ListRow muss als `onPointerDown`/`onDragStart`-pass-through funktionieren oder die Handler müssen auf dem DragHandle-Element selbst sitzen. → Implementation-detail: ListRow rendert dragHandle als React-Node, Section kann ref/handler auf den DragHandle selbst setzen.

7. **Responsive via Tailwind `hidden md:flex` / `flex md:hidden`:**
   - Kein `useMediaQuery`-Hook nötig.
   - Beide Layouts rendern im DOM, werden via CSS gated. Nachteil: doubled DOM pro Row. Akzeptabel — Row-Count <100 typisch.
   - Alternative: `matchMedia` in useState → conditional render. Mehr Code, Hydration-Risk (SSR vs Client mismatch wenn window.matchMedia nicht verfügbar).

### Dependencies

- **Keine neuen npm-Packages.**
- **Reuse:** `Modal.tsx` (Sprint A primitive), `DragHandle.tsx` (Sprint A).
- **Keine DB-/API-Änderungen.**
- **Keine Env-Vars.**

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| Leere `actions`-Array | Sollte nicht passieren (prop-type fordert non-empty). Falls trotzdem: Desktop rendert keine Buttons, Mobile kein "…". Section-tests validieren via TypeScript. |
| Section-Daten leer (0 rows) | `<ListRow>` wird gar nicht gerendert (Section handled das vor dem map). Kein Empty-State-Handling in ListRow. |
| User klickt "…"-Button auf Mobile, dann resize auf Desktop | Modal bleibt offen (zentriert). Auf Desktop ist das akzeptabel; hat keine Funktion (Actions sind direkt sichtbar), User kann Modal schließen via ×. Cleanup: matchMedia-Listener in RowActionsMenu (wie MobileTabMenu) der Modal schließt bei Transition zu ≥md — **Optional** für B1, Nice-to-Have. |
| Action löst Dirty-Modal aus (z.B. Edit bei unsaved changes) | RowActionsMenu-Modal schließt zuerst (via setMenuOpen(false)), dann action.onClick → Section-Logik (die evtl. confirmDiscard ruft). Single-modal-stack per Sprint-A-Pattern. |
| Action löst DeleteConfirm aus | Gleich wie oben — RowActionsMenu Modal zu, dann DeleteConfirm öffnet. Keine stacked modals. |
| Disabled Action | Render: `<button disabled>` im Modal. Klick triggert nichts. |
| Danger-Variant-Action | Styling: `text-red-600 hover:bg-red-50`. Kein zusätzliches Confirm in RowActionsMenu — Action selbst öffnet DeleteConfirm wenn nötig. |
| DragHandle-Event auf Row vs "…"-Button-Click | DragHandle ist sichtbar + tap-zone 44×44. "…"-Button rechts. In Row-Flexbox räumlich getrennt. Kein event-bubble-Konflikt erwartet (DragHandle-Events hängen an DragHandle selbst). |
| `active === "konto"` kein Section-Rendering | Konto-Section benutzt keine Row-Liste, also ListRow irrelevant. |
| Keyboard-Tab-Navigation | Desktop: DragHandle (non-interactive, aria-hidden) → Edit-button → Delete-button → nächste Row. Mobile: DragHandle → "…"-Button → nächste Row. Modal-Open: Tab-loop in actions. |

## Risks

- **ListRow-Abstraktion passt nicht zu allen 4 Sections:** wenn eine Section z.B. zusätzliches Inline-Element braucht (aktuelle Inline-States wie `renamingId` in MediaSection fallen NICHT in B1-Scope — nur Agenda/Journal/Projekte/Alit haben die Standard-Row-Struktur). Mitigation: Audit hat bestätigt dass alle 4 Standard-Pattern folgen. Sprint B1 beweist die Primitive; wenn in B2 eine andere Section-Struktur ListRow nicht fit, bleibt sie section-lokal.
- **drag-drop Integration mit ListRow:** existing Drag-and-Drop-Handler (onDragStart, onDragOver, onDrop) hängen an Row-Container. Wenn ListRow einen eigenen Container rendert, müssen die Handler per Prop-Forwarding weitergeleitet werden. Mitigation: Option in ListRow-Props für `containerProps?: HTMLAttributes<HTMLDivElement>` oder direkter `onDragStart`-Prop.
- **Action-Reihenfolge auf Mobile konsistent:** Aktuell haben alle 4 Sections Bearbeiten/Löschen in genau dieser Reihenfolge. Falls jemand Actions swappt (accidental), Reihenfolge-Inconsistenz. Mitigation: Tests prüfen action-label-Order via aria-label-Assertions.
- **Modal-Performance bei 50+ Rows:** 50 ListRow-Instanzen = 50 lokale useState. Re-render-Cost? Modal ist `open={false}` → null, no DOM. State-Count ist OK. Nicht getestet mit echten 50+ Rows.
- **Test-Setup für matchMedia-Mock:** Testing responsive mit `window.matchMedia` ist fragil. Mitigation: jsdom matchMedia mock ODER use-media-query-Hook ableiten, die sich testen lässt. Falls zu komplex: Test nur eine Branch (Desktop OR Mobile) per render, akzeptiere Visual-Smoke für die andere.
- **Sprint-A-Dirty-Guard-Regression:** Dirty-Editor-Guard bei Edit-Click ist Section-lokal (z.B. AgendaSection-Handler). Refactor darf den Flow nicht brechen. Mitigation: Section-Edit-Handler bleiben unverändert — ListRow ist nur View-Layer, kein Handler-Wrapper.

## Verification Strategy

### Pre-Merge (lokal)
1. `pnpm build` grün
2. `pnpm test` ≥245 (237 pre + ≥8 neu)
3. `pnpm audit --prod` 0 vulns
4. `rg "flex items-center justify-between gap-3 p-3" src/app/dashboard/components/AgendaSection.tsx src/app/dashboard/components/JournalSection.tsx src/app/dashboard/components/ProjekteSection.tsx src/app/dashboard/components/AlitSection.tsx` → 0 matches (alle auf ListRow migriert)
5. Chrome DevTools iPhone 14 Pro Max (430×932):
   - Agenda: DragHandle visible → Text truncated but readable → 2 Badges visible → "…"-Button sichtbar (nicht 2 full-width Buttons)
   - "…"-Click öffnet Modal "Aktionen" mit "Bearbeiten" + "Löschen"
   - "Bearbeiten" → Modal zu → Edit-Form öffnet
   - "Löschen" (variant=danger, rot) → Modal zu → DeleteConfirm öffnet
   - Analog für Journal / Projekte / Alit
6. iPad Portrait (810×1080): volle horizontale Buttons sichtbar, kein "…" (md-Breakpoint).
7. Desktop (1024+): keine Regression gegenüber pre-Sprint-Look.

### Staging-Deploy
1. CI grün, docker logs clean.
2. Visual-Smoke auf staging.alit.hihuydo.com per iPhone Safari (real device wenn möglich) oder DevTools-Emulation.

### Post-Merge auf Prod
1. CI deploy.yml grün.
2. Prod-Dashboard auf iPhone → Agenda + Projekte + Journal + Alit Rows getestet.
3. `docker logs` clean.

## Open Questions

- Keine — User-Decisions vor Spec vollständig, Audit-Resultate verwertet, Scope klar.

---

**Ende Spec v1.** Awaiting user approval → Commit → post-commit Sonnet-Evaluator → Generator.
