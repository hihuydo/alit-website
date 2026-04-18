# Spec: Sprint D1 — CSP Report-Only Baseline (Tier-1 Security-Hardening)
<!-- Created: 2026-04-18 -->
<!-- Updated: 2026-04-18 v2 — 9 Codex-Spec-R1 findings addressed (matcher narrowing, Next.js-16 nonce-delivery, auth-fail-closed + CSP-fail-open split, report normalization contract, middleware tests, test brittleness, env-derivation) -->
<!-- Author: Planner (Claude) -->
<!-- Status: Draft v2 -->

## Summary
Erster von zwei Sprints zum Aufbau einer strikten Content-Security-Policy. D1 fügt einen `Content-Security-Policy-Report-Only`-Header mit per-Request-Nonce über die Next.js Middleware hinzu + einen `/api/csp-report`-Endpoint zum Sammeln von Violation-Reports. Kein enforcement, kein User-sichtbarer Render-Impact — reine Observability-Baseline. D2 (separater Sprint, nach ≥7 Tagen Report-Stream ohne echte Violations) flippt dann zu enforced strict.

## Context
- **Aktueller Stand (verifiziert via Recon):** Gar kein CSP-Header gesetzt — weder in `nginx/alit.conf`/`nginx/alit-staging.conf` noch in Next.js. Einziger Einzelfall: `/api/media/[id]/route.ts` setzt `sandbox; default-src 'none'` nur für Media-Responses (SVG-XSS-Mitigation aus `patterns/deployment-nginx.md`).
- **Middleware:** `src/middleware.ts` existiert bereits, Edge-Runtime, Matcher aktuell nur `["/dashboard", "/dashboard/", "/dashboard/:path*"]` für Auth-Guard via `verifySessionDualRead`.
- **Inline-HTML-Surface minimal (aber nicht null):** Kein inline `<script>`/`<style>`, kein `dangerouslySetInnerHTML` (außer ein Kommentar), kein `<Script>`-Component, kein JSON-LD. **Aber:** Next.js injiziert framework-inline-scripts (RSC-Hydration, Navigation, Preload) zur Runtime — die brauchen nonce über das Next.js-13+-Pattern, bei dem Middleware sowohl `x-nonce` als auch `Content-Security-Policy` auf den **Request-Header** forwardet. Next.js extrahiert den Nonce während des Renderings aus dem Request-seitigen CSP-Header.
- **iframes:** nur YouTube + Vimeo (`www.youtube.com`, `player.vimeo.com`) über `JournalBlockRenderer` + Dashboard-Editor-Embeds. `frame-src`-Whitelist klar bestimmt.
- **Tailwind v4:** compile-time, keine Runtime-CSS-in-JS.
- **React-Inline-Style-Attribute:** z.B. `style={{ height: "..." }}` im `JournalBlockRenderer` Spacer-Block, `style={{ fontFamily: "system-ui" }}` im Dashboard-Body. Diese brauchen `style-src 'unsafe-inline'` (CSP-3 Level, `'unsafe-hashes'` ist in Browsern unzuverlässig). Strict style-src ist separater Follow-up-Sprint.
- **Rate-Limit-Library:** `src/lib/rate-limit.ts` existiert mit `checkRateLimit(key, max?, windowMs?)`, process-weit shared `Map` + probabilistic-eviction. Default max=25.
- **Referenz-Patterns:** `patterns/nextjs.md` (Middleware → Server Component Kommunikation via `request.headers`, Edge-safe leaf via file-content-regex-test), `patterns/deployment-nginx.md` (nginx `add_header`-Inheritance-Trap — CSP kommt aber aus Next.js, nicht nginx), `patterns/api.md` (content-type validation + early-reject patterns).

## Requirements

### Must Have (Sprint Contract)

