# Spec: T0-Security-Hardening Sprint — Infra & Quick Wins
<!-- Created: 2026-04-17 -->
<!-- Author: Planner (Claude Opus 4.7) -->
<!-- Status: v2 — Auth-PR herausgesplittet nach Codex-Spec-Review, adressiert PR-1-in-scope Findings (C1/C3/CR1/S1/N1) -->
<!-- Previous: v1 enthielt PR 1 + PR 2 in einem Sprint, Codex [Contract]-Finding "shared Staging+Prod DB" zeigte dass PR 2 eigene Planungsrunde braucht -->

## Summary

Schließt die Infra-Seite der offenen Tier-0-Punkte aus `memory/security.md`: nginx-Security-Header, Next.js-CVE-Patch, CI-Hygiene, IP-Extraktion, Error-Surface-Fix.

**Auth-Hardening (bcrypt cost-bump + Rehash-on-Login + `__Host-` cookie) ist bewusst aus diesem Sprint rausgeschnitten** — Codex-Spec-Review hat aufgedeckt dass das shared Staging+Prod-DB-Setup die geplante Verifikations-Strategie strukturell bricht (ein Staging-Login rehashed bereits den einzigen Admin-Hash für Prod). Auth bekommt eigenen Sprint mit eigener Verifikations-Strategie.

**Blast-Radius dieses Sprints**: low-risk. nginx-Config-Changes sind reversibel via Backup, Next.js-Patch-Release, Config-Files only. Kein Session-Invalidation-Risk.

## Context

- Tier-0-Audit am 2026-04-17 gegen `memory/security.md` zeigte 13 FAIL + 5 PARTIAL. Dieser Sprint adressiert 10 davon (alle bis auf die 3 Auth-Items).
- `nginx/alit.conf` im Repo hat bereits minimal-Security-Header (X-Frame, nosniff, Referrer-Policy), aber keine HSTS, Permissions-Policy, Dotfile-Block. Headers werden in child-`location`-Blöcken nicht wiederholt → Inheritance-Trap aktiv (`patterns/deployment-nginx.md`).
- Staging (`staging.alit.hihuydo.com`) hat bisher kein eigenes nginx-File im Repo. Dieser Sprint führt `nginx/alit-staging.conf` als neue Source-of-Truth ein.
- `src/lib/client-ip.ts` hat XFF-Fallback — `signup-client-ip.ts` hat ihn schon korrekterweise nicht. Dieser Sprint alignt die beiden.
- Codex-Spec-Review-Findings sind in `tasks/codex-spec-review.md` dokumentiert. PR-1-in-scope Findings sind in diese v2-Spec eingearbeitet.

### Codex-Findings die in v2 addressed werden

| Finding | Lösung in v2 |
|---|---|
| [Contract] Done-Kriterien-Count mismatch | In dieser Spec & todo.md: einheitliche 15 Kriterien, keine vorweggenommene Zahl im Summary |
| [Contract] nginx-staging Config fehlt im Repo | Neuer File `nginx/alit-staging.conf` in Files-to-Change, mit X-Robots-Tag noindex + identischen Security-Headern |
| [Correctness] Dotfile-Regex matched `/.git/HEAD` nicht | Regex geändert: `/\.(env\|git\|ht\|DS_Store\|svn)(/\|$)` — anchored am ersten Pfad-Segment, matched auch Unterpfade |
| [Security] nginx-Rollout-Gap | Explicit gemacht: nginx-Sync ist **Pre-Merge-Checkpoint** (Staging + Prod beide gesynct bevor Container-PR merged), Residual-Risk-Window = Sekunden statt Minuten |
| [Nice-to-have] SSL-Labs als Hard-Gate | Aus Done-Kriterien raus, in memory/todo.md als Ops-Follow-up |

### Codex-Findings die in den nächsten Sprint verschoben werden

