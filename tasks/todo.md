# Sprint: Cookie-Migration Phase 2 (Dual-Verify-Removal)
<!-- Spec: tasks/spec.md -->
<!-- Started: 2026-04-25 -->

## Done-Kriterien (Sprint Contract)

> Alle müssen PASS sein bevor der Sprint als fertig gilt.

### Mechanical (pre-push verifizierbar)

- [x] **DK-1** `pnpm build` passes — keine TS-Errors
- [x] **DK-2** `pnpm test` passes — 639 Tests grün (von 655, Drop von 16: -2 cookie-counter.test.ts, -7 auth-cookie legacy-fallback Cases, -3 api-helpers bump-counter Cases, -4 weitere Sprint-B-spezifische Assertions die obsolet wurden)
- [x] **DK-3** `pnpm audit --prod` — 0 HIGH/CRITICAL (1 moderate, pre-existing)
- [x] **DK-4** `grep -rn "LEGACY_COOKIE_NAME" src/` → leer
- [x] **DK-5** `grep -rn "verifySessionDualRead" src/` → leer
- [x] **DK-6** `grep -rn "bumpCookieSource" src/` → leer
- [x] **DK-7** `grep -rn "cookie-counter" src/` → leer (außer 1 CHANGELOG-Stil-Comment in `runtime-env.ts`, im Spec explizit erlaubt)
- [x] **DK-8** `src/lib/cookie-counter.ts` + `src/lib/cookie-counter.test.ts` existieren nicht mehr (`git rm`)
- [x] **DK-9** Edge-safety self-test in `src/lib/auth-cookie.test.ts` läuft (regex-grep gegen Node-only-Imports im File)

### Semantic (Code-Review verifizierbar)

- [x] **DK-10** `verifySessionDualRead` umbenannt zu `verifySession` in `src/lib/auth-cookie.ts`, alle 7 Code-Callsites migriert (proxy, layout, api-helpers, tests)
- [x] **DK-11** `SessionReadResult` und `AuthContext` Types haben kein `source`-Feld mehr
- [x] **DK-12** `setSessionCookie` + `clearSessionCookies` in `auth-cookie.ts` haben keinen `LEGACY_COOKIE_NAME` Clear-Block mehr
- [x] **DK-13** `(authed)/layout.tsx` Inline-Dual-Read-Schleife durch single-cookie-read ersetzt, JWT-`tv`-Validation pipeline beibehalten
- [x] **DK-14** `auth_method_daily` CREATE TABLE in `schema.ts` bleibt, Comment-Block aktualisiert auf "no longer written as of Sprint C, drop in follow-up sprint"

## PMC (Post-Merge, manuell)

- [ ] **PMC-1** CI Deploy grün auf Staging-Push
- [ ] **PMC-2** CI Deploy grün auf Prod-Merge
- [ ] **PMC-3** `/api/health/` 200 auf staging + prod nach Deploy
- [ ] **PMC-4** Login-Flow-Smoke auf Staging: `/dashboard/login/` → email + PW → `/dashboard/` → eine Mutation klicken (Agenda-Title editieren + speichern) → 200
- [ ] **PMC-5** Login-Flow-Smoke auf Prod: identisch
- [ ] **PMC-6** `docker compose logs --tail=50 alit-web` clean — keine `[cookie-counter]` Warnungen, keine Errors
- [ ] **PMC-7** DB-Sanity: `SELECT date, source, count FROM auth_method_daily WHERE date >= current_date - 1` zeigt **keine neuen Rows** seit Deploy (historical rows bleiben)

## Done

(noch nichts)
