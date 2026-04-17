# Sprint: T0-Auth-Hardening Sprint B — Cookie-Migration
<!-- Spec: tasks/spec.md (v3 — Codex Runde 1+2 Findings eingearbeitet) -->
<!-- Started: 2026-04-17 -->
<!-- Status: Draft v3 — awaiting approval. Keine weitere Codex-Spec-Runde (max 2). -->

## Done-Kriterien
> Alle müssen PASS sein bevor der Sprint als fertig gilt.

- [ ] `src/lib/auth-cookie.ts` existiert als Edge-safe Leaf-Modul; File-Content-Grep liefert 0 Matches gegen `/from ['"](pg|bcryptjs|\.\/db|\.\/audit|\.\/auth)/` (unit-test asserted).
- [ ] `verifySessionDualRead(req)` verifiziert primary first; bei primary missing OR verify-fail OR sub non-numeric → Legacy-Verify. Test "primary corrupt + legacy valid" grün.
- [ ] `verifySessionDualRead(req)` returns `{ userId: number; source: 'primary'|'legacy' } | null` — userId ist bereits validated-int (regex `/^[0-9]+$/` + parseInt inside helper).
- [ ] `requireAuth(req)` Signatur: `Promise<NextResponse | { userId: number; source }>`. Alle bestehenden `requireAuth`-Konsumenten in `src/app/api/**` sind auf neue Return-Shape umgestellt (TypeScript 0 Errors).
- [ ] `resolveActorEmail(userId: number)` nimmt nur User-ID. Zero Cookie-Read, zero Counter-Bump.
- [ ] **Alle 3 resolveActorEmail-Call-Sites** angepasst: `signups/[type]/[id]`, `signups/bulk-delete`, `signups/memberships/[id]/paid` → alle rufen `resolveActorEmail(auth.userId)`.
- [ ] Grep `rg "cookies\.(get|set)\([\"']session[\"']" src/` gibt 0 Matches außer in `src/lib/auth-cookie.ts` + Test.
- [ ] In Prod (NODE_ENV=production) setzt Login `__Host-session` (Secure, HttpOnly, SameSite=Strict, Path=/, kein Domain) UND cleart atomar `session` (maxAge=0). Im dev-mode kein Doppel-Set (Namen identisch).
- [ ] Logout cleart beide Cookies (`session` + `__Host-session`).
- [ ] `auth_method_daily`-Tabelle mit `date DATE NOT NULL` existiert nach `ensureSchema()`; `bumpCookieSource` schreibt `ON CONFLICT DO UPDATE` idempotent auf (date, source, env).
- [ ] `bumpCookieSource` bei DB-Fail → stdout-JSON-Event `cookie_bump_fallback` mit {date, source, env, timestamp}, keine Exception entkommt.
- [ ] Counter bumpt nur bei `verifySessionDualRead !== null`, genau einmal pro Request.
- [ ] Flip-Query (`date >= current_date - 6 AND date <= current_date` = 7 Kalendertage inkl. heute) liefert auf Staging/Prod-DB Row-Shape ohne Cast-Errors.
- [ ] `pnpm build` grün, `pnpm test` grün, `pnpm audit --prod` → 0 HIGH/CRITICAL.
- [ ] Staging-Deploy: DevTools zeigt `__Host-session`; `session`-Cookie nicht mehr vorhanden nach Re-Login; Primary-corrupt-Test (mit manuell gesetztem Legacy) zeigt Fallback funktioniert; `psql` zeigt `auth_method_daily`-Row `env='staging'`.
- [ ] Docker: keine neuen Env-Vars, keine `docker-compose*.yml`-Änderung.

## Tasks

