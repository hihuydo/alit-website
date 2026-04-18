# Spec: Sprint D1 — CSP Report-Only Baseline (Tier-1 Security-Hardening)
<!-- Created: 2026-04-18 -->
<!-- Author: Planner (Claude) -->
<!-- Status: Draft -->

## Summary
Erster von zwei Sprints zum Aufbau einer strikten Content-Security-Policy. D1 fügt einen `Content-Security-Policy-Report-Only`-Header mit per-Request-Nonce über die Next.js Middleware hinzu + einen `/api/csp-report`-Endpoint zum Sammeln von Violation-Reports. Kein enforcement, kein User-sichtbarer Render-Impact — reine Observability-Baseline. D2 (separater Sprint, nach ≥7 Tagen Report-Stream ohne echte Violations) flippt dann zu enforced strict.

## Context
- **Aktueller Stand (verifiziert via Recon):** Gar kein CSP-Header gesetzt — weder in `nginx/alit.conf`/`nginx/alit-staging.conf` noch in Next.js. Einziger Einzelfall: `/api/media/[id]/route.ts` setzt `sandbox; default-src 'none'` nur für Media-Responses (SVG-XSS-Mitigation aus `patterns/deployment-nginx.md`).
- **Middleware:** `src/middleware.ts` existiert bereits, Edge-Runtime, Matcher aktuell nur `["/dashboard", "/dashboard/", "/dashboard/:path*"]` für Auth-Guard via `verifySessionDualRead`.
- **Inline-HTML-Surface minimal (aber nicht null):** Kein inline `<script>`/`<style>`, kein `dangerouslySetInnerHTML` (außer ein Kommentar), kein `<Script>`-Component, kein JSON-LD. **Aber:** Next.js injiziert framework-inline-scripts (RSC-Hydration, Navigation, Preload) zur Runtime — die brauchen nonce über das `x-nonce` Request-Header-Pattern, das Next.js 13+ nativ supportet.
- **iframes:** nur YouTube + Vimeo (`www.youtube.com`, `player.vimeo.com`) über `JournalBlockRenderer` + Dashboard-Editor-Embeds. `frame-src`-Whitelist klar bestimmt.
- **Tailwind v4:** compile-time, keine Runtime-CSS-in-JS.
- **React-Inline-Style-Attribute:** z.B. `style={{ height: "..." }}` im `JournalBlockRenderer` Spacer-Block, `style={{ fontFamily: "system-ui" }}` im Dashboard-Body. Diese brauchen `style-src 'unsafe-inline'` (CSP-3 Level, `'unsafe-hashes'` ist in Browsern unzuverlässig). Strict style-src ist separater Follow-up-Sprint.
- **Referenz-Patterns:** `patterns/nextjs.md` (Middleware → Server Component Kommunikation via `request.headers`), `patterns/deployment-nginx.md` (nginx `add_header`-Inheritance-Trap — CSP kommt aber aus Next.js, nicht nginx).

## Requirements

### Must Have (Sprint Contract)

1. **Middleware-Matcher erweitert** — `src/middleware.ts` bekommt einen Matcher, der alle nicht-statischen Routes matched (ausgenommen `/_next/static/*`, `/_next/image/*`, `/favicon.ico`, `/fonts/*`, `/api/media/*`, `/api/csp-report`, `/api/health`). Bestehender Auth-Guard läuft weiter nur für `/dashboard/*` via Pfad-Check innerhalb der Middleware-Funktion.

2. **Per-Request-Nonce** — Für jede gematched Route generiert die Middleware einen 128-bit-Nonce (16 random bytes → base64, ≥22 chars). Nonce wird auf den **Request-Header** `x-nonce` gesetzt via `NextResponse.next({ request: { headers: newHeaders } })`, sodass Server-Components ihn via `headers()` lesen können (für zukünftige `<Script nonce>`-Nutzung in D2) UND Next.js 13+ framework-scripts ihn automatisch verwenden.

3. **CSP-Report-Only-Header gesetzt** — Response-Header `Content-Security-Policy-Report-Only` mit der folgenden Policy (exakte Reihenfolge):
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

4. **`/api/csp-report` POST-Endpoint** — `src/app/api/csp-report/route.ts` akzeptiert POST mit `application/csp-report` ODER `application/reports+json` ODER `application/json`. Body-Size-Cap: 10 KB (reject mit 413). Bei Success: truncated violation als structured JSON nach stdout loggen (Format unten), 204-Response. Non-POST: 405. Rate-Limit: 30 reports/15min per `X-Real-IP` (reuse existing `src/lib/rate-limit.ts` falls vorhanden, sonst inline in-memory LRU). Report-Endpoint selbst ist vom Matcher ausgenommen (würde sonst circular requests produzieren).

