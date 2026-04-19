# alit-website — Security Checklist
# Copied from ../../checklists/security.md on 2026-04-15
# Last project update: 2026-04-18 — T0 ist effektiv komplett (44/45 Must-Have + alle Quick-Wins). Delta seit 2026-04-17: PR #69 bcrypt cost 12 + Rehash-on-Login, PR #71 `__Host-session` + Dual-Verify, PR #76 sameSite=lax hotfix (iOS Safari pull-to-refresh), PR #79 JWT_SECRET fail-fast, PR #80 SVG-Icons. Ops-Follow-ups 2026-04-18: Branch-Protection aktiv, Secret-Scanning + Push-Protection aktiv, daily Backup-Cron + Restore-Drill verified, DB-REVOKE CREATE ON DATABASE, chmod 600 auf `.env`-Files, JWT_SECRET + IP_HASH_SALT gesplittet staging ↔ prod. SSH + fail2ban + unattended-upgrades live-verifiziert (alle aktiv). UFW bewusst weg (Hetzner Cloud-FW upstream, siehe patterns/deployment-hetzner.md). Verbleibend: **DOMPurify-Audit** (RichTextEditor hat eigenen sanitizeHtml — Low-Risk Audit-Item) + **Zod** (out-of-scope by design) + **Tier-1 CSP strict** als Sprint D queued + **Tier-2 Docker non-root** als Sprint E queued.
# Bei Änderungen am Master-Template manuell diffen und übernehmen.

---

# Security Checklist
# Path: 00 Vibe Coding/checklists/security.md
# Last updated: 2026-04-15

