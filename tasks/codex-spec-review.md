# Codex Spec Review R2 — Sprint M4a — 2026-05-03 (gpt-5.5)

## Scope
Verification-only review of R1 fixes. R1 Findings: 4 (1H + 3M).

## Verification Results

### R1 #1 [HIGH Correctness] instagram-slide route cap
[x] FIXED / [ ] STILL OPEN / [ ] PARTIALLY FIXED — Files-to-Change enthält jetzt `instagram-slide/[slideIdx]/route.tsx` mit explizitem `Math.min(MAX_GRID_IMAGES, requestedImages, countAvailableImages(item))`-Clamp. Die direkte Layout-Key-Auflösung via `String(imageCount)` ist dadurch spec-seitig konsistent auf `<=4` begrenzt. Eine `route.test.ts`-Row für `?images=5`, `availableImages=6` → `imageCount=4` wurde ebenfalls ergänzt.
- Verify: Files-to-Change row added, MAX_GRID_IMAGES clamp explicit, test row added

### R1 #2 [MEDIUM Architecture] LayoutEditor scope
[x] FIXED / [ ] STILL OPEN / [ ] PARTIALLY FIXED — Die speculative Empty-textSlides-early-return-Anforderung wurde aus der Spec entfernt. Der LayoutEditor-Test wurde aus Files-to-Change entfernt, und E5 enthält nur noch den durchgestrichenen Hinweis, dass der LayoutEditor-Smoke aus M4a entfernt ist. Repo-grep bestätigt weiterhin keine `textSlides[0]`/`.find`/`.reduce`-Access-Sites im LayoutEditor.
- Verify: empty-state early-return removed, test row removed, E5 smoke removed

### R1 #3 [MEDIUM Contract] 422 vs 400
[ ] FIXED / [ ] STILL OPEN / [x] PARTIALLY FIXED — DK-A7/DK-A7b und der Hauptteil von A7b sind auf Zod-only `400` umgestellt; E4 nennt `PUT imageCount: 5 → 400` und sagt explizit "KEIN 422 mehr". Es bleiben aber zwei direkte Altvertrag-Reste: `tasks/todo.md` Phase 3 fordert noch `PUT-Validator validated.imageCount <= MAX_GRID_IMAGES (A7) → 422 image_count_exceeds_grid_cap`, und `tasks/spec.md` Edge Cases sagt noch `Legacy DB-row mit imageCount=10 | PUT mit imageCount=10 rejected 422 (A7)`. Damit ist der Contract für Implementer nicht vollständig mechanisch bereinigt.
- Verify: 422 path removed, DK-A7 mechanically testable as 400, no dead code

### R1 #4 [MEDIUM Architecture] Legacy >4 keys
[x] FIXED / [ ] STILL OPEN / [ ] PARTIALLY FIXED — A7 ergänzt `legacyOverrideKeys?: number[]` im GET-Response, inklusive sortierter `>MAX_GRID_IMAGES`-Ableitung und conditional spread. E4 ergänzt Tests für vorhandene legacy keys (`[10]`) und für den Fall ohne legacy keys. DK-A7c ist im Sprint Contract vorhanden.
- Verify: legacyOverrideKeys field added to GET response, E4 test added, DK added

## Regressions (only if directly caused by R1 fixes)
[None]

## Verdict
NEEDS WORK (R1 #3 ist nur partiell fixed: zwei verbliebene `422`-Altvertrag-Stellen widersprechen dem neuen Zod-400-Contract)

## Summary
1 finding — verification-only.
