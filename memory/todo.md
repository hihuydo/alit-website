---
name: Todo alit-website
description: Offene Aufgaben über Sprint-Zyklen hinweg
type: project
---

## Offen

- [ ] **Datenschutz-PDF verlinken** (manueller Admin-Schritt, nach PR #31 möglich) — PDF in Medien-Tab hochladen, URL kopieren, Über-Alit → Impressum editieren, href auf den `Datenschutz`-Link ersetzen.
- [ ] **public/journal/ Bilder aufräumen** (nicht dringend, ~1.2 MB) — `kanon-aktion.png`, `trobadora-buch.png`, `trobadora-lesung.png` werden in Prod nicht mehr gebraucht (DB-Media). Löschen blockiert aber `src/lib/seed.ts` auf frischen Dev/Staging-DBs, weil `src/content/de/journal/entries.ts` die Pfade noch referenziert. Sauberer Fix erfordert Seed-Erweiterung um Media-Upload — separater kleiner Sprint.
- [ ] **Logo-ZIP-Migration** (optional) — `/public/Alit-Logo-GZD-191030_Presse.zip` in den Medien-Tab hochladen und den Link in der Alit-"Logo"-Sektion auf die neue URL umstellen. Eliminiert den letzten statischen Asset-Pfad in Content.

## Follow-ups aus Review

- [ ] [UX] Rename-Flow benutzt `window.prompt` ohne Loading-State — nicht schön bei langsamer Verbindung. Quelle: Sonnet PR #31
- [ ] [Code Structure] `MediaItem.used_in[].kind` ist im Client-Interface optional, serverseitig required — einheitlich machen. Quelle: Sonnet PR #31
- [ ] [Code Structure] Dead `DOC`-Fallback-Label in `DocBadge` entfernen (unreachable seit Upload-Allowlist). Quelle: Sonnet PR #31
- [ ] [UX] Dashboard-Alit-Reload hardcodet `de` implizit (`/api/dashboard/alit/` ohne `?locale=`). Fragil sobald FR-UI dazukommt — Locale als Prop/Context durchreichen. Quelle: Sonnet PR #30
- [ ] [Testing] Firefox-PDF.js in Kombination mit `Content-Disposition: inline` + CSP `sandbox` testen (Firefox respektiert CSP für PDFs potenziell, Chrome/Safari nicht). Quelle: Sonnet PR #30
- [ ] [Features] FR-Locale-Support für Über-Alit-Sektionen — DB-Spalte existiert, nur Dashboard-UI fehlt (Locale-Picker + getAlitSections(locale) statt hardcoded 'de'). Quelle: Spec Phase 1-3 Scope
- [ ] [Testing] Vitest-Tests für `applyRename` (extension preservation, mime fallback, edge cases wie "." oder "__"). Aktuell nur manuelles Smoke-Testing.
- [ ] [Code Structure] `getSiteSetting` in queries.ts ist exportiert aber nicht mehr genutzt (war für Datenschutz-Slot gedacht, dann per User-Change-Request verworfen). Entweder löschen oder Use-Case finden. Quelle: Sonnet PR #29

## Erledigt

- [x] **PR #35 Multi-Locale Projekte Sprint 2** (Merge 2026-04-15): JSONB-per-field auf `projekte` (title_i18n + kategorie_i18n + content_i18n), idempotenter JS-Backfill + `contentBlocksFromParagraphs`-Helper (paragraphs → JournalContent-Derivation). Dashboard mit parallel-mounted DE/FR-Tabs inkl. Titel + Kategorie + RichTextEditor pro Locale. Slug-Kollisions-UX mitgenommen (Auto-Slug im 409-Pfad editierbar). Codex 2 Runden: P1 null-payload crash → 400, P2 legacy-fallback-leak im Reader (FR-Text landete auf /de/), P3 per-field lang-Attribute statt card-weit (a11y). Sprint 3–4 (Agenda/Journal) folgen.
- [x] **PR #33 Multi-Locale Foundation + Über-Alit Sprint 1** (Merge 2026-04-15): JSONB-per-field Migration auf `alit_sections` (title_i18n + content_i18n, DE-only Backfill mit FR-Precondition-Abort), `src/lib/i18n-field.ts` mit `t()`/`isEmptyField()`/`hasLocale()` + 17 Unit-Tests, API akzeptiert `{title_i18n, content_i18n}` mit Dual-Write der Legacy-Spalten, Reorder entlockalisiert (eine Zeile pro logischer Entität), Dashboard-Editor mit DE/FR-Tabs (beide Editoren parallel mounted via `hidden`), Completion-Badges in Liste, `getAlitSections(locale)` mit DE-Fallback + `isFallback`-Flag, `lang="de"` auf Fallback-Wrappern. Sonnet-Gate CLEAN, Codex-Review CLEAN (keine Findings). Sprint 2–4 (Projekte/Agenda/Journal) folgen nach demselben Pattern.
- [x] **PR #31 Medien-Tab PDF + ZIP + Rename + Download** (Merge 2026-04-14): Upload akzeptiert application/pdf + application/zip (50 MB), Content-Disposition inline/attachment pro Mime-Type, DocBadge für PDF/ZIP-Tiles, MediaPicker filtert non-embeddable, `?download=1` Query für force-attachment, PUT /api/dashboard/media/[id] für Rename mit Extension-Preservation (+ mime-fallback für bare names), Cache-Control split (immutable für image/video, must-revalidate für disposition-carrying). 3 Codex-Runden, alle P2 gefixt.
- [x] **PR #30 Über-Alit Dashboard-Editor** (Merge 2026-04-14): GET/POST/PUT/DELETE + Reorder API, AlitSection component mit list/form/drag-drop, "Über Alit" Tab im Dashboard. Title-optional (Intro-Style bei leerem Title). 6 Codex-Runden wegen locale-Scoping-Varianten (reorder, POST MAX, GET, PUT locale-mutation).
- [x] **PR #29 Über-Alit Phase 1 DB-Migration** (Merge 2026-04-14): alit_sections + site_settings Tabellen, Seed aus content/de/alit.ts (9 Sektionen), Public /alit rendert aus DB via JournalBlockRenderer. Rendering-Regel position-independent (title-keyed). link.download Feld im Rich-Text-Schema addiert.
- [x] **PR #28 Vitest-Infrastruktur + Unit-Tests** (Merge 2026-04-14): Vitest + Coverage, 27 Tests für media-usage + url-safety. findUsageIn als pure Function extrahiert für testability.
- [x] **PR #27 Refactor-Simplify-Sprint** (Merge 2026-04-14): Media-Registry (buildUsageIndex + MEDIA_REF_SOURCES), journal-style dynamic SET auf agenda + projekte, isSafeUrl konsolidiert.
- [x] **PR #26 Dashboard & Panel-3 Polish** (Merge 2026-04-14): Drag-Handles sichtbar, Agenda + Journal neueste-oben, Agenda-Preview, Agenda/Journal Hashtags mit Projekt-Verknüpfung, Agenda Lead-Feld, Agenda Multi-Image-Upload (Portrait/Landscape-Grid), Agenda-Editor MediaPicker, BU-Button neben Medien, Journal-Tab umbenannt zu Discours Agités, ProjekteList in Wrapper (auf allen Routes), Hashtag-Klick öffnet Panel 3 groß, scrollIntoView für Nav + Projekte, Sections refetchen bei Mount. 4 Codex-Reviews durch, alle Findings fixed oder als Product-Intent dokumentiert.
- [x] Staging-Environment aufgesetzt (alit-staging Container, nginx vhost + SSL, GitHub Action)
- [x] Responsive Design Optimization (Mobile-Accordion, Tablet-Breakpoint, Fluid Typography, Safe-Area-Insets)
- [x] Mobile: Top-Bar mit Logo + d/f, 3-Leisten-Accordion, i-Button in Leiste 2
- [x] Grid-template-rows Accordion-Pattern für AgendaItem + ProjekteList (kein Content-Clipping)
- [x] Nav-Items (Alit/Newsletter/Mitgliedschaft) als Akkordeon in Panel 3
- [x] Archivierte Projekte ans Ende der Liste sortieren
- [x] Alit-Logo klickbar → öffnet Panel 3
- [x] Sprachleiste „d/f" rechtsbündig
- [x] Nav-Leiste: "Netzwerk für Literatur*en" statt "Netzwerk"
- [x] i-bar aus Panel 1 entfernt
- [x] Admin Dashboard mit PostgreSQL Backend (Phase 1–6)
- [x] Account-Settings (E-Mail + Passwort ändern)
- [x] Auth-Hardening (Audit Logs, Account Rate Limiting, Transaction)
- [x] Cookie-Path Fix (/ statt /dashboard)
- [x] Password Eye-Toggle
- [x] Journal-Inhalte von alit.ch übernommen (10 Einträge + 3 Bilder)
- [x] Archivierte Projekte klickbar mit Akkordeon-Transition
- [x] Header-Alignment (Logo, i-bar, Navigation auf einer Linie)
- [x] Initial-Route `/de/` ohne Redirect, Agenda-Route entfernt
- [x] Rich-Text-Editor für Journal (contentEditable + Toolbar)
- [x] Medien-Tab mit Upload, Video/Embed-Support, UUID-URLs
- [x] MediaPicker im Editor (Bibliothek + YouTube/Vimeo Embed)
- [x] Bildbreite-Steuerung (volle/halbe Breite)
- [x] Caption/BU Block-Typ für Bildunterschriften
- [x] Drag & Drop Reordering für Agenda, Journal, Projekte
- [x] Grid/List View + URL-Kopieren in Medien-Seite
- [x] Media-Verwendungs-Anzeige (used_in)
- [x] Rich-Text-Editor für Agenda und Projekte
- [x] Journal-Bilder in DB migriert + Bildunterschriften nachgetragen
- [x] Autor*in in Journal-Vorschau anzeigen
