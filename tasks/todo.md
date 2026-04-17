# Sprint: T0-Auth-Hardening
<!-- Spec: tasks/spec.md -->
<!-- Started: 2026-04-17 -->

## Done-Kriterien
> Alle müssen PASS sein bevor der Sprint als fertig gilt.

### Code-Level (verifizierbar lokal vor Push)
- [ ] `src/lib/auth.ts` exportiert `parseCost`, `parseBcryptRounds`, `BCRYPT_ROUNDS` — grep-verifizierbar.
- [ ] `src/lib/auth.ts::hashPassword(plain)` nutzt `BCRYPT_ROUNDS` (nicht hardcoded 10) — grep `bcrypt.hash(.*,.*10)` returns 0 matches.
- [ ] `src/lib/auth.ts::DUMMY_HASH` wird via `bcrypt.hashSync(..., BCRYPT_ROUNDS)` bei Modul-Load berechnet (nicht string-literal) — grep `DUMMY_HASH = "\$2[ab]\$"` returns 0 matches.
- [ ] `src/lib/auth.ts::login(email, password, ip)` Signatur 3-arg — TypeScript compile-error bei 2-arg Call an login-Route hätte gezogen.
- [ ] `src/lib/auth.ts` enthält Rehash-on-Login Block mit `WHERE id = $2 AND password = $3` Race-Gate + `rowCount === 1` Audit-Emit-Gate + `.catch` mit `rehash_failed` Audit — grep auf `"password_rehashed"` + `"rehash_failed"` trifft in auth.ts.
- [ ] `src/lib/auth-cookie.ts` existiert, exportiert `SESSION_COOKIE_NAME`, `sessionCookieOptions(maxAge)`, `SESSION_MAX_AGE_SECONDS` — und enthält **KEINE** pg/bcrypt/audit Imports (Edge-safe) — `grep -E "from.*['\"](pg|bcryptjs|./db|./audit|./auth)$" src/lib/auth-cookie.ts` = 0 matches.
- [ ] Alle 7 Call-Sites nutzen `SESSION_COOKIE_NAME` statt hardcoded `"session"` — `grep -rn "cookies\.get(\"session\")\|cookies\.set(\"session\"" src/` = 0 matches.
- [ ] `src/lib/audit.ts::AuditEvent` union enthält `"password_rehashed"` und `"rehash_failed"` — grep-verifizierbar.
- [ ] `src/lib/audit-entity.ts` mapped beide Events auf `{ entity_type: "admin", entity_id: user_id ?? null }` — unit-getestet.
- [ ] `src/instrumentation.ts` enthält BCRYPT_ROUNDS Boot-Warning nach IP_HASH_SALT check, vor retry-loop — grep auf `BCRYPT_ROUNDS` in instrumentation.ts trifft.
- [ ] `pnpm build` passes ohne TypeScript-Fehler.
- [ ] `pnpm test` passes (existing 168 + 9 neue Tests = 177+).
- [ ] `pnpm audit --prod` = 0 HIGH/CRITICAL.
- [ ] `pnpm lint` passes.

