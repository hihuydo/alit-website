# Spec: T1 Auth-Sprint S — Shared-Admin-Hardening
<!-- Created: 2026-04-19 -->
<!-- Updated: 2026-04-19 v2 — Architecture Decision B scoped down: Login bumpt NICHT (nur logout bumpt). Multi-Device-Semantik bleibt erhalten. Bump-on-Login als Out-of-Scope/Future-Sprint dokumentiert. -->
<!-- Updated: 2026-04-19 v3 — Codex-Spec-R1 findings addressed (7 total): Decision-B consistency sweep, account/route.ts added to scope, DK-12 explicit call-site inventory, CSRF JSON error shape + stable `code` field, logout edge-case semantics documented, env-scoped token_version via new `admin_session_version` table (prevents staging/prod cross-env-bump), COOP/CORP scope acknowledged site-wide + OG/media verification DK. -->
<!-- Updated: 2026-04-19 v4 — Codex-Spec-R2 4 new findings addressed: Must-Have renumbered 1..17 matching DK-1..17, bumpTokenVersionForLogout ownership consolidated in session-version.ts, deleted-admin-row path semantics split (API-gate=401+clear, logout=200+clear orphan-accepted), wording drift cleanup (legacy JWT valid bis nächster Logout; performance-row admin_session_version). -->
<!-- Author: Planner (Claude) -->
<!-- Status: Implemented (Phases 1-5 complete, 451/451 tests, build clean, audit 0) -->
<!-- Updated: 2026-04-19 v5 — Status bump after implementation for re-evaluation against code (patterns/workflow.md Sonnet post-commit NEEDS-WORK-on-pre-impl-spec workaround). -->

## Summary

Logout-Invalidate + CSRF-Protection + COOP/CORP-Header (site-wide). Alle Dashboard-Mutations werden CSRF-gated, der shared Admin-Account bekommt server-seitige Session-Invalidation (Login liest `token_version`, Logout bumpt sie — alle Sessions werden instant ungültig; Multi-Device-Parallel-Login bleibt erlaubt bis erster Logout), und Origin-Isolation via COOP/CORP wird site-weit eingeschaltet. Token-Version ist **env-scoped** (separates `admin_session_version(user_id, env, token_version)` Table) damit Staging-Logout nicht Prod-Sessions invalidiert — Staging + Prod teilen die DB.

## Context

**Trigger:**
1. **Shared admin account**: Mehrere Personen loggen sich mit demselben Login (`info@alit.ch`) ein. Ohne Session-Rotation bleibt eine vergessene/kompromittierte Session beliebig lang aktiv.
2. **Sprint 6 Public PII**: `/api/signup/mitgliedschaft` + `/api/signup/newsletter` speichern personenbezogene Daten (Name, Adresse, Email). Das Dashboard verwaltet diese — CSRF-Forgery eines bulk-delete wäre datenschutzrelevant.

**Current state:**
- JWT claim `{ sub }` (keine token_version, keine Invalidation-Mechanik)
- `admin_users` Schema: `(id, email, password, created_at)` — kein tv-Column
- Proxy (`src/proxy.ts`, Edge) verifiziert JWT-Cookie via `verifySessionDualRead` → Dashboard-Redirect-Gate
- 18 API-Handler unter `/api/dashboard/*` nutzen `requireAuth` aus `api-helpers.ts` (JWT-Only, kein DB-Check)
- 19 Client-Side `fetch("POST|PATCH|DELETE")`-Call-Sites in 10 Dashboard-Komponenten
- nginx: HSTS + X-Frame-Options + X-Content-Type-Options + Referrer-Policy + Permissions-Policy — **kein COOP/CORP**
- Password-Length-Cap `> 128` bereits implementiert (login/route.ts:39 + auth.ts:103) — verify-only, kein Code-Change

**Architektur-Invarianten (aus CLAUDE.md + patterns):**
- Edge-Safe Leaf: `src/lib/auth-cookie.ts` darf keine Node-only-Imports (`pg`, `bcryptjs`, `./db`, `./audit`). Regex-Test in `auth-cookie.test.ts` fängt Regression.
- `__Host-`-Cookies: `.delete()` reicht nicht, braucht `.set("", { secure, path:/, maxAge:0 })` (siehe patterns/auth.md).
- Sprint B Cookie-Migration läuft noch (`auth_method_daily`-Observability). Sprint C (Cookie-Rename-Cleanup) ist deferred bis ≥7d clean. **Diese Sprint-Änderungen dürfen Sprint C nicht präkludieren** (d.h. Legacy-Cookie-Fallback bleibt funktional).

**Referenz:** CLAUDE.md, memory/project.md, patterns/auth.md, patterns/auth-hardening.md, patterns/nextjs.md (Edge-safe Leaf Modules), patterns/deployment-nginx.md.

## Requirements

### Must Have (Sprint Contract)

