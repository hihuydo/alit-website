# Spec: T0-Auth-Hardening Sprint B — Cookie-Migration
<!-- Created: 2026-04-17 -->
<!-- Author: Planner (Claude) -->
<!-- Status: Draft v1 — awaiting user approval before post-commit Sonnet-Evaluator -->

## Summary
Migration des Session-Cookies von `session` → `__Host-session` in Produktion (und Staging). Dual-Read-Phase (30 Tage) gegen Rollback-Asymmetrie, DB-basierter Observability-Counter (`auth_method_daily`) mit Admin-Read-Endpoint, explizites Flip-Kriterium. Dual-Read-Removal + Cleanup des Legacy-Namens ist explizit **Sprint C**, nicht dieser Sprint — Sprint B liefert nur die Dual-Phase + Observability-Infrastruktur.

## Context

**Warum `__Host-session`:** Das `__Host-`-Prefix ist ein hard-coded Browser-Constraint (RFC 6265bis): Cookie muss `Secure=true`, `Path=/`, **kein** `Domain`-Attribut haben. Damit ist das Cookie strukturell an den exakten Origin gebunden — kein Subdomain-Overwrite, kein HTTP-Downgrade. Aktueller `session`-Cookie hat zwar `secure: NODE_ENV==='production'` + `path: '/'`, aber ein fehlerhafter `Domain`-Eintrag oder HTTP-Fallback wäre silent-akzeptiert. `__Host-` macht die Invariante explizit und browser-enforced.

**Scope-Split-Grund (aus Sprint A Spec-Review):** Sprint A war server-side DB-state (bcrypt/rehash). Sprint B ist aktiver Client-state — wenn wir revertieren müssen, verlieren User die sich während Sprint B eingeloggt haben ihre Session. Rollback-Asymmetrie + Single-Admin-Scope machen das akzeptabel, aber NICHT bundled mit Sprint A deploybar (Incident-Blast-Radius).

**Codebase-Shape (relevant für Sprint B):**
- 7 Call-Sites mit hardcoded `"session"`:
  - `src/middleware.ts:24` — read (Edge-Runtime)
  - `src/lib/api-helpers.ts:6` — read (`requireAuth`)
  - `src/lib/signups-audit.ts:18` — read (`resolveActorEmail`)
  - `src/app/api/auth/login/route.ts:58` — write
  - `src/app/api/auth/logout/route.ts:10` — clear
  - `src/app/api/dashboard/account/route.ts:11` — read (GET)
  - `src/app/api/dashboard/account/route.ts:33` — read (PUT)
- `middleware.ts` läuft in Edge-Runtime → kein `pg`/`bcryptjs`-Import erlaubt. Deshalb muss `auth-cookie.ts` ein **Leaf-Modul** sein (nur `NextRequest`/`NextResponse`, keine DB-Side-Effects).
- Observability-Counter (Node-Runtime) ist **separater Helper** der nicht ins middleware-Bundle leakt.
- `NODE_ENV==='production'` ist bei beiden (Prod + Staging) `true` — Staging nutzt denselben `__Host-session`-Namen. Das ist erwünscht (Staging testet den Prefix-Pfad), aber muss in Tests + Dev-Mode-Setup explizit sein.

**Stack-Constraint (Shared Staging+Prod DB):** Das neue `auth_method_daily`-Table wird auf Staging-Push angelegt (via `ensureSchema()` at-boot). Staging-Counter-Rows werden auf dieselbe DB geschrieben wie Prod. Lösung: `source TEXT` Column (`prod`/`staging`) aus `SITE_URL`-Hostname abgeleitet. Admin-Read-Endpoint filtert standardmäßig `source='prod'`. Staging-Noise wird akzeptiert (nur Huy testet, single-digit counts/day).

**Codex-Spec-Review aus Sprint-A-Runde (relevant für Sprint B):**
- [Architecture] `src/lib/auth-cookie.ts` als Edge-safe Leaf-Modul. ✅ Berücksichtigt (File-Contract + Edge-Safe-Test).
- [Security] `sameSite: "strict"` bleibt unverändert — aktueller Code ist sicher, kein Produktzwang für `"lax"`. ✅
- Rollback-Asymmetrie: dokumentiert im Risks-Block + akzeptiert bei 1-Admin-Scope.

## Requirements

### Must Have (Sprint Contract)

