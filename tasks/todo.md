# Sprint: T0-Security-Hardening — Infra & Quick Wins
<!-- Spec: tasks/spec.md v2 -->
<!-- Started: 2026-04-17 (gesplittet aus v1 nach Codex-Spec-Review) -->

## Done-Kriterien

> Alle **15** müssen PASS sein bevor der Sprint als fertig gilt.

### Code (9)
- [ ] `pnpm audit --prod` zeigt 0 HIGH/CRITICAL (Next.js auf ≥16.2.3)
- [ ] `pnpm build` + `pnpm test` grün (165+ Tests, neue client-ip Tests dazu)
- [ ] `src/lib/client-ip.ts` hat keinen XFF-Fallback mehr (grep `x-forwarded-for` im File → 0 matches)
- [ ] `src/app/api/dashboard/alit/reorder/route.ts` returnt generischen Error, nicht mehr `err.message`
- [ ] `nginx/alit.conf` hat HSTS + Permissions-Policy + X-Frame:DENY + Dotfile-Block-mit-`(/|$)`-Regex + `client_max_body_size 55m;`
- [ ] Alle 3 location-Blöcke in `nginx/alit.conf` wiederholen die 5 Security-Header
- [ ] `nginx/alit-staging.conf` existiert mit Mirror-Config + X-Robots-Tag noindex
- [ ] `.github/dependabot.yml` existiert mit npm + github-actions schedules
- [ ] `.github/workflows/deploy.yml` + `deploy-staging.yml` nutzen SHA-gepinnte `appleboy/ssh-action`
- [ ] `.husky/pre-commit` existiert, triggert gitleaks wenn installiert, sonst no-op

### Staging (3)
- [ ] `curl -sI https://staging.alit.hihuydo.com/` zeigt HSTS + Permissions-Policy + X-Frame:DENY + Referrer-Policy + nosniff + X-Robots-Tag:noindex
- [ ] `curl -sI https://staging.alit.hihuydo.com/_next/static/<file>.css` zeigt dieselben 6 Header (Inheritance-Fix)
- [ ] `curl -sI https://staging.alit.hihuydo.com/.git/HEAD` → 404 **UND** `.../.env` → 404 (Codex CR1 fix)

### Prod (3)
- [ ] `curl -sI https://alit.hihuydo.com/` zeigt alle 5 Security-Header
- [ ] `curl -sI https://alit.hihuydo.com/.git/HEAD` → 404 **UND** `.../.env` → 404
- [ ] `/api/health/` grün (Monitor ID 11 nicht rot) + `docker logs --tail=50` clean

## Tasks

### Phase 1a: Dependency Upgrade (zuerst — reduziert Merge-Konflikte)
- [ ] `pnpm add next@^16.2.3 eslint-config-next@^16.2.3`
- [ ] `pnpm test` + `pnpm build` grün
- [ ] `pnpm audit --prod` zeigt 0 HIGH/CRITICAL
- [ ] Smoke-test dev-server: alle 6 Dashboard-Tabs + public Homepage rendern

### Phase 1b: App-Code Changes
- [ ] `src/lib/client-ip.ts` XFF-Fallback entfernen, Kommentar update
- [ ] `src/lib/client-ip.test.ts` neu: 3 Tests (X-Real-IP hit, XFF-only ignored, beide fehlen → "unknown")
- [ ] `src/app/api/dashboard/alit/reorder/route.ts:44-48` generischer 400 Error, `console.error` behält Detail

### Phase 1c: nginx Configs (Repo-Files)
- [ ] `nginx/alit.conf` editieren:
  - HSTS im server{} add_header
  - Permissions-Policy im server{} add_header
  - X-Frame-Options DENY (ersetzt SAMEORIGIN)
  - Dotfile-Block als erstes `location ~ /\.(env|git|ht|DS_Store|svn)(/|$) { deny all; return 404; }`
  - `client_max_body_size 55m;` im server{}
  - Alle 5 security-headers in `/_next/static/` UND `/fonts/` Blöcken wiederholen
- [ ] `nginx/alit-staging.conf` anlegen:
  - Kopie von alit.conf mit `server_name staging.alit.hihuydo.com`, SSL-Pfad für staging, `proxy_pass http://127.0.0.1:3102`
  - Zusätzlich `add_header X-Robots-Tag "noindex, nofollow" always;` im server{} + jedem location{}
- [ ] Syntax-Check lokal: `docker run --rm -v $(pwd)/nginx:/etc/nginx/sites-enabled nginx:alpine nginx -t -c /etc/nginx/nginx.conf` (quick sanity)

