# Sprint: D1 — CSP Report-Only Baseline
<!-- Spec: tasks/spec.md -->
<!-- Started: 2026-04-18 -->
<!-- Status: Draft — spec awaiting approval -->

## Done-Kriterien
> Alle müssen PASS sein bevor der Sprint als fertig gilt. Rein Code-seitige Kriterien — Deploy-Verifikation liegt in der PMC (spec.md → Pre-Merge Checklist), nicht Sprint-Contract.

- [ ] **src/middleware.ts** erweitert: Matcher deckt alle nicht-statischen Routes ab (`_next/static|_next/image|favicon.ico|fonts/|api/csp-report|api/media|api/health` excluded); bestehender Auth-Guard für `/dashboard/*` weiterhin funktional
- [ ] **Per-Request-Nonce** generiert: 16 random bytes → base64, ≥22 chars; auf `x-nonce` Request-Header via `NextResponse.next({ request: { headers } })` gesetzt
- [ ] **Response-Header `Content-Security-Policy-Report-Only`** mit der in Spec §3 definierten Policy (14 Directives in exakter Reihenfolge, nonce interpoliert)
- [ ] **Response-Header `Reporting-Endpoints`** `csp-endpoint="/api/csp-report"` gesetzt
- [ ] **src/lib/csp.ts** existiert als edge-safe pure-TS leaf (kein Import von `pg`, `bcryptjs`, `./db`, `./audit`, `./auth`, `./cookie-counter`)
- [ ] **src/app/api/csp-report/route.ts** existiert: POST-Handler mit Body-Cap 10 KB, Rate-Limit 30/15min per X-Real-IP, stdout-log structured JSON (`{"type":"csp_violation",...}`), 204-Response. Non-POST → 405. Oversized body → 413. Malformed JSON → 400. Rate-Limit → 429
- [ ] **src/lib/csp.test.ts** existiert mit ≥6 Tests: nonce-Format, buildCspReportOnlyHeader 14-directive-exact-order, nonce-interpolation, self-grep-Edge-Safety (inkl. Regex-Match auf forbidden imports)
- [ ] **src/app/api/csp-report/route.test.ts** existiert mit ≥5 Tests: happy-path 204, 405, 413, 400, 429
- [ ] **`pnpm build`** läuft ohne Errors/Warnings; Next.js Build-Output bestätigt `middleware` nicht Edge-Bundle-gebrochen
- [ ] **`pnpm test`** grün: ≥322 Tests passing (312 current + ≥10 new)
- [ ] **`pnpm audit --prod`** zeigt 0 HIGH/CRITICAL

## Tasks

### Phase 0 — Pre-Impl Recon (30 min)

- [ ] Prüfen ob `src/lib/rate-limit.ts` oder `src/lib/rateLimit.ts` existiert (Signup-Forms Sprint 6). Falls ja: Shape dokumentieren (Signature, key-scheme), um in `/api/csp-report/route.ts` andocken zu können
- [ ] `grep -rn "ratelimit\|rate-limit\|rateLimit" src/` um existing-patterns zu finden
- [ ] Next.js 16 Middleware-Doku schnell verifizieren: `NextResponse.next({ request: { headers: newHeaders } })` ist in v16 noch stable — falls deprecated, Alternative (header-only via `response.headers.set`)
- [ ] Verifizieren: generiert Next.js 16 framework-scripts automatisch mit nonce wenn CSP-Header nonce enthält? (Next.js 13+ Feature, aber 16-specific check — staging-DevTools final authority, aber Doku-check vorab)

### Phase 1 — CSP Helper + Tests

- [ ] `src/lib/csp.ts` anlegen mit `generateNonce()`, `buildCspReportOnlyHeader(nonce)`, `CSP_REPORT_ENDPOINT = "/api/csp-report"` const
- [ ] Policy-Template als const Array von Directives (nicht concatenated String) für Test-Lesbarkeit + Wartbarkeit
- [ ] `src/lib/csp.test.ts` mit 6+ Tests: (1) nonce-length≥22 + base64-regex, (2) nonce-uniqueness zwischen calls, (3) header enthält alle 14 directives in exakter order, (4) nonce ist in script-src interpoliert, (5) self-grep kein forbidden import, (6) report-uri matches CSP_REPORT_ENDPOINT