1. **`src/lib/auth-cookie.ts` existiert** als Edge-safe Leaf-Modul mit:
   - `const SESSION_COOKIE_NAME: string` — `__Host-session` wenn `NODE_ENV==='production'`, sonst `session`.
   - `const LEGACY_COOKIE_NAME: string` — immer `session`.
   - `getSessionCookie(req: NextRequest): string | undefined` — liest primär `SESSION_COOKIE_NAME`, fallback `LEGACY_COOKIE_NAME`. Gibt erstes Match zurück.
   - `getSessionCookieSource(req: NextRequest): "primary" | "legacy" | null` — zeigt welcher Name gematched hat (für Observability-Counter).
   - `setSessionCookie(res: NextResponse, token: string): void` — schreibt IMMER nur `SESSION_COOKIE_NAME` mit `httpOnly=true`, `secure=NODE_ENV==='production'`, `sameSite='strict'`, `path='/'`, `maxAge=86400`.
   - `clearSessionCookies(res: NextResponse): void` — clear auf BEIDE Namen (für Dual-Phase Logout).
   - **Edge-Safe-Test:** `grep -E "from ['\"](pg\|bcryptjs\|\\./db\|\\./audit\|\\./auth)" src/lib/auth-cookie.ts` liefert 0 Matches. Per Unit-Test automatisiert (liest File-Inhalt + regex).

2. **Alle 7 Call-Sites** konsumieren `auth-cookie.ts`:
   - `src/middleware.ts` — `getSessionCookie(req)` statt `req.cookies.get("session")`.
   - `src/lib/api-helpers.ts::requireAuth` — same.
   - `src/lib/signups-audit.ts::resolveActorEmail` — same.
   - `src/app/api/auth/login/route.ts` — `setSessionCookie(res, token)` statt `res.cookies.set("session", ...)`.
   - `src/app/api/auth/logout/route.ts` — `clearSessionCookies(res)` statt `res.cookies.set("session", ...)`.
   - `src/app/api/dashboard/account/route.ts` — `getSessionCookie(req)` in GET + PUT.
   - Grep `cookies\.(get\|set)\(['"]session['"]` gibt 0 Matches außerhalb von `auth-cookie.ts` und dessen Tests.

3. **Observability-Counter live:**
   - Neue Tabelle `auth_method_daily (date TEXT NOT NULL, source TEXT NOT NULL, env TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(date, source, env))` in `src/lib/schema.ts::ensureSchema()`.
   - `source` ∈ {`primary`, `legacy`} (nicht `__Host-session`/`session` — entkoppelt von Cookie-Namen).
   - `env` ∈ {`prod`, `staging`} (aus `SITE_URL`-Hostname: `staging.` prefix → `staging`, sonst `prod`).
   - Neuer Helper `src/lib/cookie-counter.ts::bumpCookieSource(source: "primary" | "legacy")`:
     - Fire-and-forget `INSERT ... ON CONFLICT DO UPDATE SET count = count + 1`.
     - Try/catch intern — DB-Outage darf auth nie blocken.
     - Wird in `requireAuth` + `resolveActorEmail` + Account GET+PUT aufgerufen (NICHT in middleware — Edge-Runtime).
     - **Counter bumpt nur bei validen Sessions** (erfolgreiche `verifySession`), nicht bei 401 — sonst zählt Noise (z.B. abgelaufene Cookies mit legacy-Name).
   - Admin-Endpoint `GET /api/dashboard/audit/cookie-usage?days=30&env=prod` mit `requireAuth`:
     - Returned JSON `{ rows: Array<{ date, source, env, count }> }`, sortiert nach `date DESC, source ASC`.
     - Default `days=30`, max 90.
     - Default `env=prod`.

4. **Tests:**
   - `src/lib/auth-cookie.test.ts` — Unit-Tests für Name-Resolution (dev vs prod), Dual-Read-Precedence (primary before legacy), Write-Exclusive (nie `session` schreiben in prod), Logout-Clear-Both.
   - `src/lib/auth-cookie.test.ts` enthält den Edge-Safe-Grep-Test (liest eigenen File-Inhalt, asserted 0 matches auf `pg`/`bcryptjs`/`./db`/`./audit`/`./auth` imports).
   - `src/lib/cookie-counter.test.ts` — bumpCookieSource swallowed DB-Errors, berechnet env korrekt aus `SITE_URL`.
   - Alle Tests grün, `pnpm build` grün, `pnpm audit --prod` → 0 HIGH/CRITICAL.

