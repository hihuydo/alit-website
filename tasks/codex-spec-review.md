# Codex Spec Review — 2026-04-18 (B2b R2)

## Scope
Spec: tasks/spec.md v2 (Mobile Dashboard Sprint B2b — MediaSection + ActionsMenuButton)
Sprint Contract: ~22 Done-Kriterien
Basis: Codex R1 SPLIT RECOMMENDED — v2 accepted the split + addressed in-scope R1 findings. This is verification + new-findings pass.

## R1 Verification
- Scope integrity / split recommendation: RESOLVED. v2 scopes B2b to `MediaSection + ActionsMenuButton + RowAction` type-move and explicitly defers `RichTextEditor + MediaPicker` to B2c, which removes the unrelated work that made v1 too broad (`tasks/spec.md:8-12`, `tasks/spec.md:18-24`, `tasks/todo.md:36-39`).
- RichTextEditor acceptance-count inconsistency: OUT-OF-SCOPE-NOW. The conflicting toolbar-count contract from R1 is no longer in B2b after the split (`tasks/spec.md:10`, `tasks/spec.md:143-148`).
- Release-process gates mixed into implementation acceptance: PARTIAL. v2 correctly downgrades staging/prod to release-gate language in the spec (`tasks/spec.md:131`), but Sonnet/Codex review gates are still listed inside Must-Have / Done-Kriterien, and `tasks/todo.md` still keeps release-process checkboxes in the main acceptance list (`tasks/spec.md:125-131`, `tasks/todo.md:29-31`).
- Touch-tablet hover hole: RESOLVED. v2 now explicitly requires `(hover: hover) and (pointer: fine)` gating for the grid hover cluster and preserves a complementary mobile trigger for coarse-pointer tablets, which addresses the current unreachable-actions problem in `MediaSection` (`tasks/spec.md:75-85`, current broken state in `src/app/dashboard/components/MediaSection.tsx:327-365`, existing `hoverable` variant in `src/app/globals.css:3-5`).
- Rename-via-menu focus handoff: RESOLVED. The spec now makes focus ownership an explicit contract and adds a test that the rename input, not the trigger, owns `document.activeElement` after menu-triggered rename (`tasks/spec.md:96-106`, `tasks/todo.md:26`, current focus-return behavior in `src/app/dashboard/components/Modal.tsx:40-83`).
- RichTextEditor toolbar a11y semantics: OUT-OF-SCOPE-NOW. This was a RichTextEditor-only concern and is explicitly deferred with the B2c split (`tasks/spec.md:10`, `tasks/spec.md:143`).
- MediaSection list desktop UX change needing explicit approval: RESOLVED. v2 now states the change directly, records that it was explicitly accepted, and documents a rollback path (`tasks/spec.md:87-94`, `tasks/spec.md:200-203`).
- `RowAction` type ownership / dependency inversion: RESOLVED. v2 moves the type into a shared base file and keeps `ListRow` re-export only for backward compatibility, which fixes the architecture problem from R1 (`tasks/spec.md:38-50`, `tasks/spec.md:167-168`).

## New Findings

### [Contract] `ActionsMenuButton` API is too weakly specified for the required visibility split
- The spec says `triggerClassName` is the mechanism for caller-specific positioning/override behavior (`tasks/spec.md:56-61`, `tasks/spec.md:72`, `tasks/spec.md:82-83`). That is not enough unless the contract also states whether those classes replace or merely append to the primitive defaults.
- This matters because the extracted ListRow trigger currently needs `md:hidden` (`src/app/dashboard/components/ListRow.tsx:149-156`), while the MediaSection grid trigger must explicitly stay visible on `md+` coarse-pointer tablets and hide only on `md + hoverable`. If `ActionsMenuButton` keeps a baked-in `md:hidden` and only appends caller classes, the grid caller cannot satisfy the spec at all.
- Required spec fix: define the base trigger classes and whether `triggerClassName` replaces or appends them, or split visibility into an explicit prop so ListRow and MediaSection can express different breakpoint/pointer behavior without class conflicts.

### [Contract] The inverted mobile-trigger gating is still internally ambiguous
- Requirement 5 correctly states the intended behavior: hide the grid "…" button only when the desktop hover cluster is actually available (`tasks/spec.md:81-85`). But the allowed examples include `hoverable:hidden`, which would also hide the trigger on `<md` devices that happen to support hover, contradicting the requirement.
- Since the project already has a canonical `hoverable` variant (`src/app/globals.css:3-5`), this should be specified normatively as a combined viewport + pointer gate such as `md:hoverable:hidden` or an equivalent exact rule. Right now the examples allow an implementation that fails the stated behavior while still looking “close enough.”

### [Architecture] `buildMediaActions(item)` is specified two different ways
- In Must-Have 8, `buildMediaActions(item)` is called a “Pure Function” (`tasks/spec.md:108-110`).
- In Architecture Decision 7, the spec then walks that back and says the helper really has to live inside `MediaSection` as a closure over `copied`, `renameState`, `copyUrl`, `startRename`, and `setDeleting` (`tasks/spec.md:205-216`).
- Both approaches are reasonable, but the contract needs one answer. As written, the spec is simultaneously asking for a pure helper and a stateful closure, which makes review noisy without adding implementation freedom that matters.

### [Security] No new in-scope security findings
- The v2 changes remain UI-only. No auth, persistence, or server-side validation paths are being widened by the new scope.

### [Nice-to-have] Release gates should move out of Done-Kriterien entirely
- This is not a blocker for the re-scoped implementation, but the spec and todo are still mixing code-acceptance criteria with rollout/QA gates (`tasks/spec.md:125-131`, `tasks/todo.md:29-31`). A separate “Release Gates” section would make future review sharper.

## Verdict
NEEDS WORK

## Summary
3 new findings — 2 contract, 1 architecture. Plus R1-Verification: 5 resolved, 1 partial, 0 not resolved, 2 out-of-scope-now.
