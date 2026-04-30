# Sprint S2b — InstagramExportModal × LayoutEditor Integration

**Branch:** `feat/instagram-layout-overrides-s2b-modal-integration`
**Depends on:** S1a ✅, S1b ✅, S2a ✅ (PR #134 merged 2026-04-30)
**Status:** Spec
**Created:** 2026-04-30
**Source:** S2a Out-of-Scope §+ archived monolithic S2 spec for vetted design

---

## Summary

Verdrahtet die in S2a fertiggestellte `LayoutEditor`-Komponente in den `InstagramExportModal`. Neuer Tab-Switch („Vorschau" / „Layout anpassen"), Confirm-Dialog für ungesicherte Änderungen, guarded set-handlers für alle State-Mutationen die den Editor verlassen würden.

**Keine neuen API-Routen.** Keine DB-Änderungen. Keine Änderungen am `LayoutEditor` selbst (S2a ist bit-stable). Reine Parent-Wiring + Confirm-Dialog + Tab-UI.

**Scope-Anker (User-validierte Entscheidungen):**
1. `locale="both"` → Layout-Tab disabled mit Tooltip; Switch-zu-both bei aktivem Layout-Tab → mode fällt auf "preview" zurück.
2. Tab-mode (`"preview"|"layout"`) wird bei jedem Modal-Open auf `"preview"` resetted (kein sticky).
3. Test-Tiefe: Vitest-Integration für Glue + 5 manuelle DK-X1..X5 Staging-Smokes.

---

## Sprint Contract (Done-Kriterien)

1. **DK-1**: Tab-Switch im Modal-Body: zwei Buttons "Vorschau" / "Layout anpassen" (existing button-pair-pattern), `mode: "preview" | "layout"` als Parent-State. Layout-Tab `disabled` wenn `locale === "both"` mit Tooltip `tabLayoutDisabledLocaleBoth`.
2. **DK-2**: `mode` wird bei `open: false → true` Transition auf `"preview"` zurückgesetzt (no-sticky, pro User-Entscheidung).
3. **DK-3**: `LayoutEditor` rendert nur wenn `mode === "layout"` UND `locale !== "both"`. Props verdrahtet: `itemId`, `locale: "de"|"fr"`, `imageCount`, `onDirtyChange`, `discardKey`.
4. **DK-4**: Parent mirrort Editor-`isDirty` in `layoutEditorIsDirty: boolean` State über `onDirtyChange`-Callback (in `useCallback` mit stabilen deps).
5. **DK-5**: `discardKey: number` State (init 0). Parent inkrementiert nach Confirm-Discard-Accept.
6. **DK-6**: `confirmDialog: { intent: ConfirmIntent; pendingAction: () => void } | null` State (open-flag implizit via null-check; siehe Sonnet R0 [P2] in §Types). Confirm-Dialog komponente (inline overlay innerhalb Modal-Body, NICHT portal — vermeidet zwei `aria-modal=true`).
7. **DK-7**: Guarded set-handlers für `setMode`, `setLocale`, `setImageCount`, und `onClose` (Modal-X + outside-click). Wenn `layoutEditorIsDirty` → Confirm-Dialog öffnet mit closure-captured `pendingAction`.
8. **DK-8**: Special-case `guardedSetLocale("both")` während `mode === "layout"`: `pendingAction` batches `setMode("preview")` UND `setLocale("both")` (vermeidet perpetual-loading-state weil `LayoutEditor` `locale="both"` nicht akzeptiert).
9. **DK-9**: Modal-Cleanup-Effekt wird als Teil des bestehenden `if (open && item)`-Branches erweitert (beim Modal-Reopen, NICHT beim Schließen) — siehe §Modal Cleanup Effect Update. Reset: `mode → "preview"`, `confirmDialog → null`, `layoutEditorIsDirty → false`. `discardKey` muss NICHT resetted werden (LayoutEditor wird unmounted, `isFirstDiscardKey`-ref ist beim nächsten mount wieder true). Sonnet R1 [P2 #2]: die R0-Wording "bei open: false" war irreführend; tatsächlich wird beim REOPEN gereset (das ist semantisch identisch — alte Werte sind tot).
10. **DK-10**: i18n-Strings unter `dashboardStrings.exportModal.*` (neu — Modal hatte vorher keine i18n). Total 11 keys: `tablistLabel`, `tabPreview`, `tabLayout`, `tabLayoutDisabledLocaleBoth`, `imageCountDisabledLayoutMode`, `confirmDiscardTitle`, `confirmDiscardBodyTabSwitch`, `confirmDiscardBodyModalClose`, `confirmDiscardBodyLocaleChange`, `confirmCancel`, `confirmDiscard`. (`confirmDiscardBodyImageCountChange` entfernt per R2 [P1 #2] — intent strukturell unerreichbar. Existing `dashboardStrings.dirtyConfirm.*` bleibt unverändert.)
11. **DK-11**: Vitest-Integration-Tests in `InstagramExportModal.test.tsx` (**EXISTIERT bereits** mit 4 banner-Tests — Sonnet R2 [P1 #1] Spec-Korrektur). Datei muss auf dynamic-import-Pattern (S2a-Convention) umgestellt werden, weil statisches `import { InstagramExportModal }` mit `vi.doMock("./LayoutEditor")` inkompatibel ist (mock interceptet nur Module die NACH `vi.doMock` importiert werden). Die 4 bestehenden banner-tests funktionieren unverändert (keine LayoutEditor-Interaktion), kriegen nur denselben `beforeEach { vi.doMock + dynamic await import }`-Block. Plus 12 neue Tests cover: tab-switch glue, isDirty-mirror, discardKey-bump (mit unmount-aware assertions per Sonnet R0 [Critical #2]), confirm-dialog open/close (für mode-switch + locale-switch separat — I-6 vs I-6b — weil unmount-Verhalten unterschiedlich ist), guarded handlers (4 varianten), locale="both"-special-case, modal-cleanup, false-positive-confirm-regression-guard. **WICHTIG:** Tests mocken den `LayoutEditor`-import auf eine kontrollierbare Test-Komponente (`vi.doMock`) UND stubben `fetch` global mit default-metadata-response (Sonnet R0 [Critical #3]) UND unstubben in `afterEach` (Sonnet R0 [P2 #7]). S2a-Tests bleiben die Quelle der Wahrheit für Editor-Logic.
12. **DK-12**: 5 manuelle DK-X1..X5 Staging-Smokes nach merge-to-main + staging-deploy verified. Smoke-Liste in §Manual Smoke Plan.

**Done-Definition (zusätzlich zu Standard):**
- Manueller Staging-Smoke vom User signed-off bevor prod-merge

---

## File Changes

### NEU
~~`src/app/dashboard/components/InstagramExportModal.test.tsx`~~ (NICHT neu — siehe MODIFY)

### MODIFY
- `src/app/dashboard/components/InstagramExportModal.tsx` (~593 → ~750 Zeilen) — neue State (`mode`, `discardKey`, `layoutEditorIsDirty`, `confirmDialog`), guarded handlers, Tab-Switch JSX, ConfirmDialog-Komponente inline, LayoutEditor-Render im Layout-Tab, Cleanup-Effekt-Erweiterung
- `src/app/dashboard/components/InstagramExportModal.test.tsx` (123 → ~400 Zeilen) — **EXISTIERT bereits** mit 4 banner-tests. Konvertieren auf dynamic-import-Pattern (S2a-Convention) + vi.doMock("./LayoutEditor") + describe-scope `let mockMetadataFetch`. Plus 12 neue Integration-Tests (I-1..I-11 inkl. I-6b).
- `src/app/dashboard/i18n.tsx` — neuer `exportModal` Namespace (11 keys, siehe DK-10)

### NICHT modifiziert
- `src/app/dashboard/components/LayoutEditor.tsx` (S2a ist bit-stable)
- `src/lib/layout-editor-state.ts`, `src/lib/layout-editor-types.ts` (S2a)
- `src/app/api/dashboard/agenda/[id]/instagram-layout/route.ts` (S1b)
- `src/lib/instagram-overrides.ts`, `src/lib/instagram-post.ts` (S1a/S1b)

---

## Types & State Additions

```ts
// In InstagramExportModal.tsx — added near top of component body:

type ExportTabMode = "preview" | "layout";

// Sonnet R2 [P1 #2]: `imageCount-change` is structurally unreachable —
// dirty=true requires LayoutEditor mounted (mode==="layout"); imageCount
// input is disabled in layout mode (R1 [P2 #5]). In preview mode the
// only path to dirty=true was via prior layout edits, but the
// preview-mode-tab-switch already dispatched discard before entering
// preview, so isDirty=false on entry. → intent dropped.
type ConfirmIntent =
  | "tab-switch"
  | "modal-close"
  | "locale-change";

// `open` is implicit via `confirmDialog !== null` — no separate boolean
// (Sonnet R0 [P2]: ConfirmDialogState.open is dead state, always true
// when non-null. Codex R1 would flag it as redundant.)
type ConfirmDialogState = {
  intent: ConfirmIntent;
  pendingAction: () => void;
};

const [mode, setMode] = useState<ExportTabMode>("preview");
const [discardKey, setDiscardKey] = useState(0);
const [layoutEditorIsDirty, setLayoutEditorIsDirty] = useState(false);
const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
```

---

## Component Wiring

### `onDirtyChange` callback (stable identity)

```ts
const handleDirtyChange = useCallback((dirty: boolean) => {
  setLayoutEditorIsDirty(dirty);
}, []);
```

**WICHTIG:** Der Callback MUSS stable identity haben. Wenn Parent ihn als
inline `(d) => setLayoutEditorIsDirty(d)` passt, würde der `useEffect`
in LayoutEditor (`[isDirty, onDirtyChange]`) bei jedem Parent-Render
wieder feuern → infinite-loop-risiko bei den State-Mirror-Updates.
`useCallback([])` löst das (setState-funktionen sind referenz-stable).

### Guarded set-handlers

Pattern für alle vier Varianten:

```ts
const guardedSetMode = useCallback((next: ExportTabMode) => {
  // **Sonnet R1 [P2 #3]:** No-op when already on this tab. Without this
  // guard, clicking the already-active tab while dirty would open a
  // confirm-dialog → user clicks "Verwerfen" → discardKey++ → editor
  // reverts → setMode(same) is a no-op. Net effect: silent destructive
  // discard from clicking an apparent no-op.
  if (next === mode) return;
  if (!layoutEditorIsDirty) {
    setMode(next);
    return;
  }
  setConfirmDialog({
    intent: "tab-switch",
    pendingAction: () => setMode(next),
  });
}, [layoutEditorIsDirty, mode]);

// Sonnet R2 [P1 #2]: simplified — no dirty-branch (structurally
// unreachable; see ConfirmIntent type comment). Direct setter.
const setImageCountClamped = useCallback((next: number) => {
  setImageCount(next);
}, []);
// (Wrapped in callback for stable identity if passed to memoized child;
// trivially equivalent to passing setImageCount directly.)
// **Sonnet R0 [P2 #4] + R2 [P1 #2]:** the existing number-input onChange
// does clamping/NaN-guard. Wire to `setImageCountClamped` (or directly
// to `setImageCount` since we no longer need a guarded variant):
//
//   onChange={(e) => {
//     const raw = parseInt(e.target.value, 10);
//     const clamped = Number.isNaN(raw) ? 0 : Math.max(0, Math.min(maxImages, raw));
//     setImageCount(clamped);
//   }}
//
// **Sonnet R1 [P2 #5]:** the input MUST also be `disabled={mode === "layout"}`
// in layout mode. Tooltip: `imageCountDisabledLayoutMode` i18n key.

const guardedOnClose = useCallback(() => {
  if (!layoutEditorIsDirty) {
    onClose();
    return;
  }
  setConfirmDialog({
    intent: "modal-close",
    pendingAction: onClose,
  });
}, [layoutEditorIsDirty, onClose]);
```

### `guardedSetLocale` — special case für "both"

```ts
const guardedSetLocale = useCallback((next: LocaleChoice) => {
  // No-op when already on this locale (parallel to guardedSetMode —
  // Sonnet R1 [P2 #3] applies symmetrically).
  if (next === locale) return;
  // Special case: switch to "both" while in layout-mode.
  // LayoutEditor rejects locale="both" (S2a guard), so we MUST also
  // pop back to preview-mode in the same batch.
  const apply = next === "both" && mode === "layout"
    ? () => {
        setLocale(next);
        setMode("preview");
      }
    : () => setLocale(next);

  if (!layoutEditorIsDirty) {
    apply();
    return;
  }
  setConfirmDialog({
    intent: "locale-change",
    pendingAction: apply,
  });
}, [layoutEditorIsDirty, mode, locale]);
```

### Confirm-Dialog accept/cancel

```ts
const handleConfirmDiscard = useCallback(() => {
  if (!confirmDialog) return;
  // **Sonnet R0 [Critical #1]:** explicit dirty-mirror reset — DO NOT
  // rely on the LayoutEditor's discardKey-effect to fire `onDirtyChange
  // (false)`. When `pendingAction` is `setMode("preview")` or
  // `setLocale("both")`, React 18+ batches state updates and the editor
  // unmounts in the same render before its discardKey effect ever runs.
  // Without this explicit reset, the parent keeps `layoutEditorIsDirty
  // = true` and the next attempt to enter the layout tab fires a
  // false-positive confirm dialog.
  setLayoutEditorIsDirty(false);
  // Bump discardKey for the cases where the editor STAYS mounted
  // (locale: de↔fr, imageCount-change). The editor's effect will fire
  // its own onDirtyChange(false) — the explicit reset above is harmless
  // (idempotent) when the effect also runs.
  setDiscardKey((k) => k + 1);
  // Run the captured action (setMode, setLocale, setImageCount, onClose).
  confirmDialog.pendingAction();
  setConfirmDialog(null);
}, [confirmDialog]);

const handleConfirmCancel = useCallback(() => {
  setConfirmDialog(null);
}, []);
```

---

## ConfirmDialog Component (inline)

Lebt im selben File (`InstagramExportModal.tsx`) als unexported function.
**KEIN portal** — wir wollen nicht zwei `aria-modal=true` Container
gleichzeitig rendern (JAWS-double-report-Risk).

```tsx
function ConfirmDiscardDialog({
  intent,
  onConfirm,
  onCancel,
}: {
  intent: ConfirmIntent;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // Capture-phase Escape handler — verhindert dass Escape an die outer
  // Modal durchpropagiert (würde sonst onClose direkt feuern, ohne
  // unser Confirm-Pattern).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    };
    document.addEventListener("keydown", handler, true /* capture */);
    return () => document.removeEventListener("keydown", handler, true);
  }, [onCancel]);

  // **Sonnet R1 [Critical #1]:** WAI-ARIA `role="alertdialog"` requires
  // focus moved to the dialog (or one of its children) on open (ARIA
  // 1.1 §3.22). Without this AND without `inert` on the background,
  // Tab cycles into the underlying modal-body controls (locale radios,
  // imageCount, tab buttons). Pressing Space on a locale radio fires
  // `guardedSetLocale` which OVERWRITES the existing `confirmDialog`
  // (because layoutEditorIsDirty is still true) — the original
  // pendingAction is permanently lost and the user lands in a wrong-
  // intent dialog. Move focus to Cancel + put background inert.
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  // **Sonnet R2 [P2 #4]:** the existing Modal focus-trap (Modal.tsx:57)
  // does `dialogRef.current.querySelectorAll(FOCUSABLE_SELECTOR)` and
  // does NOT filter elements under `[inert]`. So Modal-trap may focus
  // an inert background button (browser-no-op → user stuck) on Tab/
  // Shift-Tab cycles. Modal.tsx is out-of-scope for S2b; we trap
  // focus inside this dialog instead.
  //
  // Capture-phase focusin: if focus lands outside the dialog (because
  // Modal-trap pulled it to background), bounce it back to Cancel.
  useEffect(() => {
    const handler = (e: FocusEvent) => {
      const target = e.target as Node | null;
      if (target && dialogRef.current && !dialogRef.current.contains(target)) {
        e.stopPropagation();
        cancelRef.current?.focus();
      }
    };
    document.addEventListener("focusin", handler, true /* capture */);
    return () => document.removeEventListener("focusin", handler, true);
  }, []);

  // Local Tab/Shift-Tab keydown — explicitly cycle Cancel ↔ Verwerfen.
  // Belt-and-suspenders alongside the focusin bounce; this prevents
  // the brief flicker where Modal-trap fires .focus() on inert background
  // before the focusin handler bounces back.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const active = document.activeElement;
      if (active === cancelRef.current && !e.shiftKey) {
        e.preventDefault();
        confirmRef.current?.focus();
      } else if (active === confirmRef.current && e.shiftKey) {
        e.preventDefault();
        cancelRef.current?.focus();
      } else if (active === cancelRef.current && e.shiftKey) {
        e.preventDefault();
        confirmRef.current?.focus();
      } else if (active === confirmRef.current && !e.shiftKey) {
        e.preventDefault();
        cancelRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handler, true /* capture */);
    return () => document.removeEventListener("keydown", handler, true);
  }, []);

  const bodyKey = ({
    "tab-switch": "confirmDiscardBodyTabSwitch",
    "modal-close": "confirmDiscardBodyModalClose",
    "locale-change": "confirmDiscardBodyLocaleChange",
    // R2 [P1 #2]: "imageCount-change" intent removed (structurally dead).
  } as const)[intent];

  return (
    <div
      ref={dialogRef}
      role="alertdialog"
      aria-labelledby="confirm-discard-title"
      aria-modal="false"  // intentional: outer Modal already has aria-modal=true
      className="absolute inset-0 z-10 bg-black/50 flex items-center justify-center"
    >
      <div className="bg-white rounded-lg p-6 max-w-md mx-4 shadow-xl">
        <h3 id="confirm-discard-title" className="text-lg font-semibold mb-2">
          {dashboardStrings.exportModal.confirmDiscardTitle}
        </h3>
        <p className="text-sm mb-4">
          {dashboardStrings.exportModal[bodyKey]}
        </p>
        <div className="flex gap-2 justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm border rounded"
          >
            {dashboardStrings.exportModal.confirmCancel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded"
          >
            {dashboardStrings.exportModal.confirmDiscard}
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## Modal Cleanup Effect Update

Existing `useEffect [open, item]` (line 168–179) muss erweitert werden:

```ts
useEffect(() => {
  if (open && item) {
    // ... existing resets (locale, imageCount, deState, frState, etc.)
    // NEW (S2b):
    setMode("preview");                  // DK-2: never sticky
    setConfirmDialog(null);              // clear any stale dialog
    setLayoutEditorIsDirty(false);       // mirror reset (LayoutEditor is unmounted)
    // discardKey NOT reset — LayoutEditor unmount + remount triggers
    // isFirstDiscardKey-ref reset internally.
  }
}, [open, item]);
```

---

## JSX Integration Sketch

Aktuelle Struktur (S2a-stand):
```
<Modal open={open} onClose={onClose}>
  <div>
    [Banners]
    [Locale fieldset]
    [imageCount fieldset]
    [Preview section: per-locale grid]
    [downloadError banner]
    [Action buttons]
  </div>
</Modal>
```

Neu (S2b):
```
<Modal open={open} onClose={guardedOnClose} disableClose={...||confirmDialog !== null}>
  <div className="relative">
    {/* `inert` on body wrapper while Confirm-Dialog open (Sonnet R1
        [Critical #1] + R2 [P2 #3]) — prevents Tab/click reaching
        background controls. React 19 + @types/react 19 type `inert` as
        boolean; the spec REQUIRES the form below (the previous `""`
        suggestion is a TS-strict error). When `false`, React omits the
        attribute entirely. Browser-support: Safari 15.4+, Chrome 102+,
        Firefox 112+. */}
    <div inert={confirmDialog !== null ? true : undefined}>
    [Banners]
    [Locale fieldset — onChange wired to guardedSetLocale]
    [imageCount fieldset — onChange wired to guardedSetImageCount via clamping wrapper.
     Input gets `disabled={downloading || mode === "layout"}` + `title={mode === "layout" ? imageCountDisabledLayoutMode : undefined}` per R1 [P2 #5].
     NOTE: dirty + preview + imageCount-change is still possible (user edits in layout, switches to preview,
     changes imageCount → confirm-dialog with intent="imageCount-change" still relevant).]

    {/* NEW: Tab-Switch — simplified WAI-ARIA tabs (Sonnet R0 [P2 #6]
        + R1 [P2 #4]). role="tablist" + role="tab" + aria-selected ist
        die korrekte tab-semantic. Bewusst NICHT implementiert: arrow-
        key navigation, role="tabpanel" wrapper, aria-controls wiring —
        2-tab admin tooling braucht das nicht und keine screen-reader-
        user-flow ist davon abhängig. Wenn Codex das flaggt: "simplified
        tabs without Arrow-key navigation — acceptable for admin
        tooling" als Antwort. */}
    <div role="tablist" aria-label={dashboardStrings.exportModal.tablistLabel} className="flex border-b">
      <button
        type="button"
        role="tab"
        aria-selected={mode === "preview"}
        onClick={() => guardedSetMode("preview")}
        className={mode === "preview" ? "border-b-2 ..." : "..."}
      >
        {dashboardStrings.exportModal.tabPreview}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "layout"}
        onClick={() => guardedSetMode("layout")}
        disabled={locale === "both"}
        title={locale === "both" ? dashboardStrings.exportModal.tabLayoutDisabledLocaleBoth : undefined}
        className={mode === "layout" ? "border-b-2 ..." : "..."}
      >
        {dashboardStrings.exportModal.tabLayout}
      </button>
    </div>

    {mode === "preview" ? (
      <>
        [Preview section: per-locale grid]
        [downloadError banner]
        [Action buttons]
      </>
    ) : (
      // mode === "layout" — guarded by tab-disabled when locale="both"
      // so locale here is always "de" | "fr".
      locale !== "both" && item && (
        <LayoutEditor
          itemId={item.id}
          locale={locale}
          imageCount={imageCount}
          onDirtyChange={handleDirtyChange}
          discardKey={discardKey}
        />
      )
    )}

    </div> {/* end inert body wrapper */}

    {/* NEW: ConfirmDialog overlay — OUTSIDE the inert wrapper so its
        own buttons remain interactive. */}
    {confirmDialog !== null && (
      <ConfirmDiscardDialog
        intent={confirmDialog.intent}
        onConfirm={handleConfirmDiscard}
        onCancel={handleConfirmCancel}
      />
    )}
  </div>
</Modal>
```

**Wichtig zu Modal-Schließen:** `disableClose={downloading || confirmDialog !== null}`
verhindert Escape/X-click auf der äußeren Modal solange Confirm-Dialog
offen ist. `guardedOnClose` (X-Button) wird zusätzlich confirm-dialog-
guarded falls dirty. Outside-click ist ebenfalls über `Modal`'s
`onClose` an `guardedOnClose` gewired.

---

## i18n Strings (`dashboardStrings.exportModal.*`)

```ts
exportModal: {
  // Tabs
  tablistLabel: "Anzeige-Modus",
  tabPreview: "Vorschau",
  tabLayout: "Layout anpassen",
  // R1 [P2 #5]: imageCount input disabled in layout mode → tooltip explains why
  imageCountDisabledLayoutMode:
    "Bild-Anzahl kann im Layout-Modus nicht geändert werden. Bitte zur Vorschau wechseln.",
  tabLayoutDisabledLocaleBoth:
    "Layout-Anpassung ist pro Sprache. Bitte DE oder FR wählen.",

  // Confirm-Dialog
  confirmDiscardTitle: "Ungesicherte Layout-Änderungen verwerfen?",
  confirmDiscardBodyTabSwitch:
    "Du wechselst den Tab — deine Layout-Änderungen würden verloren gehen.",
  confirmDiscardBodyModalClose:
    "Du schließt das Fenster — deine Layout-Änderungen würden verloren gehen.",
  confirmDiscardBodyLocaleChange:
    "Du wechselst die Sprache — die Layout-Änderungen für die aktuelle Sprache gehen verloren.",
  // R2 [P1 #2]: confirmDiscardBodyImageCountChange entfernt — intent dead.
  confirmCancel: "Abbrechen",
  confirmDiscard: "Verwerfen",
}
```

**Hinweis:** Existing `dashboardStrings.dirtyConfirm.*` bleibt unverändert. Das ist die generic Editor-Dirty-Confirm-Variante; das Export-Modal hat eigene Copy weil die Auslöser konkreter sind (Tab-Switch vs Locale-Switch vs Modal-Close).

**Total neu:** 11 keys (R0+R1+R2 net: +`tablistLabel` +`imageCountDisabledLayoutMode` −`confirmDiscardBodyImageCountChange`).

---

## Test-Cases (Vitest, `InstagramExportModal.test.tsx` — neu)

**Mock-Strategie (R0 [decision]):**
- `vi.doMock("./LayoutEditor", () => ({ LayoutEditor: MockLayoutEditor }))` — eine kontrollierbare Test-Komponente die props loggt UND einen Test-Knopf rendert um `onDirtyChange(true)` und `onDirtyChange(false)` zu simulieren.
- Verhindert dependency-explosion (sonst müsste der Test auch `dashboardFetch`-Mocks setzen, slide-cards rendern, etc.). S2a-Tests sind die Quelle der Wahrheit für Editor-Logic.

**Mock-Komponente (Skizze):**
```tsx
const layoutEditorPropsLog: any[] = [];
const MockLayoutEditor = (props: any) => {
  layoutEditorPropsLog.push({ ...props });
  return (
    <div data-testid="mock-layout-editor">
      <button
        data-testid="mock-trigger-dirty"
        onClick={() => props.onDirtyChange?.(true)}
      >
        trigger dirty
      </button>
      <button
        data-testid="mock-trigger-clean"
        onClick={() => props.onDirtyChange?.(false)}
      >
        trigger clean
      </button>
      <span data-testid="mock-discard-key">{props.discardKey}</span>
    </div>
  );
};
```

### Tests (13 cases — was 10, +1 for I-6b non-both locale switch per Sonnet R0 [P2 #8])

- **I-1** Initial render mit `mode="preview"` (DK-2). Layout-Tab sichtbar aber NICHT aktiv. LayoutEditor NICHT gemounted.
- **I-2** Click "Layout anpassen" → mode wird "layout" → MockLayoutEditor gemounted mit korrekten props (itemId, locale, imageCount, discardKey=0). Preview-Section NICHT sichtbar.
- **I-3** Click "Layout anpassen" während `locale="both"` → Button disabled, kein State-change, kein mount. Tooltip `title` attribute = `tabLayoutDisabledLocaleBoth`-Text.
- **I-4** isDirty-mirror (Sonnet R2 [P2 #5] — independent assertion, no cross-test reliance): render → switch zu Layout → click `mock-trigger-dirty` → trigger ein guarded-action das Confirm-Dialog öffnen MUSS wenn dirty=true (z.B. click „Vorschau" tab). Assert: ConfirmDialog rendert mit `confirmDiscardTitle` text → das beweist `layoutEditorIsDirty=true` wurde korrekt mirror'd. Click „Abbrechen" → ConfirmDialog verschwindet. Optional: click `mock-trigger-clean` → click „Vorschau" wieder → KEIN ConfirmDialog (dirty=false) → mode wechselt direkt. Verifiziert sowohl `(true)`- als auch `(false)`-Pfad des `handleDirtyChange`-Callbacks ohne Mid-Test-State-Carry.
- **I-5** Guarded tab-switch: in Layout-Tab + dirty → click "Vorschau" → Confirm-Dialog rendert mit `confirmDiscardBodyTabSwitch` body. NICHT direkt zu preview gewechselt.
- **I-6** Confirm-Dialog accept (tab-switch): aus I-5 Zustand → click "Verwerfen" → pendingAction läuft (mode wird "preview" → MockLayoutEditor unmountet), confirmDialog → null. **Sonnet R0 [Critical #2]:** assert NICHT via `mock-discard-key`-span (Editor ist nicht mehr im DOM). Stattdessen: assert via `layoutEditorPropsLog` (last entry vor unmount hatte `discardKey=1`) UND verify dass kein Confirm-Dialog re-fires bei subsequent re-mount in Layout-Tab (kein false-positive durch stale `layoutEditorIsDirty`). **Setup:** nach „Verwerfen" → click „Layout anpassen" wieder → assert: KEIN Confirm-Dialog rendert (weil `setLayoutEditorIsDirty(false)` explizit gefired wurde, siehe Critical #1 Fix), MockLayoutEditor mountet sofort.

- **I-6b** Confirm-Dialog accept (locale switch DE→FR, editor STAYS mounted): in Layout-Tab DE + dirty → click „FR" Locale-Radio → Confirm-Dialog rendert → click „Verwerfen". **Hier bleibt MockLayoutEditor gemounted** weil mode="layout" + locale="fr" valide ist. Assert: discardKey-span zeigt `1`, props-log hat einen entry mit locale="fr" + discardKey=1, kein subsequent confirm-dialog.
- **I-7** Confirm-Dialog cancel: aus I-5 Zustand → click "Abbrechen" → confirmDialog → null, mode bleibt "layout", discardKey unverändert (immer noch 0).
- **I-8** Guarded locale-switch zu "both" während mode="layout" + dirty: click "Beide" → Confirm-Dialog mit `confirmDiscardBodyLocaleChange` body. Click "Verwerfen" → BOTH locale="both" UND mode="preview" werden in einem Render gesetzt (special-case batch). LayoutEditor unmounted.
- **I-9** Guarded onClose: in Layout-Tab + dirty → click äußeren Modal-Close-Button → Confirm-Dialog mit `confirmDiscardBodyModalClose`. Click "Verwerfen" → onClose-prop fired (parent's prop, sichtbar via mock).
- **I-10** Modal-Cleanup auf reopen (DK-2): User in Layout-Tab → close (clean state, kein dirty-confirm) → re-open → mode === "preview" (NICHT layout). LayoutEditor NICHT gemounted obwohl vorher aktiv.

- **I-11** **(Sonnet R1 [P2 #3] regression-guard)** No-op-Click auf bereits aktiven Tab: in Layout-Tab + dirty → click „Layout anpassen" (= already active) → KEIN Confirm-Dialog rendert (next === mode early return), discardKey bleibt unverändert, dirty bleibt true, props-log keine zusätzliche mount-entry. Symmetrisch für Locale-Radio-Click: in Layout-Tab DE + dirty → click DE-Radio → kein Confirm-Dialog. Verhindert silent-discard-by-clicking-no-op-Bug.

- **I-12** **(Sonnet R1 [P2 #5] regression-guard)** ImageCount-Input disabled in Layout-Modus: switch zu Layout-Tab → assert imageCount-Input hat `disabled` attribute + `title` attribute = `imageCountDisabledLayoutMode`-Text. Switch zurück zu Preview → assert imageCount-Input ist enabled. Verhindert dass ein Refactor das `disabled={mode === "layout"}` wegoptimiert (wodurch der dead-code-imageCount-change-Pfad re-aktivierbar würde).

**Total:** 13 tests. Coverage der vollen Glue-Logic ohne Editor-internals.

---

## Test-Infrastructure

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

describe("InstagramExportModal × LayoutEditor integration", () => {
  let InstagramExportModal: typeof import("./InstagramExportModal").InstagramExportModal;
  let layoutEditorPropsLog: Array<Record<string, unknown>>;
  // **Sonnet R1 [P3 #6]:** describe-scope `let` so individual `it()`
  // bodies can call `mockMetadataFetch.mockResolvedValueOnce(...)`.
  // Block-scoping inside `beforeEach` would make the override
  // mechanism a ReferenceError.
  let mockMetadataFetch: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    layoutEditorPropsLog = [];

    // **Sonnet R0 [Critical #3]:** the modal's metadata-fetch (current
    // line ~195) fires on every open. Without a default fetch stub the
    // useEffect rejects/throws and tests have undefined async behavior.
    // Default response is a "loaded" shape with no warnings — individual
    // tests can override per-call via `mockMetadataFetch.mockResolvedValueOnce`.
    mockMetadataFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: true,
          slideCount: 3,
          availableImages: 3,
          imageCount: 0,
          warnings: [],
          contentHash: "deadbeef12345678",
          mode: "auto",
          layoutVersion: null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", mockMetadataFetch);

    vi.doMock("./LayoutEditor", () => ({
      LayoutEditor: (props: Record<string, unknown>) => {
        layoutEditorPropsLog.push({ ...props });
        return (
          <div data-testid="mock-layout-editor">
            <button
              data-testid="mock-trigger-dirty"
              onClick={() => (props.onDirtyChange as (d: boolean) => void)?.(true)}
            >
              trigger dirty
            </button>
            <button
              data-testid="mock-trigger-clean"
              onClick={() => (props.onDirtyChange as (d: boolean) => void)?.(false)}
            >
              trigger clean
            </button>
            <span data-testid="mock-discard-key">{String(props.discardKey)}</span>
          </div>
        );
      },
    }));
    ({ InstagramExportModal } = await import("./InstagramExportModal"));
  });

  afterEach(() => {
    cleanup();
    vi.resetModules();
    // **Sonnet R0 [P2 #7]:** unstub global fetch to prevent leak into
    // unrelated test files in the same vitest run.
    vi.unstubAllGlobals();
  });

  // Tests ...
});
```

**Existing InstagramExportModal-Modul-imports** (JSZip, Modal, instagram-post): NICHT mocken — sind tree-shake-safe und tests rendern keinen actual download. Fetch wird per `vi.stubGlobal` mit dem default-shape oben gemockt für die metadata-fetch (line 195 in current modal); per-test overrides via `mockMetadataFetch.mockResolvedValueOnce` möglich (describe-scope `let` macht den Reference im it()-body verfügbar).

**Sonnet R2 [P3 #6] (act-warnings):** Initial-Render der Modal triggert async metadata-fetch via `useEffect`. Tests MÜSSEN deshalb mit `await waitFor(() => expect(...).toBe(...))` warten bis der Fetch resolved hat, sonst RTL `act()`-warnings. Pattern:

```ts
render(<InstagramExportModal open={true} item={baseItem} onClose={onClose} />);
await waitFor(() =>
  expect(screen.getByRole("button", { name: "Vorschau" })).toBeTruthy()
);
// ... continue test
```

Alternativ: `await act(async () => { render(...); })` aber `waitFor` nach render ist die etablierte Convention im Projekt (siehe S2a `LayoutEditor.test.tsx` C-2 etc.).

---

## Manual Smoke Plan (DK-X1..X5 — Staging required vor prod-merge)

Auf Staging ausführen (https://staging.alit.hihuydo.com/dashboard/agenda/) mit echtem Login. Bei jedem Smoke: **Ergebnis dokumentieren** (Screenshot oder kurzer Text).

- **DK-X1** Layout speichern und persistieren:
  - Open InstagramExportModal für ein Item mit ≥3 Body-Blöcken
  - Tab "Layout anpassen" → click "Nächste Slide →" auf erstem Block
  - Click "Speichern" → grüner Status (refetch fired)
  - Modal schließen + neu öffnen → wieder Layout-Tab → editierter Stand sichtbar (mode="manual", layoutVersion non-null im DB-Hex via SQL)
- **DK-X2** Stale-banner nach Body-Edit:
  - DK-X1-Ausgangslage (manual-override existiert)
  - Body des Items via Journal-Editor ändern (z.B. Block hinzufügen)
  - Zurück zum Agenda-Item, Modal öffnen, Layout-Tab → Stale-Banner sichtbar mit „Reset"-Button
  - Click Reset → Auto-Layout angezeigt, mode wieder "auto"
- **DK-X3** 412 layout_modified across two tabs:
  - Tab 1: Modal offen, Layout-Tab, edit + Save (200, neue layoutVersion)
  - Tab 2 (zweiter Browser-Tab gleicher Login): selbes Item öffnen, Layout-Tab, edit + Save (200)
  - Tab 1: weitere edit + Save → 412-Banner mit "layout_modified"-message, Save-Button bleibt enabled für retry
- **DK-X4** too_many_slides_for_grid (client-side validation):
  - Item mit ≥10 Body-Blöcken + `imageCount=1` (grid aktiv)
  - Layout-Tab → 9× "Neue Slide ab hier" auf Block 2 jeweils, bis 10 Slides existieren
  - Click "Speichern" → Banner „Bei aktivem Bild-Grid maximal 9 Text-Slides" rendert, KEIN PUT (verifiziert via Network-Tab)
- **DK-X5** Confirm-Dialog → Discard → Locale-Switch:
  - Layout-Tab DE, edit → dirty
  - Click Locale-Radio "FR" → Confirm-Dialog mit Body „die Layout-Änderungen für die aktuelle Sprache gehen verloren"
  - Click „Verwerfen" → Locale switcht zu FR, fresh GET für FR fired (Network-Tab), Editor zeigt FR-Layout

---

## Risk Surface

| Risiko | Mitigation |
|---|---|
| `onDirtyChange` callback identity-flip → infinite useEffect-loop in LayoutEditor | `useCallback([])` mit empty deps — setState-funktionen sind referenz-stable. Test I-4 verifiziert dass dirty-mirror korrekt funktioniert ohne Loop. |
| Escape-Key auf Confirm-Dialog leakt zu äußerer Modal → onClose direkt | Capture-phase Escape-handler in `ConfirmDiscardDialog` mit `stopPropagation()`. KEIN Test in S2b (würde JSDOM-event-handling diktieren); manueller Smoke deckt es. |
| Confirm-Dialog open + outer Modal `disableClose={confirmDialog !== null}` race | `disableClose` ist explizit gewired. Confirm-Dialog rendert ÜBER der Modal-Body via `absolute inset-0`. Outer Modal-X click ist einfach disabled solange Confirm-offen. |
| `pendingAction`-closure staleness (z.B. `setMode(next)` mit veraltetem `next`) | Closure capture ist React-state-update-safe — `setMode` ist ein dispatcher und `next` ist beim Time-of-create-Closure schon resolved. |
| Special-case `locale="both"` + `mode="layout"` race: setLocale + setMode in one batch | Zusammen in der `apply`-closure. React 19 batched-updates garantiert single-render. Test I-8 verifiziert. |
| `discardKey` im Cleanup nicht resetted → drift nach mehreren Open/Close-Zyklen | LayoutEditor wird unmounted bei mode!=layout. Beim re-mount ist `isFirstDiscardKey.current=true` → erste discardKey-Wert wird ignoriert. Numerischer overflow nach 2^53 increments → not a real concern. |
| MockLayoutEditor in Tests divergent von echtem LayoutEditor | S2a-Tests sind die source of truth für Editor-internals. S2b-Tests testen NUR die Wiring (props in/out), nicht das Editor-verhalten. Wenn echter Editor seine onDirtyChange-Signatur ändert → S2a-Test-Failure würde es vor S2b-Tests fangen. |

**Blast Radius:** MEDIUM. Modal ist Content-Editor-Tooling — nicht User-facing prod feature. Bug würde Admin-UX brechen, nicht Reader-Site. Worst case: Confirm-dialog feuert nicht / feuert falsch → Admin verliert ungespeicherte Layout-Edits. Mitigation: Manueller Staging-Smoke vor prod-merge ist Pflicht (DK-X5 ist genau dieser Pfad).

---

## Implementation Order

1. i18n-Strings im `exportModal`-namespace ergänzen
2. State-Additions in `InstagramExportModal.tsx` (mode, discardKey, layoutEditorIsDirty, confirmDialog)
3. Cleanup-Effekt erweitern (DK-2, DK-9)
4. `handleDirtyChange` + Guarded-Handlers + Confirm-accept/cancel
5. `ConfirmDiscardDialog`-Komponente inline
6. JSX: Tab-Switch + conditional preview/layout render + Confirm-Dialog overlay
7. Wire existing locale/imageCount onChange via `guardedSetLocale` / `guardedSetImageCount`
8. Modal `onClose` → `guardedOnClose`, `disableClose` extension
9. Vitest-Tests (`InstagramExportModal.test.tsx` neu, 13 cases)
10. `pnpm test` + `pnpm exec tsc --noEmit` + `pnpm lint`
11. Push → Sonnet pre-push gate
12. Codex PR-review (Round 1)
13. **Manueller Staging-Smoke** (DK-X1..X5) — User signoff erforderlich
14. Merge nach explizitem User-Go
15. Post-merge prod-deploy verified

---

## Notes

- Spec bewusst kompakt (~700 Zeilen vs S2a ~1000) weil S2a die schwere Editor-Logic gemacht hat. S2b ist reines Glue + Confirm-UX.
- Keine neuen Pure-Helpers nötig — alle State-Operationen sind component-local.
- Keine Pattern-Änderungen erforderlich (`patterns/admin-ui-forms.md` deckt das Confirm-Dialog-Pattern bereits ab).
- S2c (falls jemals nötig): Drag-and-drop Block-Reorder, Per-Block-Live-PNG-Preview, Override-Audit-Log-Viewer. Aktuell out of scope.
