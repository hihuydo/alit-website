# Spec: T0-Auth-Hardening Sprint B — Cookie-Migration
<!-- Created: 2026-04-17 -->
<!-- Author: Planner (Claude) -->
<!-- Status: Draft v3 — Codex Runde 2 Findings eingearbeitet (Legacy-Clear-on-Login, userId-validation in verifySessionDualRead, 7-Tage-Fenster fix, 3. resolveActorEmail-Call-Site, JWT_SECRET-drift dokumentiert). Awaiting user approval. -->

## Summary
Migration des Session-Cookies von `session` → `__Host-session` in Produktion (und Staging). **Dual-Verify-Phase** (30 Tage): Primary wird zuerst verifiziert, bei verify-fail Fallback auf Legacy-Cookie → verhindert Admin-Lockout wenn `__Host-session` kaputt gesetzt aber Legacy noch gültig ist. **Login cleart Legacy-Cookie** atomar beim Setzen des neuen Primary-Cookie (nur prod, wenn Namen unterschiedlich sind). DB-basierter Observability-Counter (`auth_method_daily`) mit **Single-Bump pro Request** + stdout-Fallback bei DB-Outage. Sprint B liefert Dual-Phase + Counter-Infrastruktur; Admin-Read-Endpoint + Dual-Removal sind Sprint C.

## Context

**Warum `__Host-session`:** `__Host-`-Prefix ist ein hard-coded Browser-Constraint (RFC 6265bis): Cookie muss `Secure=true`, `Path=/`, **kein** `Domain`-Attribut haben. Damit strukturell an exakten Origin gebunden — kein Subdomain-Overwrite, kein HTTP-Downgrade.

**Warum Dual-Verify (nicht nur Dual-Read):** Während der Migration kann `__Host-session` aus mehreren Gründen kaputt sein: corrupt vom Browser, mit altem JWT_SECRET signiert (nach Secret-Rotation), abgelaufen. Wenn neben dem kaputten primary-Cookie ein gültiger legacy-`session`-Cookie liegt, MUSS die App den legacy verifizieren — sonst Admin-Lockout.

**Warum Legacy-Clear-on-Login:** Ohne Clear bleiben beide Cookies nach Re-Login nebeneinander bis Legacy-Expiry. Die `auth_method_daily`-Metrik würde dann den Legacy-Cookie ewig als `primary=primary, legacy=coexists` sehen (obwohl Primary gewinnt). Zusätzlich wäre der Staging-Verifikations-Check verwirrend. Fix: `setSessionCookie` cleart Legacy-Cookie atomar mit — nur wenn Primary-Name ≠ Legacy-Name (prod-only, im dev-mode sind beide Namen `session`).

**Scope-Split-Grund:** Sprint A war server-side DB-state (bcrypt/rehash). Sprint B ist aktiver Client-state mit Rollback-Asymmetrie.

**Codebase-Shape:**
- 7 Cookie-spezifische Call-Sites: middleware, api-helpers (`requireAuth`), signups-audit (`resolveActorEmail`), login/logout/account×2.
- `signups-audit.ts::resolveActorEmail` wird an **3** Produktions-Routes aufgerufen:
  - `src/app/api/dashboard/signups/[type]/[id]/route.ts` (single DELETE)
  - `src/app/api/dashboard/signups/bulk-delete/route.ts` (bulk POST)
  - `src/app/api/dashboard/signups/memberships/[id]/paid/route.ts` (paid-toggle PATCH)
- `middleware.ts` läuft Edge-Runtime → nur `jose` + `NextRequest/NextResponse` erlaubt, kein `pg`/`bcryptjs`.
- `JWT_SECRET` wird von `auth.ts` (Node-Path) als Throw-bei-Fehlen behandelt und von `instrumentation.ts` nur per Warn-Log geflaggt. v3 dokumentiert das Fail-Mode-Delta explizit (nicht Sprint-B-Scope, aber Transparenz).

**Stack-Constraint (Shared Staging+Prod DB):** Neue `auth_method_daily`-Tabelle über `ensureSchema()` auf Staging-Push angelegt → Prod übernimmt sofort. `env TEXT` Column trennt Reporting.