### Phase 1 — Shared JWT-Konstante + Edge-safe Leaf + Tests
- [ ] Create `src/lib/jwt-algorithms.ts` mit `export const JWT_ALGORITHMS = ["HS256"] as const`. Edge-safe.
- [ ] Refactor `src/lib/auth.ts::verifySession` + `SignJWT`-Call auf shared `JWT_ALGORITHMS`.
- [ ] Create `src/lib/auth-cookie.ts`:
  - `SESSION_COOKIE_NAME`, `LEGACY_COOKIE_NAME` Konstanten.
  - internal `getJwtSecret()` — returns `null` wenn missing (kein throw, Edge-kompatibel).
  - internal `validateSub(sub: unknown): number | null` — regex `/^[0-9]+$/` + parseInt.
  - `verifySessionDualRead(req)`:
    - Tries `req.cookies.get(SESSION_COOKIE_NAME)` → `jose.jwtVerify` mit `JWT_ALGORITHMS` → validateSub → `{userId, source:'primary'}` on success.
    - On any fail step (missing secret, missing cookie, verify-throw, sub-invalid): tries `LEGACY_COOKIE_NAME` same pipeline → `{userId, source:'legacy'}`.
    - Else `null`.
  - `setSessionCookie(res, token)`:
    - `res.cookies.set(SESSION_COOKIE_NAME, token, { httpOnly, secure: NODE_ENV==='production', sameSite:'strict', path:'/', maxAge: 86400 })`.
    - If `SESSION_COOKIE_NAME !== LEGACY_COOKIE_NAME` → `res.cookies.set(LEGACY_COOKIE_NAME, "", { maxAge: 0, path: "/" })`.
  - `clearSessionCookies(res)` — beide Namen `maxAge=0`.
  - Imports NUR `jose`, `next/server`, `./jwt-algorithms`.
