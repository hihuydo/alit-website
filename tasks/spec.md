# Sprint S2 — Instagram Layout-Overrides Modal UI

**Branch:** `feat/instagram-layout-overrides-s2-modal`
**Depends on:** S1a (resolver, exposed types) ✅, S1b (persistence API + grid-aware caps) ✅
**Status:** Spec
**Created:** 2026-04-29

---

## Summary

Editor-UI im `InstagramExportModal` für die in S1b geschaffene Persistence-API. Admins bekommen einen Tab `Layout anpassen` neben dem bestehenden `Vorschau`-Tab und können dort manuelle Block-Gruppierung speichern (per ← / → / Neue Slide), Reset auf Auto, und Stale/CAS-Konflikte sehen.

**Out of Scope (explizit):**
- Drag-&-Drop Block-Reorder (Move-Buttons sind ausreichend für MVP — DnD kommt als separater Sprint S3 falls die User es wirklich brauchen)
- Per-Block Live-Preview-PNG-Cards
- Override-Audit-Log-Viewer im UI
- Bulk-Operation „alle zurücksetzen"
- DE↔FR Override-Vererbung
- Custom-Block-Splitting (User splittet Absatz)

**No new API endpoints.** Alle Routes sind in S1b live (`GET/PUT/DELETE /api/dashboard/agenda/[id]/instagram-layout/`).

**No DB-Changes.** Schema (`agenda_items.instagram_layout_i18n` JSONB) ist seit S1a deployed.

---

## Sprint Contract (Done-Kriterien)

1. **DK-1**: Tab-Switch im `InstagramExportModal`: `mode: "preview" | "layout"`. Tab `Layout anpassen` disabled wenn (a) `locale === "both"` (Layout ist pro Sprache) oder (b) GET liefert keine Block-IDs (sollte unmöglich sein nach S0-Backfill, defensive).
2. **DK-2**: Neue Komponente `LayoutEditor.tsx` rendert die Slides als Block-Card-Listen mit Buttons:
   - `← Vorherige Slide` (move block to previous slide; first-block-of-first-slide disabled)
   - `Nächste Slide →` (move to next slide; last-block-of-last-slide disabled)
   - `Neue Slide ab hier` (split: blocks vor diesem in current slide, dieser+folgende in neue slide; cap-aware)
3. **DK-3**: GET on tab-open via `dashboardFetch` (S1b-API), state wird auf jedem `(item.id, locale, imageCount, refetchKey)`-Wechsel neu geladen + cleared. Kein raw `fetch`.
4. **DK-4**: **Dirty-detect via Snapshot-Diff**: `isDirty = stableStringify(editedSlides) !== initialSnapshot`. Revert-to-original ist NICHT dirty. Kein `touched`-Flag.
5. **DK-5**: **In-Modal-Confirm-Dialog** ersetzt `window.confirm` für „Ungespeicherte Änderungen verwerfen?". Inline-Overlay innerhalb des Outer-Modal-DOMs (nicht Portal — Begründung siehe §A11y), Outer-Modal mit `disableClose=true` während Confirm-Open.
6. **DK-6**: **Guarded Set-Handlers** für `mode`/`locale`/`imageCount`/`onClose`: wenn dirty → confirm-dialog öffnen, ansonsten direkt switchen.
7. **DK-7**: **Save-Flow** — PUT mit `dashboardFetch` (CSRF auto-attached). Erfolg: refetch (`refetchKey++`), state-clear, sticky `tab-stays-on-layout` (UX: User sieht den persistierten state). Fehler:
   - `409 content_changed` → Banner „Inhalt hat sich geändert, bitte Modal schließen und neu öffnen" + Save-Button disabled
   - `412 layout_modified_by_other` → Banner „Layout wurde von anderem Admin geändert, bitte zurücksetzen oder Reload"
   - `400 too_many_slides_for_grid` → Banner „Bei aktivem Bild-Grid maximal 9 Text-Slides erlaubt" (cap-context-aware, NICHT generic)
   - `422 incomplete_layout` / `unknown_block` / `duplicate_block` → Banner mit konkretem Hinweis (sollte UI-seitig nicht passieren, aber defensive)
8. **DK-8**: **Reset-Flow** — DELETE via `dashboardFetch`, dann `refetchKey++` für GET-re-trigger. Stale-Banner zeigt Reset-Button als Recovery-Action.
9. **DK-9**: **Stale-Detection** — wenn GET `mode: "stale"` zurückgibt, render Banner „Inhalt wurde geändert seit das Layout gespeichert wurde — Reset auf Auto-Layout?" mit Reset-Button. Editor zeigt Auto-Layout (aus stale-response), Save ist disabled bis Reset.
10. **DK-10**: **Orphan-Handling** — wenn GET `warnings: ["orphan_image_count"]` zurückgibt (imageCount > availableImages), Banner „Bild-Anzahl überschreitet verfügbare Bilder" + Reset-Button disabled (kein Layout zum Reset, da `slides: []`).
11. **DK-11**: **Tests** ~31 in `LayoutEditor.test.tsx` + `layout-editor-state.test.ts` + `InstagramExportModal.test.tsx` extends. Per-Test vi.doMock für `dashboardFetch` (siehe §Test-Infrastructure).
12. **DK-12**: **Manueller Smoke** (DK-X1..X5, siehe §Manueller Smoke) — alle 5 grün auf Staging.

---

## Architektur-Flow

```
Admin clicks „Layout anpassen" tab
   │
   ▼
LayoutEditor mounts → useEffect fires GET via dashboardFetch
   │  /api/dashboard/agenda/<id>/instagram-layout/?locale=de&images=N
   │
   ├─── 200 mode=auto   → editedSlides = response.slides (auto-grouping als starting point)
   ├─── 200 mode=manual → editedSlides = response.slides (saved layout)
   ├─── 200 mode=stale  → editedSlides = response.slides (auto-layout) + Stale-Banner
   ├─── 200 warnings=[orphan_image_count] → empty Editor + Orphan-Banner + Reset disabled
   └─── error → Error-Banner + Retry-Button

initialSnapshot = stableStringify(editedSlides)
layoutVersion = response.layoutVersion

Admin moves block (← / → / Neue Slide) → editedSlides updated
   │
   ▼
isDirty derived: stableStringify(editedSlides) !== initialSnapshot
   │
Admin clicks „Speichern":
   │
   ▼
PUT via dashboardFetch
   │  body: {locale, imageCount, contentHash: response.contentHash,
   │         layoutVersion, slides: editedSlides.map(s => ({blocks: s.blocks.map(b=>b.id)}))}
   │
   ├─── 200 → refetchKey++ (re-GET → fresh layoutVersion + initialSnapshot)
   ├─── 409 → Content-Changed-Banner (modal close+reopen needed)
   ├─── 412 → Layout-Modified-Banner (Reset-or-Reload action)
   ├─── 400 too_many_slides_for_grid → Inline-Banner über Save-Button
   └─── other → Generic-Error-Banner

Admin clicks „Auf Auto zurücksetzen":
   │
   ▼
DELETE via dashboardFetch
   │  → 204 → refetchKey++ → re-GET → mode=auto, layoutVersion=null

Admin tries Tab/Locale/imageCount-switch while dirty:
   │
   ▼
Confirm-Dialog: „Ungespeicherte Änderungen verwerfen?"
   │   [Abbrechen]  [Verwerfen]
   ├─── Abbrechen → no-op, dialog closes
   └─── Verwerfen → state cleared, switch happens
```

