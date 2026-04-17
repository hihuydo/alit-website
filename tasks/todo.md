# Sprint: T0-Auth-Hardening Sprint A — bcrypt-Rehash
<!-- Spec: tasks/spec.md -->
<!-- Started: 2026-04-17 -->
<!-- Split: Cookie-Migration extrahiert als Sprint B (nach diesem Sprint) -->

## Done-Kriterien
> Alle müssen PASS sein bevor der Sprint als fertig gilt.

### Code-Level (verifizierbar lokal vor Push)
- [ ] `src/lib/bcrypt-rounds.ts` existiert, exportiert `parseBcryptRounds`, `BCRYPT_ROUNDS_DEFAULT`, `BCRYPT_ROUNDS_MIN`, `BCRYPT_ROUNDS_MAX` — und enthält **KEINE** pg/bcrypt/audit Imports (Edge-safe) — grep `from.*['\"](pg|bcryptjs|./db|./audit|./auth)` in bcrypt-rounds.ts = 0 matches.
- [ ] `src/lib/auth.ts` importiert `parseBcryptRounds` aus `./bcrypt-rounds` und nutzt `BCRYPT_ROUNDS`-Konstante — grep-verifizierbar.
- [ ] `src/lib/auth.ts` exportiert `parseCost` mit bcrypt-prefix-specific Regex (`^\$2[aby]\$(\d{2})\$`) — `parseCost("$argon2i$...")===null`, `parseCost("$2b$abc$...")===null`, nur valid-bcrypt → 2-digit cost.
- [ ] `src/lib/auth.ts::hashPassword(plain)` nutzt `BCRYPT_ROUNDS` (nicht hardcoded 10) — grep `bcrypt\.hash\(.*,\s*10\)` in auth.ts = 0 matches.
- [ ] `src/lib/auth.ts::DUMMY_HASH` via `bcrypt.hashSync(..., BCRYPT_ROUNDS)` bei Modul-Load (nicht string-literal) — grep `DUMMY_HASH\s*=\s*"\$2` in auth.ts = 0 matches.
- [ ] `src/lib/auth.ts::login(email, password, ip)` 3-arg Signatur — TypeScript compile-error würde 2-arg Call finden.
- [ ] `src/lib/auth.ts` enthält Rehash-Block mit `WHERE id = $2 AND password = $3` Race-Gate + `rowCount === 1` Audit-Emit-Gate + `.catch` mit `rehash_failed` — grep auf `"password_rehashed"` + `"rehash_failed"` in auth.ts trifft.
- [ ] `src/lib/audit.ts::AuditEvent` union enthält `"password_rehashed"` und `"rehash_failed"` — grep.
- [ ] `src/lib/audit.ts::AuditDetails` hat optionale Felder `user_id`, `old_cost`, `new_cost` — grep.
- [ ] `src/lib/audit-entity.ts` mapped beide neuen Events auf `{ entity_type: "admin", entity_id: user_id ?? null }` — unit-getestet.
- [ ] `src/instrumentation.ts` importiert `parseBcryptRounds` aus `./lib/bcrypt-rounds` + enthält `BCRYPT_ROUNDS<12` Warn-Branch nach IP_HASH_SALT-Check — grep.
- [ ] `docker-compose.yml` enthält `BCRYPT_ROUNDS: ${BCRYPT_ROUNDS:-12}` im `environment:`-Block des alit-Service — grep.
- [ ] `docker-compose.staging.yml` enthält gleichen Eintrag — grep.
- [ ] `.env.example` dokumentiert `BCRYPT_ROUNDS` Override (falls Datei existiert; sonst NEU mit Stub).
- [ ] `pnpm build` passes ohne TypeScript-Fehler.
- [ ] `pnpm test` passes (existing 168 + 13 neue Tests = 181+).
- [ ] `pnpm audit --prod` = 0 HIGH/CRITICAL.
- [ ] `pnpm lint` passes.

### Deploy-Verifikation Staging (Must-Have — nach Staging-Push)
- [ ] **Pre-Push Hash-Snapshot** `ssh hd-server 'docker exec alit-postgres psql -U alit_user -d alit -c "SELECT substr(password,1,7) AS prefix, email FROM admin_users;"'` ausgeführt + Output gespeichert → erwartet `$2a$10$` / `$2b$10$`.
- [ ] Staging-Deploy `gh run list --branch feat/t0-auth-hardening --limit 1` = success.
- [ ] Staging-URL erreichbar: `curl -I https://staging.alit.hihuydo.com/` = 200 mit `x-robots-tag: noindex`.
- [ ] Staging-Health: `curl -s https://staging.alit.hihuydo.com/api/health/` = `ok`.
- [ ] **Staging-Browser-Login** erfolgreich mit Huy-Credentials.
- [ ] **Post-Login Hash-Spot-Check** `ssh hd-server 'docker exec alit-postgres psql ...'` = `$2a$12$` / `$2b$12$`.
- [ ] **DUAL-Gate Audit-Check (password_rehashed)**:
  - DB: `SELECT event, details->>'old_cost' AS oc, details->>'new_cost' AS nc FROM audit_events WHERE event='password_rehashed' ORDER BY id DESC LIMIT 1;` = 1 Row mit `oc=10, nc=12`.
  - stdout: `ssh hd-server 'docker logs alit-staging --since=10m | grep password_rehashed'` = 1 JSON-Line mit gleichen Details.