### Deploy-Verifikation Staging (Must-Have — nach Staging-Push)
- [ ] **Pre-Push-Snapshot** `ssh hd-server 'docker compose -f /opt/apps/alit-website/docker-compose.yml exec -T postgres psql -U alit_user -d alit -c "SELECT substr(password,1,7) AS prefix, email FROM admin_users;"'` ausgeführt und Output gespeichert (erwartet `$2a$10$` oder `$2b$10$`).
- [ ] Staging deploy (GitHub Action `deploy-staging.yml`) success. `gh run list --branch feat/t0-auth-hardening --limit 1` = success.
- [ ] Staging-URL erreichbar: `curl -I https://staging.alit.hihuydo.com/` = 200 mit `x-robots-tag: noindex`.
- [ ] Staging-Health: `curl -s https://staging.alit.hihuydo.com/api/health/` = `ok`.
- [ ] **Staging-Login im Browser** erfolgreich. Devtools zeigen Cookie-Name `__Host-session` (NICHT `session`), Attribute: `HttpOnly; Secure; SameSite=Lax; Path=/`.
- [ ] **Post-Login-Spot-Check** `ssh hd-server '... SELECT substr(password,1,7), email FROM admin_users;'` = `$2a$12$` oder `$2b$12$` für den login-enden Admin.
- [ ] **Audit-Check** `ssh hd-server '... SELECT event, details->>\'old_cost\' AS oc, details->>\'new_cost\' AS nc, created_at FROM audit_events WHERE event=\'password_rehashed\' ORDER BY id DESC LIMIT 1;'` = eine Row mit `old_cost=10, new_cost=12`.
- [ ] **rehash_failed-Check** `ssh hd-server '... SELECT COUNT(*) FROM audit_events WHERE event=\'rehash_failed\' AND created_at > NOW() - INTERVAL \'1 hour\';'` = 0.
- [ ] Logs clean: `ssh hd-server 'docker logs alit-staging --tail=30'` = kein rehash_failed, kein error/exception, kein crash.

### Deploy-Verifikation Prod (Must-Have — nach Prod-Merge)
- [ ] CI/CD green: `gh run list --branch main --limit 1` = success.
- [ ] Prod-URL erreichbar: `curl -I https://alit.hihuydo.com/` = 200.
- [ ] Prod-Health: `curl -s https://alit.hihuydo.com/api/health/` = `ok`.
- [ ] **Prod-Login im Browser** erfolgreich. Devtools-Cookie = `__Host-session`. (Huy muss sich neu einloggen — alter `session`-Cookie ist orphan.)
- [ ] **Post-Prod-Login-Spot-Check** Hash bleibt `$2a$12$`/`$2b$12$` (no-op, war schon gerehashed durch Staging-Login).
- [ ] `ssh hd-server 'docker logs alit-web --tail=30'` = kein rehash_failed, keine Errors.
- [ ] `SELECT COUNT(*) FROM audit_events WHERE event='rehash_failed' AND created_at > '<prod-deploy-time>'` = 0.

## Tasks

### Phase 1 — Audit + Cookie Core (Dependencies für alles andere)

- [ ] `src/lib/auth-cookie.ts` erstellen: `SESSION_COOKIE_NAME`, `sessionCookieOptions(maxAge)`, `SESSION_MAX_AGE_SECONDS`. Edge-safe (keine pg/bcrypt/audit Imports).
- [ ] `src/lib/auth-cookie.test.ts` erstellen: 3 Tests (prod-name, dev-name, options passthrough) mit `vi.stubEnv("NODE_ENV", ...)` und `vi.unstubAllEnvs` im afterEach.
- [ ] `src/lib/audit.ts` erweitern: `AuditEvent` += 2 Events; `AuditDetails` += `user_id?`, `old_cost?`, `new_cost?`.
- [ ] `src/lib/audit-entity.ts` erweitern: if-Branch für beide neuen Events → `{ entity_type: "admin", entity_id: details.user_id ?? null }`.
- [ ] `src/lib/audit-entity.test.ts` erweitern: 2 neue Cases.

### Phase 2 — auth.ts Refactor

- [ ] `src/lib/auth.ts` umschreiben:
  - `parseBcryptRounds(input: string | undefined): number` pure helper (Range 4..15, NaN→12 + warn).
  - `parseCost(hash: string): number | null` pure helper.
  - `BCRYPT_ROUNDS` als exported const, computed at module load.
  - `DUMMY_HASH` via `bcrypt.hashSync(..., BCRYPT_ROUNDS)`.
  - `hashPassword(plain)` nutzt `BCRYPT_ROUNDS`.
  - `login(email, password, ip)` 3-arg mit inline rehash-on-login (fire-and-forget, Race-Gate, audit).