---

## File Changes

### NEU

- `src/app/dashboard/components/LayoutEditor.tsx` (~250 Zeilen) — neue Komponente
- `src/app/dashboard/components/LayoutEditor.test.tsx` (~400 Zeilen) — neue Tests
- `src/app/dashboard/components/ConfirmDiscardDialog.tsx` (~60 Zeilen) — inline-overlay für confirm
- `src/lib/layout-editor-state.ts` (~120 Zeilen) — pure helper-Funktionen für state-mutations (move-prev, move-next, split-here, cap-validation) — testbar isoliert ohne React
- `src/lib/layout-editor-state.test.ts` (~150 Zeilen) — pure-helper tests

### MODIFY

- `src/app/dashboard/components/InstagramExportModal.tsx`:
  - Add `mode: "preview" | "layout"` state
  - Add Tab-Switch UI (button-pair oben im Modal-Body)
  - Conditional render: `mode === "preview"` → bestehende Preview, `mode === "layout"` → `<LayoutEditor>`
  - Pass `disableClose` to outer Modal when LayoutEditor's confirm-dialog is open
  - Guarded `onClose` (dirty-aware via callback ref from LayoutEditor)
- `src/app/dashboard/components/InstagramExportModal.test.tsx`:
  - +5 tests für tab-switch + dirty-guards an Modal-Level
- `src/app/dashboard/i18n/index.ts` (oder wo dashboardStrings lebt):
  - +~12 neue strings (Tab-labels, Banner-Texte, Confirm-Dialog-Buttons, Error-Messages)

### NICHT modifiziert

- `src/app/api/dashboard/agenda/[id]/instagram-layout/route.ts` (S1b done)
- `src/lib/instagram-overrides.ts` (S1a/S1b done)
- `src/lib/instagram-post.ts` (S1a/S1b done)

---

## Component Interface (LayoutEditor ↔ InstagramExportModal)

**Sonnet R1 [FAIL] #4** — explizit definiert damit kein Developer eine Variante implementiert die gegen die Tests bricht.

**Pattern:** Callback-prop für `isDirty`-Spiegelung + `discardKey`-prop für Forced-Reset. Confirm-Dialog lebt im **PARENT** (InstagramExportModal), NICHT im Child (LayoutEditor) — single source of truth für „User möchte verwerfen-Bestätigung".

**LayoutEditor Props:**

```ts
interface LayoutEditorProps {
  open: boolean;                  // wird durchgereicht — falls false, no fetch
  itemId: number;
  locale: "de" | "fr";            // KEIN "both" — Caller filtert
  imageCount: number;
  /** Fires whenever the local isDirty derived value changes. Parent
   *  mirrors this in its own state für die guarded set-handlers. */
  onDirtyChange: (isDirty: boolean) => void;
  /** When this number changes, LayoutEditor resets editedSlides ←
   *  serverState.initialSlides (i.e. discards local edits without
   *  refetching). Parent increments after Confirm.Discard. */
  discardKey: number;
}
```

**InstagramExportModal owns:**
- `mode: "preview" | "layout"` (existing-state extended)
- `locale` (existing)
- `imageCount` (existing)
- `layoutEditorIsDirty: boolean` — mirrored from LayoutEditor.onDirtyChange
- `confirmDialog: {open, intent, pendingAction} | null`
- `discardKey: number` — incremented on Confirm.Discard

**LayoutEditor owns:**
- `serverState`, `editedSlides`, `editorMode`, `errorBanner`, `refetchKey`
- Move-buttons + save/reset buttons + their handlers
- Dirty-detect via stableStringify (broadcast via onDirtyChange)
- `useEffect` zum reset auf discardKey-change