> **Nummerierungs-Hinweis**: Die Must-Have-Items hier sind narrativ gruppiert (1-17, mit Scope-Gruppierung: 1-6 = DB + Auth-Gates, 7-10 = CSRF, 11 = nginx, 12-14 = Tests/Build/Smoke, 17 = OG-Verify). Die **mechanisch testbaren Done-Kriterien** stehen in `tasks/todo.md` als `DK-1..DK-17`. Mapping: Must-Have-1 ↔ DK-1, Must-Have-2 ↔ DK-2, ... Must-Have-7 deckt DK-7 + DK-8 + DK-9 ab (CSRF-helper + -endpoint + -integration). Must-Have-8 ↔ DK-12 (dashboardFetch). Must-Have-9 ↔ DK-10 (login CSRF cookie). Must-Have-10 ↔ DK-11 (logout clear). Must-Have-11 ↔ DK-13. Must-Have-12-13 ↔ DK-14+DK-15. Must-Have-14 ↔ DK-16. Must-Have-17 ↔ DK-17. Spec = narrative contract, todo = testable gate. Beide beschreiben denselben Scope.


1. **Schema-Migration**: Neue Table `admin_session_version`:
   ```sql
   CREATE TABLE IF NOT EXISTS admin_session_version (
     user_id       INT NOT NULL,
     env           TEXT NOT NULL,
     token_version INT NOT NULL DEFAULT 0,
     updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     PRIMARY KEY (user_id, env)
   );
   ```
   Additive via `CREATE TABLE IF NOT EXISTS`. Boot-idempotent. Kein Backfill — missing row = treated as tv=0. `admin_users` bleibt unverändert.

2. **Login liest current token_version (env-scoped)**: Bei erfolgreichem Login (nach bcrypt.compare, vor JWT-Sign) separate DB-Query: `SELECT token_version FROM admin_session_version WHERE user_id = $1 AND env = $2`. Missing row → treated as `0`. JWT-Claim `{ sub, tv }` nutzt den gelesenen Wert. **Kein Bump bei Login** — Multi-Device-Semantik bleibt erhalten (Person A und B können parallel mit demselben Account arbeiten).

3. **Logout bumpt token_version atomar (TOCTOU-safe, env-scoped + upsert)**:
   ```sql
   INSERT INTO admin_session_version (user_id, env, token_version)
   VALUES ($1, $2, 1)
   ON CONFLICT (user_id, env)
   DO UPDATE SET token_version = admin_session_version.token_version + 1,
                 updated_at = NOW()
   WHERE admin_session_version.token_version = $3
   RETURNING token_version
   ```
   `$3 = payload.tv`. Missing row → INSERT with tv=1 (first-logout-after-migration path). Concurrent Dual-Tab: erster Call returniert new tv, zweiter returnt 0 rows (TOCTOU mismatch). Shared-Admin-Invariante: **jeder Logout kickt ALLE aktiven Sessions im selben env** (Laptop + Phone, beide prod → beide invalid).

4. **`verifySessionDualRead` returned `tokenVersion`**: Signature ändert zu `{ userId, tokenVersion, source }`. JWT ohne `tv`-Claim (Legacy-JWTs pre-migration) → `tokenVersion = 0` (matcht DB-Default, Transition-safe, kein Mass-Logout bei Deploy).

5. **API-Route Token-Version-Check (env-scoped)**: `requireAuth` in `api-helpers.ts` macht zusätzlich `SELECT token_version FROM admin_session_version WHERE user_id = $1 AND env = $2`. Missing row → tv=0. Mismatch mit JWT `tv` → 401 + `clearSessionCookies`. Single DB-Roundtrip pro Request, indexed via Primary Key — perf-neutral für Admin-UI-Usage. **`account/route.ts` muss ebenfalls ported werden** — nutzt aktuell inline `verifySessionDualRead + bumpCookieSource`, swap auf `requireAuth`.

6. **Dashboard-Layout Token-Version-Check (Page-Layer, env-scoped)**: `src/app/dashboard/layout.tsx` (Server Component, Node Runtime) macht denselben env-scoped DB-Check. Bei Mismatch → **Cookies clearen UND redirect** (`cookies().set(SESSION_COOKIE_NAME, "", {...maxAge:0})` + `redirect("/dashboard/login/")`). Ohne clear bleibt der stale Cookie im Browser und der User kriegt endlose Redirect-Loops. Layout-Gate = UX-Hygiene + Session-Cleanup.

7. **CSRF signed double-submit mit HMAC-Domain-Separator**:
   - **Token-Struktur**: `HMAC-SHA256(JWT_SECRET, "csrf-v1:" + userId + ":" + tokenVersion)`, base64url-encoded, 43 chars. Domain-Separator `"csrf-v1:"` erlaubt Secret-Reuse mit JWT_SECRET ohne Cross-Purpose-Forgery.
   - **Delivery**: `GET /api/auth/csrf` (authenticated-gated) setzt `__Host-csrf` Cookie (non-HttpOnly, `SameSite=Strict`, `Secure` in prod, `Path=/`) + returned Token in Response-Body. Rate-limited (120/15min keyed on userId — Session-Restore-class, nicht per-IP).
   - **Validation**: Shared helper `validateCsrfPair(req, userId, tokenVersion): Promise<boolean>` liest `x-csrf-token` Header + `__Host-csrf` Cookie → (a) beide present, (b) byte-gleich via `timingSafeEqualBytes`, (c) HMAC-verifiziert gegen `userId + tokenVersion`.
   - **Error-Response-Shape (JSON, konsistent mit bestehender API)**: Fail → 403 mit `{ success: false, error: "CSRF token missing"|"Invalid CSRF token", code: "csrf_missing"|"csrf_invalid" }`. Client matcht auf **stable `code` field** (nicht auf Error-String-Lokalisierung), existierende `await res.json()` pattern in Dashboard-Komponenten bleibt kompatibel.
   - **Edge-Runtime-Kompatibilität**: `timingSafeEqualBytes(a: Uint8Array, b: Uint8Array)` als XOR-Accumulator in `src/lib/csrf.ts` (Web-Crypto-only, kein `node:crypto.timingSafeEqual`). HMAC via `crypto.subtle.importKey` + `crypto.subtle.sign("HMAC", key, message)`.
   - **Integration**: `requireAuth` gated CSRF automatisch bei `req.method !== "GET"` (d.h. POST/PATCH/PUT/DELETE). GET-Reader-Routes unverändert. **Logout-Route**: CSRF-gated wie andere Mutations — Logout-ohne-CSRF wäre nur Self-DoS (keine Angriffsoberfläche), aber Konsistenz reduziert Exception-Paths.
   - **Logout bumpt** → alle vorherigen CSRF-Tokens der alten tokenVersion werden durch HMAC-Mismatch instant invalid. Kein DB-Storage, keine Revocation-Tabelle.