- [Contract] Shared Staging+Prod DB → PR 2 braucht neue Verifikations-Strategie (z.B. DB-Spot-Check nach jedem Rehash-Step statt Env-weiter Audit-Count)
- [Correctness] Rehash-Race `rowCount === 1` Gate
- [Correctness] `login()` Signature für Rehash-Hook
- [Security] DUMMY_HASH dynamisch aus Round-Config
- [Architecture] Audit-Layer-Events (`password_rehashed` / `rehash_failed`) in `src/lib/audit.ts` erweitern
- [Architecture] `auth-cookie.ts` als Edge-safe Leaf-Modul

→ Next-Sprint-Pointer in `memory/todo.md` mit Referenz auf `tasks/codex-spec-review.md`.

### Audit-Findings die NICHT adressiert werden

| Finding | Warum raus |
|---|---|
| `/api/dashboard/account` GET rate-limit | Audit-Fehler: GET ist bereits nicht rate-limited |
| Zod-Migration | Custom-Validatoren voll getestet |
| DB-Pool-Max, pg_hba, DB-User, Backup-Drill | Ops-Tasks, nicht im Repo |
| Branch-Protection, GitHub Secret-Scanning | Manuell im GitHub-UI |

## Requirements

### Must Have (Sprint Contract)

1. **Next.js 16.2.2 → ≥16.2.3** (HIGH CVE DoS Server Components)
   - `package.json` + `pnpm-lock.yaml` updated
   - `eslint-config-next` auf gleiche Version
   - `pnpm build` + `pnpm test` grün
   - `pnpm audit --prod` zeigt 0 HIGH/CRITICAL

2. **`src/lib/client-ip.ts` — XFF-Fallback entfernen**
   - Nur `X-Real-IP`, sonst `"unknown"`. Verhält sich wie `signup-client-ip.ts` bereits tut.
   - Kommentar im Code updaten (Begründung "nginx garantiert X-Real-IP; kein XFF-Fallback gegen spoof-Risk").
   - Neue Unit-Tests `client-ip.test.ts` — 3 Cases: X-Real-IP hit, XFF-only ignored, beide fehlen → "unknown".

3. **`src/app/api/dashboard/alit/reorder/route.ts:44-48` — Error-Surface hardening**
   - Statt `err.message` (`"reorder: id 123 not found"`) generischen Fehler: `"Reorder fehlgeschlagen — ungültige ID-Liste"` mit Status 400.
   - Server-side `console.error` behält Detail für Debugging.

4. **`nginx/alit.conf` — Prod-Config hardening**
   - Alle folgenden Security-Header im server-Block UND wiederholt in `/_next/static/` + `/fonts/`-Blöcken (add_header Inheritance Trap).
   - HSTS: `add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;`
   - Permissions-Policy: `add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), interest-cohort=()" always;`
   - X-Frame-Options: `SAMEORIGIN` → `DENY`
   - Dotfile-Block auf Server-Ebene: `location ~ /\.(env|git|ht|DS_Store|svn)(/|$) { deny all; return 404; }` — **`(/|$)` matched `/.git`, `/.git/HEAD`, `/.env`, `/.env/anything`** (Codex CR1 fix).
   - `client_max_body_size 55m;` im server-Block (matcht Prod-Realität).

5. **`nginx/alit-staging.conf` — NEU, Staging-Config als Repo-Source-of-Truth**
   - Mirror von `alit.conf` mit gleichen Security-Headern + Dotfile-Block + client_max_body_size.
   - Zusätzlich: `add_header X-Robots-Tag "noindex, nofollow" always;` im server-Block + wiederholt in allen location-Blöcken (komplementiert `src/app/robots.ts` staging-mode).
   - `server_name staging.alit.hihuydo.com;`
   - `proxy_pass http://127.0.0.1:3102;` (staging-Port aus `memory/project.md`).
   - SSL via `/etc/letsencrypt/live/staging.alit.hihuydo.com/`.

