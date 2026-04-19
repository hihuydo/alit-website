# Sprint: T1 Auth-Sprint S — Shared-Admin-Hardening
<!-- Spec: tasks/spec.md -->
<!-- Started: 2026-04-19 -->

## Done-Kriterien

> Alle müssen PASS sein bevor der Sprint als fertig gilt. Sprint Contract — hart durchgesetzt im Review.

- [ ] **DK-1 Schema**: `grep -A 1 "admin_users" src/lib/schema.ts | grep "token_version INT NOT NULL DEFAULT 0"` matcht. `ALTER TABLE … ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 0` live in `ensureSchema()`.
- [ ] **DK-2 Login liest tv (kein Bump)**: `src/lib/auth.ts` `SELECT id, password, token_version FROM admin_users WHERE email = $1` — Login bumped NICHT. JWT-Claim enthält `tv: <number>` aus dem gelesenen Wert.
- [ ] **DK-3 Logout bumpt tv TOCTOU-safe**: `src/app/api/auth/logout/route.ts` (oder Helper-Funktion) enthält `UPDATE admin_users SET token_version = token_version + 1 WHERE id = $1 AND token_version = $2`.
- [ ] **DK-4 verifySessionDualRead Signature**: Return-Type ist `{ userId: number; tokenVersion: number; source: "primary" \| "legacy" } \| null`. Legacy-JWT ohne tv-Claim liefert `tokenVersion: 0`. Unit-Test beweist das.
- [ ] **DK-5 requireAuth DB-tv-Check**: `src/lib/api-helpers.ts` `requireAuth` macht DB-Query `SELECT token_version FROM admin_users WHERE id = $1` nach JWT-verify. Mismatch → 401 + `clearSessionCookies`. Deleted-admin-row → 401 + clear.
- [ ] **DK-6 Dashboard-Layout Server-Component Check**: `src/app/dashboard/layout.tsx` macht denselben DB-tv-Check und redirected bei Mismatch auf `/dashboard/login/`.
- [ ] **DK-7 CSRF Helper komplett**: `src/lib/csrf.ts` enthält `buildCsrfToken`, `validateCsrfPair`, `timingSafeEqualBytes`. Pure Web-Crypto (kein `node:crypto`). Domain-Separator `"csrf-v1:"` im HMAC-Input.
- [ ] **DK-8 CSRF Endpoint**: `GET /api/auth/csrf` returned 200 mit `{ csrfToken }` + setzt `__Host-csrf` Cookie (prod) oder `csrf` (dev), SameSite=Strict, non-HttpOnly, Secure (prod), Path=/. Ohne Session → 401.
- [ ] **DK-9 CSRF-Integration in requireAuth**: `req.method \in {"POST","PATCH","PUT","DELETE"}` → `validateCsrfPair` aufgerufen. Missing Header ODER missing Cookie → 403 `"CSRF token missing"`. HMAC-Mismatch → 403 `"Invalid CSRF token"`.
- [ ] **DK-10 Login setzt beide Cookies + embed Token**: `/api/auth/login` 200-Response enthält `csrfToken: string` im Body + Set-Cookie für `__Host-csrf`.
- [ ] **DK-11 Logout cleart beide Cookies atomar**: `clearSessionCookies` cleart `__Host-session` UND `__Host-csrf` via `.set("", {secure, path:/, maxAge:0})` (nicht `.delete()`).
- [ ] **DK-12 Client-Side dashboardFetch live**: `src/app/dashboard/lib/dashboardFetch.ts` existiert. Cached Token, auto-attach Header, 403-refresh-retry bei exact-match-body, 401 → window.location.href login-redirect. 19 Mutation-Call-Sites in 10 Dashboard-Komponenten portiert. `grep -rn "fetch(.*/(api/dashboard\|api/auth/logout)" src/app/dashboard/ | grep -v dashboardFetch` liefert 0 non-GET matches.
- [ ] **DK-13 nginx COOP + CORP**: `nginx/alit.conf` + `nginx/alit-staging.conf` enthalten beide `add_header Cross-Origin-Opener-Policy "same-origin" always;` + `add_header Cross-Origin-Resource-Policy "same-origin" always;`.
- [ ] **DK-14 Build + Tests**: `pnpm build` passes, `pnpm test` grün, ~40-60 neue Tests (370→410-430).
- [ ] **DK-15 `pnpm audit --prod`**: 0 HIGH/CRITICAL.
- [ ] **DK-16 Staging-Deploy + Multi-Device-Smoke**: Login-A → Login-B → beide arbeiten parallel (A bleibt aktiv). Logout-B → A's nächster API-Call = 401 + Redirect (global logout-invalidate). DevTools-Check: `__Host-csrf` Cookie mit korrekten Attrs. Journal-Edit + Speichern durchläuft. `curl` mit Session-Cookie ohne CSRF-Header → 403 "CSRF token missing".

## Tasks

### Phase 1 — Schema + Core Helpers (TDD)