## Requirements

### Must Have (Sprint Contract)

1. **`src/lib/auth-cookie.ts` existiert** als Edge-safe Leaf-Modul mit:
   - `const SESSION_COOKIE_NAME: string` — `__Host-session` wenn `NODE_ENV==='production'`, sonst `session`.
   - `const LEGACY_COOKIE_NAME: string` — immer `session`.
   - `verifySessionDualRead(req: NextRequest): Promise<{ userId: number; source: "primary" | "legacy" } | null>`
     - Liest zuerst `SESSION_COOKIE_NAME` → verifiziert via `jose.jwtVerify` (`algorithms: ["HS256"]` aus shared const).
     - Bei Verify-Success extrahiert `payload.sub` (string lt. JWT-Standard) → validiert per `/^[0-9]+$/` → `parseInt(..., 10)`.
     - Wenn Primary **missing ODER verify-fail ODER sub invalid** → Fallback auf `LEGACY_COOKIE_NAME` mit gleicher Pipeline.
     - Return `{ userId: number, source: 'primary' | 'legacy' }` beim ersten erfolgreichen Verify+Sub-Validate.
     - Wenn beide Cookies fehlen ODER beide verify-fail ODER beide sub-invalid → `null`.
     - Sonderfall: `JWT_SECRET` env fehlt → `null` (fail-closed, kein Throw — Edge-Runtime-kompatibel).
   - `setSessionCookie(res: NextResponse, token: string): void`:
     - Setzt IMMER `SESSION_COOKIE_NAME` mit `httpOnly=true`, `secure=NODE_ENV==='production'`, `sameSite='strict'`, `path='/'`, `maxAge=86400`.
     - **Zusätzlich** wenn `SESSION_COOKIE_NAME !== LEGACY_COOKIE_NAME` (prod-case): `res.cookies.set(LEGACY_COOKIE_NAME, "", { maxAge: 0, path: "/" })` → cleart alten Legacy-Cookie atomar.
   - `clearSessionCookies(res: NextResponse): void` — cleart beide Namen (`maxAge=0`), für Logout.
   - **Edge-Safe-Test:** File-Content-Grep liefert 0 Matches `/from ['"](pg\|bcryptjs\|\.\/db\|\.\/audit\|\.\/auth)/` — per Unit-Test asserted.

2. **Alle Call-Sites** konsumieren `auth-cookie.ts`:
   - `src/middleware.ts` — nutzt `verifySessionDualRead(req)` statt inline-jwtVerify + direktem Cookie-Read. Kein Counter-Bump (Edge).
   - `src/lib/api-helpers.ts::requireAuth` — Signatur: `Promise<NextResponse | { userId: number; source: "primary" | "legacy" }>`. Bei `verifySessionDualRead === null` → 401-NextResponse. Bei Success → `void bumpCookieSource(source)` + return `{ userId, source }`. **UserId ist bereits validated-int** (`verifySessionDualRead` hat die Konversion gemacht).
   - `src/lib/signups-audit.ts::resolveActorEmail` — Signatur: `(userId: number): Promise<string | undefined>`. Zero Cookie-Read, zero Verify, zero Counter-Bump. Sieht nur User-ID und führt DB-Lookup durch.
   - **Alle 3 `resolveActorEmail`-Call-Sites** passen die Signatur an:
     - `src/app/api/dashboard/signups/[type]/[id]/route.ts` → ruft `resolveActorEmail(auth.userId)` statt `(req)`.
     - `src/app/api/dashboard/signups/bulk-delete/route.ts` → dito.
     - `src/app/api/dashboard/signups/memberships/[id]/paid/route.ts` → dito.
   - **Alle anderen `requireAuth`-Konsumenten** (dashboard routes quer durchs Projekt) auf neue Return-Shape:
     - Alter Pattern: `const r = await requireAuth(req); if (r) return r;`
     - Neuer Pattern: `const auth = await requireAuth(req); if (auth instanceof NextResponse) return auth;`
     - TypeScript fängt jeden Miss.
   - `src/app/api/auth/login/route.ts` — `setSessionCookie(res, token)` (→ cleart Legacy atomar).
   - `src/app/api/auth/logout/route.ts` — `clearSessionCookies(res)`.
   - `src/app/api/dashboard/account/route.ts` — GET + PUT nutzen `verifySessionDualRead(req)` direkt (bleibt Inline-Verify, kein Refactor auf `requireAuth`). Counter-Bump via `bumpCookieSource(source)` in jedem der beiden Handler einmal (bei `verifySessionDualRead !== null`). UserId aus dem Return-Objekt direkt an DB-Queries.
   - **Grep-Contract:** `rg "cookies\.(get\|set)\(['\"]session['\"]" src/` liefert 0 Matches außer in `src/lib/auth-cookie.ts` + dessen Test.

