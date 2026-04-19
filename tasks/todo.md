# Sprint: Agenda → Instagram Post Generator (v1)
<!-- Spec: tasks/spec.md v2 (Codex-R1 addressed) -->
<!-- Started: 2026-04-19 -->

## Done-Kriterien (Sprint Contract)
> Alle müssen PASS sein bevor der Sprint als fertig gilt. Sprint-Contract = DK-1..DK-12 (reine Code-Deliverables). Deploy-Verifikation lebt in der Release-PMC weiter unten, **nicht** im Sprint-Contract.

- [ ] **DK-1** `pnpm build` passes ohne TypeScript errors
- [ ] **DK-2** `pnpm test` passes — neue Tests:
  - `src/lib/instagram-post.test.ts` mit mindestens 7 Cases (siehe DK-5)
  - `src/lib/audit-entity.test.ts` um 2 Cases erweitert (`agenda_instagram_export` mapping + null agenda_id)
  - mindestens 1 Integration-Test für Metadata-Route (z.B. `src/app/api/dashboard/agenda/[id]/instagram/route.test.ts` mit `// @vitest-environment jsdom` pragma)
- [ ] **DK-3** `pnpm audit --prod` → 0 HIGH/CRITICAL nach `pnpm add jszip`
- [ ] **DK-4** `src/lib/instagram-post.ts` existiert, edge-safe (grep-check: keine `fs`/`node:`/`pg`-imports), exportiert:
  - `Slide` type
  - `SCALE_THRESHOLDS = {s: 1800, m: 1200, l: 800}` const
  - `splitAgendaIntoSlides(item, locale, scale): {slides, warnings}` — clamp auf 10, warning `"too_long"` bei raw>10
  - `flattenContent(content: JournalContent): {text, weight, isHeading}[]` — strippt non-text-Blocks
  - `isLocaleEmpty(item, locale): boolean` — true wenn title leer UND flattenContent leer/whitespace
- [ ] **DK-5** Unit-Test-Contract in `instagram-post.test.ts`:
  - (a) short content → 1 slide
  - (b) long content → N slides per char-threshold
  - (c) hashtags nur auf letztem slide
  - (d) raw >10 slides → clamped to 10 + `warnings: ["too_long"]`
  - (e) `isLocaleEmpty`: empty title + empty content → true
  - (f) `isLocaleEmpty`: empty title + image-only content → true (flattenContent strippt)
  - (g) `isLocaleEmpty`: empty title + whitespace-only content → true
- [ ] **DK-6** `GET /api/dashboard/agenda/[id]/instagram?locale=de&scale=m`:
  - 200 JSON `{slideCount, warnings}` bei valid locale + content
  - 401 ohne Session
  - 404 `{error: "locale_empty"}` bei `isLocaleEmpty`
  - 400 bei invalid query-params (locale not in {de,fr}, scale not in {s,m,l})
  - `slideCount ≤ 10` (clamp garantiert)
- [ ] **DK-7** `GET /api/dashboard/agenda/[id]/instagram-slide/0?locale=de&scale=m`:
  - 200 `image/png` mit Content-Length > 10 KB
  - Response-Header `Cache-Control: no-store, private` präsent
  - 401 ohne Session
  - 404 `{error: "locale_empty"}` wenn locale leer
  - 404 bei slideIdx out-of-range (nach Clamp)
  - 422 bei slideIdx ≥ 10 UND raw-slide-count > 10
  - 400 bei invalid query-params
- [ ] **DK-8** Audit-Event `agenda_instagram_export` via `auditLog()` zentral-Helper:
  - `AuditEvent` union in `src/lib/audit.ts` enthält literal `"agenda_instagram_export"`
  - `AuditDetails` hat optionale Felder `agenda_id`, `locale`, `scale`, `slide_count`
  - `extractAuditEntity` returnt `{entity_type: "agenda_items", entity_id: details.agenda_id ?? null}`
  - Slide-Route ruft `auditLog("agenda_instagram_export", {...})` **nur** bei `?download=1` — grep-check: keine `INSERT INTO audit_events` in der Route-Datei
  - Audit-entity.test.ts hat Mapping-Test für den neuen Event-Typ
- [ ] **DK-9** Font-Loading fail-closed verifiziert:
  - (a) Route liest alle 3 woff2 (Light, Regular, ExtraBold) via `fs.readFileSync` in try/catch-Block
  - (b) `ImageResponse.fonts` enthält genau 3 Einträge mit `name` + `weight` matching {300,400,800}
  - (c) Wenn eine der 3 Dateien fehlt oder `fs.readFileSync` throws → Route returnt 500 + strukturierter Error `[ig-export] font_load_failed weight=<N>`
  - Test-Invariante: mechanischer Unit-Test mockt `fs.readFileSync` um throw bei einer der Weights → Route-Response hat Status 500 + Error-Body `{error: "font_load_failed"}`
  - Manueller visual-check der PNG-Font gehört in die Release-PMC, nicht DK
