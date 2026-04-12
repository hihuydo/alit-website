# Sprint: Responsive Optimization
<!-- Spec: tasks/spec.md -->
<!-- Started: 2026-04-12 -->

## Done-Kriterien
> Alle müssen PASS sein bevor der Sprint als fertig gilt.

- [x] `<meta name="viewport">` gesetzt in root + dashboard layout
- [x] iPhone SE (320px) zeigt Inhalt ohne horizontales Scrollen
- [x] Body-Text auf 320px ≤ 20px, auf 1440px ≥ 24px (Fluid Typography)
- [x] Mobile: 3 Leisten + aktives Panel innerhalb 100vh, Touch-Targets ≥ 44px
- [x] iPad (768px) zeigt Desktop-Layout mit 3 Panels
- [x] Mobile-Accordion: nur ein Panel offen, Nav-Click swapped primary/secondary
- [x] Keine Overflows bei Formularen auf ≤375px
- [x] `pnpm build` ohne Fehler
- [ ] Staging verifiziert: iPhone, iPad, Desktop, Wide (Manual Sign-off)

## Tasks

### Phase 1: Viewport + Fluid Typography
- [x] `viewport`-Export in `src/app/layout.tsx` + `src/app/dashboard/layout.tsx`
- [x] `:root` Tokens mit `clamp()` umbauen (body, title, leiste, journal, meta)
- [x] Spacing-Tokens ebenfalls responsive via `clamp()`

### Phase 2: Breakpoints
- [x] `@media (min-width: 768px) and (max-width: 1023px)` — tablet (primary 60vw)
- [x] Desktop (1024px+) bleibt wie bisher
- [x] Wide (≥1440): keine Content-max-width mehr (auf User-Wunsch zurückgenommen)

### Phase 3: Mobile Accordion
- [x] Mobile-Top-Bar mit Logo + d/f
- [x] Leisten gestapelt als always-visible Navigation
- [x] Panel 1 initial offen, andere display:none
- [x] Active panel scrollt intern; 100vh pinned
- [x] Safe-Area-Insets (Leiste 3 / Panel 3 dynamisch via data-primary)
- [x] i-Button in Leiste 2 integriert, State via Wrapper gelifted
- [x] Form-Overflow + iOS-Zoom-Prevention (input font ≥ 16px)

### Phase 4: Verifizierung
- [ ] Staging-Deploy prüfen (DevTools viewport sim + reales iOS device)
