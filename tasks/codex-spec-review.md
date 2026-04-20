# Codex Spec Review — 2026-04-21
## Scope
Spec: Agenda Datum + Uhrzeit vereinheitlichen (8 DKs)

## Findings
### [Contract]
1. Shared-DB blast radius is not acknowledged. Per `CLAUDE.md` and `memory/project.md`, staging and prod share the same PostgreSQL database. A boot-time migration inside [`src/lib/schema.ts`](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/src/lib/schema.ts:35) will therefore mutate prod data on the first staging boot before merge, not only on “real” prod deploy. The spec must explicitly call this out and require a backup / owner sign-off / rollback note before treating DK-4 or DK-8 as routine staging smoke.
2. DK-4’s expected log line is nondeterministic in the current bootstrap model. `ensureSchema()` is called from [`src/instrumentation.ts`](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/src/instrumentation.ts:73) on every container boot, with retry logic and potentially multiple environments hitting the same DB. That means `[agenda-migration] normalized 2 rows` is only true for the first runner; later boots legitimately normalize `0`. The contract should verify final DB state, not a fixed normalization count.
3. `normalizeLegacyDatum()` plus a full-date migration is scope creep relative to the stated production problem. The spec itself says all 5 prod `datum` values are already canonical; only 2 `zeit` values are off-spec. A heuristic date normalizer that accepts inputs like `"2025/03/15"` or `"15.3.25"` expands the sprint from “enforce canonical contract” into “guess and rewrite legacy date variants” without present evidence that the codebase needs it.
4. DK-7 mixes feature acceptance with repo-wide supply-chain state. `pnpm audit --prod` is a valid release gate, but it is not mechanically attributable to this sprint and can fail due to unrelated dependency churn. As written, the feature can be functionally complete yet fail its sprint contract for reasons outside the agenda change.

### [Correctness]
1. The date contract is weaker than the wording suggests. `isCanonicalDatum()` is specified as “simple” and explicitly skips leap-year validation, while still being used as the canonical API gate for [`POST`](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/src/app/api/dashboard/agenda/route.ts:76) and [`PUT`](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/src/app/api/dashboard/agenda/%5Bid%5D/route.ts:38). That would allow impossible dates like `29.02.2025` through direct API writes. Either the spec should require strict civil-date validation or stop describing the result as a fully canonical date.
2. The legacy-edit fallback is underspecified and can become destructive. In [`AgendaSection.tsx`](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/src/app/dashboard/components/AgendaSection.tsx:129), edit mode copies raw DB strings into form state; the proposed adapter would blank the picker when parsing fails. The spec adds a hint text, but it does not define whether save is blocked until the admin reselects a valid value, or whether the original raw value is preserved unless edited. Without that contract, “empty picker + save” risks either silent overwrite or a confusing server-side validation error.
3. Adjacent consumers and fixtures are not covered by the new contract. The runtime renderers are display-string based, and several current tests still use raw ISO-like values (`datum: "2026-05-01"`, `zeit: "19:00"`) in Instagram/export fixtures, e.g. [`src/lib/instagram-post.test.ts`](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/src/lib/instagram-post.test.ts:12). If the sprint’s claim is “agenda display strings are now canonical everywhere,” those fixtures either need updating or explicit exemption, otherwise the suite will continue to encode the old contract.

### [Security]
No new auth/CSRF-specific blockers surfaced. The write paths already sit behind `requireAuth()` and CSRF enforcement in [`src/lib/api-helpers.ts`](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/src/lib/api-helpers.ts:42). The material risk here is deployment blast radius from boot-time data mutation, not an authorization gap.

### [Architecture]
1. The chosen migration vehicle is heavier than the actual repair. A value-rewriting migration inside `ensureSchema()` means every app boot can execute row-scanning and data repair logic, even though this sprint is normalizing 5 existing rows and only 2 are known-bad. That may still be acceptable, but the spec should explicitly justify why a separate one-shot migration task was rejected and define partial-success semantics, because the current schema bootstrap path is global and high-impact.

### [Nice-to-have]
1. DK-5 is not fully mechanically verifiable as written because it leans on browser-native placeholder behavior. The spec claims the browser will show `"TT.MM.JJJJ"` / `"--:--"` and adds a small legacy hint, but native date/time UI is locale- and browser-dependent. The verifiable contract should instead be: correct `type`, correct `value` roundtrip, hint text bound via `aria-describedby`, and canonical request payload on save.

## Verdict
NEEDS WORK

## Summary
9 findings — Contract 4, Correctness 3, Security 0, Architecture 1, Nice-to-have 1