- [ ] `src/lib/schema.ts`: `ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 0`
- [ ] `src/lib/csrf.ts` (new): `buildCsrfToken`, `validateCsrfPair`, `timingSafeEqualBytes` — Web-Crypto only
- [ ] `src/lib/csrf.test.ts` (new): HMAC-roundtrip, timing-safe XOR compare, domain-separator-forgery-rejection, JWT-signature-not-reusable-as-CSRF
- [ ] `src/lib/auth-cookie.ts`: `verifySessionDualRead` return-type erweitert, `validateTv()` helper, Legacy-JWT ohne tv → 0
- [ ] `src/lib/auth-cookie.test.ts`: Existing tests updaten + neue für tokenVersion-Handling + Legacy-JWT-Fallback
- [ ] `src/lib/auth.ts`: Login liest tv via erweiterte SELECT (kein bump), neuer `bumpTokenVersionForLogout(userId, expectedTv)` Export, JWT-Claim `{ sub, tv }`
- [ ] `src/lib/auth.test.ts`: Login liest current tv ohne bumping, JWT-Claim hat tv, bumpTokenVersionForLogout TOCTOU-safe

### Phase 2 — API Routes + Gates

- [ ] `src/lib/api-helpers.ts`: `requireAuth` macht DB-tv-Check + CSRF-validation (non-GET)
- [ ] `src/lib/api-helpers.test.ts`: DB-tv-Check, method-based-CSRF-gate, error-response-shape
- [ ] `src/app/api/auth/csrf/route.ts` (new): GET auth-gated → issues cookie + body-token
- [ ] `src/app/api/auth/csrf/route.test.ts` (new): 401-ohne-Session, 200-mit-korrektem-Body + Cookie-Header
- [ ] `src/app/api/auth/login/route.ts`: setCsrfCookie + `csrfToken` im Response-Body
- [ ] `src/app/api/auth/login/route.test.ts`: CSRF-Cookie im Response, tv-claim im JWT
- [ ] `src/app/api/auth/logout/route.ts`: bumpTokenVersionForLogout vor clearSessionCookies
- [ ] `src/app/api/auth/logout/route.test.ts`: tv-Bump rowCount-Gate, dual-call idempotent, CSRF-clear

### Phase 3 — Dashboard-Layout + Client

- [ ] `src/app/dashboard/layout.tsx`: Server-Component DB-tv-Check + redirect auf Mismatch
- [ ] `src/app/dashboard/lib/dashboardFetch.ts` (new): Cached token, auto-attach, 403-refresh, 401-redirect
- [ ] `src/app/dashboard/lib/dashboardFetch.test.ts` (new): Happy-path, 403-refresh-retry, 401-redirect, role-gate-bubble

### Phase 4 — 19 Call-Site Migration

- [ ] `AgendaSection.tsx`: 3 fetch-sites → dashboardFetch (POST/PATCH/DELETE)
- [ ] `AlitSection.tsx`: 2 fetch-sites → dashboardFetch
- [ ] `JournalSection.tsx`: 2 fetch-sites → dashboardFetch
- [ ] `ProjekteSection.tsx`: 2 fetch-sites → dashboardFetch
- [ ] `MediaSection.tsx`: 3 fetch-sites → dashboardFetch
- [ ] `MediaPicker.tsx`: 1 fetch-site → dashboardFetch (upload)
- [ ] `SignupsSection.tsx`: 3 fetch-sites → dashboardFetch
- [ ] `AccountSection.tsx`: 1 fetch-site → dashboardFetch
- [ ] `page.tsx`: 1 fetch-site → dashboardFetch
- [ ] `login/page.tsx`: Nach Login-200 response.csrfToken in dashboardFetch-Cache seed'en
- [ ] Grep-Audit: `grep -rn "fetch(.*/(api/dashboard\|api/auth/logout)" src/app/dashboard/ | grep -v dashboardFetch` → 0 matches

### Phase 5 — nginx + Staging-Verify

- [ ] `nginx/alit.conf`: COOP + CORP add_header
- [ ] `nginx/alit-staging.conf`: COOP + CORP add_header
- [ ] **PMC**: Manuell nach Merge — ssh → nginx-Config sync → `nginx -t` + reload → `curl -I` Header-Check
- [ ] **PMC**: Multi-Device Smoke-Test (Login A → Login B → A 401 → Logout B → A neu 401)

## Notes

- **Edge-Safe Leaf** (`auth-cookie.ts`): Forbidden-List bleibt, wenn `csrf.ts` dort importiert wird auch erweitern. Aber: csrf.ts ist selbst Edge-safe, sollte passen.
- **Ruhender dormant Admin `huy@hihuydo.com`** wurde bereits aus .env entfernt (Sprint A). Kein Legacy-JWT-Account zu beachten.
- **Sprint B Observability** (`auth_method_daily`) läuft weiter — `bumpCookieSource(result.source)` bleibt im `requireAuth` unangetastet. Nur Return-Shape erweitert.
- **Sprint D1 CSP Report-Only** ist live — Client-Side-dashboardFetch nutzt keine inline scripts, sollte kein CSP-Impact haben. Smoke-Test pflicht.
- **Patterns-Check**: patterns/auth.md + patterns/auth-hardening.md vor Implementation lesen (v.a. `__Host-` cookie clear, TOCTOU UPDATE, timingSafeEqualBytes Edge-fallback, HMAC domain-separator).
- **Codex-Spec-Review Pflicht** nach Sonnet-post-commit — Medium Scope mit Architektur-Entscheidungen (Edge/Node-Split, Sessionsemantik, CSRF-Design).
