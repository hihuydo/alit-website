# Sprint S2a — Standalone LayoutEditor Component

**Branch:** `feat/instagram-layout-overrides-s2-modal` (continuation)
**Depends on:** S1a ✅, S1b ✅
**Status:** Spec
**Created:** 2026-04-29
**Replaces:** monolithic S2 spec (archived as `tasks/instagram-layout-overrides-s2-monolithic-spec.md.archived`)

---

## Summary

Standalone `LayoutEditor` component die die in S1b geschaffene Persistence-API konsumiert: GET zum laden, PUT zum speichern, DELETE zum reset. Component lebt isoliert in `src/app/dashboard/components/` und ist NICHT in den `InstagramExportModal` integriert — das ist Sprint S2b.

**Why split:** Monolithisches S2 erzeugte 14 Findings nach R2 Sonnet-spec-eval, weil die Parent-Child-Choreografie (LayoutEditor ↔ InstagramExportModal: callback-prop, discardKey, isDirty mirroring, confirm-dialog ownership, guarded-handlers) viele cross-cutting Constraints einführte die in einem Pass schwer konsistent zu halten waren. S2a baut den Editor isoliert + getestet; S2b verdrahtet ihn dann.

**Out of Scope für S2a (kommen in S2b):**
- Tab-Switch im InstagramExportModal (`mode: "preview" | "layout"`)
- Confirm-Dialog für „Ungespeicherte Änderungen verwerfen?"
- Guarded set-handlers für mode/locale/imageCount/onClose
- Component-Interface-Props `onDirtyChange` und `discardKey` (vorbereitet aber unbenutzt)
- locale="both"-Handling
- `open=false`-Cleanup

**Out of Scope generell (Sprint S3+ falls überhaupt):**
- Drag-&-Drop reorder
- Per-Block PNG-Live-Preview-Cards
- Override-Audit-Log-Viewer
- Bulk „alle zurücksetzen"
- DE↔FR Override-Vererbung
- Custom-Block-Splitting (User splittet Absatz)

**No new API endpoints.** Alle Routes sind in S1b live.
**No DB-Changes.**

---

## Sprint Contract (Done-Kriterien)

1. **DK-1**: Pure helpers in `src/lib/layout-editor-state.ts` mit Funktionen `moveBlockToPrevSlide`, `moveBlockToNextSlide`, `splitSlideHere`, `canMovePrev`, `canMoveNext`, `canSplit`, `validateSlideCount`. Empty slides werden nach jeder Move-Operation gefiltert (helper-internal). Tests in `layout-editor-state.test.ts` ≥6 Cases.
2. **DK-2**: `EditorSlide` type in `src/lib/layout-editor-types.ts` (eigenes file für cross-import zwischen `src/lib/` und `src/app/dashboard/components/`).
3. **DK-3**: `LayoutEditor.tsx` Komponente in `src/app/dashboard/components/`. Props: `itemId: number`, `locale: "de" | "fr"`, `imageCount: number`. Optional `onDirtyChange?: (dirty: boolean) => void` + `discardKey?: number` (vorbereitet, in S2a kein Caller, in S2b genutzt).
4. **DK-4**: GET via `dashboardFetch` on mount + auf `(itemId, locale, imageCount, refetchKey)`-change. State (`serverState`, `editedSlides`, `errorBanner`) wird vor jedem fetch cleared.
5. **DK-5**: Block-Card-Liste pro Slide mit drei Buttons: `← Vorherige Slide`, `Nächste Slide →`, `Neue Slide ab hier`. Buttons disabled wenn entsprechender `can*`-Helper false zurückgibt.
6. **DK-6**: Dirty-detect via `isDirty = stableStringify(editedSlides) !== initialSnapshot`. `useMemo` für beide. Wenn `onDirtyChange` prop gesetzt: `useEffect` broadcasted Änderungen.
7. **DK-7**: `discardKey`-Effect: wenn Prop sich ändert (außer initial 0), `editedSlides ← serverState.initialSlides` (lokal verwerfen ohne refetch). Caller (S2b) signalisiert damit Cancel-Dialog-Confirm.
8. **DK-8**: Save-Flow via PUT mit Error-Handling für 200 (refetchKey++), 409 (`content_changed`), 412 (`layout_modified`), 400 (`too_many_slides_for_grid`), 422 (`incomplete_layout`/`unknown_block`/`duplicate_block`). Pre-PUT client-side `validateSlideCount` mit Banner-Output (kein API-Call wenn validation failed). **R6 [CONTRACT-FIX]:** Save zusätzlich enabled wenn `serverState.warnings.includes("too_many_blocks_for_layout")` auch ohne user-edit (`isDirty=false`) — der Admin muss den server-side cap-merged state persistieren können, sonst bleibt der Override bei jedem GET erneut „cap-merged but never saved".
9. **DK-9**: Reset-Flow via DELETE mit Error-Handling für 204 (refetchKey++) und non-204 (`delete_failed` banner).
10. **DK-10**: Stale-Banner mit Reset-Action wenn GET `mode: "stale"`. Save disabled bis Reset.
11. **DK-11**: Orphan-Banner wenn GET `warnings: ["orphan_image_count"]`. Save IMMER disabled. Reset verfügbar nur wenn `serverState.layoutVersion !== null`.
12. **DK-12**: Tests ~20 (LayoutEditor.test.tsx ~14 + layout-editor-state.test.ts ~6). Per-Test `vi.doMock` + dynamic-import (S1a/S1b convention).

**Kein manueller Smoke in S2a** — Komponente ist nicht erreichbar via UI. Smoke kommt in S2b mit der Integration.

---

## File Changes

### NEU