6. **nginx-Deploy als Pre-Merge-Checkpoint** (Codex S1 fix)
   - Reihenfolge: (a) Feature-Branch push → Staging-Container-Deploy läuft → (b) manuell SSH auf hd-server, `nginx/alit-staging.conf` → `/etc/nginx/sites-available/alit-staging`, `nginx -t`, `systemctl reload nginx`, (c) curl-Header-Checks auf Staging → (d) PR öffnen → (e) Codex-Review → (f) **VOR Merge**: `nginx/alit.conf` → `/etc/nginx/sites-available/alit`, `nginx -t`, `systemctl reload nginx` (Prod-nginx pre-merged), (g) dann Merge → Container-Deploy auf Prod.
   - Residual-Risk-Window: zwischen (f) und (g) laufen neue Headers + alter Container-Code. Neues Container-Image hat keine Code-Abhängigkeit zu den Headers → risikofrei.
   - Fallback wenn (f) `nginx -t` failed: alte Config bleibt aktiv, PR wird nicht gemerged.
   - Rollback nach (g) wenn Prod crasht: `cp /etc/nginx/sites-available/alit.bak /etc/nginx/sites-available/alit && nginx -t && systemctl reload nginx` + Container-Rollback auf vorherigen SHA.

7. **`.github/dependabot.yml` — NEU**
   - Ecosystem `npm`, weekly, target `main`, label `dependencies`
   - Ecosystem `github-actions`, weekly
   - Ignoriert explizit `next` Major-Bumps (manuell, Breaking-Changes)

8. **`.github/workflows/deploy.yml` + `deploy-staging.yml` — 3rd-party Actions auf SHA pinnen**
   - `appleboy/ssh-action@v1` → `appleboy/ssh-action@<40-char-sha>  # v1.2.x` in beiden Workflows.

9. **`.husky/pre-commit` + `package.json` — gitleaks via husky**
   - `husky` als devDep, `"prepare": "husky"` Script.
   - `.husky/pre-commit` startet `gitleaks protect --staged --redact` wenn Binary im PATH. Sonst: Warning + exit 0 (nicht blockieren — gitleaks ist per-dev-machine installiert).

### Nice to Have (explizit Follow-up, NICHT dieser Sprint)

1. nginx-Config als include-Pattern refactoren (`nginx/security-headers.conf` shared zwischen alit.conf + alit-staging.conf) — aktuell Duplikation akzeptabel für 2 Files, refactor lohnt sich erst bei 3+ Envs.
2. nginx-Reload via CI/CD statt manuell (deploy-user brauchte dann sudoers-Eintrag `NOPASSWD: /usr/sbin/nginx -t, /bin/systemctl reload nginx`).
3. SSL-Labs-Scan A/A+ als periodische Ops-Verifikation (wöchentlich manuell oder via monitor) — **kein Repo-Contract-Kriterium** (Codex N1).
4. CSP-Header (Tier 1, eigenes Projekt mit Nonce-Middleware).

### Out of Scope

- Komplette Auth-Hardening-Items (bcrypt cost, rehash-on-login, `__Host-` cookie) — nächster Sprint.
- Tier-1+: CSP, Session-Rotation, Logout-Invalidate, CSRF.
- pg_hba, DB-User, Backup-Drill, Branch-Protection — Ops/UI-Tasks, nicht Repo.
- nginx-Config-Drift-Reconciliation beim Deploy: wenn beim SSH-Diff auf hd-server Direktiven in Prod stehen die nicht im Repo sind → im selben Commit ergänzen (ist dann kein Scope-Creep, sondern explizite Source-of-Truth-Konsolidierung).

## Technical Approach

### Files to Change

