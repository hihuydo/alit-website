---
name: Todo alit-website
description: Offene Aufgaben über Sprint-Zyklen hinweg
type: project
---

## Offen

- [ ] **Cleanup-Sprint: Legacy-Spalten droppen** — nach Sprint 1-4 sind alle vier Entities i18n-ready. Cleanup: DROP COLUMN `titel`/`title`/`lead`/`ort`/`beschrieb`/`paragraphs`/`kategorie`/`content`/`footer`/`lines` auf allen Tabellen wo `*_i18n`-Ersatz existiert. Dual-Write-Code aus allen POST/PUT-Handlern entfernen. Reader auf `*_i18n`-only (bereits der Fall). Type-Cleanup in `JournalEntry`, `AgendaItemData`, `Projekt`, `AlitSection`. Erfordert Backup-Check + irreversible Migration — eigener PR mit manueller Prod-Approval. Nicht vor einer ruhigen Deploy-Woche.
- [ ] **URL-Slug-Übersetzung (Mini-Sprint nach Cleanup)** — `projekte.slug_de` + `projekte.slug_fr` mit Unique-Constraint pro Locale. Hashtag-Referenzen (`agenda_items.hashtags[].projekt_slug` + `journal_entries.hashtags[].projekt_slug`) brauchen Resolver oder `{de, fr}`-Shape. Route `/[locale]/projekte/[slug]` wird locale-aware + Redirect-Logik für alte Slugs. Sitemap + `hreflang` auf Detail-Seiten mit beiden Varianten. Scope-relevante Dateien: `src/lib/schema.ts`, `src/lib/queries.ts`, `src/app/[locale]/projekte/[slug]/page.tsx`, `sitemap.ts`, beide Hashtag-Renderer.
- [ ] **public/journal/ Bilder aufräumen** (nicht dringend, ~1.2 MB) — `kanon-aktion.png`, `trobadora-buch.png`, `trobadora-lesung.png` werden in Prod nicht mehr gebraucht (DB-Media). Löschen blockiert aber `src/lib/seed.ts` auf frischen Dev/Staging-DBs, weil `src/content/de/journal/entries.ts` die Pfade noch referenziert. Sauberer Fix erfordert Seed-Erweiterung um Media-Upload — separater kleiner Sprint.
- [ ] **Logo-ZIP-Migration** (optional) — `/public/Alit-Logo-GZD-191030_Presse.zip` in den Medien-Tab hochladen und den Link in der Alit-"Logo"-Sektion auf die neue URL umstellen. Eliminiert den letzten statischen Asset-Pfad in Content.

## Follow-ups aus Review


## Erledigt

- [x] **Datenschutz-PDF verlinkt** (2026-04-15, manueller Admin-Schritt): PDF in Medien-Tab hochgeladen, Über-Alit → Impressum editiert, Datenschutz-Link auf neue URL umgestellt.
- [x] **applyRename Vitest-Tests + Firefox-PDF.js-Manual-Test** (2026-04-15): `applyRename` + Helpers aus `src/app/api/dashboard/media/[id]/route.ts` nach `src/lib/media-rename.ts` extrahiert, 17 Tests in `src/lib/media-rename.test.ts` (extension preservation, mime fallback `.pdf`/`.zip` inkl. Microsoft-Variante, edge cases `.`/`__`/`!!!`/leading-dot/trailing-dot/whitespace). CSP `sandbox`-Kombination mit PDF-`Content-Disposition: inline` in Firefox + Chrome + Safari manuell verifiziert — alle drei rendern PDFs normal, ZIPs werden korrekt als Download ausgeliefert.
- [x] **Review-Follow-ups aufgeräumt** (Branch `chore/review-followups`, 2026-04-15): `MediaItem.used_in[].kind` required, `DocBadge` DOC-Fallback entfernt, `getSiteSetting` gelöscht, Rename-Flow mit `renamingId` Loading-State. Stale Todos entfernt: FR-Locale-Support Alit (Sprint 1 done, PR #33) und Dashboard-Alit-Reload `?locale=` (non-issue — API gibt eine Zeile pro logischer Entity zurück, kein Locale-Scoping nötig).
- [x] **PR #38 Multi-Locale Journal Sprint 4 — letzter Entity-Sprint** (Merge 2026-04-15): JSONB-per-field auf `journal_entries` (title_i18n, content_i18n, footer_i18n) + Hashtag-Shape-Migration auf `{tag_i18n, projekt_slug}`. `author` bleibt single-locale (reale Personennamen). `migrateHashtagShape`-Helper in schema.ts extrahiert (agenda + journal teilen Code). JournalEditor komplett refactored — shared meta (date, author, title_border) + per-locale (title, content, footer) parallel mounted, inline-Hashtag-Logik durch `HashtagEditor showI18n` ersetzt. Codex 2 Runden: P1 `migrateLinesToContent` statt `contentBlocksFromParagraphs` (Image-Placements erhalten), P1 Seed-Analog, P2 DE-Filter nur auf content-Basis. Runde 2 CLEAN. **Alle 4 Entities (Alit, Projekte, Agenda, Journal) sind jetzt i18n-ready** — Cleanup-Sprint (Legacy-Spalten droppen) als Follow-up.
- [x] **PR #37 Hashtag-Editor Auto-Sync FR↔DE** (Merge 2026-04-15): Sprint-3-UX-Fix, FR-Label übernimmt DE-Wert automatisch wenn FR leer ODER FR=bisheriges DE (synced pair).
- [x] **PR #36 Multi-Locale Agenda + Hashtag-Labels Sprint 3** (Merge 2026-04-15): JSONB-per-field auf `agenda_items` (title_i18n, lead_i18n, ort_i18n, content_i18n) + Hashtag-Shape-Migration zu `{tag_i18n: {de, fr}, projekt_slug}[]` (Migration setzt FR=DE für Brand-Names). Sprint-2-Lessons präventiv angewandt (null-guard, dual-write-read-isolation, per-field lang-attribute) — Codex-Review-Runde-1 CLEAN, keine wiederholten P1/P2/P3-Findings. HashtagEditor bekam optionales `showI18n`-Prop (zweites FR-Label-Input), Journal-Hashtags bleiben Sprint-4-Scope. Reader transformiert neue DB-Hashtag-Shape zurück zu Legacy-Public-Shape `{tag, projekt_slug}[]` — `AgendaItem.tsx` + `JournalPreview.tsx` unverändert.
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
