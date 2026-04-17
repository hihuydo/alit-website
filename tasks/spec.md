# Spec: T0-Security-Hardening Sprint
<!-- Created: 2026-04-17 -->
<!-- Author: Planner (Claude Opus 4.7) -->
<!-- Status: Draft v1 -->

## Summary

Schließt die 14 offenen Tier-0-Punkte aus `memory/security.md` die durch das Audit gegen den Code aufgedeckt wurden. Zwei Risiko-Zonen:

- **Low-risk / Infra-Zone (11 Punkte):** nginx-Header, Dependency-Upgrade, CI-Hygiene, IP-Extraktion, kleine Error-Surface-Fix. Reversibel, blast-radius klein.
- **High-risk / Auth-Zone (3 Punkte):** bcrypt-Cost-Bump mit Rehash-on-Login, `__Host-`-Cookie-Prefix, cookie-rename-Invalidation. Betrifft aktive Sessions, braucht eigene Deploy-Verifikation.

**Empfehlung: 2 PRs** — erst Infra auf Staging durchlaufen lassen, dann Auth-PR auf der sauberen Base. Reduziert Codex-Rundenrisiko und hält Revert-Pfade sauber getrennt.

## Context

- Tier-0-Audit am 2026-04-17 gegen `memory/security.md` zeigte 13 FAIL + 5 PARTIAL auf T0-Ebene.
- Dashboard-Login ist die einzige Auth-Grenze (1 Admin-User). Public-Forms (Newsletter/Mitgliedschaft) haben bereits eigene Hardening-Schicht aus Sprint 6.
- nginx-Config im Repo ist in Drift mit Prod (Prod hat bereits `client_max_body_size 55m` aus Sprint 6). Dieser Sprint synct + erweitert die Repo-Config und deployt sie als neue Source-of-Truth.
- Die Patterns `patterns/auth.md` (Rehash-on-Login), `patterns/auth-hardening.md` (Session-Restore-Exemption) und `patterns/deployment-nginx.md` (add_header Inheritance Trap) geben den präzisen Plan vor — wir bauen dagegen, nicht neu erfinden.

### Audit-Findings die NICHT adressiert werden (Begründung)

| Finding | Warum raus aus Scope |
|---|---|
| `/api/dashboard/account` GET rate-limit | Audit-Fehler: PUT ist rate-limited, GET nicht. Bereits korrekt. |
| Zod-Migration | Custom-Validatoren sind voll getestet (165 Tests). Zod ist Nice-to-have, kein T0-Blocker. |
| DB-Pool-Max | pg-Default=10 ausreichend für Admin-Traffic. |
| Branch-Protection / GitHub Secret-Scanning | Manuell im GitHub-UI, nicht im Repo. Ich (Huy) verifiziere separat. |
| pg_hba / DB-User / Backup-Drill | Server-seitig, nicht im Repo sichtbar. Separater Ops-Task. |

## Requirements

### Must Have (Sprint Contract)

#### PR 1 — Infra & Quick Wins (low-risk, landed first)

1. **Next.js 16.2.2 → ≥16.2.3** (HIGH CVE, DoS Server Components)
   - `package.json` + `pnpm-lock.yaml` updated
   - `eslint-config-next` auf gleiche Version
   - `pnpm build` + `pnpm test` grün
   - `pnpm audit --prod` zeigt 0 HIGH/CRITICAL

2. **`src/lib/client-ip.ts` — XFF-Fallback entfernen**
   - Nur `X-Real-IP`, sonst `"unknown"`. Verhält sich wie `signup-client-ip.ts` bereits tut.
   - Kommentar im Code updaten (alte Begründung für rightmost-XFF entfernen, neue Begründung "nginx garantiert X-Real-IP; kein XFF-Fallback gegen spoof-Risk")
   - Neue Unit-Tests: `client-ip.test.ts` — nur X-Real-IP; kein XFF-Fallback; missing X-Real-IP → "unknown"

3. **`src/app/api/dashboard/alit/reorder/route.ts:44-48` — Error-Surface hardening**
   - Statt `err.message` (`"reorder: id 123 not found"`) generischen Fehler zurückgeben: `"Reorder fehlgeschlagen — ungültige ID-Liste"` mit Status 400.
   - Server-side `console.error` behält Detail für Debugging.