3. **Single-Bump pro Request** strikt enforced:
   - Counter wird genau an EINEM von zwei mutually-exclusive Points gebumpt: (a) in `requireAuth` (für die meisten Dashboard-APIs); (b) in Account-Handler-Inline-Verify (GET + PUT). Keine Route triggert beide Pfade.
   - **Nie in `resolveActorEmail`** — das läuft IMMER nach `requireAuth` und hat die UserId bereits.
   - **Nie in middleware** — Edge-Runtime-Constraint (kein pg).
   - **Nur bei Success (`verifySessionDualRead !== null`)** — nicht bei 401.

4. **Observability-Counter live:**
   - Neue Tabelle `auth_method_daily (date DATE NOT NULL, source TEXT NOT NULL, env TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(date, source, env))` in `src/lib/schema.ts::ensureSchema()`. **`date` ist `DATE`** — `WHERE date >= current_date - N` funktioniert ohne Cast.
   - `source` ∈ {`primary`, `legacy`} (entkoppelt von Cookie-Namen für Sprint C).
   - `env` ∈ {`prod`, `staging`} aus `SITE_URL`-Hostname (`new URL(process.env.SITE_URL).hostname.startsWith('staging.')` → `'staging'`, sonst `'prod'`; Fallback `'prod'` wenn `SITE_URL` fehlt). Modul-Level Konstante.
   - Helper `src/lib/cookie-counter.ts::bumpCookieSource(source)`:
     - Fire-and-forget. Primary write: `INSERT INTO auth_method_daily (date, source, env, count) VALUES (CURRENT_DATE, $1, $2, 1) ON CONFLICT (date, source, env) DO UPDATE SET count = auth_method_daily.count + 1`.
     - **Stdout-Fallback bei DB-Fail**: `.catch()` loggt `console.error("[cookie-counter] bump failed:", err)` UND strukturierten Event `console.log(JSON.stringify({ type: "cookie_bump_fallback", date, source, env, timestamp }))`. Docker-Log-Driver preserved → Reconstruktion via `docker compose logs | grep cookie_bump_fallback`.
     - Caller ruft `void bumpCookieSource(source)` (kein await), Auth-Path nie blockiert.