**Confirm-Dialog rendering:** lebt im InstagramExportModal-JSX, NICHT in LayoutEditor. Weil das outer Modal-Body ja sowieso bereits den `position: relative`-Anker bildet (siehe §A11y unten Fix #8). Damit ist der Confirm im selben DOM-Tree wie alle modal-internen widgets, kann den outer-Modal-Background korrekt blockieren, und die `disableClose`-prop-wiring ist trivial (`disableClose={confirmDialog?.open ?? false}`).

**discardKey-Effect in LayoutEditor:**

```ts
useEffect(() => {
  if (discardKey === 0) return;     // initial render — no reset
  if (!serverState) return;          // nothing to revert to
  setEditedSlides(serverState.initialSlides);
}, [discardKey]);
// `serverState` intentional NICHT in deps — der effect soll NUR auf
// discardKey-change feuern, nicht jedes Mal wenn ein Refetch passiert.
```

**Why callback-prop and NOT useImperativeHandle:**
- `useImperativeHandle` macht `isDirty` als imperative-call available, was den Parent zwingt synchron-mid-render zu lesen. Geht in React 19 zwar (`use()` in transitions), aber ist anti-pattern wenn der Wert in Render-Decisions einfließt.
- Callback-prop spiegelt den Wert in Parent-State → Parent kann ihn als normalen Render-Input nutzen → keine Sync-Mid-Render-Tricks.

**Why discardKey and NOT discardCallback:**
- Callback würde `useEffect` mit unstable-callback-dep bedeuten (jeder Render erzeugt neuen callback identity → effect feuert ständig). discardKey ist eine number, stabil per-Wert.
- Pattern bewährt aus Journal-Editor & ähnlichen alit-Komponenten (siehe `patterns/admin-ui.md` „refetchKey re-trigger").

---

## State Management (LayoutEditor)

```ts
type EditorSlide = {
  blocks: { id: string; text: string; isHeading: boolean }[];
};

type EditorMode = "loading" | "ready" | "saving" | "deleting" | "error";

// Server-derived (immutable per fetch-cycle)
const [serverState, setServerState] = useState<{
  mode: "auto" | "manual" | "stale";
  contentHash: string | null;       // null only for orphan
  layoutVersion: string | null;     // null when no override stored
  imageCount: number;
  availableImages: number;
  warnings: string[];               // e.g. ["layout_stale"], ["orphan_image_count"]
  initialSlides: EditorSlide[];     // 1:1 from GET response.slides
} | null>(null);

// Client-mutable (admin's edits)
const [editedSlides, setEditedSlides] = useState<EditorSlide[]>([]);

// Derived (NOT useState — pure compute):
//   initialSnapshot = useMemo(() => stableStringify(serverState?.initialSlides ?? []), [serverState])
//   isDirty = useMemo(() => stableStringify(editedSlides) !== initialSnapshot, [editedSlides, initialSnapshot])
//
// hasGrid derivation (Sonnet R1 [FAIL] #1): S1b GET response does NOT
// include a `hasGrid` field. Mirror the renderer's logic: grid renders
// when imageCount >= 1 AND availableImages >= 1. Both conditions matter:
//   - imageCount === 0  → admin opted out of grid (text-only export)
//   - availableImages === 0 → no images attached, grid impossible even
//                             if imageCount >= 1 (orphan path; cap-frei)
//   const hasGrid = useMemo(() =>
//     (serverState?.imageCount ?? 0) >= 1 && (serverState?.availableImages ?? 0) >= 1,
//     [serverState]
//   );
// This expression MUST be used everywhere `hasGrid` appears — for
// validateSlideCount, for the cap-aware UI hints, and as the
// dependency in handleSave's useCallback list.

// Lifecycle / control
const [refetchKey, setRefetchKey] = useState(0);
const [editorMode, setEditorMode] = useState<EditorMode>("loading");
// Sonnet R1 [FAIL] #3: union MUST include all `validateSlideCount.reason`
// keys (= API error keys 1:1) plus the network/generic kinds. Otherwise
// `setErrorBanner({kind: validation.reason, ...})` fails TS strict.
const [errorBanner, setErrorBanner] = useState<{
  kind:
    | "content_changed"
    | "layout_modified"
    | "too_many_slides"
    | "too_many_slides_for_grid"
    | "empty_layout"
    | "empty_slide"
    | "generic"
    | "network"
    | "delete_failed"
    | null;
  message: string;
} | null>(null);
const [confirmDialog, setConfirmDialog] = useState<{
  open: boolean;
  intent: "tab-switch" | "modal-close" | "locale-change" | "imageCount-change";
  pendingAction: () => void;        // executed if user confirms „Verwerfen"
} | null>(null);
```

**Invariants:**
- `serverState === null && editorMode === "loading"` — initial mount or post-refetchKey++
- Wenn `editorMode === "ready"` → `serverState !== null`
- `isDirty` ist nur „true" wenn `editedSlides` byte-different von `initialSlides` (kein touched-flag, kein „has-clicked"-flag)
- **Save ist disabled wenn (Sonnet R1 [FAIL] #9 — vollständig):**
  ```ts
  const saveDisabled =
    !isDirty
    || editorMode !== "ready"
    || serverState?.mode === "stale"            // user must reset first
    || serverState?.warnings.includes("orphan_image_count")
    || errorBanner?.kind === "content_changed"  // 409 — needs modal close+reopen
    || errorBanner?.kind === "too_many_slides"
    || errorBanner?.kind === "too_many_slides_for_grid"
    || errorBanner?.kind === "empty_layout"
    || errorBanner?.kind === "empty_slide";
  // Note: validation-failure-banners (too_many_*, empty_*) bleiben sticky
  // bis User die slide-struktur fixt → editedSlides changed → useEffect
  // clears errorBanner (because edits invalidate the previous validation).
  // 412 (layout_modified) ist NICHT in saveDisabled — User soll nochmal
  // klicken können nach reload → fresh layoutVersion.
  ```
- **errorBanner-clear-on-edit Effect** (gehört zur saveDisabled-Logik):
  ```ts
  useEffect(() => {
    if (errorBanner && (
      errorBanner.kind === "too_many_slides" ||
      errorBanner.kind === "too_many_slides_for_grid" ||
      errorBanner.kind === "empty_layout" ||
      errorBanner.kind === "empty_slide"
    )) {
      setErrorBanner(null);
    }
  }, [editedSlides]);
  // 409/412/network/generic bleiben sticky bis User Reset/Close — die
  // validation-Banners sind situativ und sollen nicht störend sein.
  ```
- Reset ist disabled wenn `serverState.layoutVersion === null` (nichts zu löschen). Bei orphan-state (auch wenn `slides=[]`) ist Reset verfügbar wenn `layoutVersion !== null` (siehe §Orphan-Banner).

---

## Effects

### Fetch on (item.id, locale, imageCount, refetchKey)-change

```ts
useEffect(() => {
  if (!open || !item || mode !== "layout" || locale === "both") return;
  let cancelled = false;

  setEditorMode("loading");
  setServerState(null);   // CLEAR — locale-switch must not show stale data
  setEditedSlides([]);
  setErrorBanner(null);

  (async () => {
    try {
      const res = await dashboardFetch(
        `/api/dashboard/agenda/${item.id}/instagram-layout/?locale=${locale}&images=${imageCount}`,
        { method: "GET" }
      );
      if (cancelled) return;
      if (!res.ok) {
        setEditorMode("error");
        setErrorBanner({ kind: "generic", message: dashboardStrings.layoutEditor.fetchError });
        return;
      }
      const body = await res.json();
      setServerState({
        mode: body.mode,
        contentHash: body.contentHash,
        layoutVersion: body.layoutVersion,
        imageCount: body.imageCount,
        availableImages: body.availableImages,
        warnings: body.warnings ?? [],
        initialSlides: body.slides,
      });
      setEditedSlides(body.slides);
      setEditorMode("ready");
    } catch (err) {
      if (cancelled) return;
      setEditorMode("error");
      setErrorBanner({ kind: "generic", message: dashboardStrings.layoutEditor.networkError });
    }
  })();

  return () => { cancelled = true; };
}, [open, item?.id, locale, imageCount, mode, refetchKey]);
```

**Note** der `cancelled`-Guard schützt gegen Race wenn locale schnell hin-und-her geswitcht wird.

### Cleanup on item-change / modal-close

Wenn `item` change oder `open=false`: alle state-vars zurück auf initial. Damit das Re-open frisch lädt + alte dirty-state nicht wieder auftaucht.

---

## Pure Helpers (`src/lib/layout-editor-state.ts`)

Diese werden in `LayoutEditor.test.tsx` als Black-Box-Behavior genutzt UND haben eigene unit tests in `layout-editor-state.test.ts`. Trennt React-Wiring von Logik.

```ts
import type { EditorSlide } from "./layout-editor-types";

/** Move the block at slides[slideIdx].blocks[blockIdx] to the END of
 *  slides[slideIdx-1].blocks. No-op if slideIdx === 0.
 *  POST: empty slides werden gefiltert (keine renderable empty cards). */
export function moveBlockToPrevSlide(
  slides: EditorSlide[],
  slideIdx: number,
  blockIdx: number,
): EditorSlide[];

/** Move the block to the START of slides[slideIdx+1].blocks. If
 *  slideIdx === slides.length - 1: no-op (caller's button-disabled
 *  state should prevent this).
 *  POST: empty slides werden gefiltert. */
export function moveBlockToNextSlide(
  slides: EditorSlide[],
  slideIdx: number,
  blockIdx: number,
): EditorSlide[];

/** Split: blocks BEFORE blockIdx stay in current slide, blocks AT and
 *  AFTER blockIdx move to a NEW slide inserted after current.
 *  No-op if blockIdx === 0 (would create empty current slide).
 *  Cap-validation done by caller (gridAware) — this helper allows
 *  >SLIDE_HARD_CAP and lets the UI surface the warning. */
export function splitSlideHere(
  slides: EditorSlide[],
  slideIdx: number,
  blockIdx: number,
): EditorSlide[];

/** Returns true wenn der move-prev button für (slideIdx, blockIdx)
 *  enabled sein soll. */
export function canMovePrev(slideIdx: number, blockIdx: number): boolean;
//   = !(slideIdx === 0 && blockIdx === 0) — first-block-of-first-slide

/** Move-next button: enabled wenn es eine slide gibt in die der block
 *  bewegt werden kann (i.e. NICHT auf der letzten slide). `blockIdx`
 *  ist hier IRRELEVANT — egal welcher block einer non-last-slide ist
 *  bewegbar (auch der erste, sonst entstünde split-via-side-effect-Bug
 *  Sonnet R1 [FAIL] #2). NICHT vergessen: nach Bewegung wird die
 *  current slide gefiltert wenn sie leer wird (ist Helper-internal),
 *  daher ist „leave slide empty" KEIN guard-criterion auf canMoveNext.
 *  Signature absichtlich ohne `blockIdx`-Parameter — Codex/Sonnet wird
 *  das sonst als „dead param" flaggen. */
export function canMoveNext(
  slides: EditorSlide[],
  slideIdx: number,
): boolean;
//   = slideIdx < slides.length - 1

/** Returns true wenn split sinnvoll ist (blockIdx > 0). */
export function canSplit(blockIdx: number): boolean;

/** Returns true wenn die aktuelle slide-count den grid-aware cap
 *  überschreitet (für UI-Banner über Save-Button). Gibt das errorKind
 *  als string zurück damit der Caller das in i18n-string mappen kann. */
export function validateSlideCount(
  slides: EditorSlide[],
  hasGrid: boolean,
): { ok: true } | { ok: false; reason: "too_many_slides" | "too_many_slides_for_grid" | "empty_layout" | "empty_slide" };
```

**Edge-Cases die getestet werden müssen:**
- `moveBlockToPrevSlide` bei first-of-first → no-op (return same array)
- `moveBlockToPrevSlide` der letzten block einer slide → vorherige slide bekommt block, current slide bleibt leer ⇒ Helper filtert empty slides direkt (Spec-Decision: Filter im Helper, nicht im Caller — sonst sieht der User leere Slides als renderbar)
- `splitSlideHere` mit blockIdx=0 → no-op
- `validateSlideCount` mit `hasGrid=true` und `slides.length=10` → `too_many_slides_for_grid` (matches PUT 400 error key 1:1)
- Reference-equality: pure helpers müssen **neue** Arrays/Slides zurückgeben (no mutation), damit React-state-update korrekt re-rendert

---

## Dirty-Detect Pattern

```ts
const initialSnapshot = useMemo(
  () => stableStringify(serverState?.initialSlides ?? []),
  [serverState],
);

const isDirty = useMemo(() => {
  if (editorMode !== "ready") return false;   // can't be dirty during loading/error
  return stableStringify(editedSlides) !== initialSnapshot;
}, [editedSlides, initialSnapshot, editorMode]);
```

**Why snapshot-diff and NOT touched-flag:**
- User clicks „Move next", then clicks „Move prev" zurück → editedSlides == initialSlides → NICHT dirty. Touched-flag würde fälschlich „dirty" zeigen und confirm-prompt abfeuern.
- `stableStringify` bereits browser-safe pure helper aus `src/lib/stable-stringify.ts` — kein neues dependency, kein `node:crypto`.

**Why `useMemo` instead of `useEffect + useState`:**
- Derived value, kein side-effect. Klassischer React anti-pattern: state für derived values. `useMemo` ist die richtige Tool.

---

## Confirm-Dialog (a11y-Decision)

**Architektur-Wahl:** **Inline-Overlay innerhalb des Outer-Modal-DOM**, NICHT React-Portal in eigene z-layer.

**Rationale:**
- Outer Modal hat bereits focus-trap + Escape-handler in `Modal.tsx`. Setzen wir `disableClose=true` während Confirm-Open, blockiert das den Outer-Escape (siehe `disableCloseRef` mutation-during-render — bereits implementiert).
- Confirm braucht eigenen Escape-handler der NUR die Confirm schließt (nicht Outer). Lösung: lokaler `onKeyDown` mit capture-phase + `e.stopPropagation()` damit Outer-Listener das Event nicht sieht.
- Portal hätte Vorteil: zwei separate focus-traps. Nachteil: zwei `aria-modal=true` Modals gleichzeitig = a11y-violation (NV-Da, JAWS reportet beide). Inline-overlay vermeidet das (Confirm ist conceptionally Teil des Outer-Modal, nicht separater Dialog-Layer).
- WAI-ARIA: Confirm bekommt `role="alertdialog"`, `aria-labelledby`/`aria-describedby` auf eigenen IDs. Outer-Modal-Title bleibt `aria-labelledby` des outer dialogs.

**Implementation:**

```tsx
// ConfirmDiscardDialog.tsx
export function ConfirmDiscardDialog({
  open,
  onConfirm,
  onCancel,
  intent,
}: {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  intent: "tab-switch" | "modal-close" | "locale-change" | "imageCount-change";
}) {
  const titleId = useId();
  const descId = useId();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // Focus the Cancel button by default (safer choice — User has to
    // explicitly tab to Discard)
    const cancelBtn = containerRef.current?.querySelector<HTMLButtonElement>(
      "[data-confirm-cancel]",
    );
    cancelBtn?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();   // outer Modal's window-listener won't fire onClose
        onCancel();
      }
    };
    // Capture phase to beat outer Modal's window-level listener
    window.addEventListener("keydown", handleKey, { capture: true });
    return () => window.removeEventListener("keydown", handleKey, { capture: true });
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      ref={containerRef}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      className="absolute inset-0 z-10 flex items-center justify-center bg-black/30"
    >
      <div className="bg-white rounded-md shadow-lg p-6 max-w-md mx-4">
        <h3 id={titleId} className="font-semibold text-lg mb-2">
          {dashboardStrings.layoutEditor.confirmDiscardTitle}
        </h3>
        <p id={descId} className="text-sm text-gray-600 mb-4">
          {dashboardStrings.layoutEditor.confirmDiscardBody[intent]}
        </p>
        <div className="flex justify-end gap-2">
          <button
            data-confirm-cancel
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium border rounded"
          >
            {dashboardStrings.layoutEditor.confirmCancel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded"
          >
            {dashboardStrings.layoutEditor.confirmDiscard}
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Key detail:** `position: absolute inset-0` + `z-10` overlays the
LayoutEditor inside the outer Modal-Body. Per Component-Interface oben
lebt der Confirm-Dialog im PARENT (InstagramExportModal), NICHT im
LayoutEditor. Daher:

**Sonnet R1 [FAIL] #8 — exakte Position:** `position: relative` muss auf
das **Wrapper-DIV im InstagramExportModal-Body** das BEIDES enthält:
(a) den Tab-Switcher + LayoutEditor, (b) das ConfirmDiscardDialog. Konkret
in `InstagramExportModal.tsx` JSX-Tree:

```tsx
<Modal ...>
  {/* THIS div bekommt `relative`. Confirm-Overlay covered Tab-Switcher
      UND Editor-Body (NICHT die Modal-Title-Bar — die ist im Modal-
      Component selbst, ausserhalb dieses div). */}
  <div className="relative">
    <TabSwitcher mode={mode} onChange={guardedSetMode} />
    {mode === "preview" ? <PreviewTab ... /> : <LayoutEditor ... />}
    <ConfirmDiscardDialog
      open={confirmDialog?.open ?? false}
      intent={confirmDialog?.intent ?? "tab-switch"}
      onCancel={() => setConfirmDialog(null)}
      onConfirm={() => {
        confirmDialog?.pendingAction();
        setConfirmDialog(null);
        setDiscardKey(k => k + 1);   // signal LayoutEditor to clear edits
      }}
    />
  </div>
</Modal>
```

Damit covered der Confirm-Overlay den Editor-Body + Tab-Switcher (das
ist gewollt — User soll während Confirm NICHT plötzlich auf Vorschau-Tab
klicken können). Modal-Title-Bar bleibt sichtbar (im outer-Modal-DOM
above this div).

**Capture-phase Escape-handler** ist wichtig — der outer `Modal.tsx` registriert auch `keydown` auf `window`. Ohne capture wäre die order non-deterministisch (insertion-order). Mit capture-phase fängt der Confirm-Handler zuerst ab + ruft `stopPropagation()` ⇒ outer-handler sieht das Event nicht.

---

## Guarded Set-Handlers

```ts
const guardedSetMode = useCallback((next: "preview" | "layout") => {
  if (!isDirty) {
    setMode(next);
    return;
  }
  setConfirmDialog({
    open: true,
    intent: "tab-switch",
    pendingAction: () => setMode(next),
  });
}, [isDirty]);

// Sonnet R1 [FAIL] #5: Switch zu locale="both" muss auch mode → "preview"
// switchen, sonst sieht der Admin auf Layout-Tab ein perpetually-loading
// Editor (fetch-effect early-returnt bei locale="both" ohne state update).
const guardedSetLocale = useCallback((next: LocaleChoice) => {
  const apply = () => {
    setLocale(next);
    if (next === "both" && mode === "layout") {
      setMode("preview");   // batched mit setLocale (React 18+ auto-batching)
    }
  };
  if (!layoutEditorIsDirty) { apply(); return; }
  setConfirmDialog({
    open: true,
    intent: "locale-change",
    pendingAction: apply,
  });
}, [layoutEditorIsDirty, mode]);

const guardedSetImageCount = useCallback((next: number) => {
  if (!layoutEditorIsDirty) { setImageCount(next); return; }
  setConfirmDialog({
    open: true,
    intent: "imageCount-change",
    pendingAction: () => setImageCount(next),
  });
}, [layoutEditorIsDirty]);
const guardedOnClose = useCallback(() => {
  if (!isDirty) {
    onClose();
    return;
  }
  setConfirmDialog({
    open: true,
    intent: "modal-close",
    pendingAction: onClose,
  });
}, [isDirty, onClose]);
```

**Pattern:** confirm-dialog.pendingAction wird beim Confirm executed, beim Cancel verworfen (dialog closes, no-op).

**Modal-prop wiring:** `<Modal open={open} onClose={guardedOnClose} disableClose={confirmDialog?.open ?? false} ...>`. Wenn Confirm offen ist, blockt outer Modal seine eigene close-trigger. Beim Confirm.Cancel oder .Confirm wird das wieder false.

---

## Save-Flow

```ts
const handleSave = useCallback(async () => {
  if (!serverState || !isDirty) return;

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
      `/api/dashboard/agenda/${item.id}/instagram-layout/`,
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
      // Success — refetch to get fresh layoutVersion + reset initialSnapshot
      setRefetchKey((k) => k + 1);
      // editorMode wird von refetch-effect auf "loading" gesetzt
      return;
    }

    const body = await res.json().catch(() => ({}));
    if (res.status === 409) {
      setErrorBanner({ kind: "content_changed", message: dashboardStrings.layoutEditor.errors.content_changed });
    } else if (res.status === 412) {
      setErrorBanner({ kind: "layout_modified", message: dashboardStrings.layoutEditor.errors.layout_modified });
    } else if (res.status === 400 && body.error === "too_many_slides_for_grid") {
      setErrorBanner({ kind: "too_many_slides_for_grid", message: dashboardStrings.layoutEditor.errors.too_many_slides_for_grid });
    } else {
      setErrorBanner({ kind: "generic", message: dashboardStrings.layoutEditor.errors.generic });
    }
    setEditorMode("ready");
  } catch (err) {
    setErrorBanner({ kind: "generic", message: dashboardStrings.layoutEditor.errors.network });
    setEditorMode("ready");
  }
}, [serverState, isDirty, editedSlides, hasGrid, item, locale, imageCount]);
```

**Invariant:** Bei 200 wird `refetchKey++` getriggered, was den Fetch-Effect re-fired. Der setzt `serverState`/`editedSlides` auf die neue server-truth. `initialSnapshot` recomputed via useMemo → `isDirty=false`.

**KEIN optimistic-update.** Der Save wartet auf Server-Antwort + refetcht. Das ist langsamer als optimistic, aber korrekt: Server entscheidet `layoutVersion`, kein client-side Recompute.

---

## Reset-Flow

```ts
const handleReset = useCallback(async () => {
  if (!serverState) return;

  setEditorMode("deleting");
  setErrorBanner(null);

  try {
    const res = await dashboardFetch(
      `/api/dashboard/agenda/${item.id}/instagram-layout/?locale=${locale}&images=${imageCount}`,
      { method: "DELETE" },
    );

    if (res.status === 204) {
      setRefetchKey((k) => k + 1);   // re-GET → mode=auto
      return;
    }

    setErrorBanner({ kind: "generic", message: dashboardStrings.layoutEditor.errors.deleteFailed });
    setEditorMode("ready");
  } catch (err) {
    setErrorBanner({ kind: "generic", message: dashboardStrings.layoutEditor.errors.network });
    setEditorMode("ready");
  }
}, [serverState, item, locale, imageCount]);
```

**KEIN dirty-confirm vor Reset.** Reset ist explizit destructive (User klickt „Auf Auto zurücksetzen"). Die `isDirty`-edits sind sowieso nicht persistiert; Reset wirft beides weg (current edits + persistierter override). Wenn User unsicher: Cancel-Dialog würde nur Verwirrung stiften.

**Aber:** Der Reset-Button ist in einem Stale-Banner positioniert (Banner-Action), und der Banner-Text erklärt: „Auto-Layout zurücksetzen — entfernt das gespeicherte Layout und nutzt automatische Gruppierung". Das ist explizit genug.

---

## Stale-Banner

Wenn `serverState.mode === "stale"`:

```tsx
<div role="alert" className="bg-yellow-50 border border-yellow-300 p-4 rounded mb-4">
  <h4 className="font-semibold mb-1">{dashboardStrings.layoutEditor.staleTitle}</h4>
  <p className="text-sm mb-2">{dashboardStrings.layoutEditor.staleBody}</p>
  <button
    type="button"
    onClick={handleReset}
    className="px-3 py-1.5 text-sm border border-yellow-700 rounded"
  >
    {dashboardStrings.layoutEditor.resetToAuto}
  </button>
