# Spec: T1 Auth-Sprint S — Shared-Admin-Hardening
<!-- Created: 2026-04-19 -->
<!-- Updated: 2026-04-19 v2 — Architecture Decision B scoped down: Login bumpt NICHT (nur logout bumpt). Multi-Device-Semantik bleibt erhalten. Bump-on-Login als Out-of-Scope/Future-Sprint dokumentiert. -->
<!-- Author: Planner (Claude) -->
<!-- Status: Draft -->

## Summary

Session-Rotation + Logout-Invalidate + CSRF-Protection + COOP/CORP-Header. Alle Dashboard-Mutations werden CSRF-gated, der shared Admin-Account bekommt server-seitige Session-Invalidation (ein Login/Logout bumpt `admin_users.token_version`, alle anderen Sessions werden instant ungültig), und die Origin-Isolation der Dashboard-UI wird durch COOP/CORP gehärtet.

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

1. **Schema-Migration**: `admin_users.token_version INT NOT NULL DEFAULT 0`. Additive via `ALTER TABLE … ADD COLUMN IF NOT EXISTS`. Boot-idempotent.

2. **Login liest current token_version**: Bei erfolgreichem Login (nach bcrypt.compare, vor JWT-Sign) das user-row SELECT erweitern um `token_version`. JWT-Claim `{ sub, tv }` nutzt den gelesenen Wert. **Kein Bump bei Login** — Multi-Device-Semantik bleibt erhalten (Person A und B können parallel mit demselben Account arbeiten).

