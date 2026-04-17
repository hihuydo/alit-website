# Sprint: T0-Security-Hardening
<!-- Spec: tasks/spec.md -->
<!-- Started: 2026-04-17 -->

## Done-Kriterien

> Alle müssen PASS sein bevor der Sprint als fertig gilt. Gruppiert per PR — PR 1 muss grün auf Staging + Prod durchlaufen sein bevor PR 2 startet.

### PR 1 — Infra & Quick Wins
- [ ] `pnpm audit --prod` zeigt 0 HIGH/CRITICAL (Next.js auf ≥16.2.3)
- [ ] `pnpm build` + `pnpm test` beide grün (165+ Tests, neue client-ip Tests dazu)
- [ ] `src/lib/client-ip.ts` hat keinen XFF-Fallback mehr (grep `x-forwarded-for` in client-ip.ts → 0 matches)
- [ ] `src/app/api/dashboard/alit/reorder/route.ts` returnt generischen Error, nicht mehr `err.message`
- [ ] `nginx/alit.conf` hat HSTS + Permissions-Policy + X-Frame:DENY + Dotfile-Block + `client_max_body_size 55m;`
- [ ] Alle 3 location-Blöcke in `nginx/alit.conf` wiederholen die Security-Header
- [ ] `.github/dependabot.yml` existiert mit npm + github-actions schedules
- [ ] `.github/workflows/deploy.yml` + `deploy-staging.yml` nutzen SHA-gepinnte `appleboy/ssh-action`
- [ ] `.husky/pre-commit` existiert, triggert gitleaks wenn installiert, sonst no-op
- [ ] **Staging**: `curl -sI https://staging.alit.hihuydo.com/` zeigt alle 5 Security-Header
- [ ] **Staging**: `curl -sI .../_next/static/<file>.css` zeigt dieselben 5 Header (Inheritance-Fix verifiziert)
- [ ] **Staging**: `curl -sI .../.env` → 404 (Dotfile-Block)
- [ ] **Prod**: nginx-Config deployed, `nginx -t` OK, `systemctl reload nginx` erfolgreich
- [ ] **Prod**: SSL-Labs A oder A+
- [ ] **Prod**: `/api/health/` grün (Monitor ID 11 nicht rot)

### PR 2 — Auth Hardening
- [ ] `src/lib/auth.ts` nutzt cost 12 in `hashPassword()`, DUMMY_HASH ist cost-12-Hash
- [ ] `src/lib/auth-cookie.ts` existiert mit `AUTH_COOKIE` + `AUTH_COOKIE_OPTS`
- [ ] Alle 7 Cookie-Call-Sites nutzen den Helper (grep `"session"` in src/ → nur noch Helper + Tests)
- [ ] Login-Handler hat Rehash-on-Login (fire-and-forget nach `verifyPassword`, vor JWT-Sign)
- [ ] Audit-Events `password_rehashed` + `rehash_failed` emittieren korrekt (Tests prüfen beide Pfade)
- [ ] `pnpm test` grün mit `BCRYPT_ROUNDS=4` im Test-Env (vitest config)
- [ ] **Staging**: Admin-Login funktioniert, Cookie-Name ist `__Host-session`
- [ ] **Staging**: DB-Spot-Check Admin-Hash ist `$2[ab]$12$`
- [ ] **Staging**: Audit zeigt exakt 1 `password_rehashed`, 0 `rehash_failed`
- [ ] **Prod**: Re-Login Admin erfolgreich
- [ ] **Prod**: DB-Spot-Check cost 12
- [ ] **Prod**: 0 `rehash_failed` im audit

## Tasks

### PR 1 — Phase 1a: Dependency Upgrade
- [ ] `pnpm add next@^16.2.3 eslint-config-next@^16.2.3`
- [ ] `pnpm test` + `pnpm build` grün
- [ ] `pnpm audit --prod` zeigt 0 HIGH/CRITICAL
- [ ] Smoke-test dev-server: alle 6 Dashboard-Tabs + public Homepage rendern

