# Codex Weekly Review — 2026-04-16 (scoped to session PRs #50-#52)

## Scope
5 commits reviewed, fc115e9..HEAD
16 files changed, +948 -233

## Findings

### Critical

### Important
[Important] src/app/api/dashboard/signups/[type]/[id]/route.ts:54 — The old single-delete route still emits `signup_delete` after an unconditional `DELETE`, even when no row existed, while the new bulk-delete route only audits rows returned by `DELETE ... RETURNING`. That means the same audit event now has two different semantics across PR #44/#52, so downstream audit reading can no longer tell “row was actually deleted” from “delete was attempted on an already-gone row.” Align both routes to one invariant.

### Suggestions
[Suggestion] src/app/dashboard/components/SignupsSection.tsx:515 — During `bulkDeleting`, the section disables its footer buttons but keeps the shared modal dismiss affordances from PR #51 in the tab order and wired to a deliberate no-op (`onClose={() => (bulkDeleting ? undefined : ...)}`). Keyboard and screen-reader users can still reach Escape/backdrop/X and get no feedback. `Modal` should expose a real `dismissible`/`disableClose` contract instead of each caller faking it.

[Suggestion] src/app/dashboard/i18n.ts:1 — PR #51 introduced `dashboardStrings` as the dashboard-modal copy module, but the other confirm flows still hardcode their text in [DeleteConfirm.tsx](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/src/app/dashboard/components/DeleteConfirm.tsx:14) and [SignupsSection.tsx](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/src/app/dashboard/components/SignupsSection.tsx:516). The i18n pass is only partial, so future copy changes will drift across the three modal variants unless they are centralized consistently.

[Suggestion] src/app/api/dashboard/signups/bulk-delete/route.ts:14 — The new bulk-delete route has no route-level tests at all; `rg` only finds new tests for `DirtyContext` and `Modal` in this session. That leaves the most failure-prone parts of PR #52 unverified: invalid `type`, empty or oversized `ids`, non-integer IDs, and the “audit only actual deletes” contract.

[Suggestion] src/app/dashboard/components/Modal.test.tsx:8 — The modal A11y suite covers role/label/initial focus/Escape, but it does not test the two behaviors PR #51 actually added and PR #52 now depends on: Tab-wrap focus trapping and focus return to the opener. Those are exactly the shared-contract checks that should protect every consuming modal.

[Suggestion] src/app/api/dashboard/signups/bulk-delete/route.ts:59 — Actor-email lookup and `signup_delete` audit shaping are now duplicated between the single-delete and bulk-delete routes. `api.md` explicitly calls out extracting a shared helper before the second call site; not doing that already produced semantic drift in this session, and the next audit-field change will likely repeat it.

## Summary
5 findings (0 critical, 1 important, 4 suggestions).
