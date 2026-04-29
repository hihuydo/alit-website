# Codex Spec Review — 2026-04-29

## Scope
Spec: `tasks/spec.md` (S1 — Layout-Overrides Backend)
Sprint Contract: 13 Done-Kriterien
Basis: Sonnet R5 verdict "architecturally sound; precision-level gaps only"; R6 in progress

## Findings

### [Contract] — Sprint-Contract drift between `tasks/spec.md` and `tasks/todo.md`
[Contract] — The sprint is not operating against one contract. The worst mismatch is DK-13: `tasks/spec.md` defines DK-13 as `image_partial` preservation in the metadata route, while `tasks/todo.md` defines DK-13 as prod-merge plus post-merge verification. There are more drifts in DK-3 test baselines/counts and in the implementation-order export list (`tasks/todo.md` still requires extra public re-exports that `tasks/spec.md` explicitly removed). A generator cannot know which document is authoritative. Affected sections: `tasks/spec.md` Sprint Contract, Tests, Implementation Order; `tasks/todo.md` Done-Kriterien, Implementation Order. Suggested fix: reconcile both files line-by-line before implementation and declare one canonical source for acceptance.

### [Contract] — The review basis references a missing artifact
[Contract] — The prompt and project memory say `tasks/qa-report.md` is the Sonnet basis, but that file does not exist in the workspace. The spec therefore cites R5/R6 context that an implementer or reviewer cannot inspect. Affected sections: review basis / workflow assumptions around `qa-report`. Suggested fix: either restore the current Sonnet report at `tasks/qa-report.md` or remove it as an explicit dependency from the sprint basis.

### [Contract] — Scope is too wide for one shared-DB sprint
[Contract] — This "backend-only" sprint actually bundles four risk classes: schema change on a shared DB, pure layout refactor, three new persistence routes with concurrency control, and integration rewires of both existing render routes plus staging race-smoke. That is more than a normal backend foundation slice, especially with manual SQL smoke and audit requirements. Affected sections: Sprint Contract DK-1, DK-5, DK-6, DK-7, DK-10, DK-12; Implementation Order. Suggested fix: split into two sprints:
1. S1a: schema, types, `stableStringify`, resolver/helpers, existing metadata/PNG routes switched to resolver, no persistence API yet.
2. S1b: `/instagram-layout` GET/PUT/DELETE, CAS/audit semantics, orphan cleanup policy, staging race smoke, pattern-doc update.

### [Correctness] — `imageCount` semantics are fragmented across endpoints
[Correctness] — The spec gives four different behaviors for the same logical key: metadata route clamps `imageCount`, PNG route clamps `imageCount`, layout `GET` hard-fails with `image_count_exceeded`, and `DELETE` intentionally skips the per-item cap so orphan keys can still be removed. That fragmentation creates a blind spot: once attached images are reduced, an existing override for the old `imageCount` is still stored but cannot be read back through `GET /instagram-layout`; it can only be deleted blind. That weakens the stale-mode contract and creates a hidden dependency on S2 showing only a reset affordance. Affected sections: `tasks/spec.md` GET `/instagram-layout`, DELETE asymmetry note, Risk Surface row on per-imageCount orphans. Suggested fix: either let layout `GET` surface orphaned keys as `mode:"stale"` for cleanup/inspection, or explicitly codify "orphan overrides are reset-only and unreadable" as an API contract so S2 is designed around it.

### [Correctness] — `layoutVersion` is stored as derived data but not canonically healed
[Correctness] — The spec persists `layoutVersion` inside JSONB, but PUT does CAS by recomputing the current version from stored `{contentHash, slides}`. That means an out-of-band SQL edit or a bad seed can leave `override.layoutVersion` inconsistent with `override.slides`: reads can still show `mode:"manual"` because `contentHash` matches, but the next PUT will 412 forever because the recomputed version differs from the stored token the client was given. This is a real data-integrity trap because the field is fully derivable. Affected sections: `computeLayoutVersion`, PUT step #9, GET response shape. Suggested fix: make the server recompute `layoutVersion` on every read and after every load of a stored override, or stop storing `layoutVersion` at all and treat it as a computed response field.

