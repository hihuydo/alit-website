# Sprint: T0-Auth-Hardening Sprint B — Cookie-Migration
<!-- Spec: tasks/spec.md (v2 — Codex-Findings eingearbeitet) -->
<!-- Started: 2026-04-17 -->
<!-- Status: Draft v2 — awaiting approval + post-commit Sonnet-Evaluator -->

## Done-Kriterien
> Alle müssen PASS sein bevor der Sprint als fertig gilt.

- [ ] `src/lib/auth-cookie.ts` existiert als Edge-safe Leaf-Modul; File-Content-Grep liefert 0 Matches gegen `/from ['"](pg|bcryptjs|\.\/db|\.\/audit|\.\/auth)/` (unit-test asserted).
- [ ] `verifySessionDualRead(req)` verifiziert primary first; bei primary-invalid-ODER-missing fällt zurück auf legacy-Verify. Test "primary corrupt + legacy valid" → `source: 'legacy'` grün.
- [ ] `requireAuth(req)` Signatur ist `Promise<NextResponse | { payload, source }>`. Alle bestehenden `requireAuth`-Konsumenten in `src/app/api/dashboard/**` sind auf die neue Return-Shape umgestellt (TypeScript zeigt 0 Errors).
- [ ] `resolveActorEmail(userId: number)` nimmt nur noch User-ID. Zero Cookie-Read, zero Counter-Bump. Alle Call-Sites reichen `auth.payload.sub` weiter.
- [ ] Grep `rg "cookies\.(get|set)\([\"']session[\"']" src/` gibt 0 Matches außer in `src/lib/auth-cookie.ts` + Test.
- [ ] In Prod (NODE_ENV=production) setzt Login `__Host-session` mit Secure, HttpOnly, SameSite=Strict, Path=/, kein Domain.
- [ ] Logout cleart beide Cookies (`session` + `__Host-session`) mit `maxAge=0`.
- [ ] `auth_method_daily`-Tabelle mit `date DATE NOT NULL` existiert nach `ensureSchema()`; `bumpCookieSource` schreibt `ON CONFLICT DO UPDATE` idempotent auf (date, source, env).
- [ ] `bumpCookieSource` bei DB-Fail → stdout-JSON-Event `cookie_bump_fallback` mit {date, source, env, timestamp}, keine Exception entkommt.
- [ ] Counter bumpt nur bei `verifySessionDualRead !== null`, genau einmal pro Request (requireAuth ODER Account-Inline-Verify, mutually exclusive).
- [ ] Flip-Kriterium-SQL (spec §Requirements 7) liefert auf Staging/Prod-DB Row-Shape `{date, primary_count, legacy_count}` ohne Cast-Errors.
- [ ] `pnpm build` grün, `pnpm test` grün, `pnpm audit --prod` → 0 HIGH/CRITICAL.
- [ ] Staging-Deploy: DevTools zeigt `__Host-session`; Primary-corrupt-Test im Browser zeigt dass Admin eingeloggt bleibt; `psql` zeigt `auth_method_daily`-Row `env='staging'`.
- [ ] Docker: keine neuen Env-Vars, keine `docker-compose*.yml`-Änderung nötig.

## Tasks

### Phase 1 — Shared JWT-Konstante + Edge-safe Leaf + Tests
- [ ] Create `src/lib/jwt-algorithms.ts` mit exported `JWT_ALGORITHMS = ["HS256"] as const` — shared zwischen `auth.ts` und `auth-cookie.ts` (avoids drift, per patterns/auth.md:71).
- [ ] Refactor `src/lib/auth.ts::verifySession` + Sign-Calls auf Shared-Konstante.
- [ ] Create `src/lib/auth-cookie.ts`:
  - `SESSION_COOKIE_NAME`, `LEGACY_COOKIE_NAME` Konstanten.
  - `verifySessionDualRead(req)` — Primary verify-first, Legacy fallback-verify. Internal `getJwtSecret()` (duplicate Edge-safe version from auth.ts). Fail-closed bei missing JWT_SECRET.
  - `setSessionCookie(res, token)`.
  - `clearSessionCookies(res)` — beide Namen `maxAge=0`.
  - Imports: nur `jose`, `next/server`, `./jwt-algorithms`. **Kein** pg/bcryptjs/./db/./audit/./auth.
- [ ] Create `src/lib/auth-cookie.test.ts`:
  - Name-Resolution (prod/dev/test).
  - `verifySessionDualRead`: valid primary → source=primary.
  - `verifySessionDualRead`: primary missing + legacy valid → source=legacy.
  - `verifySessionDualRead`: **primary INVALID (wrong secret/expired/corrupt) + legacy valid → source=legacy**. Kern-Test Codex #1.
  - `verifySessionDualRead`: both invalid → null.
  - `verifySessionDualRead`: no cookies → null.
  - `verifySessionDualRead`: JWT_SECRET missing → null (kein throw).
  - `setSessionCookie` in prod schreibt nur `__Host-session`.
  - `clearSessionCookies` beide `maxAge=0`.
  - Edge-Safe-Grep-Test: readFileSync + regex-assert.