5. **Docker + Staging-Deploy:**
   - `docker-compose.yml` + `docker-compose.staging.yml` brauchen KEINE neuen Env-Vars (kein Secret, kein Salt — Cookie-Name ist Code-Konstante abgeleitet aus existierenden Envs).
   - Staging-Push → DB bekommt `auth_method_daily`-Table via `ensureSchema()`.
   - Staging-Browser-Check: DevTools zeigt `__Host-session`-Cookie, kein `session`-Cookie (außer für pre-Deploy-Sessions die noch als Legacy-Cookie lesbar sind).

6. **Prod-Flip-Kriterium dokumentiert + operationalisiert:**
   - Spec enthält harten Flip-Gate: `SELECT source, SUM(count) FROM auth_method_daily WHERE env='prod' AND date >= current_date - 7 GROUP BY source` → `legacy=0 UND primary>0` über 7 konsekutive Tage UND `primary_count_7d >= baseline_primary_daily_avg`.
   - Baseline-Kommentar im SQL-Dashboard-Helper: erwartet ~5–20 primary-Auth-Events/Tag (Huy-Login-Frequenz).
   - Flip-Sprint C (separater PR): Dual-Read entfernen, Legacy-Clear in Logout entfernen, Observability-Counter optional behalten oder droppen.

### Nice to Have (explicit follow-up, NOT this sprint)

1. **Sprint C: Dual-Read-Removal** — nach 30d Observability-Phase + Flip-Kriterium erfüllt. Eigener PR, eigene Spec.
2. **Admin-UI-Widget für Cookie-Usage** — aktuell nur JSON-Endpoint. UI im Dashboard-Audit-Tab wäre hübsch, aber Flip-Decision ist ein 1-time Event für Huy → `curl | jq` reicht.
3. **Automatischer Flip-Alarm** — z.B. Cron das Endpoint pingt und bei `legacy=0 über 7d` Slack/Email schickt. Nicht nötig bei 1-Admin.
4. **Retention-Sweep** für `auth_method_daily` — Tabelle wächst ~2 rows/day × 4 env/source-combos = 8 rows/day = 3000/year. Kein Sweep nötig.
5. **Observability-Counter für middleware-Edge-Requests** — via fetch-side-call zu Node-Endpoint. Unnötig bei small-admin-Scope.

### Out of Scope

- **Removal des Legacy-Cookies aus DB/Code** (Sprint C).
- **`sameSite` Änderung** (bleibt `strict`).
- **CSRF-Token-Einführung** (separate Initiative, nicht Teil der Cookie-Migration).
- **Rotation / Session-Revocation-Table** (eigener Sprint, siehe `patterns/auth.md`).
- **Email-basiertes Password-Reset** (nicht Teil von Auth-Hardening T0).
- **Middleware-Counter-Bump** (bewusst weg — Edge-Runtime-Kosten).

## Technical Approach

### Files to Change

| File | Change Type | Description |
|------|-------------|-------------|
| `src/lib/auth-cookie.ts` | **Create** | Edge-safe Leaf: `SESSION_COOKIE_NAME`, `LEGACY_COOKIE_NAME`, `getSessionCookie`, `getSessionCookieSource`, `setSessionCookie`, `clearSessionCookies`. Zero DB-imports. |
| `src/lib/cookie-counter.ts` | **Create** | Node-only: `bumpCookieSource(source)` mit fire-and-forget INSERT + try/catch. `deriveEnv()` aus `SITE_URL`. |
| `src/lib/auth-cookie.test.ts` | **Create** | Unit-Tests inkl. Edge-Safe-Grep-Test gegen File-Content. |
| `src/lib/cookie-counter.test.ts` | **Create** | Env-Derivation, DB-Error-Swallowing. |
| `src/lib/schema.ts` | Modify | `CREATE TABLE IF NOT EXISTS auth_method_daily (...)` in `ensureSchema()`. |
| `src/middleware.ts` | Modify | Import `getSessionCookie` aus `auth-cookie.ts`. **Kein Counter-Bump** (Edge-Runtime). |
| `src/lib/api-helpers.ts` | Modify | `requireAuth` liest via `getSessionCookie(req)`. Bumpt Counter via `bumpCookieSource(source)` **nur bei valider Session**. |
| `src/lib/signups-audit.ts` | Modify | `resolveActorEmail` liest via `getSessionCookie(req)`. Bumpt Counter nur bei valider Session. |
| `src/app/api/auth/login/route.ts` | Modify | `setSessionCookie(res, token)` statt `res.cookies.set("session", ...)`. |
| `src/app/api/auth/logout/route.ts` | Modify | `clearSessionCookies(res)` statt `res.cookies.set("session", ...)`. |
| `src/app/api/dashboard/account/route.ts` | Modify | GET + PUT lesen via `getSessionCookie(req)`. Counter nur bei valider Session. |
| `src/app/api/dashboard/audit/cookie-usage/route.ts` | **Create** | `GET` mit `requireAuth`, query params `days` (default 30, max 90), `env` (default prod). |