### [Correctness] — The spec’s smoke helper command does not match the current TS runtime layout
[Correctness] — DK-S1a suggests `node -e 'import("./src/lib/instagram-post.js") ...'` to compute hashes ad hoc. In this codebase the source file is `src/lib/instagram-post.ts`; there is no checked-in sibling `.js` module at that path during normal development, and the standalone server layout on staging will not mirror source-path imports 1:1. That makes a required manual verification step non-runnable as written. Affected sections: DK-S1a Quick-helper note. Suggested fix: replace it with a runnable project command such as `pnpm exec tsx -e '...'` or provide a dedicated script under `scripts/`.

### [Security] — The manual staging smoke mutates shared production data without a mandatory rollback guard
[Security] — This project explicitly runs staging and prod against the same DB. DK-S1a and DK-S1d require manual `UPDATE agenda_items SET instagram_layout_i18n = ...` and lock-race exercises via `psql` on staging, but the sprint contract does not require a pre-smoke backup, a dedicated disposable row, or a cleanup/rollback step for the injected override. In this repository that is not a theoretical concern; it is live-data mutation. Affected sections: DK-10 manual smoke, Risk Surface table, memory/project shared-DB notes. Suggested fix: promote a pre-staging `pg_dump` plus a disposable test-row requirement into Must-Have, or move destructive SQL smoke to prod-after-merge on a deliberately chosen fixture row with explicit cleanup.

### [Architecture] — The spec hard-codes a block-ID format that the codebase does not promise
[Architecture] — `JournalBlock.id` is currently only typed as `string`. The spec turns that opaque string into an external persistence contract twice: JSONB stores `block:<journalBlockId>`, and PUT validates with `^block:[a-zA-Z0-9_-]+$`. That over-specifies an implementation detail of the editor pipeline and creates a future compatibility hazard if block IDs ever move to UUIDs with different punctuation, database-style prefixes, or another stable scheme. Affected sections: override shape, `flattenContentWithIds`, PUT Zod schema. Why it matters: layout persistence becomes coupled to the current HTML/editor ID generator rather than to the abstract invariant "this block is the same logical block." Suggested fix: treat block IDs as opaque strings with a length cap; centralize any serialization format in one shared helper that both editor and backend use.

### [Architecture] — The layout algorithm is specified in three places, which makes drift likely
[Architecture] — The spec duplicates the same slide-budget rules across `splitAgendaIntoSlides`, `projectAutoBlocksToSlides`, and `buildManualSlides`, then calls `splitAgendaIntoSlides` again from the resolver for warnings. Today the formulas happen to match, but the next layout tweak will require synchronized edits across several helpers and tests. That is a maintainability smell in a part of the system that is already sensitive to visual regressions. Affected sections: `projectAutoBlocksToSlides`, `buildManualSlides`, `resolveInstagramSlides`, DK-8 backward-compat claim. Why it matters: a future change to lead budget, grid behavior, or hard-cap logic can desynchronize auto projection, manual rendering, and warning computation while all code still "looks" locally correct. Suggested fix: define one shared internal layout-plan primitive and derive auto projection, manual assembly, and warnings from that instead of restating the rules.

### [Nice-to-have] — The spec is over-specified in unstable details and already shows drift
[Nice-to-have] — The document is carrying mutable operational detail that has already gone stale: absolute test baselines (`823 → 890+`) despite the repo currently sitting at a much lower test count, exact bullet sums, and shell-level smoke instructions embedded in the main contract. That density hurts clarity and raises maintenance cost without improving the architectural contract. Suggested fix: keep the spec at invariant level, move volatile numbers and operator recipes to an appendix or `memory/todo.md`, and make DKs command-based (`pnpm test`, route smoke succeeds) instead of count-based.

## Verdict
SPLIT RECOMMENDED

If split:
1. Sprint S1a: schema addition, override types, `stableStringify`, content/layout hashing, resolver/helpers, metadata route and PNG route switched to resolver, backward-compat tests.
2. Sprint S1b: `/instagram-layout` GET/PUT/DELETE, CAS/audit contract, orphan-key policy, manual staging smoke, pattern-doc update, final S2-facing API contract freeze.

## Summary
9 findings — 3 Contract, 3 Correctness, 1 Security, 2 Architecture, 1 Nice-to-have.
