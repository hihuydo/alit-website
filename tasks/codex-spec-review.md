# Codex Spec Review — 2026-04-17 (Round 2)

## Scope
Spec: tasks/spec.md (T0-Auth-Hardening Sprint A — bcrypt-Rehash)
Sprint Contract: 18 code-level + 10 staging + 8 prod Done-Kriterien from tasks/todo.md
Basis: Round 1 = SPLIT RECOMMENDED (accepted by user). Sonnet qa-report.md = NEEDS WORK (pre-impl state, expected).

## Round-1 Finding Status
- [Contract] 1 `BCRYPT_ROUNDS` compose-wiring: addressed. Now Must-Have in spec and contract, including both compose files plus `.env.example` (`tasks/spec.md:86-89`, `tasks/todo.md:21-23`, `docker-compose.yml:8-15`, `docker-compose.staging.yml:8-15`, `.env.example:1-19`).
- [Contract] 2 manual browser steps: addressed. Still present, but now explicitly framed as post-staging/post-prod manual verification rather than pretending to be generator-only (`tasks/todo.md:29-53`).
- [Correctness] 1 `rehash_failed` gate unreliable via DB-only: addressed. Sprint A now requires DB + stdout dual-gate and matches the current stdout-first audit architecture (`tasks/spec.md:98-107`, `tasks/todo.md:36-41`, `src/lib/audit.ts:4-7`, `src/lib/audit.ts:56-69`).
- [Correctness] 2 cookie set-check on wrong endpoint: deferred-correctly. Cookie migration is out of Sprint A; the remaining cookie check is now on login response, which is the correct write path (`tasks/spec.md:107`, `src/app/api/auth/login/route.ts:56-64`).
- [Correctness] 3 parser drift between auth and instrumentation: addressed. Shared `bcrypt-rounds.ts` leaf module is now the contract for both call sites (`tasks/spec.md:31-45`, `tasks/spec.md:75-84`, `tasks/todo.md:10-12`, `tasks/todo.md:20`).
- [Security] 1 cookie migration without fallback-removal phase: deferred-correctly to Sprint B (`tasks/spec.md:121`, `tasks/spec.md:204-211`).
- [Security] 2 `sameSite` strict→lax relaxation: addressed. Sprint A explicitly keeps `strict` and the current codebase already does so (`tasks/spec.md:122`, `tasks/todo.md:142`, `src/app/api/auth/login/route.ts:58-63`).
- [Architecture] 1 two migration classes bundled together: addressed. Sprint A is now server-side bcrypt/rehash/audit/boot/compose only; cookie migration is split out (`tasks/spec.md:7`, `tasks/spec.md:11-15`, `tasks/spec.md:119-129`, `tasks/spec.md:202-213`).

## New Findings (Round 2)

### [Correctness]
- `parseCost()` is still under-specified for malformed non-bcrypt strings. The spec requires `parseCost(hash: string): number | null` and only asks for one happy-path test plus one generic malformed test (`tasks/spec.md:67`, `tasks/spec.md:93`, `tasks/spec.md:189`; `tasks/todo.md:12`, `tasks/todo.md:74`). That leaves room for a naïve dollar-split parser that would misread strings like `$argon2i$v=19$...` or other dollar-rich garbage as a numeric “cost”, which could silently skip rehashing or branch incorrectly. Suggested fix: make the contract bcrypt-prefix-specific (`$2a$`, `$2b$`, `$2y$` only), require exactly two cost digits, and add explicit tests for `argon2`/non-bcrypt inputs and malformed strings that still contain `$`.

### [Nice-to-have]
- `pnpm audit --prod` and `pnpm lint` are broader repo hygiene gates, not Sprint-A-specific deploy-safety checks. Keeping them as hard Done-Kriterien can block the sprint for unrelated baseline issues even if bcrypt/rehash/audit/compose wiring is correct (`tasks/todo.md:24-27`, `tasks/todo.md:89-92`). `pnpm build` and targeted tests belong in Must-Have; generic audit/lint are better as follow-up or “run if green already”.

## Verdict
NEEDS WORK

## Summary
2 findings — 1 Correctness, 1 Nice-to-have.
