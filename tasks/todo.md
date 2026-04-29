# Sprint: S2a — Standalone LayoutEditor Component
<!-- Spec: tasks/spec.md -->
<!-- Branch: feat/instagram-layout-overrides-s2-modal -->
<!-- Started: 2026-04-29 (split from monolithic S2 after R2 NEEDS WORK) -->

## Sprint Contract (Done-Kriterien)

- [ ] **DK-1** Pure helpers `moveBlockToPrevSlide`, `moveBlockToNextSlide`, `splitSlideHere`, `canMovePrev`, `canMoveNext`, `canSplit`, `validateSlideCount` in `src/lib/layout-editor-state.ts`. Empty slides werden helper-internal gefiltert.
- [ ] **DK-2** `EditorSlide` type in `src/lib/layout-editor-types.ts` (cross-import-safe).
- [ ] **DK-3** `LayoutEditor.tsx` mit props `itemId`, `locale: "de"|"fr"`, `imageCount`, optional `onDirtyChange?` + `discardKey?`.
- [ ] **DK-4** GET on mount + `(itemId, locale, imageCount, refetchKey)`-change via `dashboardFetch`. State cleared vor jedem fetch. Cancelled-flag gegen race.
- [ ] **DK-5** Block-Card-Liste mit Move-Buttons (`← Vorherige Slide`, `Nächste Slide →`, `Neue Slide ab hier`). Disabled-state via `can*`-helpers.
- [ ] **DK-6** Dirty-detect via `stableStringify`-Snapshot-Diff mit `useMemo`. `useEffect`-broadcast via `onDirtyChange` falls prop gesetzt.
- [ ] **DK-7** `discardKey`-effect: bei prop-change (außer initial 0) `editedSlides ← serverState.initialSlides`, kein refetch.
- [ ] **DK-8** Save (PUT) mit Error-Handling für 200 (refetchKey++), 409 (`content_changed`), 412 (`layout_modified`), 400-Familie (`too_many_slides_for_grid`/`too_many_slides`/`empty_layout`), 422-Familie (`incomplete_layout`/`unknown_block`/`duplicate_block`). Pre-PUT `validateSlideCount`.
- [ ] **DK-9** Reset (DELETE) mit 204 (refetchKey++) und non-204 (`delete_failed` banner).
- [ ] **DK-10** Stale-Banner mit Reset-Action wenn `mode: "stale"`. Save disabled.
- [ ] **DK-11** Orphan-Banner wenn `warnings: ["orphan_image_count"]`. Reset nur wenn `layoutVersion !== null`.
- [ ] **DK-12** Tests ~17 (LayoutEditor.test.tsx ~11 + layout-editor-state.test.ts ~6). vi.doMock für dashboardFetch (S1a/S1b convention).

## Done-Definition

- [ ] Sprint Contract vollständig (12 DKs)
- [ ] Sonnet pre-push gate clean
- [ ] Codex PR-review APPROVED (max 3 rounds)
- [ ] **KEIN manueller smoke** (component nicht UI-erreichbar in S2a — smoke kommt in S2b)
- [ ] Prod merge nach explizitem User-Go
- [ ] Prod deploy verified (CI grün, /api/health 200, Logs clean)

## Out of Scope für S2a → S2b

- Tab-Switch im InstagramExportModal (`mode: "preview" | "layout"`)
- Confirm-Dialog für Discard
- Guarded set-handlers für mode/locale/imageCount/onClose
- Component-Interface-Verdrahtung (`onDirtyChange`-stabilization, `discardKey`-incrementing)
- locale="both"-Handling
- `open=false`-Cleanup
- Manueller Staging-Smoke (DK-X1..X5)

## Out of Scope für die ganze Linie (S3+ falls überhaupt)

- Drag-and-drop Block-Reorder
- Per-Block Live-PNG-Preview-Cards
- Override-Audit-Log-Viewer
- Bulk „alle zurücksetzen"
- DE↔FR Override-Vererbung
- Custom-Block-Splitting (User splittet Absatz)