4. **`nginx/alit.conf` — Repo-Config aktualisieren UND auf Prod+Staging deployen**
   - Alle folgenden add_header-Direktiven **im server-Block UND in jedem `location /_next/static/` und `location /fonts/` wiederholen** (add_header Inheritance Trap, `patterns/deployment-nginx.md`).
   - HSTS: `add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;`
   - Permissions-Policy: `add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), interest-cohort=()" always;`
   - X-Frame-Options: `SAMEORIGIN` → `DENY`
   - Dotfile-Block auf Server-Ebene: `location ~ /\.(env|git|ht|DS_Store|svn)$ { deny all; return 404; }`
   - `client_max_body_size 55m;` im server-Block (matcht Prod-Realität, deckt 50-MB-Upload ab)
   - **Deployment-Schritt**: SSH auf hd-server, Repo-nginx.conf nach `/etc/nginx/sites-available/alit` kopieren/symlinken, `nginx -t`, `systemctl reload nginx`. Wenn Prod bereits abweichende Config hat: erst Diff prüfen, dann merge nach Repo-Zustand.
   - **Akzeptanz**: `curl -sI https://alit.hihuydo.com/` zeigt alle Security-Header. `curl -sI https://alit.hihuydo.com/_next/static/test.css` zeigt dieselben Security-Header (nicht nur Cache-Control).

5. **`.github/dependabot.yml` — NEU**
   - Ecosystem `npm`, Schedule weekly, Target branch `main`, PR-Label `dependencies`
   - Ecosystem `github-actions`, Schedule weekly
   - Ignoriert explizit `next` Major-Bumps (manuell, Breaking-Changes)

6. **`.github/workflows/deploy.yml` + `deploy-staging.yml` — 3rd-party Actions auf SHA pinnen**
   - `appleboy/ssh-action@v1` → `appleboy/ssh-action@<40-char-sha>` mit Kommentar `# v1.x` dahinter
   - Zur Zeit nur die eine 3rd-party Action, beide Workflows updaten

7. **`.husky/pre-commit` + `package.json` — gitleaks via husky**
   - `husky` als devDep, `"prepare": "husky"` Script
   - `.husky/pre-commit` startet `gitleaks protect --staged --redact` wenn gitleaks-Binary im PATH. Wenn nicht: Warning + exit 0 (nicht blockieren — gitleaks ist per-dev-machine installiert).
   - README-Schnipsel in `CLAUDE.md`/memory/project.md: "gitleaks local: `brew install gitleaks`"

#### PR 2 — Auth Hardening (high-risk, landed second)

8. **`src/lib/auth.ts` — bcrypt cost 10 → 12**
   - `hashPassword()`: cost-Parameter 10 → 12
   - `DUMMY_HASH` neu generieren mit cost 12 (sonst entsteht exakt das Timing-Oracle aus `patterns/auth.md`: legacy-cost-10-compare vs dummy-cost-12-compare)
   - `BCRYPT_ROUNDS` Env-Override nur für Tests (default 12, Tests setzen 4 für Speed)
   - Boot-Warning in `instrumentation.ts`: wenn `BCRYPT_ROUNDS < 12` und `NODE_ENV !== 'test'` → `console.warn`

9. **`src/lib/auth.ts` + `src/app/api/auth/login/route.ts` — Rehash-on-Login**
   - Nach erfolgreichem `verifyPassword()`, vor JWT-Sign: Cost des User-Hashes prüfen via `bcrypt.getRounds(hash)`. Bei `< 12` fire-and-forget Rehash mit neuem Cost + UPDATE admin_users.
   - Audit-Event `password_rehashed` on success, `rehash_failed` on error (kein throw, nur `.catch` + `console.error` + audit).
   - Tests: natürliche cost-12 Latenz beweist response-vor-DB-update strukturell (kein wall-clock sleep).

