# Codex Spec Review — 2026-04-18 (R2)

## Scope
Spec: `tasks/spec.md` v2 (Mobile Dashboard Sprint B2a)
Sprint Contract: 22 Done-Kriterien
Basis: Codex R1 (10 findings, NEEDS WORK) — v2 addresses all 10. This is verification + new-findings pass.

## R1 Verification
1. `RESOLVED` — MH7/MH8 now make collapse a11y and selection-count announcement contractual, with explicit DOM attributes and test expectations in spec + todo.
2. `RESOLVED` — PaidHistory responsive behavior is rewritten as an exact class-string invariant instead of an untestable viewport assertion.
3. `RESOLVED` — handler parity is now explicit in Must Have 3: same existing functions, no mobile-only mutation logic, no duplicated guardrails.
4. `PARTIAL` — the old `pb-24` vagueness is replaced by `BulkFlowSpacer` + safe-area handling, but the shared-height/source-of-truth part is still internally inconsistent (`h-24` vs `h-20`, “Konstante oder CSS-var” only suggested).
5. `RESOLVED` — the spec now has a concrete collapse-state matrix covering the core lifecycle paths R1 asked for (sort, tab switch, delete, bulk delete, reload, unmount).
6. `RESOLVED` — z-order is now explicit (`sticky z-30`, `Modal z-50`) and mirrored in the sprint contract.
7. `RESOLVED` — CSS-dual-DOM screen-reader safety is now locked down with explicit `hidden md:block` / `md:hidden` wrappers and a prohibition on visually-hidden/off-canvas alternatives.
8. `RESOLVED` — “Keine Logic-Änderung” was corrected to “no server/data-layer changes; client interaction state expands in-place”.
9. `PARTIAL` — the spec now requires four presentational subcomponents, but keeping them inline in the same file does not deliver the claimed “blast-radius reduction” or direct test targeting in the way the text suggests.
10. `RESOLVED` — the new `dashboardStrings.signups` block fixes the earlier contradiction between new card copy and “no new i18n strings”.

## New Findings

### [Contract] Handler-parity test is specified in a way that is either impossible or tautological
The v2 contract says the test should “spy auf `handleBulkDelete` / `exportMembers` / `exportNews`” and prove the sticky-bar uses the same handler as the header button (`tasks/todo.md:24`, `tasks/todo.md:58`). In the current code those are function-local closures inside `SignupsSection` (`src/app/dashboard/components/SignupsSection.tsx:318-380`), so there is nothing stable to spy on from a black-box RTL test. If implementation instead passes the same callback prop into both header and sticky button, then the test becomes tautological: it proves shared wiring, not meaningful behavior parity. Suggested fix: rewrite this criterion as observable behavior parity: both surfaces must open the same bulk-delete modal, call the same CSV path with the same selected ids, and share the same disabled/error behavior.

### [Contract] BulkFlowSpacer/shared-height contract is still internally inconsistent and not fully enforceable
The new spacer contract fixes the old `pb-24` problem, but v2 now defines three different sources of truth: `BulkFlowSpacer` default `heightClass="h-24"` (`tasks/spec.md:94`), Architecture Decision 5 requires `h-20 pb-[env(safe-area-inset-bottom)] md:hidden` (`tasks/spec.md:111`), and the Risks section only suggests a shared constant or CSS variable as a mitigation (`tasks/spec.md:141-142`). `tasks/todo.md:17` then asks for a class-match proving “Höhe identisch”, but that still cannot catch drift unless both elements are required to consume one single mandated token. Suggested fix: make the shared height source of truth mandatory, not optional: one exported constant or CSS variable referenced by both sticky bar and spacer, with tests asserting both use that exact token.

### [Correctness] The Collapse-State-Matrix overclaims completeness relative to the real mutation surface
The v2 matrix is much better than R1, but it is not actually “all paths that mutate memberships array”. In the current component, `memberships` also changes on initial mount/refetch via `reload()` (`src/app/dashboard/components/SignupsSection.tsx:192-220`) and on optimistic/server-win paid toggles via `setData(...)` in `executePaidPatch` (`src/app/dashboard/components/SignupsSection.tsx:248-273`). Those paths do not require orphan-pruning, but the spec currently presents the seven-row matrix as exhaustive (`tasks/spec.md:102-109`). Suggested fix: either scope the matrix explicitly to “id-presence-changing paths” or extend it with the omitted mutation paths plus a one-line note that `memberExpanded` is preserved because ids remain stable.

### [Architecture] “Inline subcomponents reduce blast radius” is overstated
v2 claims the four inline subcomponents make mobile-card tests “targetable ohne die komplette Section zu mocken” and reduce blast radius (`tasks/spec.md:100`). That is not true in the repo’s current structure. If the subcomponents stay inline in `SignupsSection.tsx` and are not exported, tests still have to mount the full `SignupsSection` tree to reach them, and the parent keeps ownership of all fetch/sort/selection/modal state in the same 700+ line file (`src/app/dashboard/components/SignupsSection.tsx:168-712`). Suggested fix: either extract the mobile pieces to sibling modules if blast-radius reduction is a real goal, or downgrade the claim and frame them as a readability refactor only.

## Verdict
NEEDS WORK

## Summary
4 new findings — 2 Contract, 1 Correctness, 1 Architecture. Plus R1-Verification: 8 resolved, 2 partial, 0 not resolved.
