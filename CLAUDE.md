# alit-website — Claude Code Instructions
# Last updated: 2026-05-01 — **Instagram-Export Feature: durch.** S2c (PR #136) + DK-8 Hotfixes (PR #137 + #138) alle prod-deployed. PR #138: `LayoutEditor.tsx` Slide-Labels matchen Preview via `slideIdx + 1 + (hasGrid ? 1 : 0)` — text-only offset 0, grid offset +1 (verifiziert gegen `splitAgendaIntoSlides` §rawSlides line 460/477). 2 neue Unit-Tests. PR #137: Body Top-Alignment in `slide-template.tsx` (`justifyContent: flex-start` statt `centerBodyRegion` vertical-centering), pg pool `keepAlive: true` + `connectionTimeoutMillis: 5000` in `db.ts` gegen Docker-Bridge-NAT/conntrack-Drops auf `host.docker.internal` (manifestiert als ETIMEDOUT 172.17.0.1:5432 in Staging-Logs), `SlidePreviewImg` mit one-shot `onError` retry + cache-bust und `key={src}` damit retry-Budget bei JEDER URL-Änderung re-armed (P3 Codex-Catch: imageCount-change war im key vergessen). React-Purity: `Date.now()` darf nicht direct in render aufgerufen werden — stamping in state via `onError`-handler. Tests 1045 → 1047. **S2c (PR #136)**: gemeinsame `packAutoSlides<T>(blocks, opts)` Funktion mit whole-block greedy placement, beide Pfade (`projectAutoBlocksToSlides` Editor + `splitAgendaIntoSlides` Renderer) bauen darauf auf. `rebalanceGroups` gedroppt, `splitOversizedBlock<T>` + `splitBlockToBudget<T>` generified. Editor↔Renderer slide-block-id-arrays jetzt identisch (DK-6 property test). Tests 970 → 1045. 22 Sonnet-Spec-Rounds + 2 Codex-Spec + 2 Codex-PR rounds. Davor: **Sprint C Cookie-Migration Phase 2 PR #116 merged + prod deployed** (2026-04-25). Sprint-B-Scaffold abgebaut: `LEGACY_COOKIE_NAME`, `verifySessionDualRead` Dual-Read-Fallback, `bumpCookieSource` Counter, `cookie-counter.ts` Modul gelöscht. `verifySessionDualRead` → `verifySession`. `SessionReadResult` + `AuthContext` ohne `source`-Feld. `setSessionCookie` + `clearSessionCookies` ohne Legacy-Clear. `(authed)/layout.tsx` simplifiziert. `auth_method_daily` CREATE TABLE bleibt (idempotent, no-longer-written, DDL-Drop in Follow-up Sprint). Tests 655 → 639 (-16 Sprint-B-Legacy-Cases). Codex-PR R1 APPROVED first-try. Davor: **Staging Basic Auth** (nginx-Layer, kein App-Code). `nginx/alit-staging.conf` bekommt `auth_basic "alit staging – closed beta"` **in `location /`** (nicht server-level) → certbot's `--authenticator=nginx` kann während Renewal seinen eigenen Challenge-Location-Block als Sibling injizieren ohne auth_basic zu erben. `location = /api/health/` ist ebenfalls Sibling von `location /` und damit auth-frei (Docker/CI/Uptime). Codex PR #111 2 Runden: R1 [P1] `/dashboard/*` Exemption wäre unvollständig gewesen (/_next/*), R2 [P1] mein initialer `location ^~ /.well-known/acme-challenge/` Block hätte certbot's regex-Injection geshadowt. Finale Architektur vermeidet beide Traps durch richtiges Scoping. Browser cached Basic Auth pro Origin → Admin tippt einmal pro Browser-Session. htpasswd unter `/etc/nginx/htpasswd-alit-staging` (server-only, nicht im Repo). Prod (`nginx/alit.conf`) unberührt. Davor: **Instagram Image-Slides PR #110 merged + prod-deployed**. Agenda-Einträge mit Bildern können per Number-Input „Bilder mitexportieren (max N)" im Export-Modal Bilder in den Instagram-Carousel einbinden. Layout: Slide 1 = Titel+Lead+image[0] (ohne Body-Text), Slides 2..N = pure-image-slides, Slides N+1..end = Beschreibungstext. Default 0 = legacy text-only (bit-identical). Helper `src/lib/instagram-images.ts::loadMediaAsDataUrl(publicId)` lädt bytes aus `media`-Table → base64 data-URL (kein self-HTTP). Satori braucht explizite `width`/`height` Props + `fitImage(aspect, maxW, maxH)` pure helper weil `object-fit:contain`/`maxWidth` nicht wie Browser implementiert. `Slide` type um `kind:"text"|"image"` + `imagePublicId?` + `imageAspect?` erweitert. API-Routes `?images=N` (clamped via `countAvailableImages`). `auditLog()` payload extended um `image_count`. Tests 647→655. Davor: **Media-Row-Icons PR #109 (2026-04-22)** — `RowAction`.icon?: ReactNode (optional, backwards-compat). MediaSection desktop: 5 Lucide-Style inline SVGs (Link/LinkExternal/Download/Edit/Trash/Check), aria-label + title, CopyFeedback via Icon-flash. Mobile „…"-Menu bleibt Text. Davor: **Dead-Column-Cleanup PRs #106→#107→#108 (2026-04-21→22)** — 3-Phase-Shared-DB-safe DROP COLUMN für `journal_entries.date` + `agenda_items.sort_order`. Phase 1 reads→weg, Phase 2a writes→weg + DROP NOT NULL, Phase 2b DROP COLUMN. 3× Codex CLEAN first-try. Davor: **Hybrid Journal Sort PR #105** — `site_settings.journal_sort_mode` {auto|manual}, erster Drag = atomarer Flip, Reset-Button, Tests 635→645. Davor: **PR #104 Site-Title** lowercase + em-dash. Davor: **Restore-D&D + Auto-Sort + Freitext-Removal PR #103** — Multi-Scope 10 Commits 9 Codex-Runden, neue `journal_entries.datum` canonical, TO_CHAR-Roundtrip guard gegen PG TO_DATE overflow, COALESCE-basiertes per-row fallback ORDER BY, 3-Branch buildPayload preserve-semantics. Davor: **Bundled Admin-UX PR #102**, **Agenda Datetime-Canonical PR #101**, **Newsletter-to-Discours PR #100**, **Journal-Info-Editor PR #99**, **Instagram-Export v1 PR #97**, **T1 Auth-Sprint S PR #96** (env-scoped admin_session_version, 3-gate requireAuth, CSRF HMAC, route-group (authed), nginx COOP+CORP).
<!-- Workflow: siehe ~/01 Projekte/00 Vibe Coding/CLAUDE.md -->