- [ ] Create `src/lib/auth-cookie.test.ts`:
  - Name-Resolution (prod/dev/test).
  - valid primary with numeric sub → `{userId, source:'primary'}`.
  - primary missing + valid legacy → `{userId, source:'legacy'}`.
  - **primary corrupt (wrong secret/expired) + valid legacy → source:'legacy'** (Codex R1 #1).
  - **primary valid-verify but sub='abc' (non-numeric) + valid legacy → source:'legacy'** (Codex R2 #2).
  - both invalid → null.
  - both sub non-numeric → null.
  - no cookies → null.
  - JWT_SECRET missing → null (no throw).
  - `setSessionCookie` in prod → sets `__Host-session` + clears `session`.
  - `setSessionCookie` in dev → sets `session` only, no clear-call.
  - `clearSessionCookies` → both `maxAge=0`.
  - Edge-Safe-Grep: `readFileSync('src/lib/auth-cookie.ts')` + regex-assert 0 matches.

### Phase 2 — Counter-Helper + Schema + Tests
- [ ] Create `src/lib/cookie-counter.ts`:
  - `deriveEnv()` Modul-Konstante aus `SITE_URL`-Hostname (`staging.` prefix → `'staging'`, else `'prod'`, fallback `'prod'`).
  - `bumpCookieSource(source)` — fire-and-forget INSERT ... ON CONFLICT DO UPDATE. Try/catch. Stdout-Fallback `console.log(JSON.stringify({type:'cookie_bump_fallback', ...}))` + `console.error(...)` on catch.
- [ ] Create `src/lib/cookie-counter.test.ts`:
  - `deriveEnv` cases (staging/prod/missing).
  - happy path (mock pool.query resolves).
  - DB-error (mock throws) → Fallback-Log + no escaped rejection.
- [ ] Modify `src/lib/schema.ts::ensureSchema()`:
  - `CREATE TABLE IF NOT EXISTS auth_method_daily (date DATE NOT NULL, source TEXT NOT NULL, env TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(date, source, env))`.

### Phase 3 — Signatur-Refactor (Big-Bang via TypeScript)
- [ ] Modify `src/lib/api-helpers.ts::requireAuth`:
  - Signatur: `Promise<NextResponse | { userId: number; source: 'primary'|'legacy' }>`.
  - Nutzt `verifySessionDualRead(req)`. Bei `null` → 401-NextResponse. Bei Success → `void bumpCookieSource(source)` + return `{userId, source}`.
- [ ] Modify `src/lib/signups-audit.ts::resolveActorEmail`:
  - Signatur: `(userId: number): Promise<string | undefined>`. DB-Lookup bleibt, Cookie-Read + verifySession raus.
- [ ] Audit + Refactor alle `requireAuth`-Konsumenten in `src/app/api/**`:
  - Alter Pattern `const r = await requireAuth(req); if (r) return r;` → neuer Pattern `const auth = await requireAuth(req); if (auth instanceof NextResponse) return auth;`.
  - Bei gleichzeitig `resolveActorEmail(req)` → `resolveActorEmail(auth.userId)`.
  - Generator nutzt TypeScript-Errors als Checklist.
- [ ] **Alle 3 `resolveActorEmail`-Call-Sites** explizit verifizieren:
  - [ ] `src/app/api/dashboard/signups/[type]/[id]/route.ts`
  - [ ] `src/app/api/dashboard/signups/bulk-delete/route.ts`
  - [ ] `src/app/api/dashboard/signups/memberships/[id]/paid/route.ts` (Codex R2 #4)

### Phase 4 — 7 Cookie-Call-Sites Wiring
- [ ] Modify `src/middleware.ts` — `verifySessionDualRead(req)` statt inline jwtVerify + Cookie-Read. Kein Counter (Edge).
- [ ] Modify `src/app/api/auth/login/route.ts` — `setSessionCookie(res, token)` (cleart Legacy atomar).
- [ ] Modify `src/app/api/auth/logout/route.ts` — `clearSessionCookies(res)`.
- [ ] Modify `src/app/api/dashboard/account/route.ts` GET:
  - `verifySessionDualRead(req)` statt `verifySession(req.cookies.get("session")?.value)`.
  - Bei Success `void bumpCookieSource(result.source)`.
  - UserId aus `result.userId` direkt an DB-Queries.
- [ ] Modify `src/app/api/dashboard/account/route.ts` PUT:
  - Wie GET. Single-Bump pro Request.

### Phase 5 — Verifikation + Deploy
- [ ] `pnpm build` grün (Big-Bang Refactor TypeScript-clean).
- [ ] `pnpm test` grün.
- [ ] `pnpm audit --prod` → 0 HIGH/CRITICAL.
- [ ] Grep-Audit: `rg "cookies\.(get|set)\([\"']session[\"']" src/` → nur `auth-cookie.ts` + Tests.
- [ ] Spec-Status-Bump-Commit (`Status: v3-impl` → impl phase complete) triggert post-commit Sonnet-Evaluator gegen Code.
- [ ] ggf. Spec-Fixes bis qa-report clean.
- [ ] Push → pre-push Sonnet-Gate grün.
- [ ] PR öffnen → Codex-Review am PR (Deep-Review) → Fix-Loop max 2 Runden.
- [ ] Staging-Deploy verifizieren:
  - [ ] DevTools: `__Host-session` gesetzt, `session` weg.
  - [ ] Primary-corrupt-Test: Legacy-Cookie manuell injecten + Primary beschädigen → Request authentifiziert, `source='legacy'` in DB.
  - [ ] psql zeigt `env='staging'` row.
- [ ] Merge auf main → Prod-Deploy verifizieren:
  - [ ] DevTools.
  - [ ] `docker compose logs` clean.
  - [ ] psql `env='prod'` row.
- [ ] `memory/project.md` + `memory/lessons.md` + `memory/todo.md` aktualisieren (wrap-up).
- [ ] `memory/todo.md` Follow-ups ergänzen: Sprint C, JWT_SECRET-Fail-Mode-Normalisierung (Codex R2 #5).

## Notes

- **Scope-Discipline**: Admin-Endpoint + Dual-Verify-Removal + JWT_SECRET-Fail-Mode-Harmonisierung sind **Sprint C** / Follow-up-Sprint.
- **Big-Bang-Refactor**: `requireAuth`-Signatur-Change atomar. TypeScript als Checklist.
- **Patterns-Referenz:** `patterns/auth.md:71` (JWT-Algorithm-Shared-Const), `:93-110` (Observability-Gate), `:107-108` (Legacy-Zombie-Monitoring).
- **Shared-DB:** Staging-Push = DDL-Deploy auf shared DB (additive-only).
- **Stdout-Fallback** spiegelt `auditLog`-Pattern (`src/lib/audit.ts`).
- **Generator-Hinweis:** Phase 3 in einem Commit um TypeScript-Errors nicht gruppenweise zu triagen.
- **Max 2 Codex-Spec-Runden erreicht** (R1 + R2). Kein weiterer Spec-Review. PR-Review am PR ist der nächste Deep-Check.
