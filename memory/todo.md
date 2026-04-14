---
name: Todo alit-website
description: Offene Aufgaben über Sprint-Zyklen hinweg
type: project
---

## Offen

- [ ] **AUCTOR Projekt-Inhalt nachtragen** — `src/content/projekte.ts` und DB enthalten Platzhalter. Originaltext bereitstellen oder Entry entfernen.
- [ ] **Datenschutz-PDF verlinken** — `src/app/[locale]/alit/page.tsx` Impressum-Sektion hat einen `<a href="#">Datenschutz</a>`-Platzhalter.
- [ ] **Schwarze Trennlinie zwischen weißen Panels** — visueller Separator fehlt in bestimmten Panel-Kombinationen (teilweise gelöst mit Leiste-2 Hover-Border).
- [ ] **isSafeUrl deduplizieren** — identische Funktion in RichTextEditor.tsx und journal-html-converter.ts. In shared util extrahieren.
- [ ] **public/journal/ Bilder aufräumen** — nach DB-Migration sind die statischen Dateien nicht mehr nötig. Können entfernt werden.

## Erledigt

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
