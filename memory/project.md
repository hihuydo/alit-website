---
name: Projektstand alit-website
description: Stack, Architektur und Deployment-Status der alit-website
type: project
---

Last updated: 2026-04-15 (Sprint 5: locale-specific URL-Slugs für Projekte — `slug_de` immutable, `slug_fr` optional, 308-Repair-Redirect, Sitemap + hreflang + metadataBase SEO-Foundation)

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
- **Panel 3 (weiß)** rendert `<LanguageBar />` + `<NavBars />` + **immer `<ProjekteList />`** + aktuelle Route (`children`). ProjekteList liegt dort statt in einzelnen Pages → auf jeder Route (inkl. /alit, /newsletter, /mitgliedschaft) scrollbar erreichbar.
- Panel 3 promoted sich auch bei `/projekte/<slug>` automatisch zu primary → Hashtag-Klick öffnet Panel 3 groß
- Alle Content-Daten (Agenda, Discours Agités, Projekte) kommen aus PostgreSQL, geseeded aus den ursprünglichen TS-Dateien
- Agenda-Einträge haben `hashtags` (Projekt-Verknüpfungen, Klick → /projekte/<slug>), `lead` (optionaler Teaser) und `images` (Multi-Upload mit Portrait/Landscape-Grid) — Bilder nur im expanded view sichtbar
- Discours-Agités-Einträge haben `hashtags` wie Agenda

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
- 6-Tab UI: Agenda, **Discours Agités** (ex Journal), Projekte, Medien, **Über Alit**, Konto
- CRUD für alle 3 Content-Types via `/api/dashboard/...`
- **Rich-Text-Editor** (contentEditable + Toolbar) für alle 3 Content-Bereiche. Toolbar: B/I, H2/H3/Zitat, Link, Medien + BU (Bildunterschrift)
- **Medien-Tab**: Upload (Bilder max 5 MB, Videos max 50 MB, PDF/ZIP max 50 MB), Grid/List View, URL-Kopieren, Umbenennen, Download (force-attachment via `?download=1`), Verwendungs-Anzeige aus agenda_items + journal_entries + alit_sections
- **Über-Alit-Tab**: strukturierte Sektionen (title nullable, Rich-Text content, Drag-Reorder). Rendering keyed off title (no title = intro-style ohne Wrapper/h3), reorder-safe. Multi-Locale via JSONB-per-field (`title_i18n`, `content_i18n` mit `{de, fr}`-Shape); Editor-Modal mit DE/FR-Tabs, beide Editoren parallel mounted; Website rendert FR mit DE-Fallback (lang="de" auf Fallback-Wrappern)
- **MediaPicker**: Modal im Editor mit Medienbibliothek + YouTube/Vimeo Embed (Agenda + Journal)
- Medien in PostgreSQL `bytea` gespeichert, öffentlich via UUID-URLs (`/api/media/<uuid>/`)
- Drag & Drop Reordering für Agenda, Discours Agités, Projekte — sichtbare Grip-Handles + Reorder-Hint
- Block-Typen: paragraph, heading, quote, highlight, caption, image, video, embed, spacer
- **Agenda-Editor**: Lead-Textarea, Multi-Bild-Upload (Orientation client-seitig probed), Hashtag-Editor, Vorschau-Toggle (live AgendaItem-Render)
- **Discours-Agités-Editor**: Hashtag-Editor, Auto-Save (3s Debounce, lässt hashtags weg während incomplete)
- **Hashtags (Agenda + Discours)**: feste 9er-Liste (lyriktalk, lyriktisch, zürcherliteraturwerkstatt, schweizerliteraturwerkstatt, reihederautor:innen, weltenliteratur, essaisagités, discoursagités, netzwerkfuerliteratur*en), jeder Tag wird an ein Projekt verknüpft
- Neueste Einträge immer oben (sort_order DESC, Reorder invertiert)
- Sections fetchen beim Mount eigene Daten (verhindert stale state bei Tab-Wechsel)
- Account-Settings: E-Mail + Passwort ändern (mit Current-Password-Verification)
- Auth-Hardening: Rate Limiting, Audit Logs, Timing-Oracle-Schutz, Transaction für Account-Updates
- Middleware schützt alle `/dashboard/*` Routes

## Routes
- `/de/` → zeigt Projekte-Liste (kein Redirect)
- `/de/projekte/` → Liste, kein Item expanded
- `/de/projekte/[slug]/` → Liste mit dem matching Slug expanded. Slug-Resolution nutzt `getProjekte(locale)` (locale-visibility-safe), matched gegen `slug_de || slug_fr`. Bei Locale/Slug-Mismatch: 308 `permanentRedirect` auf korrekten `urlSlug` (= `slug_fr ?? slug_de` für FR, `slug_de` für DE). Bei DE-gefiltertem Projekt → `notFound()`.
- `/de/alit/` → Logo + Impressum (Medien + Kontakt redirecten hierhin)
- `/de/mitgliedschaft/` und `/de/newsletter/` → Client Components mit Form-Validation
- `/de/agenda/` → 301 Redirect auf `/de/`
- `/sitemap.xml` → DB-backed, `force-dynamic`, emission-rule: DE+FR→beide Locales mit hreflang, DE-only→ein Eintrag kein FR-Alternate, kein DE→skip
- Alle Routes spiegeln sich unter `/fr/`

## SEO
- Root `src/app/layout.tsx` setzt `metadataBase: getSiteUrl()` — absolute URLs für alle metadata-Emitters
- `src/lib/site-url.ts` kapselt `process.env.SITE_URL` mit Default `https://alit.hihuydo.com`
- Container-Env hart im jeweiligen Docker-Compose: Prod `SITE_URL=https://alit.hihuydo.com`, Staging `SITE_URL=https://staging.alit.hihuydo.com` (shared `.env`-Symlink, daher Override via `environment:`)
- Projekt-Detail-Seiten `generateMetadata` mit `alternates.canonical` + `languages: {de, fr, x-default}` — gated auf Visibility (has_de/has_fr + slug_fr), nur reachable URLs werden emittiert
- Hashtag-Resolver: `AgendaItem`/`JournalSidebar` bekommen `projektSlugMap` prop (keyed by slug_de). Map-Hit → `<Link>`, Map-Miss → `<span>` (locale-hidden Projekt → kein broken link)

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