- [ ] `src/lib/auth.test.ts` erstellen: 4+ Tests für pure helpers.

### Phase 3 — Call-Sites updaten

- [ ] `src/middleware.ts`: import `SESSION_COOKIE_NAME` from `./lib/auth-cookie`, cookie-read ersetzen.
- [ ] `src/lib/api-helpers.ts`: gleiche Änderung.
- [ ] `src/lib/signups-audit.ts`: gleiche Änderung.
- [ ] `src/app/api/auth/login/route.ts`: `login(email, password, ip)` mit IP-arg, `res.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions(SESSION_MAX_AGE_SECONDS))`.
- [ ] `src/app/api/auth/logout/route.ts`: `res.cookies.set(SESSION_COOKIE_NAME, "", sessionCookieOptions(0))`.
- [ ] `src/app/api/dashboard/account/route.ts`: GET + PUT cookie-read ersetzen (2 Call-Sites).

### Phase 4 — Boot-Observability

- [ ] `src/instrumentation.ts`: BCRYPT_ROUNDS-Warn-Check nach IP_HASH_SALT, vor retry-loop. Nur wenn `NODE_ENV !== "test"` und `<12`.

### Phase 5 — Local Verification

- [ ] `pnpm build` green.
- [ ] `pnpm test` green (177+).
- [ ] `pnpm lint` green.
- [ ] `pnpm audit --prod` 0 HIGH/CRITICAL.
- [ ] Dev-Smoke: `pnpm dev`, Login unter `http://localhost:3000/dashboard/login/`, Cookie im Browser-Devtools = `session` (nicht `__Host-session`, weil NODE_ENV=development + HTTP).

### Phase 6 — Staging Deploy + Verify

- [ ] Pre-Push SSH-Snapshot (Hash-Prefix aller admin_users speichern).
- [ ] Push auf Branch `feat/t0-auth-hardening`.
- [ ] GH-Action `deploy-staging.yml` green.
- [ ] Staging-Login im Browser. Cookie-Name-Check + Hash-Spot-Check + Audit-Check (siehe Done-Kriterien).
- [ ] Staging-Logs clean.

### Phase 7 — PR + Codex Review

- [ ] PR erstellen: `gh pr create` mit Titel `feat(auth): T0-Auth-Hardening — bcrypt cost 12 + rehash-on-login + __Host-session cookie`.
- [ ] Codex Review via `codex review -c model="gpt-5.3-codex"` (pro `patterns/workflow.md` aktuelles Flag-Pattern, nicht `--model`).
- [ ] Codex-Findings gegen Sprint Contract bewerten: Sprint-Contract-Verletzung → fixen; Nice-to-have → `memory/todo.md`.
- [ ] Max 3 Codex-Runden; danach Split-Signal.

### Phase 8 — Prod Merge + Verify

- [ ] PR mergen nach clean Sonnet + Codex.
- [ ] Prod-Deploy `deploy.yml` green.
- [ ] Prod-Login im Browser (Huy re-login, alter Cookie orphan).
- [ ] Prod-Health + Logs + Audit-Check.

### Phase 9 — Wrap-Up

- [ ] `memory/lessons.md` + `memory/security.md` + `memory/project.md` + `memory/todo.md` updaten.
- [ ] Pattern-Check: Ist der WHERE-password-Race-Gate + rowCount===1 Pattern-wert? Falls ja: `patterns/auth.md` Rehash-on-Login Section erweitern.
- [ ] CLAUDE.md bumpen (Last updated + Stack-Änderungen).

## Notes