10. **Cookie `session` → `__Host-session` + Migration**
    - Cookie-Name kapseln in Helper `src/lib/auth-cookie.ts`:
      ```ts
      export const AUTH_COOKIE = process.env.NODE_ENV === "production" ? "__Host-session" : "session";
      export const AUTH_COOKIE_OPTS = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/" };
      ```
    - Alle 7 Cookie-Call-Sites switchen: login/logout/account GET+PUT, middleware, api-helpers, signups-audit.
    - In production: `secure` IMMER `true` (nicht optional — `__Host-` erfordert es).
    - **Keine Dual-Read-Migration** nötig: 1 Admin-User, geplante Re-Login-Invalidation akzeptabel. User wird explizit im Deploy-Verify-Step re-logged-in.
    - Tests: Roundtrip login → get cookie → middleware authentifiziert. Dev-Env ohne HTTPS nutzt nach wie vor `session`, Prod-Env nutzt `__Host-session`.

### Nice to Have (explizit Follow-up, NICHT dieser Sprint)

1. Logout: Server-side Invalidate via `tokens_invalidated_at` + `iat`-Check (Tier 1, größere Schema-Änderung)
2. Role-Check aus DB statt JWT (aktuell nur 1 Admin, keine Promote/Demote-Flows)
3. CSRF-Token für state-changing Requests (aktuell sameSite=strict reicht für 1-Origin-Dashboard)
4. Account-Enumeration auf Signup/Password-Reset vermeiden (Password-Reset-Flow existiert nicht)
5. CSP-Header (Tier 1, eigenes Projekt mit Nonce-Setup via Middleware)
6. Backup-Encryption + off-site Storage (Tier 2, Ops-Task)

### Out of Scope

- **Zod-Migration** — Findings nicht Sprint-Blocker, separater Sprint falls jemals nötig.
- **Alles Tier-1-und-höher** — nur T0 in diesem Sprint.
- **pg_hba.conf / DB-User / Backup-Drill / Branch-Protection** — manuell / extern, nicht im Repo.
- **nginx-Config-Drift-Reconciliation** (Prod hat evtl. weitere Direktiven die nicht im Repo stehen): wenn beim Deploy-Schritt Diff auffällt, als Follow-up in `memory/todo.md` loggen, nicht in diesem PR fixen.

## Technical Approach

### Files to Change (PR 1)

| File | Change | Description |
|---|---|---|
| `package.json` | Modify | Next.js 16.2.2→≥16.2.3, eslint-config-next mit. +husky devDep +prepare script |
| `pnpm-lock.yaml` | Modify | Regenerate via `pnpm install` |
| `src/lib/client-ip.ts` | Modify | XFF-Fallback raus, X-Real-IP-only, Kommentar update |
| `src/lib/client-ip.test.ts` | Create | Unit-Tests X-Real-IP, XFF-ignored, unknown |
| `src/app/api/dashboard/alit/reorder/route.ts` | Modify | Line 44-48 generischer Error |
| `nginx/alit.conf` | Modify | HSTS, Permissions-Policy, X-Frame DENY, Dotfile-Block, client_max_body_size, header-duplication in allen location-Blöcken |
| `.github/workflows/deploy.yml` | Modify | ssh-action@v1 → @<sha> |
| `.github/workflows/deploy-staging.yml` | Modify | ssh-action@v1 → @<sha> |
| `.github/dependabot.yml` | Create | npm weekly + github-actions weekly |
| `.husky/pre-commit` | Create | gitleaks-if-present |
| `.husky/_/.gitignore` | Create | Standard husky scaffolding |

### Files to Change (PR 2)

| File | Change | Description |
|---|---|---|
| `src/lib/auth.ts` | Modify | cost 10→12, DUMMY_HASH neu generieren mit cost 12, BCRYPT_ROUNDS env-override, rehash-on-login Helper |
| `src/app/api/auth/login/route.ts` | Modify | rehash-on-login call nach verifyPassword, Cookie-Helper nutzen |
| `src/app/api/auth/logout/route.ts` | Modify | Cookie-Helper nutzen |
| `src/app/api/dashboard/account/route.ts` | Modify | Cookie-Helper nutzen (read+write) |
| `src/middleware.ts` | Modify | Cookie-Helper nutzen (read) |
| `src/lib/api-helpers.ts` | Modify | Cookie-Helper nutzen (read) |
| `src/lib/signups-audit.ts` | Modify | Cookie-Helper nutzen (read) |
| `src/lib/auth-cookie.ts` | Create | AUTH_COOKIE + AUTH_COOKIE_OPTS |
| `src/lib/auth.test.ts` | Modify | Rehash-on-Login Tests, structural latency-proof |
| `src/app/api/auth/login/route.test.ts` | Create oder modify | Cookie-Name-Roundtrip-Test |
| `src/instrumentation.ts` | Modify | BCRYPT_ROUNDS<12 Boot-Warning |