### Architecture Decisions

1. **Edge-safe Leaf-Modul `auth-cookie.ts`** (Codex-flagged in Sprint A Review):
   - Middleware läuft in Edge-Runtime → `pg`/`bcryptjs`/`./db`/`./audit`/`./auth` dürfen nicht hineinimportiert werden.
   - Leaf-Modul enthält NUR: Cookie-Name-Resolution, `NextRequest`/`NextResponse`-Cookie-API.
   - Alternative abgelehnt: Name-Konstante direkt im middleware.ts duplizieren — führt zu drift bei Dual-Phase-Refactor.
   - **Guard-Test:** eigener Unit-Test liest File-Content + regex gegen verbotene Imports. Regression-proof.

2. **Counter-Schicht ist separates Modul** (`cookie-counter.ts`):
   - Gehört NICHT in `auth-cookie.ts` — das würde Edge-Safety brechen (DB-Import).
   - Aufruf geschieht an den Node-Runtime-Call-Sites (requireAuth, resolveActorEmail, account GET+PUT).
   - Middleware bumpt nicht — Edge-Runtime-Constraint. Dokumentiert als akzeptable Messbias (API-Calls korrelieren stark mit Page-Views).

3. **`source` = `primary`/`legacy`** (nicht Cookie-Name):
   - Entkoppelt die Observability-Column vom konkreten Cookie-Namen — wenn später Sprint C kommt und `__Host-session` → `__Secure-session` migriert (hypothetisch), bleibt der Counter-Code unverändert.
   - `primary` = aktueller `SESSION_COOKIE_NAME`, `legacy` = `LEGACY_COOKIE_NAME`.

4. **`env` aus `SITE_URL`-Hostname**:
   - `SITE_URL` ist bereits pro Container hart gesetzt (siehe `memory/project.md`).
   - Hostname-Prefix-Check: `new URL(process.env.SITE_URL).hostname.startsWith('staging.')` → `staging`, sonst `prod`.
   - Modul-Level Konstante (ein-mal bei Modul-Load evaluiert), kein Runtime-Overhead.

5. **Counter-Bump nur bei valider Session**:
   - Alternative abgelehnt: bump bei jedem Cookie-Read (auch 401). Führt zu Noise wenn ein alter Legacy-Tab expiry erreicht und 401 bekommt — würde für 30 Tage den `legacy`-Counter leben halten obwohl kein aktiver Login mehr.
   - Aktuelle Regel: `verifySession(token) !== null` → bump. Messbar: "wie viele authenticated requests nutzen welchen Cookie-Namen".

6. **Kein Counter in middleware**:
   - Edge-Runtime-Kosten (fetch-Round-Trip zu Node-Endpoint) > Wert.
   - API-Calls decken >99% der Dashboard-Aktivität ab (jede Mount-Fetch, jede Save, jede Medien-Operation). Page-Load-only-Events ohne API-Call sind vernachlässigbar.

7. **Dual-Read-Removal in Sprint C**:
   - Sprint B stoppt bei "Observability-Phase aktiv". Flip-Decision + Dual-Read-Entfernung = eigener PR mit eigenem Spec-Review-Gate.

### Dependencies

