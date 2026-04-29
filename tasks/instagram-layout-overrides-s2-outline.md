# Outline: S2 — Layout-Overrides Modal UI (LayoutEditor + Dirty-Detect + Smoke)
<!-- Created: 2026-04-29 -->
<!-- Status: Outline (volle Spec wird geschrieben wenn S1 merged) -->
<!-- Branch: feat/instagram-layout-overrides-modal -->
<!-- Depends on: S1 merged (Backend live) -->
<!-- Source: tasks/instagram-layout-overrides-spec-v3-reference.md -->

## Summary

Modal UI für Layout-Overrides: Tab-Switch `Vorschau | Layout anpassen`, LayoutEditor mit per-Block-Buttons, snapshot-diff dirty-detect, in-Modal-Confirm-Dialog (NICHT `window.confirm`), refetchKey re-trigger pattern für Reset, guarded set-handlers für Tab/Locale/imageCount.

## Scope (vorläufig)

- **Tab-Switch** in `InstagramExportModal.tsx`: `mode: "preview" | "layout"`. Tab-disabled wenn alle Body-Blocks IDs haben (DK-3 Backfill nicht erfolgt).
- **LayoutEditor Component** (neu): zeigt Slides als Block-Card-Listen mit Buttons:
  - `← Vorherige Slide`
  - `Nächste Slide →`
  - `Neue Slide ab hier`
- **State-Management**:
  - `editedSlides`, `initialSnapshot`, `layoutVersion`, `layoutContentHash`, `layoutLoadError`, `refetchKey`, `confirmDiscardOpen`
  - `useEffect([mode, item?.id, locale, imageCount, refetchKey])` GET on tab-open via **`dashboardFetch`** (NICHT raw `fetch` — v3 NEW FAIL #M4)
  - **State-Clear** bei item/locale/imageCount-Wechsel (v3 NEW FAIL #M4)
- **Dirty-Detect via Snapshot-Diff** (NICHT touched-flag — v3 NEW FAIL #M5/M6): `isDirty = stableStringify(editedSlides) !== initialSnapshot`. Reverts-to-original sind NICHT dirty.
- **In-Modal-Confirm-Dialog** (NICHT `window.confirm` — v3 NEW FAIL #M5/M6 + M2): 
  - Eigenes alertdialog-Overlay mit `position: relative` parent + `disableClose` auf outer Modal während confirm + Escape-key handler scoped
  - **A11y-Decision** (v3 NEW FAIL #M2): Portal-rendered second Modal (separate z-layer mit own focus-trap) ODER inline overlay mit korrekter focus-trap-override
- **Guarded Set-Handlers** (v3 NEW FAIL #M8):
  - `guardedSetMode`, `guardedSetImageCount`, `guardedSetLocale` mit dirty-confirm
- **Reset re-trigger** (v3 NEW FAIL #M7): `refetchKey` increment statt `setMode/setMode` toggle (React batched)
- **Save / Reset / Stale handling**:
  - Save 412 → "Layout wurde von anderem Admin geändert"
  - Save 409 → "Inhalt hat sich geändert"
  - Stale-Banner mit "Auto-Layout zurücksetzen" Action (DELETE)
- **Locale = "both" Behavior** (v3 NEW FAIL #M6): Layout-tab disabled wenn `locale === "both"` mit Tooltip "Layout-Anpassung ist pro Sprache; bitte DE oder FR wählen"
- **Content-Type Header** (v3 NEW FAIL #M3): PUT calls bekommen `headers: {"Content-Type": "application/json"}`
- **`layoutTabAvailable` regex** (v3 NEW FAIL #M8): nutzt `readBidOrGenerate` regex `/^b[0-9a-z]+-[0-9a-z]+$/` für Konsistenz mit S0 Layer 1

## Tests (vorläufig ~25)

- Tab-Switch + GET via dashboardFetch + error-state
- 3 Block-Move Operations
- Save (200/409/412) → cacheBust + mode-switch
- Reset → DELETE + refetchKey re-trigger (regression-test for setMode-batching)
- Stale-Banner display + reset-action
- Snapshot-diff dirty-detect: revert-to-original NICHT dirty
- In-Modal-Confirm: Tab-switch / Modal-Close / imageCount-Change / Locale-Change Triggers
- Tab-Available wenn IDs vorhanden, disabled für `locale === "both"` und für Backfill-pending Items

## Manueller Smoke (Staging)

- **DK-X1**: Override speichern + Reload → Layout persistiert, mode="manual" sichtbar
- **DK-X2**: Body-Edit nach Override → Modal zeigt Stale-Banner
- **DK-X3**: Reset auf Auto → DELETE fired, JSONB-key entfernt
- **DK-X4**: Grid-Pfad mit `imageCount=2` + Override → Grid bleibt Slide 1, Override wirkt nur auf Slides 2+
- **DK-X5**: Multi-Admin race: 2 Browser-Sessions öffnen Layout-Tab, A speichert, B speichert → B sieht 412 Error-Banner

## Risk Highlights

- A11y für nested Modals — Portal vs inline-overlay-Entscheidung in voller Spec
- Test-Fragility: jsdom + dashboardFetch mocking + dirty-state-Transitionen
- Multi-Admin-Race UX: Welche Recovery-Option bietet das Modal nach 412? (Reload? Take-over?)

## Out of Scope (Follow-ups → memory/todo.md)

- Drag-and-drop block reordering (v2 feature)
- Per-block live-Preview-PNG-Cards
- Override-Audit-Log-Viewer (Audit-Entries werden geschrieben aber kein UI-Reader)
- Per-imageCount orphan-cleanup affordance
- Bulk-Operation "alle Einträge zurücksetzen"
- DE↔FR Override-Vererbung
- Custom-Block-Splitting (User splittet Absatz an gewünschter Stelle)

## Notes

- Volle Detail-Spec wird via Planner geschrieben sobald S1 merged ist
- Source-Material: tasks/instagram-layout-overrides-spec-v3-reference.md (besonders §Modal Layout-Mode)
- A11y-Pattern für In-Modal-Confirm muss in voller Spec konkret entschieden werden (Portal vs inline)
- Multi-Admin-Race UX braucht voll-spec-Decision: Reload-only oder Force-take-over-option
