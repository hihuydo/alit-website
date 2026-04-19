# Sprint: Agenda → Instagram Post Generator (v1)
<!-- Spec: tasks/spec.md -->
<!-- Started: 2026-04-19 -->

## Done-Kriterien
> Alle müssen PASS sein bevor der Sprint als fertig gilt.

- [ ] **DK-1** `pnpm build` passes ohne TypeScript errors
- [ ] **DK-2** `pnpm test` passes (neue Tests in `src/lib/instagram-post.test.ts` + mindestens 1 Integration-Test für `/api/dashboard/agenda/[id]/instagram/` metadata-route)
- [ ] **DK-3** `pnpm audit --prod` → 0 HIGH/CRITICAL
- [ ] **DK-4** `src/lib/instagram-post.ts` existiert, edge-safe (grep ergibt keine fs/`node:`/pg-imports), exportiert `splitAgendaIntoSlides(item, locale, scale): {slides, warnings}` + `Slide` type + `SCALE_THRESHOLDS` const
- [ ] **DK-5** Unit-Test-Contract: `splitAgendaIntoSlides` returnt (a) 1 slide für kurzen content, (b) N slides bei langem content nach char-threshold, (c) hashtags nur auf letztem slide, (d) warnings `["too_long"]` wenn >10 slides, (e) throws bei empty locale
- [ ] **DK-6** `GET /api/dashboard/agenda/[id]/instagram?locale=de&scale=m` → 200 JSON `{slideCount, warnings}`. 401 ohne Session. 404 bei empty locale. 400 bei invalid query-params
- [ ] **DK-7** `GET /api/dashboard/agenda/[id]/instagram-slide/0?locale=de&scale=m` → 200 `image/png` mit Content-Length > 10 KB. 401 ohne Session. 404 bei slideIdx out-of-range. 422 wenn content >10 slides. 400 bei invalid query-params
- [ ] **DK-8** Audit-Event `agenda.instagram_export` wird **nur bei `?download=1`** in DB geschrieben (Preview-Requests triggern kein audit). Details-JSONB enthält `{version:1, locale, scale, slideCount}`
- [ ] **DK-9** Slide-Template rendert mit korrekter PP Fragment Sans-Font (nicht Satori-Fallback) — verifizierbar via `ImageResponse.fonts` non-empty + visual-check im Browser
- [ ] **DK-10** `AgendaSection.tsx` zeigt „Instagram"-Button per row. Klick öffnet `InstagramExportModal` mit passender agenda-item-id. Button disabled wenn weder DE noch FR title+content present
- [ ] **DK-11** Modal UI: Locale-Radio (DE/FR/Beide), Scale-Slider (S/M/L), Preview-Tiles (1 img pro slide), Download-Button. Funktioniert manuell auf dev-server für Single-Slide-PNG + Multi-Slide-ZIP + „Beide"-ZIP-mit-Unterordnern
- [ ] **DK-12** Call-Sites für `dashboardFetch` NICHT verändert — neue Routes sind GET und nutzen native `fetch` ohne CSRF-Token
- [ ] **DK-13** Staging-Deploy grün nach Push: CI success, Container up, `/api/health/` 200, Dashboard-Login funktioniert, Agenda-Row „Instagram"-Button sichtbar, Modal öffnet, Preview lädt mindestens 1 Slide, PNG-Download liefert valides 1080×1350 PNG
- [ ] **DK-14** Prod-Deploy grün nach Merge: CI success, Health-Endpoint 200, Smoke-Test (Login + Dashboard + 1 Instagram-Export), Logs clean (`docker compose logs --tail=50` keine neuen errors)

## Tasks

### Phase 1 — Pure Helper + Tests (TDD)
- [ ] `src/lib/instagram-post.ts` anlegen: `Slide` type, `SCALE_THRESHOLDS = {s: 1800, m: 1200, l: 800}`, `splitAgendaIntoSlides(item, locale, scale): {slides: Slide[], warnings: string[]}`, `flattenContent(rich: JournalContent): {text, weight}[]`
- [ ] `src/lib/instagram-post.test.ts` anlegen mit 5 Fällen aus DK-5
- [ ] `pnpm test src/lib/instagram-post.test.ts` → green

