# Codex Spec Review — 2026-04-29

## Scope
Spec: `tasks/spec.md` (S1b — Layout-Overrides Persistence API)
Sprint Contract: 12 Done-Kriterien
Basis: 6 Sonnet rounds completed; convergence at 4 findings/round (HIGH each round)

## Findings

### [Contract] — Sprint-Contract-Verletzung
[Contract] — The sprint says "No new UI surface in S1b", but the GET contract hard-freezes multiple S2 modal concerns: text-only slide filtering, `index` semantics, block-ID shape, orphan warning behavior, and dirty-detect baseline assumptions. That is not just persistence API work anymore; it is an S2-facing view-model contract. Why it matters: this narrows S2 before the UI exists, and it is already forcing the spec into a non-source-of-truth reconstruction path. Suggested fix: either explicitly declare "S1b also freezes the S2 modal payload contract", or trim DK-1/GET to a storage-oriented response and finalize modal projection in S2.

### [Correctness] — Technische Korrektheit / Edge Cases / Race Conditions
[Correctness] — The GET auto/stale path is not actually derived from the same layout engine as the PNG renderer. The spec rebuilds text-slide groups via `projectAutoBlocksToSlides(...)`, but the real render path goes through `resolveInstagramSlides(...)` → `splitAgendaIntoSlides(...)`. In the current codebase those are not equivalent: `projectAutoBlocksToSlides` does not split oversized blocks, does not run the rebalance/last-slide compaction passes, and determines `hasGrid` from raw `item.images.length` instead of `resolveImages(...)`. That means GET can return a different slide grouping than the actual PNG route for the same item. Suggested fix: make the resolver the single source of truth for both render output and editable block mapping, even if that means returning fragment-level metadata (`sourceBlockId`, fragment index) instead of reconstructing groups in the route.

[Correctness] — The JSONB cleanup story is still incomplete for non-canonical or manually injected state. DELETE only removes the exact canonical key `String(imageCount)` and collapses to `NULL` only when top-level locale objects are `{}`/`null`. That leaves dangling shapes such as `{"de":{"00":{...}}}` or `{"de":{"0":null}}` unreachable by the API but still persisted forever. This matters here because the spec explicitly includes manual `psql` smoke and out-of-band override injection. Suggested fix: document a strict canonical JSONB invariant and add one of:
1. a recursive normalization/cleanup step in DELETE,
2. a repair script for malformed keys/values,
3. a stricter manual smoke recipe that only writes canonical keys and forbids nested `null` payloads.

### [Security] — Security / Auth / Data Integrity
[empty if none]

### [Architecture] — Architektur-Smells mit konkretem Risk
[Architecture] — `computeLayoutVersion` is specified as a reusable pure helper because "S2 modal will brauchen", but the actual file `src/lib/instagram-overrides.ts` is Node-only today (`import { createHash } from "node:crypto"`). A client component cannot import that module into the browser bundle. Why it matters: the spec is promising shared client/server behavior from an implementation location that cannot satisfy that promise. Suggested fix: either mark `computeLayoutVersion` as server-only in S1b and remove the client-reuse rationale, or plan a separate browser-safe hash adapter for S2 instead of treating the current helper as directly shareable.

### [Nice-to-have] — Out-of-Scope, gehört nach memory/todo.md
[Nice-to-have] — The repo paths referenced as review context for API/auth patterns (`patterns/api.md`, `patterns/auth.md`, `patterns/api-mutations.md`) do not exist in this checkout. That did not block review of the spec itself, but it is repo-hygiene drift rather than an S1b blocker. It belongs in project memory / docs cleanup, not in this sprint’s Must-Haves.

## Verdict
NEEDS WORK

## Summary
4 findings — 1 Contract, 2 Correctness, 1 Architecture
