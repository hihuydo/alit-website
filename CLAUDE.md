# alit-website — Claude Code Instructions
# Last updated: 2026-04-17 — T0-Auth-Hardening Sprint A merged (PR #69)
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
| Backend | Next.js API Routes |
| Database | PostgreSQL 16 (hd-server), JSONB-per-field i18n (`*_i18n` columns) |
| Auth | bcryptjs cost 12 via `BCRYPT_ROUNDS` env + dynamischer DUMMY_HASH + Rehash-on-Login, `login(email, password, ip)` 3-arg, jose JWT HS256 24h, HttpOnly Cookie (`session` → `__Host-session` in Sprint B) |
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

# Tests (168 passing)
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
- `src/middleware.ts` — Dashboard auth guard (Edge Runtime)
- `src/lib/db.ts` — pg Pool singleton
- `src/lib/schema.ts` — `ensureSchema()` at boot, i18n-native Tabellen
- `src/lib/auth.ts` — bcrypt + JWT (HS256 pinned)
- `src/instrumentation.ts` — eager env validation + schema bootstrap
- `src/lib/i18n-field.ts` — `t()`, `isEmptyField()`, `hasLocale()` für `*_i18n` JSONB
- `nginx/alit.conf` + `nginx/alit-staging.conf` — Security-Header, Dotfile-Block, certbot-managed

---

## DB Schema (Stand 2026-04-17, i18n-native)

- `agenda_items`, `journal_entries`, `projekte`, `alit_sections` — alle mit `*_i18n` JSONB als einzige Content-Quelle (Legacy-Spalten gedroppt)
- `projekte.slug_de` (immutable NOT NULL canonical), `slug_fr` (mutable optional)
- `media` (bytea, public_id UUID), `site_settings`, `admin_users`, `audit_events`
- `memberships`, `newsletter_subscribers` (Sprint 6)

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
