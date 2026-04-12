# Sprint: Responsive Optimization
<!-- Spec: tasks/spec.md -->
<!-- Started: 2026-04-12 -->

## Done-Kriterien
> Alle müssen PASS sein bevor der Sprint als fertig gilt.

- [ ] `<meta name="viewport">` gesetzt in root + dashboard layout
- [ ] iPhone SE (320px) zeigt Inhalt ohne horizontales Scrollen
- [ ] Body-Text auf 320px ≤ 20px, auf 1440px ≥ 24px (Fluid Typography)
- [ ] Bottom-Tab-Bar auf Mobile lesbar, Touch-Targets ≥ 44px
- [ ] iPad (768px) zeigt Desktop-Layout mit 3 Panels
- [ ] Auf ≥1440px ist die Text-Breite in Panel 3 begrenzt (max-width auf Prose)
- [ ] Keine Overflows bei Formularen auf ≤375px
- [ ] `pnpm build` ohne Fehler
- [ ] Staging verifiziert: iPhone, iPad, Desktop, Wide

## Tasks

### Phase 1: Viewport + Fluid Typography
- [ ] `viewport`-Export in `src/app/layout.tsx` + `src/app/dashboard/layout.tsx`
- [ ] `:root` Tokens mit `clamp()` umbauen (body, title, leiste, journal)
- [ ] Spacing-Tokens evtl. ebenfalls responsive

### Phase 2: Tablet + Wide Breakpoints
- [ ] `@media (min-width: 1024px) and (max-width: 1439px)` — current desktop
- [ ] `@media (min-width: 768px) and (max-width: 1023px)` — tablet feintuning
- [ ] `@media (min-width: 1440px)` — wide + content max-width

### Phase 3: Mobile Feintuning
- [ ] Safe-Area-Insets bottom-tab-bar
- [ ] Form-Overflow prüfen (Newsletter, Mitgliedschaft)
- [ ] AgendaItem/ProjekteList `max-h` auf Mobile prüfen
- [ ] Bilder `max-width: 100%; height: auto` wo nötig

### Phase 4: Verifizierung
- [ ] Staging-Deploy, im Browser responsive testen
- [ ] iPhone Simulator / DevTools bei 320/375/414
- [ ] iPad Portrait/Landscape
- [ ] Desktop + Wide (1920+)