- [ ] **DUAL-Gate rehash_failed-Check**:
  - DB: `SELECT COUNT(*) FROM audit_events WHERE event='rehash_failed' AND created_at > NOW() - INTERVAL '1 hour';` = 0.
  - stdout: `ssh hd-server 'docker logs alit-staging --since=10m | grep rehash_failed'` = leer.
- [ ] Logs clean: `ssh hd-server 'docker logs alit-staging --tail=30'` = keine errors/exceptions/crashes.
- [ ] `BCRYPT_ROUNDS`-Env erreicht Container: `ssh hd-server 'docker exec alit-staging printenv BCRYPT_ROUNDS'` = `12` (oder unset → Default wirkt).

### Deploy-Verifikation Prod (Must-Have — nach Prod-Merge)
- [ ] CI/CD green: `gh run list --branch main --limit 1` = success.
- [ ] Prod-URL: `curl -I https://alit.hihuydo.com/` = 200.
- [ ] Prod-Health: `curl -s https://alit.hihuydo.com/api/health/` = `ok`.
- [ ] **Prod-Browser-Login** erfolgreich (existing session bleibt valide — keine Cookie-Migration in Sprint A).
- [ ] Hash-Spot-Check bleibt `$2a$12$`/`$2b$12$` (no-op, war schon gerehashed durch Staging-Login).
- [ ] `ssh hd-server 'docker logs alit-web --tail=30'` = keine rehash_failed, keine Errors.
- [ ] `SELECT COUNT(*) FROM audit_events WHERE event='rehash_failed' AND created_at > '<prod-deploy-time>'` = 0.
- [ ] `ssh hd-server 'docker exec alit-web printenv BCRYPT_ROUNDS'` = `12`.

## Tasks

### Phase 1 — Shared Parser + Audit-Extension

- [ ] `src/lib/bcrypt-rounds.ts` erstellen: Konstanten + `parseBcryptRounds()` mit 5 Branches (default/valid/non-integer/clamp-low/clamp-high).
- [ ] `src/lib/bcrypt-rounds.test.ts` erstellen: 5 Tests.
- [ ] `src/lib/audit.ts` erweitern: `AuditEvent` += 2, `AuditDetails` += 3 optionale Felder.
- [ ] `src/lib/audit-entity.ts` erweitern: 2 neue if-Branches.
- [ ] `src/lib/audit-entity.test.ts` erweitern: 2 neue Cases.

### Phase 2 — auth.ts Refactor

- [ ] `src/lib/auth.ts` umschreiben:
  - Import `parseBcryptRounds` + Konstanten aus `./bcrypt-rounds`.
  - `BCRYPT_ROUNDS` als exported const computed at module load mit warning-logging.
  - `parseCost(hash)` pure helper (exported).
  - `DUMMY_HASH` via `bcrypt.hashSync(..., BCRYPT_ROUNDS)`.
  - `hashPassword(plain)` nutzt `BCRYPT_ROUNDS`.
  - `login(email, password, ip)` 3-arg mit inline rehash-on-login + Race-Gate + rowCount===1 + audit.
- [ ] `src/lib/auth.test.ts` erstellen: 6 Tests für `parseCost` (valid $2a/$2b/$2y, argon2-reject, non-digit-cost-reject, empty-reject — per Codex R2 [Correctness] 1).
- [ ] `src/app/api/auth/login/route.ts`: `login(email, password, getClientIp(req.headers))`.

### Phase 3 — Boot-Observability

- [ ] `src/instrumentation.ts`: Import `parseBcryptRounds`. Warning-Branches nach IP_HASH_SALT, vor Retry-Loop. Nur wenn `NODE_ENV !== "test"` und `<12`.

### Phase 4 — Docker-Compose-Wiring

- [ ] `docker-compose.yml`: `environment:` += `BCRYPT_ROUNDS: ${BCRYPT_ROUNDS:-12}`.
- [ ] `docker-compose.staging.yml`: gleich.
- [ ] `.env.example` prüfen (existiert? → Doc-Zeile; fehlt? → NEU mit kompletter Vorlage aus `memory/project.md` Env-Block).

### Phase 5 — Local Verification

- [ ] `pnpm build` green.
- [ ] `pnpm test` green (177+).
- [ ] `pnpm lint` green.
- [ ] `pnpm audit --prod` 0 HIGH/CRITICAL.
- [ ] Dev-Smoke: `pnpm dev`, Login unter `http://localhost:3000/dashboard/login/` mit BCRYPT_ROUNDS=4 (`.env.local`) → schneller Login → Hash in lokaler DB auf cost 4. Mit `BCRYPT_ROUNDS=12` default → cost 12.