### Phase 2 — Slide-Template + Slide-Route
- [ ] `src/app/api/dashboard/agenda/[id]/instagram-slide/[slideIdx]/slide-template.tsx` anlegen — nimmt `{slide, itemMeta, totalSlides, scale}`, returnt JSX mit inline styles. Flex-only layout. Font-family-strings match registered font-names
- [ ] `src/app/api/dashboard/agenda/[id]/instagram-slide/[slideIdx]/route.ts` anlegen — `requireAuth`, fetch agenda row via pool, `splitAgendaIntoSlides`, `fs.readFileSync` fonts, `new ImageResponse(<SlideTemplate/>, {width:1080, height:1350, fonts})`. Node runtime. Query-param parsing + 400/401/404/422. Audit-Log NUR bei `?download=1`
- [ ] Dev-smoke: `curl -H "Cookie: __Host-session=..." 'http://localhost:3000/api/dashboard/agenda/1/instagram-slide/0?locale=de&scale=m' -o test.png` → valides 1080×1350 PNG

### Phase 3 — Metadata-Route
- [ ] `src/app/api/dashboard/agenda/[id]/instagram/route.ts` anlegen — `requireAuth`, fetch row, split, JSON `{slideCount, warnings}`. 401/404/400 Edge Cases
- [ ] 1 Integration-Test (vitest + jsdom pragma) für metadata-route

### Phase 4 — Dashboard-Modal
- [ ] `jszip` installieren: `pnpm add jszip && pnpm add -D @types/jszip`
- [ ] `src/app/dashboard/components/InstagramExportModal.tsx` anlegen
  - useState `locale: "de"|"fr"|"both"`, `scale: "s"|"m"|"l"`
  - useEffect: fetcht metadata bei locale/scale-change, setzt `slideCount`, `warnings`
  - Preview-Grid: N `<img src="/api/.../instagram-slide/N?locale=X&scale=Y&v={cache-bust}">`
  - Download-Handler: bei 1 slide → `<a download>` trigger; bei N slides oder „Beide" → jszip assemble + blob-download
  - Download-requests tragen `?download=1` für Audit-Log
  - „Beide"-ZIP mit `de/slide-1.png, de/slide-2.png, fr/slide-1.png …`-Struktur
- [ ] `src/app/dashboard/components/AgendaSection.tsx` modifizieren — neuer Row-Action-Button „Instagram" (inline-SVG-Icon), öffnet Modal mit item.id. Disabled wenn empty locale-Content

### Phase 5 — Audit + Verification
- [ ] Audit-Log-Event `agenda.instagram_export` testen: Download-Click → `audit_events` row sichtbar im Dashboard
- [ ] `pnpm build` + `pnpm test` + `pnpm audit --prod` → alle pass
- [ ] Dev-Server manual-test: locale DE + scale M + Download → PNG, locale DE + scale S (long content) → ZIP, locale Beide → ZIP mit beiden Unterordnern
- [ ] Font-check: PNG sollte visuell PP Fragment Sans zeigen (nicht Satori-System-Default). Side-by-side-vergleich mit der Live-Website

### Phase 6 — Staging + Prod Deploy
- [ ] Feature-branch `feat/instagram-export` pushen
- [ ] CI watch, Staging-Smoke-Test (siehe DK-13)
- [ ] PR erstellen, Codex-Review, R1-Findings triagen
- [ ] Merge → Prod-Deploy-Verifikation (siehe DK-14)

## Notes
- **Satori CSS-subset beachten**: kein `display: grid`, kein `filter`, kein `box-shadow`. Layout pure flex.
- **Font-Pfad**: `path.join(process.cwd(), "public/fonts/PPFragment-SansRegular.woff2")` — works im standalone-build (public/ wird neben standalone-Output kopiert).
- **Char-Threshold-Kalibrierung**: während Phase 2/3 mit 2-3 realen Agenda-Einträgen durchspielen und SCALE_THRESHOLDS anpassen wenn nötig (v1 approximation, kein Exactness-Anspruch).
- **Instagram-Post-Best-Practice**: Safe-Zone 60px innenrand für Text (Instagram-UI overlays); Footer-Bar sollte in untersten 80px leben.
- **ZIP vs PNG in browser**: iOS Safari öffnet ZIP inline — Note im Modal.
- **Existing-Pattern-Referenz**: für row-action-buttons siehe Edit+Delete in AgendaSection.tsx; für Modal-Primitives siehe `src/app/dashboard/components/Modal.tsx`; für `requireAuth`-Usage siehe any `src/app/api/dashboard/*/route.ts`.
- **Kein dashboardFetch nötig**: Routes sind reine GETs, `fetch(url)` direkt. CSRF ist nur non-GET-Gate.