### Phase 1d: CI / Dev-Hygiene
- [ ] `.github/dependabot.yml` anlegen (npm weekly + github-actions weekly + ignore next major)
- [ ] `appleboy/ssh-action@v1` SHA ermitteln (`gh api repos/appleboy/ssh-action/releases/tags/v1.2.2 --jq .target_commitish` o.ä.)
- [ ] Beide deploy-Workflows auf `@<40-char-sha>  # v1.2.x` umstellen
- [ ] `pnpm add -D husky`
- [ ] `package.json` scripts: `"prepare": "husky"`
- [ ] `pnpm prepare` einmal lokal ausführen
- [ ] `.husky/pre-commit` Inhalt:
  ```bash
  #!/bin/sh
  if command -v gitleaks >/dev/null 2>&1; then
    gitleaks protect --staged --redact
  else
    echo "⚠️  gitleaks not installed — skipping secret scan. Install via 'brew install gitleaks'."
  fi
  ```
- [ ] `chmod +x .husky/pre-commit`

### Phase 1e: Staging-Deploy + Verify
- [ ] Feature-branch push → Container-Deploy via deploy-staging.yml
- [ ] `gh run watch` grün
- [ ] **SSH hd-server**: Diff aktueller `/etc/nginx/sites-available/alit-staging` (falls existiert) vs. neue Repo-Datei. Drift ergänzen ODER als Follow-up in `memory/todo.md` loggen.
- [ ] **SSH hd-server**: Backup alter staging-Config: `cp /etc/nginx/sites-available/alit-staging /etc/nginx/sites-available/alit-staging.bak` (falls existiert, sonst skip)
- [ ] **SSH hd-server**: Neue Config kopieren: `cp <repo>/nginx/alit-staging.conf /etc/nginx/sites-available/alit-staging`
- [ ] **SSH hd-server**: Symlink prüfen: `ls -la /etc/nginx/sites-enabled/ | grep alit-staging` → falls fehlt: `ln -s /etc/nginx/sites-available/alit-staging /etc/nginx/sites-enabled/`
- [ ] **SSH hd-server**: `nginx -t` → OK
- [ ] **SSH hd-server**: `systemctl reload nginx`
- [ ] Staging-Verifikation (alle 3 Staging Done-Kriterien)

### Phase 1f: PR + Codex-Review + Pre-Merge nginx-Prod-Deploy
- [ ] PR öffnen → Codex-Review 1× (max 3 Runden laut CLAUDE.md)
- [ ] Findings in-scope fixen → re-push → re-verify Staging
- [ ] Out-of-scope Findings in `memory/todo.md` loggen
- [ ] **VOR Merge**: SSH hd-server, Diff + Backup + Copy + `nginx -t` + reload für Prod-Config (`alit.conf`)
- [ ] **Pre-Merge-Sanity**: `curl -sI https://alit.hihuydo.com/` zeigt neue Security-Header (Container noch alt, das ist OK)
- [ ] Wenn alles grün: Merge-Button → Container-Deploy auf Prod via deploy.yml

### Phase 1g: Prod-Verify (nach Merge)
- [ ] `gh run watch` grün
- [ ] Prod-Verifikation (alle 3 Prod Done-Kriterien)
- [ ] Sprint-Abschluss in `memory/project.md` updaten

## Notes

- **Patterns referenzieren**:
  - `patterns/deployment-nginx.md` — add_header Inheritance Trap (in ALLEN location-Blöcken wiederholen)
  - `patterns/workflow.md` — Sonnet post-commit pre-impl false-positive (nach Implementation Status-Line-Bump in spec.md → re-commit triggert re-evaluation gegen Code)

- **Audit-Findings die NICHT adressiert werden** — Generator bitte NICHT fixen:
  - `/api/dashboard/account` GET Rate-Limit — bereits korrekt
  - Zod-Migration — bewusst behalten
  - Bcrypt cost-bump, rehash-on-login, `__Host-` cookie — **nächster Sprint**
  - DB Pool Max, Branch-Protection, pg_hba — Ops-Tasks

- **nginx-Drift-Risk**: Wenn beim SSH-Diff auf hd-server Direktiven in Prod stehen die nicht im Repo sind (Rate-Limits, Cache-Regeln) — Repo ergänzen statt überschreiben. Nicht blind `cp` ausführen.

- **Codex-Findings für nächsten Sprint** (Auth-Hardening): in `memory/todo.md` als Next-Sprint-Pointer. Inkl. Staging+Prod-DB-Shared-Verifikations-Strategie, rehash-race, login-Signature, DUMMY_HASH-dynamisch, audit-events-erweitern, auth-cookie-edge-safe.