- [ ] **DK-10** `AgendaSection.tsx` zeigt „Instagram"-Button per row:
  - Klick öffnet `InstagramExportModal` mit passender agenda-item-id
  - Button disabled wenn `isLocaleEmpty(item, "de")` UND `isLocaleEmpty(item, "fr")` beide true
- [ ] **DK-11** Modal UI:
  - Locale-Radio (DE/FR/Beide); „Beide"-Option disabled wenn DE oder FR `isLocaleEmpty` (mit Tooltip)
  - Scale-Slider (S/M/L)
  - Preview-Tiles (1 img pro clamped slide)
  - Info-Banner „Bilder werden in v1 nicht exportiert" bei `item.images.length > 0` ODER embedded non-text Rich-Text-Blocks
  - Warning-Banner bei `warnings.includes("too_long")`
  - Download-Button mit Single-Flight-Mutex (`useRef<boolean>`, button disabled + `aria-busy` während ZIP-Assembly, release in finally). Test: double-click produces nur 1 ZIP-Download
  - 404/410-Handler: refetch metadata once, zweites 404 → Banner „Eintrag wurde gelöscht" + disable download
  - Download-Request trägt `?download=1`
  - „Beide"-ZIP mit `de/slide-1.png … fr/slide-1.png …`-Struktur
- [ ] **DK-12** Call-Sites für `dashboardFetch` NICHT verändert — neue Routes sind GET und nutzen native `fetch` ohne CSRF-Token. Grep-check `dashboardFetch` in geänderten Files ergibt nur unveränderte Zeilen