- **DB:** Schema-Addition `auth_method_daily`. Keine Migration-Data, idempotent via `CREATE TABLE IF NOT EXISTS`.
- **Env:** Keine neuen Env-Vars.
- **Shared Staging+Prod DB:** Staging-Push erzeugt Tabelle auf shared DB → Prod übernimmt ab ersten API-Call. `env`-Column trennt Reporting.
- **Internal:** `src/lib/schema.ts`, `src/lib/db.ts`, `src/lib/site-url.ts` (bestehend, für env-Ableitung).

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| Request ohne Cookie | `getSessionCookie` → `undefined`. Caller returned 401 (bestehende Logik). Kein Counter-Bump. |
| Request mit nur `__Host-session` | `getSessionCookie` → Token. Source=`primary`. Counter+1 bei valider Session. |
| Request mit nur `session` (Legacy) | `getSessionCookie` → Token (fallback). Source=`legacy`. Counter+1 bei valider Session. |
| Request mit BEIDEN Cookies | `getSessionCookie` → `__Host-session`-Wert (primary wins). Source=`primary`. Counter+1. Legacy-Cookie bleibt untouched bis nächster Logout. |
| Request mit ungültigem Token in `__Host-session` | `verifySession` → null. Kein Counter-Bump. 401. |
| Request mit expired Token | Same as invalid — kein Counter-Bump (sonst ewiger Legacy-Noise). |
| Dev-Mode (`NODE_ENV!=='production'`) | `SESSION_COOKIE_NAME='session'`, `secure=false`. Counter bumpt `primary` auf `session`-Reads. Unit-Test coverage. |
| Staging-Browser hat alte `session`-Cookie | `getSessionCookie` liest legacy → Session bleibt valid → Counter bumpt `legacy`+1 für `env=staging`. |
| DB-Outage beim Counter-Bump | `bumpCookieSource` try/catch → stdout-error → Auth läuft normal weiter. |
| `auth_method_daily`-INSERT-Race | `ON CONFLICT DO UPDATE SET count = count + 1` → atomar. Kein Verlust bei Parallel-Logins. |
| Admin-Endpoint ohne valid auth | `requireAuth` → 401. Standard-Pfad. |
| `?days=9999` (out of range) | Clamp auf max 90. |
| `?env=hackerland` | Validierung auf {prod, staging, all}, sonst 400. |
| SITE_URL fehlt | Fallback `env='prod'` (production-safe default). Dokumentiert im Helper. |
| Logout während Dual-Phase | `clearSessionCookies` setzt BEIDE Cookies auf `maxAge=0` — verhindert Legacy-Cookie-Resurrection. |
| Revert Sprint B nach Deploy | User mit `__Host-session`-Cookie verlieren Session (Revert-Code liest nur `session`). Akzeptiert: 1-Admin-Scope, einmal re-login. |

## Risks