### PR 1 — Phase 1b: App-Code Changes
- [ ] `src/lib/client-ip.ts` XFF-Fallback entfernen, Kommentar update
- [ ] `src/lib/client-ip.test.ts` neu anlegen (3 Tests: X-Real-IP hit, XFF-only ignored, beide fehlen → "unknown")
- [ ] `src/app/api/dashboard/alit/reorder/route.ts:44-48` generischer 400 Error, server-log behält Detail

### PR 1 — Phase 1c: nginx Config
- [ ] `nginx/alit.conf` editieren:
  - HSTS im server{} add_header
  - Permissions-Policy im server{} add_header
  - X-Frame-Options DENY (ersetzt SAMEORIGIN)
  - Dotfile-Block als erstes location block im https-server
  - `client_max_body_size 55m;` im server{}
  - Alle security-headers in `/_next/static/` UND `/fonts/` Blöcken wiederholen
- [ ] SSH auf hd-server, Diff gegen `/etc/nginx/sites-available/alit` ziehen
- [ ] Wenn Prod-Direktiven fehlen die nicht im Repo sind: Repo ergänzen vor Deploy
- [ ] `/etc/nginx/sites-available/alit.conf` backup nach `.bak`
- [ ] Neue Config rüberkopieren, `nginx -t`, `systemctl reload nginx`
- [ ] `curl -sI` Header-Checks + Dotfile-Block-Check

### PR 1 — Phase 1d: CI / Dev-Hygiene
- [ ] `.github/dependabot.yml` anlegen (npm weekly + github-actions weekly + ignore next major)
- [ ] `appleboy/ssh-action@v1` SHA ermitteln (`gh api repos/appleboy/ssh-action/git/refs/tags/v1.2.2` oder ähnlich)
- [ ] Beide deploy-Workflows auf `@<40-char-sha>  # v1.2.x` umstellen
- [ ] `pnpm add -D husky`
- [ ] `package.json` scripts: `"prepare": "husky"`
- [ ] `pnpm prepare` einmal lokal ausführen
- [ ] `.husky/pre-commit` mit gitleaks-if-present Logik (siehe spec.md)
- [ ] `.husky/pre-commit` executable

### PR 1 — Deploy + Verify
- [ ] Feature-branch Push → Staging-Deploy via GitHub Actions
- [ ] `gh run watch` grün
- [ ] Staging-Verifikation (alle Done-Kriterien PR 1)
- [ ] PR öffnen → Codex-Review
- [ ] Max 3 Runden, Findings in-scope fixen, out-of-scope in `memory/todo.md` loggen
- [ ] Merge → Prod-Deploy (Container)
- [ ] nginx-Config auf Prod deployen — **KRITISCH**: GitHub-Actions-Deploy reloaded nginx NICHT, muss manuell
- [ ] Prod-Verifikation (alle Done-Kriterien PR 1)

---

### PR 2 — Phase 2a: Cookie-Helper-Extraction
- [ ] `src/lib/auth-cookie.ts` neu: `AUTH_COOKIE` + `AUTH_COOKIE_OPTS`
- [ ] Alle 7 Call-Sites updaten:
  - `src/app/api/auth/login/route.ts` (set)
  - `src/app/api/auth/logout/route.ts` (set clear)
  - `src/app/api/dashboard/account/route.ts` (2× get)
  - `src/middleware.ts` (get)
  - `src/lib/api-helpers.ts` (get)
  - `src/lib/signups-audit.ts` (get)
- [ ] Tests für dev-Env (`session`) + prod-Env (`__Host-session`)
- [ ] Roundtrip-Test: login-handler → `cookies.get(AUTH_COOKIE)` → middleware.verifySession → OK

### PR 2 — Phase 2b: bcrypt Cost-Bump
- [ ] `src/lib/auth.ts`: `hashPassword(plain, Number(process.env.BCRYPT_ROUNDS ?? 12))`
- [ ] `DUMMY_HASH` neu generieren mit cost 12: `node -e "console.log(require('bcryptjs').hashSync('placeholder', 12))"` → String ersetzen
- [ ] `src/instrumentation.ts`: Boot-Warning wenn `BCRYPT_ROUNDS < 12 && NODE_ENV !== 'test'`
- [ ] `vitest.config.ts` oder test-setup: `process.env.BCRYPT_ROUNDS = "4"` für Tests
- [ ] Verifizieren: `pnpm test` läuft in vergleichbarer Zeit wie vorher (< 10% Regression)

