# Codex Spec Review — 2026-04-16 (Runde 3, final)

## Scope
Spec: tasks/spec.md v3.1
Basis: Runde-2 had 4 open items (1 partial + 3 new)
Runde 3 is user-approved override of max-2 policy — findings were substantive, not bikeshedding.

## Runde 2 Open Items — Status

### [Contract-3] ADDRESSED — evidence
The vague ordering proof is replaced with a DOM-observable assertion that does not require a provider-internal close spy. T1 now defines the handler itself as `vi.fn(() => { modalPresentAtCall = screen.queryByRole("dialog") !== null; })` and asserts, immediately after the click, both `mockHandler` called once and `modalPresentAtCall === true`; that is mechanically provable in Vitest + RTL from the public surface. Evidence: `tasks/spec.md:64-69`, `tasks/todo.md:38-43`. This also matches the current test style in `src/app/dashboard/DirtyContext.test.tsx`, which already uses RTL user-visible assertions rather than provider internals.

### [Correctness-3] ADDRESSED — evidence
The null-snapshot suppression bug is fixed. The contract now starts from a pristine serialized snapshot at mount, so user edits before fetch immediately differ from the snapshot and set dirty synchronously; later fetch resolve is ignored once `userTouchedRef` is true. Evidence: `tasks/spec.md:46-55`, especially `tasks/spec.md:47`, `tasks/spec.md:50`, `tasks/spec.md:52`; mirrored in `tasks/todo.md:23-31`, `tasks/todo.md:89-91`.

### [Correctness-4] ADDRESSED — evidence
The spec no longer infers “untouched” from current form equality. It introduces sticky `userTouchedRef` as the authoritative signal for whether the user has interacted, so “typed then deleted back to empty” is distinguished from “never typed”. Evidence: `tasks/spec.md:48-55`, `tasks/spec.md:122-128`, `tasks/spec.md:174-175`; mirrored in `tasks/todo.md:25-27`, `tasks/todo.md:91`.

### [Ops-1] ADDRESSED — evidence
Deploy verification now points to the project’s actual prod/staging hosts: `https://alit.hihuydo.com/` and `https://staging.alit.hihuydo.com/dashboard/`. That matches project memory. Evidence: `tasks/spec.md:187-197`, `memory/project.md` Deployment/Staging/Domain sections.

## New Findings (if any)

### [Consistency-1] Edge-case table now contradicts the fetch-race contract by claiming the “typed then deleted empty” outcome is the same both before and after fetch
Must-Have #6 correctly scopes the clean result to the case where the user types and deletes back to empty **before** fetch resolve: pristine snapshot is still `{"","",""}`, fetch is ignored due to sticky touch, and the form compares clean (`tasks/spec.md:51-55`). But the Edge Cases table broadens that to “vor oder nach Fetch” and still says `Form === pristine-snapshot -> isEdited = false` (`tasks/spec.md:150`). That is false for the “after fetch” branch: once fetch has populated email and reset `initialSnapshotRef` to the fetched email (`tasks/spec.md:50`, `tasks/spec.md:148`), deleting back to empty leaves `form !== initialSnapshotRef`, so `isEdited` must remain `true`. As written, Must-Have and Edge Cases specify different behavior for the same state.

### [Consistency-2] `formRef` is simultaneously part of the v3.1 must-have fix and optional/non-essential in later sections, and `tasks/todo.md` no longer requires it
Must-Have #6 explicitly defines the fix as “pristine-snapshot + userTouchedRef + formRef” and says `isEdited` is computed from `serializeAccountSnapshot(formRef.current)` with `formRef` updated every render for stale-closure safety (`tasks/spec.md:46-50`). But the file table for `AccountSection.tsx` no longer mentions `formRef` at all (`tasks/spec.md:105`), the architecture section says `formRef` is “nicht mehr strikt nötig” and may be omitted (`tasks/spec.md:122-128`), and the corresponding done criteria in `tasks/todo.md` omit `formRef` entirely (`tasks/todo.md:23-31`, `tasks/todo.md:63-70`). That leaves the contract ambiguous: an implementation can satisfy `todo.md` while violating the spec’s own must-have wording. The spec should pick one of two positions and state it consistently everywhere:
- `formRef` is required and must be in the done criteria/file table, or
- `formRef` is optional and should be removed from the must-have contract and v3.1 fix summary.

## Verdict
NEEDS WORK

## Summary
4 addressed, 0 partial, 0 not addressed, 2 new. Runde 3/3 (policy override).
