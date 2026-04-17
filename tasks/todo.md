# Sprint: T0-Auth-Hardening Sprint B — Cookie-Migration
<!-- Spec: tasks/spec.md -->
<!-- Started: 2026-04-17 -->
<!-- Status: Draft — awaiting user approval + post-commit Sonnet-Evaluator -->

## Done-Kriterien
> Alle müssen PASS sein bevor der Sprint als fertig gilt.

- [ ] `src/lib/auth-cookie.ts` existiert als Edge-safe Leaf-Modul; `grep -E "from ['\"](pg\|bcryptjs\|\\./db\|\\./audit\|\\./auth)" src/lib/auth-cookie.ts` liefert 0 Matches (unit-test asserted).
- [ ] Grep `cookies\.(get\|set)\(['\"]session['\"]` in `src/` gibt 0 Matches außerhalb `auth-cookie.ts` + dessen Tests.
- [ ] In Prod (NODE_ENV=production): Login setzt `__Host-session` mit Secure=true, HttpOnly=true, SameSite=Strict, Path=/, kein Domain-Attribut.
- [ ] Dual-Read: Request mit nur `session`-Cookie (Legacy) wird valide authenticated; Request mit `__Host-session` wird valide authenticated; beide vorhanden → `__Host-session` wird bevorzugt.
- [ ] Logout cleart BEIDE Cookies (`session` + `__Host-session`) mit `maxAge=0`.
- [ ] `auth_method_daily`-Tabelle existiert nach `ensureSchema()`; `bumpCookieSource` schreibt `ON CONFLICT DO UPDATE` idempotent.
- [ ] `GET /api/dashboard/audit/cookie-usage?days=30&env=prod` returnt JSON mit sortierten rows; 401 ohne auth; 400 bei invalid env.
- [ ] Counter bumpt nur bei `verifySession(token) !== null`, nicht bei 401.
- [ ] `pnpm build` passes, `pnpm test` passes (alle vorhandenen + neuen Tests), `pnpm audit --prod` → 0 HIGH/CRITICAL.
- [ ] Staging-Deploy: DevTools zeigt `__Host-session` im Browser; SSH-psql zeigt Row mit `env='staging', source='primary'`.
- [ ] Docker: Keine neuen Env-Vars nötig (kein `.env`-Update erforderlich).

## Tasks

### Phase 1 — Edge-safe Leaf + Counter-Helper + Tests
- [ ] Create `src/lib/auth-cookie.ts` mit `SESSION_COOKIE_NAME`, `LEGACY_COOKIE_NAME`, `getSessionCookie`, `getSessionCookieSource`, `setSessionCookie`, `clearSessionCookies`. Zero imports von `pg`/`bcryptjs`/`./db`/`./audit`/`./auth`.
- [ ] Create `src/lib/auth-cookie.test.ts` — Test-Fälle:
  - Name-Resolution: `NODE_ENV='production'` → `__Host-session`; `'development'` → `session`; `'test'` → `session`.
  - Dual-Read-Precedence: beide Cookies set → primary wins; nur legacy → legacy returned mit source=`legacy`.
  - Write-Exclusive: `setSessionCookie` in prod schreibt nur `__Host-session`, nicht `session`.
  - Logout-Clear-Both: `clearSessionCookies` setzt Max-Age=0 auf beiden Namen.
  - **Edge-Safe-Grep**: lies `readFileSync('src/lib/auth-cookie.ts')` + assert zero matches gegen regex `/from ['"](pg|bcryptjs|\.\/db|\.\/audit|\.\/auth)/`.
- [ ] Create `src/lib/cookie-counter.ts` mit `bumpCookieSource(source)` + `deriveEnv()`. Fire-and-forget INSERT mit try/catch (console.error on failure, kein re-throw).
- [ ] Create `src/lib/cookie-counter.test.ts`:
  - `deriveEnv`: `SITE_URL=https://staging.alit.hihuydo.com` → `'staging'`; `https://alit.hihuydo.com` → `'prod'`; leer → `'prod'` (default).
  - `bumpCookieSource` swallowed DB-Errors (mock pool.query throws → keine Promise-Rejection entkommt).