</div>
```

**Save-Button ist disabled** während Stale-State (User muss erst zurücksetzen, dann editieren — sonst speichert er ein Layout das vom alten content abhängt). Wenn `editedSlides` gleich `initialSlides` ist (Auto-Layout aus Stale-Response, unverändert) ist `isDirty=false` → Save sowieso disabled. Wenn der User editiert: explizit blocken via `disabled={isStale || ...}`.

---

## Orphan-Banner

Wenn `serverState.warnings.includes("orphan_image_count")`:

**Sonnet R1 [FAIL] #6 + DK-10 update:** Orphan-state KANN einen non-null
`layoutVersion` haben (= ein vorher gespeichertes Layout das jetzt orphan
ist, weil Bilder gelöscht wurden). In dem Fall MUSS Reset verfügbar sein
damit der Admin den orphan-Override aufräumen kann (sonst dangling JSONB
forever). Wenn `layoutVersion === null` (kein gespeicherter Override):
Reset-Button NICHT rendern (sonst zeigt er nichts an was zu löschen wäre).

```tsx
<div role="alert" className="bg-blue-50 border border-blue-300 p-4 rounded mb-4">
  <h4 className="font-semibold mb-1">{dashboardStrings.layoutEditor.orphanTitle}</h4>
  <p className="text-sm mb-2">
    {dashboardStrings.layoutEditor.orphanBody.replace(
      "{n}",
      String(serverState.availableImages),
    )}
  </p>
  {serverState.layoutVersion !== null && (
    <button
      type="button"
      onClick={handleReset}
      className="px-3 py-1.5 text-sm border border-blue-700 rounded"
    >
      {dashboardStrings.layoutEditor.resetOrphan}
    </button>
  )}
