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
11. **DK-11**: **Tests** ~30 in `LayoutEditor.test.tsx` + `layout-editor-state.test.ts` + `InstagramExportModal.test.tsx` extends. Per-Test vi.doMock für `dashboardFetch` (siehe §Test-Infrastructure).
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

// Lifecycle / control
const [refetchKey, setRefetchKey] = useState(0);
const [editorMode, setEditorMode] = useState<EditorMode>("loading");
const [errorBanner, setErrorBanner] = useState<{
  kind: "content_changed" | "layout_modified" | "too_many_slides_for_grid" | "generic" | null;
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
- Save ist disabled wenn `!isDirty || editorMode !== "ready" || errorBanner?.kind === "content_changed"`
- Reset ist disabled wenn `serverState.layoutVersion === null` (nichts zu löschen) oder `serverState.warnings.includes("orphan_image_count")` (nichts zum Reset, da slides=[])

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

/** Move-next button: enabled UNLESS this is the last block of the last
 *  slide AND moving would leave current slide empty. */
export function canMoveNext(
  slides: EditorSlide[],
  slideIdx: number,
  blockIdx: number,
): boolean;

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

**Key detail:** `position: absolute inset-0` + `z-10` overlays the LayoutEditor inside the outer Modal-Body. Outer Modal-Body needs `position: relative` (one-line CSS change in InstagramExportModal).

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

const guardedSetLocale = useCallback((next: LocaleChoice) => { ... });
const guardedSetImageCount = useCallback((next: number) => { ... });
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

```tsx
<div role="alert" className="bg-blue-50 border border-blue-300 p-4 rounded mb-4">
  <h4 className="font-semibold mb-1">{dashboardStrings.layoutEditor.orphanTitle}</h4>
  <p className="text-sm">
    {dashboardStrings.layoutEditor.orphanBody.replace(
      "{n}",
      String(serverState.availableImages),
    )}
  </p>
</div>
```

`serverState.slides === []` in diesem Fall, also Editor zeigt „Keine Slides — bitte Bild-Anzahl reduzieren". Save + Reset disabled.

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
- 6. Click „Neue Slide ab hier" on slide[0].block[1] → splits, now 3 slides where there were 2
- 7. Sequence: move-next then move-prev back → isDirty becomes false (snapshot-diff revert detection)
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
