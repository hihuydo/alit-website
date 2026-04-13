---
name: Projektstand alit-website
description: Stack, Architektur und Deployment-Status der alit-website
type: project
---

Last updated: 2026-04-13

## Stack
- Next.js 16 (App Router, standalone output)
- React 19, TypeScript, Tailwind v4
- PostgreSQL (auf Hetzner VPS, DB `alit`, User `alit_user`)
- i18n: eigenes Dictionary-System (de/fr), kein externer Provider
- pnpm
- Schrift: PP Fragment Sans (Light 300, Regular 400, ExtraBold 800), self-hosted woff2/woff in `public/fonts/`
- Auth: bcryptjs + jose (JWT), HttpOnly Cookies, Rate Limiting

## Architektur (3-Spalten-Layout)
- Wrapper rendert drei `panel`-Spalten + drei `leiste`-Strips, immer **2 von 3 Panels offen** auf Desktop (primary ~70vw, secondary Rest, drittes als 60–63px Strip versteckt)
- **Panel 1 (rot)** rendert `<AgendaPanel />` — Daten aus DB via Props
- **Panel 2 (schwarz)** rendert das `<JournalSidebar />` (Discours Agités) — Daten aus DB via Props
- **Panel 3 (weiß)** rendert `<LanguageBar />` + `<NavBars />` + aktuelle Route (`children`)
- Alle Content-Daten (Agenda, Journal, Projekte) kommen aus PostgreSQL, geseeded aus den ursprünglichen TS-Dateien

## Responsive Layout
- **Breakpoints**: <768 (mobile accordion), 768–1023 (tablet, 60vw primary), 1024+ (desktop default), 1440+ (keine Content-Zentrierung)
- **Mobile**: 3-Leisten-Stack als immer sichtbare Navigation, nur 1 Panel offen, aktives Panel scrollt intern, Layout 100vh-gepinnt
- **Mobile-Top-Bar** mit Logo links + d/f rechts (48px + safe-area-inset-top)
- **i-Button** (Journal-Info) direkt in Leiste 2, State via Wrapper gelifted
- **Fluid Typography** via `clamp()` auf alle Text- und Spacing-Tokens
- **Safe-Area-Insets** dynamisch via `data-primary` auf Leiste 3 oder Panel 3

## Admin Dashboard
- Route: `/dashboard/` (kein Locale-Prefix)
- Login unter `/dashboard/login/` (JWT in HttpOnly Cookie, 24h Expiry)
- 5-Tab UI: Agenda, Journal, Projekte, Medien, Konto
- CRUD für alle 3 Content-Types via `/api/dashboard/...`
- **Rich-Text-Editor** (contentEditable + Toolbar) für alle 3 Content-Bereiche
- **Medien-Tab**: Upload (Bilder max 5 MB, Videos max 50 MB), Grid/List View, URL-Kopieren, Verwendungs-Anzeige
- **MediaPicker**: Modal im Editor mit Medienbibliothek + YouTube/Vimeo Embed
- Medien in PostgreSQL `bytea` gespeichert, öffentlich via UUID-URLs (`/api/media/<uuid>/`)
- Drag & Drop Reordering für Agenda, Journal, Projekte
- Block-Typen: paragraph, heading, quote, highlight, caption, image, video, embed, spacer
- Auto-Save für Journal (3s Debounce)
- Account-Settings: E-Mail + Passwort ändern (mit Current-Password-Verification)
- Auth-Hardening: Rate Limiting, Audit Logs, Timing-Oracle-Schutz, Transaction für Account-Updates
- Middleware schützt alle `/dashboard/*` Routes

## Routes
- `/de/` → zeigt Projekte-Liste (kein Redirect)
- `/de/projekte/` → Liste, kein Item expanded
- `/de/projekte/[slug]/` → Liste mit dem matching Slug expanded
- `/de/alit/` → Logo + Impressum (Medien + Kontakt redirecten hierhin)
- `/de/mitgliedschaft/` und `/de/newsletter/` → Client Components mit Form-Validation
- `/de/agenda/` → 301 Redirect auf `/de/`
- Alle Routes spiegeln sich unter `/fr/`

## Deployment
- Hetzner VPS (135.181.85.55), Docker Container `alit-web`
- Port: 127.0.0.1:3100 → 3000 (intern)
- Server-Pfad: `/opt/apps/alit-website`
- CI/CD: GitHub Actions (`deploy.yml`) — Push auf `main` triggert auto-deploy
- Pipeline: git pull → docker compose build → docker compose up -d
- DB-Zugang: `host.docker.internal`, pg_hba mit `172.16.0.0/12`
- Env vars in `/opt/apps/alit-website/.env`: DATABASE_URL, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD_HASH
- nginx: `client_max_body_size 55m` für Media-Uploads

## Staging
- Container `alit-staging`, Port 127.0.0.1:3102 → 3000
- Server-Pfad: `/opt/apps/alit-website-staging` (eigener Git-Checkout, `.env` Symlink)
- URL: https://staging.alit.hihuydo.com
- CI/CD: `deploy-staging.yml` — Push auf nicht-main Branches triggert auto-deploy
- Pipeline: git fetch → checkout branch → git clean -fdx -e .env → build → up

## Monitoring
- hd-server Dashboard (Monitor ID 11)
- URL: `https://alit.hihuydo.com/api/health/` (trailing slash wegen trailingSlash: true)
- Health-Endpoint: `src/app/api/health/route.ts` → returns "ok"

## Domain
- https://alit.hihuydo.com
