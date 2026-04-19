# Codex Spec Review — 2026-04-19 (R2)

## Scope
Spec: tasks/spec.md v2 (Sprint D1 — CSP Report-Only Baseline)
Sprint Contract: 14 Done-Kriterien (inkl. PMC separat in spec.md)
Basis: R1 = NEEDS WORK with 10 findings (3 Contract, 2 Correctness, 2 Security, 2 Architecture, 1 Nice-to-have). v2 addresses 9 in-scope + parks 1 Nice-to-have.

## R1 Verification

1. [Contract] matcher narrowing — PARTIAL  
   Evidence: `tasks/spec.md:24-36`, `tasks/todo.md:9`. v2 now excludes `/_next/static`, `/_next/image`, broad `/api`, `fonts`, `favicon.ico`, plus prefetch headers, which fixes the original API/prefetch overreach. The remaining gap is that the stated contract still says "ausschließlich Document-Requests", but the matcher shown would still hit non-document routes like `/robots.txt` and `/sitemap.xml`; the wording is stricter than the actual pattern.

2. [Architecture] nonce-delivery contract — RESOLVED  
   Evidence: `tasks/spec.md:38-43`, `tasks/spec.md:164-165`, `tasks/spec.md:119`, `tasks/todo.md:10`, `tasks/todo.md:28-29`. v2 explicitly requires both `x-nonce` and request-side `Content-Security-Policy`, documents the request/response asymmetry, and adds both Phase-0 recon and a staging DevTools check for framework script nonce injection.

3. [Security] auth-fail-closed vs CSP-fail-open split — RESOLVED  
   Evidence: `tasks/spec.md:36`, `tasks/spec.md:149`, `tasks/spec.md:161-163`, `tasks/spec.md:191-192`, `tasks/todo.md:13`, `tasks/todo.md:41-49`. The spec now clearly separates auth decisioning from CSP decoration and states fail-closed for auth vs fail-open only for CSP decoration.

4. [Correctness] matcher anchored patterns — RESOLVED  
   Evidence: `tasks/spec.md:24-32`, `tasks/spec.md:160`, `tasks/todo.md:9`, `tasks/todo.md:50`. v2 replaces the loose prefixes with anchored segment patterns and adds the previously missing prefetch guards.

5. [Correctness] report normalization contract — RESOLVED  
   Evidence: `tasks/spec.md:64-76`, `tasks/spec.md:82`, `tasks/spec.md:90`, `tasks/spec.md:189`, `tasks/spec.md:197`, `tasks/todo.md:15`, `tasks/todo.md:35-37`, `tasks/todo.md:60`. Legacy `csp-report`, modern Reporting API arrays, batch handling, and non-`csp-violation` filtering are now specified in enough detail.

6. [Security] content-type early-reject + shared-store caveat — RESOLVED  
   Evidence: `tasks/spec.md:66-69`, `tasks/spec.md:166-170`, `tasks/spec.md:187`, `tasks/spec.md:213-214`, `tasks/todo.md:15`, `tasks/todo.md:57-59`. v2 explicitly requires early content-type rejection before body read and documents the shared in-memory limiter as best-effort only.

7. [Contract] middleware tests added — PARTIAL  
   Evidence: `tasks/spec.md:98-99`, `tasks/spec.md:154`, `tasks/todo.md:19`, `tasks/todo.md:52`. v2 does add `src/middleware.test.ts` with the missing dashboard and exclusion scenarios, but two of those cases rely on Next.js matcher bypass rather than middleware function behavior. As written, the test contract is not fully executable without a matcher-aware harness.

8. [Contract] policy-directive test brittleness — RESOLVED  
   Evidence: `tasks/spec.md:95-97`, `tasks/todo.md:17`, `tasks/todo.md:37`. v2 explicitly switches to normalized semicolon-split assertions instead of raw byte-for-byte string equality.

9. [Architecture] `env` field replaced by `host` — RESOLVED  
   Evidence: `tasks/spec.md:85-93`, `tasks/spec.md:171`, `tasks/todo.md:16`. The contract now uses `req.headers.get("host")` and explicitly removes `env`.

