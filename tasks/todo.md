# Sprint: D1 — CSP Report-Only Baseline
<!-- Spec: tasks/spec.md v2 -->
<!-- Started: 2026-04-18 -->
<!-- Status: Draft v3 — Codex-Spec-Review R2 wording/mechanical fixes addressed; scope unchanged -->

## Done-Kriterien
> Alle müssen PASS sein bevor der Sprint als fertig gilt. Rein Code-seitige Kriterien — Deploy-Verifikation liegt in der PMC (spec.md → Pre-Merge Checklist), nicht Sprint-Contract.

- [ ] **src/middleware.ts** Matcher narrowed auf Document-Requests via Object-Form mit anchored segment patterns (`_next/static(?:/|$)`, `_next/image(?:/|$)`, `api(?:/|$)`, `fonts(?:/|$)`, `favicon\.ico$`) + `missing`-guards für prefetch-headers (`next-router-prefetch`, `purpose: prefetch`); bestehender `/dashboard/*`-Auth-Guard via Pfad-Check innerhalb der Funktion, fail-closed
- [ ] **Per-Request-Nonce** generiert: 16 random bytes → base64, ≥22 chars; auf Request-Header via `NextResponse.next({ request: { headers } })` gesetzt **beide**: `x-nonce: <nonce>` + `Content-Security-Policy: <enforced-policy-with-nonce>` (für Next.js framework-script-nonce-extraction)
- [ ] **Response-Header `Content-Security-Policy-Report-Only`** mit der in Spec §3 definierten Policy (14 Directives, nonce interpoliert)
- [ ] **Response-Header `Reporting-Endpoints`** `csp-endpoint="/api/csp-report"` gesetzt
- [ ] **CSP-Decoration fail-open** separat vom Auth-Path: innerer try/catch nur um nonce-gen + header-set; Auth-Entscheidung bleibt fail-closed
- [ ] **src/lib/csp.ts** existiert als edge-safe pure-TS leaf (kein Import von `pg`, `bcryptjs`, `./db`, `./audit`, `./auth`, `./cookie-counter`); exportiert `generateNonce()`, `buildCspPolicy(nonce)`, `normalizeCspReport(body, contentType): CspViolation[]`, `CSP_REPORT_ENDPOINT`, `CSP_DIRECTIVES`
- [ ] **src/app/api/csp-report/route.ts** existiert: **Content-Type early-reject (415) vor body-read**, Body-Cap 10 KB → 413, JSON-Parse → 400, Rate-Limit `checkRateLimit(\`csp-report:\${ip}\`, 30, 15*60*1000)` → 429, Report-Normalisierung via `normalizeCspReport` (legacy + modern + batch-support + filter non-csp-violation), ein structured-JSON-log-line pro valider violation nach stdout, 204-Response. Non-POST → 405 mit `Allow: POST`
- [ ] **Log-Format**: `{"type":"csp_violation","blocked_uri":"...","violated_directive":"...","source_file":"...","line_number":N,"referrer":"...","ip":"...","host":"..."}` — host aus `req.headers.get("host")` (nicht `env`, siehe Codex R1 Finding #9)
- [ ] **src/lib/csp.test.ts** ≥8 Tests: nonce-format + uniqueness, policy-directive-structure (normalize+split, NICHT byte-for-byte — per Codex R1 Finding #8), nonce-interpolation, report-uri match, report-to match, self-grep Edge-Safety, `normalizeCspReport` legacy + modern + filter
- [ ] **src/app/api/csp-report/route.test.ts** ≥7 Tests: legacy happy, modern happy, modern batch (3 reports → 3 log-lines), 415 unsupported CT, 413 oversized, 400 malformed, 429 rate-limited, 405 non-POST
- [ ] **src/middleware.test.ts** ≥5 Tests (v3 Test-Strategie per Codex R2 Finding #2): (1) document-request direct-call sets CSP + x-nonce on request-clone, (2) /dashboard/ no-cookie → redirect, (3) /dashboard/ valid-cookie → pass + CSP, (4) **matcher-config-string-assertion** (`expect(config.matcher[0].source).toMatch(...)` + `.missing`-array assertion) statt direct-call für Bypass-Verhalten, (5) CSP-decoration-crash via `vi.spyOn(generateNonce).mockImplementationOnce(throw)` → auth response trotzdem korrekt
- [ ] **`pnpm build`** läuft ohne Errors/Warnings
- [ ] **`pnpm test`** grün: ≥332 Tests passing (312 current + ≥20 new: ≥8 csp + ≥7 route + ≥5 middleware)
- [ ] **`pnpm audit --prod`** zeigt 0 HIGH/CRITICAL

## Tasks

### Phase 0 — Pre-Impl Recon (≤30 min, **kritisch**, konkrete Deliverables per Codex R2 Finding #6)

- [ ] **Deliverable 1 — Next.js 16 CSP-Doku-Evidenz:** URL + zitierter Absatz aus offizieller Doku (Kandidaten: `nextjs.org/docs/app/building-your-application/configuring/content-security-policy`, Release-Notes v16.x). Klärt: (a) `NextResponse.next({ request: { headers } })` noch stable in v16? (b) liest v16 den Nonce aus Request-seitigem `Content-Security-Policy` oder auch aus `-Report-Only`? **Evidence-Snapshot als Code-Comment-Block** in `src/middleware.ts` direkt über dem CSP-Block. **Falls das Verhalten in v16 sich geändert hat → zurück zum Planner.**
- [ ] **Deliverable 2 — Matcher-Config-Recon:** Verifizieren dass Object-Form-Matcher mit `missing: [{type: "header", ...}]` in Next.js 16 supported ist. Quick-grep: `grep -rn "matcher.*missing" node_modules/next/dist/` oder Release-Notes-Check. Falls nicht: Fallback auf Funktions-internes prefetch-header-Check (`req.headers.get("next-router-prefetch")`).
- [ ] **Deliverable 3 — Rate-Limit-API-Confirmation:** `grep -n "^export" src/lib/rate-limit.ts` — Signature + defaults bestätigen (aus Sonnet-qa-report bekannt: `checkRateLimit(key, max=25, windowMs)`, wir müssen `max=30` explicit passieren).
- [ ] Prüfen ob `src/lib/auth-cookie.ts` self-grep-Test-Muster übernommen werden kann für `src/lib/csp.test.ts` (analoge forbidden-list, analoge regex)

### Phase 1 — CSP Helper + Tests

- [ ] `src/lib/csp.ts` anlegen mit `CSP_DIRECTIVES` const-Array (geordnet: default-src, script-src, style-src, img-src, font-src, connect-src, frame-src, media-src, object-src, base-uri, form-action, frame-ancestors, report-uri, report-to), `generateNonce()`, `buildCspPolicy(nonce)`, `normalizeCspReport(body, contentType)`, `CSP_REPORT_ENDPOINT = "/api/csp-report"`
- [ ] `normalizeCspReport` muss beide Shapes handhaben: legacy `{"csp-report": {...dashed keys}}` und modern `[{type: "csp-violation", body: {...camelCase}}, ...]`. Non-csp-violation reports silent-skip. Return-Type: `CspViolation[]` (array für batch-support)
- [ ] `src/lib/csp.test.ts` mit ≥8 Tests; **Policy-Assertion-Style: semicolon-split → trim → directive-name-array assertion + critical-values check**, NICHT byte-for-byte string-equality

### Phase 2 — Middleware Integration

- [ ] `src/middleware.ts` erweitern. Reihenfolge innerhalb der Funktion (v3-Klarstellung per Codex R2 Finding #1):
  1. **Auth-Pfad-Branch** (fail-closed, außerhalb jedes try/catch):
     - Wenn `/dashboard/*` und `verifySessionDualRead(req)` returnt null → `response = NextResponse.redirect(loginUrl)` (KEIN x-nonce-propagation; Browser rendert keine HTML)
     - Sonst (Pass-through): `response = null` — die Response wird im CSP-Block konstruiert, da wir `NextResponse.next({ request: { headers } })` brauchen um Request-Header zu injizieren
  2. **CSP-Decoration** in innerem try/catch:
     - `const nonce = generateNonce()`
     - `const policy = buildCspPolicy(nonce)`
     - **Für Pass-through (response === null):** `const newHeaders = new Headers(req.headers); newHeaders.set("x-nonce", nonce); newHeaders.set("Content-Security-Policy", policy); response = NextResponse.next({ request: { headers: newHeaders } })`
     - **Für Redirect (response !== null):** keine Request-Header-Injection (redirect propagiert nichts); nur Response-Header setzen (siehe unten)
     - `response.headers.set("Content-Security-Policy-Report-Only", policy)`
     - `response.headers.set("Reporting-Endpoints", "csp-endpoint=\"/api/csp-report\"")`
  3. **Catch (CSP-Decoration only):** `console.error("[middleware] CSP decoration failed", err)`. Wenn response bisher null (Pass-through + crash pre-next()): fallback zu `response = NextResponse.next()` ohne CSP-Header. Wenn response bereits redirect: weiter ohne CSP-Header. Auth-Entscheidung ist NIEMALS betroffen.
  4. `return response`
- [ ] Matcher-Config via Object-Form: `{ source: "/((?!_next/static(?:/|$)|_next/image(?:/|$)|api(?:/|$)|fonts(?:/|$)|favicon\\.ico$).*)", missing: [{type: "header", key: "next-router-prefetch"}, {type: "header", key: "purpose", value: "prefetch"}] }`
- [ ] Code-Kommentar über dem CSP-Block referenziert Spec-Section "Nonce-Delivery via request.headers" + "Auth-fail-closed + CSP-fail-open Split" (zukünftige Reviewer verstehen die Header-Asymmetrie)
- [ ] `src/middleware.test.ts` anlegen mit ≥5 Tests

### Phase 3 — CSP Report Endpoint

- [ ] `src/app/api/csp-report/route.ts` anlegen
- [ ] **Content-Type-Check early, VOR body-read (startsWith, v3 per Codex R2 Finding #3):** `const ct = (req.headers.get("content-type") ?? "").toLowerCase(); if (!ct.startsWith("application/csp-report") && !ct.startsWith("application/reports+json") && !ct.startsWith("application/json")) return new NextResponse(null, { status: 415 });` — erlaubt `; charset=utf-8` Suffixe
- [ ] Body-Size-Cap via `req.text()` + length-check (nicht `.json()` direkt — wenn JSON malformed, wirft .json() BEVOR cap-check)
- [ ] Rate-Limit mit explicit `max=30`: `checkRateLimit(\`csp-report:\${ip}\`, 30, 15 * 60 * 1000)`
- [ ] Report-Normalization via `normalizeCspReport(parsedBody, ct)` aus csp.ts → `CspViolation[]`
- [ ] Für jede Violation: ein `console.log(JSON.stringify({type: "csp_violation", ...violation, ip, host}))` (ein-zeilig, kein pretty-print)
- [ ] Non-POST: `return new NextResponse(null, { status: 405, headers: { allow: "POST" } })`
- [ ] `src/app/api/csp-report/route.test.ts` mit ≥7 Tests

### Phase 4 — Validation

- [ ] `pnpm test` — ≥332 tests passing
- [ ] `pnpm build` — clean, kein Edge-Bundle-Warning
- [ ] `pnpm audit --prod` — 0 HIGH/CRITICAL
- [ ] `memory/security.md` T1-CSP-Items auf `[~]` (partial) bumpen mit Datum
- [ ] Status-Line in spec.md von `Draft v2` auf `Implemented v2` bumpen + re-commit → post-commit-Hook re-triggert Sonnet-Evaluator gegen den Code

## Notes

- **Scope-Size:** Medium (6 Files, 4 new + 1 modified + 1 memory-update, ~300-400 LOC, Security-critical). Codex-Spec-Review R1 → 10 findings → v2 addressed 9 in-scope, 1 Nice-to-have geparkt. Codex-Spec-Review R2 → 6 neue Wording/Mechanical-Findings + 8 von 10 R1-resolved → v3 (User-Entscheidung: Option A — Spec-Fix ohne Scope-Split, Max-2-Rule-Override wegen cosmetic nature of R2-findings).
- **Pattern-Referenzen beim Impl:** `patterns/nextjs.md` (Middleware → Server Component via request.headers, Edge-safe leaf via file-content-regex-test, eager env-validation), `patterns/deployment-nginx.md` (kein direkter Impact, nur Kontext), `patterns/api.md` (content-type-validation + early-reject-patterns).
- **Sprint-Contract vs PMC-Trennung:** Sprint-Contract enthält NUR Code-Deliverables. Deploy-Verifikation (Staging-Smoke + Prod-Health-Check + Next.js-16-nonce-DevTools-Check) ist in spec.md → "Pre-Merge Checklist" als separate PMC dokumentiert.
- **Keine DB-Migration, keine neuen Env-Vars, keine Package-Deps.** Reiner App-Code + Test-Code.
- **Rollback-Plan:** Single-PR, revert-friendly. Falls 500er in Staging: git revert, neu pushen. Falls Report-Endpoint-Flood in Prod: vorübergehend `/api/csp-report` auf `return new NextResponse(null, { status: 429 })` hardcoden.
- **Sprint D2 (NICHT dieser Sprint):** Wenn 7 Tage Report-Stream clean: Policy-Generation in `src/lib/csp.ts` hat 1 Export (`buildCspPolicy`), Middleware-Response-Header-Name von `Content-Security-Policy-Report-Only` auf `Content-Security-Policy` flippen. Request-Header bleibt unverändert. D2 wird trivial (1-2 lines + PMC-Smoke).
