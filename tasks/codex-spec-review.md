# Codex Spec Review — 2026-04-27 — Sprint 2 Per-Image Crop Modal

## Scope (current spec, NOT alte Sprint 1)
- Review target: `tasks/spec.md` v7 and `tasks/todo.md` for Sprint 2 only.
- Focus: merge-blocking issues in contract clarity, persisted JSONB safety, and crop-modal behavior under real dashboard constraints.

## Findings

### Contract

1. **Spec and sprint contract still disagree on core implementation details and DK math.**
   - `tasks/spec.md` requires render-time state adjustment for CropModal re-init and explicitly argues against `useEffect`.
   - `tasks/todo.md` Phase 2 still says `useEffect` re-init on `[image, open]`.
   - Test totals also drift: spec body says `+30`, test plan says `+43`, DK-2 says `+45`, and file counts do not reconcile cleanly.
   - There is also stale nested-modal wording left in `todo.md` notes even though the current architecture is inline form + single modal.
   - This is a merge blocker because the sprint is not mechanically verifiable as written.
   - Required fix: make `spec.md` and `todo.md` converge on one reset pattern, one exact test budget, and one consistent architecture description.

### Correctness

1. **The spec does not make crop preservation across ordinary agenda edits an explicit end-to-end contract.**
   - Current `AgendaSection.tsx` drops unknown image fields in both directions:
     - `openEdit()` rehydrates `images` without `cropX/cropY`.
     - `handleSave()` serializes `images` without `cropX/cropY`.
   - That means a pre-cropped entry can silently lose persisted crop values when the editor opens and the user saves an unrelated field.
   - Because `images` is JSONB and rewritten as an array, this fails silently and permanently.
   - Required fix: add an explicit contract that dashboard local types, edit hydration, and save payload all preserve `cropX/cropY`, plus a regression test:
     - existing row contains crop values
     - user edits only non-image fields
     - saved row still contains the same crop values after reload

### Architecture

1. **The crop-overlay math relies on a false resize assumption.**
   - The spec says keeping `getBoundingClientRect()` inline in render is enough because “window-resize triggert Re-render via React”.
   - That is not true. Window resize alone does not re-render this component.
   - Result: after viewport resize/orientation change, the overlay can stay visually stale until some unrelated state change happens, while pointer math later reads fresh dimensions. That creates a UI/model mismatch exactly in the feature whose only job is precise positioning.
   - Required fix: either add an explicit resize/orientation invalidation path for the modal, or narrow the contract and tests so resize/rotation is explicitly unsupported for this sprint.

### Security

- No blocker-level security finding beyond the silent persisted-data-loss risk above.

### Nice-to-have

- No blocker-level nice-to-have finding.

## Verdict
NEEDS WORK

## Summary
- Main blocker: the dashboard round-trip is underspecified for persisted JSONB safety, and the current code shape will silently drop `cropX/cropY` unless the spec explicitly covers hydration + save serialization.
- Secondary blocker: the sprint contract is internally inconsistent, so DKs are not objectively checkable.
- Third blocker: the resize model in the crop math is based on a false React assumption and can desync the overlay from the actual drag math.