5. **CSP-Helper als edge-safe leaf** — Neue Datei `src/lib/csp.ts` mit pure TS:
   - `generateNonce(): string` — 16-byte-random → base64
   - `buildCspReportOnlyHeader(nonce: string): string` — Policy-String aus const-Template
   - Keine Node-only imports (`pg`, `bcryptjs`, `./db`, `./audit`, `./auth`, `./cookie-counter`). Self-grep-Test analog `src/lib/auth-cookie.ts` (siehe `patterns/nextjs.md` Edge-Safe-Guard).

6. **Log-Format CSP-Violations** — Truncated JSON mit essenziellen Feldern als ein-zeilige structured-log:
   ```json
   {"type":"csp_violation","blocked_uri":"...","violated_directive":"...","source_file":"...","line_number":0,"referrer":"...","ip":"...","env":"prod|staging"}
   ```
   Max ein Log-Line pro Report (Docker-log-ingestion-friendly).

7. **Unit-Tests** — Neue Tests:
   - `src/lib/csp.test.ts`: nonce-Format (base64 pattern, length ≥ 22), `buildCspReportOnlyHeader` enthält alle 14 Directives in exakter Reihenfolge, nonce korrekt interpoliert, self-grep gegen Node-only imports
   - `src/app/api/csp-report/route.test.ts`: POST mit valid body → 204, non-POST → 405, oversized body → 413, malformed JSON → 400, rate-limit nach N requests → 429
   - Gesamt: 312 → ≥322 Tests passing.

8. **Build + Audit clean** — `pnpm build` ohne Errors/Warnings (insbesondere kein Edge-Bundle-Break wegen Node-only-Leak in middleware-konsumiertem Code), `pnpm audit --prod` zeigt 0 HIGH/CRITICAL, alle bestehenden Tests grün.

### Pre-Merge Checklist (PMC — nicht Sprint-Contract, separater Deploy-Check)

- **Staging-Smoke-Verifikation:**
  - `curl -sI https://staging.alit.hihuydo.com/` zeigt `content-security-policy-report-only: default-src 'self'; script-src 'self' 'nonce-...'` etc.
  - Zwei curl in Folge: unterschiedliche Nonces
  - `curl -X POST https://staging.alit.hihuydo.com/api/csp-report -H "content-type: application/csp-report" -d '{"csp-report":{"blocked-uri":"test","violated-directive":"script-src","source-file":"test","line-number":1}}'` returnt 204
  - `ssh hd-server 'docker logs alit-staging --tail=50 | grep csp_violation'` zeigt den Test-Report als structured-JSON
  - Homepage + /de + /fr + /de/alit + /de/projekte + /de/projekte/<any-slug> + /dashboard/login + /dashboard (nach Login) rendern **identisch** zu vor Deploy, **zero Console-Errors** in DevTools Chrome + Safari
  - DevTools-Check: `<script>` tags haben `nonce="..."` Attribut (Next.js framework-nonce-auto-injection)
- **Prod-Deploy-Verifikation (nach Merge):**
  - Gleicher curl-Check gegen `alit.hihuydo.com`
  - `docker logs alit-web --tail 100` clean + enthält `[instrumentation] ready (...)` boot-line
  - Health-Endpoint 200

### Nice to Have (explicit follow-up, NOT this sprint)

