# Spec: T0-Auth-Hardening Sprint B — Cookie-Migration
<!-- Created: 2026-04-17 -->
<!-- Author: Planner (Claude) -->
<!-- Status: Draft v2 — Codex-Findings eingearbeitet (#1 Dual-Verify, #2 Single-Bump, #3 DATE, #5 stdout-Fallback, #6 Flip-Simplify, #7 Admin-Endpoint raus). Awaiting user approval. -->

## Summary
Migration des Session-Cookies von `session` → `__Host-session` in Produktion (und Staging). **Dual-Verify-Phase** (30 Tage): Primary wird zuerst verifiziert, bei verify-fail Fallback auf Legacy-Cookie → verhindert Admin-Lockout wenn `__Host-session` kaputt gesetzt aber Legacy noch gültig ist. DB-basierter Observability-Counter (`auth_method_daily`) mit **Single-Bump pro Request** + stdout-Fallback bei DB-Outage. Sprint B liefert Dual-Phase + Counter-Infrastruktur; Admin-Read-Endpoint + Dual-Removal sind Sprint C.

## Context

**Warum `__Host-session`:** `__Host-`-Prefix ist ein hard-coded Browser-Constraint (RFC 6265bis): Cookie muss `Secure=true`, `Path=/`, **kein** `Domain`-Attribut haben. Damit strukturell an exakten Origin gebunden — kein Subdomain-Overwrite, kein HTTP-Downgrade. Aktueller `session`-Cookie hat zwar `secure`+`path:/`, aber Domain-Fehler oder HTTP-Fallback wäre silent-akzeptiert.

**Warum Dual-Verify (nicht nur Dual-Read):** Während der Migration kann `__Host-session` aus mehreren Gründen kaputt sein: corrupt vom Browser, mit altem JWT_SECRET signiert (nach Secret-Rotation), abgelaufen. Wenn neben dem kaputten primary-Cookie ein gültiger legacy-`session`-Cookie liegt, MUSS die App den legacy verifizieren — sonst Admin-Lockout. Name-Precedence allein reicht nicht. **Fix: beide Cookies durch `verifySession` schicken, der erste der valide ist gewinnt.**

**Scope-Split-Grund (aus Sprint A Spec-Review):** Sprint A war server-side DB-state (bcrypt/rehash). Sprint B ist aktiver Client-state — wenn wir revertieren müssen, verlieren User die sich während Sprint B eingeloggt haben ihre Session. Rollback-Asymmetrie + Single-Admin-Scope machen das akzeptabel, aber NICHT bundled mit Sprint A deploybar.

**Codebase-Shape:**
- 7 Call-Sites mit hardcoded `"session"`:
  - `src/middleware.ts:24` — read (Edge-Runtime)
  - `src/lib/api-helpers.ts:6` — read (`requireAuth`)
  - `src/lib/signups-audit.ts:18` — read (`resolveActorEmail`)
  - `src/app/api/auth/login/route.ts:58` — write
  - `src/app/api/auth/logout/route.ts:10` — clear
  - `src/app/api/dashboard/account/route.ts:11` — read (GET)
  - `src/app/api/dashboard/account/route.ts:33` — read (PUT)
- `middleware.ts` läuft Edge-Runtime → kein `pg`/`bcryptjs`-Import erlaubt. `jose` ist Edge-safe.
- `auth-cookie.ts` wird Edge-safe Leaf: nur `jose` + `NextRequest/NextResponse`, kein `pg`.
- Counter ist separates Node-only Modul (`cookie-counter.ts`, pg-Import erlaubt).
- `NODE_ENV==='production'` bei Prod UND Staging → beide nutzen `__Host-session`-Namen. Staging testet den Prefix-Pfad vor Prod.

**Stack-Constraint (Shared Staging+Prod DB):** Neue `auth_method_daily`-Tabelle wird auf Staging-Push via `ensureSchema()` at-boot angelegt. Staging-Counter schreibt auf dieselbe DB wie Prod. Lösung: `env TEXT` Column (`prod`/`staging`) aus `SITE_URL`-Hostname abgeleitet. Flip-Kriterium-Query filtert `env='prod'`.

## Requirements

### Must Have (Sprint Contract)

1. **`src/lib/auth-cookie.ts` existiert** als Edge-safe Leaf-Modul mit:
   - `const SESSION_COOKIE_NAME: string` — `__Host-session` wenn `NODE_ENV==='production'`, sonst `session`.
   - `const LEGACY_COOKIE_NAME: string` — immer `session`.
   - `verifySessionDualRead(req: NextRequest): Promise<{ payload: { sub: string }; source: "primary" | "legacy" } | null>`
     - Liest zuerst `SESSION_COOKIE_NAME` → verifiziert via `jose.jwtVerify`. Bei Success → `{ payload, source: "primary" }`.
     - Bei **fehlendem ODER invalidem** primary → Fallback: liest `LEGACY_COOKIE_NAME` → verifiziert. Bei Success → `{ payload, source: "legacy" }`.
     - Wenn BEIDE fehlen oder beide invalid → `null`.
     - Ist dieselbe Pinning-Regel wie `auth.ts::verifySession` (`algorithms: ["HS256"]`), aber intern dupliziert (Edge-Runtime darf `auth.ts` nicht importieren).
     - Sonderfall: bei fehlendem `JWT_SECRET` → `null` (fail-closed, kein Throw — Edge-Runtime-kompatibel).
   - `setSessionCookie(res: NextResponse, token: string): void` — schreibt IMMER nur `SESSION_COOKIE_NAME` mit `httpOnly=true`, `secure=NODE_ENV==='production'`, `sameSite='strict'`, `path='/'`, `maxAge=86400`.
   - `clearSessionCookies(res: NextResponse): void` — clear auf BEIDE Namen (`maxAge=0`), für Dual-Phase Logout.
   - **Edge-Safe-Test:** File-Content-Grep liefert 0 Matches auf `from ['"](pg\|bcryptjs\|\\./db\|\\./audit\|\\./auth)` — per Unit-Test asserted.

2. **Alle 7 Call-Sites** konsumieren `auth-cookie.ts`:
   - `src/middleware.ts` — nutzt `verifySessionDualRead(req)` statt eigener `jwtVerify`-Inline-Logik + direktem Cookie-Read. Kein Counter-Bump (Edge).
   - `src/lib/api-helpers.ts::requireAuth` — signature changes to `requireAuth(req): Promise<NextResponse | { payload, source }>`. Bei valid session → returned `{ payload, source }` statt `null`. Caller kann Payload-Info nutzen. **Counter-Bump** über `bumpCookieSource(source)` genau hier, einmal pro Request.
   - `src/lib/signups-audit.ts::resolveActorEmail` — signature changes to `resolveActorEmail(userId: number): Promise<string | undefined>`. Nimmt nur noch User-ID aus bereits-verifiziertem Session-Payload entgegen, macht selber KEIN verifySession/Cookie-Read mehr → **kein Counter-Bump** (sonst Double-Bump). Aufrufer (signups routes, bulk-delete) holen userId aus dem `requireAuth`-Return.
   - `src/app/api/auth/login/route.ts` — `setSessionCookie(res, token)` statt `res.cookies.set("session", ...)`.
   - `src/app/api/auth/logout/route.ts` — `clearSessionCookies(res)` statt `res.cookies.set("session", ...)`.
   - `src/app/api/dashboard/account/route.ts` — GET + PUT nutzen `verifySessionDualRead(req)` direkt (bleiben bei Inline-Verify, kein Refactor auf `requireAuth`). Counter-Bump via `bumpCookieSource(source)` in jedem der beiden Handler einmal (beim erfolgreichen Verify).
   - **Grep-Contract:** `rg "cookies\.(get\|set)\(['\"]session['\"]" src/` liefert 0 Matches außer in `src/lib/auth-cookie.ts` + dessen Test.
   - **Call-Site-Audit:** alle aktuellen `requireAuth(req)`-Konsumenten (dashboard routes quer durchs Projekt) werden im gleichen Sprint auf neue Return-Shape umgestellt. Das sind **mehr als 7 Files** (media, agenda, journal, projekte, signups, etc.) — strukturell notwendige Konsequenz der signature-Änderung, nicht Scope-Creep. Generator darf alle `const auth = await requireAuth(req); if (auth) return auth;` zu `const auth = await requireAuth(req); if (auth instanceof NextResponse) return auth;` umbauen. Existierende `resolveActorEmail`-Call-Sites bekommen die User-ID aus dem `requireAuth`-Return gereicht.

3. **Single-Bump pro Request** strikt enforced:
   - Counter wird genau an EINEM von zwei mutually-exclusive Points gebumpt: (a) in `requireAuth` (für die meisten Dashboard-APIs); (b) in Account-Handler-Inline-Verify (GET + PUT). Keine Route triggert beide Pfade.
   - **Nie in `resolveActorEmail`** — das läuft IMMER nach `requireAuth` und hat das Session-Payload bereits aus dem requireAuth-Ergebnis.
   - **Nie in middleware** — Edge-Runtime-Constraint (kein pg).
   - **Nur bei Success (`verifySessionDualRead !== null`)** — nicht bei 401. Sonst zählt auslaufender Legacy-Traffic ewig weiter.

4. **Observability-Counter live:**
   - Neue Tabelle `auth_method_daily (date DATE NOT NULL, source TEXT NOT NULL, env TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(date, source, env))` in `src/lib/schema.ts::ensureSchema()`. `date` ist `DATE` (nicht TEXT) — `WHERE date >= current_date - 7` funktioniert ohne Cast.
   - `source` ∈ {`primary`, `legacy`} (entkoppelt von Cookie-Namen — Sprint C kann `__Host-session` → anderen Namen migrieren ohne Counter-Code zu ändern).
   - `env` ∈ {`prod`, `staging`} aus `SITE_URL`-Hostname: `new URL(process.env.SITE_URL).hostname.startsWith('staging.')` → `'staging'`, sonst `'prod'`. Modul-Level Konstante (einmal bei Load evaluiert). `SITE_URL` fehlt → `'prod'` als production-safe Default.
   - Helper `src/lib/cookie-counter.ts::bumpCookieSource(source: "primary" | "legacy")`:
     - Fire-and-forget. Primary write: `INSERT INTO auth_method_daily (date, source, env, count) VALUES (CURRENT_DATE, $1, $2, 1) ON CONFLICT (date, source, env) DO UPDATE SET count = auth_method_daily.count + 1`.
     - **Stdout-Fallback bei DB-Fail**: try/catch im `.catch()`-Block loggt `console.error("[cookie-counter] bump failed:", err)` UND zusätzlich strukturierten Log-Event: `console.log(JSON.stringify({ type: "cookie_bump_fallback", date, source, env, timestamp }))`. Docker-Log-Driver preserved → Reconstruktion via `docker compose logs | grep cookie_bump_fallback` möglich.
     - Swallowed Promise: caller `void bumpCookieSource(source)` (kein await), Auth-Path nie blockiert. Auch bei nicht-DB-Fehler (z.B. unerwartete Exception im INSERT-Build) bleibt die Response unberührt.

5. **Tests:**
   - `src/lib/auth-cookie.test.ts`:
     - Name-Resolution: `NODE_ENV='production'` → `__Host-session`; `'development'` → `session`; `'test'` → `session`.
     - `verifySessionDualRead` — valid primary → `{ payload, source: 'primary' }`.
     - `verifySessionDualRead` — primary absent, valid legacy → `{ payload, source: 'legacy' }`.
     - `verifySessionDualRead` — primary INVALID (wrong secret/expired/corrupt), valid legacy → `{ payload, source: 'legacy' }`. **Kern-Test für Codex-Finding #1.**
     - `verifySessionDualRead` — both invalid → `null`.
     - `verifySessionDualRead` — no cookies → `null`.
     - `verifySessionDualRead` — JWT_SECRET missing → `null`, kein Throw.
     - `setSessionCookie` in prod schreibt nur `__Host-session`.
     - `clearSessionCookies` cleart beide Namen.
     - **Edge-Safe-Grep**: `readFileSync('src/lib/auth-cookie.ts')` + regex-assert zero matches `/from ['"](pg|bcryptjs|\.\/db|\.\/audit|\.\/auth)/`.
   - `src/lib/cookie-counter.test.ts`:
     - `deriveEnv()` — `SITE_URL=https://staging.alit.hihuydo.com` → `'staging'`; `https://alit.hihuydo.com` → `'prod'`; undefined → `'prod'`.
     - `bumpCookieSource` happy path — mock pool.query resolves → keine Promise-Rejection.
     - `bumpCookieSource` DB-error → mock pool.query rejects → stdout-Fallback-Log geschrieben, keine Promise-Rejection entkommt zu caller.
   - `pnpm build` grün, `pnpm test` grün (vorhandene 185 + neue), `pnpm audit --prod` → 0 HIGH/CRITICAL.

6. **Docker + Staging-Deploy:**
   - Keine neuen Env-Vars (Cookie-Name ist Code-Konstante aus `NODE_ENV`).
   - Staging-Push → DB bekommt `auth_method_daily`-Table via `ensureSchema()`.
   - Staging-Browser-Check: DevTools zeigt `__Host-session`-Cookie nach Re-Login, kein `session`-Cookie (Legacy-Cookie überlebt max. bis Browser-Session-Ende oder nächster Logout).

7. **Prod-Flip-Kriterium (für Sprint C Start)** — hart SQL-prüfbar:
   ```sql
   -- Flip erlaubt wenn Result dieser Query 7 Zeilen (`days` = 7) mit
   -- legacy_count=0 UND primary_count>0 zeigt, ODER: keine legacy-Zeile für
   -- die letzten 7 Tage in der Tabelle existiert.
   SELECT date,
          SUM(CASE WHEN source='primary' THEN count ELSE 0 END) AS primary_count,
          SUM(CASE WHEN source='legacy'  THEN count ELSE 0 END) AS legacy_count
     FROM auth_method_daily
    WHERE env = 'prod'
      AND date >= current_date - 7
    GROUP BY date
    ORDER BY date DESC;
   ```
   Flip-Entscheidung: Alle 7 Rows haben `legacy_count = 0 AND primary_count > 0`. Kein qualitativer "Baseline"-Vergleich nötig — SQL-bare. Wenn für einen Tag keine Zeile existiert (kein Traffic), Entscheidung auf nächsten Tag vertagen.

### Nice to Have (explicit follow-up, NOT this sprint → `memory/todo.md`)

1. **Sprint C: Dual-Verify-Removal** — nach Flip-Kriterium erfüllt. Eigener PR, eigene Spec.
2. **Admin-UI-Endpoint `GET /api/dashboard/audit/cookie-usage`** — für Single-Admin-Flow reicht `ssh + psql` mit obigem SQL. Endpoint + ggf. UI-Widget ist Sprint C oder separate Observability-Follow-up (Codex Finding #7).
3. **Automatischer Flip-Alarm** via Cron — überflüssig bei 1-Admin.
4. **Retention-Sweep** für `auth_method_daily` — Tabelle wächst ~2 rows × 2 env/day = 4 rows/Tag = ~1500/Jahr. Kein Sweep nötig.
5. **Observability-Counter für middleware-Edge-Requests** — via fetch-side-call zu Node-Endpoint. Unnötig bei small-admin-Scope.

### Out of Scope

- **Removal des Legacy-Cookies aus Code** (Sprint C).
- **`sameSite` Änderung** (bleibt `strict`).
- **CSRF-Token-Einführung**.
- **Rotation / Session-Revocation-Table**.
- **Email-basiertes Password-Reset**.
- **Middleware-Counter-Bump** (bewusst weg — Edge-Runtime-Kosten).
- **`/api/dashboard/audit/cookie-usage` Endpoint** (Sprint C, Finding #7).

## Technical Approach

### Files to Change

| File | Change Type | Description |
|------|-------------|-------------|
| `src/lib/auth-cookie.ts` | **Create** | Edge-safe Leaf: `SESSION_COOKIE_NAME`, `LEGACY_COOKIE_NAME`, `verifySessionDualRead`, `setSessionCookie`, `clearSessionCookies`. Imports nur `jose` + `next/server`. Zero `pg`/`bcryptjs`/`./db`/`./audit`/`./auth`. |
| `src/lib/cookie-counter.ts` | **Create** | Node-only: `bumpCookieSource(source)`, `deriveEnv()`. Fire-and-forget INSERT mit try/catch + stdout-Fallback-Log. |
| `src/lib/auth-cookie.test.ts` | **Create** | Unit-Tests inkl. Edge-Safe-Grep + Primary-invalid-Legacy-valid. |
| `src/lib/cookie-counter.test.ts` | **Create** | deriveEnv + DB-Error-Swallowing + Stdout-Fallback. |
| `src/lib/schema.ts` | Modify | `CREATE TABLE IF NOT EXISTS auth_method_daily` mit `date DATE NOT NULL` in `ensureSchema()`. |
| `src/middleware.ts` | Modify | Nutzt `verifySessionDualRead(req)` statt direktem jwtVerify + Cookie-Read. Kein Counter (Edge). |
| `src/lib/api-helpers.ts` | Modify | `requireAuth` Signatur: `Promise<NextResponse \| { payload: {sub:string}; source }>`. Counter-Bump einmal. |
| `src/lib/signups-audit.ts` | Modify | `resolveActorEmail(userId: number)` statt `(req)`. Kein Verify, kein Counter. |
| `src/app/api/auth/login/route.ts` | Modify | `setSessionCookie(res, token)`. |
| `src/app/api/auth/logout/route.ts` | Modify | `clearSessionCookies(res)`. |
| `src/app/api/dashboard/account/route.ts` | Modify | GET + PUT lesen via `verifySessionDualRead(req)`, bumpen Counter. |
| **All other `requireAuth(req)` callers** (dashboard routes — media, agenda, journal, projekte, signups single + bulk, audit) | Modify | Anpassung an neue Return-Shape. `resolveActorEmail(userId)` wird mit `auth.payload.sub` gerufen. |

### Architecture Decisions

1. **Edge-safe Leaf-Modul `auth-cookie.ts` mit interner jose-Verify**:
   - Middleware läuft Edge-Runtime → kann `auth.ts` nicht importieren (pg/bcrypt im File).
   - `auth-cookie.ts` importiert nur `jose` (Edge-safe) + `next/server` + `next/headers`-Cookie-API.
   - **Warum Verify in diesem Modul:** Wenn `auth-cookie.ts` nur Name-Resolution liefert und Caller separat `verifySession(token)` rufen, kann Dual-Read nicht Fallback-on-verify-fail liefern (Primary-invalid → Caller sieht `null`-Verify → kennt Legacy-Cookie gar nicht mehr). Also muss der Verify in `auth-cookie.ts` liegen und beide Cookies kennen.
   - Duplizierte JWT-Algorithm-Konstante (`"HS256"`) mit `auth.ts` — Codex-Pattern aus `patterns/auth.md:71` ("Als Konstante hoisten, sodass verify und sign synchron bleiben"). Shared constant file (`src/lib/jwt-algorithms.ts`) als einfachste Lösung, um Drift zu vermeiden.

2. **Counter-Schicht separat in `cookie-counter.ts`** (Codex-Finding #5):
   - Nicht in `auth-cookie.ts` (bricht Edge-Safety via pg-Import).
   - **Stdout-Fallback bei DB-Outage** spiegelt `auditLog`-Pattern (`src/lib/audit.ts`): DB fällt aus → Counter-Event als strukturiertes JSON auf stdout → reconstruierbar aus Docker-Logs. Ohne Fallback könnte Gate-Metrik silent drifting.

3. **`source` = `primary`/`legacy`** (nicht Cookie-Name):
   - Entkoppelt Counter-Code vom konkreten Cookie-Namen. Sprint C kann Umbennennung ohne Counter-Schema-Migration machen.

4. **`env` aus `SITE_URL`-Hostname** (Shared-DB-Constraint):
   - Staging + Prod schreiben auf dieselbe DB. `env`-Column trennt Reporting.
   - Modul-Level-Konstante, kein Runtime-Overhead.

5. **Counter-Bump nur bei `verifySessionDualRead`-Success**:
   - 401-Requests zählen nicht. Verhindert ewigen Legacy-Noise durch expired-Tokens oder Angriffe mit random Cookie-Namen.

6. **Single-Bump-Discipline** (Codex-Finding #2):
   - `requireAuth` ändert Signatur zu `Promise<NextResponse | { payload, source }>` — nicht mehr `NextResponse | null`. Caller bekommt Session-Info zurück und kann sie weiterreichen.
   - `resolveActorEmail` nimmt `userId: number` entgegen, nicht mehr `req`. Zero cookie-read, zero bump. Aufrufer holt `userId` aus `requireAuth`-Return.
   - Account-Handler bleiben Inline-Verify (nicht via `requireAuth`), bumpen direkt.
   - Middleware bumpt nie (Edge).

7. **Blast-Radius-Transparenz (Codex-Finding #4):**
   - `requireAuth`-Signatur-Change betrifft **alle** Dashboard-API-Routes (media, agenda, journal, projekte, signups, audit). Das ist ~20+ Files, nicht nur die namentlich genannten 7 Cookie-Call-Sites.
   - Counter misst damit effektiv **"authentifizierte Dashboard-API-Requests"**, nicht nur die 7 Cookie-Points. Flip-Metrik reflektiert Gesamtverkehr. Page-Loads allein (ohne API-Call) zählen nicht — akzeptierter Bias weil jede Dashboard-Page beim Mount API-Calls macht.
   - Generator MUSS alle `requireAuth`-Konsumenten in einem Pass anpassen (Compile-Error-guided refactor). Keine Feature-Flags, keine Gradual-Migration — der Signatur-Change ist atomar.

8. **Sprint-C-Follow-ups** explizit markiert:
   - Admin-Endpoint zurückgestellt (kein Single-Admin-Pain-Point).
   - Dual-Verify-Removal + stdout-Fallback-Entfernung + Retention-Sweep im Sprint-C-Scope.

### Dependencies

- **DB:** Schema-Addition `auth_method_daily` via `ensureSchema()`. Additive-only, keine Migration-Data.
- **Env:** Keine neuen Env-Vars.
- **Shared Staging+Prod DB:** Staging-Push = DDL-Deploy auf shared DB → Prod übernimmt ab ersten API-Call. `env`-Column trennt Reporting.
- **Internal:** `src/lib/schema.ts`, `src/lib/db.ts`, `src/lib/site-url.ts`. Optional neu: `src/lib/jwt-algorithms.ts` als Shared-Constant.

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| Request ohne Cookie | `verifySessionDualRead` → `null`. Caller 401. Kein Bump. |
| Request mit valid `__Host-session` | `{ payload, source: 'primary' }`. Counter `primary`+1. |
| Request mit valid `session` only (Legacy) | Primary miss → fallback legacy → `{ payload, source: 'legacy' }`. Counter `legacy`+1. |
| Request mit beiden valid | Primary wins. `source: 'primary'`. Counter `primary`+1. |
| **Primary invalid + Legacy valid** (Codex-Finding #1) | Primary verify-fail → Fallback → `{ payload, source: 'legacy' }`. Admin bleibt eingeloggt. Kern-Case. |
| Primary expired + Legacy valid | Same as invalid — legacy wins. |
| Both invalid/expired | `null`. 401. Kein Bump. |
| Request nach JWT_SECRET-Rotation | Alle existing tokens werden von `jose` rejected (Signatur-Mismatch). `null` → 401. Bei Login mit neuem Secret wird `__Host-session` frisch gesetzt. |
| `JWT_SECRET` env missing | `verifySessionDualRead` → `null` (fail-closed, kein Throw). |
| Dev-Mode (`NODE_ENV!=='production'`) | `SESSION_COOKIE_NAME='session'`. `secure=false`. Counter bumpt `primary`-source auf `session`-reads. |
| Staging mit altem pre-Sprint-B-Login-Cookie | Legacy-Cookie bleibt valid → Dual-Read liest → `source: 'legacy'` für `env='staging'`. Counter dokumentiert Legacy-Traffic bis nächster Logout/Expiry. |
| DB-Outage beim Counter-Bump | Try/catch → stdout-Fallback-Log (`cookie_bump_fallback` JSON) → Auth-Path unberührt. |
| Parallele Logins (Race) | `ON CONFLICT (date, source, env) DO UPDATE SET count = count + 1` → atomar. Kein Verlust. |
| Admin-UI-Endpoint (Codex #7) | **Out of Scope**. psql über ssh genügt für Single-Admin. |
| Request triggert requireAuth + resolveActorEmail (Signups-Bulk-Delete) | `requireAuth` bumpt 1×. `resolveActorEmail` liest kein Cookie mehr, nutzt `auth.payload.sub` → **kein 2. Bump**. Counter misst = authenticated requests. |
| Revert Sprint B nach Deploy | User mit `__Host-session`-Cookie verlieren Session (Revert-Code liest nur `session`). 1-Admin → einmal re-login. Akzeptiert. |

## Risks

- **Rollback-Asymmetrie:** Revert nach Deploy → `__Host-session`-User logged out. Mitigation: Single-Admin-Scope (Huy).
- **`requireAuth`-Signatur-Change ist Big-Bang-Refactor:** ~20+ Routes müssen in einem Commit angepasst werden (Compile-Error-guided). TypeScript fängt jeden Miss. Kein Gradual-Migration möglich.
- **Staging-Noise im Counter:** Mitigation: `env`-Column + Default-Filter `env='prod'` in Flip-Query. Expected-Staging-Volume: <20 Events/Tag.
- **Legacy-Cookie-Zombie:** Browser mit 24h-Token bleibt 24h im Counter als `legacy`. Nach ~25h Clearing erwartet. Wenn nach 7d noch `legacy>0` → Long-Session-Remnant (`patterns/auth.md:107-108` remember_me-Leak-Pattern).
- **Edge-Safe-Regression:** Future-Commit importiert `pg` in `auth-cookie.ts`. Mitigation: Unit-Test mit File-Content-Grep. CI-blocking bei Regression.
- **Forgotten Call-Site:** Neue Route mit direktem `req.cookies.get("session")`. Mitigation: Grep-Contract in Done-Kriterien; bei Auth-PR-Review manuell scannen. Kein ESLint-Rule.
- **DB-Fallback-Noise in Logs:** Bei anhaltender DB-Outage wird stdout mit `cookie_bump_fallback`-JSON geflutet. Akzeptiert — DB-Outage ist P0-Incident und wird sofort bemerkt/behoben; Log-Flood ist Symptom, nicht Problem.
- **Counter-Drift bei Signatur-Refactor-Miss:** Wenn eine Route fehlt (alte `requireAuth`-Shape) → TypeScript bricht Build. Kein silent-Drift möglich.

## Verification Strategy

### Pre-Merge (lokal + Staging)
1. `pnpm build` ✅ (Signatur-Refactor muss vollständig durch TypeScript-Checks)
2. `pnpm test` — alle neuen + vorhandenen Tests grün
3. `pnpm audit --prod` → 0 HIGH/CRITICAL
4. Grep-Check: `rg "cookies\.(get|set)\([\"']session[\"']" src/` → nur Hits in `auth-cookie.ts` + Test
5. Edge-Bundle-Check: `pnpm build` Success = middleware-Bundle ohne pg/bcryptjs (Next.js würde sonst Warnung oder Fehler werfen)
6. Staging-Push → `docker compose logs` clean → curl `https://staging.alit.hihuydo.com/api/health/` → 200
7. Staging-Login im Browser → DevTools → Cookie-Name = `__Host-session` (Secure, HttpOnly, SameSite=Strict, Path=/, kein Domain)
8. SSH → `psql -c "SELECT date, source, env, count FROM auth_method_daily WHERE env='staging' ORDER BY date DESC LIMIT 5"` → Row mit `source='primary'` für heute
9. **Primary-invalid-Test auf Staging:** In DevTools Cookie-Value von `__Host-session` manuell korrumpieren (z.B. ein Zeichen ändern). Dann Request an `/dashboard/` → sollte **weiterhin authentifiziert sein** (Legacy-Cookie fängt ab). DB-Check: `source='legacy'` für diesen Request. Cookie wiederherstellen nach Test.

### Post-Merge auf Prod
1. CI `gh run watch` grün
2. `curl -sI https://alit.hihuydo.com/api/health/` → 200
3. Prod-Login im Browser → DevTools → Cookie-Name = `__Host-session`
4. `ssh hd-server 'docker compose logs --tail=50 alit-web'` — clean, kein `cookie_bump_fallback`
5. SSH → `psql -c "SELECT date, source, env, count FROM auth_method_daily WHERE env='prod' AND date = current_date"` → `primary>=1, legacy=0or1`
6. 7-Tage-Observation: Flip-Kriterium-Query täglich → Trend dokumentieren. Wenn nach 7d clean → Sprint C darf starten.

### Shared-DB-Constraint
- **Keine destruktive DDL** — nur `CREATE TABLE IF NOT EXISTS`.
- **Staging-Push = DDL-Deploy auf Shared DB** → additive-only → keine Backup-Pflicht.

---

## Codex-Findings → Eingearbeitet (v2)

- ✅ **#1 [Contract/Security]** Dual-Read → Dual-Verify: `verifySessionDualRead` verifiziert Primary, bei Fail Fallback zu Legacy-Verify. Kern-Test im Test-Plan.
- ✅ **#2 [Correctness]** Single-Bump: `resolveActorEmail`-Refactor auf `userId`-Param (nicht `req`). Bump nur in `requireAuth` + Account-Inline-Verify.
- ✅ **#3 [Correctness]** `date DATE NOT NULL` statt TEXT.
- ✅ **#4 [Architecture]** Blast-Radius-Paragraph in Architecture Decisions #7 — `requireAuth`-Signatur-Change trifft alle Dashboard-Routes.
- ✅ **#5 [Architecture]** Stdout-Fallback im `bumpCookieSource`-catch (spiegelt `auditLog`-Pattern).
- ✅ **#6 [Contract]** Flip-Kriterium: hart-SQL-prüfbar via Query (legacy=0 ∧ primary>0 für 7 konsekutive Tage). Kein qualitativer Baseline-Vergleich.
- ✅ **#7 [Nice-to-have]** Admin-Endpoint `/api/dashboard/audit/cookie-usage` raus aus Sprint B → Sprint C / `memory/todo.md`.
