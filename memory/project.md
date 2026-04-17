---
name: Projektstand alit-website
description: Stack, Architektur und Deployment-Status der alit-website
type: project
---

Last updated: 2026-04-17 (PR #57: paid-Toggle Safety — Confirm-on-Untoggle Modal + paid_at-Preserve-Semantik; PR #56: Audit-Dashboard-View mit audit_events-Tabelle + PaidHistoryModal für Mitgliedschafts-Verlauf)

## Stack
- Next.js 16 (App Router, standalone output)
- React 19, TypeScript, Tailwind v4
- PostgreSQL (auf Hetzner VPS, DB `alit`, User `alit_user`)
- i18n: eigenes Dictionary-System (de/fr), kein externer Provider
- pnpm
- Schrift: PP Fragment Sans (Light 300, Regular 400, ExtraBold 800), self-hosted woff2/woff in `public/fonts/`
- Auth: bcryptjs + jose (JWT), HttpOnly Cookies, Rate Limiting
- Testing: Vitest 4.1 + `@testing-library/react` + `jsdom` (per-file `// @vitest-environment jsdom` pragma; globale env bleibt `node`, `*.test.tsx` includiert)

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
- Top-Header: `alit Dashboard` links, **Konto + Abmelden** rechts (Konto raus aus Tab-Reihe — beide sind Session-/User-Aktionen)
- 6 Content-Tabs (uniform white/black-border-Style, aktiver invertiert): Agenda, **Discours Agités** (ex Journal), **Über Alit**, **Mitgliedschaft & Newsletter** (Sprint 6), Projekte, Medien
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
- **Mitgliedschaft & Newsletter Tab** (Sprint 6 + PR #54/56/57): Sub-Tab-Toggle "Mitgliedschaften / Newsletter" (jede Liste behält eigene Sortierung + Selection beim Switch), Tabellen mit klickbarem Datums-Sort (↑/↓), Per-Zeile + Master-Checkbox für selective CSV-Export (client-seitig via `toCsv`-Lib mit Formula-Injection-Guard für `=/+/-/@/TAB/CR`-Zellen). DSGVO-Delete idempotent 204 + Audit (`signup_delete` mit actor_email/type/row_id). Bulk-Delete (PR #52) via POST `/api/dashboard/signups/bulk-delete/` mit Cap 500. **Paid-Toggle (PR #54/57)**: Checkbox-Spalte "Bezahlt" mit optimistic-UI + per-row single-flight (`paidToggling: Set<number>`). ON→OFF öffnet Confirm-Modal (asymmetrisch — OFF→ON bleibt 1-Klick Happy-Path). SQL `UPDATE … SET paid_at = CASE WHEN $1 AND NOT paid THEN NOW() ELSE paid_at END` — "zuletzt-bezahlt"-Semantik, Preserve bei Untoggle. Tooltip: paid=true→"Seit {date}", paid=false+paid_at→"Zuletzt bezahlt: {date}", else "Als bezahlt markieren". **Verlauf-Spalte (PR #56)**: 🕐-Icon öffnet PaidHistoryModal mit on-open Fetch gegen `/api/dashboard/audit/memberships/[id]`. Refetch-on-Mount.
- Medien-Tab Default-View: Liste (User kann auf Grid switchen)
- **Dirty-Editor-Guard (Sprint 7 + Sprint 8)**: `DirtyContext` in `src/app/dashboard/DirtyContext.tsx` (Provider wrappt DashboardInner). `useDirty()` exposiert `setDirty(key, bool)` + `confirmDiscard(action)` + **`registerFlushHandler(key, fn): () => void`** (Sprint 8). Top-Tabs, Konto-Button, Abmelden gehen durch `confirmDiscard` → Modal "Ungesicherte Änderungen verwerfen?" bei echten Edits. 5 Editor-Sections melden `isEdited`:
  - Agenda/Discours/Projekte/Alit: snapshot-diff (`JSON.stringify(form) !== initialFormRef.current`), Journal via `hasEditsRef` + `onDirtyChange`-Callback (Sprint 7).
  - **AccountSection (Sprint 8)**: Modul-Level `serializeAccountSnapshot` Helper, `initialSnapshotRef` startet mit pristine serialized `{"","",""}` + `userTouchedRef` sticky (flippt in allen 3 `onChange`-Handlern, nie zurück) als autoritative Touch-Signal-Quelle. Fetch-Guard via `!userTouchedRef.current` (kein form-equality-check — würde "nie getippt" mit "getippt+gelöscht" verwechseln). `isEdited = serialize(form) !== initialSnapshotRef.current` sync-during-render + `lastReportedRef`. Save-Success resetted Snapshot auf fetched-email + leere Passwords.
  - **Flush-on-Stay (Sprint 8)**: Bei "Zurück" im Modal ruft `closeConfirm` selektiv nur Handler für `dirtyRef[key]===true` auf (try/catch pro Handler, `flushRunningRef` re-entrancy guard). JournalEditor registriert Handler der pending `autoSaveTimer` flusht (`clearTimeout + doAutoSave()` synchron) wenn Timer pending, sonst no-op. Flush läuft nur in `closeConfirm` (Zurück), NIE in `handleDiscard` (Verwerfen) — sonst würde Verwerfen die gerade-zu-verwerfenden Daten committen.
- Sync-during-render Pattern (setDirty ist Ref-Mutation, safe im Render-Body) — useEffect-Hop wäre racy mit User-Events. `AbortController` im JournalEditor abortet pending Autosave bei unmount; `AbortError` silent-catch in `JournalSection.handleSave`. `beforeunload` für Browser-Close. State-Guard gegen rapid-Click. Bestehendes `Modal.tsx` wird reused. A11y-Pass (role=dialog, focus-trap, focus-return) als Follow-up. Tests: 12 cases in `DirtyContext.test.tsx` (7 Sprint-7 + 5 Sprint-8 T1-T5).

## Public Signup-Flow (Sprint 6)
- Forms: `/{locale}/newsletter` und `/{locale}/mitgliedschaft` posten an `/api/signup/newsletter` bzw `/api/signup/mitgliedschaft`
- Public POST-Endpoints: Rate-Limit (5/15min Newsletter, 3/15min Mitgliedschaft) keyed by X-Real-IP only (KEIN XFF-Fallback), Honeypot mit non-autofill Field-Name `alit_hp_field` (zählt ins Rate-Limit, sonst silent 200), Consent-Required im Payload (`consent: true` → 400 sonst), Email-Normalisierung (`trim().toLowerCase()`), Errors generisch (`invalid_input` / `rate_limited` / `already_registered` / `server_error`)
- Newsletter: idempotent 200 mit `INSERT ... ON CONFLICT(email) DO NOTHING` (Anti-Enumeration-Oracle)
- Mitgliedschaft: INSERT-first, PG-23505 → 409 `already_registered` (UX-Feedback wertvoller als Anti-Enum). Bei `newsletter_opt_in=true` zusätzlicher Newsletter-Insert in derselben Transaktion mit `ON CONFLICT DO NOTHING`
- IP wird nur als `sha256(IP_HASH_SALT + ip)` gespeichert (DSGVO)
- Forms haben `<label htmlFor>`, `aria-live` Status-Region, FR-Übersetzung im Dictionary (kein extra `locale`-Prop)

## DB-Schema (Stand 2026-04-16)
- 4 Content-Entitäten mit `*_i18n` JSONB-Spalten: `agenda_items`, `journal_entries`, `projekte`, `alit_sections` (siehe Cleanup-Sprint im todo.md für Legacy-Spalten-Drop)
- `media` (BYTEA, public_id UUID), `site_settings`, `admin_users`
- **Sprint 6:** `memberships` (vorname, nachname, strasse, nr, plz, stadt, email CITEXT/TEXT-fallback UNIQUE NOT NULL, newsletter_opt_in BOOL, consent_at NOT NULL, created_at, ip_hash) und `newsletter_subscribers` (vorname, nachname, woher, email UNIQUE, consent_at NOT NULL, created_at, ip_hash, source CHECK IN (`form`, `membership`)). Indices: (created_at DESC, id DESC) auf beiden.

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
- `src/app/robots.ts` — Prod: `Allow: /`, `Disallow: /api/, /dashboard/`, Sitemap-Reference. Staging: `Disallow: /` (hostname-prefix-check auf getSiteUrl, komplementiert nginx X-Robots-Tag). `force-dynamic` aus gleichem Grund wie sitemap.ts (runtime SITE_URL).
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
- Env vars in `/opt/apps/alit-website/.env`: DATABASE_URL, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD_HASH, **IP_HASH_SALT** (≥16 chars, eager-checked in `instrumentation.ts`, MUSS in `docker-compose*.yml` `environment:`-Block via `${IP_HASH_SALT}` durchgereicht werden), SITE_URL
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
