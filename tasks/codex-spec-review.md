# Codex Spec Review — 2026-04-16 (Runde 2)

## Scope
Spec: tasks/spec.md v3
Basis: Runde-1 findings (7) + Sonnet qa-report.md (implementation-status, not spec issue)

## Runde 1 Findings — Status

### [Contract-1] ADDRESSED — flush path and test count are now canonicalized. Flush is specified only on `closeConfirm`/`Zurück` in both spec and todo, and the new coverage is consistently defined as 5 tests T1–T5. Evidence: `tasks/spec.md:34-39`, `tasks/spec.md:59-64`, `tasks/spec.md:97-102`, `tasks/todo.md:16-20`, `tasks/todo.md:36-41`.

### [Contract-2] ADDRESSED — the original “form becomes dirty immediately after initial fetch” contradiction is fixed by the null-snapshot sentinel plus snapshot reset on fetch success. Normal untouched load now resolves to `isEdited = false`. Evidence: `tasks/spec.md:45-50`, `tasks/spec.md:139-140`, `tasks/todo.md:24-27`.

### [Contract-3] PARTIAL — the vague `<100ms` gate was removed, but the new T1 ordering proof is still not mechanically well specified. `mockHandler.mock.invocationCallOrder < closeCallbackMock/closeSpy` assumes a close spy the current public contract does not expose, so “handler fires before close” is still not cleanly testable from the stated setup. Evidence: `tasks/spec.md:59-64`, `tasks/todo.md:36-41`.

### [Correctness-1] ADDRESSED — the stale-closure risk is explicitly handled via `formRef` updated every render, and the fetch callback is specified to read live form state rather than mount-time closure state. Evidence: `tasks/spec.md:45-49`, `tasks/spec.md:117-120`, `tasks/todo.md:24-26`.

### [Correctness-2] ADDRESSED — the flush promise is now explicitly narrowed to the `timer pending` case, with in-flight save treated as best-effort/no-op and documented in edge cases and risks. Evidence: `tasks/spec.md:40-43`, `tasks/spec.md:146-148`, `tasks/spec.md:160`, `tasks/todo.md:31-34`.

### [Architecture-1] ADDRESSED — the shared `confirmDiscard` control path is now covered by an explicit logout smoke test, which exercises the non-tab session action path in `dashboard/page.tsx`. Evidence: `tasks/spec.md:18`, `tasks/spec.md:68-73`, `tasks/spec.md:153-154`, `src/app/dashboard/page.tsx:81-89`, `src/app/dashboard/page.tsx:112-125`.

### [Nice-to-have-1] ADDRESSED — `serializeAccountSnapshot` was promoted into the must-have contract, with fixed key ordering and all 3 call-sites named. Evidence: `tasks/spec.md:52-54`, `tasks/spec.md:100`, `tasks/spec.md:122`, `tasks/todo.md:23-29`.

## New Findings (if any)

### [Correctness-3] Null-snapshot semantics now suppress real dirty state if the user types before the initial fetch resolves
The v3 contract explicitly says that when user input arrives before fetch resolve, the fetch response is ignored, `initialSnapshotRef` stays `null`, and `isEdited` remains `false` until a later save success or other reset (`tasks/spec.md:46-49`, `tasks/spec.md:141`, `tasks/todo.md:25-26`). That creates a real data-loss window: the user can type into Konto before the fetch returns, then click another tab or logout, and `confirmDiscard` will still see the form as clean. This contradicts the sprint summary promise that unsaved Konto edits trigger the confirm modal (`tasks/spec.md:10-12`, `tasks/spec.md:28`).

### [Correctness-4] The “pristine” check conflates untouched with “typed, then reverted to empty”
The fetch guard treats `email === "" && currentPassword === "" && newPassword === ""` as proof that the user “hat seit Mount nichts getippt” (`tasks/spec.md:48`, `tasks/spec.md:120`, `tasks/todo.md:25`). That is not true if the user briefly typed and deleted back to empty before the async response arrived. In that case the fetch path will overwrite the form with server email and reset the snapshot, even though the spec says user input wins.

### [Ops-1] Deploy verification points at the wrong production host
The deploy checklist uses `alit.ch` / `alit.ch/dashboard/` as the required 200-check target (`tasks/spec.md:179-182`), but project memory defines the live domain as `https://alit.hihuydo.com` and staging as `https://staging.alit.hihuydo.com` (`memory/project.md`). That makes the final verification section operationally incorrect.

## Verdict
NEEDS WORK

## Summary
5 addressed, 1 partial, 0 not addressed, 3 new. Runde 2/2.
