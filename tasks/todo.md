# Sprint: T1 Auth-Sprint S — Shared-Admin-Hardening
<!-- Spec: tasks/spec.md -->
<!-- Started: 2026-04-19 -->

## Done-Kriterien

> Alle müssen PASS sein bevor der Sprint als fertig gilt. Sprint Contract — hart durchgesetzt im Review.

- [ ] **DK-1 Schema**: `grep "admin_session_version" src/lib/schema.ts` zeigt `CREATE TABLE IF NOT EXISTS admin_session_version (user_id INT NOT NULL, env TEXT NOT NULL, token_version INT NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (user_id, env))` in `ensureSchema()`. Boot auf fresh DB + existing DB beide idempotent.
- [ ] **DK-2 Login liest tv env-scoped (kein Bump)**: `src/lib/auth.ts` nach bcrypt-verify ruft `getTokenVersion(userId, env)` — Login bumped NICHT. JWT-Claim enthält `tv: <number>` aus dem gelesenen Wert (missing row → 0).
- [ ] **DK-3 Logout bumpt tv TOCTOU-safe + env-scoped + idempotent**: `bumpTokenVersionForLogout(userId, env, expectedTv)` führt `INSERT INTO admin_session_version ... ON CONFLICT (user_id,env) DO UPDATE SET token_version=+1 WHERE token_version=$3 RETURNING token_version` aus. Returns new tv bei success, `null` bei TOCTOU-conflict. Logout-Handler returnt `200 + clear cookies` in beiden Fällen (idempotent).
- [ ] **DK-4 verifySessionDualRead Signature**: Return-Type ist `{ userId: number; tokenVersion: number; source: "primary" \| "legacy" } \| null`. Legacy-JWT ohne tv-Claim liefert `tokenVersion: 0`. Unit-Test beweist das.
- [ ] **DK-5 requireAuth env-scoped DB-tv-Check**: `src/lib/api-helpers.ts` `requireAuth` macht DB-Query via `getTokenVersion(userId, env)` helper (reads `admin_session_version` WHERE user_id AND env; missing row → 0). Mismatch mit JWT.tv → 401 + `clearSessionCookies`. **`account/route.ts`** wurde ebenfalls auf `requireAuth` portiert (war inline).
- [ ] **DK-6 Dashboard-Layout Server-Component Check + Cookie-Clear**: `src/app/dashboard/layout.tsx` macht env-scoped DB-tv-Check; bei Mismatch setzt es `__Host-session`/`session`-Legacy/`__Host-csrf` auf `.set("", {maxAge:0, ...})` UND `redirect("/dashboard/login/")`. Ohne Clear → Redirect-Loop.
- [ ] **DK-7 CSRF Helper komplett**: `src/lib/csrf.ts` enthält `buildCsrfToken`, `validateCsrfPair`, `timingSafeEqualBytes`. Pure Web-Crypto (kein `node:crypto`). Domain-Separator `"csrf-v1:"` im HMAC-Input.
- [ ] **DK-8 CSRF Endpoint**: `GET /api/auth/csrf` returned 200 mit `{ csrfToken }` + setzt `__Host-csrf` Cookie (prod) oder `csrf` (dev), SameSite=Strict, non-HttpOnly, Secure (prod), Path=/. Ohne Session → 401.
- [ ] **DK-9 CSRF-Integration in requireAuth**: `req.method \in {"POST","PATCH","PUT","DELETE"}` → `validateCsrfPair` aufgerufen. Missing Header ODER missing Cookie → 403 JSON `{success:false, error:"CSRF token missing", code:"csrf_missing"}`. HMAC-Mismatch → 403 JSON `{success:false, error:"Invalid CSRF token", code:"csrf_invalid"}`.
- [ ] **DK-10 Login setzt beide Cookies + embed Token**: `/api/auth/login` 200-Response enthält `csrfToken: string` im Body + Set-Cookie für `__Host-csrf`.
- [ ] **DK-11 Logout cleart beide Cookies atomar + idempotent**: `clearSessionCookies` cleart `__Host-session` + Legacy `session` + `__Host-csrf` via `.set("", {secure, path:/, maxAge:0})` (nicht `.delete()`). Logout-Handler returnt 200 + clear bei: valid-session (happy), no-session, deleted-admin-row, TOCTOU-conflict (alle idempotent).
- [ ] **DK-12 Client-Side dashboardFetch live** (explizites Inventory, Multiline-safe):
  - `src/app/dashboard/lib/dashboardFetch.ts` existiert. Cached Token, auto-attach Header, 403-refresh-retry bei `code:"csrf_missing"|"csrf_invalid"` im JSON-body, 401 → window.location.href login-redirect.
  - Pro Datei muss die Anzahl der `dashboardFetch(`-Call-Sites mindestens gleich der Anzahl **vorher-existierender** non-GET `fetch(`-Call-Sites sein:
    - `AgendaSection.tsx`: 3 non-GET (POST/PATCH/DELETE) → 3× dashboardFetch
    - `AlitSection.tsx`: 2 non-GET → 2× dashboardFetch
    - `JournalSection.tsx`: 2 non-GET → 2× dashboardFetch
    - `ProjekteSection.tsx`: 2 non-GET → 2× dashboardFetch
    - `MediaSection.tsx`: 3 non-GET → 3× dashboardFetch
    - `MediaPicker.tsx`: 1 non-GET → 1× dashboardFetch
    - `SignupsSection.tsx`: 3 non-GET → 3× dashboardFetch
    - `AccountSection.tsx`: 1 non-GET → 1× dashboardFetch
    - `page.tsx`: 1 non-GET → 1× dashboardFetch
    - `login/page.tsx`: 1 non-GET (login, stays plain `fetch` — Pre-Auth), post-login seeded `dashboardFetch`-Cache aus response.csrfToken
  - **Verifikation**: `grep -c "dashboardFetch(" <file>` pro Datei ≥ Inventory-Count. Manuelle Code-Review dass alle non-GET-Calls (inkl. Multiline-Form `fetch(\n url,\n { method: "POST"`) umgestellt sind.