</div>
{/* Empty editor body — explizite Markup-Spec damit Developer nicht
    improvisieren muss (Sonnet R1 [FAIL] #6 secondary): */}
<p className="text-sm text-gray-500 italic mt-4">
  {dashboardStrings.layoutEditor.orphanEmptyEditor}
</p>
```

`serverState.slides === []` in diesem Fall, also Editor zeigt den oben
spec'd `<p>` als Empty-State-Placeholder. Save IMMER disabled (kein
Layout zum Speichern). Reset verfügbar nur wenn `layoutVersion !== null`.

---

## i18n Strings (Sonnet R1 [FAIL] #7)

Alle neuen Strings unter `dashboardStrings.layoutEditor.*`. Platzhalter
`{n}` wird per `.replace("{n}", ...)` ersetzt (matches existing alit-i18n-
pattern, siehe `dashboardStrings.modal.*`).

```ts
layoutEditor: {
  // Tab-labels
  tabPreview: "Vorschau",
  tabLayout: "Layout anpassen",
  tabLayoutDisabledLocaleBoth:
    "Layout-Anpassung ist pro Sprache; bitte DE oder FR wählen",

  // Buttons
  movePrev: "← Vorherige Slide",
  moveNext: "Nächste Slide →",
  splitHere: "Neue Slide ab hier",
  save: "Speichern",
  resetToAuto: "Auf Auto-Layout zurücksetzen",
  resetOrphan: "Verwaisten Override entfernen",

  // Confirm-Dialog
  confirmDiscardTitle: "Ungespeicherte Änderungen",
  confirmCancel: "Abbrechen",
  confirmDiscard: "Verwerfen",
  confirmDiscardBody: {
    "tab-switch":
      "Du wechselst auf die Vorschau-Ansicht. Die ungespeicherten Layout-Änderungen gehen verloren.",
    "modal-close":
      "Beim Schließen gehen alle ungespeicherten Layout-Änderungen verloren.",
    "locale-change":
      "Beim Sprach-Wechsel gehen die ungespeicherten Änderungen für die aktuelle Sprache verloren.",
    "imageCount-change":
      "Layout-Änderungen sind pro Bild-Anzahl gespeichert. Bei Änderung der Anzahl gehen die ungespeicherten Änderungen verloren.",
  },

  // Loading / error states
  loading: "Lädt …",
  fetchError: "Layout konnte nicht geladen werden.",
  networkError: "Netzwerkfehler. Bitte nochmal versuchen.",
  retry: "Erneut versuchen",

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

  // Mode-Indicator (klein, oben rechts im Editor)
  modeAuto: "Mode: Auto",
  modeManual: "Mode: Manuell",
  modeStale: "Mode: Veraltet",

  // Errors (kind-Map → Banner-Message; alle Keys MÜSSEN dem
  //   errorBanner.kind union entsprechen, sonst TS-Fehler im
  //   string-lookup `errors[kind]`)
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
    empty_slide: "Eine Slide darf nicht leer sein.",
    generic: "Speichern fehlgeschlagen. Bitte nochmal versuchen.",
    network: "Netzwerkfehler. Bitte nochmal versuchen.",
    delete_failed:
      "Zurücksetzen fehlgeschlagen. Bitte nochmal versuchen.",
  },
}
```

**Total:** 33 keys (passt zur initial-Schätzung „~12 strings" — die war zu konservativ; Reality is 33 weil errors-map + confirmDiscardBody-map jeweils mehrere keys haben).

---

## CSS / Tailwind

Ein paar neue Klassen aber keine custom-CSS. Modal-Body bekommt `position: relative` (für Absolute-Positioned Confirm-Overlay). Tab-Switch-Buttons: bestehende `border-b-2`/`text-sm` patterns aus dem Modal.

---

## Test-Infrastructure

### LayoutEditor.test.tsx — Pattern (S1a/S1b-konform)

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

// MUST mock dashboardFetch BEFORE component import. Use vi.doMock + dynamic
// import pattern (S1a/S1b convention) to avoid hoisting + module-cache issues.

describe("LayoutEditor", () => {
  const mockDashboardFetch = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    mockDashboardFetch.mockReset();
    vi.doMock("@/app/dashboard/lib/dashboardFetch", () => ({
      dashboardFetch: mockDashboardFetch,
    }));
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

  // ... tests below
});
```