### Architecture Decisions

**AD-1 — Zwei PRs statt einer.** Auth-Changes invalidieren Sessions und haben den breitesten Rollback-Blast-Radius (falsches Cookie-Flag = komplette Lockout). Infra-PR erst grün, dann Auth-PR auf sauberer Base. Codex-Runden-Budget pro PR wird nicht überstrapaziert (max 3 pro PR, Auth allein hat 3 Items mit edge cases).

**AD-2 — Cookie-Name conditional auf NODE_ENV, nicht dual-read.** Alternative wäre `__Host-session` lesen, fallback auf `session` für N Tage. Für 1 Admin-User übertrieben — plan re-login beim Deploy und fertig. Code bleibt einfacher.

**AD-3 — nginx-Config wird deployt, nicht nur geändert.** Das Repo-File ist bisher scheinbar nicht auto-deployt (Prod hat eigene Direktiven). Diesen Sprint nutzen wir, um die Drift aufzulösen: Repo wird Source-of-Truth, Prod wird daraus synced. Rollback-Plan: alter `/etc/nginx/sites-available/alit.conf.bak` vor dem Copy.

**AD-4 — Rehash-on-Login ist fire-and-forget.** Awaiten würde +400ms auf jeden Login mit cost 12. Residual-Oracle (legacy-cost User die noch nicht re-logged-in sind) bei 1-Admin-Setup null-Risk, weil der erste Login nach Deploy den einzigen legacy-Hash rehashed.

**AD-5 — Keine Dependabot Auto-Merge.** Wir wollen manuell reviewen + via Sonnet-Gate durch. Weekly Schedule + Label-Only.

### Dependencies

- **External**: gitleaks per-dev-machine (`brew install gitleaks`), husky npm package
- **Env**: `BCRYPT_ROUNDS` optional (default 12, test setzt 4)
- **Server-side**: SSH-Zugang hd-server für nginx-Reload; neue `admin_users.password` Hashes brauchen cost-12 storage (bcrypt speichert Cost im Hash-String, kein Schema-Change)
- **Breaking for users**: alle laufenden Admin-Sessions werden invalidiert bei Deploy von PR 2 (Cookie-Rename)

## Edge Cases

| Case | Expected Behavior |
|---|---|
| Admin loggt sich ein mit altem cost-10-Hash (Tag 1 post-deploy) | Login success, fire-and-forget Rehash committed cost-12 Hash, audit-event `password_rehashed`, keine zusätzliche Login-Latenz |
| Rehash-Query schlägt fehl (DB-Outage in fire-and-forget Window) | Login success (Token ausgestellt), `rehash_failed` im audit. Nächster Login retryt automatisch. |
| Admin ist seit Cost-Bump noch nie eingeloggt und versucht Password-Wrong mit Legacy-Email | Dummy-compare ist cost 12 (neuer DUMMY_HASH), legacy-Hash-compare ist cost 10 — Timing-Differenz ~250ms. **Residual-Oracle**. Für 1-Admin-Setup akzeptabel, wird durch ersten Real-Login geschlossen. |
| Dev-Env localhost:3000 (http) | Cookie-Name ist `session`, `secure: false`. __Host- wäre broken ohne HTTPS. |
| X-Real-IP fehlt (nginx-Misconfig / Direktzugriff auf :3100) | IP = "unknown", alle misrouted Requests teilen Rate-Limit-Bucket. Strenger als vorher, aber sicher. |
| nginx reload schlägt fehl (`nginx -t` zeigt Syntax-Error) | Rollback: `cp /etc/nginx/sites-available/alit.conf.bak /etc/nginx/sites-available/alit.conf && nginx -t && systemctl reload nginx`. Prod weiter auf alter Config. |
| Dependabot-PR merged ungeplant über Branch-Protection hinweg | Kann nicht passieren wenn Branch-Protection korrekt gesetzt (separater Ops-Task) — aber Dependabot-PRs brauchen review + Sonnet-Gate wie jede andere PR |
| Gitleaks nicht installiert auf dev-machine | Pre-commit hook zeigt Warning, exit 0. Check läuft später in CI (Follow-up). |