- [ ] **DK-13 nginx COOP + CORP (site-wide)**: `nginx/alit.conf` + `nginx/alit-staging.conf` enthalten beide `add_header Cross-Origin-Opener-Policy "same-origin" always;` + `add_header Cross-Origin-Resource-Policy "same-origin" always;`. **Scope acknowledged**: site-wide, auch Public + Media-URLs.
- [ ] **DK-14 Build + Tests**: `pnpm build` passes, `pnpm test` grün, ~40-60 neue Tests (370→410-430).
- [ ] **DK-15 `pnpm audit --prod`**: 0 HIGH/CRITICAL.
- [ ] **DK-16 Staging-Deploy + Multi-Device-Smoke (env-scoped, staging-only)**: Login-A (staging) → Login-B (staging) → beide arbeiten parallel (A bleibt aktiv). Logout-B (staging) → A's nächster API-Call = 401 + Redirect (logout-invalidate innerhalb staging env). **Prod-Sanity-Check**: nach Smoke-Sequence prod-Login prüfen → keine Auth-Störung (Beweis env-scope hält). DevTools-Check: `__Host-csrf` Cookie mit korrekten Attrs. Journal-Edit + Speichern durchläuft. `curl` mit Session-Cookie ohne CSRF-Header → 403 JSON `{..., code:"csrf_missing"}`.
- [ ] **DK-17 OG/Media Cross-Origin Compatibility (PMC, manuell post-deploy)**: Twitter-Card-Validator + LinkedIn-Post-Inspector auf eine Public Journal-/Projekt-Route → Preview-Card + Image rendern. Wenn failed: CORP-Scoping auf Dashboard-Location als Ops-Follow-up dokumentieren.

## Tasks

### Phase 1 — Schema + Core Helpers (TDD)