- **Rollback-Asymmetrie:** Wenn Sprint B nach Prod-Deploy revertiert werden muss, verlieren alle User die sich nach Deploy eingeloggt haben ihre Session. Mitigation: Single-Admin-Scope (Huy) → worst case einmal neu einloggen. Dokumentiert in `memory/lessons.md`.
- **Staging-Noise im Counter:** Staging schreibt auf shared DB. Mitigation: `env`-Column + Default-Filter `env='prod'` im Admin-Endpoint. Expected-Staging-Volume: <20 Events/Tag bei nur-Huy-Testing.
- **Legacy-Cookie-Zombie:** Browser mit 24h-Token von vor-Deploy bleibt 24h im Counter als `legacy`. Nach ~25h Clearing erwartet. Wenn nach 7d noch `legacy>0` → vermutlich ein Long-Session-Remnant oder manueller Cookie-Edit — Grund muss identifiziert werden (vgl. `patterns/auth.md:107-108` „remember_me-Leak").
- **Edge-Safe-Regression:** Zukünftiger Commit könnte `bcryptjs` oder `pg` in `auth-cookie.ts` importieren und middleware.ts bricht im Build. Mitigation: Unit-Test mit File-Content-Grep. CI-blocking wenn Regression.
- **Forgotten Call-Site:** Wenn ein Zukunfts-PR einen neuen Cookie-Read direkt via `req.cookies.get("session")` hinzufügt statt `getSessionCookie`, läuft das außerhalb der Dual-Read-Logik → bricht für `__Host-session`-User. Mitigation: Grep-Check in Tests (`grep cookies\.(get\|set)\(['"]session['"]` außerhalb auth-cookie.ts = 0). Kein ESLint-Rule, manueller Scan bei jedem Auth-relevanten PR-Review.
- **DB-Table bleibt nach Sprint C:** Wenn Sprint C die Observability droppt, Migration-Drop-Step nötig. Nicht Sprint-B-Risk.

## Verification Strategy

### Pre-Merge (lokal + Staging)
1. `pnpm build` ✅
2. `pnpm test` — alle neuen Tests grün (Edge-Safe-Grep, Name-Resolution, Dual-Read, Counter-Swallow, Env-Derivation)
3. `pnpm audit --prod` → 0 HIGH/CRITICAL
4. Grep-Check manuell: `rg "cookies\.(get\|set)\(['\"]session['\"]" src/` → nur Hits in `auth-cookie.ts` + Tests
5. Edge-Bundle-Check: `pnpm build` Success = middleware-Bundle enthält nur Edge-safe Deps
6. Staging-Push → `docker compose logs` clean → curl `https://staging.alit.hihuydo.com/api/health/` → 200
7. Staging-Login im Browser → DevTools → Cookie-Name = `__Host-session` (Secure ✓, HttpOnly ✓, SameSite=Strict, Path=/, kein Domain)
8. SSH → `psql -c "SELECT * FROM auth_method_daily WHERE env='staging' ORDER BY date DESC LIMIT 5"` → Row mit `source='primary'` für heute

### Post-Merge auf Prod
1. CI `gh run watch` grün
2. `curl -sI https://alit.hihuydo.com/api/health/` → 200
3. Prod-Login im Browser → DevTools → Cookie-Name = `__Host-session`
4. Prod-Admin-Endpoint: `curl -s -b "__Host-session=<token>" "https://alit.hihuydo.com/api/dashboard/audit/cookie-usage?days=1&env=prod" | jq` → `primary>=1, legacy=0or1` (falls anderer Tab noch alt)
5. SSH → `docker compose logs --tail=50 alit-web` clean (keine `[auth-cookie]`/`[cookie-counter]`-Errors)
6. 48h-Observation: Admin-Endpoint täglich → Trend von `legacy` → 0 dokumentieren

### Flip-Gate (Sprint C Start-Bedingung)
```sql
-- Flip-Kriterium: 7 konsekutive Tage mit legacy=0 AND primary>0 auf prod
SELECT date, source, count
  FROM auth_method_daily
 WHERE env = 'prod'
   AND date >= current_date - 7
 ORDER BY date DESC, source ASC;
```
Flip erlaubt wenn:
- `legacy`-Count für jeden der letzten 7 Tage = 0 (oder keine Zeile mit source=legacy).
- `primary`-Count Summe der letzten 7 Tage >= erwarteter Baseline (Huy-Login-Rate: ~5–20/Tag).

### Shared-DB-Constraint (aus `memory/lessons.md`)
- **Keine destruktive DDL** in diesem Sprint — nur `CREATE TABLE IF NOT EXISTS`. Kein DROP, kein ALTER der bestehenden Tabellen.
- **Staging-Push = DDL-Deploy auf Shared DB** → kein Problem hier weil additive-only.
- **Optional:** `pg_dump` vor Staging-Push als pre-Sprint-Snapshot (nicht strict required bei additive-only DDL).

## Open Questions (muss vor Generator-Start geklärt sein)

1. **Counter-Bump-Scope:** Ist es OK, dass nur API-Calls (nicht Page-Loads) gezählt werden? Alternative wäre ein dediziertes `/api/audit/heartbeat` Endpoint das die Client-App bei Dashboard-Mount ruft. → **Empfehlung: nein**, zu viel Overhead für minimalen Informationsgewinn.

2. **`middleware.ts`-Update:** Middleware nutzt `getSessionCookie` — das ist ein Re-Export aus einem File das als Edge-safe markiert ist. **Aber** middleware ruft aktuell direkt `req.cookies.get("session")` → mit Dual-Read würde auch `session`-Legacy-Cookies durchgelassen. Das ist erwünscht (Migration-Bridge). OK so?

3. **Sprint-A-Admin (info@alit.ch) hat aktuell einen `session`-Cookie im Browser** (pre-Sprint-B-Login). Nach Staging-Deploy: Huy muss sich einmal neu einloggen damit `__Host-session` gesetzt wird. Das ist OK? Alternative: keine Aktion — der nächste Login setzt sowieso auto das neue Cookie, und Legacy-Cookie wird beim nächsten Logout gecleart.

---

**Ende Spec v1.** Awaiting approval → Commit → post-commit Sonnet-Evaluator → ggf. Fix-Loop → Generator startet.