3. **Logout bumpt token_version atomar (TOCTOU-safe)**: `UPDATE admin_users SET token_version = token_version + 1 WHERE id = $1 AND token_version = $2` mit `$2 = payload.tv`. Concurrent Dual-Tab-Logouts matchen nur beim ersten Call (zweiter: `rowCount=0`, no-op). Shared-Admin-Invariante: **jeder Logout kickt ALLE aktiven Sessions global** (wenn Person A am Laptop eingeloggt ist und Person B logt sich am Phone aus, wird A's Session auch invalidiert).

4. **`verifySessionDualRead` returned `tokenVersion`**: Signature ändert zu `{ userId, tokenVersion, source }`. JWT ohne `tv`-Claim (Legacy-JWTs pre-migration) → `tokenVersion = 0` (matcht DB-Default, Transition-safe, kein Mass-Logout bei Deploy).

5. **API-Route Token-Version-Check**: `requireAuth` in `api-helpers.ts` macht zusätzlich `SELECT token_version FROM admin_users WHERE id = $1`. Mismatch mit JWT `tv` → 401 + `clearSessionCookies`. Empty-Row (deleted admin) → 401 + clear. Single DB-Roundtrip pro Request, indexed via Primary Key — perf-neutral für Admin-UI-Usage.

6. **Dashboard-Layout Token-Version-Check (Page-Layer)**: `src/app/dashboard/layout.tsx` (Server Component, Node Runtime) macht denselben DB-Check. Bei Mismatch → `redirect("/dashboard/login/")`. Ohne das könnte ein Browser mit stale JWT die Dashboard-HTML laden (alle API-Calls failen aber, UI ist useless). Layout-Gate = UX-Hygiene.

7. **CSRF signed double-submit mit HMAC-Domain-Separator**:
   - **Token-Struktur**: `HMAC-SHA256(JWT_SECRET, "csrf-v1:" + userId + ":" + tokenVersion)`, base64url-encoded, 43 chars. Domain-Separator `"csrf-v1:"` erlaubt Secret-Reuse mit JWT_SECRET ohne Cross-Purpose-Forgery.
   - **Delivery**: `GET /api/auth/csrf` (authenticated-gated) setzt `__Host-csrf` Cookie (non-HttpOnly, `SameSite=Strict`, `Secure` in prod, `Path=/`) + returned Token in Response-Body. Rate-limited (120/15min keyed on userId — Session-Restore-class, nicht per-IP).
   - **Validation**: Shared helper `validateCsrfPair(req, userId, tokenVersion): Promise<boolean>` liest `x-csrf-token` Header + `__Host-csrf` Cookie → (a) beide present, (b) byte-gleich via `timingSafeEqualBytes`, (c) HMAC-verifiziert gegen `userId + tokenVersion`. Fail → 403 mit exact-match-body `"CSRF token missing"` oder `"Invalid CSRF token"`.
   - **Edge-Runtime-Kompatibilität**: `timingSafeEqualBytes(a: Uint8Array, b: Uint8Array)` als XOR-Accumulator in `src/lib/csrf.ts` (Web-Crypto-only, kein `node:crypto.timingSafeEqual`). HMAC via `crypto.subtle.importKey` + `crypto.subtle.sign("HMAC", key, message)`.
   - **Integration**: `requireAuth` gated CSRF automatisch bei `req.method !== "GET"` (d.h. POST/PATCH/PUT/DELETE). GET-Reader-Routes unverändert.
   - **Login bumpt, Logout bumpt** → alle vorherigen CSRF-Tokens der alten tokenVersion werden durch HMAC-Mismatch instant invalid. Kein DB-Storage, keine Revocation-Tabelle.

8. **Client-Side CSRF**:
   - **Helper**: `src/app/dashboard/lib/dashboardFetch.ts` — `dashboardFetch(url, init)`. Module-scope-cached Token. Erster Mutation-Call → `GET /api/auth/csrf` → cache token + set cookie. Alle Mutations attachen `x-csrf-token` Header. Bei `403` mit exact-match-body `"CSRF token missing"` **oder** `"Invalid CSRF token"` einmal refreshen + retry. Andere 403 (z.B. role-gate — derzeit nicht aktiv aber Defense-in-Depth) bubblen direkt hoch.
   - **Migration**: 19 `fetch("POST|PATCH|DELETE")`-Call-Sites in 10 Dashboard-Komponenten → `dashboardFetch`. GET-Call-Sites bleiben `fetch` (keine CSRF nötig, Helper-Usage optional).

9. **Login issued CSRF-Cookie atomar**: Login-Handler setzt beide Cookies (Session + CSRF) + embed CSRF-Token im Response-Body. Client cached sofort, keine zusätzliche `GET /api/auth/csrf`-Request beim ersten Mutation-Attempt.

10. **Logout cleart CSRF-Cookie atomar**: `clearSessionCookies` erweitern — cleart `__Host-csrf` mit same-attrs-as-set (`.set("", { secure, path:/, maxAge:0 })`, **nicht** `.delete()` — gleicher `__Host-`-prefix-Trap wie Session-Cookie).

11. **nginx COOP + CORP**: `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Resource-Policy: same-origin` in beiden `nginx/alit.conf` + `nginx/alit-staging.conf` (always-flag, inherit-fähig). Staging-Deploy via manuellen Post-Merge-Hop (nginx-Config nicht in CI).

12. **Tests**:
    - Neu: `csrf.test.ts` (HMAC-korrekt, timingSafeEqualBytes, validateCsrfPair edge-cases)
    - Neu: `dashboardFetch.test.ts` (happy path, 403-refresh-retry, role-gate bubble)
    - Erweitert: `auth-cookie.test.ts` (tokenVersion im Return, Legacy-JWT ohne tv = 0)
    - Erweitert: `api-helpers.test.ts` (requireAuth DB tv-check, CSRF-validation, method-gate)
    - Erweitert: `auth.test.ts` (login bumpt tv, JWT hat tv-claim)
    - Erweitert: `auth-login.test.ts` (CSRF-Cookie im Response + tv-claim)
    - Erweitert: `auth-logout.test.ts` (tv-bump atomar mit TOCTOU-test, CSRF-clear)
    - Vitest-count: ~40-60 neue Tests, 370→410-430 total.

13. **Build + Tests pass**: `pnpm build` + `pnpm test` grün. `pnpm audit --prod` 0 HIGH/CRITICAL.

14. **Staging Deploy + Smoke-Test**: Staging-Push grün + manuelle Verifikation:
    - (a) Login auf Device A → Dashboard offen, Journal-Edit + Speichern durchläuft
    - (b) Login auf Device B mit gleichem Account → B kann parallel arbeiten (A bleibt eingeloggt)
    - (c) Logout auf Device B → Device A's nächster API-Call = 401 + Redirect (global logout-invalidate)
    - (d) CSRF-Cookie nach Login im DevTools sichtbar (`__Host-csrf`, SameSite=Strict, Secure, non-HttpOnly)
    - (e) curl-Forgery (gültiges Session-Cookie, kein CSRF-Header) → 403 "CSRF token missing"

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
| `src/lib/schema.ts` | Modify | `ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 0` |
| `src/lib/auth.ts` | Modify | Login liest tv aus admin_users-SELECT (kein bump), JWT-Claim `{ sub, tv }`; neue `bumpTokenVersionForLogout(userId, expectedTv)` Funktion |
| `src/lib/auth-cookie.ts` | Modify | `verifySessionDualRead` returned `{ userId, tokenVersion, source }`; Legacy-JWT ohne tv → tv=0 |
| `src/lib/api-helpers.ts` | Modify | `requireAuth` DB-tv-check + CSRF-validation bei non-GET; Return-Shape erweitert `{ userId, tokenVersion, source }` |
| `src/lib/csrf.ts` | Create | `buildCsrfToken(secret, userId, tv)`, `validateCsrfPair(req, userId, tv)`, `timingSafeEqualBytes` — alles Edge-safe (Web-Crypto) |
| `src/lib/csrf.test.ts` | Create | HMAC-roundtrip, timing-safe compare, domain-separator-forgery-rejection |
| `src/app/api/auth/csrf/route.ts` | Create | `GET` authenticated → issues cookie + returns token in body |
| `src/app/api/auth/csrf/route.test.ts` | Create | Auth-gated (401 ohne Session), Cookie-Set korrekt, tokenVersion-bound |
| `src/app/api/auth/login/route.ts` | Modify | Nach `login()`: setSessionCookie + setCsrfCookie + embed csrfToken in response body |
| `src/app/api/auth/login/route.test.ts` | Modify | tv-claim in JWT, CSRF-Cookie im Response, token in body |
| `src/app/api/auth/logout/route.ts` | Modify | Bump tokenVersion atomar bevor clearSessionCookies + clearCsrfCookie |
| `src/app/api/auth/logout/route.test.ts` | Modify | tv-bump rowCount-Gate, dual-call idempotent, CSRF-clear |
| `src/app/dashboard/layout.tsx` | Modify | Server-Component: DB tv-check, redirect auf Mismatch (zusätzlich zu Proxy-Edge-JWT-Check) |
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
- **Reasoning**: Login-Handler hat userId + tokenVersion (gerade gebumpt) in-context → token-Compute ist trivial, kein extra DB-Roundtrip. Alternative (reiner Prefetch bei erster Mutation) wäre +1 HTTP-Roundtrip pro Page-Load.

**D. Schema-Migration: Transition via `DEFAULT 0`**
- **Entscheidung**: `token_version INT NOT NULL DEFAULT 0`. Alle existierenden Rows bekommen 0. Legacy-JWTs ohne `tv`-Claim → `validateTv()` returned `0` → matcht DB → valid bis nächster Login.
- **Reasoning**: Keine forced-logout-on-deploy nötig. Smooth Migration.
- **Alternative**: Forced Mass-Logout (DB-Script `UPDATE admin_users SET token_version = 1 WHERE token_version = 0` einmalig nach Deploy). Disruptiv, unnötig.

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
- **No breaking changes für existing Sessions**: Legacy-JWTs ohne tv-Claim bleiben valid bis nächster Login.

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| Legacy JWT (pre-Deploy) ohne `tv`-Claim | `validateTv(payload.tv)` returned `0` → matcht DB-Default `0` → valid bis nächster Login |
| Concurrent Dual-Tab-Logout (zwei Tabs rufen `/api/auth/logout` gleichzeitig) | Atomic `UPDATE … WHERE token_version = $expectedTv` — erster Call rowCount=1 + bumpt, zweiter rowCount=0 + no-op. Beide Tabs kriegen 200. |
| JWT tv=5, DB tv=10 (stale session nach anderem Logout) | `requireAuth` DB-check → Mismatch → 401 + clear cookies + bubble-up-Response. Client zeigt Login-Redirect. |
| Admin row deleted aus DB (unlikely aber möglich) | `requireAuth` DB-Query returnt 0 rows → 401 + clear cookies. |
| CSRF-Cookie vorhanden, Header fehlt | 403 body `"CSRF token missing"` → Client refreshed + retried einmal → wenn weiter fehlt (z.B. Helper-Bug), final 403 rethrown |
| CSRF-Cookie fehlt, Header vorhanden | 403 body `"CSRF token missing"` (gleich wie oben — beide sind required) |
| CSRF-Cookie + Header präsent, aber tokenVersion im HMAC stale | 403 body `"Invalid CSRF token"` (HMAC-verify fails). Client refreshed → fetcht neuen Token mit aktueller tv → retry. |
| CSRF-Validation bei `OPTIONS`/`HEAD`-Request | Skipped (non-state-change methods) |
| Login mit korrektem Password + tv-Bump-DB-Error (transient) | Login-Handler catched, returned 500. User sieht Login-Error. Retry ok. |
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
| **Performance-Overhead pro Request** (DB-tv-check zusätzlich) | Single `SELECT token_version FROM admin_users WHERE id = $1` — indexed PK-lookup, <1ms. Admin-UI <10 concurrent users. Perf-Impact irrelevant. |
| **JWT-Max-Age (24h) überlappt mit Logout-Bump** | Session bleibt valid bis Logout ODER JWT-Expiry. Bei Logout eines Tabs → ALLE Sessions (auch andere Devices) invalid. Parallel-Arbeiten bis Logout ist explizit erlaubt. |