| File | Change | Description |
|---|---|---|
| `package.json` | Modify | Next.js 16.2.2→≥16.2.3, eslint-config-next, husky devDep, prepare script |
| `pnpm-lock.yaml` | Modify | Regen via `pnpm install` |
| `src/lib/client-ip.ts` | Modify | XFF-Fallback raus, Kommentar update |
| `src/lib/client-ip.test.ts` | Create | 3 Tests |
| `src/app/api/dashboard/alit/reorder/route.ts` | Modify | Generischer Error statt err.message |
| `nginx/alit.conf` | Modify | HSTS, Permissions-Policy, X-Frame DENY, Dotfile-Block mit korrigiertem Regex, client_max_body_size, Security-Header in jedem location-Block |
| `nginx/alit-staging.conf` | Create | Mirror + X-Robots-Tag noindex + staging-Hostname/Port |
| `.github/workflows/deploy.yml` | Modify | ssh-action@v1 → @<sha> |
| `.github/workflows/deploy-staging.yml` | Modify | ssh-action@v1 → @<sha> |
| `.github/dependabot.yml` | Create | npm weekly + github-actions weekly |
| `.husky/pre-commit` | Create | gitleaks-if-present |
| `.husky/_/` | Create | husky scaffolding (`pnpm prepare` generiert) |

### Architecture Decisions

**AD-1 — Auth in separatem Sprint.** Codex-Review hat strukturelle Incompatibility zwischen "Staging+Prod teilen DB" (dokumentiert in `memory/lessons.md`) und geplantem "PR 2 Verifikation pro Env" aufgedeckt. Auth-Hardening bekommt eigene Planungsrunde mit angepasster Verifikations-Strategie (vermutlich: DB-Spot-Check nach jedem Staging-Step + Prod-Check ist dann no-op weil Hash bereits rehashed).

**AD-2 — 2 nginx-Files statt Include-Pattern.** Include-Pattern (`security-headers.conf` shared) ist eleganter aber für 2 Envs overkill. Akzeptable Duplikation, Refactor-Todo für später.

**AD-3 — nginx-Reload als Pre-Merge-Checkpoint.** Alternative wäre CI-integrierter nginx-Reload via sudoers-NOPASSWD, aber das erfordert Server-Setup-Änderung außerhalb des Repos. Für diesen Sprint manueller Pre-Merge-Step ausreichend, CI-Integration ist Nice-to-Have Follow-up.

**AD-4 — Dotfile-Regex `(/|$)` statt nur `$`.** `$` alleine ankert am Request-URI-Ende → `/.git/HEAD` matched nicht (Codex CR1). `(/|$)` matched auch Pfade innerhalb geblockter Dotdirs. Getestet via `curl` Smoke-Tests in Done-Kriterien.

### Dependencies

- **Server-side**: SSH-Zugang hd-server für nginx-Sync; `/etc/nginx/sites-available/alit` + `/etc/nginx/sites-available/alit-staging` als Target-Pfade
- **gitleaks** per-dev-machine optional (`brew install gitleaks`)
- **husky** als npm devDep
- Keine DB-Changes, keine Session-Invalidation, keine Env-Variable-Changes

## Edge Cases

| Case | Expected Behavior |
|---|---|
| `nginx -t` failed nach Config-Copy | Config-Datei bleibt auf .bak, alte Config weiter aktiv, PR wird nicht gemerged, Fehler in Deploy-Verify protokolliert |
| Prod hat zusätzliche Direktiven die nicht im Repo stehen (Rate-Limit, Cache-Regel) | Diff-Step beim Deploy findet sie → Repo-Config ergänzen VOR Copy → nginx bleibt konsistent |
| Staging-Container ist rot (vor diesem Sprint bereits) | nginx-Sync läuft unabhängig, Container-Status nicht blockierend für nginx-Deploy |
| Dependabot-PR merged ohne Review | Branch-Protection greift (Ops-Task) — aber Dependabot-PRs laufen eh durch Sonnet-Gate + CI, kein Auto-Merge in diesem Projekt |
| Gitleaks nicht installiert auf dev-machine | Pre-commit zeigt Warning, exit 0. Kein Block. |
| X-Real-IP fehlt (nginx-Misconfig / Direktzugriff auf :3100) | IP = "unknown", rate-limit-Bucket geteilt. Strenger als vorher, sicher. |
| dev-machine wird nach Sprint auf neue Next.js-Version upgradet | `pnpm install` ausreichend, keine Breaking-Changes in 16.2.3-Patch |

## Risks