### Phase 2 — Counter-Helper + Schema + Tests
- [ ] Create `src/lib/cookie-counter.ts`:
  - `deriveEnv()` Modul-Konstante aus `SITE_URL`-Hostname.
  - `bumpCookieSource(source)` — fire-and-forget INSERT mit try/catch. Stdout-Fallback `console.log(JSON.stringify({type:"cookie_bump_fallback", ...}))` + `console.error(...)` bei catch.
- [ ] Create `src/lib/cookie-counter.test.ts`:
  - `deriveEnv`: staging/prod/missing-SITE_URL.
  - `bumpCookieSource` happy path (mock pool.query resolves).
  - `bumpCookieSource` DB-error (mock throws) → stdout-Fallback-Log geschrieben + zero Promise-Rejection escaped.
- [ ] Modify `src/lib/schema.ts::ensureSchema()` — `CREATE TABLE IF NOT EXISTS auth_method_daily (date DATE NOT NULL, source TEXT NOT NULL, env TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(date, source, env))`.

### Phase 3 — Signatur-Refactor (Big-Bang)
- [ ] Modify `src/lib/api-helpers.ts::requireAuth`:
  - Return-Shape: `Promise<NextResponse | { payload: {sub:string}; source: 'primary'|'legacy' }>`.
  - Nutzt `verifySessionDualRead(req)`. Bei `null` → 401-NextResponse. Bei Success → `void bumpCookieSource(source)` + return `{payload, source}`.
- [ ] Modify `src/lib/signups-audit.ts::resolveActorEmail`:
  - Signatur: `(userId: number): Promise<string | undefined>`. Zero req-access, zero verifySession, zero bump.
- [ ] Audit + Refactor alle bestehenden `requireAuth`-Call-Sites in `src/app/api/dashboard/**` + `src/app/api/auth/**`:
  - Alter Pattern `const r = await requireAuth(req); if (r) return r;` → neu `const auth = await requireAuth(req); if (auth instanceof NextResponse) return auth;`.
  - Wo `resolveActorEmail(req)` gerufen wird (signups single + bulk): `resolveActorEmail(auth.payload.sub_as_number)` (sub ist string → `parseInt` oder die route-interne userId-Resolution wie gehabt).
  - TypeScript-Compiler fängt jeden Miss. Generator nutzt das als Guide.

### Phase 4 — 7 Cookie-Call-Sites wiring
- [ ] Modify `src/middleware.ts` — `verifySessionDualRead(req)` statt inline-jwtVerify. Keinen Counter (Edge).
- [ ] Modify `src/app/api/auth/login/route.ts` — `setSessionCookie(res, token)`.
- [ ] Modify `src/app/api/auth/logout/route.ts` — `clearSessionCookies(res)`.
- [ ] Modify `src/app/api/dashboard/account/route.ts` GET:
  - `verifySessionDualRead(req)` statt `verifySession(req.cookies.get("session")...)`.
  - Bei Success `void bumpCookieSource(result.source)`.
- [ ] Modify `src/app/api/dashboard/account/route.ts` PUT:
  - Gleich wie GET. Einmal-Bump je Request.

### Phase 5 — Verifikation + Deploy
- [ ] `pnpm build` grün (Big-Bang-Refactor muss TypeScript-clean sein).
- [ ] `pnpm test` grün (existing + neue Tests).
- [ ] `pnpm audit --prod` → 0 HIGH/CRITICAL.
- [ ] Grep-Audit: `rg "cookies\.(get|set)\([\"']session[\"']" src/` → nur `auth-cookie.ts` + Tests.
- [ ] Spec-Status-Bump-Commit (triggert post-commit Sonnet-Evaluator gegen implementierten Code).
- [ ] ggf. Spec-Fixes bis qa-report clean.
- [ ] Push auf Feature-Branch → pre-push Sonnet-Gate grün.
- [ ] PR öffnen → Codex-Review → Fix-Loop (max 2 Runden).
- [ ] Staging-Deploy verifizieren: DevTools `__Host-session`, psql zeigt `auth_method_daily` row, primary-corrupt-Test zeigt Legacy-Fallback funktioniert.
- [ ] Merge auf main → Prod-Deploy verifizieren: DevTools, logs clean, psql row `env='prod'`.
- [ ] `memory/project.md` + `memory/lessons.md` + `memory/todo.md` aktualisieren (wrap-up).

## Notes

- **Scope-Discipline**: Admin-Endpoint `/api/dashboard/audit/cookie-usage` ist **Sprint C**, Codex-Finding #7.
- **Big-Bang-Refactor**: `requireAuth`-Signatur-Change ist atomar. Kein Feature-Flag, kein Gradual. TypeScript zeigt jeden Miss.
- **Patterns-Referenz:** `patterns/auth.md:71` (JWT-Algorithm-Konstante shared), `:93-110` (Auth-Migration + Observability-Gate), `:107-108` (Legacy-Cookie-Zombie), `patterns/nextjs.md` (Edge Runtime).
- **Lessons-Referenz:** `memory/lessons.md` Shared Staging+Prod DB.
- **Shared-DB:** Staging-Push legt `auth_method_daily` auf shared DB an → additive-only, keine Backup-Pflicht.
- **Stdout-Fallback** wichtig weil Counter das Flip-Gate-Signal ist — `auditLog`-Pattern gespiegelt.
- **Generator-Hinweis:** bei Phase 3 Refactor in einem Commit pushen damit TypeScript-Fehler nicht gruppenweise durch den CI-Log wandern.