- `src/lib/layout-editor-types.ts` (~30 Zeilen) — `EditorSlide` type export, shared zwischen lib/ und components/
- `src/lib/layout-editor-state.ts` (~120 Zeilen) — pure helpers
- `src/lib/layout-editor-state.test.ts` (~150 Zeilen) — pure helper tests
- `src/app/dashboard/components/LayoutEditor.tsx` (~280 Zeilen) — main component. **MUSS** `"use client"` als first line haben (R4 [FAIL #2] — Next.js 16 App Router default ist Server Component, hooks würden runtime-failen).
- `src/app/dashboard/components/LayoutEditor.test.tsx` (~350 Zeilen) — component tests

### MODIFY

- `src/app/dashboard/i18n.tsx` — (a) prepend `import type { ErrorBannerKind } from "@/lib/layout-editor-types";` at top (R4 [MEDIUM #6] — required for the `satisfies` annotation); (b) extend the existing `dashboardStrings` export with a new `layoutEditor: { ... }` namespace (24 keys, siehe §i18n Strings — alle die NICHT modal-/tab-/confirm-spezifisch sind). R4 [FAIL #3]: Pfad ist exakt `i18n.tsx`, NICHT `i18n/index.ts`.

### NICHT modifiziert

- `src/app/dashboard/components/InstagramExportModal.tsx` (S2b)
- `src/app/api/dashboard/agenda/[id]/instagram-layout/route.ts` (S1b done)
- `src/lib/instagram-overrides.ts`, `src/lib/instagram-post.ts` (S1a/S1b done)

---

## Types (`src/lib/layout-editor-types.ts`)

```ts
/** Slide-shape used by LayoutEditor's internal state and by the
 *  pure-helper functions in layout-editor-state.ts.
 *
 *  Mirrors the response-shape contract from S1b's GET endpoint:
 *  `body.slides[].blocks[]` has `{id, text, isHeading}`.
 *  See src/app/api/dashboard/agenda/[id]/instagram-layout/route.ts. */
export type EditorSlide = {
  blocks: { id: string; text: string; isHeading: boolean }[];
};

/** Banner-kind union — single source of truth (R3 [FAIL #1]).
 *
 *  Used by:
 *    - LayoutEditor `errorBanner` state shape
 *    - `mapPutErrorToBannerKind` return type
 *    - `dashboardStrings.layoutEditor.errors: Record<NonNullable<ErrorBannerKind>, string>`
 *
 *  `null` is encoded in the LayoutEditor state as `errorBanner: { kind, ... } | null`,
 *  not as a union member here — the type intentionally lists only positive kinds. */
export type ErrorBannerKind =
  | "content_changed"
  | "layout_modified"
  | "too_many_slides"
  | "too_many_slides_for_grid"
  | "empty_layout"
  | "incomplete_layout"
  | "unknown_block"
  | "duplicate_block"
  | "generic"
  | "network"
  | "delete_failed";
```

Eigenes File damit `src/lib/layout-editor-state.ts` (pure, no React) und `src/app/dashboard/components/LayoutEditor.tsx` (React) beide ohne Cross-Tree-Dependency importieren können. Architektur-Prinzip: `src/lib/` darf nicht aus `src/app/` importieren.

---

## Pure Helpers (`src/lib/layout-editor-state.ts`)

```ts
import type { EditorSlide } from "./layout-editor-types";
import { SLIDE_HARD_CAP } from "./instagram-post";

/** Move slides[slideIdx].blocks[blockIdx] to END of slides[slideIdx-1].
 *  No-op if slideIdx === 0.
 *  POST: filtert empty slides (renderbare empty-cards würden verwirren). */
export function moveBlockToPrevSlide(
  slides: EditorSlide[],
  slideIdx: number,
  blockIdx: number,
): EditorSlide[] {
  if (slideIdx === 0) return slides;
  const block = slides[slideIdx]?.blocks[blockIdx];
  if (!block) return slides;
  return slides
    .map((s, i) => {
      if (i === slideIdx - 1) return { blocks: [...s.blocks, block] };
      if (i === slideIdx) return { blocks: s.blocks.filter((_, b) => b !== blockIdx) };
      return s;
    })
    .filter((s) => s.blocks.length > 0);
}

/** Move slides[slideIdx].blocks[blockIdx] to START of slides[slideIdx+1].
 *  No-op if slideIdx === slides.length - 1.
 *  POST: filtert empty slides. */
export function moveBlockToNextSlide(
  slides: EditorSlide[],
  slideIdx: number,
  blockIdx: number,
): EditorSlide[] {
  if (slideIdx >= slides.length - 1) return slides;
  const block = slides[slideIdx]?.blocks[blockIdx];
  if (!block) return slides;
  return slides
    .map((s, i) => {
      if (i === slideIdx + 1) return { blocks: [block, ...s.blocks] };
      if (i === slideIdx) return { blocks: s.blocks.filter((_, b) => b !== blockIdx) };
      return s;
    })
    .filter((s) => s.blocks.length > 0);
}

/** Split slides[slideIdx] at blockIdx: blocks BEFORE stay, blocks AT+AFTER
 *  go into a new slide inserted after current.
 *  No-op if blockIdx === 0 (would leave current slide empty pre-filter,
 *  conceptually the same as a no-op move). */
export function splitSlideHere(
  slides: EditorSlide[],
  slideIdx: number,
  blockIdx: number,
): EditorSlide[] {
  if (blockIdx === 0) return slides;
  const slide = slides[slideIdx];
  if (!slide || blockIdx >= slide.blocks.length) return slides;
  const before = slide.blocks.slice(0, blockIdx);
  const after = slide.blocks.slice(blockIdx);
  return [
    ...slides.slice(0, slideIdx),
    { blocks: before },
    { blocks: after },
    ...slides.slice(slideIdx + 1),
  ];
}

/** Is the move-prev button enabled?
 *  TRUE iff there is a slide BEFORE slideIdx. blockIdx is irrelevant —
 *  any block on a non-first slide can move. (R3 [FAIL #2] regression-
 *  guard: previous spec returned `!(slideIdx===0 && blockIdx===0)`,
 *  which enabled the button on slide 0 / blockIdx>0 even though
 *  moveBlockToPrevSlide is a guaranteed no-op for slideIdx===0 →
 *  broken affordance.) Symmetric to canMoveNext. */
export function canMovePrev(slideIdx: number, blockIdx: number): boolean {
  // blockIdx parameter retained for API symmetry with canSplit but
  // intentionally unused — disable rule below.
  void blockIdx;
  return slideIdx > 0;
}

/** Is the move-next button enabled?
 *  TRUE iff there is a slide AFTER slideIdx. blockIdx is irrelevant —
 *  any block on a non-last slide can move. (R2 [FAIL #2] regression.) */
export function canMoveNext(slides: EditorSlide[], slideIdx: number): boolean {
  return slideIdx < slides.length - 1;
}

/** Is the split-here button enabled? FALSE for blockIdx===0 (would
 *  leave current slide empty). */
export function canSplit(blockIdx: number): boolean {
  return blockIdx > 0;
}

/** Cap-aware validation. Returns ok=true wenn save erlaubt, sonst
 *  ok=false mit konkretem `reason` der dem PUT-API-error-key 1:1
 *  entspricht. Caller setzt errorBanner.kind = reason. */
export type ValidationResult =
  | { ok: true }
  | {
      ok: false;
      reason: "empty_layout" | "too_many_slides" | "too_many_slides_for_grid";
    };

export function validateSlideCount(
  slides: EditorSlide[],
  hasGrid: boolean,
): ValidationResult {
  if (slides.length === 0) return { ok: false, reason: "empty_layout" };
  if (hasGrid && slides.length > SLIDE_HARD_CAP - 1) {
    return { ok: false, reason: "too_many_slides_for_grid" };
  }
  if (!hasGrid && slides.length > SLIDE_HARD_CAP) {
    return { ok: false, reason: "too_many_slides" };
  }
  return { ok: true };
}
```

**Note:** `empty_slide` ist NICHT in `ValidationResult.reason` — die Move-Helpers filtern bereits empty slides intern, also ist es unreachable für S2a. (R2 [MEDIUM-2] fix — entfernt aus Union/i18n um dead code zu vermeiden.)

---

## LayoutEditor Component

### File Header

```tsx
"use client";   // R4 [FAIL #2]: REQUIRED — Next.js 16 App Router default
                // ist Server Component; useState/useEffect ohne use-client
                // würden runtime-failen.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { stableStringify } from "@/lib/stable-stringify";
import { dashboardFetch } from "@/app/dashboard/lib/dashboardFetch";
import { dashboardStrings } from "@/app/dashboard/i18n";
import {
  type EditorSlide,
  type ErrorBannerKind,
} from "@/lib/layout-editor-types";
import {
  canMoveNext,
  canMovePrev,
  canSplit,
  moveBlockToNextSlide,
  moveBlockToPrevSlide,
  splitSlideHere,
  validateSlideCount,
} from "@/lib/layout-editor-state";
```

### Props Interface

```ts
interface LayoutEditorProps {
  itemId: number;
  locale: "de" | "fr";
  imageCount: number;
  /** Optional in S2a (no caller). In S2b: parent passes useCallback-
   *  stabilized handler (siehe S2b spec). */
  onDirtyChange?: (isDirty: boolean) => void;
  /** Optional in S2a. In S2b: parent increments to signal "discard
   *  local edits" without triggering a refetch (after Confirm.Discard). */
  discardKey?: number;
}
```

### State

```ts
type EditorMode = "loading" | "ready" | "saving" | "deleting" | "error";

const [serverState, setServerState] = useState<{
  mode: "auto" | "manual" | "stale";
  contentHash: string | null;       // null only for orphan
  layoutVersion: string | null;     // null when no override stored
  imageCount: number;
  availableImages: number;
  warnings: string[];
  initialSlides: EditorSlide[];
} | null>(null);

const [editedSlides, setEditedSlides] = useState<EditorSlide[]>([]);
const [refetchKey, setRefetchKey] = useState(0);
const [editorMode, setEditorMode] = useState<EditorMode>("loading");

// Banner-union — single source of truth in layout-editor-types.ts.
// Alle keys MÜSSEN in dashboardStrings.layoutEditor.errors[k] existieren
// (TS-strict 1:1-mapping enforced via Record-type unten).
// `ErrorBannerKind` ist bereits im File-Header importiert (R5 [MEDIUM #6]
// — keine zweite import-line hier, sonst no-duplicate-imports lint-error).
const [errorBanner, setErrorBanner] = useState<{
  kind: ErrorBannerKind;
  message: string;
} | null>(null);
```

### Derived (useMemo)

```ts
import { stableStringify } from "@/lib/stable-stringify";

const initialSnapshot = useMemo(
  () => stableStringify(serverState?.initialSlides ?? []),
  [serverState],
);

// Codex R1 [P2]: do NOT gate isDirty on editorMode. Otherwise during
// editorMode==="saving" isDirty briefly returns false → onDirtyChange
// broadcasts (false) while the PUT is still in flight, and a parent
// (S2b) would treat the modal as clean and allow close/tab-switch
// mid-save. editorMode is for control disable-state only; the dirty
// signal must remain a pure snapshot-diff.
const isDirty = useMemo(
  () => stableStringify(editedSlides) !== initialSnapshot,
  [editedSlides, initialSnapshot],
);

// Mirrors the renderer logic from instagram-post.ts:resolveImages —
// grid renders only if BOTH conditions hold.
const hasGrid = useMemo(
  () =>
    (serverState?.imageCount ?? 0) >= 1 &&
    (serverState?.availableImages ?? 0) >= 1,
  [serverState],
);

// **R6 [CONTRACT-FIX]** + **Codex R1 [P2]** — `too_many_blocks_for_layout`
// warning macht einen "save merged state"-Fall nötig: server hat einen
// pre-S2a oder pre-grid-shrink Override bereits cap-merged; nach GET ist
// `editedSlides === initialSlides` → `isDirty=false`. Ohne diesen derived
// bool kann der Admin den merged state nicht ohne fake-edit persistieren,
// obwohl die i18n copy "Speichern setzt den zusammengeführten Stand"
// das exakt verspricht.
//
// Codex R1 [P2]: gate auf `mode === "manual"`. Der Server emittiert die
// gleiche Warning ALSO im auto/stale-Branch (route.ts:184-200), aber
// dort ist der Tail per `slice()` einfach gedroppt (NICHT gemerged) →
// ein "save" würde mit fehlenden Block-IDs PUTen und vom Server mit
// `incomplete_layout` 422-en. Nur die manual-Branch (route.ts:160-175)
// macht echtes tail-merging und ist saveable ohne edit.
const canSaveMergedLayout =
  serverState?.mode === "manual" &&
  serverState.warnings.includes("too_many_blocks_for_layout");

// **Codex R2 [P2]** — die R1-fix schließt nur den no-edit-Pfad. Sobald der
// User eine sichtbare Slide editiert (`isDirty=true`), wäre Save wieder
// freigegeben — aber das PUT-body würde immer noch die geslicen tail-
// blocks vermissen → server 422 incomplete_layout. Daher zusätzlich:
// Save IMMER blocken in non-manual + over-cap. User muss content im
// journal-editor kürzen (out of S2a scope).
//
// Banner copy ist mode-aware: manual = "merge persistieren"-text;
// auto = "renderer kürzt; bitte content kürzen"-text.
const isAutoOverCap =
  serverState?.mode !== "manual" &&
  (serverState?.warnings.includes("too_many_blocks_for_layout") ?? false);

const saveDisabled =
  (!isDirty && !canSaveMergedLayout) ||
  isAutoOverCap ||  // Codex R2 [P2]: block save in non-manual over-cap
  editorMode !== "ready" ||
  serverState?.mode === "stale" ||
  serverState?.warnings.includes("orphan_image_count") ||
  errorBanner?.kind === "content_changed" ||
  errorBanner?.kind === "incomplete_layout" ||
  errorBanner?.kind === "unknown_block" ||
  errorBanner?.kind === "duplicate_block";
// Note: validation-failure banners (too_many_slides/_for_grid/empty_layout)
// werden NICHT in saveDisabled aufgenommen — sie sind selbst-clearing
// via "adjust state during render" (siehe unten).
// 412/network bleiben sticky aber save soll re-tryable sein.
// `canSaveMergedLayout`-Pfad ist orthogonal zum `orphan`-suppress: orphan
// blockt save weil DELETE-zu-auto die richtige Aktion ist; merged-warning
// erlaubt save weil "persist the merge" die richtige Aktion ist.

const resetDisabled =
  !serverState ||
  serverState.layoutVersion === null ||
  editorMode === "deleting" ||
  editorMode === "saving";   // R3 [FAIL #2]: prevent concurrent PUT+DELETE race
```

### Hook-Ordering (R3 [MEDIUM #6])

**Wichtig:** ALLE `useState`/`useMemo`/`useEffect`/`useRef`/`useCallback`
declarations (inkl. `snapshotForBannerClear`-state und der gesamte
adjust-state-during-render-Block unten) MÜSSEN VOR dem ersten
conditional `return` im Component-Body stehen. Sonst React-Error #310
(„Rendered more hooks than during the previous render"). Das gilt auch
für die JSX-Skeleton-Section unten — die early-returns für
`editorMode === "loading"` und `editorMode === "error"` kommen NACH
allen Hook-Declarations.

### Adjust state during render — errorBanner-clear-on-edit

**R2 [HIGH-1]:** kein `useEffect`. Pattern aus `patterns/react.md`:

```ts
const [snapshotForBannerClear, setSnapshotForBannerClear] =
  useState<string | null>(null);
const currentSnapshot = stableStringify(editedSlides);
if (
  currentSnapshot !== snapshotForBannerClear &&
  errorBanner &&
  (errorBanner.kind === "too_many_slides" ||
    errorBanner.kind === "too_many_slides_for_grid" ||
    errorBanner.kind === "empty_layout")
) {
  setSnapshotForBannerClear(currentSnapshot);
  setErrorBanner(null);
}
// Update snapshot ohne Banner-Clear bei initial render (banner null) oder
// non-validation banners (sticky):
if (currentSnapshot !== snapshotForBannerClear && !errorBanner) {
  setSnapshotForBannerClear(currentSnapshot);
}
```

Nur die drei validation-Banner werden auto-cleared, weil das User-Editing diese Validations invalidiert. 409/412/network/generic/etc. bleiben sticky bis User explizit reset oder retry.

### Effects

```ts
// Fetch on (itemId, locale, imageCount, refetchKey)-change
useEffect(() => {
  let cancelled = false;
  setEditorMode("loading");
  setServerState(null);
  setEditedSlides([]);
  setErrorBanner(null);

  (async () => {
    try {
      const res = await dashboardFetch(
        `/api/dashboard/agenda/${itemId}/instagram-layout/?locale=${locale}&images=${imageCount}`,
        { method: "GET" },
      );
      if (cancelled) return;
      if (!res.ok) {
        setEditorMode("error");
        setErrorBanner({ kind: "generic", message: dashboardStrings.layoutEditor.errors.generic });
        return;
      }
      const body = await res.json();
      // R4 [FAIL #1]: S1b GET response includes `index: number` per slide
      // (siehe route.ts:141-144). Pure helpers produzieren slides OHNE
      // index → stableStringify nach round-trip != initialSnapshot →
      // isDirty bleibt fälschlich true. Strip explizit zu EditorSlide-
      // shape (nur `blocks`).
      const stripped: EditorSlide[] = (body.slides ?? []).map(
        (s: { blocks: EditorSlide["blocks"] }) => ({ blocks: s.blocks }),
      );
      setServerState({
        mode: body.mode,
        contentHash: body.contentHash,
        layoutVersion: body.layoutVersion,
        imageCount: body.imageCount,
        availableImages: body.availableImages,
        warnings: body.warnings ?? [],
        initialSlides: stripped,
      });
      setEditedSlides(stripped);
      setEditorMode("ready");
    } catch {
      if (cancelled) return;
      setEditorMode("error");
      setErrorBanner({ kind: "network", message: dashboardStrings.layoutEditor.errors.network });
    }
  })();

  return () => { cancelled = true; };
}, [itemId, locale, imageCount, refetchKey]);

// Broadcast isDirty upward (only fires when bool actually changes due to
// useMemo identity-stability of isDirty as primitive)
useEffect(() => {
  if (!onDirtyChange) return;
  onDirtyChange(isDirty);
}, [isDirty, onDirtyChange]);
// Caller (S2b) MUST wrap onDirtyChange in useCallback with stable deps,
// or this effect re-fires on every parent render. S2b spec enforces.

// discardKey-effect: revert local edits to server-truth (no refetch).
// `serverState` intentionally NOT in deps — effect must only fire on
// discardKey-change, not on every refetch (would re-revert mid-edit).
// R3 [FAIL #4]: pre-push lint gate (eslint-config-next, react-hooks/
// exhaustive-deps as error) blocks push without explicit disable.
const isFirstDiscardKey = useRef(true);
useEffect(() => {
  if (isFirstDiscardKey.current) {
    isFirstDiscardKey.current = false;
    return;
  }
  if (!serverState) return;
  setEditedSlides(serverState.initialSlides);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional:
  // effect must only fire on discardKey-change; serverState read inside
  // is the snapshot at fire-time, not a tracked dep
}, [discardKey]);
```

### Handlers

```ts
const handleSave = useCallback(async () => {
  // R6 [CONTRACT-FIX] + Codex R1 [P2]: allow save without dirty in the
  // manual cap-merged case ONLY (auto-mode emits the same warning but
  // slice()s the tail → PUT would fail with incomplete_layout). Inline
  // recompute keeps useCallback deps tight.
  if (!serverState) return;
  const canSaveMergedLayout =
    serverState.mode === "manual" &&
    serverState.warnings.includes("too_many_blocks_for_layout");
  if (!isDirty && !canSaveMergedLayout) return;
  const validation = validateSlideCount(editedSlides, hasGrid);
  if (!validation.ok) {
    setErrorBanner({
      kind: validation.reason,
      message: dashboardStrings.layoutEditor.errors[validation.reason],
    });
    return;
  }

  setEditorMode("saving");
  setErrorBanner(null);
  try {
    const res = await dashboardFetch(
      `/api/dashboard/agenda/${itemId}/instagram-layout/`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale,
          imageCount,
          contentHash: serverState.contentHash,
          layoutVersion: serverState.layoutVersion,
          slides: editedSlides.map((s) => ({ blocks: s.blocks.map((b) => b.id) })),
        }),
      },
    );

    if (res.status === 200) {
      setRefetchKey((k) => k + 1);
      return;
    }
    const body = await res.json().catch(() => ({}));
    const errorKey = mapPutErrorToBannerKind(res.status, body?.error);
    setErrorBanner({
      kind: errorKey,
      message: dashboardStrings.layoutEditor.errors[errorKey],
    });
    setEditorMode("ready");
  } catch {
    setErrorBanner({ kind: "network", message: dashboardStrings.layoutEditor.errors.network });
    setEditorMode("ready");
  }
}, [serverState, isDirty, editedSlides, hasGrid, itemId, locale, imageCount]);

// Pure mapper: HTTP status + body.error → banner kind.
// **MODULE-LEVEL** (R5 [MEDIUM #4]) — declared OUTSIDE the LayoutEditor
// function body, between the imports/const declarations and the
// component-function. Pure function → keine deps auf component-state →
// re-instantiation per render wäre unnötiger overhead und Codex flagged
// das zuverlässig. Indirekt exerciert durch C-7..C-10 + C-12 (R3
// [MEDIUM #7]: keine separaten unit-tests nötig).
// `ErrorBannerKind` aus layout-editor-types.ts importiert (siehe File
// Header — KEINE separate import-line in dieser code-section).
function mapPutErrorToBannerKind(
  status: number,
  apiError: string | undefined,
): ErrorBannerKind {
  if (status === 409) return "content_changed";
  if (status === 412) return "layout_modified";
  if (status === 400 && apiError === "too_many_slides_for_grid") return "too_many_slides_for_grid";
  if (status === 400 && apiError === "too_many_slides") return "too_many_slides";
  // Defence-in-depth (R4 [FAIL #3]): empty_layout wird normalerweise
  // bereits client-seitig in validateSlideCount gefangen (kein PUT
  // gesendet). Diese 400-branch ist Fallback wenn future-code den
  // client-side guard umgeht (z.B. direct-call ohne Button). NICHT
  // als „dead code" entfernen — würde die zwei defence-Layer brechen.
  if (status === 400 && apiError === "empty_layout") return "empty_layout";
  if (status === 422 && apiError === "incomplete_layout") return "incomplete_layout";
  if (status === 422 && apiError === "unknown_block") return "unknown_block";
  if (status === 422 && apiError === "duplicate_block") return "duplicate_block";
  return "generic";
}

const handleReset = useCallback(async () => {
  if (!serverState) return;
  setEditorMode("deleting");
  setErrorBanner(null);
  try {
    const res = await dashboardFetch(
      `/api/dashboard/agenda/${itemId}/instagram-layout/?locale=${locale}&images=${imageCount}`,
      { method: "DELETE" },
    );
    if (res.status === 204) {
      setRefetchKey((k) => k + 1);
      return;
    }
    setErrorBanner({ kind: "delete_failed", message: dashboardStrings.layoutEditor.errors.delete_failed });
    setEditorMode("ready");
  } catch {
    setErrorBanner({ kind: "network", message: dashboardStrings.layoutEditor.errors.network });
    setEditorMode("ready");
  }
}, [serverState, itemId, locale, imageCount]);

const handleMovePrev = (slideIdx: number, blockIdx: number) =>
  setEditedSlides((s) => moveBlockToPrevSlide(s, slideIdx, blockIdx));
const handleMoveNext = (slideIdx: number, blockIdx: number) =>
  setEditedSlides((s) => moveBlockToNextSlide(s, slideIdx, blockIdx));
const handleSplit = (slideIdx: number, blockIdx: number) =>
  setEditedSlides((s) => splitSlideHere(s, slideIdx, blockIdx));
```

### UI States

| editorMode | Render |
|---|---|
| `"loading"` | `<p>{dashboardStrings.layoutEditor.loading}</p>` |
| `"error"` | error banner + retry button (clicking → setRefetchKey++, no other state change) |
| `"ready"` | Banners (stale/orphan/error) + slide-cards + save/reset buttons |
| `"saving"` | identisch zu `"ready"` aber alle interactive controls disabled (saveDisabled/resetDisabled-conditions checken `editorMode !== "ready"` schon) — ein dezenter spinner-text neben Save-Button ist optional, NICHT spec-required |
| `"deleting"` | analog zu saving (resetDisabled blockt) |

### JSX-Skeleton

```tsx
if (editorMode === "loading") {
  return <p className="text-sm text-gray-500">{dashboardStrings.layoutEditor.loading}</p>;
}

if (editorMode === "error" && !serverState) {
  return (
    <div role="alert" className="bg-red-50 border border-red-300 p-4 rounded">
      <p className="text-sm mb-2">{errorBanner?.message ?? dashboardStrings.layoutEditor.errors.generic}</p>
      <button type="button" onClick={() => setRefetchKey((k) => k + 1)} className="px-3 py-1.5 text-sm border border-red-700 rounded">
        {dashboardStrings.layoutEditor.retry}
      </button>
    </div>
  );
}

// Orphan check first because isStale must suppress when orphan is true
// (R3 [FAIL #1]: S1b's orphan path returns mode:"stale" + warnings:
// ["orphan_image_count"] simultaneously — without this guard both
// banners would render and contradict each other).
const isOrphan = serverState?.warnings.includes("orphan_image_count") ?? false;
const isStale = serverState?.mode === "stale" && !isOrphan;

return (
  <div className="space-y-4">
    {/* Stale-Banner */}
    {isStale && (
      <div role="alert" className="bg-yellow-50 border border-yellow-300 p-4 rounded">
        <h4 className="font-semibold mb-1">{dashboardStrings.layoutEditor.staleTitle}</h4>
        <p className="text-sm mb-2">{dashboardStrings.layoutEditor.staleBody}</p>
        <button type="button" onClick={handleReset} disabled={resetDisabled} className="px-3 py-1.5 text-sm border border-yellow-700 rounded">
          {dashboardStrings.layoutEditor.resetToAuto}
        </button>
      </div>
    )}

    {/* Orphan-Banner */}
    {isOrphan && (
      <div role="alert" className="bg-blue-50 border border-blue-300 p-4 rounded">
        <h4 className="font-semibold mb-1">{dashboardStrings.layoutEditor.orphanTitle}</h4>
        <p className="text-sm mb-2">
          {dashboardStrings.layoutEditor.orphanBody.replace("{n}", String(serverState?.availableImages ?? 0))}
        </p>
        {serverState?.layoutVersion !== null && (
          <button type="button" onClick={handleReset} disabled={resetDisabled} className="px-3 py-1.5 text-sm border border-blue-700 rounded">
            {dashboardStrings.layoutEditor.resetOrphan}
          </button>
        )}
      </div>
    )}

    {/* "too_many_blocks_for_layout" warning (R3 [MEDIUM #5]): server-side
        cap-merge happened (z.B. pre-S2a override hatte 12 slides für grid-
        backed item, GET cap-merged auf 9). Render explizit damit Admin
        weiß warum die Slide-Anzahl plötzlich kleiner ist + welche option
        zum Auflösen besteht. Erscheint UNABHÄNGIG von stale/orphan/error. */}
    {serverState?.warnings.includes("too_many_blocks_for_layout") && (
      <div role="alert" className="bg-amber-50 border border-amber-300 p-4 rounded">
        <h4 className="font-semibold mb-1">{dashboardStrings.layoutEditor.tooManyBlocksTitle}</h4>
        <p className="text-sm">{dashboardStrings.layoutEditor.tooManyBlocksBody}</p>
      </div>
    )}

    {/* Error-Banner — Reset/Network failures MÜSSEN auch in stale/orphan
        mode sichtbar sein (R3 [FAIL #3]: sonst silent failure wenn user
        Reset im stale/orphan-state klickt + DELETE failt). Andere
        validation/CAS-banners werden in stale/orphan suppressed weil sie
        redundant zum jeweiligen banner sind. */}
    {errorBanner && (errorBanner.kind === "delete_failed" || errorBanner.kind === "network") && (
      <div role="alert" className="bg-red-50 border border-red-300 p-4 rounded">
        <p className="text-sm">{errorBanner.message}</p>
      </div>
    )}
    {errorBanner && errorBanner.kind !== "delete_failed" && errorBanner.kind !== "network" && !isStale && !isOrphan && (
      <div role="alert" className="bg-red-50 border border-red-300 p-4 rounded">
        <p className="text-sm">{errorBanner.message}</p>
      </div>
    )}

    {/* Slide-list + buttons */}
    {isOrphan ? (
      <p className="text-sm text-gray-500 italic">{dashboardStrings.layoutEditor.orphanEmptyEditor}</p>
    ) : (
      // R4 [MEDIUM #7]: index-as-key ist hier INTENTIONAL — EditorSlide
      // hat keinen stable slide-id (nur Block-IDs sind stable). Stable
      // slide-keys würden eine slideId-property erfordern, die wir
      // weder vom Server bekommen noch lokal generieren wollen (würde
      // serialization für stableStringify-snapshot ändern). Trade-off:
      // Focus-state auf Move-Buttons resetted nach split (acceptable
      // weil User danach sowieso die nächste action plant) — KEIN
      // data-correctness-bug. Spec acknowledged.
      editedSlides.map((slide, slideIdx) => (
        <div key={slideIdx} className="border rounded p-3">
          <h5 className="text-xs font-semibold text-gray-500 mb-2">
            {dashboardStrings.layoutEditor.slideLabel.replace("{n}", String(slideIdx + 1))}
          </h5>
          {slide.blocks.map((block, blockIdx) => (
            <div key={block.id} className="border-t pt-2 first:border-t-0 first:pt-0 mt-2 first:mt-0">
              <p className={`text-sm ${block.isHeading ? "font-semibold" : ""}`}>{block.text}</p>
              <div className="flex gap-1 mt-1">
                <button type="button" onClick={() => handleMovePrev(slideIdx, blockIdx)} disabled={!canMovePrev(slideIdx, blockIdx) || editorMode !== "ready"} className="px-2 py-0.5 text-xs border rounded">
                  {dashboardStrings.layoutEditor.movePrev}
                </button>
                <button type="button" onClick={() => handleMoveNext(slideIdx, blockIdx)} disabled={!canMoveNext(editedSlides, slideIdx) || editorMode !== "ready"} className="px-2 py-0.5 text-xs border rounded">
                  {dashboardStrings.layoutEditor.moveNext}
                </button>
                <button type="button" onClick={() => handleSplit(slideIdx, blockIdx)} disabled={!canSplit(blockIdx) || editorMode !== "ready"} className="px-2 py-0.5 text-xs border rounded">
                  {dashboardStrings.layoutEditor.splitHere}
                </button>
              </div>
            </div>
          ))}
        </div>
      ))
    )}

    {/* Save / Reset bar */}
    {!isOrphan && serverState && (
      <div className="flex gap-2 border-t pt-3">
        <button type="button" onClick={handleSave} disabled={saveDisabled} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded disabled:bg-gray-300">
          {dashboardStrings.layoutEditor.save}
        </button>
        {serverState.layoutVersion !== null && (
          <button type="button" onClick={handleReset} disabled={resetDisabled} className="px-4 py-2 text-sm font-medium border rounded">
            {dashboardStrings.layoutEditor.resetToAuto}
          </button>
        )}
      </div>
    )}
  </div>
);
```

---

## i18n Strings

Unter `dashboardStrings.layoutEditor.*`. Alle keys inline gelistet damit kein Developer improvisieren muss. Confirm-Dialog-Strings + Tab-Labels kommen erst in S2b.

```ts
layoutEditor: {
  // Buttons
  movePrev: "← Vorherige Slide",
  moveNext: "Nächste Slide →",
  splitHere: "Neue Slide ab hier",
  save: "Speichern",
  resetToAuto: "Auf Auto-Layout zurücksetzen",
  resetOrphan: "Verwaisten Override entfernen",
  retry: "Erneut versuchen",

  // Loading state
  loading: "Lädt …",

  // Slide labels
  slideLabel: "Slide {n}",

  // Stale banner
  staleTitle: "Inhalt wurde verändert",
  staleBody:
    "Der Beitragstext wurde nach dem Speichern dieses Layouts geändert. Setze auf Auto-Layout zurück, um eine aktuelle Gruppierung zu bekommen.",

  // Orphan banner
  orphanTitle: "Bild-Anzahl überschreitet verfügbare Bilder",
  orphanBody:
    "Dieser Beitrag hat aktuell {n} Bilder. Reduziere die Bild-Anzahl im Export-Modal oder entferne den verwaisten Override.",
  orphanEmptyEditor:
    "Keine Slides — bitte Bild-Anzahl reduzieren oder verwaisten Override entfernen.",

  // Too-many-blocks warning (R3 [MEDIUM #5]): server merged tail of
  // an over-cap stored override into last visible slide
  tooManyBlocksTitle: "Layout zusammengeführt",
  tooManyBlocksBody:
    "Das gespeicherte Layout enthielt mehr Slides als jetzt darstellbar — die letzten Slides wurden in die letzte sichtbare Slide zusammengeführt. Speichern setzt den zusammengeführten Stand als neuen Override.",

  // Errors — keys MUST 1:1 match errorBanner.kind union.
  // R4 [MEDIUM #6]: `satisfies` keyword zwingt TS-strict 1:1-mapping
  // ohne den literal-Typ zu widening. Wenn jemand einen ErrorBannerKind
  // hinzufügt aber keinen string, gibt es einen TS error genau hier.
  errors: {
    content_changed:
      "Der Beitragsinhalt hat sich geändert. Bitte das Modal schließen und neu öffnen.",
    layout_modified:
      "Das Layout wurde von einem anderen Admin geändert. Bitte zurücksetzen oder Modal neu laden.",
    too_many_slides:
      "Maximal 10 Text-Slides erlaubt. Bitte einige Slides zusammenfügen.",
    too_many_slides_for_grid:
      "Bei aktivem Bild-Grid maximal 9 Text-Slides erlaubt (Slide 1 ist das Bild-Grid).",
    empty_layout: "Mindestens eine Slide muss vorhanden sein.",
    incomplete_layout:
      "Nicht alle Inhalts-Blöcke sind im Layout enthalten. Bitte alle Blöcke einer Slide zuweisen.",
    unknown_block:
      "Layout enthält Block-IDs die nicht zum Beitragsinhalt passen.",
    duplicate_block: "Ein Block ist mehrfach im Layout enthalten.",
    generic: "Speichern fehlgeschlagen. Bitte nochmal versuchen.",
    network: "Netzwerkfehler. Bitte nochmal versuchen.",
    delete_failed: "Zurücksetzen fehlgeschlagen. Bitte nochmal versuchen.",
  } satisfies Record<ErrorBannerKind, string>,
}
```

**Total:** 24 keys (8 button/label + 1 loading + 1 slideLabel + 2 stale + 3 orphan + 2 tooManyBlocks + 11 errors). i18n type `errors: Record<ErrorBannerKind, string>` zwingt 1:1 mapping zur runtime — wenn jemand einen kind hinzufügt aber keinen string, TS error. (`ErrorBannerKind` aus `src/lib/layout-editor-types.ts` — siehe §Types.)

---

## Test-Infrastructure (S1a/S1b convention)

**WICHTIG (R3 [FAIL #5]):** `vi.doMock` is NOT hoisted — for the mock to
intercept `dashboardFetch` inside `LayoutEditor`, the component module
MUST be imported AFTER `vi.doMock` runs. Static `import LayoutEditor
from ...` at file-top would resolve before `beforeEach` and bypass the
mock entirely. Pattern: dynamic import inside async `beforeEach`.

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

// NO static import of LayoutEditor here — would bypass vi.doMock.

describe("LayoutEditor", () => {
  const mockDashboardFetch = vi.fn();

  // Module-scoped binding, populated in beforeEach via dynamic import.
  let LayoutEditor: typeof import("@/app/dashboard/components/LayoutEditor").LayoutEditor;

  beforeEach(async () => {
    vi.resetModules();
    mockDashboardFetch.mockReset();
    vi.doMock("@/app/dashboard/lib/dashboardFetch", () => ({
      dashboardFetch: mockDashboardFetch,
    }));
    // Dynamic import AFTER vi.doMock is registered.
    // LayoutEditor is a NAMED export (R3 [FAIL #1] — matches Modal,
    // RichTextEditor und alle anderen dashboard-components).
    ({ LayoutEditor } = await import("@/app/dashboard/components/LayoutEditor"));
  });

  afterEach(() => {
    vi.resetModules();
  });

  function mockGetResponse(body: object) {
    mockDashboardFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => body,
    } as Response);
  }

  function mockPutResponse(status: number, body: object = {}) {
    mockDashboardFetch.mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response);
  }

  function mockDeleteResponse(status: number) {
    mockDashboardFetch.mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      json: async () => ({}),
    } as Response);
  }

  // ... tests use the LayoutEditor binding from beforeEach
});
```

**Export-Convention:** `export function LayoutEditor(...)` (named export,
matching alit's dashboard-component convention — Modal, RichTextEditor,
etc.). Boilerplate oben spiegelt das.

---

## Test-Cases (~20)

### Pure helpers (`layout-editor-state.test.ts`) — 6

- **PH-1** `moveBlockToPrevSlide` first-of-first → no-op (content equal). **Reference-equality assert** (R5 [MEDIUM #5]): for the no-op path, `expect(result).toBe(input)` (helper returns the same array reference for early-returns — explicit invariant). PLUS `canMovePrev` regression-guard (R3 [FAIL #2]): `canMovePrev(0, 0) === false`, `canMovePrev(0, 1) === false` (button must NOT be enabled for any block on slide 0 — the helper is a no-op there), `canMovePrev(1, 0) === true` (positive case). Symmetric zu PH-5 für canMoveNext.
- **PH-2** `moveBlockToPrevSlide` last-block-of-non-first slide → previous slide gains the block; current slide gets filtered out completely (helper-internal filter). **Reference-equality assert** (R5 [MEDIUM #5]): for the mutation path, `expect(result).not.toBe(input)` (helper MUST return a new array, not mutate; otherwise React-state-update no-op'd).
- **PH-3** `moveBlockToNextSlide` last-slide → no-op. **Reference-equality assert** (R5 [MEDIUM #5]): `expect(result).toBe(input)` for the no-op; symmetrische positive-case mit move-success → `expect(result).not.toBe(input)`.
- **PH-4** `splitSlideHere` blockIdx=0 → no-op (assert `expect(result).toBe(input)`); `splitSlideHere` blockIdx=1 → splits into 2 new slides (assert `expect(result).not.toBe(input)`).
- **PH-5** `canMoveNext` returns false for ANY block on the last slide (regression-guard for R2 [FAIL #2] — no blockIdx in signature)
- **PH-6** `validateSlideCount` boundary cases (R3 [MEDIUM #6] — explizit enumeriert):
  - **fail-cases:**
    - `[]` (empty) → `{ok: false, reason: "empty_layout"}`
    - `hasGrid=false, 11 slides` → `{ok: false, reason: "too_many_slides"}` (1 over text-only cap)
    - `hasGrid=true, 10 slides` → `{ok: false, reason: "too_many_slides_for_grid"}` (1 over grid cap)
  - **boundary-pass-cases (must explicitly cover both caps at exact-cap):**
    - `hasGrid=false, 10 slides` → `{ok: true}` (exactly at SLIDE_HARD_CAP)
    - `hasGrid=true, 9 slides` → `{ok: true}` (exactly at SLIDE_HARD_CAP - 1)
  - **trivial-pass-case:** `hasGrid=false, 1 slide` → `{ok: true}`

### LayoutEditor component (`LayoutEditor.test.tsx`) — 14

**Initial render + GET (3):**
- **C-1** Renders loading text while fetch in flight
- **C-2** GET 200 mode=auto: shows N slide-cards with all blocks, no banner, save disabled (not dirty), reset NOT shown (layoutVersion===null)
- **C-3** GET fails (rejected promise): shows error banner with retry-button; clicking retry increments refetchKey → re-fetches → assert recovery to ready-state. **Mock-Setup (R4 [MEDIUM #4]):** `mockDashboardFetch.mockRejectedValueOnce(new Error("network"))` für initial GET, dann `mockGetResponse(validBody)` queueen für retry-fetch. Sequence: fetch fails → assert error banner + retry-button rendered → click retry → assert mockDashboardFetch.mock.calls.length === 2 → `await waitFor(() => screen.getByText(...slide-card content...))` → assert error banner gone + slides rendered.

**Editor operations (3):**
- **C-4** Click „Nächste Slide" on slide[0]/block[0] (2-slide fixture, 2 blocks each) → editedSlides = `[[b2],[b1,b3,b4]]`, save now ENABLED (isDirty=true)
- **C-5** Round-trip revert (R2 [FAIL-10] fixture, R3 [MEDIUM #8] — 0-indexed notation): 2 slides x 2 blocks `[[b1,b2],[b3,b4]]`. Click „Nächste Slide" auf `(slideIdx=0, blockIdx=1)` (= b2) → state wird `[[b1],[b2,b3,b4]]`. Click „Vorherige Slide" auf `(slideIdx=1, blockIdx=0)` (= b2 jetzt am Anfang von slide 2) → state zurück zu `[[b1,b2],[b3,b4]]` (original). Assert: `isDirty` becomes false (snapshot-diff revert detection). Wichtig: 2-block-pro-slide fixture vermeidet empty-slide-filter mid-sequence — round-trip wäre sonst nicht reversibel.
- **C-6** Click „Neue Slide ab hier" on slide[0]/block[1] → splits, now 3 slides

**Save flow (4):**
- **C-7** Save with valid edits (200 response) → refetchKey++ → re-fetches with new layoutVersion → editor shows new server-truth, isDirty=false, save disabled. **Mock-Setup (R4 [MEDIUM #5]):** `mockGetResponse` zwei Mal queueen — initial GET + post-save GET (mit aktualisiertem `layoutVersion: "newVersionHash16ch"` und `mode: "manual"`). Sonst kassiert der zweite fetch ein `undefined` zurück und `editorMode` flippt auf "error" mit cryptic message. PUT-mock ist getrennt davon (`mockPutResponse(200)`). Sequenz: `mockGetResponse(initial)` → `mockPutResponse(200)` → `mockGetResponse(refreshed)`.
- **C-8** Save returns 409 → content_changed banner + save disabled
- **C-9** Save returns 412 → layout_modified banner (save NOT in disabled list — user can retry after Reset)
- **C-10** Save with too-many-slides for grid (R3 [FAIL #3] + R4 [FAIL #2] + R5 [FAIL #1] — fixture muss `availableImages:1` für hasGrid=true UND multi-block slides; split-Sequenz muss exakt enumeriert sein weil split(slideIdx, 1) auf single-block-slides no-op ist):
  - GET mock returns `{mode:"auto", imageCount:1, availableImages:1, layoutVersion:null, slides: 5 slides × 2 blocks = [[b0,b1],[b2,b3],[b4,b5],[b6,b7],[b8,b9]]}`
  - User-Sequenz (jeder Schritt teilt eine 2-block-slide in zwei single-block-slides — nach jedem split shiften die ungesplitteten slides um +1, deshalb aufsteigender slideIdx):
    1. `handleSplit(slideIdx=0, blockIdx=1)` → 6 slides: `[[b0],[b1],[b2,b3],[b4,b5],[b6,b7],[b8,b9]]`
    2. `handleSplit(slideIdx=2, blockIdx=1)` → 7 slides
    3. `handleSplit(slideIdx=4, blockIdx=1)` → 8 slides
    4. `handleSplit(slideIdx=6, blockIdx=1)` → 9 slides
    5. `handleSplit(slideIdx=8, blockIdx=1)` → 10 slides
  - Click Save → client-side validateSlideCount fails (hasGrid=true && 10>9) → `too_many_slides_for_grid` banner shown BEFORE PUT
  - Assert `mockDashboardFetch.mock.calls.length === 1` (nur initial GET, kein PUT).

**422 server-side validation (1 — R3 [FAIL #4]):**
- **C-12** Save returns 422 + body `{success: false, error: "incomplete_layout"}`. Assert: `incomplete_layout` banner with the spec'd German message rendered, `saveDisabled` becomes true (kind ist in saveDisabled-list), no refetch fired (`mockDashboardFetch.mock.calls` count unverändert nach PUT). Optional: zwei weitere `it()`-blocks oder `it.each` für `unknown_block` und `duplicate_block` mit symmetrischen asserts. Damit ist die 422-Branch von `mapPutErrorToBannerKind` direkt exerciert (löst auch R3 [MEDIUM #7] — keine separaten mapper-tests nötig).

**Reset + stale + orphan (1 mit mehreren asserts):**
- **C-11** Four sub-cases in one test (or separate `it()`-blocks, free choice):
  - **a)** GET mode=stale → stale banner + reset button visible
  - **b)** Click reset (from a) → DELETE 204 → refetchKey++ → mode=auto + layoutVersion=null + reset button gone. **Mock-Setup (R4 [MEDIUM #5]):** zwei `mockGetResponse` queueen — initial stale-GET + post-delete auto-GET. Sequenz: `mockGetResponse(stale)` → `mockDeleteResponse(204)` → `mockGetResponse(auto-with-null-version)`.
  - **c)** GET warnings=[orphan_image_count] + slides=[] + layoutVersion=null → orphan banner + empty-editor placeholder + Reset NICHT shown (layoutVersion===null)
  - **d)** **(R3 [MEDIUM #7] + R5 [FAIL #2])** GET warnings=[orphan_image_count] + slides=[] + layoutVersion="aabbccdd11223344" (non-null orphan = pre-S1b stored override now orphaned because images deleted): orphan banner shown + `resetOrphan` button rendered. Click button → mock DELETE 204 → refetchKey++ → re-fetch fired. **Mock-Setup:** queue THREE responses — initial GET (orphan), DELETE 204, post-delete GET (auto, layoutVersion=null). Sequenz: `mockGetResponse(orphanWithVersion)` → `mockDeleteResponse(204)` → `mockGetResponse(autoNullVersion)`. Assert: nach DELETE wird auto-state geladen, Reset-button verschwindet (layoutVersion jetzt null). Verifies the conditional `serverState.layoutVersion !== null && <button>` path UND vermeidet exhausted-mock-error im post-delete fetch.

**discardKey effect (1 — R4 [FAIL #4]):**
- **C-13** discardKey-revert + first-render-guard. Drei sub-cases (alle REQUIRED — R5 [MEDIUM #7]):
  - **a)** Render mit `discardKey={0}` und initialen GET 200 mit 2 slides. User klickt „Nächste Slide" → editedSlides changed, isDirty=true. Re-render mit `discardKey={1}` → assert: editedSlides REVERTED zu serverState.initialSlides, isDirty=false.
  - **b)** Re-render nochmal mit unverändertem `discardKey={1}` → assert: editedSlides bleibt unverändert (effect feuert nicht erneut).
  - **c)** **(REQUIRED, nicht optional)** isFirstDiscardKey-guard regression: separate test, render initial mit `discardKey={5}` (hoher Wert) und initialen GET 200. User klickt „Nächste Slide" → editedSlides changed. Assert: editedSlides ist NICHT auf initialSlides zurückgesetzt nach mount (guard skipped first render). Wenn dieser test fehlt, kann ein Developer den `isFirstDiscardKey`-guard weglassen — dann revertieren ALLE Mounts mit non-zero discardKey die User-edits sofort, was im S2b-Integration silently zerstört wird.
  
  Verifies the non-obvious React pattern that S2b critical depends on.

**onDirtyChange callback (1 — R5 [FAIL #3]):**
- **C-14** DK-6 callback-broadcast verification. Render mit `onDirtyChange={mockSpy}`, GET 200 mit 2 slides. Assert `mockSpy` wurde nach initial-fetch mit `false` aufgerufen (clean state). Click „Nächste Slide" → editedSlides changed → assert `mockSpy` wurde mit `true` aufgerufen. Re-render mit incrementiertem `discardKey` → assert `mockSpy` wurde mit `false` aufgerufen (revert clears dirty). Vermeidet stale callback ref-equality issues durch `useCallback`-spy: `const mockSpy = vi.fn();` (vi.fn ist per definition stabil).

**`canSaveMergedLayout` save-without-edit (1 — R6 [CONTRACT-FIX]):**
- **C-15** Save eines server-side cap-merged Override ohne user-edit. **Setup:** GET 200 mit `mode:"manual"`, `warnings:["too_many_blocks_for_layout"]`, `slides`-array mit z.B. 9 slides (post-cap), `layoutVersion:"deadbeefcafe1234"`. Assert: amber `tooManyBlocks`-banner sichtbar (DK existiert bereits in §JSX-Skeleton). **Critical:** Save-Button MUSS `disabled=false` sein OBWOHL `editedSlides === serverState.initialSlides` (`isDirty=false`) — der `canSaveMergedLayout`-derived bool öffnet den Pfad. Click Save → mock PUT 200 → assert `mockDashboardFetch` wurde mit method=PUT aufgerufen, body enthält die merged 9-slide-Sequence (NICHT die hypothetischen 12 pre-merge slides, weil GET schon merged-state geliefert hat) UND den unveränderten `layoutVersion` aus dem GET. Refetch fired (refetchKey++). Verhindert Regression: ohne diesen Test würde ein Developer den `canSaveMergedLayout`-Pfad bei einem Refactor versehentlich wegoptimieren und der Admin könnte den merged-Stand nie persistieren.

**Total:** 21 tests (PH 6 + C 15). Coverage of the full S2a contract incl. 422-branch (R3 [FAIL #4] + [MEDIUM #7] resolved), discardKey-Pfad (R4 [FAIL #4] resolved), onDirtyChange callback (R5 [FAIL #3] resolved), und `canSaveMergedLayout` (R6 [CONTRACT-FIX] resolved).

---

## Risk Surface

| Risiko | Mitigation |
|---|---|
| Race bei schnellem refetchKey-trigger | `cancelled`-flag im fetch-effect (standard pattern, S1b mocked tests verifizieren) |
| Snapshot-diff false-positive | `stableStringify` ist string-comparison, references egal. C-5 ist die direct regression. |
| Pure-helpers reference-mutate | Helpers MÜSSEN neue Arrays returnen, sonst React-state-update no-op'd. Tests bekommen explizite `expect(result).not.toBe(input)` checks (PH-1..PH-4). |
| Banner-Auto-Clear während laufender PUT | adjust-state-during-render guard nutzt `editedSlides`-Vergleich, nicht banner-state direkt. PUT setzt `editorMode="saving"` was den banner-clear-Pfad nicht beeinflusst. |
| `dashboardFetch` mocking divergiert von prod | Pro Test wird per `vi.doMock` der gleiche path gemockt. S1a/S1b convention bewährt. |
| `discardKey`-effect feuert ohne serverState | `if (!serverState) return;`-guard im effect. PH/C-Tests cover serverState=null Pfad implizit (kein test failt) — aber explizit gemocked durch `isFirstDiscardKey.current=true`-skip beim initial render. |

**Blast Radius:** LOW. Neue Komponente nicht erreichbar via UI in S2a. Ein bug in LayoutEditor kann nur durch direkten Component-mount (Tests, S2b) auffallen — kein User-Impact. Worst case in S2a = component-tests fail, sprint blocked.

---

## Implementation Order

1. **`layout-editor-types.ts`** (1 Zeile relevant) + commit
2. **`layout-editor-state.ts` + Tests** (PH-1..PH-6) — pure helpers ohne React, schnellstes Feedback
3. **`LayoutEditor.tsx` Skeleton** — fetch + render + buttons (no save/reset yet)
4. **`LayoutEditor.tsx` save/reset/error-handling**
5. **`LayoutEditor.tsx` stale + orphan banners + adjust-state-during-render banner-clear**
6. **`LayoutEditor.test.tsx`** (C-1..C-11)
7. **i18n strings** in `dashboardStrings`
8. **`pnpm build` + `pnpm test` + `pnpm audit`**
9. **Push → Sonnet pre-push gate**
10. **Codex PR-review** (Round 1)
11. **Merge nach explizitem User-Go**
12. **S2b spec planen** (separate session)

---

## Notes

- Spec bewusst kürzer als R2-monolithisch (~600 Zeilen statt 1100). Alles modal-/tab-/confirm-spezifische ist deferred zu S2b.
- Component-Interface-Props (`onDirtyChange`, `discardKey`) sind in S2a definiert aber unbenutzt — damit S2b keine breaking-change am Interface braucht und Tests in S2b additive bleiben können.
- Kein manueller staging-smoke in S2a (component nicht erreichbar). S2b hat den smoke.
- `tasks/instagram-layout-overrides-s2-monolithic-spec.md.archived` bleibt als Reference (welche complexity wir bewusst rausgenommen haben).
