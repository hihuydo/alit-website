# Sprint S2c — Auto-Layout Single Source of Truth

**Branch:** `feat/instagram-auto-layout-single-source-s2c`
**Depends on:** S1a ✅, S1b ✅, S2a ✅ (PR #134), S2b ✅ (PR #135 merged 2026-04-30)
**Status:** Spec
**Created:** 2026-04-30

---

## Summary

Folge-Bug aus S2b: in der Side-by-Side-Ansicht weichen Editor und Preview im Auto-Mode voneinander ab. Editor zeigt `Slide 1 = block A`, Preview rendert auf Slide 1 zusätzlich noch den Anfang von block B weil zwei verschiedene Auto-Layout-Algorithmen unterschiedliche Slide-Boundaries produzieren.

**Fix per Codex 2026-04-30**: gemeinsame Pack-Funktion extrahieren, beide Pfade darauf aufbauen. Whole-block placement als invariant. Single source of truth.

**Manual-Mode bleibt unberührt** (`buildManualSlides` ist schon korrekt). Image-Grid-Logik bleibt unberührt (Phase-Konzept stays). Nur Auto-Path wird konsolidiert.

---

## Sprint Contract (Done-Kriterien)

1. **DK-1**: Neue `packAutoSlides(blocks, opts) → ExportBlock[][]` Funktion in `src/lib/instagram-post.ts`. Whole-block greedy placement. Niemals cross-slide block-splitting. Phase-aware Budgets (intro / leadSlide / normal) per slide-Position.
2. **DK-2**: `projectAutoBlocksToSlides` (Editor-View) ist ein dünner Wrapper um `packAutoSlides` + last-slide-compaction.
3. **DK-3**: `splitAgendaIntoSlides` (Renderer) benutzt `packAutoSlides` + last-slide-compaction für Slide-Boundaries. Innerhalb jeder Slide werden oversized Blöcke via `splitOversizedBlock` (within-slide chunks) für die visuelle Rendering aufgeteilt — die Slide-Zugehörigkeit eines Blocks ändert sich dabei NICHT.
4. **DK-4**: `rebalanceGroups` Funktion ist gelöscht (war einziger Caller `splitAgendaIntoSlides`, macht cross-slide block-splitting → inkompatibel mit whole-block invariant). Last-slide-compaction (whole-block-safe) bleibt erhalten.
5. **DK-5**: `splitBlockToBudget` bleibt (used by `splitOversizedBlock` für within-slide overflow im Manual-Pfad). Aber neu: NICHT mehr von `splitAgendaIntoSlides` direkt aufgerufen.
6. **DK-6**: Property/regression test: für 5+ representative agenda items (mit/ohne grid, kurz/mittel/lang body, DE+FR), `projectAutoBlocksToSlides(item).map(g => g.map(b => b.id))` === `extractSlideBlockIds(splitAgendaIntoSlides(item).slides.filter(s => s.kind === "text"))`. Asserts dieselben slide-block-id-arrays.
7. **DK-7**: Bestehende Tests in `instagram-post.test.ts` adjusted für boundary-drift. Keine Regression in Funktionalität — nur Slide-Aufteilungen verschieben sich an Stellen wo cross-slide splitting vorher gemacht wurde. Manual-Mode-Tests bleiben unverändert.
8. **DK-8**: Visual regression smoke (manuell, Staging): 5+ existing prod-Items in Side-by-Side-Modal öffnen, Editor- und Preview-Slide-Boundaries vergleichen. Müssen identisch sein. Vorher/nachher-Screenshots dokumentiert in PR.

**Done-Definition (zusätzlich zu Standard):**
- Manueller Visual-Smoke vom User signed-off bevor prod-merge
- Soak-Phase auf Staging (≥24h) bevor prod-merge — gibt Zeit, falls bestehende prod-Items Layout-drift zeigen das den User stört

---

## File Changes

### MODIFY
- `src/lib/instagram-post.ts` (~743 → ~700 Zeilen)
  - NEU: `packAutoSlides(blocks, opts)` (~40 Zeilen)
  - SIMPLIFY: `splitAgendaIntoSlides` (line 415) — drop greedy loop + cross-slide split + rebalance call, delegate to `packAutoSlides`, keep grid-wrap + meta + clamp
  - SIMPLIFY: `projectAutoBlocksToSlides` (line 714) — delegate to `packAutoSlides` + last-slide-compaction
  - DELETE: `rebalanceGroups` function (line 103, ~70 Zeilen)
  - PRESERVE: `splitBlockToBudget` (line 77, used by `splitOversizedBlock` in manual mode)
  - PRESERVE: `splitOversizedBlock` (line 58, used by `buildManualSlides`)

- `src/lib/instagram-post.test.ts` (~1075 → ~1100 Zeilen)
  - NEW: property-test describe für DK-6 (5+ items, beide functions vergleichen)
  - ADJUST: ~10-15 existing tests die exakte slide-block-counts/boundaries asserten — die werden für Items mit oversized blocks andere Outputs zeigen (whole-block statt geteilt)
  - PRESERVE: tests die nur slide-COUNT oder warnings asserten ohne Block-Boundaries

### NICHT modifiziert
- `src/lib/instagram-overrides.ts` (S1a — Manual-Pfad unberührt)
- `src/app/api/dashboard/agenda/[id]/instagram-layout/route.ts` (S1b — GET-Endpoint nutzt `projectAutoBlocksToSlides` weiterhin, transparent)
- `src/app/api/dashboard/agenda/[id]/instagram-slide/[slideIdx]/route.tsx` (S1b — nutzt `splitAgendaIntoSlides` weiterhin, transparent)
- `src/app/dashboard/components/LayoutEditor.tsx` (S2a — bit-stable)
- `src/app/dashboard/components/InstagramExportModal.tsx` (S2b — bit-stable)

---

## Approach: `packAutoSlides` Design

```ts
type PackOpts = {
  /** First-slide budget. For non-grid items: SLIDE1_BUDGET (title+lead reserve).
   *  For grid items: slide2BodyBudget = SLIDE_BUDGET - leadHeightPx(lead). */
  firstSlideBudget: number;
  /** Budget for slides 2+. Always SLIDE_BUDGET. */
  normalBudget: number;
};

/** Whole-block greedy packer. Single source of truth for auto-mode slide
 *  boundaries. INVARIANT: no block is ever split across slides — if a
 *  block doesn't fit on the current slide and the slide is non-empty,
 *  flush and start a new slide with the block. If a block doesn't fit
 *  even alone (oversized) → it goes alone on its own slide, and the
 *  caller (renderer) handles within-slide overflow via splitOversizedBlock.
 */
export function packAutoSlides(
  blocks: ExportBlock[],
  opts: PackOpts,
): ExportBlock[][] {
  if (blocks.length === 0) return [];
  const groups: ExportBlock[][] = [[]];
  let remaining = opts.firstSlideBudget;
  for (const block of blocks) {
    const cost = blockHeightPx(block);
    if (cost > remaining && groups[groups.length - 1].length > 0) {
      groups.push([]);
      remaining = opts.normalBudget;
    }
    groups[groups.length - 1].push(block);
    remaining -= cost;
  }
  return groups.filter((g) => g.length > 0);
}
```

**Identisch zum aktuellen `projectAutoBlocksToSlides` body** — nur als standalone mit explicit budgets gehoben. Beide consumers berechnen ihren `firstSlideBudget` aus grid/lead-context und passen ihn rein.

### Last-slide compaction (preserved, whole-block-safe)

`splitAgendaIntoSlides` aktuell macht (line 522-541) last-slide-compaction: wenn die letzte Slide komplett in die vorletzte passt, mergen. Das ist whole-block-safe, behalten wir bei. `projectAutoBlocksToSlides` bekommt den gleichen Pass (consistency).

```ts
export function compactLastSlide(
  groups: ExportBlock[][],
  prevSlideBudget: (idx: number) => number,
): ExportBlock[][] {
  if (groups.length < 2) return groups;
  const lastIdx = groups.length - 1;
  const prevIdx = lastIdx - 1;
  const last = groups[lastIdx];
  const prev = groups[prevIdx];
  if (last.length === 0 || prev.length === 0) return groups;
  const lastCost = last.reduce((s, b) => s + blockHeightPx(b), 0);
  const prevCost = prev.reduce((s, b) => s + blockHeightPx(b), 0);
  const budget = prevSlideBudget(prevIdx);
  if (prevCost + lastCost > budget) return groups;
  const merged = [...groups];
  merged[prevIdx] = [...prev, ...last];
  merged.pop();
  return merged;
}
```

### Renderer post-processing (within-slide overflow)

Nach `packAutoSlides` + `compactLastSlide` macht `splitAgendaIntoSlides` für jede Text-Slide:

```ts
const slideBlocks: SlideBlock[] = group.flatMap((b) =>
  splitOversizedBlock(b, budgetForSlide(idx)),
);
```

Wenn ein einzelner Block oversized ist, wird er innerhalb seiner zugewiesenen Slide in mehrere SlideBlock chunks aufgeteilt — die visuell auf der Slide stacken (potentielle Overflow). Slide-Zugehörigkeit (= `block.id`) ändert sich NICHT — beide chunks tragen dieselbe ID.

### Was sich für User ändert

**Best case (most items)**: nichts — die existing greedy + cross-split + rebalance landet auf derselben whole-block-Aufteilung wie der neue Algorithmus, weil keine Blocks oversized sind.

**Drift case**: Items mit einem Paragraph der größer als ein Slide-Budget ist:
- **Vorher**: Paragraph wird sub-block-gesplittet, head füllt eine Slide auf, tail startet die nächste
- **Nachher**: Paragraph bleibt komplett auf einer Slide, dort visuell overflow via `splitOversizedBlock` chunks

Das ist die korrekte Semantik — Slide-Boundaries respektieren Block-Identität (= block.id), und Overflow ist eine visuelle Property, kein Layout-Property.

**Workaround für betroffene User**: kann jetzt manuell die Slide-Aufteilung im Editor anpassen (z.B. Split einen langen Paragraph auf zwei Slides via die existing „Nächste Slide →" Action). Mit S2b's Side-by-Side-View ist das gut machbar.

---

## Test Strategy

### Property test (DK-6)

```ts
describe("Auto-layout single source of truth", () => {
  const fixtures: AgendaItemForExport[] = [
    /* 5+ items: short, medium, long, with-grid, without-grid, with-headings */
  ];

  for (const item of fixtures) {
    for (const locale of ["de", "fr"] as const) {
      for (const imageCount of [0, 1, 3]) {
        if (isLocaleEmpty(item, locale)) continue;
        it(`item ${item.id} ${locale} imageCount=${imageCount} — editor + renderer agree`, () => {
          const exportBlocks = flattenContentWithIds(item.content_i18n?.[locale] ?? null);
          const editorGroups = projectAutoBlocksToSlides(item, locale, imageCount, exportBlocks);
          const editorIds = editorGroups.map((g) => g.map((b) => b.id));

          const rendererSlides = splitAgendaIntoSlides(item, locale, imageCount).slides;
          const rendererTextSlides = rendererSlides.filter((s) => s.kind === "text");
          // Block-IDs per text-slide, deduped (within-slide overflow chunks share id)
          const rendererIds = rendererTextSlides.map((s) =>
            [...new Set(s.blocks.map((b) => b.id))]
          );

          expect(rendererIds).toEqual(editorIds);
        });
      }
    }
  }
});
```

### Existing test adjustments

Tests die *exakte* slide-counts/boundaries für Items mit oversized blocks asserten werden andere Outputs sehen. Plan:
1. Run pre-S2c test suite, record passing baseline
2. Apply changes
3. Run again, identify failures
4. For each failure: confirm the new boundary is semantically correct (whole-block placement), update expectation
5. NICHT akzeptabel: tests deren Funktional-Assertion (z.B. „warnings includes too_long") nun anders ausgeht — das wäre echte Regression

### Visual regression smoke (DK-8, manual)

5+ representative prod items auf Staging:
- Items mit kurzem Body (1-2 Paragraphen)
- Item mit mittelem Body (3-5 Paragraphen, evtl. headings)
- Item mit langem Body (8+ Paragraphen)
- Item mit grid (2+ images)
- Item mit grid + langem Body

Für jedes: in S2b-Modal öffnen, screenshot Editor + Preview side-by-side, vergleichen mit pre-S2c-Behavior. Editor + Preview müssen identische Slide-Boundaries zeigen.

---

## Implementation Order

1. Read current `splitAgendaIntoSlides` + `projectAutoBlocksToSlides` + `rebalanceGroups` + `splitBlockToBudget` + `splitOversizedBlock` — verify mein Mental-Model
2. Extract `packAutoSlides` + `compactLastSlide` als pure functions, exportiert
3. Refactor `projectAutoBlocksToSlides` → wrapper around `packAutoSlides` + `compactLastSlide`
4. Refactor `splitAgendaIntoSlides`:
   - Replace greedy loop + cross-slide split with `packAutoSlides` call
   - Drop `rebalanceGroups` call (DK-4)
   - Keep last-slide-compaction (call `compactLastSlide`)
   - Apply within-slide `splitOversizedBlock` per group for visual rendering
   - Keep grid-slide wrapping + meta + hard-cap
5. Delete `rebalanceGroups` function
6. Run `pnpm test` — record failures
7. For each failure in `instagram-post.test.ts`: verify boundary drift is semantically OK, update expectation
8. Add property-test (DK-6)
9. `pnpm exec tsc --noEmit` + `pnpm lint` clean
10. Commit + push → Sonnet pre-push gate
11. PR + Codex review
12. Merge to main + staging deploy
13. **Visual smoke DK-8 (manual, User-signoff)** auf staging
14. Soak-Phase ≥24h
15. Prod merge nach explizitem User-Go
16. Post-merge prod deploy verified

---

## Out of Scope

- Manual mode (`buildManualSlides`) — already correct, untouched
- New layout features
- Editor UX changes (S2b ist done)
- Image-grid logic (phase concept bleibt)
- Renderer-templates / styling (Satori `slide-template.tsx` untouched)
- API contracts (GET/PUT endpoints unchanged)

---

## Risk Surface

| Risk | Mitigation |
|---|---|
| Visual regression auf bestehende prod-Auto-Exports | Soak ≥24h Staging + Visual-Smoke 5+ items (DK-8) vor prod-merge |
| Test-suite-drift maskiert echte Regression | Pre-S2c baseline aufnehmen, jede Test-Änderung explizit als „boundary-drift accepted" begründen, NICHT als „test war stale" verstecken |
| `splitOversizedBlock` within-slide chunks könnten visual ugly aussehen | Bestehende Codepath (Manual-Mode benutzt das schon ohne Beschwerden seit S1a) — niedriges Risiko |
| layoutVersion-Hash ändert sich für bestehende Manual-Overrides | Manual-Pfad nicht touched → Hash stable → keine ungewollten staleness-Markierungen |
