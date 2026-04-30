# Sprint: S2c — Auto-Layout Single Source of Truth
<!-- Spec: tasks/spec.md -->
<!-- Branch: feat/instagram-auto-layout-single-source-s2c -->
<!-- Started: 2026-04-30 (S2b merged: PR #135) -->

## Sprint Contract (Done-Kriterien)

- [ ] **DK-1** Neue `packAutoSlides(blocks, opts) → ExportBlock[][]` Funktion in `src/lib/instagram-post.ts`. Whole-block greedy. Phase-aware Budgets per slide-position.
- [ ] **DK-2** `projectAutoBlocksToSlides` ist dünner Wrapper um `packAutoSlides` + `compactLastSlide`.
- [ ] **DK-3** `splitAgendaIntoSlides` benutzt `packAutoSlides` + `compactLastSlide` für Slide-Boundaries. Innerhalb jeder Slide: oversized Blöcke via `splitOversizedBlock` (within-slide chunks). Block-Identität (block.id) bleibt invariant.
- [ ] **DK-4** `rebalanceGroups` Funktion gelöscht (cross-slide splitting, inkompatibel).
- [ ] **DK-5** `splitBlockToBudget` bleibt für `splitOversizedBlock` (manual mode), aber NICHT mehr direkt von `splitAgendaIntoSlides` aufgerufen.
- [ ] **DK-6** Property/regression test: 5+ items × DE/FR × imageCount ∈ {0,1,3} → `editorIds === rendererIds`.
- [ ] **DK-7** Bestehende ~10-15 Tests in `instagram-post.test.ts` adjusted für boundary-drift. Keine Funktional-Regression.
- [ ] **DK-8** Visual regression smoke (manuell, Staging): 5+ existing prod-Items, Editor + Preview Slide-Boundaries identisch. User-signoff.

## Done-Definition

- [ ] Sprint Contract vollständig (8 DKs)
- [ ] Sonnet pre-push gate clean
- [ ] Codex PR-review APPROVED (max 3 rounds)
- [ ] Vitest grün (970+ tests)
- [ ] **Manueller Visual-Smoke DK-8 durch User signed-off**
- [ ] **Soak-Phase ≥24h auf Staging** vor prod-merge
- [ ] Prod merge nach explizitem User-Go
- [ ] Prod deploy verified (CI grün, /api/health 200, Logs clean)

## Out of Scope (S2d+ falls überhaupt)

- Manual mode refactor (already correct)
- New layout features
- Editor UX changes
- Image-grid logic restructure
- Renderer-templates / Satori styling