5. **Tests:**
   - `src/lib/auth-cookie.test.ts`:
     - Name-Resolution: `NODE_ENV='production'` → `__Host-session`; `'development'` → `session`; `'test'` → `session`.
     - `verifySessionDualRead`: valid primary mit gültigem `sub` → `{ userId, source: 'primary' }`.
     - `verifySessionDualRead`: primary absent, valid legacy → `{ userId, source: 'legacy' }`.
     - **Primary INVALID (wrong secret/expired/corrupt) + valid legacy** → `{ userId, source: 'legacy' }` (Kern-Test Codex R1 #1).
     - `verifySessionDualRead`: both invalid → `null`.
     - `verifySessionDualRead`: no cookies → `null`.
     - `verifySessionDualRead`: JWT_SECRET missing → `null` (kein Throw).
     - `verifySessionDualRead`: **primary valid verify ABER `sub='abc'` (non-numeric)** → Fallback auf Legacy (UserId-Validate ist Teil des Dual-Verify, nicht post-hoc).
     - `verifySessionDualRead`: beide Tokens mit non-numeric sub → `null`.
     - `setSessionCookie` in prod: sets `__Host-session` UND cleart `session` (maxAge=0).
     - `setSessionCookie` in dev: sets `session` ohne zweiten Set-Call (Namen identisch).
     - `clearSessionCookies` cleart beide Namen.
     - **Edge-Safe-Grep** File-Content-Test.
   - `src/lib/cookie-counter.test.ts`:
     - `deriveEnv`: staging/prod/missing-SITE_URL.
     - `bumpCookieSource` happy path (mock pool.query resolves).
     - `bumpCookieSource` DB-error → stdout-Fallback-Log geschrieben + zero Promise-Rejection escaped.
   - `pnpm build` grün, `pnpm test` grün, `pnpm audit --prod` → 0 HIGH/CRITICAL.

6. **Docker + Staging-Deploy:**
   - Keine neuen Env-Vars.
   - Staging-Push → DB bekommt `auth_method_daily`-Table via `ensureSchema()`.
   - Staging-Browser-Check: nach Re-Login zeigt DevTools `__Host-session` UND `session` ist verschwunden (clear via `setSessionCookie`).

7. **Prod-Flip-Kriterium (für Sprint C Start)** — hart SQL-prüfbar, **7-Kalendertage-Fenster (exklusiv future, inklusive heute)**:
   ```sql
   SELECT date,
          SUM(CASE WHEN source='primary' THEN count ELSE 0 END) AS primary_count,
          SUM(CASE WHEN source='legacy'  THEN count ELSE 0 END) AS legacy_count
     FROM auth_method_daily
    WHERE env = 'prod'
      AND date >= current_date - 6   -- current_date minus 6 days = 7 calendar days incl. today
      AND date <= current_date
    GROUP BY date
    ORDER BY date DESC;
   ```
   **Flip-Entscheidung:**
   - Resultset hat 7 Zeilen (für jeden der letzten 7 Tage gab es mindestens einen authenticated Request).
   - Alle 7 Zeilen haben `legacy_count = 0 AND primary_count > 0`.
   - Wenn für einen Tag keine Zeile existiert (z.B. Huy hatte Urlaub und war offline) → Fenster verschiebt sich, auf nächsten Tag warten.
   - Kein qualitativer Baseline-Vergleich nötig.

### Nice to Have (explicit follow-up, NOT this sprint → `memory/todo.md`)

1. **Sprint C: Dual-Verify-Removal** nach Flip-Kriterium erfüllt.
2. **Admin-UI-Endpoint `GET /api/dashboard/audit/cookie-usage`** — für Single-Admin reicht `ssh + psql` mit obigem SQL (Codex Runde 1 Finding #7).
3. **Automatischer Flip-Alarm** via Cron.
4. **Retention-Sweep** für `auth_method_daily`.
5. **Counter in middleware** via fetch-side-Endpoint.
6. **JWT_SECRET-Fail-Mode vereinheitlichen** (instrumentation.ts throw statt warn; auth-cookie.ts/auth.ts gleiche Semantik) — eigener Security-Hardening-Sprint.

### Out of Scope

- **Removal Legacy-Cookie aus Code** (Sprint C).
- **`sameSite` Änderung** (bleibt `strict`).
- **CSRF-Token-Einführung**.
- **Rotation / Session-Revocation-Table**.
- **Email-basiertes Password-Reset**.
- **Middleware-Counter-Bump** (Edge-Runtime-Kosten).
- **`/api/dashboard/audit/cookie-usage` Endpoint** (Sprint C).
- **JWT_SECRET-Fail-Mode-Vereinheitlichung** (separater Security-Hardening-Sprint).

## Technical Approach

### Files to Change

| File | Change Type | Description |
|------|-------------|-------------|
| `src/lib/jwt-algorithms.ts` | **Create** | Shared const `JWT_ALGORITHMS = ["HS256"] as const`. Shared zwischen `auth.ts` + `auth-cookie.ts` gegen drift. Edge-safe (reine Konstante). |
| `src/lib/auth.ts` | Modify | Refactor `verifySession` + `SignJWT` auf Shared-Konstante. |
| `src/lib/auth-cookie.ts` | **Create** | Edge-safe Leaf: `SESSION_COOKIE_NAME`, `LEGACY_COOKIE_NAME`, `verifySessionDualRead` (inkl. userId-validation), `setSessionCookie` (mit Legacy-clear), `clearSessionCookies`. Imports nur `jose`, `next/server`, `./jwt-algorithms`. Zero pg/bcryptjs/./db/./audit/./auth. |
| `src/lib/cookie-counter.ts` | **Create** | Node-only: `bumpCookieSource(source)`, `deriveEnv()`. Fire-and-forget + stdout-Fallback. |
| `src/lib/auth-cookie.test.ts` | **Create** | Unit-Tests inkl. Edge-Safe-Grep + primary-invalid-legacy-valid + non-numeric-sub. |
| `src/lib/cookie-counter.test.ts` | **Create** | deriveEnv + DB-Error-Swallowing + Stdout-Fallback. |
| `src/lib/schema.ts` | Modify | `CREATE TABLE IF NOT EXISTS auth_method_daily` mit `date DATE NOT NULL`. |
| `src/middleware.ts` | Modify | `verifySessionDualRead(req)` statt inline-jwtVerify. Kein Counter (Edge). |
| `src/lib/api-helpers.ts` | Modify | `requireAuth` Signatur: `Promise<NextResponse \| { userId, source }>`. Counter-Bump einmal. |
| `src/lib/signups-audit.ts` | Modify | `resolveActorEmail(userId: number)` statt `(req)`. Kein Verify, kein Counter. |
| `src/app/api/auth/login/route.ts` | Modify | `setSessionCookie(res, token)` (cleart Legacy atomar). |
| `src/app/api/auth/logout/route.ts` | Modify | `clearSessionCookies(res)`. |
| `src/app/api/dashboard/account/route.ts` | Modify | GET + PUT lesen via `verifySessionDualRead(req)`, bumpen Counter. UserId direkt aus Result. |
| `src/app/api/dashboard/signups/[type]/[id]/route.ts` | Modify | `resolveActorEmail(auth.userId)` + neue requireAuth-Shape. |
| `src/app/api/dashboard/signups/bulk-delete/route.ts` | Modify | dito. |
| `src/app/api/dashboard/signups/memberships/[id]/paid/route.ts` | Modify | dito (**Codex R2 Finding #4 — dritter Call-Site**). |
| **All other `requireAuth(req)` callers** (dashboard routes) | Modify | Anpassung an neue Return-Shape via TypeScript-guided Refactor. |

### Architecture Decisions

1. **Edge-safe Leaf-Modul `auth-cookie.ts` mit interner jose-Verify + userId-Validate**:
   - Middleware läuft Edge-Runtime → kann `auth.ts` nicht importieren.
   - `auth-cookie.ts` importiert nur `jose`, `next/server`, `./jwt-algorithms`.
   - **UserId-Validation im Modul**: `payload.sub` wird regex-validiert (`/^[0-9]+$/`) vor parseInt. Kein Caller muss parseInt/NaN-Handling machen. Einzige Validate-Source of Truth.
   - Duplizierte `getJwtSecret()` mit `auth.ts` — unvermeidbar wegen Edge-Import-Constraint.

2. **JWT_ALGORITHMS als shared const** (`src/lib/jwt-algorithms.ts`):
   - Beide Module (`auth.ts`, `auth-cookie.ts`) importieren dieselbe Konstante.
   - Verhindert Algorithm-Drift bei späterem Sign/Verify-Refactor (`patterns/auth.md:71`).

3. **`setSessionCookie` mit atomar-Legacy-Clear** (Codex R2 Finding #1):
   - Alternative "Legacy-Cookie überlebt bis Expiry" abgelehnt: Cookie-Stack-State ist unklar, Counter-Metrik verschmutzt.
   - Alternative "separater `clearLegacyOnLogin()`-Call" abgelehnt: zwei Calls = potential forget.
   - Eingeflossen in API: Legacy-Clear ist Teil der Login-Semantik, nicht Boilerplate.
   - Im dev-mode (Namen identisch) wird kein zweiter Set-Call ausgelöst — verhindert dass der gerade gesetzte Cookie sofort gecleart wird.

4. **Counter-Schicht separat in `cookie-counter.ts`** (Codex R1 Finding #5):
   - Nicht in `auth-cookie.ts` (bricht Edge-Safety via pg-Import).
   - Stdout-Fallback spiegelt `auditLog`-Pattern (`src/lib/audit.ts`).

5. **`source` = `primary`/`legacy`** (nicht Cookie-Name) — entkoppelt Counter vom Migration-Target.

6. **`env` aus `SITE_URL`-Hostname** (Shared-DB-Constraint).

7. **Counter-Bump nur bei `verifySessionDualRead`-Success** — 401/invalid-sub zählen nicht.

8. **Single-Bump-Discipline** (Codex R1 Finding #2, R2 Finding #4):
   - `requireAuth` ändert Signatur zu `Promise<NextResponse | { userId, source }>`.
   - `resolveActorEmail(userId: number)` — zero req-access.
   - Alle 3 Call-Sites von `resolveActorEmail` bekommen `auth.userId` aus `requireAuth`-Return.
   - Account-Handler bleiben Inline-Verify (nicht via `requireAuth`), bumpen direkt. UserId aus Result.
   - Middleware bumpt nie (Edge).

9. **JWT_SECRET-Fail-Mode Delta (dokumentiert, nicht normalisiert)** (Codex R2 Finding #5):
   - `auth.ts::getJwtSecret()` **throws** bei missing Secret (Node-Path, 500-Response-Semantik akzeptabel).
   - `auth-cookie.ts::getJwtSecret()` **returns null** bei missing Secret (Edge-Runtime-kompatibel, 401-Response-Semantik).
   - `instrumentation.ts` **warns only** bei missing Secret (historisch, PR vor diesem Sprint). OWASP-Härtung: throw + min-length-32 check sollte folgen, aber ist **out of scope** Sprint B (separater Security-Hardening-Sprint).
   - **Vereinbarter Kontrakt für Sprint B:** alle drei Pfade stimmen darin überein, dass missing-Secret ein P0-Ops-Incident ist. Laufzeit-Verhalten ist per-Pfad passend (Throw mid-Request in Node, Null-Return in Edge, Warn-Log bei Boot). Keine Anpassung im Rahmen dieses Sprints. Als Follow-up in `memory/todo.md` vermerkt.

10. **Blast-Radius-Transparenz** (Codex R1 Finding #4):
    - `requireAuth`-Signatur-Change trifft alle Dashboard-API-Routes (~20+ Files, nicht nur 7 Cookie-Call-Sites).
    - Counter misst damit alle authentifizierten Dashboard-API-Requests.
    - Generator muss alle `requireAuth`-Konsumenten in einem Pass anpassen (Compile-Error-guided).

### Dependencies

- **DB:** Schema-Addition `auth_method_daily` (additive-only).
- **Env:** Keine neuen.
- **Shared Staging+Prod DB:** `env`-Column trennt Reporting.
- **Internal:** `src/lib/schema.ts`, `src/lib/db.ts`, `src/lib/site-url.ts`, neu `src/lib/jwt-algorithms.ts`.

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| Request ohne Cookie | `verifySessionDualRead` → `null`. Caller 401. Kein Bump. |
| Request mit valid `__Host-session` (num sub) | `{ userId, source: 'primary' }`. Counter `primary`+1. |
| Request mit valid `session` only (num sub) | Primary miss → fallback legacy → `{ userId, source: 'legacy' }`. Counter `legacy`+1. |
| Request mit beiden valid (num sub) | Primary wins. `source: 'primary'`. Counter `primary`+1. |
| **Primary invalid + Legacy valid** (Codex R1 #1) | Primary verify-fail → Fallback → `{ userId, source: 'legacy' }`. Admin bleibt eingeloggt. |
| Primary expired + Legacy valid | Same as invalid — legacy wins. |
| Primary verify OK aber `sub='abc'` (non-numeric) + Legacy valid | Primary UserId-Validate-fail → Fallback → legacy. Neu in v3. |
| Beide Cookies verify-OK aber beide `sub` non-numeric | `null`. 401. Keine Race-Condition. |
| Both invalid/expired | `null`. 401. Kein Bump. |
| Login-Success im prod | `__Host-session` set + `session` cleared (maxAge=0) atomar. Nach Reload ist nur `__Host-session` im Browser. |
| Login-Success im dev | `session` set. Kein zweiter Clear-Call (Namen identisch). |
| Re-Login eines Users mit altem Legacy-Cookie | Primary gesetzt, Legacy gecleart. Metrik zeigt `source='primary'`. |
| JWT_SECRET-Rotation zwischen Logins | Alle existing tokens werden rejected (Signatur-Mismatch) → `null` → 401 → Neu-Login setzt neuen Cookie. |
| `JWT_SECRET` env missing | `verifySessionDualRead` → `null` (fail-closed). Login-Endpoint würde via `auth.ts` throwen → 500. Akzeptiert als P0-Ops-Signal. |
| Dev-Mode (`NODE_ENV!=='production'`) | `SESSION_COOKIE_NAME='session'`. Counter bumpt `primary` auf `session`-reads. |
| Staging mit altem pre-Sprint-B-Login-Cookie | Dual-Read fängt ab → `source: 'legacy'` für `env='staging'` bis nächster Logout/Re-Login. |
| DB-Outage beim Counter-Bump | Try/catch → stdout-Fallback-Log → Auth unberührt. |
| Parallele Logins (Race) | `ON CONFLICT DO UPDATE SET count = count + 1` → atomar. |
| Signups-Bulk-Delete (requireAuth + resolveActorEmail) | `requireAuth` bumpt 1×, `resolveActorEmail` bumpt nie (kein verify mehr). Counter korrekt. |
| Revert Sprint B nach Deploy | User mit `__Host-session` verlieren Session. 1-Admin → einmal re-login. |

## Risks

- **Rollback-Asymmetrie:** Revert → `__Host-session`-User logged out. Single-Admin mitigated.
- **Big-Bang-Refactor `requireAuth`-Signatur:** ~20+ Routes in einem Commit. TypeScript fängt Miss. Kein Gradual-Migration.
- **Staging-Noise im Counter:** `env`-Column + Default-Filter `env='prod'`. <20 Events/Tag erwartet.
- **Legacy-Cookie-Zombie:** Browser mit 24h-Token. Nach ~25h clearing erwartet. `patterns/auth.md:107-108` remember_me-Leak-Pattern monitoring.
- **Edge-Safe-Regression:** Future-PR importiert `pg` in `auth-cookie.ts`. Mitigation: Unit-Test File-Grep.
- **Forgotten Call-Site:** Neue Route mit direktem `req.cookies.get("session")`. Mitigation: Grep-Contract.
- **DB-Fallback-Log-Flood:** Bei anhaltender DB-Outage flutet stdout. Akzeptiert — DB-Outage ist P0, Log-Flood ist Symptom.
- **Counter-Drift bei Signatur-Refactor-Miss:** TypeScript bricht Build → kein silent-Drift.
- **JWT_SECRET-Fail-Mode-Delta:** Dokumentiert, aber nicht normalisiert (out of scope). Risk accepted für Sprint B.

## Verification Strategy

### Pre-Merge (lokal + Staging)
1. `pnpm build` grün.
2. `pnpm test` grün.
3. `pnpm audit --prod` → 0 HIGH/CRITICAL.
4. Grep-Check: `rg "cookies\.(get|set)\([\"']session[\"']" src/` → nur `auth-cookie.ts` + Test.
5. Edge-Bundle-Check via `pnpm build`.
6. Staging-Push → logs clean → `/api/health/` → 200.
7. Staging-Login → DevTools → Cookie-Name = `__Host-session` (Secure, HttpOnly, SameSite=Strict, Path=/, kein Domain). `session`-Cookie **nicht mehr vorhanden** (durch `setSessionCookie`-Legacy-Clear gecleart).
8. SSH → `psql -c "SELECT date, source, env, count FROM auth_method_daily WHERE env='staging' ORDER BY date DESC LIMIT 5"` → Row `source='primary'` für heute.
9. **Primary-invalid-Test:** DevTools Cookie-Value von `__Host-session` um 1 Zeichen modifizieren → Request → weiterhin authentifiziert (Legacy-Fallback)? Eigentlich nein, weil `setSessionCookie` den Legacy gecleart hat. Fix für diesen Test: Test VOR Re-Login durchführen wenn Legacy-Cookie noch existiert, oder manuell Legacy-Cookie injecten über DevTools, danach Primary korrumpieren. → Im Browser: Cookie-Editor öffnen, `session=<valid-old-token>` manuell setzen + Primary korrumpieren → Request → Success mit `source='legacy'` in DB.

### Post-Merge auf Prod
1. CI `gh run watch` grün.
2. `curl -sI https://alit.hihuydo.com/api/health/` → 200.
3. Prod-Login → DevTools → `__Host-session` gesetzt, `session` weg.
4. `ssh hd-server 'docker compose logs --tail=50 alit-web'` — keine `cookie_bump_fallback`-Events.
5. SSH → `psql -c "SELECT date, source, env, count FROM auth_method_daily WHERE env='prod' AND date = current_date"` → `primary>=1, legacy=0or1`.
6. 7-Tage-Observation via Flip-Kriterium-Query. Wenn sauber → Sprint C.

### Shared-DB-Constraint
- Additive-only DDL → keine Backup-Pflicht.

---

## Codex-Findings → Eingearbeitet (v3)

**Runde 1 (7/7 addressed in v2, 5 FIXED + 2 PARTIAL → in v3 finalized):**
- ✅ **R1#1 [Contract/Security]** Dual-Read → Dual-Verify: `verifySessionDualRead` mit Primary-verify-first + Legacy-fallback-verify (FIXED v2).
- ✅ **R1#2 [Correctness]** Single-Bump: `resolveActorEmail(userId)` Signatur, 3 Call-Sites explizit gelistet (FIXED v3).
- ✅ **R1#3 [Correctness]** `date DATE NOT NULL` (FIXED v2).
- ✅ **R1#4 [Architecture]** Blast-Radius-Paragraph (FIXED v2).
- ✅ **R1#5 [Architecture]** Stdout-Fallback im bumpCookieSource (FIXED v2).
- ✅ **R1#6 [Contract]** Flip-Kriterium SQL-bare mit korrektem 7-Tage-Fenster `date >= current_date - 6 AND date <= current_date` (FIXED v3).
- ✅ **R1#7 [Nice-to-have]** Admin-Endpoint raus (FIXED v2).

**Runde 2 (5 new findings, alle addressed in v3):**
- ✅ **R2#1 [Contract]** Legacy-Cookie-Clear-on-Login: `setSessionCookie` cleart Legacy atomar wenn Namen unterschiedlich (prod-only).
- ✅ **R2#2 [Correctness]** `sub → userId` Validation hart in `verifySessionDualRead` zentral (regex `/^[0-9]+$/` + parseInt). Zero Caller-Konversion.
- ✅ **R2#3 [Correctness]** Flip-Query präzise: `date >= current_date - 6 AND date <= current_date` = 7 Kalendertage inkl. heute.
- ✅ **R2#4 [Architecture]** Dritte `resolveActorEmail`-Call-Site (`memberships/[id]/paid/route.ts`) explizit in File-Tabelle + Task-Plan.
- ✅ **R2#5 [Security]** JWT_SECRET-Fail-Mode-Delta dokumentiert in Architecture Decision #9 + als Follow-up in `memory/todo.md` vermerkt (not-Sprint-B-Scope).