8. **Client-Side CSRF**:
   - **Helper**: `src/app/dashboard/lib/dashboardFetch.ts` — `dashboardFetch(url, init)`. Module-scope-cached Token. Erster Mutation-Call → `GET /api/auth/csrf` → cache token + set cookie. Alle Mutations attachen `x-csrf-token` Header. Bei `403` mit body `code === "csrf_missing"` **oder** `code === "csrf_invalid"` einmal refreshen + retry. Andere 403 (z.B. future role-gate, rate-limit) bubblen direkt hoch.
   - **Client parsed Response einheitlich**: `dashboardFetch` returned das raw `Response`-Objekt — Caller können `await res.json()` wie gewohnt aufrufen. Bei 401 → window.location.href login-redirect (user flies out to login). Bei retry-exhaust-403 → Response wird gebubbelt, Caller sieht `{success:false, error, code:"csrf_invalid"}` und kann entsprechend reagieren.
   - **Migration**: 19 `fetch("POST|PATCH|DELETE")`-Call-Sites in 10 Dashboard-Komponenten → `dashboardFetch`. GET-Call-Sites bleiben `fetch` (keine CSRF nötig, Helper-Usage optional).

9. **Login issued CSRF-Cookie atomar**: Login-Handler setzt beide Cookies (Session + CSRF) + embed CSRF-Token im Response-Body. Client cached sofort, keine zusätzliche `GET /api/auth/csrf`-Request beim ersten Mutation-Attempt.

10. **Logout cleart CSRF-Cookie atomar + idempotente Edge-Cases**: 
    - `clearSessionCookies` erweitern — cleart `__Host-csrf` mit same-attrs-as-set (`.set("", { secure, path:/, maxAge:0 })`, **nicht** `.delete()`).
    - **Idempotente Logout-Semantik (Edge-Cases explizit)**: 
      - `POST /api/auth/logout` ohne valide Session → `200 + clear cookies` (nicht 401). Logout ist idempotent — Client kann safely retryen oder der Button kann double-clicked werden.
      - Session valide, aber admin-row deleted → upsert läuft unconditionally, creates orphan row (harmless, rare) — `200 + clear cookies`. Kein Admin-Existenz-Check im Logout-Pfad (Defense-in-Depth ist `requireAuth` auf Mutationen, das returnt 401 bei deleted row).
      - Legacy JWT ohne `tv`-Claim → via `INSERT…ON CONFLICT` upsert-path bumpt korrekt von default=0 zu 1.
      - TOCTOU-conflict (concurrent dual-tab) → `UPDATE`-`WHERE token_version=$3` matched nur einmal, zweiter call returniert keine Row → `200 + clear cookies` (ebenfalls idempotent, DB-state ist bereits-gebumpt).
    - **Dashboard-Layout Mismatch-Pfad**: Layout.tsx Server-Component setzt `cookies().set(SESSION_COOKIE_NAME, "", {maxAge:0, path:"/", secure, httpOnly, sameSite:"lax"})` + `cookies().set(LEGACY_COOKIE_NAME, "", {maxAge:0, path:"/"})` + `cookies().set(CSRF_COOKIE_NAME, "", {maxAge:0, path:"/", secure})` BEVOR `redirect("/dashboard/login/")`. Ohne Cookie-Clear sieht der Login-Page-Handler wieder einen scheinbar-validen JWT und resultiert in Redirect-Loop.

11. **nginx COOP + CORP (site-wide)**: `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Resource-Policy: same-origin` in beiden `nginx/alit.conf` + `nginx/alit-staging.conf` (always-flag, inherit-fähig). **Scope-Anerkennung: Site-wide, nicht Dashboard-only** — betrifft auch Public-Routes, Media-URLs (`/api/media/<uuid>`), OG-Images.
    - **CORP same-origin Implikation**: Cross-origin `<img>`/`<script>`/`<iframe>` embeds von alit-Ressourcen werden von Browsern blockiert. Social-Card-Preview funktioniert trotzdem (Social-Bots machen server-side HTTP-Fetch, nicht browser-embed — CORP greift nicht).
    - **Staging-Deploy via manuellen Post-Merge-Hop** (nginx-Config nicht in CI).
    - **Verifikation im DK-17**: nach Deploy mit Twitter-/LinkedIn-Card-Validator gegen `https://alit.hihuydo.com/journal/<latest>/` → OG-Preview rendert. Manueller Smoke.

