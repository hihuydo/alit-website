# Sprint M4 — Instagram Per-Slide Body-Text Override + Slide-1 Cover-Centering
<!-- Spec: tasks/spec.md -->
<!-- Started: 2026-05-03 -->
<!-- Branch: codex/instagram-slide-text-overrides -->

## Done-Kriterien (Sprint Contract)

> Alle müssen PASS sein bevor der Sprint als fertig gilt.

### Build + Test Gate
- [ ] `pnpm exec tsc --noEmit` clean
- [ ] `pnpm test` clean (current 1329 → expected ~1360 mit ~30 neuen Tests)
- [ ] `pnpm build` clean
- [ ] `pnpm audit --prod` 0 HIGH/CRITICAL

### Block A — Slide-1 Cover-Centering + Lead-Move
- [ ] DK-A1: Slide 1 mit `kind: "grid"` rendert Title (zentriert) → Lead (zentriert) → Image-Grid (zentriert) → Hashtags (zentriert) in dieser Reihenfolge — verified via Snapshot-Test in `instagram-post.test.ts`
- [ ] DK-A2: Lead rendert auf Slide 1 wenn `meta.lead` non-empty; `leadOnSlide: false` auf allen text-slides bei grid-path — verified via 2 unit-tests
- [ ] DK-A3: No-grid-Path Slide-1 (`kind: "text"`) hat Title + Lead zentriert
- [ ] DK-A4: `computeSlide1GridSpec` returnt korrekte grid-spec für 0/1/2/3/4/5 images — verified via 6 unit-tests in `instagram-cover-layout.test.ts`
- [ ] DK-A5: `imageCount`-Default im Modal = `min(4, available)` — verified via component test in `InstagramExportModal.test.tsx`
- [ ] DK-A6: GET/POST mit `?images=N>4` clamped server-side auf 4 mit warning — verified via integration test

### Block B — Per-Slide textOverride
- [ ] DK-B1: `InstagramLayoutSlide` Type hat `textOverride?: string` + `baseBodyHash?: string` — Type-Check-Pass + verified via `route.test.ts` PUT-roundtrip
- [ ] DK-B2: PUT `textOverride` auf grid-slide returnt 422 `override_not_allowed` — verified via integration test
- [ ] DK-B3: SlideTemplate rendert override-Text bei `slide.textOverride !== undefined` — verified via component test
- [ ] DK-B5: `computeBodyHashForSlide` deterministic + trim-aware + skip-image-blocks — verified via 4+ unit tests in `instagram-body-hash.test.ts`
- [ ] DK-B6: GET mit modifiziertem agenda-body returnt `warnings: [{type: "body_text_stale", slideIdx: N}]` — verified via integration test
- [ ] DK-B8: PUT-Validator rejected: empty-string textOverride (422), >10000 chars (422 `body_too_long`), non-hex baseBodyHash (422)
- [ ] DK-B9: Audit-Event `agenda_instagram_layout_update` Payload hat `text_overrides_count` field — verified via audit-test

### Block C — LayoutEditor UI
- [ ] DK-C1: Pro body-slide rendert `<textarea data-testid="slide-textarea-${i}">` — verified via component test
- [ ] DK-C3: Auto-Button (`data-testid="slide-override-clear-${i}"`) disabled bei undefined override, enabled bei aktivem — verified via component test
- [ ] DK-C4: Char-Counter zeigt `${len}/${MAX}` mit Color-Branching (gray/amber/red) — verified via component test
- [ ] DK-C5: Move-Buttons disabled bei aktivem override mit Tooltip — verified via component test
- [ ] DK-C7: Stale-Banner rendert mit beiden Buttons bei `warnings.body_text_stale` — verified via component test

### Block D — Draft-Preview-Route
- [ ] DK-D1: POST `/api/dashboard/agenda/[id]/instagram-preview/[slideIdx]/` returnt 200 + image/png + body-bytes>0 — verified via integration test
- [ ] DK-D1b: POST ohne Auth → 401, ohne CSRF → 403, malformed body → 400
- [ ] DK-D2: `renderSlideAsPng` shared helper existiert, beide Routes (GET + POST) rufen ihn auf — verified via grep `renderSlideAsPng` in beiden route-files
- [ ] DK-D3: Client debounce 300ms, per-Slide Preview-Cache, Loading + Error states — verified via component test mit `vi.useFakeTimers()`
- [ ] DK-D4: Save cleart Preview-Cache → re-fetch via GET — verified via component test

### Block E — Tests + Visual-Smoke
- [ ] DK-E1..E6: alle Test-Suites grün (siehe Build+Test Gate oben)
- [ ] DK-E7: Visual-Smoke auf Staging — manueller Walk-Through dokumentiert in PR-Description

### Code-Quality Gates
- [ ] Sonnet pre-push code-reviewer CLEAN
- [ ] Codex PR-Review APPROVED (max 3 Runden)
- [ ] No `[Critical]` in `tasks/review.md` post-Sonnet-Gate
- [ ] No in-scope `[Critical]` in `tasks/codex-review.md` post-merge-gate