## Project

Website des Netzwerks für Literatur*en (alit.ch / alit.hihuydo.com). 3-Spalten-Layout mit Agenda (Events), Discours Agités (Journal-Einträge), Projekten, Mitgliedschaft + Newsletter. DE/FR zweisprachig.

Admin-Dashboard unter `/dashboard/` für alle Content-Typen + Medien + Signups.

- **Prod:** https://alit.hihuydo.com
- **Staging:** https://staging.alit.hihuydo.com
- **Hosting:** Hetzner VPS (hd-server, 135.181.85.55)

---

## Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 16.2.4 (App Router, standalone output) |
| Language | TypeScript (strict) |
| Styling | Tailwind v4 (`@theme`, self-hosted PP Fragment Sans fonts) |
| UI Primitives | Custom (`src/app/dashboard/components/Modal.tsx`, RichTextEditor etc.) |
| Middleware | `src/proxy.ts` (Next.js 16 convention, renamed from middleware.ts in PR #83). Combines dashboard auth-guard (fail-closed) + CSP Report-Only decoration (fail-open, isolated try/catch). Matcher: document-requests only, excludes `api/*`/static/prefetch. |
| CSP | Sprint D1 Report-Only live. Per-request nonce on `x-nonce` + `Content-Security-Policy` request-headers so Next.js framework-scripts get nonce; response-side `Content-Security-Policy-Report-Only` for browser. `/api/csp-report/` endpoint with streaming-cap + legacy/modern normalization. D2 flips response-header-name (≥7d clean stream). Helper: `src/lib/csp.ts`. |
| Backend | Next.js API Routes |
| Database | PostgreSQL 16 (hd-server), JSONB-per-field i18n (`*_i18n` columns) |
| Auth | bcryptjs cost 12 + Rehash-on-Login, jose JWT HS256 24h claim `{sub, tv}`, `__Host-session` (Lax) + `__Host-csrf` (Strict) + legacy `session` dual-verify cookies. `requireAuth` 3-gate: JWT-verify → env-scoped DB-tv-check (`admin_session_version` Table, composite PK `(user_id, env)`) → CSRF double-submit+HMAC(`"csrf-v1:"`, userId, tv) auf non-GET. `getTokenVersion(userId, env)` + `bumpTokenVersionForLogout()` in `src/lib/session-version.ts`. CSRF-helper (Edge-safe Web-Crypto + `timingSafeEqualBytes` XOR) in `src/lib/csrf.ts`. Observability-Counter `auth_method_daily` für Sprint-C-Flip. Client `src/app/dashboard/lib/dashboardFetch.ts` wrapt fetch für Mutations mit 403-refresh-retry + 401-redirect |
| Storage | Media als `bytea` in PostgreSQL, public über UUID-URLs |
| Testing | Vitest 4.1 + @testing-library/react + jsdom (per-file `// @vitest-environment jsdom` pragma) |
| Linting | ESLint 9 + eslint-config-next |
| Package mgr | pnpm 10 |

---

## Commands

```bash
# Dev server
pnpm dev

# Production build
pnpm build

# Tests (227 passing — Vitest 4.1, BCRYPT_ROUNDS=5 in test env)
pnpm test

# Deps audit — pflicht vor jedem Sprint-Abschluss
pnpm audit --prod
```

---

## Environment Variables

```
DATABASE_URL            # postgres://alit_user:…@host.docker.internal:5432/alit
JWT_SECRET              # ≥32 chars, eager-checked in instrumentation.ts
ADMIN_EMAIL             # bootstrap-admin auf erstem Boot
ADMIN_PASSWORD_HASH     # bcrypt hash für ADMIN_EMAIL
IP_HASH_SALT            # ≥16 chars, eager-checked, MUSS in docker-compose*.yml environment: block durchgereicht werden
BCRYPT_ROUNDS           # optional (default 12), Range 4..15 via src/lib/bcrypt-rounds.ts, in docker-compose via ${BCRYPT_ROUNDS:-12}
SITE_URL                # https://alit.hihuydo.com (prod) / https://staging.alit.hihuydo.com (staging)
```

Config entrypoint: `src/lib/site-url.ts` (SITE_URL-Kapselung), `src/instrumentation.ts` (eager env validation at boot).

---

## Architecture

```
Browser → nginx (Security-Header, Dotfile-Block, SSL)
       → Next.js Standalone Container (port 3100 prod / 3102 staging)
       → PostgreSQL (host.docker.internal:5432)
```

**3-Spalten-Layout** (immer 2 von 3 offen, drittes als Strip):
- Panel 1 (rot): Agenda-Liste
- Panel 2 (schwarz): Discours Agités (Journal)
- Panel 3 (weiß): ProjekteList + aktuelle Route (`/alit`, `/newsletter`, `/mitgliedschaft`, `/projekte/<slug>`)

**Dashboard** (`/dashboard/`): 6 Content-Tabs (Agenda, Discours, Über Alit, Mitgliedschaft & Newsletter, Projekte, Medien). Rich-Text-Editor mit Toolbar, MediaPicker Modal, Drag-Reorder, Dirty-Editor-Guard mit Flush-on-Stay.

**Key files:**
- `src/app/layout.tsx` — Root layout + metadataBase
- `src/proxy.ts` — Dashboard auth guard + Sprint D1 CSP Report-Only decoration (Edge Runtime). Renamed from middleware.ts in PR #83.
- `src/lib/csp.ts` — Edge-safe CSP helper: generateNonce, buildCspPolicy, normalizeCspReport
- `src/app/api/csp-report/route.ts` — CSP violation collection endpoint (streaming body-cap, legacy+modern normalization)
- `src/lib/db.ts` — pg Pool singleton
- `src/lib/schema.ts` — `ensureSchema()` at boot, i18n-native Tabellen
- `src/lib/auth.ts` — bcrypt + JWT (HS256 pinned, claim `{sub, tv}`), login reads env-scoped tv via `getTokenVersion` without bumping
- `src/lib/auth-cookie.ts` — Edge-safe Leaf: `verifySessionDualRead` (returns `{userId, tokenVersion, source}`), `setSessionCookie` (atomic legacy-clear), `setCsrfCookie`, `clearSessionCookies` (session + legacy + CSRF, `.set("",{maxAge:0,...})` pattern)
- `src/lib/runtime-env.ts` — Edge-safe `deriveEnv(SITE_URL): "prod"|"staging"` shared helper
- `src/lib/session-version.ts` — Node-only `getTokenVersion(userId, env)` + `bumpTokenVersionForLogout(userId, env, expectedTv)` for `admin_session_version` Table
- `src/lib/csrf.ts` — Edge-safe `buildCsrfToken(secret, userId, tv)`, `validateCsrfPair`, `timingSafeEqualBytes` (XOR-accumulator, no node:crypto)
- `src/app/api/auth/csrf/route.ts` — GET endpoint, auth-gated, issues CSRF cookie + body-token
- `src/app/dashboard/(authed)/layout.tsx` — Server Component route-group guard: env-scoped DB-tv-check + redirect-to-login on mismatch (no cookie-clear — stale cookies inert by design)
- `src/app/dashboard/lib/dashboardFetch.ts` — Client wrapper: cached CSRF token, auto-attach x-csrf-token, 403-refresh-retry on `code:"csrf_*"`, 401-redirect
- `src/lib/cookie-counter.ts` — Node-only `bumpCookieSource` mit stdout-Fallback
- `src/lib/jwt-algorithms.ts` — Shared `JWT_ALGORITHMS = ["HS256"]` const gegen sign/verify-drift
- `src/instrumentation.ts` — eager env validation + schema bootstrap
- `src/lib/i18n-field.ts` — `t()`, `isEmptyField()`, `hasLocale()` für `*_i18n` JSONB
- `nginx/alit.conf` + `nginx/alit-staging.conf` — Security-Header, Dotfile-Block, certbot-managed

---

## DB Schema (Stand 2026-04-17, i18n-native)

- `agenda_items`, `journal_entries`, `projekte`, `alit_sections` — alle mit `*_i18n` JSONB als einzige Content-Quelle (Legacy-Spalten gedroppt)
- `projekte.slug_de` (immutable NOT NULL canonical), `slug_fr` (mutable optional)
- `media` (bytea, public_id UUID), `site_settings`, `admin_users`, `audit_events`
- `memberships`, `newsletter_subscribers` (Sprint 6)
- `auth_method_daily` (Sprint B Cookie-Migration Observability — DATE/source/env/count, droppable nach Sprint C Flip)
- `admin_session_version(user_id, env, token_version, updated_at, PRIMARY KEY(user_id, env))` — T1-S env-scoped session rotation; missing row = tv=0 (legacy JWTs valid until next logout-bump)

---

## Styling Rules

- Tailwind v4 mit `@theme` in globals.css, CSS custom properties
- Self-hosted **PP Fragment Sans** (Light 300, Regular 400, ExtraBold 800) in `public/fonts/`
- Fluid Typography via `clamp()` auf alle Text- und Spacing-Tokens
- Safe-Area-Insets dynamisch via `data-primary` Attribut
- Breakpoints: <768 (mobile accordion), 768–1023 (tablet), 1024+ (desktop), 1440+ (kein center)

---

## Deployment

- **Prod Container:** `alit-web` auf Port 127.0.0.1:3100 → 3000
- **Staging Container:** `alit-staging` auf Port 127.0.0.1:3102 → 3000
- **CI:** GitHub Actions — `deploy.yml` (main → prod), `deploy-staging.yml` (nicht-main Branches → staging)
- **ssh-action SHA-pinned:** `appleboy/ssh-action@0ff4204d59e8e51228ff73bce53f80d53301dee2  # v1.2.5`
- **nginx-Config-Deploy:** nicht in CI — manueller Pre-Merge-Checkpoint: SSH → `cp /opt/apps/alit-website-staging/nginx/<name>.conf /etc/nginx/sites-available/<name>` → `nginx -t` → `systemctl reload nginx`
- **⚠️ Staging + Prod teilen die DB** — Staging-Push IST DDL-Deploy. Siehe `memory/lessons.md`.
- **Dependabot:** weekly npm + github-actions, next/react Major-Bumps ignored (manuell)

---

## Git Hooks (shared Vibe-Coding)

`core.hooksPath` zeigt auf `~/Dropbox/HIHUYDO/01 Projekte/00 Vibe Coding/hooks/`. Husky wurde entfernt — shared hooks sind Single Source of Truth.

- **pre-commit**: gitleaks Secret-Scan (`brew install gitleaks` systemweit)
- **post-commit**: Sonnet Spec-Evaluator bei `tasks/spec.md`-Commits
- **pre-push**: qa-report-Gate + Sonnet-Review auf combined diff

Skip: `SKIP_HOOKS=1 git commit/push` oder `--no-verify`.

---

## Project Memory

Read before starting work. Update via `wrap-up` skill at session end.

- **`memory/todo.md`** — offene / erledigte Aufgaben über Sessions hinweg
- **`memory/lessons.md`** — projekt-spezifische Patterns, Pitfalls, Workarounds
- **`memory/project.md`** — Stack, Architektur, Deployment — ausführlicher als dieses File
- **`memory/security.md`** — T0–T3 Security-Checkliste (Kopie aus `00 Vibe Coding/checklists/security.md`)
- **`memory/reference_notion.md`** — Notion Page IDs

**Trennung:** `memory/` = langfristiges Wissen | `tasks/` = kurzfristige Sprint-Artefakte (spec, qa-report, review, aktuelle Aufgaben)

---

## Verification Checklist

Before marking any task done:
1. `pnpm build` passes (no TypeScript errors)
2. `pnpm test` passes (168+ tests)
3. `pnpm audit --prod` → 0 HIGH/CRITICAL
4. Für UI-Features: Dev-Server öffnen und den Flow tatsächlich klicken — Tests prüfen Correctness, nicht Feature-Sichtbarkeit
5. Bei Auth-/DB-/Schema-Änderungen: Staging-Deploy + curl-Smoke auf relevanten Routes, Logs clean (`ssh hd-server 'docker compose logs --tail=30'`)
6. Für Prod-Merge: post-merge Verifikation (CI grün + `/api/health/` + Header-Checks + `docker logs` clean) — siehe shared CLAUDE.md "Deploy-Verifikation"