## Risks

- **Cookie-Rename sperrt bestehende Sessions aus.** Mitigation: Deploy in Wartungsfenster, sofortiger Re-Login vom Admin als Teil der Deploy-Verifikation. 1-User-Impact.
- **nginx-Drift zwischen Repo und Prod.** Beim Deploy-Schritt MUSS ein Diff gezogen werden vor dem Copy. Wenn Prod Direktiven hat die nicht im Repo stehen → Repo ergänzen, nicht überschreiben. Mitigation: explizit als Deploy-Verify-Step.
- **Rehash-on-Login race bei concurrent Logins.** Wenn Admin zweimal parallel logged-in würde (zwei Tabs) könnten beide versuchen zu rehashen — der zweite UPDATE ist no-op (idempotent). Kein Risk.
- **BCRYPT_ROUNDS in CI.** Tests müssen `BCRYPT_ROUNDS=4` setzen sonst 165 Tests werden spürbar langsamer. In `vitest.config.ts` / Test-Setup definieren.
- **Dependabot floods PR-List.** Weekly Schedule + Label-Only macht es überschaubar. Nach 2 Wochen reviewen ob Schedule passt.
- **Next.js 16.2.3+ minor regressions.** Patch-Release sollte safe sein, aber `pnpm test` + `pnpm build` + smoke-test alle Tabs im Dashboard sind Pflicht vor PR-Merge.

## Deployment-Verifikation (CLAUDE.md-Pflicht)

### PR 1 Staging
- [ ] `gh run watch` grün
- [ ] `curl -sI https://staging.alit.hihuydo.com/` zeigt HSTS + Permissions-Policy + X-Frame:DENY + Referrer-Policy + nosniff
- [ ] `curl -sI https://staging.alit.hihuydo.com/_next/static/<any>.css` zeigt dieselben Security-Header (header-duplication funktioniert)
- [ ] `curl -sI https://staging.alit.hihuydo.com/.env` → 404 (Dotfile-Block aktiv)
- [ ] `curl -sI https://staging.alit.hihuydo.com/.git/HEAD` → 404
- [ ] Upload-Test im Dashboard: 45 MB Video erfolgreich
- [ ] Rate-Limit-Smoke: 6 schnelle POST /api/signup/newsletter → 6. = 429
- [ ] `ssh hd-server 'docker compose -f /opt/apps/alit-website-staging/docker-compose.staging.yml logs --tail=50'` clean

### PR 1 Prod (nach Merge)
- [ ] Alle Staging-Checks auf `alit.hihuydo.com`
- [ ] Monitoring-Dashboard `/api/health/` grün (Monitor ID 11)
- [ ] SSL-Labs-Scan `https://www.ssllabs.com/ssltest/?d=alit.hihuydo.com` zeigt A oder A+ (HSTS preload erkannt)

### PR 2 Staging
- [ ] Admin-Login auf Staging, Cookie in DevTools heißt `__Host-session`, flags: HttpOnly + Secure + SameSite=Strict + Path=/
- [ ] `ssh hd-server 'docker exec alit-staging-postgres psql -U alit_staging -d alit_staging -c "SELECT substring(password, 1, 7) FROM admin_users"'` zeigt `$2a$12$` oder `$2b$12$`
- [ ] Audit-Table: `SELECT event, details FROM audit_events WHERE event IN ('password_rehashed', 'rehash_failed') ORDER BY created_at DESC LIMIT 5` — exakt 1 `password_rehashed`, 0 `rehash_failed`
- [ ] Logout invalidiert Cookie (Browser-DevTools Cookie gone)
- [ ] Login mit falschem Passwort zeigt generischen Error, Response-Time stabil ~450ms (cost-12)

### PR 2 Prod (nach Merge)
- [ ] Re-Login auf Prod funktioniert
- [ ] DB-Spot-Check: Admin-Hash ist `$2a$12$` oder `$2b$12$`
- [ ] Audit-Log: `password_rehashed` count = 1, `rehash_failed` count = 0

**⛔ Done-Meldung gesperrt bis alle Checks grün sind (CLAUDE.md Deploy-Verifikation-Sektion).**