> **Wie verwenden:**
> Bei jedem neuen Projekt diese Datei als Template in `<project>/memory/security.md` kopieren und Punkte abhaken.
> **Tier 0** muss komplett `[x]` sein bevor das Projekt deploybar ist.
> Höhere Tiers werden Trigger-basiert aktiviert (siehe Tabelle „Wann hochziehen" am Ende).
>
> **Priorität pro Punkt** (zur Triage innerhalb eines Tiers):
> - **[Must Have]** — non-negotiable, ohne das ist der Tier nicht erfüllt
> - **[Quick Win]** — kleiner Aufwand (5–30 min), hoher Sicherheitsgewinn
> - **[Nice to Have]** — sinnvoll, kann später nachgezogen werden
>
> **Verhältnis zu `patterns/`:**
> Diese Checkliste ist die Pflicht-Spalte (was, wann, wie wichtig). Patterns entstehen ORGANISCH aus Learnings beim tatsächlichen Umsetzen — also: erst Punkt umsetzen + abhaken, dann ggf. ein Pattern schreiben wenn beim Umsetzen ein Gotcha auftaucht. Nicht andersrum.

---

## Tier 0 — Pflicht ab Tag 1

Trigger: Projekt geht online (auch reine Side Projects, auch wenn nur du selbst zugreifst).

### Server / Edge

- [x] **[Must Have]** HTTPS only via certbot (Let's Encrypt), HTTP→HTTPS Redirect, kein Mixed Content — `nginx/alit.conf` + `nginx/alit-staging.conf` mit certbot-managed SSL, port 80 redirected via `if ($host = …) { return 301 https://… }`
- [x] **[Must Have]** TLS 1.2+ (Mozilla SSL Config Generator, Profil „intermediate") — `include /etc/letsencrypt/options-ssl-nginx.conf` (certbot-managed intermediate)
- [x] **[Must Have]** SSH: `PermitRootLogin no`, `PasswordAuthentication no`, key-only — live-verified 2026-04-18: `sshd -T` zeigt `permitrootlogin without-password` (prohibit-password, pragmatisches T0 per patterns/deployment-hetzner.md), `passwordauthentication no`, `pubkeyauthentication yes`
- [x] **[Must Have]** `fail2ban` aktiv für SSH — live-verified 2026-04-18: 4 jails active (sshd, nginx-http-auth, nginx-limit-req, dashboard-auth)
- [x] **[Must Have]** Firewall — **UFW bewusst weg** per `patterns/deployment-hetzner.md`: Hetzner Cloud-FW upstream VPS OS (managed via console/`hcloud` CLI) ist die kanonische Layer. UFW auf Cloud-VPS mit Provider-FW = redundant + Docker-FORWARD-Breakage-Risk. Erfüllt den Must-Have-Spirit (Default-Deny + nur 22/80/443 offen) auf einer anderen Layer.
- [x] **[Quick Win]** `unattended-upgrades` für `-security` Repo + Auto-Reboot in Wartungsfenster — live-verified 2026-04-18: systemd-unit active, `Unattended-Upgrade::Automatic-Reboot "true"` + `-WithUsers "true"` + `-Time "03:30"`
- [x] **[Quick Win]** nginx Dotfile-Block global: `location ~ /\.(env|git|ht|DS_Store|svn) { deny all; return 404; }` — PR #62. Regex `(/|$)` verwendet (nicht nur `$`) um auch Unterpfade wie `/.git/HEAD` zu fangen (siehe `patterns/deployment-nginx.md`)
- [x] **[Quick Win]** Security Header `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` — PR #62
- [x] **[Quick Win]** Security Header `X-Content-Type-Options: nosniff` — war schon vor PR #62 gesetzt
- [x] **[Quick Win]** Security Header `X-Frame-Options: DENY` (oder via CSP `frame-ancestors 'none'`) — PR #62 (upgrade von `SAMEORIGIN`)
- [x] **[Quick Win]** Security Header `Referrer-Policy: strict-origin-when-cross-origin` — war schon vor PR #62 gesetzt
- [x] **[Quick Win]** Security Header `Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()` — PR #62
- [x] **[Must Have]** Header in ALLEN `location`-Blöcken wiederholen — `add_header` wird in nginx nicht vererbt sobald ein child block selbst ein `add_header` setzt (→ `patterns/deployment-nginx.md`) — unsere nginx-Configs haben **single `location /`** ohne eigene `add_header` → Inheritance funktioniert sauber, keine Duplikation nötig (PR #62 Architektur-Entscheidung nach Server-Style-Match, siehe memory/lessons.md)

### Auth / Sessions

- [x] **[Must Have]** Passwörter mit bcrypt (cost ≥12), niemals MD5/SHA1/selbstgebaut — erledigt in PR #69 (2026-04-17): cost 10 → 12 via `BCRYPT_ROUNDS` env, dynamischer `DUMMY_HASH` bei Modul-Load, Rehash-on-Login inline in `login()` mit WHERE-password Race-Gate + `rowCount===1` Audit-Emit-Gate
- [x] **[Quick Win]** Dummy-bcrypt im Login bei „User nicht gefunden" (Timing-Oracle, → `patterns/auth.md`) — `src/lib/auth.ts:6,30-32`
- [x] **[Must Have]** Cookies: `httpOnly; Secure; SameSite=Lax` — `src/lib/auth-cookie.ts`: httpOnly always, Secure in prod, SameSite=`lax` (Hotfix PR #76 2026-04-18 — `strict` brach iOS Safari Pull-to-Refresh; lax blockt weiterhin cross-site-POST-CSRF)
- [x] **[Quick Win]** Auth-Cookies mit `__Host-` Prefix — erledigt in PR #71 (2026-04-18): `session` → `__Host-session` in prod via `SESSION_COOKIE_NAME`-env-conditional. Dual-Verify-Phase aktiv während 7d observability-flip-gate läuft; Sprint C entfernt legacy-fallback.
- [x] **[Must Have]** JWT-Algorithmus pinnen auf sign UND verify (`{ algorithms: ['HS256'] }`) — `src/lib/auth.ts:40,51`, `src/middleware.ts:28`
- [x] **[Must Have]** `JWT_SECRET` bei App-Boot validieren (`requireEnv()`), nicht lazy — erledigt in PR #79 (2026-04-18): warn-only → throw via `assertMinLengthEnv("JWT_SECRET", ..., 32, "JWT sign/verify")` helper. Container bootet nicht mehr ohne valides Secret ≥32 chars. Staging JWT_SECRET seit 2026-04-18 von Prod gesplittet (unterschiedliche random-64-char secrets).
- [x] **[Quick Win]** Generische Auth-Errors („Login fehlgeschlagen") — kein Unterschied „Email existiert nicht" vs „Passwort falsch" — `src/app/api/auth/login/route.ts:40-52`
- [x] **[Must Have]** Rate-Limiting auf Login, Signup, Password-Reset, Magic-Link (separat, nicht globaler Bucket) — Login (`login:${ip}`), Signup newsletter (`signup:newsletter:${ip}` 5/15min) und mitgliedschaft (3/15min) mit separaten buckets. Password-Reset/Magic-Link Endpoints existieren nicht (N/A)
- [x] **[Must Have]** `/me`/Session-Restore von Per-IP-Rate-Limit AUSNEHMEN (sonst Lockout durch Tab-Wechsel) (→ `patterns/auth-hardening.md`) — GET `/api/dashboard/account` ist **nicht** rate-limited (nur PUT für Mutations)
- [x] **[Must Have]** Client-IP korrekt aus `X-Real-IP`/`X-Forwarded-For` ableiten wenn hinter Proxy (→ `patterns/auth.md`) — PR #62: `src/lib/client-ip.ts` nimmt NUR X-Real-IP, KEIN XFF-Fallback (spoof-Risiko wenn nginx bypassed). Alignt mit `signup-client-ip.ts`

### Application / Code

- [ ] **[Must Have]** Input-Validation mit Zod an jeder Endpoint-Grenze — **bewusst out-of-scope**: Custom-Validatoren voll getestet (168 Tests), Zod wäre Migration ohne direkten Security-Gewinn. Nice-to-Have, separater Sprint falls nötig
- [x] **[Must Have]** SQL nur parametrisiert, dynamische Identifier nur über Allowlist (→ `patterns/api.md`) — alle Queries `$1, $2, …`, dynamic SQL nur über hardcoded allowlists (z.B. `src/app/api/dashboard/journal/[id]/route.ts:116-130`)
- [ ] **[Must Have]** `dangerouslySetInnerHTML` nur mit DOMPurify — **nicht verifiziert** (Audit UNKNOWN): RichTextEditor hat eigenen `sanitizeHtml()`, DOMPurify nicht explizit im Bundle. Follow-up: Audit + ggf. DOMPurify einbauen
- [x] **[Must Have]** Error-Handling: keine Stack-Traces / `err.message` an Client — PR #62: letzter Leak in `alit/reorder/route.ts:44-48` gefixt. Zentraler `internalError()`-Helper in `src/lib/api-helpers.ts` überall sonst
- [x] **[Must Have]** `NEXT_PUBLIC_*` ausschließlich für public Werte — niemals Secrets, niemals interne URLs (→ `patterns/nextjs.md`, `patterns/seo.md`) — kein `NEXT_PUBLIC_*` in Code oder `.env.example` überhaupt verwendet
- [x] **[Must Have]** Server-only Module (`pg`, `bcrypt`, `jose`) nicht im Client-Bundle — Module-Split (→ `patterns/nextjs.md`) — alle nur in `src/lib/` und API-Routes importiert, keine Client-TSX-Imports
- [x] **[Quick Win]** `pnpm audit` — Critical/High zeitnah fixen — PR #62: Next.js 16.2.2 → 16.2.4 (GHSA-q4gf-8mx6-v5v3 DoS). Aktueller Stand: 0 HIGH/CRITICAL
- [x] **[Quick Win]** Renovate oder Dependabot aktivieren — PR #62: `.github/dependabot.yml` mit weekly npm + github-actions, next/react Major-Bumps ignored

### Secrets / Config

- [x] **[Must Have]** `.env` in `.gitignore` — `.env` + `.env.local` ignored
- [x] **[Must Have]** `.env.example` mit Dummy-Werten committet — vorhanden mit Platzhaltern wie `CHANGE_ME_TO_A_LONG_RANDOM_STRING`
- [x] **[Must Have]** Verschiedene Secrets pro Environment (dev/staging/prod), keine Wiederverwendung — **effektiv erfüllt** 2026-04-18: Shared-DB-Design zwischen prod + staging hält `DATABASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` shared (invariant). `JWT_SECRET` + `IP_HASH_SALT` via `openssl rand -base64` per-env gesplittet 2026-04-18 — Staging-Compromise kann keine Prod-JWTs mehr minten. Backup: `.env.backup-2026-04-18`.
- [x] **[Quick Win]** `chmod 600` auf alle `.env` / `secrets/*` am Server — erledigt 2026-04-18: prod + staging `.env` waren default `0644` (world-readable via root-shell), jetzt `0600` (owner-only).
- [x] **[Must Have]** Keine Secrets in Logs, keine in CI-Output, keine in Error-Messages an Client — Audit bestätigt: Log-Calls zeigen nur IP/Email/Reason, keine Secrets; CI-Workflows logs ohne Secret-Echoes; err.message an Client raus (s.o.)

### Datenbank

- [x] **[Must Have]** Eigener DB-User pro App (kein Superuser), Least-Privilege auf Schema-Ebene — `alit_user` verifiziert auf hd-server: `pg_user.usesuper = false`. Zusätzlich 2026-04-18: `REVOKE CREATE ON DATABASE alit FROM alit_user` — kann keine neuen Schemas mehr anlegen. DML-Grants auf public-Schema unverändert (DELETE/INSERT/SELECT/UPDATE/REFERENCES/TRIGGER/TRUNCATE); `ensureSchema()` operiert in public-schema ohne Beeinträchtigung.
- [x] **[Must Have]** `pg_hba.conf` strikt scopen — niemals `0.0.0.0/0` (→ `patterns/database.md`) — `172.16.0.0/12` nur für Docker-Bridge (siehe `memory/project.md`)
- [x] **[Must Have]** Backups eingerichtet UND mindestens einmal Restore getestet — erledigt 2026-04-18. **Daily cron** `/opt/backups/alit-backup.sh` (03:00 UTC, pg_dump + gzip, 14d retention auf `/opt/backups/alit/`). **Restore-Drill** durchgeführt: 13MB dump restored zu ephemeral DB in ~1s, 10 Tabellen + row-counts verifiziert (admin_users=2, journal_entries=11, media=10, projekte=7). Cross-audit fand vorher dass alit cron-backup **fehlte** während andere hd-server-Apps welche hatten — siehe `patterns/deployment-hetzner.md` multi-app-vps-backup-automation-cross-audit.
- [ ] **[Quick Win]** Connection-Pool-Limits am Pool und an der DB — **bewusst out-of-scope**: pg-Default=10 ausreichend für Admin-Traffic (siehe `src/lib/db.ts`). Upgrade bei Traffic-Wachstum

### Repo / CI

- [x] **[Must Have]** Branch Protection auf `main`: kein Force-Push, kein direkter Push, Required PR + Review — aktiviert 2026-04-18 via `gh api` PUT. Required status check `deploy` (job-name verifiziert via `gh api repos/.../commits/main/check-runs`), no force-push, no deletion, `enforce_admins: false` (admin-bypass als Lockout-Safety-Net).
- [x] **[Quick Win]** GitHub Secret-Scanning aktiviert (kostenlos für public + private) — aktiviert 2026-04-18 via `gh api` PATCH. `secret_scanning: enabled` + `secret_scanning_push_protection: enabled` (blockt Pushes mit detected Secrets — redundant zu gitleaks pre-commit aber Defense-in-Depth).
- [x] **[Quick Win]** `gitleaks` als pre-commit Hook — PR #66: husky entfernt, gitleaks läuft jetzt via Shared Vibe-Coding pre-commit hook (installiert via `install-hooks.sh`). Voraussetzung: `brew install gitleaks` systemweit (done: v8.30.1)
- [x] **[Quick Win]** GitHub Actions: third-party Actions auf SHA pinnen statt Tag (`uses: foo/bar@<full-sha>`) — PR #62: `appleboy/ssh-action@0ff4204d59e8e51228ff73bce53f80d53301dee2  # v1.2.5` in `deploy.yml` + `deploy-staging.yml`
- [x] **[Must Have]** `appleboy/ssh-action` etc.: keine User-Inputs in `script:` interpolieren (→ Command Injection, `patterns/deployment-cicd.md`) — Audit bestätigt: beide Workflows nutzen nur hardcoded paths + `$BRANCH` aus `env:` (GitHub-provided, safe)

---

## Tier 1 — Bevor das Projekt echte User hat

Trigger: irgendein Mensch außer dir loggt sich ein, oder Projekt hat öffentliche User-generated Content.

### Defense in Depth

- [~] **[Must Have]** CSP einführen — erst `Content-Security-Policy-Report-Only` mit `report-uri`, nach 1–2 Wochen scharf schalten. **Sprint D1 (2026-04-19, in-progress):** Report-Only via Next.js Middleware live mit per-Request-Nonce + `/api/csp-report` Endpoint (beide Report-Formats normalisiert, Rate-Limit 30/15min, Body-Cap 10KB). D2 flippt nach ≥7 Tagen clean-stream zu enforced.
- [~] **[Must Have]** CSP Ziel: kein `unsafe-inline`, kein `unsafe-eval` (Next.js: nonce-based via Middleware). Sprint D1: `script-src 'self' 'nonce-{N}' 'strict-dynamic'` — clean. `style-src 'self' 'unsafe-inline'` bleibt pragmatisch wegen React-Inline-`style`-Props (strict-style-src = eigener Follow-up Sprint).
- [ ] **[Quick Win]** `Cross-Origin-Opener-Policy: same-origin`
- [ ] **[Quick Win]** `Cross-Origin-Resource-Policy: same-origin`
- [ ] **[Quick Win]** Subresource Integrity (SRI) für jedes `<script>`/`<link>` von CDN
- [ ] **[Quick Win]** Cloudflare in front (free tier reicht meist) — Bot-Schutz + Edge-Rate-Limit + DDoS

### Auth / Sessions vertiefen

- [ ] **[Must Have]** Account Enumeration vermeiden auf Signup, Password-Reset, Magic-Link (gleicher Response)
- [ ] **[Quick Win]** Password-Length-Cap (`max(128)`) auf jedem Validation-Schema (DoS via lange Bcrypt-Inputs)
- [ ] **[Must Have]** Session-Rotation bei Login + Privilege-Escalation
- [ ] **[Must Have]** Logout: Server-side invalidate (Token-Blacklist oder `tokens_invalidated_at` + `iat`-Check)
- [ ] **[Must Have]** Role-Check immer aus DB, niemals aus JWT-Claim (Claim ist stale nach Promote/Demote)
- [ ] **[Must Have]** CSRF-Token für state-changing Requests bei Cookie-Auth

### File Uploads

- [ ] **[Must Have]** MIME-Validation server-side (nicht nur Extension)
- [ ] **[Must Have]** Größenlimit + Filename sanitizen
- [ ] **[Must Have]** Außerhalb Webroot speichern, niemals direkt static-serven
- [ ] **[Quick Win]** SVG-Uploads: `Content-Security-Policy: sandbox; default-src 'none'` als Response-Header für `/uploads/*`
- [ ] **[Must Have]** nginx `client_max_body_size` explizit setzen (Default ist 1 MB → silent failure)

### API

- [ ] **[Must Have]** Pagination-Limits an jedem List-Endpoint (hartes Cap, kein `LIMIT 1000`)
- [ ] **[Must Have]** Request-Body-Size-Limit (`express.json({ limit: '100kb' })`)
- [ ] **[Quick Win]** Outbound `fetch`-Timeouts + Circuit-Breaker bei externen APIs
- [ ] **[Must Have]** Keine sequenziellen IDs für public Resources — UUIDs verwenden (→ `patterns/api.md`)
- [ ] **[Must Have]** Webhook-Signatures verifizieren (Stripe, GitHub) mit constant-time-compare

### Monitoring

- [ ] **[Must Have]** Auth-Failures loggen (User-ID, IP, Timestamp, User-Agent) — niemals Passwörter/Tokens
- [ ] **[Quick Win]** Error-Tracking (Sentry o.ä.) mit PII-Scrubbing
- [ ] **[Quick Win]** Uptime-Monitoring für public Endpoints + DB-Health
- [ ] **[Quick Win]** Alert-Channel (Discord/Telegram-Bot) für Critical-Errors

### Privacy / DSGVO

- [ ] **[Must Have]** Datenschutzerklärung + Impressum (TMG-Pflicht in DE)
- [ ] **[Must Have]** Cookie-Consent für nicht-essentielle Cookies
- [ ] **[Must Have]** AVV mit jedem Drittanbieter (Vercel, Sentry, Hetzner, Cloudflare, Mailgun)
- [ ] **[Quick Win]** Logs nach X Tagen rotieren (z.B. 30d)

---

## Tier 2 — Sensitive Daten / Bezahlung / echte Identitäten

Trigger: Zahlungsdaten, Health-Daten, Behördendaten, KYC, Multi-Tenancy, B2B-Kunden mit Compliance-Anforderungen.

### Kryptographie

- [ ] **[Must Have]** Niemals selbstgebaute Crypto — nur Library / `crypto.subtle`
- [ ] **[Must Have]** Random nur via `crypto.randomBytes()` / `crypto.getRandomValues()`, niemals `Math.random()` für Tokens
- [ ] **[Must Have]** Constant-time compare für Tokens/Signatures (`crypto.timingSafeEqual`)
- [ ] **[Must Have]** Encryption-at-rest für PII-Spalten (pgcrypto oder app-side mit KMS)
- [ ] **[Nice to Have]** Key-Rotation-Plan dokumentiert + getestet
- [ ] **[Quick Win]** HMAC für signed URLs (Unsubscribe-Links etc.) mit Expiry

### Auth-Erweiterungen

- [ ] **[Must Have]** 2FA-Pflicht für Admin-Accounts (TOTP via `otplib`, später WebAuthn)
- [ ] **[Must Have]** Privileged-Action Re-Auth („sudo mode") für Delete-Account, Change-Email, Admin-Mgmt
- [ ] **[Must Have]** Account-Lockout via exponentielles Backoff (kein Hard-Lock → DoS-Vektor)
- [ ] **[Quick Win]** Password-Breach-Check via HIBP API (k-anonymity)
- [ ] **[Must Have]** OAuth/OIDC: PKCE für SPAs, `state`-Parameter, Refresh-Token-Rotation

### Authorization

- [ ] **[Must Have]** Permission-Checks an jedem Layer — niemals dem Client trauen
- [ ] **[Must Have]** Tenant-Isolation in Multi-Tenant: jeder Query mit `tenant_id`-Filter (am besten via Postgres RLS)
- [ ] **[Nice to Have]** Field-Level-Permissions für sensitive Felder (eigener Serializer pro Rolle)

### Container / Docker

- [x] **[Must Have]** Non-root-User im Container (`USER node`) — war bereits seit initial setup live: `Dockerfile` macht `addgroup --system --gid 1001 nodejs` + `adduser --system --uid 1001 nextjs` + `USER nextjs` vor `CMD`. Bestätigt via Sprint-E-Recon 2026-04-19.
- [x] **[Quick Win]** Drop Capabilities (`cap_drop: [ALL]`, gezielt `cap_add`) — Sprint E 2026-04-19: `cap_drop: [ALL]` in beiden `docker-compose.yml` + `docker-compose.staging.yml`. Next.js braucht keine Linux-Caps (Port 3000 non-privileged, kein setuid/setcap).
- [x] **[Quick Win]** `no-new-privileges:true` — Sprint E 2026-04-19: `security_opt: - no-new-privileges:true` in beiden compose-Files. Blockt setuid/setcap-basierte Escalation innerhalb des Containers.
- [ ] **[Quick Win]** Read-only Filesystem (`read_only: true` + `tmpfs` für `/tmp`) — Follow-up (Next.js writes zu `/app/.next/cache` und `/tmp`, separate Investigation ob `tmpfs`-mounts reichen).
- [x] **[Quick Win]** Resource-Limits (`mem_limit`, `cpus`) — Sprint E 2026-04-19: `deploy.resources.limits` mem=512M cpus=1.0 + reservations=128M/0.25. Observed idle ~51 MiB, sehr generös.
- [x] **[Quick Win]** Image-Scanning mit Trivy in CI — erledigt 2026-04-19. Neue `.github/workflows/security-scan.yml`: (1) Filesystem + Config scan auf jedem PR (deps CVEs + Dockerfile-misconfig), (2) Docker-image scan auf main-push + weekly (Mon 04:00 UTC). `severity: HIGH,CRITICAL`, `ignore-unfixed: true` gegen base-image-noise, `exit-code: 1` blockt Merge bei Funden. Actions SHA-pinned (checkout v4.2.2, trivy-action v0.35.0).
- [ ] **[Nice to Have]** Slim/Distroless Base-Images — aktuell `node:22-alpine` (schon slim).
- [x] **[Must Have]** Docker-Socket niemals in Container mounten — Audit 2026-04-19: kein `/var/run/docker.sock` Mount in compose-Files.

### CSP scharf

- [ ] **[Must Have]** `default-src 'none'` als Basis, dann gezielt erlauben
- [ ] **[Must Have]** Nonce-based Inline-Scripts (kein `unsafe-inline`)
- [ ] **[Quick Win]** `strict-dynamic` wenn Build-Tool unterstützt
- [ ] **[Quick Win]** `frame-ancestors 'none'` (ersetzt `X-Frame-Options`)
- [ ] **[Nice to Have]** `report-to`/`report-uri` aktiv + Reports auswerten

### Datenbank vertiefen

- [ ] **[Quick Win]** Read-only User für Reporting/Analytics-Queries
- [ ] **[Nice to Have]** Audit-Log-Trigger auf sensitiven Tabellen (`pgaudit` oder eigene Trigger)
- [ ] **[Must Have]** Backup-Encryption at-rest, Storage off-site (Hetzner Storage Box mit eigenem Key)
- [ ] **[Quick Win]** PII-Spalten via Schema-Comment markieren (für DSGVO-Lösch-Requests)

### Logging-Hygiene

- [ ] **[Quick Win]** Strukturierte Logs (JSON statt freier Text)
- [ ] **[Quick Win]** Correlation-IDs (request-id) durch alle Layer
- [ ] **[Must Have]** PII-Scrubbing zentral in Log-Library (Email → `***@domain.com`, IPs gehasht)
- [ ] **[Must Have]** Niemals loggen: Passwörter, Tokens, Cookies, Session-IDs, vollständige CC-Nummern, API-Keys
- [ ] **[Nice to Have]** Log-Shipping in immutable Storage (S3 Object Lock, Loki, Better Stack)

### DSGVO erweitert

- [ ] **[Must Have]** Datenexport-Endpoint (Art. 15 + 20)
- [ ] **[Must Have]** Datenlösch-Endpoint (Art. 17) mit Cascade auf alle Tabellen
- [ ] **[Must Have]** Records of Processing (Art. 30) als Doc gepflegt
- [ ] **[Nice to Have]** DPIA bei Profiling/sensitiven Daten
- [ ] **[Must Have]** Breach-Notification-Plan: 72h-Frist + Template + Kontakt vorbereitet

### Bezahlung

- [ ] **[Must Have]** PCI-Scope minimieren: Stripe/PayPal hosted Checkout, niemals PAN durch eigene Server
- [ ] **[Must Have]** Webhook-Idempotency mit Stripe/PayPal Event-IDs
- [ ] **[Must Have]** Server-side Final-Price-Check vor Payment-Confirm

---

## Tier 3 — Production-grade / Enterprise / Paying Customers

Trigger: bezahlende Kunden, SLAs, B2B-Compliance (SOC2/ISO27001), Healthcare/Finance, Mitarbeiter mit Prod-Access.

### SDLC / AppSec

- [ ] **[Quick Win]** SAST: Semgrep oder GitHub CodeQL gegen jeden PR
- [ ] **[Nice to Have]** DAST: OWASP ZAP scheduled gegen Staging
- [ ] **[Quick Win]** Secret-Scanning: gitleaks in pre-commit + CI
- [ ] **[Quick Win]** Dependency-Scanning: Snyk, Socket.dev oder GitHub Advisories mit auto-PR
- [ ] **[Nice to Have]** Threat-Modeling-Doc pro Major Feature (STRIDE)

### Operational Security

- [ ] **[Must Have]** Access-Reviews quarterly (wer hat noch SSH/DB/Admin)
- [ ] **[Must Have]** Offboarding-Checklist (SSH-Keys, GitHub, JWT-Invalidate, Vault)
- [ ] **[Must Have]** Separation of Duties: Deploy ≠ Develop ≠ DBA für Critical Systems
- [ ] **[Nice to Have]** Bastion-Host / VPN für Admin-Access
- [ ] **[Must Have]** Hardware-Tokens (YubiKey) für Admin-2FA + GitHub
- [ ] **[Nice to Have]** Privileged-Access-Logging (sudo, DB-Admin-Queries → SIEM)

### Detection / Response

- [ ] **[Nice to Have]** WAF mit Custom Rules (ModSecurity, Cloudflare Custom Rules)
- [ ] **[Nice to Have]** Anomaly-Detection: Login von neuem Country/Device → User-Notify
- [ ] **[Quick Win]** Honeypot-Endpoints (`/admin.php`, `/wp-login.php`) → fail2ban auto-block
- [ ] **[Quick Win]** Canary-Tokens in DB/Files/AWS-Keys → Alarm wenn berührt
- [ ] **[Nice to Have]** SIEM (Datadog Cloud SIEM, Wazuh, Elastic) für Log-Korrelation
- [ ] **[Must Have]** Incident-Response-Runbook pro Top-5-Szenario

### Infrastructure-Härten

- [ ] **[Nice to Have]** Kernel-Hardening (`sysctl` CIS-Profile, AppArmor/SELinux enforce)
- [ ] **[Nice to Have]** `auditd` für Filesystem- und Syscall-Events
- [ ] **[Quick Win]** DNSSEC + CAA-Records (`example.com. CAA 0 issue "letsencrypt.org"`)
- [ ] **[Quick Win]** Certificate-Transparency-Monitoring (Cert Spotter, crt.sh-Watcher)
- [ ] **[Nice to Have]** MTA-STS + DANE für Email-Domain
- [ ] **[Must Have]** DKIM / SPF / DMARC strict policy (`p=reject`) (→ `patterns/mailcow.md`)

### Backups / DR

- [ ] **[Must Have]** 3-2-1 Rule: 3 Copies, 2 Media, 1 Off-site
- [ ] **[Must Have]** Restore-Drills quarterly mit Stoppuhr (RTO/RPO messen)
- [ ] **[Quick Win]** Cross-Region-Backup (zweite Hetzner-Location oder Backblaze)
- [ ] **[Must Have]** Backup-User darf NICHT in Prod schreiben (Ransomware-Schutz)

### Compliance / Legal

- [ ] **[Must Have]** DSGVO Art. 30 Verzeichnis auditierbar gepflegt
- [ ] **[Must Have]** Sub-Processor-Liste öffentlich
- [ ] **[Must Have]** DPO ab 20+ MA mit regelmäßiger PII-Verarbeitung (extern OK)
- [ ] **[Must Have]** Vendor Security Reviews (Fragebogen vor Onboarding)
- [ ] **[Must Have]** Pen-Test mindestens jährlich + vor Major-Launches

### Browser / Frontend Hardening

- [ ] **[Nice to Have]** Trusted Types Policy (`require-trusted-types-for 'script'`)
- [ ] **[Quick Win]** iframe sandbox für embedded User-Content
- [ ] **[Must Have]** postMessage origin-Checks strict (kein `*` als targetOrigin)
- [ ] **[Quick Win]** Cookie-Prefixes: `__Host-` für Auth, `__Secure-` für andere
- [ ] **[Nice to Have]** Partitioned Cookies (CHIPS) für third-party Embeds

---

## Wann hochziehen

| Trigger | Tier |
|---|---|
| Neues Projekt deployt | **Tier 0** |
| Erster User außer dir loggt sich ein | **Tier 1** |
| Login mit echter Identität | **Tier 1** |
| Bezahlung integriert | **Tier 2** |
| Multi-Tenant / B2B-Kunden | **Tier 2** |
| Sensitive Kategorien (Gesundheit, Finanzen, KYC) | **Tier 2** |
| Bezahlte Kunden mit Vertrag/SLA | **Tier 3** |
| Compliance-Audit (SOC2/ISO27001/HIPAA) ansteht | **Tier 3** |
| Mitarbeiter mit Prod-Access | **Tier 3** |

---

## Anti-Patterns (immer falsch, egal welcher Tier)

- [ ] **[Check]** Kein selbstgebautes Crypto irgendwo im Code
- [ ] **[Check]** Keine sensitive Daten in `localStorage`
- [ ] **[Check]** Keine sequenziellen IDs für public Resources (`/users/1`, `/users/2`)
- [ ] **[Check]** Email allein reicht NICHT als Identitäts-Beweis für Privileged Actions
- [ ] **[Check]** Kein Request-Body-Logging in Production (Passwörter / Tokens leaken)
- [ ] **[Check]** CORS wird NICHT als Auth-Mechanismus verwendet (→ `patterns/api.md`)
- [ ] **[Check]** Kein `unsafe-inline` in CSP „weil wir kein nonce-Setup haben"
- [ ] **[Check]** Keine Secrets in Build-Output Env-Vars (`NEXT_PUBLIC_*`, `VITE_*`) (→ `patterns/nextjs.md`)
- [ ] **[Check]** Backups wurden mindestens einmal restored — sonst sind es keine Backups, sondern Hoffnung