### Phase 2 — Schema-Addition + Admin-Endpoint
- [ ] Modify `src/lib/schema.ts::ensureSchema()` — `CREATE TABLE IF NOT EXISTS auth_method_daily (date TEXT NOT NULL, source TEXT NOT NULL, env TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(date, source, env))`.
- [ ] Create `src/app/api/dashboard/audit/cookie-usage/route.ts`:
  - `GET` mit `requireAuth`.
  - Query params: `days` (int 1..90, default 30), `env` (enum `prod`/`staging`/`all`, default `prod`).
  - SQL: `SELECT date, source, env, count FROM auth_method_daily WHERE ($env='all' OR env=$env) AND date >= current_date - $days ORDER BY date DESC, source ASC`.
  - Response: `{ rows: [...] }` oder 400 bei invalid params.

### Phase 3 — Wiring aller 7 Call-Sites
- [ ] Modify `src/middleware.ts` — ersetze `req.cookies.get("session")?.value` durch `getSessionCookie(req)`. **Kein** Counter-Bump (Edge).
- [ ] Modify `src/lib/api-helpers.ts::requireAuth` — ersetze Direct-Cookie-Read. Nach `verifySession(token) !== null` aber VOR `return null`: `bumpCookieSource(getSessionCookieSource(req))`.
- [ ] Modify `src/lib/signups-audit.ts::resolveActorEmail` — same. Counter-Bump nach `verifySession`-Success.
- [ ] Modify `src/app/api/auth/login/route.ts` — ersetze `res.cookies.set("session", ...)` durch `setSessionCookie(res, token)`.
- [ ] Modify `src/app/api/auth/logout/route.ts` — ersetze `res.cookies.set("session", "", ...)` durch `clearSessionCookies(res)`.
- [ ] Modify `src/app/api/dashboard/account/route.ts` — beide Methoden (GET + PUT): `getSessionCookie(req)` + nach `verifySession`-Success: `bumpCookieSource(source)`.

### Phase 4 — Verifikation + Deploy
- [ ] `pnpm build` grün, `pnpm test` grün (existing 185 + neue Tests), `pnpm audit --prod` clean.
- [ ] Grep-Audit: `rg "cookies\\.(get|set)\\([\"']session[\"']" src/` → nur `src/lib/auth-cookie.ts` + Tests hits.
- [ ] Lokaler Dev-Test: `pnpm dev` → Login → DevTools zeigt `session` (dev mode). Prod-Cookie-Name `__Host-session` über Staging verifiziert.
- [ ] Spec-Commit auf Feature-Branch `auth-sprint-b-cookie-migration` → post-commit Sonnet-Evaluator → qa-report.md.
- [ ] Ggf. Spec-Fixes bis qa-report.md clean.
- [ ] Implementation commits auf demselben Branch.
- [ ] Push → pre-push Sonnet-Gate (Combined Diff).
- [ ] PR öffnen → Codex-Review → Fix-Loop (max 2 Runden im Scope).
- [ ] Staging-Deploy auto auf Feature-Branch-Push → DevTools-Check + psql-Counter-Check.
- [ ] Merge auf main → Prod-Deploy → Huy-Login im Prod-Browser → DevTools `__Host-session` + 1h später Counter-Check.
- [ ] `memory/project.md` + `memory/lessons.md` + `memory/todo.md` aktualisieren (wrap-up skill am Session-Ende).

## Notes

- **Scope-Discipline**: Dual-Read-Removal ist **Sprint C**, nicht Sprint B. Code-Kommentare in `auth-cookie.ts` markieren Legacy-Read als „remove in Sprint C after flip-criterion met".
- **Patterns-Referenz:** `patterns/auth.md:93-110` (Auth-Migration mit Fallback-Removal + Observability-Gate).
- **Patterns-Referenz:** `patterns/auth.md:107-108` (Legacy-Cookie-Zombie via Long-Session-Remnant).
- **Patterns-Referenz:** `patterns/nextjs.md` (Middleware → Server Components, JWT in Edge Runtime).
- **Patterns-Referenz:** `patterns/deployment-staging.md` (Shared Staging+Prod DB, DDL at boot).
- **Lessons-Referenz:** `memory/lessons.md` Eintrag zu Shared Staging+Prod DB.
- **Shared-DB-Constraint:** Staging-Push legt `auth_method_daily` auf shared DB an → Prod übernimmt sofort. Kein Backup nötig (additive-only).
- **No new Env-Vars** → keine `docker-compose*.yml`-Änderungen nötig.
- **Generator muss darauf achten:** keine `pg`/`bcryptjs`-Imports in `auth-cookie.ts` — der Edge-Safe-Test fängt das, aber besser gleich richtig bauen.