### Phase 2 — Middleware Integration

- [ ] `src/middleware.ts` erweitern: Nonce-Generation via `crypto.getRandomValues`, Request-Header setzen via `NextResponse.next({ request: { headers } })`, CSP-Report-Only Response-Header setzen, Reporting-Endpoints Header setzen
- [ ] Bestehenden Auth-Guard-Pfad preserve: `if (pathname.startsWith("/dashboard")) { verify }` innerhalb der Funktion
- [ ] Matcher auf negative-lookahead erweitern; bestehende `/dashboard/*` Einträge entfallen (jetzt via Pfad-Check)
- [ ] Defensive try/catch um den CSP-Block (Nonce-Gen-Fehler → kein Header, Request geht durch, error to stderr)

### Phase 3 — CSP Report Endpoint

- [ ] `src/app/api/csp-report/route.ts` anlegen mit POST-Handler
- [ ] Body-Size-Cap 10 KB via `req.text()` + length-check (nicht `.json()` direkt, weil malformed JSON vor Cap crashen würde)
- [ ] Rate-Limit anbinden (aus Phase 0 Recon)
- [ ] Structured-log-Format implementieren (ein-zeiliger JSON.stringify)
- [ ] Non-POST-Methoden: `return new NextResponse(null, { status: 405, headers: { allow: "POST" } })`
- [ ] `src/app/api/csp-report/route.test.ts` mit 5 Tests

### Phase 4 — Validation

- [ ] `pnpm test` — 322+ tests passing
- [ ] `pnpm build` — clean, kein Edge-Bundle-Warning
- [ ] `pnpm audit --prod` — 0 HIGH/CRITICAL
- [ ] `memory/security.md` T1-CSP-Items auf `[~]` (partial) bumpen mit Datum
- [ ] Commit `tasks/spec.md` → post-commit-Hook triggert Sonnet-Evaluator

## Notes

- **Scope-Size:** Medium (5 Files, 3 new + 1 modified + 1 memory-update, ~200-300 LOC, Security-critical). **Codex Spec-Review VOR Generator-Start pflicht** — Middleware-Matcher-Regex + Nonce-Delivery-Pattern sind genau die Art von Entscheidungen, wo ein zweiter Reviewer Edge-Cases fängt (siehe `patterns/workflow.md` "Variante A / Variante B für Medium Major-Bumps" — CSP ist kein Major-Bump, aber ähnliche Disziplin).
- **Pattern-Referenzen beim Impl:** `patterns/nextjs.md` (Middleware → Server Component via request.headers, Edge-safe leaf via file-content-regex-test, eager env-validation), `patterns/deployment-nginx.md` (nginx add_header-inheritance — nicht betroffen, aber für Kontext).
- **Sprint-Contract vs PMC-Trennung:** Sprint-Contract enthält NUR Code-Deliverables. Deploy-Verifikation (Staging-Smoke + Prod-Health-Check) ist in spec.md → "Pre-Merge Checklist" als separate PMC dokumentiert — siehe `patterns/workflow.md` "Pre-Deploy-Audit als Phase 0 statt Phase 4".
- **Keine DB-Migration, keine neuen Env-Vars, keine Package-Deps.** Reiner App-Code + Test-Code.
- **Rollback-Plan:** Single-PR, revert-friendly. Falls White-Screen oder 500er in Staging: git revert, neu pushen. Falls Report-Endpoint-Flood in Prod: vorübergehend `/api/csp-report` auf `return new NextResponse(null, { status: 429 })` hardcoden und PR vorbereiten.
- **Sprint D2 (NICHT dieser Sprint):** Wenn 7 Tage Report-Stream clean: Policy in `src/lib/csp.ts` exportiert 2 Varianten (`buildCspReportOnlyHeader` + `buildCspHeader`), Middleware-Flip ist 1-Line-Change. D2 wird entsprechend trivial.