12. **Tests**:
    - Neu: `csrf.test.ts` (HMAC-korrekt, timingSafeEqualBytes, validateCsrfPair edge-cases)
    - Neu: `dashboardFetch.test.ts` (happy path, 403-refresh-retry, role-gate bubble)
    - Erweitert: `auth-cookie.test.ts` (tokenVersion im Return, Legacy-JWT ohne tv = 0)
    - Erweitert: `api-helpers.test.ts` (requireAuth DB tv-check, CSRF-validation, method-gate)
    - Erweitert: `auth.test.ts` (login liest tv via `getTokenVersion`, JWT hat tv-claim, env-scope korrekt — kein Bump)
    - Erweitert: `auth-login.test.ts` (CSRF-Cookie im Response + tv-claim)
    - Erweitert: `auth-logout.test.ts` (tv-bump atomar mit TOCTOU-test, CSRF-clear)
    - Vitest-count: ~40-60 neue Tests, 370→410-430 total.

13. **Build + Tests pass**: `pnpm build` + `pnpm test` grün. `pnpm audit --prod` 0 HIGH/CRITICAL.

14. **Staging Deploy + Smoke-Test (env-scoped, staging-only)**: Staging-Push grün + manuelle Verifikation **auf Staging** (Prod-Sessions bleiben komplett unberührt dank env-scope):
    - (a) Login auf Device A (staging) → Dashboard offen, Journal-Edit + Speichern durchläuft
    - (b) Login auf Device B (staging) mit gleichem Account → B kann parallel arbeiten (A bleibt eingeloggt)
    - (c) Logout auf Device B → Device A's nächster API-Call = 401 + Redirect (logout-invalidate innerhalb staging env)
    - (d) **Prod-Session-Sanity-Check**: nach allen Staging-Smokes kurz prod-Login prüfen → keine Auth-Störung durch Staging-Operationen (Beweis, dass env-scope hält)
    - (e) CSRF-Cookie nach Login im DevTools sichtbar (`__Host-csrf`, SameSite=Strict, Secure, non-HttpOnly)
    - (f) `curl`-Forgery (gültiges Session-Cookie, kein CSRF-Header) → 403 JSON `{..., code:"csrf_missing"}`

