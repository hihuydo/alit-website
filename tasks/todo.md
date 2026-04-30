# Sprint: S2c — Auto-Layout Single Source of Truth
<!-- Spec: tasks/spec.md -->
<!-- Branch: feat/instagram-auto-layout-single-source-s2c -->
<!-- Started: 2026-04-30 (S2b merged: PR #135) -->

## Sprint Contract (Done-Kriterien)

> Wortgleich zu `tasks/spec.md` §Sprint Contract — Codex R1 [Contract #1] sync (todo.md hatte vorher veraltete Phase-aware-Wording aus pre-spec-rounds).

- [ ] **DK-1** Neue `packAutoSlides(blocks, opts) → ExportBlock[][]` Funktion in `src/lib/instagram-post.ts`. Whole-block greedy placement. Niemals cross-slide block-splitting. **Function selbst ist phase-AGNOSTIC** — kennt keine intro/leadSlide/normal Konzepte. Der CALLER computiert `firstSlideBudget` aus seinem eigenen grid/lead-context. Function nutzt nur 2 budget-tiers (`firstSlideBudget`, `normalBudget`). KEIN `phase`-Parameter, keine grid/lead-detection im function-body.
- [ ] **DK-2** `projectAutoBlocksToSlides` (Editor) ist dünner Wrapper um `packAutoSlides` + `compactLastSlide`.
- [ ] **DK-3** `splitAgendaIntoSlides` (Renderer) benutzt `packAutoSlides` + `compactLastSlide` für Slide-Boundaries. Innerhalb jeder Slide werden oversized Blöcke via `splitOversizedBlock` (within-slide chunks) für die visuelle Rendering aufgeteilt — Slide-Zugehörigkeit (`block.id`) bleibt invariant.
- [ ] **DK-4** `rebalanceGroups` Funktion gelöscht (cross-slide splitting, inkompatibel mit whole-block invariant). Last-slide-compaction (whole-block-safe, via `compactLastSlide`) bleibt erhalten.
- [ ] **DK-5** `splitBlockToBudget` wird **mitgenerified** zu `<T extends SlideBlock>` (interner helper, kein behavior-change — notwendig damit `splitOversizedBlock<T>` type-correct funktioniert). Bleibt für `splitOversizedBlock` (manual-mode within-slide overflow), aber NICHT mehr direkt von `splitAgendaIntoSlides` aufgerufen.
- [ ] **DK-6** Property/regression test: 5+ items × DE/FR × imageCount ∈ {0,1,3} → `editorIds === rendererIds` (slide-block-id arrays). **Asymmetrien explicit excluded vom equality-check** (siehe spec §Test Strategy Block-Kommentar): (a) `result.warnings.includes("too_long")` cases (renderer hard-cap-clamp), (b) `hasGrid + lead + empty body` cases (renderer grid-alone-guard emittiert lead-only text-slide, editor returned `[]`).
- [ ] **DK-7** Bestehende ~10-15 Tests in `instagram-post.test.ts` adjusted für boundary-drift. Keine Funktional-Regression — nur Slide-Aufteilungen verschieben sich an Stellen wo cross-slide splitting vorher gemacht wurde. Manual-Mode-Tests bleiben unverändert.
- [ ] **DK-8** Visual regression smoke (manuell, Staging): 5+ existing prod-Items in Side-by-Side-Modal öffnen, Editor- und Preview-Slide-Boundaries vergleichen. Müssen identisch sein. Vorher/nachher-Screenshots in PR.
- [ ] **DK-9** Direct unit tests für `packAutoSlides` + `compactLastSlide` (empty/fits/oversized/boundary cases inkl. 3-group multi-slide-coverage) + sanity-check coverage (`vi.spyOn(console, 'warn')` für `[s2c] dropped blocks without id`). Falls Codex R1 [Architecture] fix angewendet wird (synthetic-id fallback), wird sanity-check zu `[s2c] synthesized id for legacy id-less block` umbenannt.
- [ ] **DK-10** (Codex R1 [Correctness]): External-contract regression tests für `too_long`/hard-cap semantics. Whole-block packing kann slide-count gegenüber cross-slide splitting verändern. Verifizieren dass: (a) `splitAgendaIntoSlides(...).warnings` weiterhin `"too_long"` triggert wenn slides > `SLIDE_HARD_CAP`, (b) `/api/dashboard/agenda/[id]/instagram-slide/[slideIdx]/route.tsx` returned weiterhin 404 für `slide_not_found` und 422 für `too_long`, (c) `InstagramExportModal.tsx` Download-Disablement-Logic unverändert. Mindestens 1 fixture wo whole-block packing eine andere slide-count produziert als cross-slide splitting.

## Done-Definition

- [ ] Sprint Contract vollständig (10 DKs)
- [ ] `pnpm build` clean (Codex R1 [Contract #2]: Refactor mit neuen Exports + Generics + Route-Consumern → build muss laufen)
- [ ] `pnpm test` grün (970+ tests)
- [ ] `pnpm audit --prod` 0 HIGH/CRITICAL (Codex R1 [Contract #2]: CLAUDE.md mandate)
- [ ] Sonnet pre-push gate clean
- [ ] Codex PR-review APPROVED (max 3 rounds)
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
- Strukturierte Telemetrie-Format-Migration für `[s2c]`-warns (Codex R1 [Nice-to-have] — deferred to memory/todo.md)
