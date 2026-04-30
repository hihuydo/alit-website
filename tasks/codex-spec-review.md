# Codex Spec Review — Round 2 — 2026-04-30

## Scope
Spec: tasks/spec.md (S2c Auto-Layout Single Source of Truth)
Sprint Contract: 10 Done-Kriterien (DK-1 through DK-10)
Basis: Round 1 verdict NEEDS WORK (4 in-scope + 1 nice-to-have, all addressed); Sonnet R17 verdict NEEDS WORK on 2 minor items, both fixed in latest commit.

## Findings

### [Contract] — Sprint-Contract-Verletzung oder fehlendes Must-Have
[Contract] — `DK-10` now claims route/UI external-contract coverage, but the spec’s own test plan explicitly does not test those layers. `tasks/todo.md` says DK-10 must verify `(b)` `/api/dashboard/agenda/[id]/instagram-slide/[slideIdx]/route.tsx` still returns `404` for `slide_not_found` and `422` for `too_long`, and `(c)` `InstagramExportModal.tsx` download-disablement logic is unchanged. In `tasks/spec.md` §External-contract regression tests, the proposed tests only call `splitAgendaIntoSlides(...)`, and the section then states `Nicht-test-by-DK-10: API-route layer`. That is a direct contract mismatch, not just a test-style preference. It matters because the route contains its own `404` vs `422` branch on `numSlideIdx >= slides.length`, and the modal gates downloadability off fetched metadata/warnings rather than the library function directly. Suggested fix: either narrow DK-10 back to library-level warning semantics only, or keep the broader contract and add explicit route/component tests for the `slide_not_found`/`too_long` split and modal disablement behavior.

### [Correctness] — Technische Korrektheit / Edge Cases / Race Conditions
None.

### [Security] — Security / Auth / Data Integrity
None.

### [Architecture] — Architektur-Smells mit konkretem Risk (kein Nice-to-have)
None.

### [Nice-to-have] — Out-of-Scope, gehört nach memory/todo.md
[Nice-to-have] — The spec is slightly over-specified around `compactLastSlide(...).toBe(groups)` reference-identity guarantees. That optimization is not the core S2c contract and makes the helper API more rigid than the feature needs. If kept, fine; if it starts creating review churn, it belongs as an implementation preference, not as the main acceptance signal.

## Verdict
NEEDS WORK

Blocking finding:
- DK-10’s stated external-contract scope does not match the tests the spec actually requires.

## Summary
2 findings — 1 Contract, 0 Correctness, 0 Security, 0 Architecture, 1 Nice-to-have.