1. **Sprint D2 — Enforced strict CSP** — Nach ≥7 Tagen Report-Stream ohne fremde Violations: `Content-Security-Policy` (ohne `-Report-Only`) mit derselben Policy aktivieren, Report-Only-Header droppen.
2. **COOP/COEP/CORP** — `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Resource-Policy: same-origin` (Tier-1 Quick-Wins aus `memory/security.md`).
3. **Strict `style-src` mit Nonce** — Eliminiert `'unsafe-inline'` für styles, erfordert aber Refactor aller React-Inline-`style`-Props zu CSS-Classes oder `<style nonce>`-Blocks.
4. **CSP-Violation-Analyse-Dashboard** — Falls Violation-Volume > 10/Tag: Persistierung in `audit_events`-Tabelle + Dashboard-View (analog PaidHistoryModal aus PR #56).
5. **Report-URI-Drop nach D2** — wenn enforced Policy 2+ Wochen clean läuft, kann `report-uri` + `/api/csp-report`-Endpoint entfernt werden (oder bleibt für Attempted-Attack-Tracking).

### Out of Scope

- Änderungen an `nginx/alit.conf` / `nginx/alit-staging.conf` — CSP kommt ausschließlich aus Next.js. Bestehende Security-Header (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) bleiben in nginx.
- Änderungen am Dashboard-Content-Security (SVG-Sanitization, Rich-Text-Editor iframe-Whitelist) — bereits in PR #31 adressiert.
- SRI (Subresource Integrity) — wir laden keine externen Scripts.
- Cloudflare/CDN vor alit.hihuydo.com — eigener Sprint (Tier-1 Quick-Win).
- `frame-ancestors 'none'` ist redundant zu nginx `X-Frame-Options: DENY`, wird aber trotzdem in der CSP gesetzt (Defense-in-Depth, moderne Browser bevorzugen CSP).

## Technical Approach

### Files to Change

| File | Change Type | Description |
|------|-------------|-------------|
| `src/middleware.ts` | Modify | Matcher erweitern (alle non-static Routes), Nonce-Generation, CSP-Report-Only-Header setzen, Reporting-Endpoints-Header setzen, `x-nonce` auf Request-Headers injizieren. Bestehender Auth-Guard-Branch nur für `/dashboard/*` (Pfad-Check innerhalb der Funktion). |
| `src/lib/csp.ts` | Create | Pure edge-safe Helper: `generateNonce()`, `buildCspReportOnlyHeader(nonce)`, `CSP_REPORT_ENDPOINT` const. Keine Imports außer Edge-Runtime-built-ins. |
| `src/lib/csp.test.ts` | Create | Unit-Tests (≥6 cases): nonce-Format, Header-Composition, Determinismus bei fixem Input, self-grep-Edge-Safety. |
| `src/app/api/csp-report/route.ts` | Create | POST-Handler mit Body-Cap (10KB), Rate-Limit (30/15min per X-Real-IP, reuse `rate-limit.ts` falls vorhanden), structured-log nach stdout, 204-Response. |
| `src/app/api/csp-report/route.test.ts` | Create | Unit-Tests (≥5 cases): happy-path, 405, 413, 400, 429. |
| `memory/security.md` | Modify | CSP-Items in Tier-1 von `[ ]` auf `[~]` (partial: Report-Only live) mit Datum-Referenz. |

### Architecture Decisions

- **CSP in Next.js Middleware statt nginx:** Nonce pro Request ist nur aus der App-Runtime machbar (nginx kennt keinen Request-spezifischen Kontext ohne Lua). Middleware läuft Edge-Runtime, generiert Nonce mit `crypto.getRandomValues(new Uint8Array(16))` → base64.
- **Matcher via Negative-Lookahead:** `[{source: "/((?!_next/static|_next/image|favicon\\.ico|fonts/|api/csp-report|api/media|api/health).*)"}]` — alles außer statische Assets + csp-report (zirkulär) + media (hat eigenen CSP) + health (non-HTML).
- **Einzige Middleware-Datei:** Bestehender Auth-Guard für `/dashboard/*` bleibt, CSP wird davor applied. `req.nextUrl.pathname.startsWith("/dashboard")`-Branch entscheidet Auth-Logik; CSP-Header auf die finale `NextResponse.redirect` bzw. `NextResponse.next` appended.
- **Nonce-Delivery via request.headers:** `NextResponse.next({ request: { headers: newHeaders } })` ist das Next.js-offizielle Pattern für Middleware → Server-Component. Server-Components können via `headers().get("x-nonce")` lesen (zukünftig für explicit `<script nonce>`-Tags in D2).
- **Next.js framework-nonce-auto-injection:** Next.js 13+ sucht in Middleware-gesetzten Response-Headern nach einer CSP mit `nonce-...`-Direktive und appliziert den Nonce automatisch auf framework-generierte inline-scripts. Funktioniert out-of-the-box ohne zusätzlichen Code. Sanity-Check in Staging-Verifikation (DevTools: `<script>` tags haben `nonce="..."` Attribut).
- **Report-Endpoint als eigene Route:** `/api/csp-report` ist die einzige Route mit Rate-Limit in diesem Sprint (analog zu `/api/signup/*` aus Sprint 6).
- **Log-Format structured JSON:** Ein Log-Line pro Report (kein pretty-print), damit Docker-log-ingestion direkt verwendet werden kann. `type: "csp_violation"` als Diskriminator.
- **Keine Persistierung in diesem Sprint:** Violations gehen nur an stdout. Wenn Volume zu hoch wird (>10/Tag), → Nice-to-Have Follow-up.

### Dependencies

- Keine neuen externen Packages (crypto.getRandomValues ist Edge-Runtime-built-in, alle anderen Tools — Next.js Middleware, JSON-Parsing — sind schon da).
- Rate-Limit-Library: prüfen, ob `src/lib/rate-limit.ts` existiert (aus Sprint 6 Signup-Forms) und dort andocken, statt neue LRU zu schreiben.
- Env-Vars: keine neuen.
- DB-Schema: keine Änderungen.

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| Request ohne `X-Real-IP` (lokal/direkt) | Rate-Limit keyed by `unknown` — ein Bucket für alle, aber Log-Line schreibt `ip: "unknown"` |
| Report-Body > 10 KB | 413 Payload Too Large, kein Log-Eintrag |
| Malformed JSON body | 400 Bad Request, kein Log-Eintrag, kein Crash |
| Report-Body mit unbekannten Feldern | Accept (Violation-Log enthält nur known-fields, unbekannte sind silent-dropped) |
| Content-Type `application/csp-report` (Legacy) | Accept |
| Content-Type `application/reports+json` (moderner Report-API) | Accept |
| Non-POST auf `/api/csp-report` | 405 Method Not Allowed |
| Middleware-Crash (z.B. Nonce-Gen-Fehler) | Defensive `try/catch` in Middleware — bei Crash: keine CSP-Header gesetzt, normaler Response-Pfad, error to stderr. Besser als 500 auf ALLEN Routes. |
| Request mit existing `x-nonce` Request-Header (spoofing attempt) | Ignore — Middleware überschreibt mit frisch generiertem Nonce |
| `/api/csp-report` selbst getriggert durch CSP (circular) | Matcher excluded — die Route bekommt keinen CSP-Header, kann nicht selbst violations erzeugen |
| Static asset (`/_next/static/...`) | Matcher excluded, kein CSP-Header, wie bisher |

## Risks

1. **Risk: Middleware-Matcher-Erweiterung bricht Auth-Guard.**  
   **Mitigation:** Bestehender Auth-Pfad-Check bleibt identisch (innerhalb der Middleware-Funktion, `pathname.startsWith("/dashboard")` Branch). Unit-Test `src/middleware.ts`-Verhalten (wenn testbar mit Next.js-Test-Harness, sonst manueller Staging-Test auf `/dashboard/login` + `/dashboard/`).

2. **Risk: CSP-Report-Only Header kommt nicht überall durch (z.B. nginx strippt Header).**  
   **Mitigation:** nginx-proxy leitet Response-Header durch (kein `proxy_hide_header` gesetzt). `curl -I` auf Staging als PMC-Check.

3. **Risk: `strict-dynamic` inkompatibel mit älteren Browsern.**  
   **Mitigation:** `strict-dynamic` wird von Browsern ohne Support ignoriert, Fallback ist die source-list (`'self' 'nonce-...'`). Kein User-sichtbarer Bruch. Dokumentiert im Spec-Kommentar in `src/lib/csp.ts`.

4. **Risk: Next.js framework-script-nonce-Auto-Injection funktioniert nicht wie erwartet (Next.js 16-spezifisches Verhalten).**  
   **Mitigation:** Staging-DevTools-Check zur Verifikation vor Merge. Falls nicht automatisch: zusätzlicher Code in Server-Components (`const nonce = (await headers()).get("x-nonce")` + `<Script nonce={nonce}>`). Wenn dieser Fallback nötig ist, updaten wir die Spec und erweitern den Scope. Da D1 Report-Only ist, wäre ein missed framework-script-nonce "nur" eine Report-Only-Violation (logged), kein Render-Break.

5. **Risk: Report-Endpoint wird zum DDoS-Ziel (jeder Browser kann unbegrenzt POSTs auslösen).**  
   **Mitigation:** Rate-Limit 30/15min per IP + Body-Cap 10 KB. Logs sind structured — bei Flood: grep + block via nginx oder fail2ban als Follow-up.

6. **Risk: Performance-Overhead durch Matcher-Erweiterung auf alle Routes.**  
   **Mitigation:** Middleware-Body ist minimal (Nonce-Gen ~50μs, String-Template für Header). Edge-Runtime ist designed dafür.

7. **Risk: Sprint-Split D1/D2 wird vergessen → Report-Only bleibt für immer, kein enforcement.**  
   **Mitigation:** Follow-up-Item in `memory/todo.md` Sprint D2 explizit mit Start-Trigger ("≥7 Tage Report-Stream clean"). Observability-Routine: `docker logs alit-web | grep csp_violation | jq` als Prüf-Kommando.
