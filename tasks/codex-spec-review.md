# Codex Spec Review R2 — 2026-04-27

## Scope
Spec: tasks/spec.md v12 (Sprint 2 Per-Image Crop Modal)
Basis: 10 Sonnet rounds + Codex R1 (74+ findings incorporated)

## Findings

### [Contract]
- `tasks/spec.md` v12 and `tasks/todo.md` still disagree on the test contract. Spec Req 13 / Test Plan now require `+47` tests and `AgendaSection.test.tsx +6`, while `tasks/todo.md` DK-2 and Phase 3 still say `+46` and `AgendaSection +5`. This is implementation-blocking because generator/PR review cannot tell which acceptance bar is canonical.
- `tasks/todo.md` still prescribes the removed `prevOpen` re-init pattern (`if (image !== prevImage || open !== prevOpen)`) while `tasks/spec.md` v12 explicitly removed `prevOpen` as dead code under conditional rendering. This is direct spec/todo contradiction on component logic.
- `tasks/spec.md` still contains one stale internal count reference inside the `CropModal.test.tsx` bullet: it says the contract is now `+47`, but later references `10+5+2+20+5+2+2=46 in DK-2/test-plan`. That should be purged so the spec is internally self-consistent.

### [Correctness]
- `tasks/todo.md` Phase 3 still says `handleSave()` payload mapping is at `AgendaSection.tsx:326` and `:533`. In v12 spec, `~326` is explicitly the `previewItem` useMemo path, not a save path. This stale pointer is likely to recreate the exact live-preview omission Sonnet R8/R10 fixed.

### [Security]
- No findings.

### [Architecture]
- No new architecture blocker beyond the spec/todo drift above. The product-side design for JSONB-additive crop fields, renderer defaults, resize invalidation, and inline-form modal model is otherwise coherent.

### [Nice-to-have]
- `tasks/todo.md` should be treated as derived from spec and re-synced mechanically after each adversarial patch round. The remaining issues are all document-drift, not feature design gaps.

## Verdict
NEEDS WORK

## Summary
4 findings — 3 Contract, 1 Correctness, 0 Security, 0 Architecture, 1 Nice-to-have.