- **nginx-Drift Prod↔Repo**: Wenn Prod manuelle Direktiven hat die nicht im Repo stehen → Diff-Step beim Deploy fängt es. Aber wenn jemand die Repo-Config blind `cp`t ohne Diff: Prod-Regression. Mitigation: explicit Diff-Schritt in todo.md PR 1 Phase 1c.
- **Pre-Merge-Gap** (Codex S1 residual): kurzes Fenster zwischen nginx-Reload und Container-Merge — neue Headers + alter Code. Akzeptabel weil Headers container-code-unabhängig sind.
- **Next.js 16.2.3 Regression**: Patch-Release sollte safe sein. Mitigation: `pnpm test` + `pnpm build` + dev-server smoke-test aller Dashboard-Tabs.
- **Dependabot-PR-Flood**: Weekly + label-only + ignore next-major hält es überschaubar. Nach 2 Wochen reviewen.

## Deployment-Verifikation (CLAUDE.md-Pflicht)

### Staging (nach Phase 1a-1d + nginx-Sync)
- [ ] `gh run watch` grün (Container-Deploy via deploy-staging.yml)
- [ ] `ssh hd-server "nginx -t"` OK
- [ ] `curl -sI https://staging.alit.hihuydo.com/` zeigt: HSTS + Permissions-Policy + X-Frame:DENY + Referrer-Policy + nosniff + X-Robots-Tag:noindex
- [ ] `curl -sI https://staging.alit.hihuydo.com/_next/static/<any>.css` zeigt **dieselben** Security-Header (inheritance-Fix verifiziert)
- [ ] `curl -sI https://staging.alit.hihuydo.com/.env` → 404
- [ ] `curl -sI https://staging.alit.hihuydo.com/.git/HEAD` → 404 (Codex CR1 fix)
- [ ] Upload-Test: 45 MB Video im Dashboard-Medien-Tab erfolgreich
- [ ] `ssh hd-server 'docker compose -f /opt/apps/alit-website-staging/docker-compose.staging.yml logs --tail=50'` clean

### Prod (nach Merge + nginx-Sync PRE-Merge verifiziert)
- [ ] **Pre-Merge**: `ssh hd-server "nginx -t"` OK nach Prod-Config-Copy
- [ ] **Pre-Merge**: `curl -sI https://alit.hihuydo.com/` zeigt alle 5 Security-Header (Container noch alt, Headers schon neu — sanity-check der nginx-Seite)
- [ ] **Post-Merge**: `gh run watch` grün
- [ ] `curl -sI https://alit.hihuydo.com/` zeigt alle 5 Security-Header
- [ ] `curl -sI https://alit.hihuydo.com/_next/static/<any>.css` zeigt dieselben Header
- [ ] `curl -sI https://alit.hihuydo.com/.env` → 404
- [ ] `curl -sI https://alit.hihuydo.com/.git/HEAD` → 404
- [ ] `/api/health/` grün (Monitor ID 11 nicht rot)
- [ ] `ssh hd-server 'docker compose -f /opt/apps/alit-website/docker-compose.yml logs --tail=50'` clean

**⛔ Done-Meldung gesperrt** bis alle Staging + Prod Checks grün sind.

## Next Sprint (nicht Teil dieses Contracts)

**Sprint: T0-Auth-Hardening** — bcrypt cost 10→12 + Rehash-on-Login, `__Host-` cookie migration.

Scope für Planner der nächsten Runde:
- 6 Codex-Findings aus `tasks/codex-spec-review.md`:
  - [Contract] Shared DB → Verifikations-Strategie (DB-Spot-Check statt Env-wise Audit-Count)
  - [Correctness] Rehash `rowCount === 1` Gate
  - [Correctness] `login()` Signature-Change oder Rehash-IN-login()
  - [Security] DUMMY_HASH dynamisch aus Round-Config
  - [Architecture] `audit.ts` Event-Map erweitern um `password_rehashed` + `rehash_failed`
  - [Architecture] `auth-cookie.ts` als Edge-safe Leaf-Modul explizit dokumentiert
- Referenz: `memory/todo.md` Pointer