17. **OG/Media Cross-Origin Compatibility nach COOP/CORP-Rollout (Manuell, PMC)**: Twitter-Card-Validator (https://cards-dev.twitter.com/validator) + LinkedIn-Post-Inspector (https://www.linkedin.com/post-inspector) auf eine Journal-/Projekt-Route → Preview + Image rendern. Wenn ein Validator failed: Pattern-Follow-up dokumentieren (CORP ggf. auf Dashboard-location scopen).

> **Wichtig:** Nur Must-Have-Items sind Teil des Sprint Contracts. Diese werden im Review gegen PR-Findings **hart durchgesetzt** — alles außerhalb ist kein Merge-Blocker.

### Pre-Merge-Checklist (PMC, NICHT Sprint-Contract)

- **nginx-Config Deploy auf Staging + Prod**: Nach Merge ssh zum VPS → `sudo cp /opt/apps/alit-website-staging/nginx/alit-staging.conf /etc/nginx/sites-available/alit-staging` + `sudo nginx -t` + `sudo systemctl reload nginx`. Gleiches für prod. Style-Match (managed-by-Certbot blocks bewahren).
- **curl-Header-Check post-deploy**: `curl -sI https://alit.hihuydo.com/ | grep -iE '^(cross-origin-opener-policy\|cross-origin-resource-policy)'` → beide mit `same-origin`.
- **Staging-Browser-Smoke** für Login/Logout-Multi-Device (siehe Done-Kriterium 14).

### Nice to Have (explicit follow-up, NOT this sprint)

1. Admin-UI-Endpoint `GET /api/dashboard/audit/csrf-failures` für CSRF-Fail-Stats (als Defense-Observability) — landet in `memory/todo.md`.
2. Token-Version-Bump-Button im AccountSection ("Alle anderen Sessions abmelden") — Logout-all-explicit-button, außerhalb der natural Login/Logout-Bump-Cycle.
3. Client-Side visible toast "Sie wurden abgemeldet" bei 401 (derzeit nur silent redirect).
4. `2FA/TOTP` (T2, separater Sprint).

> **Regel:** Nice-to-Have wird im aktuellen Sprint NICHT gebaut. Der Zweck dieses Blocks ist, Scope-Drift während der Implementierung zu verhindern, indem wir verlockende Abzweigungen bewusst abparken. Beim Wrap-Up wandern diese Items nach `memory/todo.md`.

### Out of Scope

- **Bump-on-Login (aggressive Session-Rotation)** — ursprünglich in Draft-Spec v1, jetzt deferred. Würde jedes neue Login alle anderen Sessions kicken (1 aktive Session pro Admin gleichzeitig). Semantik-Implikation: User die Laptop + Phone nutzen fliegen sich gegenseitig raus. Aktuelles Design wählt Multi-Device-Permissiv. Re-Evaluate wenn Password-Compromise-Szenario real wird oder wenn Audit-Log Missbrauch zeigt.
- **Multi-user admin mit per-person accounts** — separater größerer Sprint (RBAC, Invite-Flow, role-column, per-user audit, per-user rate-limiter — fundamentale Architektur-Änderung).
- **2FA/TOTP** — T2, separater Sprint.
- **OAuth/SSO** — nicht geplant.
- **Password-Policy-Enforcement** (min-length, complexity, rotation-reminder) — Bootstrap-Hash kommt aus `.env`, App-seitig gibt's keinen "Change-Password"-Flow.
- **CSP `Content-Security-Policy` enforced flip** — Sprint D2, eigener Sprint.
- **Sprint C Cookie-Migration Removal** — wartet auf ≥7d clean observability-stream, eigener Sprint.

## Technical Approach

### Files to Change

| File | Change | Description |
|------|--------|-------------|
| `src/lib/schema.ts` | Modify | `CREATE TABLE IF NOT EXISTS admin_session_version (user_id INT, env TEXT, token_version INT DEFAULT 0, updated_at TIMESTAMPTZ, PK(user_id, env))` |
| `src/lib/auth.ts` | Modify | Login liest tv via `getTokenVersion(userId, env)` (env-scoped, kein bump), JWT-Claim `{ sub, tv }` |
| `src/lib/session-version.ts` | Create | Owner von beiden Helpers: `getTokenVersion(userId, env): Promise<number>` (missing row → 0) + `bumpTokenVersionForLogout(userId, env, expectedTv): Promise<number\|null>` (null bei TOCTOU-conflict / no-op). Shared von login + requireAuth + layout + logout |
| `src/lib/runtime-env.ts` | Create | Pure Edge-safe helper `deriveEnv(siteUrl?)`: "prod" \| "staging". Extracted aus cookie-counter.ts (dort re-importieren) |
| `src/lib/auth-cookie.ts` | Modify | `verifySessionDualRead` returned `{ userId, tokenVersion, source }`; Legacy-JWT ohne tv → tv=0 |
| `src/lib/api-helpers.ts` | Modify | `requireAuth` env-scoped DB-tv-check + CSRF-validation bei non-GET; Return-Shape erweitert `{ userId, tokenVersion, source }` |
| `src/app/api/dashboard/account/route.ts` | Modify | Inline `verifySessionDualRead + bumpCookieSource` → `requireAuth` ports (gewinnt tv-check + CSRF automatisch) |
| `src/lib/csrf.ts` | Create | `buildCsrfToken(secret, userId, tv)`, `validateCsrfPair(req, userId, tv)`, `timingSafeEqualBytes` — alles Edge-safe (Web-Crypto) |
| `src/lib/csrf.test.ts` | Create | HMAC-roundtrip, timing-safe compare, domain-separator-forgery-rejection |
| `src/app/api/auth/csrf/route.ts` | Create | `GET` authenticated → issues cookie + returns token in body |
| `src/app/api/auth/csrf/route.test.ts` | Create | Auth-gated (401 ohne Session), Cookie-Set korrekt, tokenVersion-bound |
| `src/app/api/auth/login/route.ts` | Modify | Nach `login()`: setSessionCookie + setCsrfCookie + embed csrfToken in response body |
| `src/app/api/auth/login/route.test.ts` | Modify | tv-claim in JWT, CSRF-Cookie im Response, token in body |
| `src/app/api/auth/logout/route.ts` | Modify | Bump tokenVersion atomar bevor clearSessionCookies + clearCsrfCookie; idempotent 200 + clear bei no-session / deleted-row / TOCTOU-conflict |
| `src/app/api/auth/logout/route.test.ts` | Modify | tv-bump rowCount-Gate, dual-call idempotent, CSRF-clear |
| `src/app/dashboard/layout.tsx` | Modify | Server-Component: env-scoped DB tv-check; bei Mismatch **cookies clearen (session + legacy + csrf) + redirect** auf `/dashboard/login/` (zusätzlich zu Proxy-Edge-JWT-Check; verhindert Redirect-Loop) |
| `src/app/dashboard/lib/dashboardFetch.ts` | Create | Client-side wrapper: cached CSRF token + auto-attach header + 403-refresh-retry |
| `src/app/dashboard/lib/dashboardFetch.test.ts` | Create | Happy path, 403-exact-match-refresh, role-gate-bubble, 401-redirect |
| `src/app/dashboard/components/AgendaSection.tsx` | Modify | 3 fetch-sites → dashboardFetch |
| `src/app/dashboard/components/AlitSection.tsx` | Modify | 2 fetch-sites → dashboardFetch |
| `src/app/dashboard/components/JournalSection.tsx` | Modify | 2 fetch-sites → dashboardFetch |
| `src/app/dashboard/components/ProjekteSection.tsx` | Modify | 2 fetch-sites → dashboardFetch |
| `src/app/dashboard/components/MediaSection.tsx` | Modify | 3 fetch-sites → dashboardFetch |
| `src/app/dashboard/components/MediaPicker.tsx` | Modify | 1 fetch-site (upload) → dashboardFetch |
| `src/app/dashboard/components/SignupsSection.tsx` | Modify | 3 fetch-sites → dashboardFetch |
| `src/app/dashboard/components/AccountSection.tsx` | Modify | 1 fetch-site → dashboardFetch |
| `src/app/dashboard/components/PaidHistoryModal.tsx` | Modify | (nur GET, kein change nötig — prüfen) |
| `src/app/dashboard/page.tsx` | Modify | 1 fetch-site → dashboardFetch |
| `src/app/dashboard/login/page.tsx` | Modify | Login-fetch bleibt plain `fetch` (Pre-Auth, kein CSRF-Token existiert) — aber Response-Token cachen in dashboardFetch-Store |
| `nginx/alit.conf` | Modify | `add_header Cross-Origin-Opener-Policy "same-origin" always;` + `Cross-Origin-Resource-Policy "same-origin"` |
| `nginx/alit-staging.conf` | Modify | Gleiche 2 add_header Zeilen |

### Architecture Decisions

**A. Edge-Node-Split für Token-Version-Check**
- **Entscheidung**: Proxy.ts (Edge) bleibt JWT-verify-only. Token-Version DB-Check nur in `requireAuth` (API-Layer) + `dashboard/layout.tsx` (Page-Layer, Server Component, Node).
- **Reasoning**: Edge-Runtime unterstützt kein `pg`. Proxy hat kein Netzwerk-Access zum DB-Pool. Alternative wäre Switch zu Node-Runtime für Middleware → drastischer Perf-Verlust + bricht Sprint D1 CSP-nonce-Setup.
- **Trade-off**: Stale-JWT kann Dashboard-HTML laden (Proxy-Redirect erkennt nur JWT-invalid, nicht tv-Mismatch). Mitigation: `dashboard/layout.tsx` Server-Component redirected auf Mismatch — User sieht kurz Loading-State, dann Login-Redirect. API-Calls sind 100% gated durch `requireAuth` DB-check.

**B. Bump-only-on-Logout (Multi-Device-Permissiv)**
- **Entscheidung**: Login liest `token_version` aus DB (kein Bump), JWT-Claim nutzt den gelesenen Wert. Logout bumpt tv atomar → alle Sessions (inkl. aktueller) werden invalidiert.
- **Reasoning**: Multi-Device-Szenario (Person arbeitet am Laptop + Phone simultan) wird nicht gebrochen. Der Hauptwert von `token_version` ist **Server-side Logout-Invalidation** (vorher gab's keine — JWT blieb 24h valid trotz "Logout"). Den kriegen wir mit Bump-nur-bei-Logout.
- **Emergency-Scenario** (Password-Compromise): Rotation via `.env`-Edit + `docker compose up -d` startet Container + kann `JWT_SECRET` mit-rotieren → invalidiert alle Sessions sofort. Kein Feature-Code nötig.
- **Alternative abgelehnt**: Bump-on-Login würde 1-Session-at-a-time erzwingen. Zu aggressiv für shared-admin-Usage ohne multi-user-support (Person A würde am Laptop rausfliegen wenn Person B am Phone login).
- **Future-Upgrade**: Falls Audit-Log Missbrauch zeigt oder Compliance Single-Session fordert, Bump-on-Login als eigener kleiner Sprint (1 Zeile in `login()`).

**C. CSRF-Cookie gleichzeitig mit Login-Response**
- **Entscheidung**: Login-Handler setzt beide Cookies (Session + CSRF) + embed CSRF-Token im Response-Body. Client cached sofort, keine zusätzliche `GET /api/auth/csrf`-Request beim ersten Mutation-Attempt.
- **Reasoning**: Login-Handler hat userId + current tokenVersion (gerade gelesen aus `admin_session_version`) in-context → token-Compute ist trivial, kein extra DB-Roundtrip. Alternative (reiner Prefetch bei erster Mutation) wäre +1 HTTP-Roundtrip pro Page-Load.

**D. Schema-Migration: Neue Table + Default-0 Transition**
- **Entscheidung**: Neue Table `admin_session_version(user_id, env, token_version, PK(user_id,env))`. Missing row = treated as tv=0. Legacy-JWTs ohne `tv`-Claim → `validateTv()` returned `0` → matcht missing-row-default → valid bis nächster Logout bumpt die Row.
- **Reasoning**: Keine forced-logout-on-deploy nötig. Smooth Migration. Missing-row = natural default, kein Backfill erforderlich.
- **Alternative abgelehnt**: `ALTER TABLE admin_users ADD COLUMN token_version` — bricht env-scope (Shared-DB zwischen Staging + Prod, siehe Decision I).

**I. Env-Scoped Token-Version via separate Table (NEU v3)**
- **Entscheidung**: Token-Version wird per-env gespeichert (`admin_session_version.env`). `env` wird aus `SITE_URL`-hostname abgeleitet (`staging.*` → "staging", sonst "prod"; siehe `deriveEnv` in `src/lib/cookie-counter.ts`).
- **Reasoning**: Staging + Prod teilen die DB (dokumentiert in `memory/lessons.md` + `patterns/deployment-staging.md`). Ein globaler `admin_users.token_version` würde einen Staging-Logout in einen Prod-Mass-Logout verwandeln (DK-16-Multi-Device-Smoke = Prod-Disaster). Env-scoped Storage löst das.
- **Alternative abgelehnt**: Separate Staging-DB vorziehen — ist eigener größerer Sprint (impact auf Sprint-B-Observability-Table, Migration-Workflow, Backup-Scripts). Nicht machbar hier.
- **Alternative abgelehnt**: JSONB-Column `admin_users.session_version` mit env als key — ebenfalls env-scope, aber schwerer atomar zu bumpen + weniger query-ergonomisch als dedicated Table.
- **Shared Reader `getTokenVersion(userId, env)`** vermeidet duplizierte COALESCE-Logik über login + requireAuth + layout.tsx.

**J. COOP/CORP explizit Site-wide (NEU v3)**
- **Entscheidung**: COOP + CORP `same-origin` werden auf allen Responses (nginx global) gesetzt, nicht nur auf Dashboard-Routes.
- **Reasoning**: nginx-Header-Inheritance-Trap (patterns/deployment-nginx.md) macht location-scoped add_header fragil. Site-wide ist robust + Public-Routes profitieren auch von Clickjacking/Cross-Origin-Isolation.
- **Trade-off acknowledged**: Cross-origin `<img>`-embed von alit-Ressourcen (z.B. `<img src="https://alit.hihuydo.com/api/media/...">` auf einer Drittseite) wird blockiert. Social-Card-Preview funktioniert weiter (Bots fetchen server-side). **DK-17** manuell verifizieren.
- **Fallback falls DK-17 fails**: CORP gezielt auf `/dashboard/*` + `/api/dashboard/*` scopen, CORP auf Public-Routes droppen. Muss über separate nginx-location gemacht werden — Ops-Follow-up.

**E. Shared `JWT_SECRET` für CSRF-HMAC via Domain-Separator**
- **Entscheidung**: CSRF-HMAC nutzt `JWT_SECRET`, aber prepended mit `"csrf-v1:"`. Ein JWT-Signature-Output kann NIE als CSRF-Token forgieren, weil die Payload-Struktur nicht mit `"csrf-v1:"` startet.
- **Reasoning**: Single-Secret-Rotation, keine zweite Env-Var. Pattern aus `patterns/auth-hardening.md`.

**F. `requireAuth` macht CSRF-Check conditional auf `req.method`**
- **Entscheidung**: GET/HEAD/OPTIONS überspringen CSRF. POST/PATCH/PUT/DELETE erfordern CSRF.
- **Reasoning**: CSRF ist per Definition State-Change-Schutz. GET-Reader-Endpoints haben keinen Bedarf.

**G. 403-Refresh-Retry nur bei exact-match body**
- **Entscheidung**: `dashboardFetch` refreshed CSRF + retries nur bei response-body exact-match `"CSRF token missing"` oder `"Invalid CSRF token"`. Andere 403 (z.B. future role-gate, rate-limit) bubblen direkt.
- **Reasoning**: Pattern aus `patterns/auth-hardening.md`. Verhindert Endless-Retry-Loop bei demoted-Admin oder Rate-Limit-Hit.

**H. Login-Page bleibt plain `fetch`, cached nur das Result**
- **Entscheidung**: `src/app/dashboard/login/page.tsx` ruft `/api/auth/login` direkt (nicht via dashboardFetch) — Pre-Auth, kein CSRF-Token existiert. Nach 200 OK greift es das `csrfToken`-Feld aus Response und seedet den `dashboardFetch`-Cache.
- **Reasoning**: Avoids chicken-and-egg (dashboardFetch erwartet Session-Cookie für CSRF-Prefetch).

### Dependencies

- **No new npm deps**: `crypto.subtle` (Web-Crypto, Edge + Node), `base64url` encode inline.
- **Env-Vars**: `JWT_SECRET` bereits vorhanden (≥32 chars, eager-checked).
- **Migration**: `ensureSchema()` ist idempotent, fresh + existing DBs selber Pfad.
- **No breaking changes für existing Sessions**: Legacy-JWTs ohne tv-Claim bleiben valid bis nächster Logout (irgendeine Device) oder 24h JWT-Expiry. Login bumped NICHT, kein Mass-Logout bei Deploy.

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| Legacy JWT (pre-Deploy) ohne `tv`-Claim | `validateTv(payload.tv)` returned `0` → matcht `admin_session_version` missing-row-default `0` → valid bis nächster Logout (auf irgendeinem Device) oder JWT-Expiry |
| Concurrent Dual-Tab-Logout (zwei Tabs rufen `/api/auth/logout` gleichzeitig) | Atomic `UPDATE … WHERE token_version = $expectedTv` — erster Call rowCount=1 + bumpt, zweiter rowCount=0 + no-op. Beide Tabs kriegen 200. |
| JWT tv=5, DB tv=10 (stale session nach anderem Logout) | `requireAuth` DB-check → Mismatch → 401 + clear cookies + bubble-up-Response. Client zeigt Login-Redirect. |
| Admin row deleted (unlikely, zwei-Pfad-Semantik) | **API-Gate-Pfad (`requireAuth`)**: auth.ts SELECT admin_users für password-check bricht falls verfügbar; JWT-sub in DB existiert nicht → 401 + clear. **Logout-Pfad**: upsert in `admin_session_version` läuft unconditionally, erzeugt ggf. orphan row (harmless, prune-bar); 200 + clear Cookies. Orphan-row-creation ist explizit akzeptiert — keine extra DB-round-trip für Admin-Existenz-Check. |
| CSRF-Cookie vorhanden, Header fehlt | 403 body `"CSRF token missing"` → Client refreshed + retried einmal → wenn weiter fehlt (z.B. Helper-Bug), final 403 rethrown |
| CSRF-Cookie fehlt, Header vorhanden | 403 body `"CSRF token missing"` (gleich wie oben — beide sind required) |
| CSRF-Cookie + Header präsent, aber tokenVersion im HMAC stale | 403 body `"Invalid CSRF token"` (HMAC-verify fails). Client refreshed → fetcht neuen Token mit aktueller tv → retry. |
| CSRF-Validation bei `OPTIONS`/`HEAD`-Request | Skipped (non-state-change methods) |
| Login mit korrektem Password + `getTokenVersion` DB-Error (transient) | Login-Handler catched, returned 500. User sieht Login-Error. Retry ok. Kein partial state (Session wird nicht gesetzt falls JWT-Sign nicht erreichbar). |
| `dashboardFetch` bei offline/network-error | Error propagiert durch — kein CSRF-Refresh-Retry (retry-logic nur für 403). |
| Login-Response token in body + Cookie — Client hat beide sofort | dashboardFetch-Cache seedet sich aus login-response.csrfToken → erster Mutation-Call ohne Extra-Prefetch. |
| 19 Call-Sites + 1 neuer Call-Site (next feature) vergisst `dashboardFetch` | Server liefert 403 → User sieht Error-Toast. Grep-Audit in PMC fängt's pre-merge. Runtime-Fallback: nicht still. |
| iOS Safari drop-ed `__Host-csrf` bei Pull-to-Refresh | Next Mutation → 403 "CSRF token missing" → Client refreshed via `GET /api/auth/csrf` (authenticated, kein CSRF-gate auf GET) → cookie re-set → retry succeeds. User merkt nichts. |

## Risks

| Risk | Mitigation |
|------|-----------|
| **Mass-Logout bei Deploy** (wenn Migration falsch designt) | Migration `DEFAULT 0` + Legacy-JWT-Fallback `tv=0` → keine existing-Session-Invalidation. Verify-Test: Pre-Deploy-Login + Post-Deploy-API-Call grün. |
| **Edge-safe Leaf-Regression** (auth-cookie.ts importiert Node-only) | File-Content-Regex-Test in `auth-cookie.test.ts` (existiert bereits, forbidden-list erweitern falls neue Helpers dazukommen) |
| **CSRF-Cookie missed auf Staging-nginx** (`__Host-` braucht Secure + kein Domain) | nginx ist pure proxy-pass (setzt keine Cookie-Attribute). Set-Cookie kommt vom App-Response-Header. Verify via `curl -I` auf Staging nach Login. |
| **19 Client-Call-Sites Migration missed** (einer bleibt mit plain `fetch`) | grep-Audit vor Merge: `grep -rn 'fetch(.*/(api/dashboard\|api/auth/logout))' src/app/dashboard/ \| grep -v dashboardFetch` → muss leer sein für non-GET-calls. Zweit-Check in CI optional (eslint-rule). |
| **Dashboard-UI-User merkt Logout nicht** (Person A sieht noch Dashboard, Click = 401) | `dashboardFetch` fängt 401 + triggert `window.location.href = "/dashboard/login/"`. Next-iteration: visible toast (Nice-to-Have). |
| **Sprint D1 CSP Report-Only breaks mit neuem JS** | Client-Side Bundles (dashboardFetch) sind Next.js-compiled → bekommen Nonce via Framework-Injection. Kein inline script. Kein CSP-Impact. Smoke-Test auf Staging ≥1 Dashboard-Flow. |
| **iOS Safari CSRF-Cookie Pull-to-Refresh** (analog zum Session-Cookie-Bug) | CSRF-Cookie bleibt `SameSite=Strict` (CSRF-Defense braucht das). Reload-Test auf iOS Safari nach Login — wenn CSRF-Cookie dropped wird, Client-Refresh holt neuen. UX unverändert (im Hintergrund). |
| **Performance-Overhead pro Request** (DB-tv-check zusätzlich) | Single `SELECT token_version FROM admin_session_version WHERE user_id = $1 AND env = $2` — indexed composite-PK-lookup, <1ms. Admin-UI <10 concurrent users. Perf-Impact irrelevant. |
| **JWT-Max-Age (24h) überlappt mit Logout-Bump** | Session bleibt valid bis Logout ODER JWT-Expiry. Bei Logout eines Tabs → ALLE Sessions (auch andere Devices) innerhalb env invalid. Parallel-Arbeiten bis Logout ist explizit erlaubt. |
| **Staging-Logout impactet Prod** | Mitigiert durch env-scoped `admin_session_version(user_id, env)`. Staging-bump UPDATEd `env='staging'`-row, Prod-reader liest `env='prod'`-row (oder missing = 0). Cross-env-Leak unmöglich. |
| **Logout ohne valide Session** (double-click, retry) | Idempotent 200 + clear cookies. Client merkt nicht. |
| **Logout mit deleted-admin-row** | Upsert-Path läuft unconditionally, erzeugt orphan row — harmless, prune-bar mit `DELETE FROM admin_session_version WHERE user_id NOT IN (SELECT id FROM admin_users)` als ad-hoc cleanup. `200 + clear cookies`. Tradeoff akzeptiert gegen +1 DB-round-trip für Admin-Existenz-Check. |
| **CSRF-Fehler UI-Verarbeitung** | Client liest `await res.json()`, erhält `{success:false, error, code}`. Matched auf `body.code` für Retry-Logik, auf `body.error` für User-Display. Kein Exception-Rauschen. |