- [ ] `src/lib/schema.ts`: `CREATE TABLE IF NOT EXISTS admin_session_version (user_id INT NOT NULL, env TEXT NOT NULL, token_version INT NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (user_id, env))`
- [ ] `src/lib/runtime-env.ts` (new): Pure Edge-safe `deriveEnv(siteUrl?): "prod"\|"staging"` extracted aus cookie-counter.ts, mit fallback auf SITE_URL env-var
- [ ] `src/lib/cookie-counter.ts`: Import `deriveEnv` aus neuem runtime-env (cleanup, kein Behavior-Change)
- [ ] `src/lib/session-version.ts` (new): `getTokenVersion(userId, env): Promise<number>` (missing row → 0), `bumpTokenVersionForLogout(userId, env, expectedTv): Promise<number\|null>` (null bei TOCTOU-conflict)
- [ ] `src/lib/session-version.test.ts` (new): Reader missing-row → 0, Upsert-Bump first-time (INSERT path), Dual-Tab-TOCTOU (second call returns null), env-scope isolation (prod bump ≠ staging read)
- [ ] `src/lib/csrf.ts` (new): `buildCsrfToken`, `validateCsrfPair`, `timingSafeEqualBytes` — Web-Crypto only
- [ ] `src/lib/csrf.test.ts` (new): HMAC-roundtrip, timing-safe XOR compare, domain-separator-forgery-rejection, JWT-signature-not-reusable-as-CSRF
- [ ] `src/lib/auth-cookie.ts`: `verifySessionDualRead` return-type erweitert zu `{ userId, tokenVersion, source }`, `validateTv()` helper, Legacy-JWT ohne tv → 0
- [ ] `src/lib/auth-cookie.test.ts`: Existing tests updaten + neue für tokenVersion-Handling + Legacy-JWT-Fallback
- [ ] `src/lib/auth.ts`: Login liest tv via `getTokenVersion(userId, env)` (kein bump), JWT-Claim `{ sub, tv }`
- [ ] `src/lib/auth.test.ts`: Login liest current tv ohne bumping, JWT-Claim hat tv, env-scope korrekt

### Phase 2 — API Routes + Gates

- [ ] `src/lib/api-helpers.ts`: `requireAuth` macht env-scoped DB-tv-Check (via `getTokenVersion`) + CSRF-validation (non-GET) + JSON-error-response mit `code` field
- [ ] `src/lib/api-helpers.test.ts`: DB-tv-Check, method-based-CSRF-gate, error-response-shape (success/error/code)
- [ ] `src/app/api/dashboard/account/route.ts`: Port inline-auth auf `requireAuth` (gewinnt tv-check + CSRF), `bumpCookieSource` bleibt via `requireAuth` gehandhabt
- [ ] `src/app/api/dashboard/account/route.test.ts`: Port tests: requireAuth-Path abdeckt, current_password flow unverändert, tv-mismatch → 401
- [ ] `src/app/api/auth/csrf/route.ts` (new): GET auth-gated (via requireAuth bypass da auth-path selbst kein CSRF braucht — raw verifySessionDualRead OK) → issues cookie + body-token
- [ ] `src/app/api/auth/csrf/route.test.ts` (new): 401-ohne-Session, 200-mit-korrektem-Body + Cookie-Header
- [ ] `src/app/api/auth/login/route.ts`: setCsrfCookie + `csrfToken` im Response-Body, tv in JWT claim
- [ ] `src/app/api/auth/login/route.test.ts`: CSRF-Cookie im Response, tv-claim im JWT
- [ ] `src/app/api/auth/logout/route.ts`: bumpTokenVersionForLogout vor clearSessionCookies; idempotent (no-session/deleted-row/TOCTOU → 200+clear); CSRF-gated via requireAuth
- [ ] `src/app/api/auth/logout/route.test.ts`: tv-Bump-Success, dual-call idempotent (TOCTOU), no-session→200+clear, deleted-row→200+clear, legacy-JWT-tv=0-upsert-path, CSRF-clear

### Phase 3 — Dashboard-Layout + Client

- [ ] `src/app/dashboard/layout.tsx`: Server-Component env-scoped DB-tv-Check + **cookies clearen (session + legacy + csrf) + redirect** auf Mismatch; verhindert Redirect-Loop
- [ ] `src/app/dashboard/lib/dashboardFetch.ts` (new): Cached token, auto-attach, 403-refresh bei `code:"csrf_*"` im JSON-body, 401-redirect, returns raw Response
- [ ] `src/app/dashboard/lib/dashboardFetch.test.ts` (new): Happy-path, 403-refresh-retry bei code match, 401-redirect, non-csrf-403-bubble, network-error propagation

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
