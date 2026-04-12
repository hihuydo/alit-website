# Spec: Responsive Design Optimization
<!-- Created: 2026-04-12 -->
<!-- Updated: 2026-04-12 — mobile-layout pivot to accordion per user feedback -->
<!-- Author: Planner (Claude) -->
<!-- Status: In progress -->

## Summary
Mobile + Tablet + Wide Screens sauber abdecken. 3-Panel-Architektur bleibt auf Desktop; auf Mobile wird sie zum **Stacked-Accordion** umgebaut: drei Leisten sind immer sichtbar als Navigation-Header, nur ein Panel offen, restliche geschlossen. Kein Burger-Menü. Dazu fehlendes Viewport-Meta, nicht-skalierbare Schriften, Tablet-Breakpoint.

## Context
- Ist-Stand: nur ein Breakpoint `@media (max-width: 767px)` in `globals.css`
- 3 Panels (Agenda, Discours Agités, Netzwerk)
- **`<meta viewport>` fehlte** in beiden Layouts (root + [locale]) — iOS zoomte falsch
- Font-Sizes waren fixe px-Werte — zu groß auf schmalen Screens
- Form `.form-row` stacked auf Mobile
- Dashboard-Layout hatte ebenfalls kein Viewport-Meta

## Requirements

### Must Have
1. **Viewport-Meta** in beiden Root-Layouts (öffentlich + `/dashboard`)
2. **Fluid Typography** mit `clamp()` für Body, Title, Leiste, Journal, Meta
3. **Tablet-Breakpoint** (768–1023px): 3 Panels sichtbar, feinere Proportionen
4. **Desktop** (1024–1439px): ursprüngliches Verhalten
5. **Wide-Screen** (≥1440px): KEINE Content-Zentrierung (User-Entscheidung — ursprünglich geplant, zurückgenommen)
6. **Mobile-Layout: Accordion** — drei Leisten gestapelt als Navigation, nur ein Panel offen, scrollt intern, Leisten pinned im Viewport (100vh)
7. **Mobile-Top-Bar** mit Logo (links) + d/f-Switcher (rechts), 48px hoch
8. **i-Button** (Journal-Info) direkt in Leiste 2 integriert auf Mobile
9. **Form-Eingaben** auf Mobile nicht überlaufend, Input-Font ≥ 16px (iOS-Zoom-Prevention)
10. **Bilder** nicht überlaufend (max-width: 100%)
11. **Safe-Area-Insets** für iPhone Home-Indicator (dynamisch auf Leiste 3 oder Panel 3)

### Nice to Have
1. Landscape-Mobile-Handling
2. `hide-scrollbar` utility auf allen scroll-containern

### Out of Scope
- Burger-Menü (explizit ausgeschlossen)
- Bottom-Tab-Bar (erste Idee, ersetzt durch Accordion-Stack)
- Single-Column-Redesign wie alit.ch live (evaluiert, gegen Accordion entschieden)
- Dark Mode

## Technical Approach

### Breakpoint-System
```
Mobile:   < 768px   — accordion: stacked leisten + one open panel
Tablet:  768–1023   — 3 panels, primary 60vw
Desktop: 1024–1439  — original desktop
Wide:    ≥ 1440     — no additional changes (line-length stays full width)
```

### Mobile-Layout im Detail
- `.wrapper-root`: position absolute, 100vh pinned, flex-direction column
- HTML-Order: Mobile-Top-Bar → Leiste 1 → Panel 1 → Leiste 2 → Panel 2 → Leiste 3 → Panel 3
- CSS `order`: Panel-Position bleibt unter zugehöriger Leiste
- Nur `primary` Panel sichtbar (`mobile-active`); andere `display: none`
- Aktives Panel: `flex: 1 1 auto`, inner scroll container handled Scroll
- Leisten: fixed 48px Höhe, 100% Breite, als Navigations-Header
- Logo + d/f in Mobile-Top-Bar (Original Logo.tsx via CSS ausgeblendet auf Mobile)
- i-Button für Journal-Info auf Leiste 2 verschoben (State via Wrapper gelifted)
- Safe-Area-Inset: standardmäßig auf Leiste 3 (wenn panel 1/2 aktiv, Leiste 3 am Boden), via `data-primary="3"` auf Panel 3 umgeleitet (wenn Panel 3 aktiv, Panel 3 am Boden)

### Files to Change

| File | Change Type | Description |
|------|-------------|-------------|
| `src/app/layout.tsx` | Modify | `viewport` export |
| `src/app/dashboard/layout.tsx` | Modify | `viewport` export |
| `src/app/globals.css` | Modify | Fluid Tokens, Breakpoints, Mobile-Accordion-Rules |
| `src/components/Wrapper.tsx` | Modify | Mobile-Top-Bar, Journal-Info-State-Lift |
| `src/components/Navigation.tsx` | Modify | `nav-content` Wrapper-Class |
| `src/components/JournalSidebar.tsx` | Modify | Info-State als Props |
| `src/components/AgendaItem.tsx` | Modify | `grid-template-rows` Accordion |
| `src/components/ProjekteList.tsx` | Modify | `grid-template-rows` Accordion |

### Fluid Typography (clamp)
- Body: `clamp(17px, 1rem + 0.9vw, 26.667px)` — 17px Mobile-Min
- Title: `clamp(26px, 1.5rem + 1.4vw, 38.667px)`
- Leiste: `clamp(22px, 1.3rem + 1.2vw, 34.667px)`
- Journal: `clamp(15px, 0.85rem + 0.6vw, 20px)`
- Meta: `clamp(13px, 0.75rem + 0.3vw, 17px)`

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| iPhone SE (320px) | Alle Inhalte lesbar, kein horizontaler Scroll |
| iPad Portrait (768px) | Desktop-Layout mit 3 Panels, 60vw primary |
| iPhone Landscape | 3 Leisten + aktives Panel in 100vh |
| Panel 3 aktiv auf iPhone mit Home-Indicator | Content scrollt clear des Indicators (Inset auf Scroll-Container) |
| Dashboard auf Mobile | Normal scrollbar (nicht vom public overflow-hidden betroffen) |
| Ultrawide (2560px) | Unbehandelt (User-Entscheidung: keine max-width) |

## Risks
- **Fluid Typography** kann ungewollt schrumpfen → untere Clamp-Grenze sorgfältig setzen
- **Safe-Area-Insets** müssen visuell im Simulator geprüft werden
- **`:has()` Support** in älteren Browsern (Chrome <105) — graceful degradation: Dashboard-Scroll-Bug nur auf sehr alten Browsern