1. **Middleware-Matcher narrowed auf Document-Requests** — `src/middleware.ts` bekommt einen Matcher, der **ausschließlich Document-Requests** abdeckt, nicht JSON/binary API-Traffic. Ausgenommen via negative-lookahead mit anchored segment patterns:
   - `/_next/static(?:/|$)` — statische Assets
   - `/_next/image(?:/|$)` — Next.js Image-Optimizer
   - `/api(?:/|$)` — **broad exclusion aller API-Routes** (inkl. `/api/csp-report`, `/api/media`, `/api/health`, `/api/auth`, `/api/dashboard/*`, `/api/signup/*`)
   - `/fonts(?:/|$)` — self-hosted fonts
   - `/favicon\.ico$` — anchored auf exact match
   
   Plus **Prefetch-Exclusion** via `missing` conditions (Matcher-Object-Form):
   - `missing: [{ type: "header", key: "next-router-prefetch" }, { type: "header", key: "purpose", value: "prefetch" }]`
   
   **Begründung:** CSP-Header auf JSON/binary Responses ist semantisch leer (Browser interpretieren CSP nur auf HTML-Responses) und erhöht unnötig den Coupling-Surface. D1-Ziel ist HTML-Observability.
   
   Bestehender Auth-Guard für `/dashboard/*` bleibt komplett funktional (Pfad-Check innerhalb der Middleware-Funktion, nicht via Matcher — alle `/dashboard/*`-Routes sind Document-Requests, kommen durch den narrow matcher).