### Phase 6 — Staging Deploy + Verify

- [ ] Pre-Push SSH Hash-Snapshot persistieren.
- [ ] Push auf Branch `feat/t0-auth-hardening`.
- [ ] GH-Action `deploy-staging.yml` green.
- [ ] Staging-Browser-Login. Post-Login Spot-Check + DUAL-Audit-Gate.
- [ ] Staging-Logs clean + printenv BCRYPT_ROUNDS.

### Phase 7 — PR + Codex Review

- [ ] PR erstellen: `gh pr create` Titel `feat(auth): Sprint A — bcrypt cost 12 + rehash-on-login + audit + compose-wiring`.
- [ ] Codex Review via `codex review -c model="gpt-5.3-codex"` (pro `patterns/workflow.md`).
- [ ] Findings gegen Sprint Contract bewerten.
- [ ] Max 3 Codex-Runden.

### Phase 8 — Prod Merge + Verify

- [ ] PR mergen nach clean Sonnet + Codex.
- [ ] Prod-Deploy green.
- [ ] Prod-Browser-Login. Hash-Spot-Check no-op. Logs clean. Env-Passthrough.

### Phase 9 — Wrap-Up

- [ ] `memory/lessons.md` + `memory/security.md` + `memory/project.md` + `memory/todo.md` updaten.
- [ ] Pattern-Check: WHERE-password-Race-Gate + rowCount===1 pattern-wert?
- [ ] CLAUDE.md bumpen.
- [ ] **Sprint B Planner-Aufruf für Cookie-Migration** — Scope-Draft in `memory/todo.md` als "Nächster Sprint".

## Notes

### Kritische Patterns
- `patterns/auth.md` Rehash-on-Login (33-60): fire-and-forget, rowCount===1 Audit-Gate, DUAL-observability-Pflicht, test-strategy structural not wall-clock.
- `patterns/deployment-docker.md` Compose-env-allowlist: neue Env-Var MUSS in beiden Compose-Files + `.env.example` — sonst erreicht sie Container nie. **Kritischer Fix für Codex [Contract] 1.**
- `patterns/nextjs.md` eager-env-validation in instrumentation — BCRYPT_ROUNDS-Warn folgt dem Pattern.
- `patterns/testing.md` Vitest 4 — bcrypt-rounds.test.ts + auth.test.ts + audit-entity.test.ts bleiben `node`-env.

### Shared Staging+Prod DB — Verifikations-Sequenz (Sprint A)
1. **Pre-Push**: SSH Hash-Snapshot persistieren (erwarte `$2a$10$` / `$2b$10$`).
2. **Staging-Push** → neuer Code mit cost 12 live auf Staging. **DB unberührt — kein Login = kein Rehash.**
3. **Staging-Browser-Login** → Rehash-Trigger. Spot-Check DB = `$2a$12$`/`$2b$12$`. DUAL-Gate (DB + stdout) für `password_rehashed` Audit.
4. **PR-Review** (Codex).
5. **Prod-Merge** → gleicher Code auf Prod. DB ist schon migriert.
6. **Prod-Browser-Login** (Huy) → Rehash-Branch NICHT (`currentCost === BCRYPT_ROUNDS`). Kein zweiter Audit. Cookie bleibt alter `session` (Sprint B).
7. **Final**: DUAL-Gate `rehash_failed` = 0 (DB-Count UND stdout leer).

### Cookie-Status nach Sprint A
- Cookie-Name bleibt `session`.
- `sameSite` bleibt `strict`.
- Keine Client-Session-Breakage.
- Sprint B addressiert `__Host-session` Migration mit Dual-Read + Observability.

### Generator-Hinweise
- `login()` Signature-Change macht nur 1 Call-Site kaputt: `src/app/api/auth/login/route.ts` (line 46). IP ist bereits oben verfügbar via `getClientIp(req.headers)`.
- `bcrypt-rounds.ts` MUSS nur Types/Primitives nutzen — kein `require`, kein `import 'pg'`.
- Compose-Wiring Syntax: `BCRYPT_ROUNDS: ${BCRYPT_ROUNDS:-12}` — Colon-Dash ist POSIX-shell-Default-Syntax, von Compose nativ unterstützt.

### Bekannte Fallen (aus `memory/lessons.md`)
- **Shared Staging+Prod DB** (2026-04-17): Staging-Login ist Prod-Login für DB-Effekte.
- **Compose-env-allowlist** (2026-04-15, IP_HASH_SALT-Precedent): neue Env muss in beiden Compose-Files + `.env.example`, sonst Container-Env leer → silent-default-fallback.
- **audit.ts stdout-first** (aktuelles Design): DB-Count allein ist kein ausreichender Deploy-Gate — immer dual prüfen.