## Release-PMC (Pre-Merge + Post-Merge Checklist)
> **Nicht Sprint-Contract**, aber Pflicht vor Done-Meldung an den User. Matching `patterns/workflow.md` PMC-Pattern („Deploy-/Prozess-Schritte in separate PMC, nie Sprint-Contract").

- [ ] **PMC-1 Staging-Deploy grün nach Push**: CI success, Container up, `/api/health/` 200, Dashboard-Login funktioniert, Agenda-Row „Instagram"-Button sichtbar, Modal öffnet, Preview lädt mindestens 1 Slide, PNG-Download liefert valides 1080×1350 PNG
- [ ] **PMC-2 Visual Font-Check auf Staging**: PNG-Download + Browser-Vergleich mit `alit.ch` Agenda-Entry → PP Fragment Sans visuell korrekt (nicht Satori-System-Default)
- [ ] **PMC-3 Prod-Deploy grün nach Merge**: CI success, Health-Endpoint 200, Smoke-Test (Login + Dashboard + 1 Instagram-Export), Logs clean (`ssh hd-server 'docker compose logs --tail=50'` keine neuen errors)
- [ ] **PMC-4 Audit-Event sichtbar**: Nach 1 Download via Staging/Prod-Modal → `audit_events`-Row mit `event=agenda_instagram_export` in der Audit-UI sichtbar

## Tasks

### Phase 1 — Pure Helper + Tests (TDD)
- [ ] `src/lib/instagram-post.ts` anlegen: `Slide` type, `SCALE_THRESHOLDS`, `splitAgendaIntoSlides`, `flattenContent`, `isLocaleEmpty`
- [ ] `src/lib/instagram-post.test.ts` anlegen mit 7 Cases aus DK-5
- [ ] `pnpm test src/lib/instagram-post.test.ts` → green

### Phase 2 — Audit Plumbing
- [ ] `src/lib/audit.ts` erweitern: `AuditEvent` union + `AuditDetails` optional fields
- [ ] `src/lib/audit-entity.ts` erweitern: Mapping für `agenda_instagram_export`
- [ ] `src/lib/audit-entity.test.ts` erweitern: 2 neue Cases (mit + ohne agenda_id)
- [ ] `pnpm test src/lib/audit-entity.test.ts` → green

### Phase 3 — Slide-Template + Slide-Route
- [ ] `src/app/api/dashboard/agenda/[id]/instagram-slide/[slideIdx]/slide-template.tsx` anlegen — JSX pure flex-layout, inline styles, font-family-strings match registered font-names
- [ ] `src/app/api/dashboard/agenda/[id]/instagram-slide/[slideIdx]/route.ts` anlegen — `requireAuth`, fetch row, `isLocaleEmpty`-check, split, try/catch on font-load (fail-closed 500), `new ImageResponse(...)` mit `Cache-Control: no-store, private`. Audit via `auditLog()` NUR bei `?download=1`. Node runtime. Query-param parsing + 400/401/404/422 matching DK-7
- [ ] Unit-Test: font-load-failure-mock → 500 + error-body (DK-9 (c))
- [ ] Dev-smoke: `curl -b cookies.txt 'http://localhost:3000/api/dashboard/agenda/1/instagram-slide/0?locale=de&scale=m' -o test.png -D headers.txt` → valides 1080×1350 PNG + `Cache-Control: no-store, private` header

### Phase 4 — Metadata-Route
- [ ] `src/app/api/dashboard/agenda/[id]/instagram/route.ts` anlegen — `requireAuth`, fetch row, `isLocaleEmpty`-check, split, JSON `{slideCount, warnings}`. 401/404/400 Edge Cases
- [ ] Integration-Test (vitest + jsdom pragma) für metadata-route: 200-Pfad + 404-`locale_empty` + 400-invalid-param

### Phase 5 — Dashboard-Modal
- [ ] `pnpm add jszip && pnpm add -D @types/jszip`
- [ ] `src/app/dashboard/components/InstagramExportModal.tsx` anlegen:
  - useState `locale: "de"|"fr"|"both"`, `scale: "s"|"m"|"l"`
  - Per-locale useState `{loading, slideCount, warnings, error}` — bei „Beide" 2 parallele Fetches (getrennte States)
  - useEffect: fetcht metadata bei locale/scale-change
  - 404/410-Handler: refetch once, dann Banner + disable
  - Preview-Grid: N `<img src="/api/.../instagram-slide/N?locale=X&scale=Y&v={cache-bust}">` (pro Locale)
  - Single-Flight-Mutex: `const zipInFlightRef = useRef(false)`; lock VOR setState, release in finally
  - Download-Button disabled + `aria-busy={zipInFlightRef.current}` während Assembly
  - Bei 1 slide → `<a download>` trigger; bei N slides oder „Beide" → jszip assemble + blob-download
  - Download-requests tragen `?download=1`
  - „Beide"-ZIP mit `de/slide-1.png … fr/slide-1.png …`-Struktur
  - Info-Banner bei `item.images.length > 0` oder embedded-media detected
  - Warning-Banner bei `warnings.includes("too_long")`
- [ ] `src/app/dashboard/components/AgendaSection.tsx` modifizieren — neuer Row-Action-Button „Instagram" (inline-SVG-Icon), öffnet Modal mit item.id. Disabled wenn DE+FR beide `isLocaleEmpty`

### Phase 6 — Verification
- [ ] `pnpm build` + `pnpm test` + `pnpm audit --prod` → alle pass
- [ ] Dev-Server manual-test: locale DE + scale M + Download → PNG, locale DE + scale S (long content) → ZIP, locale Beide (wenn beide gefüllt) → ZIP mit beiden Unterordnern
- [ ] Dev-Server double-click-Download-Test: Single-Flight-Mutex verhindert doppelten ZIP
- [ ] Dev-Server locale-empty-Test: Agenda-Item mit leerem FR → „Beide" disabled, FR-Radio disabled

### Phase 7 — Staging + Prod Deploy (Release-PMC)
- [ ] Feature-branch `feat/instagram-export` pushen
- [ ] CI watch, PMC-1 durchgehen
- [ ] PMC-2 visual Font-Check
- [ ] PR erstellen, Codex-Review, R1-Findings triagen
- [ ] Merge → PMC-3 Prod-Deploy-Verifikation
- [ ] PMC-4 Audit-Event-Sichtbarkeit

## Notes
- **Satori CSS-subset beachten**: kein `display: grid`, kein `filter`, kein `box-shadow`. Layout pure flex.
- **Font-Pfad**: `path.join(process.cwd(), "public/fonts/PPFragment-SansRegular.woff2")` — works im standalone-build (public/ wird neben standalone-Output kopiert).
- **Char-Threshold-Kalibrierung**: während Phase 3/4 mit 2-3 realen Agenda-Einträgen durchspielen und SCALE_THRESHOLDS anpassen wenn nötig.
- **Instagram-Post-Best-Practice**: Safe-Zone 60px innenrand für Text (Instagram-UI overlays); Footer-Bar sollte in untersten 80px leben.
- **ZIP vs PNG in browser**: iOS Safari öffnet ZIP inline — Note im Modal.
- **Existing-Pattern-Referenz**: für row-action-buttons siehe Edit+Delete in AgendaSection.tsx; für Modal-Primitives siehe `src/app/dashboard/components/Modal.tsx`; für `requireAuth`-Usage siehe any `src/app/api/dashboard/*/route.ts`; für `auditLog()`-Pattern siehe `src/app/api/dashboard/memberships/[id]/route.ts` (membership_paid_toggle).
- **Single-Flight-Mutex-Pattern**: `patterns/react.md` → „Synchronous `useRef`-Mutex für Single-Flight in async Handler"
- **Kein dashboardFetch nötig**: Routes sind reine GETs, `fetch(url)` direkt.
