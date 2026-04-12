# Spec: Responsive Design Optimization
<!-- Created: 2026-04-12 -->
<!-- Author: Planner (Claude) -->
<!-- Status: Draft -->

## Summary
Mobile + Tablet + Wide Screens sauber abdecken. Bestehende 3-Panel-Architektur bleibt (Ansatz A: Bottom-Tab-Bar auf Mobile), aber die Details werden gefixt: fehlendes Viewport-Meta, nicht-skalierbare Schriften, kein Tablet-Breakpoint. Kein Burger-Menü — auf Mobile bleibt eine Spalte sichtbar, Switch über Bottom-Tab-Bar wie jetzt.

## Context
- Ist-Stand: nur ein Breakpoint `@media (max-width: 767px)` in `globals.css`
- 3 Panels (Agenda, Discours Agités, Netzwerk) → auf Mobile als Bottom-Tab-Bar mit 48px Höhe
- **`<meta viewport>` fehlt** in beiden Layouts (root + [locale]) — iOS zoomt falsch
- Font-Sizes sind fixe px-Werte (`--text-body: 26.667px`, `--text-title: 38.667px`) — zu groß auf schmalen Screens
- Logo skaliert (60x79 → 44x58), aber sonst nix
- Form `.form-row` stacked auf Mobile, OK
- Dashboard-Layout hat ebenfalls kein Viewport-Meta

## Requirements

### Must Have
1. **Viewport-Meta** in beiden Root-Layouts (öffentlich + `/dashboard`)
2. **Fluid Typography** mit `clamp()` für Body, Title, Leiste, Journal
3. **Tablet-Breakpoint** (768–1023px): alle 3 Panels sichtbar, aber feinere Proportionen
4. **Wide-Screen** (≥1440px): max-content-width für Lesbarkeit von Prose in Panel 3
5. **Mobile-Feintuning**: Bottom-Tab-Bar-Labels lesbar, Logo nicht zu klein, Content-Padding konsistent
6. **Form-Eingaben** auf Mobile nicht überlaufend, Touch-Targets ≥44px
7. **Bilder** im Journal & Content nicht überlaufend (max-width: 100%)

### Nice to Have
1. Safe-Area-Insets (`env(safe-area-inset-bottom)`) für iPhone Notch/Home-Indicator
2. Landscape-Mobile-Handling (sehr schmales Vertikalformat)

### Out of Scope
- Burger-Menü (explizit ausgeschlossen)
- Single-Column-Redesign (nicht gewünscht)
- Dark Mode
- Mobile-Only-Komponenten (z.B. eigene Mobile-Navigation)

## Technical Approach

### Breakpoint-System
```
Mobile:   < 768px   — bottom tab bar, 1 panel visible
Tablet:  768–1023   — 3 panels, feinere Proportionen
Desktop: 1024–1439  — jetziger Desktop-Zustand
Wide:    ≥ 1440     — max-width für Text-Content
```

### Files to Change

| File | Change Type | Description |
|------|-------------|-------------|
| `src/app/layout.tsx` | Modify | `viewport` export hinzufügen |
| `src/app/dashboard/layout.tsx` | Modify | `viewport` export hinzufügen |
| `src/app/globals.css` | Modify | `:root` Fluid Tokens, Tablet + Wide Media Queries, Mobile-Fixes |
| `src/components/AgendaItem.tsx` | Check | `max-h-[1200px]` ggf. aufheben auf Mobile |
| `src/components/ProjekteList.tsx` | Check | `max-h-[1000px]` ggf. aufheben auf Mobile |
| `src/components/nav-content/*Content.tsx` | Check | Form-Inputs nicht überlaufend |

### Fluid Typography (clamp)
- Body: `clamp(17px, 1rem + 0.8vw, 26.667px)` — 17px Mobile-Minimum, 26.667px Desktop
- Title: `clamp(24px, 1.5rem + 1vw, 38.667px)`
- Leiste: `clamp(22px, 1.5rem + 0.8vw, 34.667px)` — auf Mobile horizontale Labels mit 18px bleiben
- Journal/Meta: kleinere Skalen

### Tablet-Feintuning (768–1023)
- Primary Panel: 60vw statt 70vw (zwei sichtbare Panels etwas ausgewogener)
- `--spacing-base` und `--spacing-half` kleiner skalieren
- Agenda-Items: evtl. kompakteres Padding

### Wide-Screen (≥1440)
- Panel 3 Content: `max-width: 720px` für Prose (Alit-Text, Newsletter/Mitgliedschaft-Formulare)
- Wrapper bleibt Full-Width, nur der Inhalt zentriert sich mit `margin-inline: auto`

### Safe-Area-Insets
- Bottom-Tab-Bar: `padding-bottom: env(safe-area-inset-bottom)` + entsprechende Höhe
- Panels: `padding-top: env(safe-area-inset-top)` für iPhone Notch

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| iPhone SE (320px) | Alle Inhalte lesbar, keine horizontale Scroll-Bar |
| iPad Portrait (768px) | Desktop-Layout mit 3 Panels |
| iPhone Landscape | Bottom-Tab-Bar nicht den gesamten Viewport belegen |
| Sehr lange Content (Alit) | Scrollbar im Panel 3, nicht im Tab-Bar |
| Ultrawide (2560px) | Content-max-width verhindert zu breite Text-Zeilen |
| Rotated während Panel offen | Transition ohne Flicker |

## Risks
- **Fluid Typography** kann auf bestimmten Zooms ungewollt schrumpfen → untere Clamp-Grenze sorgfältig setzen
- **Breakpoint-Overlap**: Mobile-Tabs dürfen nicht bei 768px plötzlich verschwinden (exakte Grenze `@media (max-width: 767.98px)` oder `min-width: 768px`)
- **Safe-Area-Insets** müssen visuell im Simulator geprüft werden — im Browser nicht sichtbar
