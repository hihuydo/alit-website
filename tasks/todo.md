# Sprint: S2b — InstagramExportModal × LayoutEditor Integration
<!-- Spec: tasks/spec.md -->
<!-- Branch: feat/instagram-layout-overrides-s2b-modal-integration -->
<!-- Started: 2026-04-30 (S2a merged: PR #134) -->

## Sprint Contract (Done-Kriterien)

- [ ] **DK-1** Tab-Switch im Modal-Body: zwei Buttons "Vorschau" / "Layout anpassen", `mode: "preview" | "layout"` als Parent-State. Layout-Tab disabled wenn `locale === "both"` mit Tooltip.
- [ ] **DK-2** `mode` wird bei `open: false → true` Transition auf `"preview"` zurückgesetzt (no-sticky).
- [ ] **DK-3** `LayoutEditor` rendert nur wenn `mode === "layout"` UND `locale !== "both"`. Props verdrahtet (itemId, locale, imageCount, onDirtyChange, discardKey).
- [ ] **DK-4** Parent mirrort Editor-`isDirty` in `layoutEditorIsDirty: boolean` über `useCallback([])`-stable `onDirtyChange`.
- [ ] **DK-5** `discardKey: number` State (init 0). Inkrementiert nach Confirm-Discard-Accept.
- [ ] **DK-6** `confirmDialog` State + `ConfirmDiscardDialog`-Komponente inline (KEIN portal — vermeidet zwei `aria-modal=true`).
- [ ] **DK-7** Guarded set-handlers: `setMode`, `setLocale`, `setImageCount`, `onClose`. Wenn dirty → Confirm-Dialog mit closure-captured `pendingAction`.
- [ ] **DK-8** Special-case `guardedSetLocale("both")` während `mode === "layout"`: `pendingAction` batches `setMode("preview")` UND `setLocale("both")`.
- [ ] **DK-9** Modal-Cleanup-Effekt erweitert: bei open=false reset mode/confirmDialog/layoutEditorIsDirty.
- [ ] **DK-10** i18n-Strings unter `dashboardStrings.exportModal.*` (10 keys).
- [ ] **DK-11** Vitest-Integration-Tests in `InstagramExportModal.test.tsx` (NEU, 10 cases mit mocked LayoutEditor).
- [ ] **DK-12** 5 manuelle DK-X1..X5 Staging-Smokes vor prod-merge, User-signoff dokumentiert.

## Done-Definition

- [ ] Sprint Contract vollständig (12 DKs)
- [ ] Sonnet pre-push gate clean
- [ ] Codex PR-review APPROVED (max 3 rounds)
- [ ] Vitest 10 neue Tests + bestehende 961 alle grün
- [ ] **Manueller Staging-Smoke DK-X1..X5 durch User signed-off**
- [ ] Prod merge nach explizitem User-Go
- [ ] Prod deploy verified (CI grün, /api/health 200, Logs clean)

## Out of Scope (S2c+ falls überhaupt)

- Drag-and-drop Block-Reorder
- Per-Block Live-PNG-Preview-Cards
- Override-Audit-Log-Viewer
- Bulk „alle zurücksetzen"
- DE↔FR Override-Vererbung
- Custom-Block-Splitting (User splittet Absatz)
- Zwei LayoutEditor side-by-side für locale="both"
