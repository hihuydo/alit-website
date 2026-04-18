# Spec: Mobile Dashboard Sprint B1 — Row-Redesigns + ListRow Primitive
<!-- Created: 2026-04-18 -->
<!-- Author: Planner (Claude) -->
<!-- Status: v2-impl — Phases 1-2 complete. Build green, 248 tests (237 pre + 11 ListRow), audit 0 vulns. Grep: `flex items-center justify-between gap-3 p-3` nur noch in ListRow.tsx. Ready for Visual-Smoke + Staging. -->

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
       content: ReactNode;           // text-content-column (title + subline + inline markers like "archiviert")
       badges?: ReactNode;           // optional badge cluster — OPAQUE ReactNode (kein normalisiertes BadgeSpec[])
       actions: RowAction[];         // non-empty, primary first, destructive last (Konvention, siehe Architecture #6)

       // --- Drag-drop forwarding (Codex R1 #1): Handler hängen am Row-Container,
       // nicht am DragHandle. ListRow ist der Container, also forward-props pflichtbewusst. ---
       draggable?: boolean;
       onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void;
       onDragEnter?: (e: React.DragEvent<HTMLDivElement>) => void;
       onDragOver?: (e: React.DragEvent<HTMLDivElement>) => void;
       onDragEnd?: (e: React.DragEvent<HTMLDivElement>) => void;
       rowId?: string;               // rendered as `data-row-id` attribute, für section-level drag-tracking
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
   - Drag-Props werden 1:1 auf den Container-`<div>` gesetzt (`draggable={props.draggable}` etc.), `data-row-id={props.rowId}`. Section-Code behält existing HTML5-Drag-Semantik ohne Änderung der Handler-Logik.
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
   - `actions`-Prop: `[{label: "Bearbeiten", onClick: …}, {label: "Löschen", onClick: …, variant: "danger"}]` — **primary first, destructive last** (Konvention aller 4 Sections).
   - Drag-Props 1:1 an ListRow weitergereicht (`draggable={true}`, `onDragStart/Enter/Over/End`, `rowId={item.id}`).
   - **Kein Dirty-Guard-Wrapping um die Edit-Action** — Row-Edit ist plain setter wie im aktuellen Code (Codex R1 #2: Dirty-Guard ist restricted auf Tab-Switch/Logout in `page.tsx`, nicht auf Row-Actions). Keine Regression, keine neue Requirement hier.

4. **JournalSection.tsx Row-Refactor:**
   - Analog AgendaSection, Zeilen 195–239. `content`: date + title + author. `badges`: DE/FR. `actions`: `[Bearbeiten, Löschen]` (primary, destructive). Drag-Props 1:1.

5. **ProjekteSection.tsx Row-Refactor:**
   - Analog, Zeilen 429–464. `content`: title + kategorie + slug-display **+ inline `archiviert`-Marker** (bleibt inline beside title, **NICHT** in badges-Slot — Codex R1 #5: badges ist opaque ReactNode, archiviert ist Content-Inline-Semantik nicht Badge-Semantik). `badges`: DE/FR (nur 2). `actions`: `[Bearbeiten, Löschen]`.

6. **AlitSection.tsx Row-Refactor:**
   - Analog, Zeilen 289–319. `content`: title (optional) + preview-text-truncated. `badges`: DE/FR. `actions`: `[Bearbeiten, Löschen]`.

7. **Tests** (Codex R1 #4 + #3 — architektur-konsistent + order-pinned):
   - **Test-Architektur-Pinning:** Production-Code nutzt CSS-Dual-DOM (`hidden md:flex` für Desktop-Actions, `md:hidden` für Mobile-"…"-Button). **Tests verifizieren strukturell** (class-Presence, DOM-Existenz beider Branches) — NICHT Visual-Rendering, NICHT matchMedia-Mock für Layout-Switch. Analog zu `MobileTabMenu.test.tsx` (Sprint A): Burger-Button + Desktop-Tabs beide im DOM, Tailwind-Classes verifizieren. Pro-Branch-Behavior wird separat getestet:
     - Mobile-"…"-Button-Click → Modal öffnet (testet RowActionsMenu isoliert, Viewport egal)
     - Desktop-Action-Button-Click → action.onClick (testet inline-Button-Pfad isoliert)
   - `src/app/dashboard/components/ListRow.test.tsx` NEU, **≥10 Tests**:
     - Test 1: Render content, badges, dragHandle als ReactNode-Slots korrekt.
     - Test 2: Desktop-Cluster hat `hidden md:flex` className, alle actions als Buttons gerendert.
     - Test 3: Mobile-Cluster hat `md:hidden` className, "…"-Button gerendert.
     - Test 4: "…"-Button hat `aria-label="Aktionen"`, `aria-expanded`, `aria-haspopup="menu"`, `min-w-11 min-h-11`.
     - Test 5: "…"-Click öffnet Modal mit actions-Liste.
     - Test 6 (Kern — Codex R1 #3): **Spy-backed Close-before-Action order**: action-onClick wird erst nach `setMenuOpen(false)` gerufen. Harness: custom MockModal oder stateful wrapper der `open`-Transitions loggt + action.onClick ebenfalls loggt — Assert `call_order[0] === "menu-closed"` und `call_order[1] === "action-invoked"`.
     - Test 7: Desktop-Button-Click ruft direkt action.onClick (kein Menu-Roundtrip).
     - Test 8: `variant="danger"` → Button-Styling hat `text-red-600` class.
     - Test 9: `disabled: true` action → `<button disabled>` im Mobile-Modal und auch auf Desktop.
     - Test 10: Drag-Props-Forwarding — `draggable={true}` + `onDragStart={spy}` werden auf Container-div angewandt (verify via spy on DragEvent).
   - `RowActionsMenu` wird als Teil von `ListRow.test.tsx` getestet (keine separate Test-File).
   - Bestehende Tests (237 total, Modal 13 + MobileTabMenu 10 + restliche 214) bleiben grün.

8. **Build + Audit:**
   - `pnpm build` grün.
   - `pnpm test` grün (baseline 237 + ≥8 neu = ≥245).
   - `pnpm audit --prod` → 0 HIGH/CRITICAL.
   - Grep: `rg "flex items-center justify-between gap-3 p-3" src/app/dashboard/components/` — sollte danach nur noch in ListRow.tsx auftauchen (plus evtl. SignupsSection-internals, die in Sprint B2 refactored werden).

9. **Manueller Visual-Check iPhone 14 Pro Max (430×932):**
   - Agenda-Liste: Row zeigt DragHandle + Text (truncated ok) + Badges + "…"-Button. "…" öffnet Modal mit "Bearbeiten" + "Löschen". Beide Actions funktionieren.
   - Journal-/Projekte-/Alit-Listen: dito.
   - iPad Portrait (810×1080): volle horizontale Buttons sichtbar (Desktop-Verhalten), kein "…"-Button.
   - **Drag-Drop funktioniert** auf Desktop (1280) in allen 4 Sektionen — Row-Reorder per Mouse-Drag.

10. **Action-Ordering-Konvention** (Codex R1 #6):
    - In allen 4 Sections: `actions` wird in visueller Reihenfolge übergeben — **primary first** (z.B. "Bearbeiten"), **destructive last** (z.B. "Löschen" mit `variant: "danger"`).
    - ListRow rendert in-array-order, kein internes Sortieren. Konvention lebt im Section-Code.
    - Code-Review-Checkpoint: jeder neue Section-Row-Refactor prüft dass die Actions in dieser Reihenfolge sind.

11. **Responsive-Architektur-Pin** (Codex R1 #4):
    - Production: CSS-Dual-DOM — beide Action-Cluster (Desktop `hidden md:flex` + Mobile `md:hidden`) sind gleichzeitig im DOM, Tailwind-Breakpoints steuern Sichtbarkeit.
    - `RowActionsMenu` hat optional `matchMedia('(min-width: 768px)')` Listener (wie `MobileTabMenu` aus Sprint A), der den Menu-Modal schließt bei Viewport-Resize auf Desktop. Verhindert "stranded" offene Mobile-Menu wenn User Desktop-Viewport öffnet.

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
   - **Drag-drop sitzt am Row-Container, nicht am DragHandle** (Codex R1 #1 — verified via Audit aller 4 Sections). ListRow-Props exportieren: `draggable`, `onDragStart/Enter/Over/End`, `rowId`. Werden auf Container-`<div>` angewendet. Section-Code ändert nur das Markup (ListRow statt inline-div), Handler bleiben unverändert.
   - **KEIN Dirty-Guard-Wrapping auf Row-Actions** (Codex R1 #2): Current code hat dirty-guard nur auf Tab-Switch (page.tsx goToTab) + Logout (page.tsx handleLogout). Row-Edit-Handlers sind plain setters. Sprint B1 ändert das nicht. ListRow ist purer View-Layer, kein Handler-Wrapper.

7. **Responsive via Tailwind `hidden md:flex` / `flex md:hidden`** (Codex R1 #4):
   - Kein `useMediaQuery`-Hook für Layout-Switch.
   - Beide Layouts rendern im DOM, werden via CSS gated. Nachteil: doubled DOM pro Row. Akzeptabel — Row-Count <100 typisch.
   - Alternative: `matchMedia` in useState → conditional render. Abgelehnt wegen Hydration-Risk (SSR vs Client mismatch).
   - **Menu-Modal matchMedia-Listener** NUR für State-Cleanup wenn User während offenem Mobile-Menu zu Desktop resized — analog `MobileTabMenu` Sprint A. Nicht für Layout-Switch selbst.
   - **Tests sind strukturell**: verifizieren class-Presence auf beiden Action-Clustern, NICHT Visual-Rendering. JSDOM wendet Tailwind nicht an — matchMedia-Mock wäre Performance-Theatre ohne echten Layout-Effect.

8. **Badges-Slot bleibt opaque `ReactNode`** (Codex R1 #5):
   - NICHT normalisieren zu `BadgeSpec[]` oder strukturiertem Type.
   - Begründung: Section-Semantik ist heterogen — Projekte's `archiviert` ist inline-Text neben Title (Content-Semantik, nicht Badge). DE/FR completion-Badges sind visuelle Status-Icons. In-Slot-Mix akzeptieren.
   - Each section übergibt ihr eigenes JSX. ListRow rendert nur `{badges}` und wrappt in `shrink-0 flex gap-2`.

9. **Action-Ordering-Konvention, nicht Enforcement** (Codex R1 #6):
   - `actions` Array wird **in-order gerendert**: primary first, destructive last. ListRow sortiert NICHT.
   - Konvention lebt im Section-Code. Alle 4 aktuellen Sections folgen `[Bearbeiten, Löschen]`.
   - Code-Review-Checkpoint bei zukünftigen Section-Row-Refactors: Reihenfolge manuell prüfen.
   - Alternative abgelehnt: ListRow sortiert destructive nach hinten. Würde Section-Intent überschreiben und unvorhersehbar wirken bei drei-Actions-Rows.

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
- **drag-drop Integration mit ListRow** (Codex R1 #1 — addressed): ListRow exportiert explizite Drag-Props (`draggable`, `onDragStart/Enter/Over/End`, `rowId`). Kein Prop-Forwarding-Blob. Jeder Section-Code übergibt genau die Handler die heute am Row-Container hängen.
- **Action-Reihenfolge-Konvention** (Codex R1 #6 — addressed via Konvention, nicht Enforcement): Spec + todo dokumentieren "primary first, destructive last". Code-Review-Checkpoint bei jedem neuen Section-Row-Refactor.
- **Dirty-Guard-Drift vermeiden** (Codex R1 #2 — addressed): Spec explizit: Row-Edit-Handlers bleiben plain setters. ListRow ist purer View-Layer. Keine `confirmDiscard`-Wraps entstehen.
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

## Codex R1 Findings → Eingearbeitet (v2)

- ✅ **C1 [Contract] Drag-drop API pinned:** ListRowProps exportiert `draggable`, `onDragStart/Enter/Over/End`, `rowId`. Handler gehen auf Container-div (wie im current code). todo.md korrigiert.
- ✅ **C2 [Contract] Dirty-Guard Spec-Drift entfernt:** "Row-Edit triggert confirmDiscard wie bisher" ist raus. Current code hat KEIN dirty-guard-wrapping auf Row-Actions — confirmDiscard nur für Tab-Switch + Logout. Sprint B1 ändert das nicht.
- ✅ **K1 [Correctness] Close-before-Action test-pinned:** Test #6 im Plan ist explizit spy-backed order-assertion (call_order[0]==="menu-closed", [1]==="action-invoked"). Mechanisch verifizierbar.
- ✅ **K2 [Correctness] Responsive-Architektur pinned auf CSS-Dual-DOM:** matchMedia nur für State-Cleanup bei Resize, nicht für Layout-Switch. Tests sind strukturell (class-Presence), nicht viewport-simulating.
- ✅ **A1 [Architecture] Badges bleibt opaque ReactNode:** Spec stellt klar dass Projekte-`archiviert` in `content`-Slot geht, nicht `badges`. Kein normalisierter BadgeSpec-Type.
- ✅ **A2 [Architecture] Action-Ordering-Konvention** dokumentiert: primary first, destructive last. In-array-order Rendering ohne interne Sortierung.
- ⏭️ **N1 [Nice-to-have]** Danger-Variant-Styling-Enhancement (separator, stronger visual weight) → `memory/todo.md` für Sprint B2 oder danach.

**Ende Spec v2.** Awaiting user approval → Commit → post-commit Sonnet-Evaluator → Generator. Max 2 Codex-Spec-Runden erreicht nach diesem Commit.
