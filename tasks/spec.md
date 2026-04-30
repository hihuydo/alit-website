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

1. **DK-1**: Neue `packAutoSlides(blocks, opts) → ExportBlock[][]` Funktion in `src/lib/instagram-post.ts`. Whole-block greedy placement. Niemals cross-slide block-splitting. **Function selbst ist phase-AGNOSTIC** (Sonnet R8 [HIGH #1]) — kennt keine intro/leadSlide/normal Konzepte. Der CALLER computiert `firstSlideBudget` aus seinem eigenen grid/lead-context und passt ihn als `opts.firstSlideBudget`. Function nutzt nur 2 budget-tiers (`firstSlideBudget`, `normalBudget`). KEIN `phase`-Parameter, keine grid/lead-detection im function-body.
2. **DK-2**: `projectAutoBlocksToSlides` (Editor-View) ist ein dünner Wrapper um `packAutoSlides` + last-slide-compaction.
3. **DK-3**: `splitAgendaIntoSlides` (Renderer) benutzt `packAutoSlides` + last-slide-compaction für Slide-Boundaries. Innerhalb jeder Slide werden oversized Blöcke via `splitOversizedBlock` (within-slide chunks) für die visuelle Rendering aufgeteilt — die Slide-Zugehörigkeit eines Blocks ändert sich dabei NICHT.
4. **DK-4**: `rebalanceGroups` Funktion ist gelöscht (war einziger Caller `splitAgendaIntoSlides`, macht cross-slide block-splitting → inkompatibel mit whole-block invariant). Last-slide-compaction (whole-block-safe) bleibt erhalten.
5. **DK-5**: `splitBlockToBudget` wird **mitgenerified** zu `<T extends SlideBlock>` (interner helper, kein behavior-change — notwendig damit `splitOversizedBlock<T>` type-correct funktioniert; siehe File Changes + Sonnet R1 [Medium #6]). Funktional bleibt es: weiterhin used by `splitOversizedBlock` für within-slide overflow im Manual-Pfad, aber NICHT mehr von `splitAgendaIntoSlides` direkt aufgerufen (Auto-Pfad).
6. **DK-6**: Property/regression test: für 5+ representative agenda items (mit/ohne grid, kurz/mittel/lang body, DE+FR), `projectAutoBlocksToSlides(item).map(g => g.map(b => b.id))` === `extractSlideBlockIds(splitAgendaIntoSlides(item).slides.filter(s => s.kind === "text"))`. Asserts dieselben slide-block-id-arrays.
7. **DK-7**: Bestehende Tests in `instagram-post.test.ts` adjusted für boundary-drift. Keine Regression in Funktionalität — nur Slide-Aufteilungen verschieben sich an Stellen wo cross-slide splitting vorher gemacht wurde. Manual-Mode-Tests bleiben unverändert.
8. **DK-8**: Visual regression smoke (manuell, Staging): 5+ existing prod-Items in Side-by-Side-Modal öffnen, Editor- und Preview-Slide-Boundaries vergleichen. Müssen identisch sein. Vorher/nachher-Screenshots dokumentiert in PR.
9. **DK-9** (Sonnet R4 [High #1]): **Direct unit tests** für die zwei neu exportierten Helper. Test imports (Sonnet R5 [Medium #4] + R6 [Medium #2] + R8 [Medium #3]):

   **WICHTIG (Sonnet R8 [Medium #3]):** Die existing `instagram-post.test.ts` importiert bereits aus `./instagram-post` (lines 5-22 inkl. `SLIDE_BUDGET`, `SLIDE1_BUDGET`, `flattenContentWithIds`, `isLocaleEmpty`, `AgendaItemForExport`, `ExportBlock`). NICHT als zweiten import-block einfügen — sonst `import/no-duplicates`-lint-error. Stattdessen MERGEN in den existing import: nur die NEUEN symbols `packAutoSlides`, `compactLastSlide`, `type PackOpts` hinzufügen. Same für `vitest`-imports (`vi`, `afterEach` neu hinzufügen zum existing block).

   Final im File ist's EIN konsolidiertes import-statement pro module. Diese Auflistung hier ist nur zur Übersicht was zusätzlich gebraucht wird:
   ```ts
   // ZUSÄTZLICH zu den existing imports (lines 5-22):
   //   from "./instagram-post":  packAutoSlides, compactLastSlide,
   //                             flattenContentWithIdFallback, splitOversizedBlock,
   //                             type PackOpts
   //   from "vitest":            vi, afterEach, afterAll
   ```
   `afterAll` ist für den DK-6 zero-test-pass-Guard (Sonnet R10 [MEDIUM #4]) — siehe Property test §Test Strategy.
   `flattenContentWithIdFallback` (Sonnet R15 [Missing DK HIGH] sync) wird von den 4 direct-tests benutzt; `splitOversizedBlock` (Sonnet R15 [Missing DK HIGH] sync) vom budget-awareness DK-9-test (testet `chunksAtSlide1.length > chunksAtSlideN.length`).

   **Fixture helper für packAutoSlides/compactLastSlide tests (Sonnet R6 [Medium #3])** — baut ExportBlocks mit deterministischer `blockHeightPx`-output:
   ```ts
   /** Builds an ExportBlock whose blockHeightPx returns exactly
    *  `lines * 52 + 22` (paragraph; lines × BODY_LINE_HEIGHT_PX + PARAGRAPH_GAP_PX).
    *  Math anchor: blockHeightPx (exported function in instagram-post.ts) does
    *  `lines = max(1, ceil(text.length / 36))`. We feed text of length
    *  `lines * 36` so the ceil is exact. Result cost reference:
    *    1 line = 74px, 2 lines = 126px, 5 lines = 282px, 10 lines = 542px,
    *    15 lines = 802px, 20 lines = 1062px (just under SLIDE_BUDGET=1080).
    */
   function mkBlock(id: string, lines: number): ExportBlock {
     return {
       id,
       sourceBlockId: id,
       text: "x".repeat(lines * 36),
       weight: 400,
       isHeading: false,
     };
   }
   ```
   Test cases below benutzen Vielfache von mkBlock-lines damit costs/budgets exakt-vorhersagbar sind. NICHT willkürliche Zahlen ausdenken — sonst trivially-passing risk.

   **Shared opts constant (Sonnet R10 [MEDIUM #3])** — anchors the `type PackOpts` import (sonst flaggt `@typescript-eslint/no-unused-vars`) und reduziert duplication über die 7 packAutoSlides-cases:
   ```ts
   const opts: PackOpts = { firstSlideBudget: 500, normalBudget: 1000 };
   ```
   Cases die einen andern `firstSlideBudget` brauchen (z.B. `boundary: 512`) override per inline-spread: `{ ...opts, firstSlideBudget: 512 }`. Same gilt für die `normalBudget`-only-overrides — keine separate constants.

   - **`packAutoSlides`** — alle costs aus `mkBlock(id, lines)` (lines × 52 + 22 px). Each test asserts EXACT structure:
     - **empty input**: `packAutoSlides([], opts)` → `expect(result).toEqual([])`
     - **single block fits firstSlide**: `mkBlock("a", 5)` cost=282, firstSlide=500 → `expect(result).toEqual([[blockA]])` (1 group)
     - **single oversized block** (cost > firstSlideBudget): `mkBlock("a", 15)` cost=802, firstSlide=500 → `expect(result).toEqual([[blockA]])` (1 group, alone — whole-block invariant; oversize akzeptiert weil current group leer)
     - **2 blocks both fit firstSlide**: `mkBlock("a", 3)` cost=178 + `mkBlock("b", 3)` cost=178 = 356, firstSlide=500 → `expect(result).toEqual([[blockA, blockB]])` (1 group)
     - **2 blocks where 2nd doesn't fit firstSlide**: `mkBlock("a", 5)` cost=282 + `mkBlock("b", 5)` cost=282 = 564, firstSlide=500, normal=1000 → `expect(result).toEqual([[blockA], [blockB]])` (2 groups; 564>500 flush)
     - **boundary: block exactly equals remaining budget**: `mkBlock("a", 3)` cost=178 + `mkBlock("b", 6)` cost=334, firstSlide=512 (= 178+334 exakt) → `expect(result).toEqual([[blockA, blockB]])` (b passt EXAKT, kein flush)
     - **oversized block on slide 2+ goes alone (Sonnet R7 [HIGH #1] whole-block invariant für slide-2+ branch)**: `mkBlock("a", 3)` cost=178 + `mkBlock("b", 25)` cost=1322, firstSlide=500, normal=1000 → `expect(result).toEqual([[blockA], [blockB]])` (B oversize > normalBudget, geht trotzdem alleine auf slide 2 — kein double-flush). Distinct branch vom firstSlide-oversize-Test (testet remaining-reset-Pfad nach erstem flush).
     - **3 blocks: A fills slide-1, B+C group on slide-2 under normalBudget (Sonnet R8 [HIGH #2] normalBudget-grouping coverage)**: `mkBlock("a", 5)` cost=282 + `mkBlock("b", 5)` cost=282 + `mkBlock("c", 4)` cost=230, firstSlide=500, normal=1000 → `expect(result).toEqual([[blockA], [blockB, blockC]])`. Trace: A(282) fits firstSlide=500 (remaining=218). B(282) > 218 → flush, new slide remaining=normal=1000. B(282) push, remaining=718. C(230) ≤ 718 → push same slide. Verifiziert dass `remaining = opts.normalBudget` korrekt nach flush gesetzt wird (NICHT `firstSlideBudget`). Catch für copy-paste-typo `remaining = opts.firstSlideBudget` der alle anderen Tests passt.
   - **`compactLastSlide`** — `prev` und `last` jeweils ein-Block-groups via mkBlock. Sonnet R5 [MEDIUM #2] clarification: "EXCEEDS" meint `prevCost + lastCost > prevBudget` (combined, NICHT lastCost alone). Sonnet R5 [MEDIUM #5] concrete values:
     - **1 group**: `const groups = [[mkBlock("a", 3)]]; const result = compactLastSlide(groups, () => 1000)` → `expect(result).toHaveLength(1)`. **Plus reference-identity check (Sonnet R9 [INFO #5]):** `expect(result).toBe(groups)` — verifiziert die no-copy-on-no-merge optimization (siehe §Concrete invocations: `let compactedGroups` rely on diese aliasing-property für die grid-alone-guard).
     - **2 groups, combined fits** (Sonnet R7 [MEDIUM #2] explicit call; Sonnet R10 [LOW #5] explicit var-decls): `const blockA = mkBlock("a", 3); const blockB = mkBlock("b", 3); const result = compactLastSlide([[blockA], [blockB]], () => 600);` (prev cost=178, last cost=178, combined 356 ≤ 600) → `expect(result).toHaveLength(1)`, `expect(result[0]).toEqual([blockA, blockB])` (merged — same instances)
     - **2 groups, combined EXCEEDS prevBudget** (Sonnet R7 [MEDIUM #2] explicit call; last alone fits, combined doesn't; Sonnet R10 [LOW #5] explicit var-decls; Sonnet R13 [Ambiguity] reference-identity): `const blockA = mkBlock("a", 10); const blockB = mkBlock("b", 3); const groups = [[blockA], [blockB]]; const result = compactLastSlide(groups, () => 600);` (prev cost=542, last cost=178, last alone 178<600 OK, combined 720>600) → `expect(result).toEqual([[blockA], [blockB]])` (unchanged) **+ `expect(result).toBe(groups)`** — verifiziert no-copy-on-no-merge auch für 2-group-Pfad (parallel zur 1-group-Garantie). Catch für defensive `return [...groups]` in der no-merge-branch, das die `let compactedGroups` aliasing-property im Renderer's grid-alone-guard silent brechen würde.
     - **empty group as last (defensive)** (Sonnet R14 [Edge Case] reference-identity sync): `const blockA = mkBlock("a", 3); const groups = [[blockA], []]; const result = compactLastSlide(groups, () => 1000);` → `expect(result).toEqual([[blockA], []])` (unchanged — empty-guard) **+ `expect(result).toBe(groups)`** — verifiziert no-copy auch im empty-last-group-Pfad (parallel zur 1-group + 2-group-no-merge Garantie). Catch für `return [...groups]` defensive-copy in der empty-guard-branch.
     - **2 groups, idx-aware callback at prevIdx=0 (Sonnet R17 [AMBIGUITY MEDIUM] callback-uses-firstSlideBudget coverage)**: exerciert `prevSlideBudget(0)` mit einem callback der idx=0 vs idx=1 unterscheidet. Catch für Renderer-typo `compactLastSlide(packedGroups, (_idx) => SLIDE_BUDGET)` der die `idx === 0 ? firstSlideBudget : SLIDE_BUDGET`-Logik durch eine uniform-budget-Variante ersetzen würde.
       ```ts
       const blockA = mkBlock("a", 3); // cost 178
       const blockB = mkBlock("b", 5); // cost 282, combined 460
       const groups = [[blockA], [blockB]];
       // 460 > 300 (idx=0 budget) → no merge; 460 < 600 (idx=1 budget) → confirms idx is consulted
       const result = compactLastSlide(groups, (idx) => (idx === 0 ? 300 : 600));
       expect(result).toHaveLength(2);
       expect(result).toBe(groups); // no-merge reference identity
       ```
       Wenn der typo `(_idx) => 600` verwendet wird, würde `combined=460 ≤ 600` → merge → result.length === 1 → test fail't.
     - **3 groups, last 2 fit; first preserved (Sonnet R11 [MEDIUM #3] multi-slide-path coverage)**: exerciert `prevSlideBudget(1)` (slide-2+ branch), nicht nur `prevSlideBudget(0)` wie alle anderen Tests. Catch für copy-paste-typo wo callback always returns firstSlideBudget regardless of idx.
       ```ts
       const blockA = mkBlock("a", 3);
       const blockB = mkBlock("b", 3);
       const blockC = mkBlock("c", 3);
       const result = compactLastSlide(
         [[blockA], [blockB], [blockC]],
         (idx) => idx === 0 ? 300 : 600, // verifies idx-aware callback
       );
       // prev=slide-2 cost=178, last=slide-3 cost=178, combined 356 ≤ 600 → merge last pair
       expect(result).toHaveLength(2);
       expect(result[0]).toEqual([blockA]); // first group untouched
       expect(result[1]).toEqual([blockB, blockC]); // last pair merged
       ```
   - **`splitOversizedBlock` budget-awareness (Sonnet R13 [Correctness] within-slide-split coverage)** — testet dass die `budgetForSlide`-closure im Renderer (siehe §Renderer post-processing) tatsächlich pro-slide unterschiedliche budgets benutzt, nicht uniform `SLIDE_BUDGET`. Ohne diesen Test passt ein developer-typo `(_idx) => SLIDE_BUDGET` alle anderen DKs aber produziert visual overflow auf Slide 0 für non-grid items mit oversized body.
     ```ts
     it("budgetForSlide(0) chunks at SLIDE1_BUDGET (smaller) — more chunks than SLIDE_BUDGET", () => {
       // huge: 25 lines × 52 + 22 = 1322px > SLIDE_BUDGET (1080) — both budgets force chunking
       const huge = mkBlock("a", 25);
       const chunksAtSlide1 = splitOversizedBlock(huge, SLIDE1_BUDGET);
       const chunksAtSlideN = splitOversizedBlock(huge, SLIDE_BUDGET);
       // SLIDE1_BUDGET (~560) < SLIDE_BUDGET (1080), so produces strictly more chunks
       expect(chunksAtSlide1.length).toBeGreaterThan(chunksAtSlideN.length);
       // Both chunk-sets share parent block.id (within-slide invariant)
       expect(chunksAtSlide1.every((c) => c.id === "a")).toBe(true);
       expect(chunksAtSlideN.every((c) => c.id === "a")).toBe(true);
     });
     ```
     Catch für `budgetForSlide = (_idx) => SLIDE_BUDGET` typo — der Test fail't sofort weil dann beide chunks-sets identisch wären. Auch implicit gate dass `splitOversizedBlock` den budget-Parameter respektiert (kein hard-coded SLIDE_BUDGET interner default).
   - **`flattenContentWithIdFallback` direct tests (Sonnet R14 [Missing DK])** — drei it()-cases die die Identity-Pass-Through, Synthetic-Fallback und Mixed-Order Pfade unabhängig vom Renderer-Pipeline pinnen. Ohne diese würde Codex R2 das fehlende coverage-Test für die neue exported function flaggen.
     ```ts
     describe("flattenContentWithIdFallback", () => {
       it("identity pass-through: id-having block → block:{id} prefix + sourceBlockId no-prefix", () => {
         const result = flattenContentWithIdFallback([
           { id: "p1", type: "paragraph", content: [{ text: "hello" }] },
         ]);
         expect(result).toHaveLength(1);
         expect(result[0]).toMatchObject({ id: "block:p1", sourceBlockId: "p1", text: "hello" });
       });

       it("synthetic fallback: id-less block → synthetic-{idx} for both id and sourceBlockId", () => {
         const result = flattenContentWithIdFallback([
           // @ts-expect-error — intentional id-less for fallback coverage
           { type: "paragraph", content: [{ text: "no-id" }] },
         ]);
         expect(result).toHaveLength(1);
         expect(result[0]).toMatchObject({ id: "synthetic-0", sourceBlockId: "synthetic-0", text: "no-id" });
       });

       it("mixed order [id, no-id, id]: counter only increments on id-less blocks", () => {
         const result = flattenContentWithIdFallback([
           { id: "p1", type: "paragraph", content: [{ text: "a" }] },
           // @ts-expect-error — intentional id-less
           { type: "paragraph", content: [{ text: "b" }] },
           { id: "p2", type: "paragraph", content: [{ text: "c" }] },
         ]);
         expect(result.map((b) => b.id)).toEqual(["block:p1", "synthetic-0", "block:p2"]);
       });

       it("null content returns empty array", () => {
         expect(flattenContentWithIdFallback(null)).toEqual([]);
       });

       it("undefined content returns empty array (Sonnet R16 [Missing Edge Case])", () => {
         expect(flattenContentWithIdFallback(undefined)).toEqual([]);
       });

       it("synIdx increments at push-site, not for filtered-empty blocks (Sonnet R16 [CORRECTNESS HIGH])", () => {
         const result = flattenContentWithIdFallback([
           // @ts-expect-error — id-less + empty text → filtered out, synIdx UNVERÄNDERT
           { type: "paragraph", content: [{ text: "" }] },
           // @ts-expect-error — id-less + non-empty → bekommt synthetic-0 (NICHT -1)
           { type: "paragraph", content: [{ text: "kept" }] },
         ]);
         expect(result).toHaveLength(1);
         expect(result[0].id).toBe("synthetic-0");
       });
     });
     ```
   - **Grid-alone guard (Codex PR R1 [P1] resolved)**: Asymmetry (b) eliminated — `projectAutoBlocksToSlides` ALSO ports the guard `if compactedGroups.length === 0 && hasGrid && lead → push []`. Pre-PR-R1 the spec marked this as renderer-only; Codex PR R1 correctly identified that the mismatch caused different slide counts in S2b's side-by-side modal for hasGrid+lead+empty-body items. New DK-9 sub-tests under §`projectAutoBlocksToSlides — grid-alone-guard parity (Codex PR R1 [P1])`: 3 cases (with-lead/no-lead/no-grid) verifying both sides produce identical structures.
   - **Defensive sanity-check (Sonnet R4 [Medium #3] + Codex R1 [Architecture] umbenannt)**: separate test mit `vi.spyOn` cleanup (Sonnet R5 [MEDIUM #3]):
     ```ts
     describe("[s2c] synthesized id for legacy id-less block sanity-check", () => {
       afterEach(() => vi.restoreAllMocks());
       it("warns once + renderer keeps the block (synthesized id)", () => {
         const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
         const item = baseItem({
           content_i18n: { de: [
             { id: "p1", type: "paragraph", content: [{ text: "ok" }] },
             // @ts-expect-error — intentional id-less block for fail-safe coverage
             { type: "paragraph", content: [{ text: "no-id" }] },
           ], fr: null },
         });
         const result = splitAgendaIntoSlides(item, "de", 0); // should not throw
         expect(warn).toHaveBeenCalledTimes(1);
         expect(warn).toHaveBeenCalledWith(
           "[s2c] synthesized id for legacy id-less block",
           expect.objectContaining({ itemId: item.id, locale: "de", synthesized: 1 }),
         );
         // Codex R1 [Architecture] core invariant: id-less block MUST appear
         // in renderer output (synthesized, not dropped). Editor would drop it,
         // hence the documented Editor/Renderer asymmetry (siehe §Behavior change).
         const allRenderedTexts = result.slides
           .filter((s) => s.kind === "text")
           .flatMap((s) => (s.blocks as ExportBlock[]).map((b) => b.text));
         expect(allRenderedTexts.some((t) => t.includes("no-id"))).toBe(true);
       });
     });
     ```

10. **DK-10** (Codex R1 [Correctness] + Codex R2 [Contract] scope-narrow + User R2 [Contract] consistency): **Library-level** external-contract regression tests in `instagram-post.test.ts` für `splitAgendaIntoSlides(...).warnings`-Stabilität. Whole-block packing kann slide-count gegenüber cross-slide splitting verändern — Tests pinnen dass `result.warnings.includes("too_long")` für oversized items weiterhin triggert + slides clamped auf `SLIDE_HARD_CAP=10`, und dass non-oversized fixtures weiterhin warning-frei bleiben. Mindestens 3 explizite tests (siehe §External-contract regression tests Scope/Out-of-scope-Block).

**Done-Definition (zusätzlich zu Standard):**
- Manueller Visual-Smoke vom User signed-off bevor prod-merge
- Soak-Phase auf Staging (≥24h) bevor prod-merge — gibt Zeit, falls bestehende prod-Items Layout-drift zeigen das den User stört
- Staging-Logs auf `[s2c] synthesized id for legacy id-less block` checken (Codex R1 [Architecture]) — gefundene Items als Migration-Kandidat in `memory/todo.md` anlegen, NICHT-blocking für S2c-Merge

---

## File Changes

### MODIFY
- `src/lib/instagram-post.ts` (~743 → ~710 Zeilen)
  - NEU: `export type PackOpts = { firstSlideBudget: number; normalBudget: number }` (Sonnet R5 [LOW #6] — exported damit caller den Type referenzieren können, sonst Codex [P3])
  - NEU: `export function flattenContentWithIdFallback(content: JournalContent | null | undefined): ExportBlock[]` (~30 Zeilen, exported, Sonnet R13 [Architecture] + R16 [Missing Edge Case] sync — siehe §Behavior change full body). Renderer-only consumer; muss `export` damit DK-9 sanity-check + zukünftige direkte unit-tests sie importieren können. Parameter-Type `| null | undefined` (statt nur `| null`) für Parität mit dem `flattenContentWithIds`-Sibling — defensive callers ohne `?? null` an der call-site bekommen kein TS-error.
  - NEU: `export function packAutoSlides<T extends SlideBlock>(blocks: T[], opts: PackOpts): T[][]` (~40 Zeilen, generic, exported — see §Approach for full body; Sonnet R3 [Medium #4] requires explicit `export`; Sonnet R9 [MEDIUM #2] requires explicit `opts: PackOpts` annotation sonst `noImplicitAny`)
  - NEU: `export function compactLastSlide<T extends SlideBlock>(groups: T[][], prevSlideBudget: (idx: number) => number): T[][]` (~15 Zeilen, generic, exported, callback typed)
  - GENERIFY: `splitOversizedBlock` → `<T extends SlideBlock>(block: T, budget) → T[]` (Sonnet R0 [P3 #6]: backwards-kompatibel, kein behavior-change — nur type-parameter, damit ExportBlock-IDs durch die chunks erhalten bleiben). Same for `splitBlockToBudget` (interner helper, mitgenerified).
  - SIMPLIFY: `splitAgendaIntoSlides` (line 415):
    - **EXPLICIT REMOVAL** (Sonnet R0 [Critical #3] + Codex R1 [Architecture]): Zeilen 424-426 `flattenContent(...).flatMap((block) => splitOversizedBlock(block, SLIDE_BUDGET))` werden entfernt. Stattdessen: `flattenContentWithIdFallback(item.content_i18n?.[locale] ?? null)` → raw `ExportBlock[]` ohne pre-splitting, **mit synthetic-id fallback für legacy id-less blocks** (siehe §Behavior change). NICHT `flattenContentWithIds` — das würde id-lose blocks droppen.
    - Drop greedy loop (lines 449-501) + rebalance call (line 506)
    - Delegate to `packAutoSlides<ExportBlock>` + `compactLastSlide<ExportBlock>`
    - Keep last-slide-compaction (whole-block-safe variant via `compactLastSlide`)
    - Apply within-slide `splitOversizedBlock<ExportBlock>` per group für visual rendering (siehe budgetForSlide-Helper unten)
    - Keep grid-wrap + meta + hard-cap
  - SIMPLIFY: `projectAutoBlocksToSlides` (line 714) — delegate to `packAutoSlides<ExportBlock>` + `compactLastSlide<ExportBlock>`. **WICHTIG (Sonnet R6 [HIGH #1])**: Function-Signatur bleibt **identisch** — `(item: AgendaItemForExport, locale: Locale, imageCount: number, exportBlocks: ExportBlock[]) → ExportBlock[][]`. Keine arg-changes — nur der Body wird ersetzt.
  - DELETE: `rebalanceGroups` function (line 103, ~70 Zeilen)

- `src/lib/instagram-post.test.ts` (~1075 → ~1100 Zeilen)
  - NEW: property-test describe für DK-6 (5+ items, beide functions vergleichen, IDs-via-cast siehe DK-6-Code unten)
  - ADJUST: ~10-15 existing tests die exakte slide-block-counts/boundaries asserten — die werden für Items mit oversized blocks andere Outputs zeigen (whole-block statt geteilt)
  - PRESERVE: tests die nur slide-COUNT oder warnings asserten ohne Block-Boundaries

### Type implications (Sonnet R0 [Critical #1, #2])

`Slide.blocks` Typ bleibt **`SlideBlock[]`** (kein Type-Cascade in `instagram-overrides.ts`). Die runtime-Instanzen sind aber `ExportBlock[]` (Subtyp), weil:
- Manual-Mode: `buildManualSlides` füttert schon `ExportBlock`-Inputs in `splitOversizedBlock` (siehe `instagram-overrides.ts:128`). Mit generifiziertem `splitOversizedBlock` bleiben die Outputs `ExportBlock`. Das wird in `Slide.blocks: SlideBlock[]` upgecasted (struktural OK, IDs runtime-vorhanden).
- Auto-Mode neu: `splitAgendaIntoSlides` füttert `flattenContentWithIdFallback`-Output (ExportBlock[], synthetic-id fallback) in `packAutoSlides`. Output bleibt `ExportBlock[]`. Same upcast. Editor (`projectAutoBlocksToSlides`) bleibt bei `flattenContentWithIds` (filter — siehe §Behavior change Asymmetrie-Doku).

DK-6-Test extrahiert IDs via cast: `(s.blocks as ExportBlock[]).map(b => b.id)`. Helper-Funktion `getSlideBlockIds(slide): string[]` empfohlen für Klarheit (siehe DK-6 Code unten).

### NICHT modifiziert
- `src/lib/instagram-overrides.ts` (S1a — Manual-Pfad unberührt; profitiert transparent von der `splitOversizedBlock`-Generification weil seine ExportBlock-Inputs jetzt typgenau erhalten bleiben)
- `src/app/api/dashboard/agenda/[id]/instagram-layout/route.ts` (S1b — GET-Endpoint nutzt `projectAutoBlocksToSlides` weiterhin, transparent)
- `src/app/api/dashboard/agenda/[id]/instagram-slide/[slideIdx]/route.tsx` (S1b — nutzt `splitAgendaIntoSlides` weiterhin, transparent)
- `src/app/dashboard/components/LayoutEditor.tsx` (S2a — bit-stable)
- `src/app/dashboard/components/InstagramExportModal.tsx` (S2b — bit-stable)
- `src/app/api/dashboard/agenda/[id]/instagram-slide/[slideIdx]/slide-template.tsx` (Satori template liest `slide.blocks` als generisches Array — strukturell SlideBlock-kompatibel)

### Behavior change: Renderer benutzt `flattenContentWithIdFallback` (Codex R1 [Architecture] — synthesize statt drop)

**Problem (Codex R1 [Architecture]):** Der ursprüngliche S2c-Plan war `flattenContent` → `flattenContentWithIds` im Renderer. Aber `flattenContentWithIds` (line 633) **filtert blocks ohne `block.id`** — unter dieser Strategie würde ein Legacy-Item mit ID-losen blocks silently aus dem Export verschwinden statt wie bisher gerendert zu werden. Reines `console.warn`-Logging ist keine Migrationsstrategie für Daten-Verträglichkeit.

**Fix:** Neue Helper-Function `flattenContentWithIdFallback` — wie `flattenContent` (tolerant, keine blocks gedroppt), aber synthesiert stable IDs für ID-lose blocks via deterministischer position-basierter Strategie. Renderer benutzt ausschließlich die neue Function. Editor-Pfad (`flattenContentWithIds`) bleibt unverändert (filter, weil Editor nur addressable blocks anzeigt).

```ts
// NEU in src/lib/instagram-post.ts (neben flattenContent + flattenContentWithIds):
/** Renderer-only flatten that preserves all blocks; assigns synthetic IDs
 *  to legacy id-less blocks so they participate in boundary computation
 *  without being dropped. Synthetic IDs are PER-CALL (not persisted) — used
 *  only for within-request slide boundaries + chunk-id propagation.
 *
 *  IMPLEMENTATION (Sonnet R14 [Correctness] HIGH): MUST iterate source
 *  `content` directly — DARF NICHT `flattenContent(content)` aufrufen, weil
 *  flattenContent's SlideBlock-output keine `block.id` mehr hat (gestripped).
 *  Body ist strukturell ein Klon von `flattenContentWithIds` (line 633ff),
 *  aber statt `if id missing → continue` macht es `if id missing → synthetic-${synIdx++}`.
 *  EXPORT_BLOCK_PREFIX (`"block:"`) wird wie in flattenContentWithIds für
 *  echte IDs verwendet, sonst sind editor- und renderer-IDs nicht parity-fähig.
 */
export function flattenContentWithIdFallback(
  content: JournalContent | null | undefined,
): ExportBlock[] {
  if (!content || !Array.isArray(content)) return [];
  const out: ExportBlock[] = [];
  let synIdx = 0;
  for (const block of content) {
    const hasId = typeof block.id === "string" && block.id.length > 0;
    // Local helper resolves the ID lazily — only consumed when we actually
    // push (Sonnet R16 [CORRECTNESS HIGH]: synIdx++ must NOT increment for
    // empty-text blocks that are filtered out, otherwise synthetic IDs
    // would have gaps like [synthetic-1, synthetic-3, ...] for users.
    const resolveIds = (): { id: string; sourceBlockId: string } => {
      if (hasId) return { id: `${EXPORT_BLOCK_PREFIX}${block.id}`, sourceBlockId: block.id! };
      const id = `synthetic-${synIdx++}`;
      return { id, sourceBlockId: id };
    };
    switch (block.type) {
      case "paragraph":
      case "quote":
      case "highlight": {
        const text = block.content.map((n) => n.text).join("");
        if (text.trim().length === 0) break;
        const ids = resolveIds();
        out.push({ ...ids, text, weight: 400, isHeading: false });
        break;
      }
      case "heading": {
        const text = block.content.map((n) => n.text).join("");
        if (text.trim().length === 0) break;
        const ids = resolveIds();
        out.push({ ...ids, text, weight: 800, isHeading: true });
        break;
      }
      case "caption": {
        const text = block.content.map((n) => n.text).join("");
        if (text.trim().length === 0) break;
        const ids = resolveIds();
        out.push({ ...ids, text, weight: 300, isHeading: false });
        break;
      }
    }
  }
  return out;
}
```

**Editor/Renderer Asymmetrie (Codex R1 [Architecture] documented):**
- Editor (`projectAutoBlocksToSlides`) benutzt `flattenContentWithIds` → id-less blocks gedroppt (Editor kann sie nicht addressieren, layout-overrides würden invalide IDs referenzieren).
- Renderer (`splitAgendaIntoSlides`) benutzt `flattenContentWithIdFallback` → keine blocks gedroppt, synthetic IDs für legacy items.
- Konsequenz für DK-6: equality `editorIds === rendererIds` gilt nur für items wo alle blocks IDs haben (= prod-reality post-S1b ab 2026-04). Items mit id-less blocks sind **explicit excluded** vom DK-6 equality-check (siehe §Property test Block-Kommentar — dritte dokumentierte Asymmetrie nach (a) `too_long` und (b) `hasGrid + lead + empty body`).

**Defensive Sanity-Check (Implementation step 5a — Codex R1 [Architecture] umbenannt + Sonnet R17 [COMMENT MEDIUM] body-text fix):** im neuen `splitAgendaIntoSlides` ein `console.warn` mit count + itemId/locale wenn ≥1 synthetic ID ausgegeben wurde. **Implementierung: §Implementation Order step 5a** — Telemetrie-count derived aus dem bereits berechneten `exportBlocks` via `filter(b => b.id.startsWith("synthetic-")).length`. KEINE zusätzlichen `flattenContent` oder `flattenContentWithIds` calls (Sonnet R13 [INFO] de-duplicated). Beim Staging-Soak (DK-8 + soak ≥24h) sichtbar in Logs. Kein hard-fail (Renderer rendert weiter — das ist ja der Point), nur Telemetrie für eventuelle Migration.

---

## Approach: `packAutoSlides` Design

```ts
export type PackOpts = {
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
 *
 *  Generic over T extends SlideBlock so ExportBlock IDs survive through
 *  the packing (Sonnet R0 [Critical #1, P3 #6]).
 */
export function packAutoSlides<T extends SlideBlock>(
  blocks: T[],
  opts: PackOpts,
): T[][] {
  if (blocks.length === 0) return [];
  const groups: T[][] = [[]];
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

**Identisch zum aktuellen `projectAutoBlocksToSlides` body** — nur als standalone mit explicit budgets gehoben + generic. Beide consumers berechnen ihren `firstSlideBudget` aus grid/lead-context und passen ihn rein.

### Last-slide compaction (preserved, whole-block-safe, generic)

`splitAgendaIntoSlides` aktuell macht (line 522-541) last-slide-compaction: wenn die letzte Slide komplett in die vorletzte passt, mergen. Das ist whole-block-safe, behalten wir bei. `projectAutoBlocksToSlides` bekommt den gleichen Pass (consistency).

```ts
export function compactLastSlide<T extends SlideBlock>(
  groups: T[][],
  prevSlideBudget: (idx: number) => number,
): T[][] {
  if (groups.length < 2) return groups;
  const lastIdx = groups.length - 1;
  const prevIdx = lastIdx - 1;
  const last = groups[lastIdx];
  const prev = groups[prevIdx];
  // last.length === 0 / prev.length === 0 guards: BOTH defensive only,
  // unreachable via aktuelle callers (Sonnet R16 [COMMENT CORRECTNESS] sync,
  // ersetzt Sonnet R8 [LOW #5] obsolete annotation):
  // - packAutoSlides filtert empty groups via `groups.filter(g => g.length > 0)`
  //   bevor compactLastSlide aufgerufen wird → packedGroups enthält keine [].
  // - Der grid-alone-guard im Renderer (`compactedGroups = [...compactedGroups,
  //   []]`) feuert AFTER compactLastSlide returned, mutiert nur die
  //   `let compactedGroups`-Variable und läuft NICHT durch compactLastSlide.
  // Beide Guards retained für future-caller safety + DK-9 "empty group as last"
  // explicit defensive-test (asserts toBe(groups) auf der no-merge-Pfad).
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

### Concrete invocations of `compactLastSlide` (Sonnet R0 [HIGH #5])

**`splitAgendaIntoSlides` (Renderer)** — `firstSlideBudget` is `slide2BodyBudget` if grid else `SLIDE1_BUDGET`. **Sonnet R11 [MEDIUM #1]**: die existing `slide2BodyBudget`-Berechnung (heute `instagram-post.ts` lines 428–442 inkl. `Math.max(SLIDE_BUDGET - leadHeightPx(lead), 200)` floor + `hasGrid` guard) bleibt **VERBATIM erhalten** — nicht in der EXPLICIT REMOVAL-Liste oben:
```ts
// Bestehend (KEEP) — slide2BodyBudget computation aus Renderer (lines 428-442):
const slide2BodyBudget = hasGrid ? Math.max(SLIDE_BUDGET - leadHeightPx(lead), 200) : SLIDE_BUDGET;
const firstSlideBudget = hasGrid ? slide2BodyBudget : SLIDE1_BUDGET;
const packedGroups = packAutoSlides<ExportBlock>(exportBlocks, {
  firstSlideBudget,
  normalBudget: SLIDE_BUDGET,
});
// `let` (nicht const) weil compactLastSlide bei no-merge-paths die input-
// reference zurückgibt — und Implementation step 5 schiebt dann u.U. ein
// leeres Array via grid-alone-guard (Sonnet R3 [Medium #2] aliasing fix).
let compactedGroups = compactLastSlide(packedGroups, (idx) =>
  idx === 0 ? firstSlideBudget : SLIDE_BUDGET,
);
```

**`projectAutoBlocksToSlides` (Editor)** — same closure, same context (recomputed locally; Sonnet R2 [High #2] now shows the missing `packAutoSlides` call). **Existing `if (exportBlocks.length === 0) return [];` early-return entfällt (Sonnet R8 [Medium #4])** — `packAutoSlides([], ...)` retourniert `[]` via internem early-return, also redundant. Removal ist intentional, nicht silent dropped:
```ts
// HINWEIS: existing line 720 (`if (exportBlocks.length === 0) return [];`)
// wird entfernt — packAutoSlides handles empty input via own early-return.
const hasGrid = resolveImages(item, imageCount).length > 0;
const lead = resolveWithDeFallback(item.lead_i18n, locale);
const firstSlideBudget = hasGrid && lead
  ? Math.max(SLIDE_BUDGET - leadHeightPx(lead), 200)
  : (hasGrid ? SLIDE_BUDGET : SLIDE1_BUDGET);
const packedGroups = packAutoSlides<ExportBlock>(exportBlocks, {
  firstSlideBudget,
  normalBudget: SLIDE_BUDGET,
});
// Codex PR R1 [P1]: Editor MUSS den grid-alone-guard mirroren damit
// hasGrid+lead+empty-body items in side-by-side modal nicht mit
// unterschiedlichen Slide-Counts angezeigt werden. `let` weil
// Reassignment im Guard-Pfad.
let compactedGroups = compactLastSlide(packedGroups, (idx) =>
  idx === 0 ? firstSlideBudget : SLIDE_BUDGET,
);
if (compactedGroups.length === 0 && hasGrid && lead) {
  compactedGroups = [...compactedGroups, [] as ExportBlock[]];
}
return compactedGroups;
```

### Renderer post-processing (within-slide overflow, Sonnet R0 [HIGH #4])

Nach `packAutoSlides` + `compactLastSlide` macht `splitAgendaIntoSlides` für jede Text-Slide ein within-slide-overflow-pass mit dem **slide-position-aware budget** (NICHT pauschal `SLIDE_BUDGET`):

```ts
// Helper closure — same budget-schedule wie `compactLastSlide`-callback.
const budgetForSlide = (idx: number): number =>
  idx === 0 ? firstSlideBudget : SLIDE_BUDGET;

// Per slide: split oversized blocks within-slide (chunks share parent block.id).
const slidesWithChunks: ExportBlock[][] = compactedGroups.map((group, idx) =>
  group.flatMap((b) => splitOversizedBlock(b, budgetForSlide(idx))),
);
```

Wenn ein einzelner Block oversized ist, wird er innerhalb seiner zugewiesenen Slide in mehrere ExportBlock chunks aufgeteilt — die visuell auf der Slide stacken (potentielle Overflow). Slide-Zugehörigkeit (= `block.id`) ändert sich NICHT — beide chunks tragen dieselbe ID (via spread in `splitOversizedBlock`).

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

`Slide.blocks` ist getypt `SlideBlock[]` aber zur Laufzeit `ExportBlock[]` (siehe §Type implications). Der Test nutzt einen kleinen Helper für den explicit cast — TS-clean ohne `any`.

```ts
// **Sonnet R7 [LOW #4]**: Existing instagram-post.test.ts nutzt relative
// imports `from "./instagram-post"` (siehe lines 2-22). Diese symbols
// MERGEN in den existing import-block am Top des Files — KEIN neuer
// import statement. Liste hier nur zur Klarheit was DK-6 zusätzlich
// braucht; im finalen Test-Code ist's eine consolidated import-Statement.
import type { ExportBlock, AgendaItemForExport } from "./instagram-post";
import {
  flattenContentWithIds,
  isLocaleEmpty,
  projectAutoBlocksToSlides,
  splitAgendaIntoSlides,
} from "./instagram-post";

/** Helper — extrahiert dedupte block.id-Liste pro slide. Sicher, weil
 *  `splitAgendaIntoSlides` nach S2c immer ExportBlock-Inputs in seine
 *  Slides schreibt (siehe §Type implications). */
function getSlideBlockIds(slide: { blocks: { id?: unknown }[] }): string[] {
  const ids = (slide.blocks as ExportBlock[]).map((b) => b.id);
  return [...new Set(ids)]; // within-slide overflow chunks share parent id
}

describe("Auto-layout single source of truth (DK-6)", () => {
  // **Sonnet R10 [MEDIUM #4] zero-test-pass safety net**: Vitest reports
  // a describe with 0 it()-calls as green. If a future change makes the
  // dynamic loop emit zero cases (wrong fixture shape, all locales empty,
  // all probeExportBlocks empty), the suite would silently report DK-6 as
  // satisfied. Guard with an afterAll-floor based on the declared
  // fixture matrix. Recompute from the fixtures-array length so adding/
  // removing fixtures keeps the floor honest.
  let casesRan = 0;
  afterAll(() => {
    expect(casesRan, "DK-6 must run at least one case per fixture").toBeGreaterThanOrEqual(fixtures.length);
  });

  // Fixtures — built from existing `baseItem(overrides)` + `paragraphs(count, charsEach)`
  // builders (siehe `src/lib/instagram-post.test.ts` lines 24-45). Beide bleiben in
  // ihrer aktuellen Form (kein S2c change). KEY: jeder Block bekommt eine ID
  // (`p-0`, `p-1`, …) durch `paragraphs()`, sonst würde `flattenContentWithIds`
  // im Renderer-Pfad sie filtern. Drift-coverage: das oversized-paragraph fixture
  // ist der Hauptgrund für DK-6 — andere fixtures regression-guarden den
  // happy-path.
  const fixtures: Array<{ label: string; item: AgendaItemForExport }> = [
    { label: "1-paragraph short (no grid)",
      item: baseItem({ content_i18n: { de: paragraphs(1, 100), fr: paragraphs(1, 100) } }) },
    { label: "5-paragraph medium (no grid)",
      item: baseItem({ content_i18n: { de: paragraphs(5, 200), fr: paragraphs(5, 200) } }) },
    { label: "8-paragraph medium-long (no grid, under hard-cap)",
      item: baseItem({ content_i18n: { de: paragraphs(8, 200), fr: paragraphs(8, 200) } }) },
    { label: "5-paragraph + grid 3 images",
      item: baseItem({
        content_i18n: { de: paragraphs(5, 200), fr: paragraphs(5, 200) },
        images: [
          { public_id: "uuid-a", orientation: "landscape", width: 1200, height: 800 },
          { public_id: "uuid-b", orientation: "landscape", width: 1200, height: 800 },
          { public_id: "uuid-c", orientation: "landscape", width: 1200, height: 800 },
        ],
      }) },
    { label: "**OVERSIZED-DRIFT** — 1 paragraph 1500 chars (forces single-block-overflow)",
      item: baseItem({ content_i18n: { de: paragraphs(1, 1500), fr: paragraphs(1, 1500) } }) },
    { label: "OVERSIZED + grid (drift × grid interaction)",
      item: baseItem({
        content_i18n: { de: paragraphs(1, 1500), fr: paragraphs(1, 1500) },
        images: [
          { public_id: "uuid-a", orientation: "landscape", width: 1200, height: 800 },
        ],
      }) },
    // Sonnet R13 [Correctness] — exerciert die `hasGrid && !lead → SLIDE_BUDGET`
    // branch in projectAutoBlocksToSlides. Ohne diese Fixture hätte ein
    // developer-typo (Renderer-Formel ohne `&& lead` checken in Editor) silent
    // gepasst weil alle anderen Fixtures lead-text haben (baseItem default).
    { label: "5-paragraph + grid 3 images, NO LEAD (Sonnet R13 grid-no-lead branch)",
      item: baseItem({
        lead_i18n: { de: null, fr: null },
        content_i18n: { de: paragraphs(5, 200), fr: paragraphs(5, 200) },
        images: [
          { public_id: "uuid-a", orientation: "landscape", width: 1200, height: 800 },
          { public_id: "uuid-b", orientation: "landscape", width: 1200, height: 800 },
          { public_id: "uuid-c", orientation: "landscape", width: 1200, height: 800 },
        ],
      }) },
  ];

  // **WICHTIG: Drei dokumentierte Editor↔Renderer-Asymmetrien — DK-6 equality
  // gilt NICHT für items die eine dieser Asymmetrien triggern:**
  //
  // (a) Sonnet R2 [Critical #1] — `result.warnings.includes("too_long")`:
  //     Renderer clampt auf SLIDE_HARD_CAP=10, Editor nicht. Skip via early
  //     return im it()-body (siehe `if (result.warnings.includes("too_long")) return;`).
  //
  // (b) Sonnet R5 [HIGH #1] — `hasGrid + lead + empty body`: Renderer
  //     emittiert lead-only text-slide via grid-alone-guard (Implementation
  //     step 5), Editor returned `[]`. Resultat: rendererIds=[[]], editorIds=[].
  //     Skip via `if (probeExportBlocks.length === 0) continue;` außerhalb it().
  //
  // (c) Codex R1 [Architecture] — `content has id-less paragraphs`:
  //     Renderer benutzt `flattenContentWithIdFallback` (synthesized IDs),
  //     Editor benutzt `flattenContentWithIds` (filter). Bei id-less blocks
  //     hat der Renderer mehr blocks als der Editor → IDs differieren
  //     (renderer hat z.B. `synthetic-2` wo editor nichts hat). Skip
  //     erforderlich falls future-fixture id-lose blocks enthält.
  //     Aktuelle Fixtures-Auswahl: alle 7 fixtures via `paragraphs(...)`
  //     helper, der `id: \`p-${i}\`` setzt → Asymmetrie wird nicht getriggert.
  //
  // DK-6's "single source of truth" claim gilt für items wo: alle blocks IDs
  // haben + body nicht leer + slide-count ≤ SLIDE_HARD_CAP. Das ist die
  // prod-reality post-S1b-release (2026-04 erste Hälfte). Asymmetrien sind
  // separat ge-coverage'd: (a) im hard-cap-test, (b) in lead-only renderer
  // tests, (c) im DK-9 sanity-check ("synthesized id for legacy id-less block").

  for (const { item, label } of fixtures) {
    for (const locale of ["de", "fr"] as const) {
      for (const imageCount of [0, 1, 3]) {
        if (isLocaleEmpty(item, locale)) continue;
        // Skip empty-body edge case (siehe Block-Kommentar oben).
        const probeExportBlocks = flattenContentWithIds(item.content_i18n?.[locale] ?? null);
        if (probeExportBlocks.length === 0) continue;
        it(`${label} (${locale}, imageCount=${imageCount}) — editor + renderer agree`, () => {
          casesRan++; // Sonnet R10 [MEDIUM #4] — feeds afterAll floor-assertion.
          const exportBlocks = flattenContentWithIds(item.content_i18n?.[locale] ?? null);
          const editorGroups = projectAutoBlocksToSlides(item, locale, imageCount, exportBlocks);
          // No dedup needed for editorIds (Sonnet R8 [LOW #6]):
          // projectAutoBlocksToSlides uses whole-block placement, each
          // ExportBlock.id appears exactly once per group. rendererIds dedupes
          // because within-slide overflow chunks share parent block.id.
          const editorIds = editorGroups.map((g) => g.map((b) => b.id));

          const result = splitAgendaIntoSlides(item, locale, imageCount);
          // Hard-cap-skip (Sonnet R2 [Critical #1]): renderer clamps to
          // SLIDE_HARD_CAP, editor doesn't. Wenn renderer geclampt hat,
          // ist comparison nicht meaningful — die ersten N agreement zu
          // testen ist out-of-scope für DK-6 (separater hard-cap-test
          // existiert in der pre-S2c suite, bleibt bestehen).
          if (result.warnings.includes("too_long")) return;

          const rendererTextSlides = result.slides.filter((s) => s.kind === "text");
          const rendererIds = rendererTextSlides.map(getSlideBlockIds);

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
4. For each failure: triage in eine von **drei Kategorien**:

   **Category A (whole-block placement statt cross-split)** — Renderer-tests wo eine slide vorher partial-text-overflow zeigte und jetzt ganze Blöcke auf nächster Slide beginnen. Confirm via fixture: was `blockHeightPx(blockX) > remaining` der Auslöser? Update expectation, semantically OK.

   **Category B (Sonnet R2 [High #3]: compaction-induced Editor failure)** — Editor-tests (gegen `projectAutoBlocksToSlides`) wo `editorGroups.length` um genau 1 SINKT. Auslöser: `compactLastSlide` läuft jetzt auch im Editor-Pfad (war pre-S2c nicht der Fall). Confirm via fixture: was `lastGroupCost + prevGroupCost ≤ prevBudget`? Update expectation, semantically OK. **NICHT** als algorithmischen Bug root-causen.

   **Worked-example check (Sonnet R4 [Medium #4])**: bei einer trace der existing `projectAutoBlocksToSlides`-Tests im pre-S2c-test-file zeigte sich, dass die aktuell verwendeten fixtures `paragraphs(N, M)` für realistische N/M nicht in den compaction-trigger fallen (last+prev exceeds budget oder N ≤ 2). Erwartung: Category B in der bestehenden Test-Suite triggert minimal/nicht. Wenn Category B unerwartet oft vorkommt → die fixture cost-math nochmal verifizieren bevor "OK"-Stempel. Heuristik: Category B sollte für ≤ 1-2 existing tests erscheinen; mehr = root-cause-investigation.

   **Category C (echte Regression)** — Funktional-Assertions (warnings, slide-count overall, hard-cap behavior) die anders ausgehen, oder Tests die Group-Membership eines Blocks ändern ohne dass A oder B passt. Diese MÜSSEN root-causegefixt werden — kein „test war stale"-cover-up.

   **Category C explicit detection rule (Sonnet R7 [MEDIUM #3])**: Wenn die geänderte Assertion gegen folgende Felder geht → **Category C, regardless** of how the symptom looks:
   - `result.warnings` (besides `too_long` falls fixture jetzt unter cap fällt)
   - `slide.kind` distribution (text vs grid)
   - **TOTAL `rawSlides.length` BEFORE the hard-cap slice** (also pre-clamp slide count)
   - Block presence/absence (block-id im output das vorher nicht da war oder umgekehrt)

   Nur Änderungen an `slides[i].blocks` membership / block order **bei festem total** sind Category-A/B-Kandidaten. Wenn Total auch ändert + Editor-fixture mit compaction-trigger → potentiell B; aber Renderer-tests mit total-drop NICHT automatisch B (Renderer hatte schon compaction pre-S2c, also nur dann B wenn das pack-result wegen whole-block-placement einen anderen group-count hat — wenn unklar, **lieber als C einstufen + investigation**).

5. Vor jedem test-update kurz im commit-message dokumentieren welche Kategorie (A/B/C). Wenn C → eigener fix-commit vor weiterer Test-Adjustment.

### External-contract regression tests (DK-10, Codex R1 [Correctness] + Codex R2 [Contract] scope-narrow + User R2 [Contract] consistency)

**Scope:** Library-level only — DK-10 pinnt `splitAgendaIntoSlides(...).warnings`-Stabilität in `instagram-post.test.ts`. Whole-block packing kann eine andere total-slide-count produzieren als das alte cross-slide splitting; DK-6 prüft nur die Editor↔Renderer-Boundary-Equality, nicht die `warnings`-Konstanz. Die 3 Tests unten pinnen das warning-Feld direkt am Library-Output.

**Out-of-scope für DK-10** (downstream consumers — kein Test in S2c, follow-up bei Bedarf):

- `/api/dashboard/agenda/[id]/instagram-slide/[slideIdx]/route.tsx` 404 (`slide_not_found`) vs 422 (`too_long`) Branch
- `InstagramExportModal.tsx` Download-Disablement-Logic basierend auf `warnings`
- LayoutEditor `too_many_blocks_for_layout` Banner

Diese Consumer sind dünne handlers/UI-Blöcke die `splitAgendaIntoSlides`'s `warnings`-Output direkt durchreichen. Wenn DK-10's library-level assertions halten, halten die downstream-Pfade auch — kein neuer Bug-Vector durch S2c. Falls ein Route-/UI-spezifischer regression-test später nötig wird → eigenes DK in einem follow-up Sprint.

Tests die das Library-Contract pinnen (3 Tests, im `instagram-post.test.ts`):

```ts
describe("DK-10 external contract — too_long / hard-cap stability", () => {
  it("oversized item still triggers too_long warning", () => {
    // 30+ paragraphs forces > SLIDE_HARD_CAP=10 even with whole-block packing
    const item = baseItem({
      content_i18n: {
        de: paragraphs(30, 200),
        fr: paragraphs(30, 200),
      },
    });
    const result = splitAgendaIntoSlides(item, "de", 0);
    expect(result.warnings).toContain("too_long");
    expect(result.slides.length).toBeLessThanOrEqual(10); // SLIDE_HARD_CAP
  });

  it("borderline item count: pre-S2c boundary semantics preserved for non-oversized fixtures", () => {
    // 8-paragraph item should produce same warning state pre/post-S2c
    // (no oversized blocks → cross-slide-split path was never taken)
    const item = baseItem({
      content_i18n: { de: paragraphs(8, 200), fr: null },
    });
    const result = splitAgendaIntoSlides(item, "de", 0);
    expect(result.warnings).not.toContain("too_long");
  });

  it("oversized SINGLE block (drift case) doesn't silently change warning state", () => {
    // pre-S2c: cross-slide split could fit 1 oversized block in 2 slides under cap
    // post-S2c: whole-block-on-its-own-slide may bump count by 1, but should
    // still not trigger too_long for moderately-sized inputs
    const item = baseItem({
      content_i18n: { de: paragraphs(1, 1500), fr: null },
    });
    const result = splitAgendaIntoSlides(item, "de", 0);
    // Document expected behavior — fail loudly if drifted
    expect(result.warnings).not.toContain("too_long");
  });
});
```

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
2. Generify: `splitOversizedBlock` + `splitBlockToBudget` → `<T extends SlideBlock>` (Sonnet R0 [P3 #6]).
   **WICHTIG (Sonnet R1 [Critical #2] + R3 [High #1])**: Spread-overrides liegen ALLE in `splitBlockToBudget` — KEINE in `splitOversizedBlock` (das nur `splitBlockToBudget` aufruft). TypeScript inferiert `{ ...block, text: headText }` als `Omit<T, "text"> & { text: string }` — NICHT assignable zu `T`. Beide spread-Stellen in `splitBlockToBudget` brauchen `as T`:
   - Early-return branch: `return { head: { ...block, text: rest } as T, tail: null }`
   - Hauptbranch: `head: headText.length > 0 ? { ...block, text: headText } as T : null`, `tail: tailText.length > 0 ? { ...block, text: tailText } as T : null`

   **WICHTIG (Sonnet R9 [HIGH #1])** — `splitOversizedBlock`'s body braucht ZWEI weitere type-annotation-changes (sonst `tsc --noEmit` failed mit `Type 'SlideBlock[]' is not assignable to type 'T[]'`):
   - `const chunks: SlideBlock[] = []` → `const chunks: T[] = []`
   - `let rest: SlideBlock | null = block` → `let rest: T | null = block`
   Nach diesen Änderungen brauchen `chunks.push(rest)` und `chunks.push(head)` keinen weiteren cast — die typisierten Outputs aus `splitBlockToBudget<T>` matchen `T[]`.

   Run `pnpm test` + `tsc` zwischen-check — sollte zero failures geben (no behavior change, nur type-parameter + casts + 2 internal annotations).
3. Extract `packAutoSlides<T>` + `compactLastSlide<T>` als pure functions, exportiert
4. Refactor `projectAutoBlocksToSlides` → wrapper around `packAutoSlides<ExportBlock>` + `compactLastSlide<ExportBlock>` mit der konkreten budget-closure (siehe §Concrete invocations)
5. Refactor `splitAgendaIntoSlides`:
   - **EXPLICIT (Sonnet R0 [Critical #3] + Codex R1 [Architecture])**: Lines 424-426 ersetzen — `flattenContent(...).flatMap((block) => splitOversizedBlock(block, SLIDE_BUDGET))` → `flattenContentWithIdFallback(item.content_i18n?.[locale] ?? null)`. KEIN pre-split. **NICHT `flattenContentWithIds`** (das würde id-lose blocks droppen — siehe §Behavior change).
   - **Add new helper** in `src/lib/instagram-post.ts` (export, neben existing `flattenContent`/`flattenContentWithIds`): **siehe §Behavior change → vollständiger function-body**. WICHTIG (Sonnet R15 [CORRECTNESS HIGH] sync): NICHT die naïve `flattenContent(content).map(...)`-Variante implementieren — `flattenContent` returned `SlideBlock[]` ohne `id`/`sourceBlockId` fields, das würde `tsc --noEmit` fail'n und alle blocks würden synthetic IDs bekommen (Sonnet R14 hat das exact-failure-mode dokumentiert). Body ist strukturell ein Klon von `flattenContentWithIds` (line 633ff) mit `synIdx++`-fallback statt `continue` für id-lose blocks. EXPORT_BLOCK_PREFIX (`"block:"`) für echte IDs damit DK-6 parity gilt.
   - **Defensive sanity-check (5a, Sonnet R2 [Medium #4] + Codex R1 [Architecture] umbenannt + Sonnet R14 [Ambiguity] consolidated)** — single content-extraction, single flatten via `flattenContentWithIdFallback`, telemetry derives from output by counting `synthetic-` prefixed IDs:
     ```ts
     const content = item.content_i18n?.[locale] ?? null;
     const exportBlocks = flattenContentWithIdFallback(content);
     // Telemetrie: count synthetic IDs (1 log-zeile pro Item das legacy
     // id-lose blocks hat). startsWith("synthetic-") is reliable weil echte
     // IDs den EXPORT_BLOCK_PREFIX "block:" tragen (siehe §Behavior change body).
     const synthesized = exportBlocks.filter((b) => b.id.startsWith("synthetic-")).length;
     if (synthesized > 0) {
       console.warn("[s2c] synthesized id for legacy id-less block", {
         itemId: item.id,
         locale,
         synthesized,
       });
     }
     ```
     `exportBlocks` fließt direkt weiter in den `packAutoSlides`-call. Pure Telemetrie — kein hard-fail. Staging-soak (≥24h) checkt Logs nach `[s2c]`-Treffern; gefundene Items sind Migration-Kandidaten (out-of-scope für S2c).
   - Drop greedy loop (lines 449-501) + rebalance call (line 506)
   - Replace mit `packAutoSlides<ExportBlock>(exportBlocks, { firstSlideBudget, normalBudget: SLIDE_BUDGET })`
   - Keep last-slide-compaction (call `compactLastSlide<ExportBlock>` mit budget-closure, siehe §Concrete invocations)
   - **PRESERVE Grid-alone guard (Sonnet R1 [High #3])** — direkt nach `compactLastSlide`-call, vor assembly. Nutzt `let compactedGroups` damit reassignment sauber ist (Sonnet R3 [Medium #2] aliasing fix):
     ```ts
     // Lead-only edge case: hasGrid + lead aber zero body → mind. eine
     // text-slide für das lead emittieren (sonst wäre der lead nirgends sichtbar).
     if (compactedGroups.length === 0 && hasGrid && lead) {
       // `[] as ExportBlock[]` cast: TypeScript inferiert empty literal als
       // `never[]`, was in `(ExportBlock[] | never[])[]` resultiert. Cast
       // verhindert TS-version-abhängige type-error (Sonnet R9 [LOW #3] —
       // TS 5.3+ handles inference, ältere patches könnten failen).
       compactedGroups = [...compactedGroups, [] as ExportBlock[]];
     }
     ```
   - Apply within-slide `splitOversizedBlock<ExportBlock>` per group für visual rendering — `budgetForSlide(idx)` closure (siehe §Renderer post-processing). Resultat: `slidesWithChunks: ExportBlock[][]`.
   - **Update assembly loops (Sonnet R1 [High #4])** — old `groups`-Variable existiert nicht mehr nach refactor; ALLE references in assembly-branches ersetzen:
     - hasGrid path: `groups.forEach((groupBlocks, i) => {...})` → `slidesWithChunks.forEach(...)`
     - !hasGrid path: `groups[0] ?? []` → `slidesWithChunks[0] ?? []`, `groups.slice(1)` → `slidesWithChunks.slice(1)`
   - Keep grid-slide wrapping + meta + hard-cap (clamp-to-`SLIDE_HARD_CAP`)
6. **Pre-delete grep (Sonnet R3 [Medium #3])**: `grep -rn "rebalanceGroups" src/` — bestätigen dass NUR `splitAgendaIntoSlides:506` aufruft (kein test-internal reference, kein external import). Function ist non-exported aber wenn ein test sie via internal-export-pattern referenziert, wäre der baseline-test-run gebrochen. Bei Treffern außer line 506: ALLE callsites entfernen vor dem function-delete. Dann delete `rebalanceGroups` function.
7. Run `pnpm test` — record failures (mostly in `instagram-post.test.ts` für oversized-block fixtures)
8. For each failure: verify boundary drift is semantically OK (whole-block placement statt cross-split) → update expectation. Failures die NICHT block-boundary-drift sind (z.B. warning-counts, slide-count) → echte Regression, root-cause first.
9. Add property-test (DK-6) mit Helper + 5+ fixtures
10. `pnpm exec tsc --noEmit` + `pnpm lint` clean
11. Commit + push → Sonnet pre-push gate
12. PR + Codex review
13. Merge to main + staging deploy
14. **Visual smoke DK-8 (manual, User-signoff)** auf staging
15. **Check staging logs für `[s2c] synthesized id for legacy id-less block` warnings** (Sonnet R13 [Contract] log-string sync) — wenn ≥1 Item betroffen, itemId in `memory/todo.md` als Migration-Kandidat ablegen (NICHT-blocking für S2c-Merge — Renderer rendert weiterhin via synthetic-id fallback)
16. Soak-Phase ≥24h
17. Prod merge nach explizitem User-Go
18. Post-merge prod deploy verified + prod logs auf `[s2c]`-warnings checken

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
| `flattenContent` → `flattenContentWithIds` switch droppt blocks ohne `id` (Sonnet R0 Critical #1) | Defensive `console.warn` (Implementation step 5a) bei drift between den zwei flatten-Functions. Staging-soak ≥24h checkt logs. Risk bounded weil Editor-Pfad das schon seit S1b-Release nutzt — wäre dort schon aufgefallen. |
| Type-cast `(s.blocks as ExportBlock[])` im DK-6 test könnte stale werden falls Slide-Type später zu echtem `SlideBlock[]` zurückgebaut wird | Helper `getSlideBlockIds(slide)` zentralisiert den cast — bei Type-Cleanup nur 1 Stelle anpassen |