### PR 2 — Phase 2c: Rehash-on-Login
- [ ] Helper `rehashPasswordIfStale(userId, currentHash, plain, clientIp)` in `src/lib/auth.ts`:
  - `bcrypt.getRounds(currentHash)` lesen
  - Wenn `>= 12` → return (no-op)
  - Sonst fire-and-forget `bcrypt.hash(plain, 12)` → `UPDATE admin_users SET password = $1 WHERE id = $2 AND password = $3` (current-hash im WHERE schützt gegen Parallel-Rehash-Race)
  - `.then(audit('password_rehashed'))` / `.catch(console.error + audit('rehash_failed'))`
- [ ] `src/app/api/auth/login/route.ts`: nach `await login(email, password)` → wenn token truthy: Rehash fire-and-forget
- [ ] Tests in `src/lib/auth.test.ts`:
  - Login mit cost-10-Hash → success, nach 500ms zeigt DB cost 12
  - Login mit cost-12-Hash → no rehash audit
  - Rehash-failure Pfad: mock UPDATE throw → audit `rehash_failed` emitted

### PR 2 — Deploy + Verify
- [ ] Feature-branch Push → Staging
- [ ] Staging-Verifikation (alle Done-Kriterien PR 2)
- [ ] PR öffnen → Codex-Review
- [ ] Max 3 Runden
- [ ] **Vor Merge**: User (Huy) wird informiert dass Session invalidiert wird → Timing abstimmen
- [ ] Merge → Prod-Deploy
- [ ] Sofort Admin-Re-Login auf Prod
- [ ] Prod-Verifikation (alle Done-Kriterien PR 2)
- [ ] `memory/lessons.md` Eintrag: cookie-rename-ohne-dual-read für 1-Admin-Apps OK

## Notes

- **Patterns referenzieren** (nicht neu erfinden):
  - `patterns/auth.md` — Rehash-on-Login (fire-and-forget, audit-events, WHERE-clause, deploy-gate)
  - `patterns/auth-hardening.md` — Session-Restore-Exemption (GET account ist OK)
  - `patterns/deployment-nginx.md` — add_header Inheritance (in ALLEN location-Blöcken wiederholen)

- **Audit-Findings die NICHT adressiert werden** — Generator bitte NICHT fixen:
  - `/api/dashboard/account` GET Rate-Limit — Audit-Fehler, GET ist nicht rate-limited
  - Zod-Migration — Custom-Validatoren bewusst behalten
  - DB Pool Max, Branch-Protection, pg_hba — Ops-Tasks, nicht im Repo

- **nginx-Drift-Risk**: Wenn beim SSH-Diff auf hd-server Direktiven in Prod stehen die nicht im Repo sind (Rate-Limits, Cache-Regeln) — ergänzen statt überschreiben. Nicht blind `cp` ausführen.

- **Test-Strategie**:
  - Bestehende 165 Tests grün halten
  - Neue Tests: client-ip.test.ts (3), auth-cookie Roundtrip (2), rehash-on-login (3)
  - `BCRYPT_ROUNDS=4` im Test-Env sonst +30s CI

- **Deploy-Reihenfolge**: PR 1 Staging → PR 1 Prod → **Soak 24h** → PR 2 Staging → PR 2 Prod. Soak zwischen PRs damit nginx-Changes in Prod verankert sind bevor Auth-Changes dazukommen.

- **Follow-up nach Sprint-Abschluss** (`memory/todo.md`):
  - Branch-Protection auf `main` manuell in GitHub-UI aktivieren
  - GitHub Secret-Scanning in Repo-Settings aktivieren
  - DB-User-Privileges auf hd-server auditen
  - Backup-Restore-Drill (pg_restore auf dev-machine durchspielen)
