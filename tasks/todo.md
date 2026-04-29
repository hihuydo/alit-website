# Sprint: S2 — Instagram Layout-Overrides Modal UI
<!-- Spec: tasks/spec.md -->
<!-- Branch: feat/instagram-layout-overrides-s2-modal -->
<!-- Started: 2026-04-29 -->

## Sprint Contract (Done-Kriterien)

- [ ] **DK-1** Tab-Switch im `InstagramExportModal`: `mode: "preview" | "layout"`. Layout-Tab disabled wenn `locale === "both"` oder GET liefert keine Block-IDs.
- [ ] **DK-2** Neue Komponente `LayoutEditor.tsx` rendert Slides als Block-Card-Listen mit `← Vorherige Slide` / `Nächste Slide →` / `Neue Slide ab hier` Buttons.
- [ ] **DK-3** GET on tab-open via `dashboardFetch`; state cleared + reloaded auf `(item.id, locale, imageCount, refetchKey)`-Wechsel. Kein raw `fetch`.
- [ ] **DK-4** Dirty-detect via `stableStringify(editedSlides) !== initialSnapshot`. Revert-to-original ist NICHT dirty.
- [ ] **DK-5** In-Modal-Confirm-Dialog für „Ungespeicherte Änderungen verwerfen?". Inline-overlay (kein Portal), `disableClose=true` auf outer Modal während Confirm-Open.
- [ ] **DK-6** Guarded Set-Handlers für mode/locale/imageCount/onClose: dirty → confirm-dialog, clean → direct switch.
- [ ] **DK-7** Save via PUT-API mit Error-Handling für 409 (content_changed), 412 (layout_modified_by_other), 400 (too_many_slides_for_grid), 422-Familie.
- [ ] **DK-8** Reset via DELETE-API + `refetchKey++` re-trigger.
- [ ] **DK-9** Stale-Banner mit Reset-Action wenn GET `mode: "stale"`. Save disabled bis Reset.
- [ ] **DK-10** Orphan-Banner wenn GET `warnings: ["orphan_image_count"]`. Save + Reset disabled.
- [ ] **DK-11** Tests ~30 (LayoutEditor.test.tsx ~17 + layout-editor-state.test.ts ~5 + InstagramExportModal.test.tsx +5 + Confirm-dialog ~3).
- [ ] **DK-12** Manueller Staging-Smoke DK-X1..X5 alle grün.

## Done-Definition

- [ ] Sprint Contract vollständig (alle 12 DKs)
- [ ] Sonnet pre-push gate clean
- [ ] Codex PR-review APPROVED (max 3 rounds)
- [ ] Staging deploy + Smoke DK-X1..X5
- [ ] Prod merge nach explizitem User-Go
- [ ] Prod deploy verified (CI grün, /api/health 200, Logs clean)

## Out of Scope (für memory/todo.md)

- Drag-and-drop Block-Reorder (S3-Kandidat)
- Per-Block Live-PNG-Preview-Cards
- Override-Audit-Log-Viewer
- Bulk „alle zurücksetzen"
- DE↔FR Override-Vererbung
- Custom-Block-Splitting (User splittet Absatz)
