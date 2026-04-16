# Codex Spec Review — 2026-04-16

## Scope
Spec: `tasks/spec.md` (Dirty-Polish — AccountSection + Flush-on-Stay)
Sprint Contract: see `tasks/todo.md` Done-Kriterien
Basis: no Sonnet `qa-report.md` (post-commit may have skipped)

## Findings

### [Contract]

1. `tasks/spec.md` is still internally inconsistent about where flush runs and how much test coverage is required. The Must-Have contract says flush runs only on `Zurück` and never on `Verwerfen` (`tasks/spec.md:33-39`, `tasks/todo.md:15-19`, `tasks/todo.md:52-56`), but the file table still says DirtyContext should "Call before close in `handleDiscard`+`closeConfirm`" (`tasks/spec.md:84`). The test inventory is also inconsistent: spec file table says 3 new tests (`tasks/spec.md:87`), Must-Have lists 4 assertions (`tasks/spec.md:50-54`), and `todo.md` Phase 4 requires 5 new tests (`tasks/todo.md:69-70`). That leaves the evaluator without a single canonical contract.

2. The Account fetch-race contract contradicts its own expected outcome. The spec requires `initialSnapshotRef` to start as an empty form and says the fetch should only set `email` when the form still equals that empty snapshot (`tasks/spec.md:41-44`, `tasks/todo.md:22-24`). But the edge-case table then claims "fetch returns, user typed nothing" results in `email` being set while the initial snapshot stays empty and `isEdited = false` (`tasks/spec.md:120`). With snapshot-diff, that state is dirty, not clean. As written, the untouched account form would immediately trip the unsaved-changes guard after initial load.

3. Several Done-Kriterien are still not mechanically verifiable in the way the spec claims. The manual check "`<100ms` after Zurück click" (`tasks/spec.md:58`, `tasks/todo.md:46`) is environment-sensitive and not a stable acceptance gate. The automated test wording "handler called before modal-close" (`tasks/spec.md:51`) is also not actually provable with the listed assertions; `calledTimes(1)` after the click only proves same-tick invocation, not ordering relative to modal teardown. For a sprint that explicitly tries to replace vague timing criteria, this is still too soft.

### [Correctness]

1. The fetch-race mitigation is underspecified at the React level and is easy to implement incorrectly. `AccountSection` currently fetches once on mount and updates state from the async callback (`src/app/dashboard/components/AccountSection.tsx:15-21`). The spec compares `currentForm === initialSnapshot` inside that async path (`tasks/spec.md:43`, `tasks/todo.md:23`) but does not require a live ref or other stale-closure-safe read. A naive implementation using mount-time state from the closure will always "see" the pristine form and overwrite user input anyway. The contract needs to state how the fetch callback reads current form state safely.

2. The tricky Journal path is only specified for "timer pending" and "save succeeded while modal open", but not for "request already in-flight" or "in-flight save fails while modal is open" (`tasks/spec.md:46-48`, `tasks/spec.md:125-130`). In the current architecture, `JournalEditor` only has something flushable while `autoSaveTimer.current !== null`; once the timer has fired, `JournalSection.handleSave()` owns the network request (`src/app/dashboard/components/JournalSection.tsx:66-100`). That means the user-facing promise "Zurück resolves save status synchronously" is only true for one sub-case. The spec should either narrow the promise explicitly to the timer-pending case or define expected behavior for the in-flight/failure cases too.

### [Security]

No security blockers in scope. Auth remains on existing guarded routes, there are no new server writes beyond current account/journal endpoints, and the spec does not introduce new trust boundaries.

### [Architecture]

1. The spec exercises the shared `DirtyContext` control plane but only validates the tab-switch path in its smoke tests. In the current dashboard, the same `confirmDiscard` path also gates `Konto` and `Abmelden` (`src/app/dashboard/page.tsx:86-117`). If Sprint 8 changes DirtyContext semantics and gets them wrong, the blast radius is not limited to editor tab changes; it reaches session actions too. At least one smoke criterion should cover a dirty form plus logout/account-action flow, otherwise a shared-regression can ship unnoticed.

### [Nice-to-have]

1. `serializeAccountSnapshot` is parked as Nice-to-have (`tasks/spec.md:66`), but with the fetch-race complexity it would materially improve spec clarity. A named serializer would make the contract less dependent on implicit field ordering and reduce the chance that the snapshot/reset rules diverge again between fetch, save-success, and dirty-diff paths.

## Verdict
NEEDS WORK

## Summary
7 findings — 3 Contract, 2 Correctness, 0 Security, 1 Architecture, 1 Nice-to-have.
