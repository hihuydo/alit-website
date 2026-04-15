# alit-website — Security Checklist
# Copied from ../../checklists/security.md on 2026-04-15
# Per-project state: Punkte hier abhaken wie sie umgesetzt werden.
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

- [ ] **[Must Have]** HTTPS only via certbot (Let's Encrypt), HTTP→HTTPS Redirect, kein Mixed Content
- [ ] **[Must Have]** TLS 1.2+ (Mozilla SSL Config Generator, Profil „intermediate")
- [ ] **[Must Have]** SSH: `PermitRootLogin no`, `PasswordAuthentication no`, key-only
- [ ] **[Must Have]** `fail2ban` aktiv für SSH
- [ ] **[Must Have]** Firewall `ufw` mit Default-Deny, nur 22/80/443 offen
- [ ] **[Quick Win]** `unattended-upgrades` für `-security` Repo + Auto-Reboot in Wartungsfenster
- [ ] **[Quick Win]** nginx Dotfile-Block global: `location ~ /\.(env|git|ht|DS_Store|svn) { deny all; return 404; }`
- [ ] **[Quick Win]** Security Header `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- [ ] **[Quick Win]** Security Header `X-Content-Type-Options: nosniff`
- [ ] **[Quick Win]** Security Header `X-Frame-Options: DENY` (oder via CSP `frame-ancestors 'none'`)
- [ ] **[Quick Win]** Security Header `Referrer-Policy: strict-origin-when-cross-origin`
- [ ] **[Quick Win]** Security Header `Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()`
- [ ] **[Must Have]** Header in ALLEN `location`-Blöcken wiederholen — `add_header` wird in nginx nicht vererbt sobald ein child block selbst ein `add_header` setzt (→ `patterns/deployment-nginx.md`)

### Auth / Sessions

- [ ] **[Must Have]** Passwörter mit bcrypt (cost ≥12), niemals MD5/SHA1/selbstgebaut
- [ ] **[Quick Win]** Dummy-bcrypt im Login bei „User nicht gefunden" (Timing-Oracle, → `patterns/auth.md`)
- [ ] **[Must Have]** Cookies: `httpOnly; Secure; SameSite=Lax`
- [ ] **[Quick Win]** Auth-Cookies mit `__Host-` Prefix
- [ ] **[Must Have]** JWT-Algorithmus pinnen auf sign UND verify (`{ algorithms: ['HS256'] }`)
- [ ] **[Must Have]** `JWT_SECRET` bei App-Boot validieren (`requireEnv()`), nicht lazy
- [ ] **[Quick Win]** Generische Auth-Errors („Login fehlgeschlagen") — kein Unterschied „Email existiert nicht" vs „Passwort falsch"
- [ ] **[Must Have]** Rate-Limiting auf Login, Signup, Password-Reset, Magic-Link (separat, nicht globaler Bucket)
- [ ] **[Must Have]** `/me`/Session-Restore von Per-IP-Rate-Limit AUSNEHMEN (sonst Lockout durch Tab-Wechsel) (→ `patterns/auth-hardening.md`)
- [ ] **[Must Have]** Client-IP korrekt aus `X-Real-IP`/`X-Forwarded-For` ableiten wenn hinter Proxy (→ `patterns/auth.md`)

### Application / Code

- [ ] **[Must Have]** Input-Validation mit Zod an jeder Endpoint-Grenze
- [ ] **[Must Have]** SQL nur parametrisiert, dynamische Identifier nur über Allowlist (→ `patterns/api.md`)
- [ ] **[Must Have]** `dangerouslySetInnerHTML` nur mit DOMPurify
- [ ] **[Must Have]** Error-Handling: keine Stack-Traces / `err.message` an Client
- [ ] **[Must Have]** `NEXT_PUBLIC_*` ausschließlich für public Werte — niemals Secrets, niemals interne URLs (→ `patterns/nextjs.md`, `patterns/seo.md`)
- [ ] **[Must Have]** Server-only Module (`pg`, `bcrypt`, `jose`) nicht im Client-Bundle — Module-Split (→ `patterns/nextjs.md`)
- [ ] **[Quick Win]** `pnpm audit` — Critical/High zeitnah fixen
- [ ] **[Quick Win]** Renovate oder Dependabot aktivieren

### Secrets / Config

- [ ] **[Must Have]** `.env` in `.gitignore`
- [ ] **[Must Have]** `.env.example` mit Dummy-Werten committet
- [ ] **[Must Have]** Verschiedene Secrets pro Environment (dev/staging/prod), keine Wiederverwendung
- [ ] **[Quick Win]** `chmod 600` auf alle `.env` / `secrets/*` am Server
- [ ] **[Must Have]** Keine Secrets in Logs, keine in CI-Output, keine in Error-Messages an Client

### Datenbank

- [ ] **[Must Have]** Eigener DB-User pro App (kein Superuser), Least-Privilege auf Schema-Ebene
- [ ] **[Must Have]** `pg_hba.conf` strikt scopen — niemals `0.0.0.0/0` (→ `patterns/database.md`)
- [ ] **[Must Have]** Backups eingerichtet UND mindestens einmal Restore getestet
- [ ] **[Quick Win]** Connection-Pool-Limits am Pool und an der DB

### Repo / CI

- [ ] **[Must Have]** Branch Protection auf `main`: kein Force-Push, kein direkter Push, Required PR + Review
- [ ] **[Quick Win]** GitHub Secret-Scanning aktiviert (kostenlos für public + private)
- [ ] **[Quick Win]** `gitleaks` als pre-commit Hook
- [ ] **[Quick Win]** GitHub Actions: third-party Actions auf SHA pinnen statt Tag (`uses: foo/bar@<full-sha>`)
- [ ] **[Must Have]** `appleboy/ssh-action` etc.: keine User-Inputs in `script:` interpolieren (→ Command Injection, `patterns/deployment-cicd.md`)

---

## Tier 1 — Bevor das Projekt echte User hat

Trigger: irgendein Mensch außer dir loggt sich ein, oder Projekt hat öffentliche User-generated Content.

### Defense in Depth

- [ ] **[Must Have]** CSP einführen — erst `Content-Security-Policy-Report-Only` mit `report-uri`, nach 1–2 Wochen scharf schalten
- [ ] **[Must Have]** CSP Ziel: kein `unsafe-inline`, kein `unsafe-eval` (Next.js: nonce-based via Middleware)
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

- [ ] **[Must Have]** Non-root-User im Container (`USER node`)
- [ ] **[Quick Win]** Drop Capabilities (`cap_drop: [ALL]`, gezielt `cap_add`)
- [ ] **[Quick Win]** Read-only Filesystem (`read_only: true` + `tmpfs` für `/tmp`)
- [ ] **[Quick Win]** Resource-Limits (`mem_limit`, `cpus`)
- [ ] **[Quick Win]** Image-Scanning mit Trivy in CI
- [ ] **[Nice to Have]** Slim/Distroless Base-Images
- [ ] **[Must Have]** Docker-Socket niemals in Container mounten

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