### Kritische Patterns
- `patterns/auth.md` Rehash-on-Login (Zeilen 33-60): fire-and-forget, nach 2FA (hier: nach password-verify, da kein 2FA), `rowCount===1` Audit-Gate, observability-pflicht, test-strategy structural not wall-clock.
- `patterns/auth.md` Session-Bootstrap-401 (Zeilen 69-83): alit hat keinen globalen 401-Interceptor, middleware redirect ist der einzige Path. Kein Reload-Loop-Risiko.
- `patterns/auth.md` JWT alg-pinning (Zeilen 62-67): jose verifiziert mit `algorithms: ["HS256"]` — bereits implementiert, nichts zu ändern.
- `patterns/nextjs.md` Edge Runtime leaf-modules: auth-cookie.ts darf nichts importieren das im Edge-Bundle nicht existiert. TypeScript-only Imports (types) sind okay.
- `patterns/testing.md` Vitest 4 Pragma: auth.test.ts + auth-cookie.test.ts + audit-entity.test.ts bleiben `node`-env (keine DOM nötig).

### Shared Staging+Prod DB — Verifikations-Sequenz
1. **Pre-Push**: SSH Hash-Snapshot persistieren (erwarte `$2a$10$` / `$2b$10$`).
2. **Staging-Push** → `deploy-staging.yml` baut Container → neuer Code live auf Staging-Port 3102. **DB ist noch unberührt — kein Login = kein Rehash.**
3. **Staging-Browser-Login** → Rehash-Trigger. Spot-Check DB zeigt `$2a$12$` / `$2b$12$` für den login-enden User. Audit-Event `password_rehashed` mit `old_cost=10, new_cost=12` ist in `audit_events`.
4. **PR-Review** (Codex).
5. **Prod-Merge** → `deploy.yml` baut Prod-Container mit gleichem Code. **DB ist schon migriert — Prod-Code sieht bereits `$2a$12$` Hashes.**
6. **Prod-Browser-Login** (Huy) → Rehash-Branch greift NICHT (`currentCost === BCRYPT_ROUNDS`). Kein zusätzlicher Audit. Cookie-Prefix `__Host-session` ist das Verifikations-Artefakt für Prod.
7. **Final**: `SELECT COUNT(*) FROM audit_events WHERE event='rehash_failed' AND created_at > '<staging-deploy-time>'` = 0.

### Cookie-Migration Rollout
- Huy's existierender `session`-Cookie wird beim ersten Besuch post-Deploy vom middleware-Read auf `__Host-session` nicht gefunden → redirect auf `/dashboard/login/`.
- Huy gibt Credentials ein → Login-Endpoint setzt neuen `__Host-session` Cookie.
- Orphan `session` Cookie bleibt im Browser bis Ablauf (`maxAge: 86400` = 24h) oder bis Huy Browser-Cookies clear.
- **Kein Dual-Read nötig** für 1-Admin-System.
- **Kein Dual-Clear nötig** im Logout (alte Cookie-Ref stirbt nach 24h, auch wenn Huy sich nicht explizit ausloggt).

### Generator-Hinweise
- `login()` Signature-Change macht 1 Call-Site kaputt: `src/app/api/auth/login/route.ts`. Dort `getClientIp(req.headers)` bereits oben verfügbar — nur durchreichen.
- `auth-cookie.ts` MUSS nur Types/Primitives importieren. TypeScript-Import `import type { ... }` für CookieOptions-Shape aus next/server ist okay (typeof-only).
- Tests laufen in Node-Env, vitest `environment: "node"` ist Default → `vi.stubEnv` funktioniert für `NODE_ENV` / `BCRYPT_ROUNDS`.

### Bekannte Fallen aus `memory/lessons.md`
- **Shared Staging+Prod DB** (2026-04-17): Staging-Push ist DB-Deploy. Bei Rehash-Trigger erst nach Staging-Login passiert nichts am Schema, aber am Daten-State (Hash-Update). Verifikations-Strategie oben berücksichtigt das.
- **Preflight-Checks auf column-Werten** (2026-04-17): Es gibt KEINEN bestehenden Preflight auf `admin_users.password`-Cost. Safe.
