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
- [ ] Next.js 15 Projekt initialisieren mit pnpm, TypeScript, App Router
- [ ] Tailwind v4 Setup mit PostCSS
- [ ] Design Tokens definieren (Farben, Fonts, Spacing) in `@theme {}`
- [ ] GT Alpina Fonts via `next/font/local` einbinden
- [ ] `next.config.ts` mit `output: 'export'` konfigurieren
- [ ] i18n Config: Locales (de, fr), Default-Locale (de), Dictionaries
- [ ] MDX Setup (`@next/mdx` oder manuelles Parsing)
- [ ] Alte HTML/CSS Dateien in `_reference/` verschieben (nicht löschen)

### Phase 2 — Layout-Shell
- [ ] Root Layout (`layout.tsx`): html, body, Fonts
- [ ] Locale Layout (`[locale]/layout.tsx`): Logo, Wrapper, alle Leisten, Panels
- [ ] Logo-Komponente mit SVG + Hover-Effekt
- [ ] Leisten-Komponenten (Verein/Journal/Stiftung) mit Toggle-Logik
- [ ] VereinLayout-Komponente: Menu-Bar + scrollbarer Content-Slot
- [ ] Navigation-Komponente mit Hamburger, Nav-List, aktive Seite, Sprach-Switcher
- [ ] JournalSidebar-Komponente mit Info-Toggle + Entries aus MDX
- [ ] StiftungPanel-Komponente
- [ ] Journal-Entries als MDX-Dateien in `src/content/de/journal/`

### Phase 3 — Seiten migrieren
- [ ] Homepage (`/de`) — Aktuell-Text
- [ ] Projekte (`/de/projekte`) — Projekt-Liste
- [ ] Über Alit (`/de/alit`) — Vereins-Info + Sections
- [ ] Medien (`/de/medien`) — Logo-Download
- [ ] Kontakt (`/de/kontakt`) — Adresse + Impressum
- [ ] Newsletter (`/de/newsletter`) — Text + Mailchimp-Link
- [ ] Mitgliedschaft (`/de/mitgliedschaft`) — Formular
- [ ] Agenda (`/de/agenda`) — Accordion-Items
- [ ] `/fr/` Platzhalter-Seiten mit "Bientôt disponible" o.ä.

### Phase 4 — Responsive
- [ ] Mobile Breakpoint definieren (< 768px)
- [ ] 3-Spalten → 1-Spalte auf Mobile
- [ ] Leisten horizontal am unteren Rand oder als Tabs
- [ ] Journal/Stiftung per Tap auf Leiste ein-/ausblenden (Overlay)
- [ ] Navigation: Hamburger-Menu bleibt, volle Breite
- [ ] Formular (Mitgliedschaft): Stack auf Mobile

### Phase 5 — Feinschliff
- [ ] Hover-Effekte: Links italic, Leisten weiss, Logo invertiert
- [ ] Scrollbar hidden auf Verein-Content + Journal-Content
- [ ] Transitions: Panel-Toggle (0.3s), Nav-List (0.8s), Journal-Info (0.8s), Accordion (0.5s)
- [ ] Visueller Vergleich: jede Seite gegen aktuellen HTML-Stand prüfen
- [ ] `pnpm build` + Static Export testen
- [ ] Console-Errors prüfen

## Notes
- Sub-Pixel-Werte (26.667px) als CSS Custom Properties, nicht als Tailwind Utilities
- `'use client'` nur für: Panel-Toggle-State, Hamburger-Toggle, Accordion, Journal-Info-Toggle
- Alte HTML-Dateien als Referenz behalten bis Umbau abgeschlossen
- Pattern: `noUncheckedSideEffectImports: false` in tsconfig für CSS-Imports (patterns/tailwind.md)
- MDX-Dateien pro Locale in `src/content/de/` und `src/content/fr/`
- `generateStaticParams` in `[locale]/layout.tsx` für Static Export mit beiden Locales