### Deploy-Verifikation
- [ ] CI deploy.yml grün
- [ ] `/api/health/` returnt 200 prod
- [ ] Container logs clean nach Deploy (`docker compose logs --tail=30`)

## Tasks

### Phase 1 — Pure Helpers (no UI, no I/O)
- [ ] Create `src/lib/instagram-body-hash.ts` mit `computeBodyHashForSlide(blocks): Promise<string>` (Web-Crypto SHA-256)
- [ ] Create `src/lib/instagram-body-hash.test.ts` mit 4+ Tests (Determinismus, Whitespace-Trim, Image-Skip, Empty-Hash)
- [ ] Create `src/lib/instagram-cover-layout.ts` mit `computeSlide1GridSpec(images, count)` für A4-Rules
- [ ] Create `src/lib/instagram-cover-layout.test.ts` mit 6 Tests (0/1/2/3/4/5 images)

### Phase 2 — Type-System + Server-Side Logic
- [ ] Modify `src/lib/instagram-overrides.ts`: `InstagramLayoutSlide` extended um `textOverride?` + `baseBodyHash?`, Zod-schema mit max-length-cap + hex-regex
- [ ] Modify `src/lib/layout-editor-state.ts`: neue Ops `setSlideOverride`, `clearSlideOverride`, `acknowledgeStale`
- [ ] Modify `src/lib/layout-editor-state.test.ts`: Tests für neue Ops
- [ ] Modify `src/lib/queries.ts`: `getInstagramLayout` returnt `{slides, warnings}` mit per-slide stale-detection
- [ ] Modify `src/lib/instagram-post.ts`: Slide-1 grid mit Lead, leadOnSlide:false bei grid-path, no-grid Title+Lead-Variante mit zentriertem Layout
- [ ] Modify `src/lib/instagram-post.test.ts`: Tests A1/A2/A3
- [ ] Modify `src/app/api/dashboard/agenda/[id]/instagram/route.ts`: PUT-validator-extension (B8), GET stale-warnings (B6), audit-payload (B9)
- [ ] Modify `src/app/api/dashboard/agenda/[id]/instagram/route.test.ts`: Tests E5

### Phase 3 — Render-Pipeline + Preview-Route
- [ ] Create `src/lib/instagram-render-pipeline.ts`: shared `renderSlideAsPng(slide, ctx)` helper
- [ ] Modify `src/app/api/dashboard/agenda/[id]/instagram-slide/[slideIdx]/route.tsx`: refactor zu `renderSlideAsPng`
- [ ] Modify `src/app/api/dashboard/agenda/[id]/instagram-slide/[slideIdx]/slide-template.tsx`: Slide-1 grid centering (Title+Lead+Grid+Hashtags), text-slide override-rendering branch
- [ ] Create `src/app/api/dashboard/agenda/[id]/instagram-preview/[slideIdx]/route.tsx`: POST-Route mit requireAuth + CSRF
- [ ] Create `src/app/api/dashboard/agenda/[id]/instagram-preview/[slideIdx]/route.test.ts`: 4 Integration-Tests E6

### Phase 4 — Modal + LayoutEditor UI
- [ ] Modify `src/app/dashboard/components/InstagramExportModal.tsx`: imageCount-default `min(4, available)`, Slider-Range update
- [ ] Modify `src/app/dashboard/components/InstagramExportModal.test.tsx`: Test-Adjustment
- [ ] Modify `src/app/dashboard/components/LayoutEditor.tsx`: Textarea + Auto-Button + Char-Counter + Move-Disable + Stale-Banner + Draft-Preview-Logic mit debounce
- [ ] Modify `src/app/dashboard/components/LayoutEditor.test.tsx`: Component tests E4

### Phase 5 — Smoke + Deploy
- [ ] `pnpm test` final clean
- [ ] `pnpm build` final clean
- [ ] Local-Smoke: dev-server, Modal öffnen, alle Workflows durchklicken
- [ ] Push → Sonnet-Gate → PR erstellen
- [ ] Codex PR-Review starten → triage + fix-loop
- [ ] After merge: Staging deploy verify → Visual-Smoke E7
- [ ] After staging-OK: prod deploy verify (CI green + health + logs clean)

## Notes

- Ref: `patterns/api.md` Single-Owner-Pattern für Render-Pipeline (Decision D2)
- Ref: `patterns/database-concurrency.md` Optimistic-Concurrency If-Match etag bleibt unangetastet
- Ref: `patterns/nextjs-og.md` Satori CSS-Subset — `whiteSpace: "pre-wrap"` ist supported, `<br>` NICHT zuverlässig
- Ref: `patterns/react.md` debounce via `useEffect` + `setTimeout` cleanup, NICHT lodash debounce
- Ref: `memory/lessons.md` Two-State Editor Model wenn nested-edit relevant — hier evtl. relevant für textOverride state-management
- Existing `If-Match` etag in PUT bleibt unangetastet — kein neuer concurrent-edit failure mode
- Phase 1 (pure helpers) MUST sein vor Phase 2 (Logic die helpers benutzt). Phase 3 (Render) kann parallel zu Phase 2 (Type/Server) starten weil disjoint files. Phase 4 (UI) braucht Phase 1+2+3 als Backend-Truth.
