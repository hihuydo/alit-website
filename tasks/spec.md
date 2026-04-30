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
   //   from "./instagram-post":  packAutoSlides, compactLastSlide, type PackOpts
   //   from "vitest":            vi, afterEach
   ```

   **Fixture helper für packAutoSlides/compactLastSlide tests (Sonnet R6 [Medium #3])** — baut ExportBlocks mit deterministischer `blockHeightPx`-output:
   ```ts
   /** Builds an ExportBlock whose blockHeightPx returns exactly
    *  `lines * 52 + 22` (paragraph; lines × BODY_LINE_HEIGHT_PX + PARAGRAPH_GAP_PX).
    *  Math anchor: blockHeightPx (instagram-post.ts:37) does
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

   - **`packAutoSlides`** — alle costs aus `mkBlock(id, lines)` (lines × 52 + 22 px). Each test asserts EXACT structure:
     - **empty input**: `packAutoSlides([], { firstSlideBudget: 500, normalBudget: 1000 })` → `expect(result).toEqual([])`
     - **single block fits firstSlide**: `mkBlock("a", 5)` cost=282, firstSlide=500 → `expect(result).toEqual([[blockA]])` (1 group)
     - **single oversized block** (cost > firstSlideBudget): `mkBlock("a", 15)` cost=802, firstSlide=500 → `expect(result).toEqual([[blockA]])` (1 group, alone — whole-block invariant; oversize akzeptiert weil current group leer)
     - **2 blocks both fit firstSlide**: `mkBlock("a", 3)` cost=178 + `mkBlock("b", 3)` cost=178 = 356, firstSlide=500 → `expect(result).toEqual([[blockA, blockB]])` (1 group)
     - **2 blocks where 2nd doesn't fit firstSlide**: `mkBlock("a", 5)` cost=282 + `mkBlock("b", 5)` cost=282 = 564, firstSlide=500, normal=1000 → `expect(result).toEqual([[blockA], [blockB]])` (2 groups; 564>500 flush)
     - **boundary: block exactly equals remaining budget**: `mkBlock("a", 3)` cost=178 + `mkBlock("b", 6)` cost=334, firstSlide=512 (= 178+334 exakt) → `expect(result).toEqual([[blockA, blockB]])` (b passt EXAKT, kein flush)
     - **oversized block on slide 2+ goes alone (Sonnet R7 [HIGH #1] whole-block invariant für slide-2+ branch)**: `mkBlock("a", 3)` cost=178 + `mkBlock("b", 25)` cost=1322, firstSlide=500, normal=1000 → `expect(result).toEqual([[blockA], [blockB]])` (B oversize > normalBudget, geht trotzdem alleine auf slide 2 — kein double-flush). Distinct branch vom firstSlide-oversize-Test (testet remaining-reset-Pfad nach erstem flush).
     - **3 blocks: A fills slide-1, B+C group on slide-2 under normalBudget (Sonnet R8 [HIGH #2] normalBudget-grouping coverage)**: `mkBlock("a", 5)` cost=282 + `mkBlock("b", 5)` cost=282 + `mkBlock("c", 4)` cost=230, firstSlide=500, normal=1000 → `expect(result).toEqual([[blockA], [blockB, blockC]])`. Trace: A(282) fits firstSlide=500 (remaining=218). B(282) > 218 → flush, new slide remaining=normal=1000. B(282) push, remaining=718. C(230) ≤ 718 → push same slide. Verifiziert dass `remaining = opts.normalBudget` korrekt nach flush gesetzt wird (NICHT `firstSlideBudget`). Catch für copy-paste-typo `remaining = opts.firstSlideBudget` der alle anderen Tests passt.
   - **`compactLastSlide`** — `prev` und `last` jeweils ein-Block-groups via mkBlock. Sonnet R5 [MEDIUM #2] clarification: "EXCEEDS" meint `prevCost + lastCost > prevBudget` (combined, NICHT lastCost alone). Sonnet R5 [MEDIUM #5] concrete values:
     - **1 group**: `compactLastSlide([[mkBlock("a", 3)]], () => 1000)` → `expect(result).toHaveLength(1)` + same reference
     - **2 groups, combined fits** (Sonnet R7 [MEDIUM #2] explicit call): `compactLastSlide([[mkBlock("a",3)], [mkBlock("b",3)]], () => 600)` (prev cost=178, last cost=178, combined 356 ≤ 600) → `expect(result).toHaveLength(1)`, `expect(result[0]).toEqual([blockA, blockB])` (merged)
     - **2 groups, combined EXCEEDS prevBudget** (Sonnet R7 [MEDIUM #2] explicit call; last alone fits, combined doesn't): `compactLastSlide([[mkBlock("a",10)], [mkBlock("b",3)]], () => 600)` (prev cost=542, last cost=178, last alone 178<600 OK, combined 720>600) → `expect(result).toEqual([[blockA], [blockB]])` (unchanged)
     - **empty group as last (defensive)**: `compactLastSlide([[mkBlock("a",3)], []], () => 1000)` → `expect(result).toEqual([[blockA], []])` (unchanged — empty-guard)
   - **NICHT-tested-by-DK-9 (Sonnet R6 [LOW #4])**: Grid-alone guard (`if compactedGroups.length === 0 && hasGrid && lead → push []`) lebt RENDERER-only in `splitAgendaIntoSlides`. **Nicht in `projectAutoBlocksToSlides` portieren** — siehe DK-6 Block-Kommentar zur intentionalen Asymmetrie. Tests dafür leben in der existing renderer-test-suite (lead-only-with-grid fixtures).
   - **Defensive sanity-check (Sonnet R4 [Medium #3])**: separate test mit `vi.spyOn` cleanup (Sonnet R5 [MEDIUM #3]):
     ```ts
     describe("[s2c] dropped blocks without id sanity-check", () => {
       afterEach(() => vi.restoreAllMocks());
       it("warns once when content has id-less block", () => {
         const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
         const item = baseItem({
           content_i18n: { de: [
             { id: "p1", type: "paragraph", content: [{ text: "ok" }] },
             // @ts-expect-error — intentional id-less block for fail-safe coverage
             { type: "paragraph", content: [{ text: "no-id" }] },
           ], fr: null },
         });
         splitAgendaIntoSlides(item, "de", 0); // should not throw
         expect(warn).toHaveBeenCalledTimes(1);
         expect(warn).toHaveBeenCalledWith(
           "[s2c] dropped blocks without id",
           expect.objectContaining({ itemId: item.id, locale: "de", dropped: 1 }),
         );
       });
     });
     ```

**Done-Definition (zusätzlich zu Standard):**
- Manueller Visual-Smoke vom User signed-off bevor prod-merge
- Soak-Phase auf Staging (≥24h) bevor prod-merge — gibt Zeit, falls bestehende prod-Items Layout-drift zeigen das den User stört

---

## File Changes

### MODIFY
- `src/lib/instagram-post.ts` (~743 → ~700 Zeilen)
  - NEU: `export type PackOpts = { firstSlideBudget: number; normalBudget: number }` (Sonnet R5 [LOW #6] — exported damit caller den Type referenzieren können, sonst Codex [P3])
  - NEU: `export function packAutoSlides<T extends SlideBlock>(blocks: T[], opts): T[][]` (~40 Zeilen, generic, exported — see §Approach for full body; Sonnet R3 [Medium #4] requires explicit `export` keyword)
  - NEU: `export function compactLastSlide<T extends SlideBlock>(groups: T[][], cb): T[][]` (~15 Zeilen, generic, exported)
  - GENERIFY: `splitOversizedBlock` → `<T extends SlideBlock>(block: T, budget) → T[]` (Sonnet R0 [P3 #6]: backwards-kompatibel, kein behavior-change — nur type-parameter, damit ExportBlock-IDs durch die chunks erhalten bleiben). Same for `splitBlockToBudget` (interner helper, mitgenerified).
  - SIMPLIFY: `splitAgendaIntoSlides` (line 415):
    - **EXPLICIT REMOVAL** (Sonnet R0 [Critical #3]): Zeilen 424-426 `flattenContent(...).flatMap((block) => splitOversizedBlock(block, SLIDE_BUDGET))` werden entfernt. Stattdessen: `flattenContentWithIds(item.content_i18n?.[locale] ?? null)` → raw `ExportBlock[]` ohne pre-splitting.
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
- Auto-Mode neu: `splitAgendaIntoSlides` füttert `flattenContentWithIds`-Output (ExportBlock[]) in `packAutoSlides`. Output bleibt `ExportBlock[]`. Same upcast.

DK-6-Test extrahiert IDs via cast: `(s.blocks as ExportBlock[]).map(b => b.id)`. Helper-Funktion `getSlideBlockIds(slide): string[]` empfohlen für Klarheit (siehe DK-6 Code unten).

### NICHT modifiziert
- `src/lib/instagram-overrides.ts` (S1a — Manual-Pfad unberührt; profitiert transparent von der `splitOversizedBlock`-Generification weil seine ExportBlock-Inputs jetzt typgenau erhalten bleiben)
- `src/app/api/dashboard/agenda/[id]/instagram-layout/route.ts` (S1b — GET-Endpoint nutzt `projectAutoBlocksToSlides` weiterhin, transparent)
- `src/app/api/dashboard/agenda/[id]/instagram-slide/[slideIdx]/route.tsx` (S1b — nutzt `splitAgendaIntoSlides` weiterhin, transparent)
- `src/app/dashboard/components/LayoutEditor.tsx` (S2a — bit-stable)
- `src/app/dashboard/components/InstagramExportModal.tsx` (S2b — bit-stable)
- `src/app/api/dashboard/agenda/[id]/instagram-slide/[slideIdx]/slide-template.tsx` (Satori template liest `slide.blocks` als generisches Array — strukturell SlideBlock-kompatibel)

### Behavior change: `flattenContent` → `flattenContentWithIds` im Renderer (Sonnet R0 [Critical #1])

`flattenContentWithIds` (line 633) **filtert blocks ohne `block.id`** (`if (typeof block.id !== "string" || block.id.length === 0) continue;`). Der Editor-Pfad (S1b GET-Endpoint) nutzt das schon — wenn prod-content ID-lose blocks hätte, würde der Editor sie schon nicht zeigen. Risiko ist daher **bounded zur prod-Reality vom S1b-Release** (2026-04 erste Hälfte).

**Defensive Sanity-Check (Implementation step 4a):** im neuen `splitAgendaIntoSlides` early-return mit `console.warn`-log wenn `flattenContent(...)` und `flattenContentWithIds(...)` unterschiedlich viele Blocks zurückgeben. Wird beim Staging-Soak (DK-8 + soak ≥24h) sichtbar in Logs falls ein Item ID-lose blocks hat. Kein hard-fail (würde Export crashen) — nur Telemetrie.

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
  // prev.length === 0 guard: defensive only — unreachable via packAutoSlides
  // (which filters empty groups via `groups.filter(g => g.length > 0)`).
  // Sonnet R8 [LOW #5] documentation. last.length === 0 IS reachable when
  // grid-alone-guard pushes [] to the slides (siehe Implementation step 5).
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

**`splitAgendaIntoSlides` (Renderer)** — `firstSlideBudget` is `slide2BodyBudget` if grid else `SLIDE1_BUDGET`:
```ts
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
// `let` (nicht const) weil compactLastSlide bei no-merge-paths die input-
// reference zurückgibt — und Implementation step 5 schiebt dann u.U. ein
// leeres Array via grid-alone-guard (Sonnet R3 [Medium #2] aliasing fix).
let compactedGroups = compactLastSlide(packedGroups, (idx) =>
  idx === 0 ? firstSlideBudget : SLIDE_BUDGET,
);
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
  ];

  // **WICHTIG (Sonnet R5 [HIGH #1]):** DK-6 deckt NICHT den Edge-Case
  // `hasGrid + lead + empty body` ab. In diesem Fall emittiert
  // `splitAgendaIntoSlides` eine lead-only text-slide via grid-alone-guard
  // (siehe Implementation step 5), während `projectAutoBlocksToSlides`
  // mit `exportBlocks.length === 0` early-returned und `[]` zurückgibt.
  // Resultat: rendererIds=[[]], editorIds=[] → der equality-check würde
  // failen. Diese Asymmetrie ist intentional (Editor hat keine
  // text-slides ohne Body-Blöcke darzustellen — der Editor zeigt nichts
  // anpassbares wenn body leer ist), aber DK-6's "single source of
  // truth" claim gilt nur für items mit body-blocks. Fixtures-Auswahl
  // unten beachtet das: alle 6 fixtures haben body-content. Wenn
  // ein future-fixture den edge-case trifft, würde die loop-condition
  // `if (exportBlocks.length === 0) continue;` dafür sorgen.

  for (const { item, label } of fixtures) {
    for (const locale of ["de", "fr"] as const) {
      for (const imageCount of [0, 1, 3]) {
        if (isLocaleEmpty(item, locale)) continue;
        // Skip empty-body edge case (siehe Block-Kommentar oben).
        const probeExportBlocks = flattenContentWithIds(item.content_i18n?.[locale] ?? null);
        if (probeExportBlocks.length === 0) continue;
        it(`${label} (${locale}, imageCount=${imageCount}) — editor + renderer agree`, () => {
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
   `splitOversizedBlock` selbst braucht keinen cast — es retourniert `T[]` aus `splitBlockToBudget`'s typisierten outputs.
   Run `pnpm test` + `tsc` zwischen-check — sollte zero failures geben (no behavior change, nur type-parameter + casts).
3. Extract `packAutoSlides<T>` + `compactLastSlide<T>` als pure functions, exportiert
4. Refactor `projectAutoBlocksToSlides` → wrapper around `packAutoSlides<ExportBlock>` + `compactLastSlide<ExportBlock>` mit der konkreten budget-closure (siehe §Concrete invocations)
5. Refactor `splitAgendaIntoSlides`:
   - **EXPLICIT (Sonnet R0 [Critical #3])**: Lines 424-426 ersetzen — `flattenContent(...).flatMap((block) => splitOversizedBlock(block, SLIDE_BUDGET))` → `flattenContentWithIds(item.content_i18n?.[locale] ?? null)`. KEIN pre-split.
   - **Defensive sanity-check (5a, Sonnet R2 [Medium #4] full code)** vor pack-call:
     ```ts
     const allBlocks = flattenContent(item.content_i18n?.[locale] ?? null);
     const exportBlocks = flattenContentWithIds(item.content_i18n?.[locale] ?? null);
     if (allBlocks.length !== exportBlocks.length) {
       console.warn("[s2c] dropped blocks without id", {
         itemId: item.id,
         locale,
         dropped: allBlocks.length - exportBlocks.length,
       });
     }
     ```
     Pure Telemetrie — kein hard-fail, exportBlocks fließt weiter wie geplant. Staging-soak (≥24h) checkt Logs nach `[s2c]`-Treffern.
   - Drop greedy loop (lines 449-501) + rebalance call (line 506)
   - Replace mit `packAutoSlides<ExportBlock>(exportBlocks, { firstSlideBudget, normalBudget: SLIDE_BUDGET })`
   - Keep last-slide-compaction (call `compactLastSlide<ExportBlock>` mit budget-closure, siehe §Concrete invocations)
   - **PRESERVE Grid-alone guard (Sonnet R1 [High #3])** — direkt nach `compactLastSlide`-call, vor assembly. Nutzt `let compactedGroups` damit reassignment sauber ist (Sonnet R3 [Medium #2] aliasing fix):
     ```ts
     // Lead-only edge case: hasGrid + lead aber zero body → mind. eine
     // text-slide für das lead emittieren (sonst wäre der lead nirgends sichtbar).
     if (compactedGroups.length === 0 && hasGrid && lead) {
       compactedGroups = [...compactedGroups, []];
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
15. **Check staging logs für `[s2c] dropped blocks without id` warnings** — wenn ≥1 Item betroffen, genauer untersuchen vor prod-merge
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