### Test-Cases (~30)

#### LayoutEditor unit (~17)

**Initial render + GET (3):**
- 1. Renders „Lädt..." while initial fetch in flight
- 2. After GET 200 mode=auto: shows N slide-cards with block-cards inside, no banner, save disabled (not dirty)
- 3. After GET fails (network error): shows error banner + retry-button (clicking retry fires refetchKey++)

**Editor operations (5):**
- 4. Click „Nächste Slide" on slide[0].block[0] → editedSlides = block moves to slide[1].blocks[0], save enabled (dirty)
- 5. Click „Vorherige Slide" on slide[0].block[0] → button is disabled (canMovePrev returns false for first-of-first)
- 5b. **Regression-guard für canMoveNext (Sonnet R1 [FAIL] #2):** GET returns 2 slides `[[b1,b2],[b3,b4]]`. „Nächste Slide" auf Slide 2 / Block b3 (= first-of-last-slide) MUST be disabled (canMoveNext returns false weil slideIdx=1 = slides.length-1). Verhindert dass naive `(slideIdx === slides.length - 1 && blockIdx === ...)`-Implementierung den Button für non-last-blocks der last slide aktiviert.
- 6. Click „Neue Slide ab hier" on slide[0].block[1] → splits, now 3 slides where there were 2
- 7. **Sequence revert** (Sonnet R1 [FAIL] #10 — exact fixture): GET returns 2 slides, je 2 blocks: `[[b1,b2],[b3,b4]]`. Click „Nächste Slide" auf Slide 1 / Block b2 → `[[b1],[b2,b3,b4]]` (b2 lands at start of slide 2). isDirty=true. Click „Vorherige Slide" auf Slide 2 / Block b2 (jetzt der erste block dort) → `[[b1,b2],[b3,b4]]` (back to original). isDirty=false (snapshot-diff revert detection). **Wichtig:** dieses Fixture hat 2 blocks pro slide → keine empty-slide-filter-Aktion in der Mitte → Round-Trip ist vollständig reversibel. Test mit Single-Block-Slides würde Filter triggern und NICHT revertierbar sein.
- 8. Move blocks until slide becomes empty → empty slide gets filtered (helper-level)

**Save flow (4):**
- 9. Save with valid edits → 200 response → refetchKey increments → re-fetches → editor shows new server-truth, isDirty=false, save disabled
- 10. Save returns 409 → content_changed banner + save disabled
- 11. Save returns 412 → layout_modified banner + reset-button visible in banner
- 12. Save with too-many-slides for grid → too_many_slides_for_grid banner BEFORE PUT (client-side validation), no API call

**Reset flow (2):**
- 13. Click „Auf Auto zurücksetzen" → DELETE 204 → refetchKey++ → editor shows mode=auto + layoutVersion=null + save disabled (not dirty)
- 14. Reset returns non-204 → generic error banner + editor stays in old state

**Stale-handling (2):**
- 15. GET returns mode=stale → stale banner shown + reset button → save disabled
- 16. Click reset in stale-banner → DELETE → re-fetch → mode=auto

**Orphan-handling (1):**
- 17. GET returns warnings=[orphan_image_count] + slides=[] → orphan banner + reset disabled (no override) + save disabled

#### LayoutEditor confirm-dialog (~3)

- 18. Dirty + tab-switch attempt → confirm dialog opens → cancel → dialog closes, mode unchanged
- 19. Dirty + tab-switch → confirm → confirm clicked → mode switches, dialog closes
- 20. Dirty + Escape key on confirm dialog → cancel triggered (NOT outer modal close)

#### Pure helpers in layout-editor-state.test.ts (~5)

- 21. `moveBlockToPrevSlide` first-of-first is no-op (returns same array)
- 22. `moveBlockToPrevSlide` last-block-of-non-first slide → previous slide gains, current slide MUST get filtered if it becomes empty (helper does the filter)
- 23. `splitSlideHere` blockIdx=0 is no-op (would create empty slide)
- 24. `validateSlideCount` returns `too_many_slides_for_grid` for hasGrid=true and 10+ slides; `too_many_slides` for hasGrid=false and 11+ slides; `empty_layout` for slides=[]
- 25. Reference-equality: helpers always return new array (verifies no in-place mutation that would break React)

#### InstagramExportModal extension (~5, separate file)

- 26. Tab `Layout anpassen` disabled when `locale === "both"` + tooltip shown
- 27. Tab-switch from preview→layout fires LayoutEditor mount + GET
- 28. Outer Modal.disableClose=true while LayoutEditor's confirm dialog is open
- 29. Modal.onClose attempt while LayoutEditor.isDirty=true triggers confirm-dialog (intent="modal-close")
- 30. After save success and refetchKey++, mode stays on "layout" (not jumped back to preview)

---

## Manueller Smoke (Staging)

**Pre-smoke prep:**
- pg_dump backup: `ssh hd-server 'PGPASSWORD=... pg_dump --table agenda_items --data-only -h 127.0.0.1 -U alit_user alit > /tmp/agenda_pre_s2_smoke_$(date +%Y-%m-%d).sql'`
- Disposable test-row mit ≥4 Paragraphen für deutliche slide-grouping

**Smoke cases:**

- **DK-X1**: Modal öffnen → Tab `Layout anpassen` → siehe Auto-Layout → block via „Nächste Slide" verschieben → Speichern → Modal schließen + neu öffnen + Layout-Tab → siehe persistierten state, mode-indicator zeigt „Manuell"
- **DK-X2**: Body-Edit via Discours-Editor (NICHT in diesem Modal) → zurück zum Instagram-Modal → Layout-Tab → Stale-Banner sichtbar → „Auf Auto zurücksetzen" → Banner weg, Auto-Layout angezeigt
- **DK-X3**: Save → in zweitem Browser-Tab dasselbe Modal öffnen + andere Block-Änderung speichern → in erstem Tab Save versuchen → 412-Banner sichtbar mit Reset-Action
- **DK-X4**: Grid-pfad: `imageCount=1` mit ≥10 Text-Blocks → versuche 10 text-slides zu erstellen → Save → Banner „Bei aktivem Bild-Grid maximal 9 Text-Slides erlaubt", PUT NICHT abgesetzt
- **DK-X5**: Dirty + Locale-Switch DE→FR → Confirm-Dialog erscheint → Verwerfen → Locale wechselt + neuer GET für FR

**Post-smoke cleanup:**
- Disposable test-row löschen (analog S1b)
- Verify backup intakt

---

## Risk Surface

| Risiko | Mitigation |
|---|---|
| **Confirm-Dialog Escape leakt zu outer Modal** | Capture-phase Escape-handler im Confirm + `stopPropagation()`. Test #20 als regression-guard. Pattern in `patterns/admin-ui.md` Stack-safe Modal-Verhalten. |
| **State race bei schnellem Locale-Switch** | `cancelled`-flag im fetch-effect verhindert dass alte Response neuere überschreibt. Standard-Pattern, bereits in S1b mocked tests verifiziert. |
| **Snapshot-diff false-positive durch Object-Reference** | `stableStringify` ist string-comparison, references egal. Test #7 (revert-to-original NICHT dirty) ist die direct-regression. |
| **Too-many-slides client-server-divergence** | `validateSlideCount` in pure helper + Test #24 mirror den Server-Cap exact. Wenn Server-Cap sich ändert, ist das ein kombinierter S1c-Sprint. |
| **Pre-COMMIT-Token-stale (412 cascade)** | After 412 zeigen wir Reset-Action im Banner. Reset → DELETE → 204 → refetch → fresh layoutVersion. User kann dann re-edit. NICHT auto-resolve (würde concurrent edit silently win). |
| **Multi-Modal a11y-Violation (zwei aria-modal=true)** | Inline-overlay statt Portal vermeidet das. Confirm bekommt `role="alertdialog"`, outer bleibt `role="dialog"`. |
| **Test-Fragility: dashboardFetch + jsdom + state-transitions** | vi.doMock + per-test `mockDashboardFetch.mockResolvedValueOnce` chain. Wait via `await waitFor()` für post-fetch state. Pure-helper-Tests entkoppeln Logik von React. |
| **Backwards-compat: existing modal-tests müssen weiter passen** | InstagramExportModal.test.tsx wird extends, nicht rewrite. Test #26-30 sind additive. |

**Blast Radius:** MEDIUM. Neue Komponenten, kein Backend-touch, kein Schema-touch. Worst case = Modal kaputt, Admin kann Instagram-Layouts nicht editieren — aber Auto-Pipeline bleibt funktional, da Renderer auch ohne Override arbeitet.

---

## Implementation Order

1. **`layout-editor-state.ts` + Tests** (~5 Tests) — pure helpers ohne React, schnellstes Feedback
2. **`ConfirmDiscardDialog.tsx`** — kleine isolated component, kein state-mgmt
3. **`LayoutEditor.tsx` Skeleton** — fetch + render slides + buttons (no save/reset yet)
4. **`LayoutEditor.tsx` Save-Flow + Error-Banners**
5. **`LayoutEditor.tsx` Reset + Stale-Handling + Orphan-Handling**
6. **`LayoutEditor.tsx` Confirm-Dialog Wiring + Guarded Set-Handlers**
7. **`LayoutEditor.test.tsx` Tests** (~17)
8. **`InstagramExportModal.tsx` Tab-Switch + Outer-Modal-Wiring**
9. **`InstagramExportModal.test.tsx` Extension** (~5 Tests)
10. **i18n strings** in dashboardStrings (parallel zu jeder Component machbar)
11. **`pnpm build` + `pnpm test` + `pnpm audit`**
12. **Push → Sonnet Pre-push-Gate**
13. **Codex PR-Review** (Round 1)
14. **Manueller Smoke DK-X1..X5**
15. **Merge after explicit user authorization**

---

## Notes

- Branch: `feat/instagram-layout-overrides-s2-modal`
- Sub-Sprint-Split nicht nötig — Scope ist klar abgrenzt (no DnD, no audit-viewer, no bulk-ops). DnD kommt als separater S3 falls User es wirklich vermisst.
- `tasks/instagram-layout-overrides-s2-outline.md` bleibt als historisches Outline-Doc, NICHT die Source-of-Truth (das ist diese Spec).
- `tasks/instagram-layout-overrides-spec-v3-reference.md` ist der ursprüngliche Pre-Split-Reference — kann ignoriert werden, alle relevanten S2-Aspekte sind hier enthalten.
