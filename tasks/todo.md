# Sprint: Next.js Static Export Umbau
<!-- Spec: tasks/spec.md -->
<!-- Started: 2026-04-08 -->

## Done-Kriterien
> Alle müssen PASS sein bevor der Sprint als fertig gilt.

- [ ] `pnpm build` passiert ohne Errors
- [ ] `out/` Verzeichnis enthält statische HTML-Dateien für alle Seiten (de + fr Struktur)
- [ ] Alle 8 Seiten visuell identisch zum aktuellen HTML-Stand auf Desktop
- [ ] Mobile Viewport (375px): Layout kollabiert sinnvoll, Content lesbar
- [ ] Panel-Toggle (Verein/Journal/Stiftung) funktioniert auf allen Seiten
- [ ] Hamburger-Menu öffnet/schliesst Navigation
- [ ] Agenda-Accordion expandiert/kollabiert
- [ ] Journal-Info-Toggle funktioniert
- [ ] Navigation zeigt aktive Seite nicht in der Liste
- [ ] GT Alpina Fonts laden korrekt (serif + typewriter)
- [ ] Keine Console-Errors auf allen Seiten
- [ ] Journal-Sidebar Content kommt aus MDX-Dateien (eine Quelle, keine Duplizierung)
- [ ] i18n-Routing funktioniert (`/de/...` Seiten vorhanden, `/fr/...` Platzhalter)
- [ ] Sprach-Switcher wechselt zwischen `/de/` und `/fr/`
- [ ] Static Export kann von nginx direkt serviert werden (keine Node Runtime nötig)

## Tasks

### Phase 1 — Projekt-Setup
- [x] Next.js 15 Projekt initialisieren mit pnpm, TypeScript, App Router
- [x] Tailwind v4 Setup mit PostCSS
- [x] Design Tokens definieren (Farben, Fonts, Spacing) in `@theme {}`
- [x] GT Alpina Fonts via `next/font/local` einbinden
- [x] `next.config.ts` mit `output: 'export'` konfigurieren
- [x] i18n Config: Locales (de, fr), Default-Locale (de), Dictionaries
- [x] MDX Setup (`@next/mdx` oder manuelles Parsing)
- [x] Alte HTML/CSS Dateien in `_reference/` verschieben (nicht löschen)

### Phase 2 — Layout-Shell
- [x] Root Layout (`layout.tsx`): html, body, Fonts
- [x] Locale Layout (`[locale]/layout.tsx`): Logo, Wrapper, alle Leisten, Panels
- [x] Logo-Komponente mit SVG + Hover-Effekt
- [x] Leisten-Komponenten (Verein/Journal/Stiftung) mit Toggle-Logik
- [x] VereinLayout-Komponente: Menu-Bar + scrollbarer Content-Slot
- [x] Navigation-Komponente mit Hamburger, Nav-List, aktive Seite, Sprach-Switcher
- [x] JournalSidebar-Komponente mit Info-Toggle + Entries aus MDX
- [x] StiftungPanel-Komponente
- [x] Journal-Entries als MDX-Dateien in `src/content/de/journal/`

### Phase 3 — Seiten migrieren
- [x] Homepage (`/de`) — Aktuell-Text
- [x] Projekte (`/de/projekte`) — Projekt-Liste
- [x] Über Alit (`/de/alit`) — Vereins-Info + Sections
- [x] Medien (`/de/medien`) — Logo-Download
- [x] Kontakt (`/de/kontakt`) — Adresse + Impressum
- [x] Newsletter (`/de/newsletter`) — Text + Mailchimp-Link
- [x] Mitgliedschaft (`/de/mitgliedschaft`) — Formular
- [x] Agenda (`/de/agenda`) — Accordion-Items
- [x] `/fr/` Platzhalter-Seiten mit "Bientôt disponible" o.ä.

### Phase 4 — Responsive
- [x] Mobile Breakpoint definieren (< 768px)
- [x] 3-Spalten → 1-Spalte auf Mobile
- [x] Leisten horizontal am unteren Rand oder als Tabs
- [x] Journal/Stiftung per Tap auf Leiste ein-/ausblenden (Overlay)
- [x] Navigation: Hamburger-Menu bleibt, volle Breite
- [x] Formular (Mitgliedschaft): Stack auf Mobile

### Phase 5 — Feinschliff
- [x] Hover-Effekte: Links italic, Leisten weiss, Logo invertiert
- [x] Scrollbar hidden auf Verein-Content + Journal-Content
- [x] Transitions: Panel-Toggle (0.3s), Nav-List (0.8s), Journal-Info (0.8s), Accordion (0.5s)
- [x] Visueller Vergleich: jede Seite gegen aktuellen HTML-Stand prüfen
- [x] `pnpm build` + Static Export testen
- [x] Console-Errors prüfen

## Notes
- Sub-Pixel-Werte (26.667px) als CSS Custom Properties, nicht als Tailwind Utilities
- `'use client'` nur für: Panel-Toggle-State, Hamburger-Toggle, Accordion, Journal-Info-Toggle
- Alte HTML-Dateien als Referenz behalten bis Umbau abgeschlossen
- Pattern: `noUncheckedSideEffectImports: false` in tsconfig für CSS-Imports (patterns/tailwind.md)
- MDX-Dateien pro Locale in `src/content/de/` und `src/content/fr/`
- `generateStaticParams` in `[locale]/layout.tsx` für Static Export mit beiden Locales