2. **Per-Request-Nonce + Request-seitiger CSP-Header** — Für jede gematched Route:
   - 128-bit-Nonce (16 random bytes → base64, ≥22 chars) via `crypto.getRandomValues`
   - Auf **Request-Header** (via `NextResponse.next({ request: { headers: newHeaders } })`):
     - `x-nonce: <nonce>` — für expliziten Lookup aus Server-Components via `headers().get("x-nonce")`
     - `Content-Security-Policy: <same-policy-with-nonce>` — **kritisch für Next.js-Framework-Script-Nonce-Auto-Injection**. Next.js liest den Nonce aus dem Request-seitigen CSP-Header und appliziert ihn auf framework-generierte Inline-Scripts.
   - **Decoupling-Pattern:** Request-seitiger Header ist enforced-CSP (nötig für Next.js nonce-extraction); Response-seitiger Header (siehe #3) ist Report-Only (was der Browser sieht). Browser enforced NICHT, reported nur. D2 wird einfach der Response-Header von `-Report-Only` auf enforced `Content-Security-Policy` umgebogen — keine weiteren Änderungen.

3. **Response-Header `Content-Security-Policy-Report-Only`** — auf die finale `NextResponse.next()` oder `NextResponse.redirect()` appended. Policy-String (semikolon-separiert, directives in der in `csp.ts` definierten Reihenfolge):
   ```
   default-src 'self';
   script-src 'self' 'nonce-{NONCE}' 'strict-dynamic';
   style-src 'self' 'unsafe-inline';
   img-src 'self' data: blob:;
   font-src 'self';
   connect-src 'self';
   frame-src 'self' https://www.youtube.com https://player.vimeo.com;
   media-src 'self' blob:;
   object-src 'none';
   base-uri 'self';
   form-action 'self';
   frame-ancestors 'none';
   report-uri /api/csp-report;
   report-to csp-endpoint;
   ```
   Plus `Reporting-Endpoints: csp-endpoint="/api/csp-report"` Response-Header für modernen Report-API-Support.

4. **`/api/csp-report` POST-Endpoint mit Report-Normalisierung** — `src/app/api/csp-report/route.ts`:
   - **Method-Gate:** Non-POST → 405 mit `Allow: POST` header
   - **Content-Type early-reject (VOR body-read):** Accept exakt `application/csp-report`, `application/reports+json`, oder `application/json`. Sonst 415 Unsupported Media Type
   - **Body-Size-Cap:** 10 KB (via `req.text()` + length-check pre-JSON-parse → bei oversize 413)
   - **JSON-Parse:** Malformed → 400 Bad Request, kein Log, kein Crash
   - **Rate-Limit:** `checkRateLimit(\`csp-report:\${ip}\`, 30, 15 * 60 * 1000)` (X-Real-IP, reuse `src/lib/rate-limit.ts`). Bei 429: kein Log. **Shared-store-Caveat dokumentiert** (Risk #5): best-effort, not ingress-protection.
   - **Report-Normalisierung (neu v2):**
     - Legacy `application/csp-report` (Firefox, Safari): Body-Shape `{"csp-report": {"blocked-uri": "...", "violated-directive": "...", "source-file": "...", "line-number": N, "referrer": "..."}}` → extrahiere dashed keys direkt
     - Moderner `application/reports+json` (Chrome, Edge): Body-Shape `[{"type": "csp-violation", "body": {"blockedURL": "...", "effectiveDirective": "...", "sourceFile": "...", "lineNumber": N, "referrer": "..."}}, ...]` — **Array kann mehrere reports enthalten**. Für jeden Entry:
       - `type !== "csp-violation"` → silent-skip (filter out `deprecation`/`intervention`/etc.)
       - `type === "csp-violation"` → camelCase keys auf das gemeinsame Log-Schema mappen (siehe #6)
     - `application/json` (manual/legacy): versuche zuerst legacy-shape, dann modern-array-shape, sonst log raw
   - **Bei Success:** ein structured-JSON-log-line pro valider Violation (mehrere reports im Batch = mehrere log-lines), dann 204.

5. **CSP-Helper als edge-safe leaf** — `src/lib/csp.ts` pure TS:
   - `generateNonce(): string` — 16 random bytes → base64
   - `buildCspPolicy(nonce: string): string` — Policy-String aus `CSP_DIRECTIVES` const-Array (12 policy-directives + 2 reporting-directives)
   - `CSP_REPORT_ENDPOINT = "/api/csp-report"` const
   - `normalizeCspReport(body: unknown, contentType: string): CspViolation[]` — pure parser für beide report-formats, returned array (für batch-support)
   - **Forbidden imports:** `pg`, `bcryptjs`, `./db`, `./audit`, `./auth`, `./cookie-counter`. Self-grep-Test analog `src/lib/auth-cookie.ts`.

6. **Log-Format CSP-Violations** — Ein ein-zeiliger structured JSON-log pro Violation:
   ```json
   {"type":"csp_violation","blocked_uri":"...","violated_directive":"...","source_file":"...","line_number":0,"referrer":"...","ip":"<hashed-or-unknown>","host":"alit.hihuydo.com"}
   ```
   - `type`: literal `"csp_violation"` (grep-Diskriminator)
   - `blocked_uri`, `violated_directive`, `source_file`, `line_number`, `referrer`: aus Report normalisiert (v2: common keys, beide Shapes mappen)
   - `ip`: X-Real-IP (nicht gehashed hier, Server-local log, nicht persisted)
   - `host`: aus `req.headers.get("host")` — erlaubt Staging vs. Prod-Unterscheidung ohne env-Var-Abhängigkeit (v2 replacement für `env: "prod|staging"` — NODE_ENV ist in beiden `production`)
   - Kein `env`-Field (v2 change, per Codex R1 Finding #9)

7. **Unit-Tests** — Neue Tests:
   - **`src/lib/csp.test.ts`** (≥8 cases): (1) nonce-Format base64 ≥22 chars, (2) nonce uniqueness über N iterations, (3) `buildCspPolicy` enthält alle 14 directive-names in **strukturierter Assertion** (semicolon-split → trim → directive-name-order prüfen, NICHT byte-for-byte string-equality) — per Codex R1 Finding #8, (4) Nonce korrekt in `script-src` interpoliert, (5) `report-uri` = `CSP_REPORT_ENDPOINT`, (6) `report-to` = `csp-endpoint`, (7) self-grep regex prüft Edge-Safety (keine forbidden imports), (8) `normalizeCspReport` parst legacy + modern + filtert non-csp-violation
   - **`src/app/api/csp-report/route.test.ts`** (≥7 cases): (1) happy legacy 204, (2) happy modern 204, (3) modern batch mit 3 reports → 3 log-lines → 204, (4) unsupported Content-Type → 415 (vor body-read!), (5) oversized body → 413, (6) malformed JSON → 400, (7) rate-limit exceeded → 429, (8) non-POST → 405
   - **`src/middleware.test.ts`** (≥5 cases, **neu in v2 per Codex R1 Finding #7**): (1) Document-Request ohne Auth-Gated-Path → sets CSP-Report-Only + x-nonce on request, (2) `/dashboard/` ohne cookie → redirect-to-login (CSP fail-open: auch wenn CSP-setup crashen würde, auth path stays fail-closed), (3) `/dashboard/` mit valid cookie → pass-through + CSP headers, (4) excluded path `/api/csp-report` → no CSP header (matcher bypass), (5) excluded path `/_next/static/chunks/...` → no CSP header
   - Gesamt: 312 → ≥332 Tests passing (20 new).

8. **Build + Audit clean** — `pnpm build` ohne Errors/Warnings (insbesondere kein Edge-Bundle-Break), `pnpm audit --prod` zeigt 0 HIGH/CRITICAL, alle bestehenden Tests grün.

### Pre-Merge Checklist (PMC — nicht Sprint-Contract, separater Deploy-Check)

- **Phase 0 — Pre-Impl Recon (vor jeder Zeile Code):**
  - Prüfen: Next.js 16 `NextResponse.next({ request: { headers } })` — noch stable in v16, oder deprecated?
  - Prüfen: Next.js 16 nonce-extraction — liest es den Nonce aus `Content-Security-Policy` Request-Header, oder auch aus `Content-Security-Policy-Report-Only`? Falls nur enforced funktioniert → Request-Header muss enforced sein (unsere aktuelle Lösung); falls beide → egal
  - `grep rate-limit src/lib/` um rate-limit-API-Shape final zu bestätigen
- **Staging-Smoke-Verifikation:**
  - `curl -sI https://staging.alit.hihuydo.com/` zeigt `content-security-policy-report-only: default-src 'self'; script-src 'self' 'nonce-...' 'strict-dynamic'; ...` etc.
  - Zwei curl in Folge: unterschiedliche Nonces
  - `curl -I https://staging.alit.hihuydo.com/api/health/` zeigt **kein** CSP-Header (matcher excluded)
  - `curl -I https://staging.alit.hihuydo.com/api/media/<uuid>/` zeigt **kein** CSP-Report-Only-Header (matcher excluded; bestehender sandbox-Header bleibt)
  - `curl -X POST https://staging.alit.hihuydo.com/api/csp-report -H "content-type: application/csp-report" -d '{"csp-report":{"blocked-uri":"test","violated-directive":"script-src","source-file":"test","line-number":1}}'` returnt 204
  - `curl -X POST https://staging.alit.hihuydo.com/api/csp-report -H "content-type: application/reports+json" -d '[{"type":"csp-violation","body":{"blockedURL":"test-modern","effectiveDirective":"script-src","sourceFile":"test","lineNumber":1}}]'` returnt 204
  - `curl -X POST https://staging.alit.hihuydo.com/api/csp-report -H "content-type: text/plain" -d 'foo'` returnt 415 (Unsupported Media Type, vor body-read)
  - `ssh hd-server 'docker logs alit-staging --tail=50 | grep csp_violation | jq .'` zeigt beide Test-Reports mit korrekten Feldern (sowohl `blocked_uri: "test"` als auch `blocked_uri: "test-modern"`)
  - Homepage + /de + /fr + /de/alit + /de/projekte + /de/projekte/<any-slug> + /dashboard/login + /dashboard (nach Login) rendern **identisch** zu vor Deploy, **zero Console-Errors** in DevTools Chrome + Safari
  - **DevTools-Critical-Check (v2):** `<script>` tags im Homepage-HTML haben `nonce="..."` Attribut (verifies Next.js framework-nonce-injection). Falls NICHT: Phase 0 Recon war falsch → zurück zum Planner, nicht weiter deployen.
- **Prod-Deploy-Verifikation (nach Merge):**
  - Gleicher curl-Check gegen `alit.hihuydo.com`
  - `docker logs alit-web --tail 100` clean + enthält `[instrumentation] ready (...)` boot-line
  - Health-Endpoint 200

### Nice to Have (explicit follow-up, NOT this sprint)

1. **Sprint D2 — Enforced strict CSP** — Nach ≥7 Tagen Report-Stream ohne fremde Violations: Response-seitigen `Content-Security-Policy-Report-Only`-Header zu `Content-Security-Policy` umbenennen (1-line change in `src/lib/csp.ts` oder middleware). Request-seitiger Header bleibt unverändert.
2. **COOP/COEP/CORP** — `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Resource-Policy: same-origin` (Tier-1 Quick-Wins aus `memory/security.md`).
3. **Strict `style-src` mit Nonce** — Eliminiert `'unsafe-inline'` für styles, erfordert aber Refactor aller React-Inline-`style`-Props. Per Codex R1 Finding #10 bestätigt: `'unsafe-inline'` in `style-src` ist für D1 die richtige Wahl, strict-style-src in eigenem Sprint.
4. **CSP-Violation-Analyse-Dashboard** — Falls Violation-Volume > 10/Tag: Persistierung in `audit_events`-Tabelle + Dashboard-View (analog PaidHistoryModal aus PR #56).
5. **Dedicated CSP-Report-Endpoint-Rate-Limit-Store** — Falls Flood-Potential zu groß wird: Eigener in-memory Store mit hard-cap statt shared `rate-limit.ts` (per Codex R1 Finding #6, best-effort-caveat aktuell).
6. **Report-URI-Drop nach D2** — wenn enforced Policy 2+ Wochen clean läuft, kann `report-uri` + `/api/csp-report`-Endpoint entfernt werden (oder bleibt für Attempted-Attack-Tracking).

### Out of Scope

- Änderungen an `nginx/alit.conf` / `nginx/alit-staging.conf` — CSP kommt ausschließlich aus Next.js. Bestehende Security-Header (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) bleiben in nginx.
- Änderungen am Dashboard-Content-Security (SVG-Sanitization, Rich-Text-Editor iframe-Whitelist) — bereits in PR #31 adressiert.
- SRI (Subresource Integrity) — wir laden keine externen Scripts.
- Cloudflare/CDN vor alit.hihuydo.com — eigener Sprint (Tier-1 Quick-Win).
- `frame-ancestors 'none'` ist redundant zu nginx `X-Frame-Options: DENY`, wird aber trotzdem in der CSP gesetzt (Defense-in-Depth, moderne Browser bevorzugen CSP).
- Persistierung der Violations in `audit_events` — nur stdout in D1.

## Technical Approach

### Files to Change

| File | Change Type | Description |
|------|-------------|-------------|
| `src/middleware.ts` | Modify | Matcher narrowed auf Document-Requests (Object-Form mit `missing`-prefetch-guards). Nonce-Generation (`crypto.getRandomValues`). Request-Headers setzen: `x-nonce` + `Content-Security-Policy`. Response-Headers setzen: `Content-Security-Policy-Report-Only` + `Reporting-Endpoints`. Bestehender Auth-Guard-Branch nur für `/dashboard/*` (Pfad-Check innerhalb, `fail-closed`). CSP-Decoration in separatem inneren try/catch (`fail-open` auf die bereits-berechnete Auth-Response — per Codex R1 Finding #3). |
| `src/lib/csp.ts` | Create | Pure edge-safe Helper: `generateNonce()`, `buildCspPolicy(nonce)`, `normalizeCspReport(body, contentType): CspViolation[]`, `CSP_REPORT_ENDPOINT` const, `CSP_DIRECTIVES` const-Array (ordered). Keine Imports außer Edge-Runtime-built-ins. |
| `src/lib/csp.test.ts` | Create | Unit-Tests (≥8 cases): nonce-Format + uniqueness, Policy-Directive-Structure (normalize + split, not byte-for-byte), nonce-Interpolation, report-uri/report-to match, normalizeCspReport legacy + modern + filter, self-grep-Edge-Safety. |
| `src/app/api/csp-report/route.ts` | Create | POST-Handler mit Content-Type-early-reject (415), Body-Cap (10KB → 413), JSON-Parse (malformed → 400), Rate-Limit 30/15min (reuse `rate-limit.ts` mit explicit max=30), Report-Normalization via `normalizeCspReport`, structured-log nach stdout (ein line pro valider violation), 204-Response. |
| `src/app/api/csp-report/route.test.ts` | Create | Unit-Tests (≥7 cases): legacy happy-path, modern happy-path, batch (3 reports), 415, 413, 400, 429, 405. |
| `src/middleware.test.ts` | Create | **Neu in v2 per Codex R1 Finding #7.** Unit-Tests (≥5 cases): document-request sets CSP + x-nonce, /dashboard/ no-cookie → redirect-to-login (auth fail-closed), /dashboard/ valid-cookie → pass + CSP, /api/csp-report → no CSP (matcher bypass), /_next/static/* → no CSP. Fail-open-Test: CSP-Header-Set-Crash impacts nicht die Auth-Entscheidung. |
| `memory/security.md` | Modify | CSP-Items in Tier-1 von `[ ]` auf `[~]` (partial: Report-Only live) mit Datum-Referenz. |

### Architecture Decisions

- **CSP in Next.js Middleware statt nginx:** Nonce pro Request ist nur aus der App-Runtime machbar. Edge-Runtime generiert Nonce mit `crypto.getRandomValues(new Uint8Array(16))` → base64.
- **Matcher narrowing auf Document-Requests (v2 change):** Object-Form-Matcher `{ source: "/((?!_next/static(?:/|$)|_next/image(?:/|$)|api(?:/|$)|fonts(?:/|$)|favicon\\.ico$).*)", missing: [{type: "header", key: "next-router-prefetch"}, {type: "header", key: "purpose", value: "prefetch"}] }` — alles außer statische Assets + alle API-Routes + prefetches. CSP gehört semantisch auf HTML, nicht JSON/binary.
- **Auth-fail-closed + CSP-fail-open Split (v2 change per Codex R1 Finding #3):**
  - Auth-Entscheidung (`verifySessionDualRead` + redirect) bleibt außerhalb jedes CSP-try/catch. Wenn Auth-Path bricht, fail-closed (redirect zu login).
  - CSP-Dekoration (Nonce-Gen + header-set) in eigenem inneren try/catch um die bereits-berechnete `NextResponse`. Wenn CSP-Decoration bricht: response geht ohne CSP-Header raus, console.error to stderr. Auth-Entscheidung unbeeinflusst.
- **Nonce-Delivery via request.headers UND Content-Security-Policy request-header (v2 change per Codex R1 Finding #2):** Next.js 13+ extrahiert Nonce aus Request-seitigem CSP-Header. Response-Header `Content-Security-Policy-Report-Only` ist was der Browser sieht. Diese Trennung erlaubt D1-Observability mit framework-script-nonce-injection ohne Browser-Enforcement. D2 = response-rename, kein Request-Header-Change.
- **Next.js framework-nonce-auto-injection (Verifikation in Phase 0):** Muss vor Impl via Next.js 16 docs-check bestätigt werden. Staging-DevTools-Check im PMC ist die letzte Kontrollinstanz.
- **Report-Endpoint mit Normalisierung + shared-rate-limit + best-effort (v2 change per Codex R1 Findings #5 + #6):**
  - `normalizeCspReport()` als pure parser in `csp.ts` (testbar isoliert)
  - Rate-limit reuse mit explicit `max=30` (default 25)
  - Shared-store-Caveat dokumentiert; dedicated store = Nice-to-Have
  - Content-Type early-reject (415) vor body-read schützt gegen malformed-flood
- **Log-Format structured JSON + host-based env-derivation (v2 change per Codex R1 Finding #9):** Ein Log-Line pro Report, `type: "csp_violation"` als Diskriminator. `host` aus `req.headers.get("host")` statt `env: "prod|staging"` (NODE_ENV=production in beiden).
- **Keine Persistierung in diesem Sprint:** Violations gehen nur an stdout.

### Dependencies

- Keine neuen externen Packages (crypto.getRandomValues ist Edge-Runtime-built-in).
- Rate-Limit-Library: `src/lib/rate-limit.ts` bereits vorhanden, API `checkRateLimit(key, max, windowMs)` bestätigt.
- Env-Vars: keine neuen.
- DB-Schema: keine Änderungen.

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| Request ohne `X-Real-IP` (lokal/direkt) | Rate-Limit keyed by `unknown` — ein Bucket; Log-Line schreibt `ip: "unknown"` |
| Report-Body > 10 KB | 413 Payload Too Large, kein Log-Eintrag |
| Unsupported Content-Type (z.B. `text/plain`, `multipart/form-data`) | 415 Unsupported Media Type **vor body-read** — Schutz vor oversized-malformed-body-flood (v2) |
| Malformed JSON body | 400 Bad Request, kein Log-Eintrag, kein Crash |
| `application/reports+json` Batch mit N reports, davon M `type === "csp-violation"` | M log-lines, N-M silent-skips, 204 Response (v2) |
| Non-POST auf `/api/csp-report` | 405 Method Not Allowed mit `Allow: POST` |
| **Auth-Path-Bug (z.B. verifySessionDualRead crasht)** | **Redirect-to-login (fail-closed)**, NICHT pass-through (v2 contract per Codex Finding #3) |
| **CSP-Decoration-Bug (z.B. Nonce-Gen-Fehler)** | Response geht ohne CSP-Header raus (fail-open), Auth-Entscheidung unbeeinflusst, error to stderr (v2 scope-limited per Codex Finding #3) |
| Request mit existing `x-nonce` Request-Header (spoofing attempt) | Middleware überschreibt mit frisch generiertem Nonce |
| `/api/csp-report` selbst getriggert durch CSP (circular) | Matcher broad-excluded (`api(?:/|$)`) — Route bekommt keinen CSP-Header, kann nicht selbst violations erzeugen |
| Static asset (`/_next/static/chunks/...`) | Matcher excluded, kein CSP-Header, wie bisher |
| Prefetch request (hat `next-router-prefetch: 1` Header) | Matcher missing-excluded, kein CSP-Header (v2, per Codex Finding #4) |
| Chrome schickt `application/reports+json` mit `blockedURL` (camelCase) | Normalisiert zu `blocked_uri` im Log (v2, per Codex Finding #5) |

## Risks

1. **Risk: Middleware-Matcher-Erweiterung bricht Auth-Guard.**  
   **Mitigation:** Auth-Pfad-Check bleibt identisch innerhalb der Middleware-Funktion (`pathname.startsWith("/dashboard")` Branch, fail-closed). Neue `src/middleware.test.ts` testet explizit: dashboard redirect bei no-cookie, pass-through bei valid-cookie, CSP-fail-open bricht NICHT Auth-Entscheidung.

2. **Risk: CSP-Report-Only Header kommt nicht überall durch (z.B. nginx strippt Header).**  
   **Mitigation:** nginx-proxy leitet Response-Header durch (kein `proxy_hide_header` gesetzt). `curl -I` auf Staging als PMC-Check.

3. **Risk: `strict-dynamic` inkompatibel mit älteren Browsern.**  
   **Mitigation:** `strict-dynamic` wird von Browsern ohne Support ignoriert, Fallback ist die source-list (`'self' 'nonce-...'`). Kein User-sichtbarer Bruch. Dokumentiert im Spec-Kommentar in `src/lib/csp.ts`.

4. **Risk (kritisch, v2 aufgewertet): Next.js 16 framework-script-nonce-Auto-Injection funktioniert nicht wie erwartet.**  
   **Mitigation:** Phase-0-Recon mit Next.js 16 docs-check VOR Impl. Staging-DevTools-Check im PMC bestätigt nonce-Attribute auf framework-`<script>`-Tags. Falls nicht automatisch: zusätzlicher Code in Server-Components (`const nonce = (await headers()).get("x-nonce")` + explicit `<Script nonce={nonce}>`). Dieser Fallback erweitert den Scope — dann zurück zum Planner, neu planen. Weil D1 Report-Only ist, ist ein missed framework-script-nonce "nur" eine Report-Only-Violation (logged), kein Render-Break — aber D2 würde Rendering brechen, also muss D1 das klären.

5. **Risk: Report-Endpoint wird zum DDoS-Ziel (jeder Browser kann unbegrenzt POSTs auslösen).**  
   **Mitigation:** Rate-Limit 30/15min per IP + Body-Cap 10 KB + Content-Type early-reject (415). Logs sind structured — bei Flood: grep + block via nginx oder fail2ban als Follow-up. **Shared `rate-limit.ts`-Caveat (v2 per Codex Finding #6):** Gleicher Prozess-Map wie login/signup-rate-limit, probabilistic-eviction, best-effort. High-cardinality distinct-IP flood kann Memory wachsen lassen — akzeptable Trade-off für D1, dedicated store als Nice-to-Have falls nötig.

6. **Risk: Performance-Overhead durch Middleware auf allen Document-Requests.**  
   **Mitigation:** Middleware-Body minimal (Nonce-Gen ~50μs, String-Template). Matcher-narrowing auf Document-Requests (v2) reduziert Surface gegenüber "alle non-static" signifikant.

7. **Risk: Sprint-Split D1/D2 wird vergessen → Report-Only bleibt für immer.**  
   **Mitigation:** Follow-up-Item in `memory/todo.md` Sprint D2 explizit mit Start-Trigger ("≥7 Tage Report-Stream clean"). Observability-Routine: `docker logs alit-web | grep csp_violation | jq` als Prüf-Kommando.

8. **Risk (neu v2): Response-Header-Mismatch (request-side enforced, response-side Report-Only) verwirrt zukünftige Reviewer.**  
   **Mitigation:** Prominent documented in `src/middleware.ts` mit Code-Kommentar + Referenz auf Spec-Section "Nonce-Delivery via request.headers". Pattern lands in `patterns/nextjs.md` nach D2-Complete.