10. [Nice-to-have] `style-src 'unsafe-inline'` confirmation — OUT-OF-SCOPE-NOW  
    Evidence: `tasks/spec.md:16`, `tasks/spec.md:125-132`, `tasks/spec.md:129`, `memory/security.md:102-103`. v2 keeps `'unsafe-inline'` for D1 and parks strict `style-src` for D2/follow-up, which matches the R1 triage.

## New Findings (if any)

1. [Architecture] The request-side CSP header flow is internally inconsistent and can mislead the generator on the critical `NextResponse.next({ request: { headers } })` step.  
   Evidence: `tasks/spec.md:45`, `tasks/spec.md:149`, `tasks/spec.md:161-165`, `tasks/todo.md:41-49`. The spec says CSP decoration "operiert auf `response`", but request-header forwarding cannot mutate an already-created response; it requires constructing a fresh `NextResponse.next(...)` for pass-through requests. That matters because the whole nonce-extraction mechanism depends on this exact branch shape. Redirect responses are explicitly exempted in `tasks/todo.md:48`, so the "final `NextResponse.next()` oder `NextResponse.redirect()` appended" wording is too loose for the actual mechanics.

2. [Contract] The middleware exclusion tests are not actionable as written because matcher bypass is outside direct middleware-function execution.  
   Evidence: `tasks/spec.md:98-99`, `tasks/spec.md:154`, `tasks/spec.md:160`, `tasks/todo.md:19`, `src/middleware.ts:4-27`. A direct unit test of `middleware(req)` will not exercise `config.matcher.missing` or the negative-lookahead source; Next.js applies those before the function runs. The current spec asks for `/api/csp-report` and `/_next/static/*` "no CSP header" tests without defining a matcher-aware test method, which invites either false tests or extra in-function bypass logic that contradicts the design.

3. [Correctness] The Content-Type contract now contradicts itself: spec says exact match, todo says `startsWith`.  
   Evidence: `tasks/spec.md:66`, `tasks/todo.md:57`. Exact matching would reject common valid values like `application/json; charset=utf-8` or `application/reports+json; charset=utf-8`, while the todo uses the more realistic `startsWith` pattern. One contract needs to win.

4. [Contract] The test-count target is wrong relative to the enumerated minimum tests.  
   Evidence: `tasks/spec.md:95-99`, `tasks/todo.md:17-21`. The spec minimums are 8 + 8 + 5 = 21 new tests, not 20; the todo wording effectively lists 8 + 8 + 6 scenarios in the middleware file. `312 → ≥332` does not match either enumeration.

5. [Correctness] The log-format section still contradicts itself on IP semantics.  
   Evidence: `tasks/spec.md:87`, `tasks/spec.md:91`. The JSON example still says `"ip":"<hashed-or-unknown>"`, but the bullets immediately below require raw `X-Real-IP` or `"unknown"` and explicitly say "nicht gehashed hier". The example should be corrected or the contract is ambiguous.

6. [Contract] Phase-0 recon is directionally right but still underspecified as a deliverable for the critical Next.js 16 nonce unknown.  
   Evidence: `tasks/spec.md:105-107`, `tasks/spec.md:119`, `tasks/todo.md:28-31`, `patterns/nextjs.md:193-195`. The spec names the right questions, but it does not require a concrete artifact such as the doc URL/section, a tiny repro, or an automated assertion. Given that this unknown is called out as critical, the current wording still allows a weak "checked docs" claim without proof.

## Verdict
NEEDS WORK

## Summary
R1 verification: 6 RESOLVED, 2 PARTIAL, 1 OUT-OF-SCOPE-NOW, 0 NOT-RESOLVED.  
New findings: 6 total — 2 Contract, 2 Correctness, 1 Architecture, 1 additional Contract/PMC actionability gap.  
Net: v2 is materially better and fixes most R1 issues, but the middleware/request-header mechanics and the now-internal contract contradictions are still strong enough to block approval.
