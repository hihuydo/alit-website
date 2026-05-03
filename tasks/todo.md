# Sprint M4a — Instagram Slide-1 Cover-Centering + Image-Grid-Cap
<!-- Spec: tasks/spec.md -->
<!-- Started: 2026-05-03 -->
<!-- Branch: codex/instagram-slide-text-overrides (continued — no new branch) -->
<!-- Note: Original M4 + Sonnet R1-R7 + Codex Review archived in tasks/m4-*.archived -->

## Done-Kriterien (Sprint Contract)

> Alle müssen PASS sein bevor der Sprint als fertig gilt.

### Build + Test Gate
- [ ] `pnpm exec tsc --noEmit` clean
- [ ] `pnpm test` clean (current 1329 → expected ~1347)
- [ ] `pnpm build` clean
- [ ] `pnpm audit --prod` 0 HIGH/CRITICAL

### Slide-1 Cover-Layout
- [ ] DK-A1: Slide 1 (kind="grid") rendert Title + Lead + Image-Grid + Hashtags zentriert (vertikale Reihenfolge: Title → Lead → Grid → Hashtags) — verified via E2 test + E5 visual smoke
- [ ] DK-A1b: Neue Spacing-Konstanten exists in `slide-template.tsx`: `HEADER_TO_TITLE_GAP_GRID_COVER = 60`, `TITLE_TO_LEAD_GAP_GRID_COVER = 32`, `LEAD_TO_GRID_GAP_GRID_COVER = 48`, `GRID_TO_HASHTAGS_GAP_GRID_COVER = 48` (verified via file-content-regex)
- [ ] DK-A1c: Neue Konstante `GRID_MAX_HEIGHT_COVER = 500` exists in `slide-template.tsx`; cover-grid-Branch verwendet sie für `fitImage` (NICHT mehr `GRID_MAX_HEIGHT = 700`) — verified via grep + E5
- [ ] DK-A1d: `HashtagsRow` Component bekommt `marginTop?` + `centered?` Props; grid-cover-Branch: `<HashtagsRow marginTop={GRID_TO_HASHTAGS_GAP_GRID_COVER} centered />`; ALLE anderen Aufrufer unchanged (A1d/Sonnet R2 #1)
- [ ] DK-A2: Lead rendert auf Slide 1 (grid-path); `leadOnSlide: false` für ALLE text-slides bei `hasGrid === true` in BEIDEN `splitAgendaIntoSlides` (auto) AND `buildManualSlides` (manual). Stored `leadOnSlide: true` aus legacy-rows hardcoded auf false (E2 explicit test)
- [ ] DK-A2b: `firstSlideBudget = SLIDE_BUDGET` (NICHT reduziert via `leadHeightPx(lead)`) bei `hasGrid` in BEIDEN Renderern — Slide-2-Budget-Test (E2 + E2b) zeigt dass Content bei langem Body nicht unnötig auf Slide 3 spillt
- [ ] DK-A3: No-grid-Path Slide 1 (kind="text", isFirst, leadOnSlide=true) rendert Title+Lead zentriert, Body left-aligned (verified via E2 + E5)
- [ ] DK-A3b: BEIDE Renderer setzen `leadOnSlide: !hasGrid` UND `isFirst: true` explizit auf no-grid-Slide-0 (NICHT mehr `undefined`) — verified via E2/E2b unit tests
- [ ] DK-A3c: No-grid-Slide-1 Hashtags bleiben at current position (BEFORE Title) UND uncentered — `<HashtagsRow hashtags={...} />` ohne props (A3c/Sonnet R2 #4) — verified via E5
- [ ] DK-A3d: TitleBlock + LeadBlock bekommen `centered?: boolean` Prop; `textAlign: "center"` direkt auf text-div (NICHT parent — Satori-CSS) — verified via E5 + grep (A3d/Sonnet R2 #3)
- [ ] DK-A3f: Body-region-Check `{slide.leadOnSlide && meta.lead ? <LeadBlock>}` ENTFERNT aus slide-template.tsx text-kind branch — sonst Double-Lead-Render auf no-grid-Slide-0 (A3f/Sonnet R5 #1 CRITICAL)
- [ ] DK-A4: `computeSlide1GridSpec` returnt korrekte Slide1GridSpec für 0/1/2/3/4/5 images (`[],0` returnt `{columns:0,rows:0,cells:[]}` defensive; 5 returnt clamped 4) — verified via 6 E1 unit tests
- [ ] DK-A4b: `slide-template.tsx` grid-kind-branch ruft `computeSlide1GridSpec(slide.gridImages, slide.gridImages.length)` auf UND wired BEIDE Output-Felder: `<ImageGrid cols={gridSpec.columns} images={gridSpec.cells} />` (NICHT `slide.gridImages` als images-prop — A4b/Sonnet R2 #2 defense-in-depth)
- [ ] DK-A4c: TitleBlock im grid-cover-Branch hat `marginTop={HEADER_TO_TITLE_GAP_GRID_COVER}` (60), NICHT die hashtag-conditional Logic (A4c/Sonnet R2 #5)
- [ ] DK-A5: Modal-imageCount-Default = `min(MAX_GRID_IMAGES, availableImages)` — verified via E3 component test
- [ ] DK-A5b: NEW const `MAX_GRID_IMAGES = 4` exists in `instagram-post.ts`
- [ ] DK-A5c: `MAX_GRID_IMAGES` als named export aus `instagram-post.ts`; importiert in beiden Route-Files + cover-layout + Modal — KEINE lokalen Re-Definitionen (A5c/Sonnet R3 H2)
- [ ] DK-A5d: `imageCount`-State-Init im fetchMetadata-callback (NICHT initial useState), conditional auf `imageCount===0` (open-default) damit user-changed-Wert nicht überschrieben wird (A5d/Sonnet R5 #6)
- [ ] DK-A6: GET `?images=999` → 200 mit `imageCount=4` (silent-clamp); pre-DB `400 image_count_too_large` Check in `instagram-layout/route.ts` entfernt
- [ ] DK-A6b: GET ohne `?images=` (missing param) → 200 mit `imageCount=0` — verified via E4 explicit test
- [ ] DK-A6c: `instagram/route.ts` bekommt `MAX_GRID_IMAGES` zum existing post-DB `Math.min` (KEIN pre-DB-check entfernen — gibt's hier nicht)
- [ ] DK-A6d: `isOrphan` dead-code-Variable + `stale/orphan_image_count` Response-Branch entfernt aus `instagram-layout/route.ts` (nach A6-clamp ist isOrphan immer false — A6d/Sonnet R2 #8)
- [ ] DK-A7: PUT mit `imageCount > MAX_GRID_IMAGES` → 400 mit Zod issue (NICHT 422 — Codex R1 #3 vereinfacht); legacy DB-keys >4 read-tolerated (orphan)
- [ ] DK-A7b: PUT-Validator NUR Zod `.max(MAX_GRID_IMAGES)` — KEIN post-Zod 422-check (Codex R1 #3 Contract — vereinfacht; einzige cap-error path ist Zod 400)
- [ ] DK-A7c: GET-Response von `instagram-layout/route.ts` enthält `legacyOverrideKeys: number[]` (nur sortierte keys >4) wenn DB-row solche keys hat (Codex R1 #4 — operator-visible warning für stranded admin-Layouts)
- [ ] DK-A8: GET `?images=abc` → 200 mit `imageCount=0` (NaN-guard via Number.isFinite)

### Code-Quality Gates
- [ ] Sonnet pre-push code-reviewer CLEAN
- [ ] Codex PR-Review APPROVED (max 3 Runden)
- [ ] No `[Critical]` in `tasks/review.md` post-Sonnet-Gate
- [ ] No in-scope `[Critical]` in `tasks/codex-review.md` post-merge

### Deploy-Verifikation
- [ ] CI deploy.yml grün
- [ ] `/api/health/` returnt 200 prod
- [ ] Container logs clean nach Deploy
- [ ] Visual-Smoke E5 auf Staging: 4-5 echte Einträge in jedem Layout-Mode (no-grid, 1, 2, 3, 4 Bilder) durchklicken, Cover-Layout verifizieren

## Tasks

### Phase 1 — Pure Helpers
- [ ] Create `src/lib/instagram-cover-layout.ts` mit `computeSlide1GridSpec(images, count)` für A4-Rules
- [ ] Create `src/lib/instagram-cover-layout.test.ts` mit 6 Tests (0/1/2/3/4/5 images)

### Phase 2 — Type-System + Server-Side Logic
- [ ] Modify `src/lib/instagram-post.ts`:
  - NEW const `MAX_GRID_IMAGES = 4` (A5b)
  - `splitAgendaIntoSlides`: `leadOnSlide: false` für ALLE text-slides bei grid-path (A2 auto-path)
  - Slide-1 grid mit Lead-rendering in der Slide-Layout-Logic
- [ ] Modify `src/lib/instagram-post.test.ts`: Tests E2
- [ ] Modify `src/lib/instagram-overrides.ts`: `buildManualSlides` hardcodet `leadOnSlide: false` für text-slides bei grid-path REGARDLESS of stored value (A2 manual-path)
- [ ] Modify `src/lib/instagram-overrides.test.ts`: stored-leadOnSlide-override-Test

### Phase 3 — Render Template + API Routes
- [ ] Modify `slide-template.tsx`:
  - Slide-1 grid (kind="grid") rendert Title + Lead + Grid + Hashtags ALLE zentriert
  - text-slide mit isFirst && leadOnSlide===true (no-grid-cover): Title + Lead zentriert, Body left-aligned
- [ ] Modify `instagram-layout/route.ts`:
  - PUT-Validator `validated.imageCount <= MAX_GRID_IMAGES` (A7) → 422 `image_count_exceeds_grid_cap`
  - GET: pre-DB `image_count_too_large` Check entfernen
  - GET: post-DB silent-clamp via Math.min(MAX_GRID_IMAGES, ..., countAvailableImages(item)) (A6)
  - NaN-guard via Number.isFinite (A8)
- [ ] Modify `instagram-layout/route.test.ts`: Tests E4 (alle 6 cases)
- [ ] Modify `instagram/route.ts`: Same `?images=N` URL-Parameter clamp logic (Konsistenz)
- [ ] Modify `instagram/route.test.ts`: Tests für neue clamp-behavior

### Phase 4 — Modal UI
- [ ] Modify `InstagramExportModal.tsx`:
  - imageCount-Default = `Math.min(MAX_GRID_IMAGES, availableImages)` (A5)
  - Slider-Range max = `min(MAX_GRID_IMAGES, availableImages)`
- [ ] Modify `InstagramExportModal.test.tsx`: Tests E3 (default + range)

### Phase 5 — Smoke + Deploy
- [ ] `pnpm test` final clean (~1345 tests)
- [ ] `pnpm build` final clean
- [ ] Local-Smoke: dev-server, Modal mit echten Einträgen durchklicken
- [ ] Push → Sonnet-Gate → PR erstellen
- [ ] Codex PR-Review → triage + fix-loop
- [ ] After merge: Staging deploy + Visual-Smoke E5
- [ ] After staging-OK: Prod deploy + verify (CI green + health + logs)

## Notes

- Branch bleibt `codex/instagram-slide-text-overrides` (kein neuer Branch — Spec-archive zeigt Split-Decision)
- Codex Spec-Review-Findings die in M4a addressed sind: #5 (Sprint-Split), partial #2 (legacy keys handled via A7 read-tolerance)
- Codex Spec-Review-Findings die für M4b reserviert sind: #1 (baseBodyHash lifecycle), #3 (Out-of-Order Preview-Race), #4 (Preview Live-DB vs Snapshot)
- Patterns: `nextjs-og.md` Satori CSS-Subset, `api.md` silent-clamp-Pattern, `testing.md` Vitest jsdom

## Sprint M4b (deferred — separate Sprint nach M4a Prod)

**M4b Foundation (aus Codex M4-Spec-Review):**

- Per-Slide `textOverride` mit Server-side Hash-Derivation (NICHT client-authoritativ)
- Draft-Preview-Route mit AbortController + Request-Sequencing (latest-only-Guard)
- Preview-Snapshot-Binding via contentHash (Hash-Drift = 409, kein silent-render gegen newer-content)
- LayoutEditor textarea + Auto-Button + Stale-Banner
- Stale-Detection per-slide via baseBodyHash (server-derived, validated)

**Vor M4b-Implementation:**
1. Fresh Spec mit den 4 Codex-Architektur-Findings als Foundation
2. Sonnet-Spec-Eval (vermutlich 3-5 Runden)
3. Codex-Spec-Review explicit auf den Override/Preview-Submodus
4. Implementation erst nach Spec-Convergence
