# Spec: Next.js Static Export Umbau
<!-- Created: 2026-04-08 -->
<!-- Author: Planner (Claude) -->
<!-- Status: Draft -->

## Summary

Umbau der alit-website von plain HTML/CSS (8 duplizierte Seiten + 1 CSS-Datei) zu Next.js App Router mit Static Export + Tailwind v4. Bestehendes Design wird 1:1 übernommen + Responsive (Mobile) ergänzt. Deployment auf Hetzner VPS via nginx. Zweisprachig (de/fr) mit i18n-Routing — deutsche Version vollständig, französische Struktur vorbereitet. Content in MDX für natürliche Pflege literarischer Texte.

## Context

**Aktueller Stand:**
- 8 HTML-Seiten: index, agenda, projekte, alit, mitgliedschaft, medien, kontakt, newsletter
- 1 CSS-Datei (845 Zeilen) mit allem Styling
- Layout dupliziert auf jeder Seite: Logo (fixed), 3-Spalten-Wrapper (Verein + Leiste-V, Journal + Leiste-J, Stiftung + Leiste-S)
- Journal-Sidebar (~80 Zeilen HTML, 3 Einträge) identisch auf allen Seiten
- Fonts: GT Alpina (serif) + GT Alpina Typewriter (monospace), self-hosted woff2/woff
- Farben: Rot (#ff5048), Schwarz (#000), Lila (#6a27df), Weiss, Grau (#ccc, #999)
- Interaktivität: Panel-Toggle (Verein/Journal/Stiftung), Hamburger-Menu, Accordion (Agenda), Journal-Info-Toggle
- Kein Build-Step, kein Framework

**Stack-Entscheidung:** Next.js statt Vite+React wegen SSG/SEO-Vorteilen bei einer öffentlichen Vereins-Website.

**Referenz:** CLAUDE.md Patterns für React, Tailwind v4, Deployment (Hetzner), pnpm.

## Requirements

### Must Have

1. Next.js 15 App Router mit `output: 'export'` (Static Export)
2. Tailwind v4 Setup mit CSS-Variablen in `@theme {}`
3. Shared Layout-Komponente mit: Logo (fixed), Wrapper, 3 Leisten, Panel-Toggle-Logik
4. Journal-Sidebar als shared Komponente (einmal pflegen, überall nutzen)
5. Stiftung-Panel als shared Komponente
6. Navigation mit aktiver Seite, Hamburger-Menu, Sprach-Switcher
7. Alle 8 Seiten als Routes mit identischem Content wie aktuell
8. GT Alpina Fonts via `next/font/local`
9. Self-hosted Fonts in `public/fonts/`
10. Design-Pixel-genau wie aktueller Stand (gleiche Farben, Sizes, Spacing, Hover-Effekte)
11. `pnpm` als Package Manager
12. Static Export produziert Dateien die nginx direkt servieren kann

### Nice to Have (if time permits)

1. SEO Meta-Tags pro Seite (`<title>`, `<meta description>`, Open Graph)
2. Security Headers in nginx-Config dokumentieren

### Out of Scope

- CMS-Anbindung
- Dynamische Features (API Routes, Server-Side)
- Formular-Backend für Mitgliedschaft (bleibt static form)
- Redesign — bestehendes Design wird 1:1 übernommen, Responsive wird ergänzt
- E2E Tests
- CI/CD Pipeline (kommt separat)

## Technical Approach

### Projektstruktur

```
alit-website/
├── src/
│   ├── app/
│   │   ├── [locale]/
│   │   │   ├── layout.tsx          # Locale Layout (Logo, Wrapper, Leisten, Panels)
│   │   │   ├── page.tsx            # Aktuell (Homepage)
│   │   │   ├── agenda/page.tsx
│   │   │   ├── projekte/page.tsx
│   │   │   ├── alit/page.tsx
│   │   │   ├── mitgliedschaft/page.tsx
│   │   │   ├── medien/page.tsx
│   │   │   ├── kontakt/page.tsx
│   │   │   └── newsletter/page.tsx
│   │   ├── layout.tsx              # Root Layout (html, body, fonts)
│   │   └── page.tsx                # Redirect / → /de
│   ├── components/
│   │   ├── Logo.tsx
│   │   ├── Navigation.tsx          # Menu-Bar + Hamburger + Nav-List
│   │   ├── LeisteVerein.tsx
│   │   ├── LeisteJournal.tsx
│   │   ├── LeisteStiftung.tsx
│   │   ├── JournalSidebar.tsx      # Komplettes Journal-Panel inkl. Entries
│   │   ├── StiftungPanel.tsx
│   │   └── VereinLayout.tsx        # Verein-Spalte: Menu-Bar + Content-Slot
│   ├── content/
│   │   ├── de/
│   │   │   ├── journal/            # MDX-Dateien pro Eintrag
│   │   │   ├── pages/              # MDX-Dateien pro Seite (alit, kontakt etc.)
│   │   │   └── agenda.ts           # Strukturierte Agenda-Daten
│   │   └── fr/                     # Gleiche Struktur, französisch (später)
│   └── i18n/
│       ├── config.ts               # Locales, Default-Locale
│       └── dictionaries.ts         # UI-Strings (Navigation, Labels)
├── public/
│   └── fonts/                      # GT Alpina woff2/woff
├── next.config.ts
├── package.json
└── tsconfig.json
```

### Architecture Decisions

- **App Router statt Pages Router** — aktueller Standard, bessere Layout-Verschachtelung
- **`[locale]` Dynamic Segment** — i18n via `/de/...` und `/fr/...` Routing, kein externes i18n-Paket nötig. `generateStaticParams` exportiert beide Locales für Static Export.
- **Root Layout enthält das 3-Spalten-Layout** — jede Page liefert nur den Verein-Content, Rest ist shared
- **Client Components nur wo nötig** — Panel-Toggle, Hamburger, Accordion sind `'use client'`; der Rest ist Server Components
- **Tailwind v4 mit CSS-Variablen** — Farben und Spacing als Design Tokens in `@theme {}`
- **MDX für Content** — Journal-Entries und Seiteninhalte als MDX-Dateien. Natürliche Formatierung für literarische Texte, einfach zu pflegen, typisierte Frontmatter.
- **`next/font/local`** — für GT Alpina, eliminiert FOUT und externe Requests
- **Keine Magic Pixel-Werte im CSS** — Base Unit 26.667px wird als CSS Custom Property definiert
- **Mobile-First Responsive** — 3-Spalten-Layout kollabiert zu einer Spalte auf Mobile. Leisten werden horizontal. Journal/Stiftung als Overlay oder Tab.

### Design Tokens (Tailwind v4)

```css
@theme {
  --color-verein: #ff5048;
  --color-journal: #000;
  --color-stiftung: #6a27df;
  --color-bg: #ccc;
  --color-meta: #999;

  --font-serif: 'gt_alpina', Baskerville, 'Palatino Linotype', Palatino, serif;
  --font-mono: 'gt_alpina_typewriter', 'Courier New', monospace;

  --spacing-base: 26.667px;
  --spacing-half: 13.333px;
  --spacing-double: 53.334px;

  --text-body: 26.667px;
  --text-title: 38.667px;
  --text-leiste: 34.667px;
  --text-journal: 20px;
  --text-meta: 17px;

  --leiste-width: 63px;
  --leiste-s-width: 60px;
  --logo-width: 60px;
  --logo-height: 79px;
}
```

### Migration Strategie

Seite für Seite migrieren, nach jeder Seite visuell vergleichen:

1. Projekt-Setup + Layout-Shell
2. Homepage (index) als erste Seite
3. Remaining Pages (einfache Content-Seiten zuerst, komplexe zuletzt)
4. Agenda (Accordion-Logik)
5. Mitgliedschaft (Formular)
6. Cleanup + Optimierung

### Dependencies

- **Externe:** keine (Newsletter-Link geht extern zu Mailchimp)
- **Packages:** next, react, react-dom, tailwindcss, @tailwindcss/postcss, typescript
- **Fonts:** bereits vorhanden in `public/fonts/`

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| Alle Panels geschlossen | Nur Leisten sichtbar, kein Content-Bereich |
| Browser ohne JS | Static HTML rendert korrekt (SSG), aber Toggle/Accordion nicht interaktiv |
| Mobile Viewport | 3-Spalten kollabiert: nur Verein-Content sichtbar, Journal/Stiftung via Leisten-Tap erreichbar |
| Sehr langer Journal-Eintrag | Scrollbar hidden, aber scrollbar via Touch/Mouse |
| Navigation: aktive Seite | Wird aus der Nav-Liste ausgeblendet (`display: none`) |

## Risks

- **Tailwind v4 CSS-Variablen-Syntax** — `@theme {}` statt alter Config-Datei. Pattern aus `patterns/tailwind.md` beachten.
- **Pixel-genaue Übernahme** — Sub-Pixel-Werte (26.667px) können bei Tailwind-Utilities Rundungsprobleme verursachen → Custom Properties verwenden statt Utility-Klassen für diese Werte
- **`next/font/local` mit woff+woff2** — Muss beide Formate registrieren
- **Static Export Limitierungen** — Kein `revalidate`, kein Middleware, keine API Routes. Für diese Seite kein Problem.
