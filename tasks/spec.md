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
6. **DK-6**: `confirmDialog: { open: boolean; intent: ConfirmIntent; pendingAction: () => void } | null` State. Confirm-Dialog komponente (inline overlay innerhalb Modal-Body, NICHT portal — vermeidet zwei `aria-modal=true`).
7. **DK-7**: Guarded set-handlers für `setMode`, `setLocale`, `setImageCount`, und `onClose` (Modal-X + outside-click). Wenn `layoutEditorIsDirty` → Confirm-Dialog öffnet mit closure-captured `pendingAction`.
8. **DK-8**: Special-case `guardedSetLocale("both")` während `mode === "layout"`: `pendingAction` batches `setMode("preview")` UND `setLocale("both")` (vermeidet perpetual-loading-state weil `LayoutEditor` `locale="both"` nicht akzeptiert).
9. **DK-9**: Modal-Cleanup-Effekt: bei `open: false` reset `mode → "preview"`, `confirmDialog → null`, `layoutEditorIsDirty → false`. `discardKey` muss NICHT resetted werden (LayoutEditor wird unmounted, `isFirstDiscardKey`-ref ist beim nächsten mount wieder true).
10. **DK-10**: i18n-Strings unter `dashboardStrings.exportModal.*` (neu — Modal hatte vorher keine i18n). Mindestens: `tabPreview`, `tabLayout`, `tabLayoutDisabledLocaleBoth`, `confirmDiscardTitle`, `confirmDiscardBodyTabSwitch`, `confirmDiscardBodyModalClose`, `confirmDiscardBodyLocaleChange`, `confirmDiscardBodyImageCountChange`, `confirmCancel`, `confirmDiscard`. (Existing `dashboardStrings.dirtyConfirm.*` bleibt unverändert — dieses Modal hat seine eigene Copy.)
11. **DK-11**: Vitest-Integration-Tests in `InstagramExportModal.test.tsx` (NEU — File existiert noch nicht). 8-12 Tests cover: tab-switch glue, isDirty-mirror, discardKey-bump, confirm-dialog open/close, guarded handlers (4 varianten), locale="both"-special-case, modal-cleanup. **WICHTIG:** Tests mocken den `LayoutEditor`-import auf eine kontrollierbare Test-Komponente (`vi.doMock`) — sonst dependency-explosion mit dashboardFetch + Slide-Card-DOM. S2a-Tests bleiben die Quelle der Wahrheit für Editor-Logic.
12. **DK-12**: 5 manuelle DK-X1..X5 Staging-Smokes nach merge-to-main + staging-deploy verified. Smoke-Liste in §Manual Smoke Plan.

**Done-Definition (zusätzlich zu Standard):**
- Manueller Staging-Smoke vom User signed-off bevor prod-merge

---

## File Changes

### NEU
- `src/app/dashboard/components/InstagramExportModal.test.tsx` (~280 Zeilen) — Vitest-Integration-Tests mit mocked LayoutEditor

### MODIFY
- `src/app/dashboard/components/InstagramExportModal.tsx` (~593 → ~750 Zeilen) — neue State (`mode`, `discardKey`, `layoutEditorIsDirty`, `confirmDialog`), guarded handlers, Tab-Switch JSX, ConfirmDialog-Komponente inline, LayoutEditor-Render im Layout-Tab, Cleanup-Effekt-Erweiterung
- `src/app/dashboard/i18n.tsx` — neuer `exportModal` Namespace (10 keys minimum)

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

type ConfirmIntent =
  | "tab-switch"
  | "modal-close"
  | "locale-change"
  | "imageCount-change";

type ConfirmDialogState = {
  open: boolean;
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
  if (!layoutEditorIsDirty) {
    setMode(next);
    return;
  }
  setConfirmDialog({
    open: true,
    intent: "tab-switch",
    pendingAction: () => setMode(next),
  });
}, [layoutEditorIsDirty]);

const guardedSetImageCount = useCallback((next: number) => {
  if (!layoutEditorIsDirty) {
    setImageCount(next);
    return;
  }
  setConfirmDialog({
    open: true,
    intent: "imageCount-change",
    pendingAction: () => setImageCount(next),
  });
}, [layoutEditorIsDirty]);

const guardedOnClose = useCallback(() => {
  if (!layoutEditorIsDirty) {
    onClose();
    return;
  }
  setConfirmDialog({
    open: true,
    intent: "modal-close",
    pendingAction: onClose,
  });
}, [layoutEditorIsDirty, onClose]);
```

### `guardedSetLocale` — special case für "both"

```ts
const guardedSetLocale = useCallback((next: LocaleChoice) => {
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
    open: true,
    intent: "locale-change",
    pendingAction: apply,
  });
}, [layoutEditorIsDirty, mode]);
```

### Confirm-Dialog accept/cancel

```ts
const handleConfirmDiscard = useCallback(() => {
  if (!confirmDialog) return;
  // 1. Bump discardKey BEFORE running pendingAction so LayoutEditor's
  //    discardKey-effect fires with the current serverState (still
  //    mounted at this point — pendingAction may unmount it).
  setDiscardKey((k) => k + 1);
  // 2. Run the captured action (setMode, setLocale, setImageCount, onClose).
  confirmDialog.pendingAction();
  // 3. Close dialog. setLayoutEditorIsDirty resets via discardKey-revert
  //    in LayoutEditor → onDirtyChange(false) → mirror update — no
  //    explicit reset here.
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

  const bodyKey = ({
    "tab-switch": "confirmDiscardBodyTabSwitch",
    "modal-close": "confirmDiscardBodyModalClose",
    "locale-change": "confirmDiscardBodyLocaleChange",
    "imageCount-change": "confirmDiscardBodyImageCountChange",
  } as const)[intent];

  return (
    <div
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
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm border rounded"
          >
            {dashboardStrings.exportModal.confirmCancel}
          </button>
          <button
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
<Modal open={open} onClose={guardedOnClose} disableClose={...||confirmDialog?.open}>
  <div className="relative"> {/* relative für ConfirmDialog absolute overlay */}
    [Banners]
    [Locale fieldset — onChange wired to guardedSetLocale]
    [imageCount fieldset — onChange wired to guardedSetImageCount]

    {/* NEW: Tab-Switch */}
    <div className="flex border-b">
      <button
        type="button"
        onClick={() => guardedSetMode("preview")}
        className={mode === "preview" ? "border-b-2 ..." : "..."}
        aria-current={mode === "preview" ? "page" : undefined}
      >
        {dashboardStrings.exportModal.tabPreview}
      </button>
      <button
        type="button"
        onClick={() => guardedSetMode("layout")}
        disabled={locale === "both"}
        title={locale === "both" ? dashboardStrings.exportModal.tabLayoutDisabledLocaleBoth : undefined}
        className={mode === "layout" ? "border-b-2 ..." : "..."}
        aria-current={mode === "layout" ? "page" : undefined}
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

    {/* NEW: ConfirmDialog overlay */}
    {confirmDialog?.open && (
      <ConfirmDiscardDialog
        intent={confirmDialog.intent}
        onConfirm={handleConfirmDiscard}
        onCancel={handleConfirmCancel}
      />
    )}
  </div>
</Modal>
```

**Wichtig zu Modal-Schließen:** `disableClose={downloading || confirmDialog?.open}`
verhindert Escape/X-click auf der äußeren Modal solange Confirm-Dialog
offen ist. `guardedOnClose` (X-Button) wird zusätzlich confirm-dialog-
guarded falls dirty. Outside-click ist ebenfalls über `Modal`'s
`onClose` an `guardedOnClose` gewired.

---

## i18n Strings (`dashboardStrings.exportModal.*`)

```ts
exportModal: {
  // Tabs
  tabPreview: "Vorschau",
  tabLayout: "Layout anpassen",
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
  confirmDiscardBodyImageCountChange:
    "Die Änderung der Bild-Anzahl invalidiert das Layout — deine Änderungen gehen verloren.",
  confirmCancel: "Abbrechen",
  confirmDiscard: "Verwerfen",
}
```

**Hinweis:** Existing `dashboardStrings.dirtyConfirm.*` bleibt unverändert. Das ist die generic Editor-Dirty-Confirm-Variante; das Export-Modal hat eigene Copy weil die Auslöser konkreter sind (Tab-Switch vs Locale-Switch vs Modal-Close).

**Total neu:** 10 keys.

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

### Tests (10 cases)

- **I-1** Initial render mit `mode="preview"` (DK-2). Layout-Tab sichtbar aber NICHT aktiv. LayoutEditor NICHT gemounted.
- **I-2** Click "Layout anpassen" → mode wird "layout" → MockLayoutEditor gemounted mit korrekten props (itemId, locale, imageCount, discardKey=0). Preview-Section NICHT sichtbar.
- **I-3** Click "Layout anpassen" während `locale="both"` → Button disabled, kein State-change, kein mount. Tooltip `title` attribute = `tabLayoutDisabledLocaleBoth`-Text.
- **I-4** isDirty-mirror: switch zu Layout → click `mock-trigger-dirty` → Internes State `layoutEditorIsDirty=true`. (Verifiziert via subsequent guarded-handler-Verhalten in I-5.)
- **I-5** Guarded tab-switch: in Layout-Tab + dirty → click "Vorschau" → Confirm-Dialog rendert mit `confirmDiscardBodyTabSwitch` body. NICHT direkt zu preview gewechselt.
- **I-6** Confirm-Dialog accept: aus I-5 Zustand → click "Verwerfen" → discardKey++ (von 0 auf 1, sichtbar im `mock-discard-key`-span), pendingAction läuft (mode wird "preview"), confirmDialog → null. Edit ist verworfen (mock fired onDirtyChange(false) via discardKey-effect).
- **I-7** Confirm-Dialog cancel: aus I-5 Zustand → click "Abbrechen" → confirmDialog → null, mode bleibt "layout", discardKey unverändert (immer noch 0).
- **I-8** Guarded locale-switch zu "both" während mode="layout" + dirty: click "Beide" → Confirm-Dialog mit `confirmDiscardBodyLocaleChange` body. Click "Verwerfen" → BOTH locale="both" UND mode="preview" werden in einem Render gesetzt (special-case batch). LayoutEditor unmounted.
- **I-9** Guarded onClose: in Layout-Tab + dirty → click äußeren Modal-Close-Button → Confirm-Dialog mit `confirmDiscardBodyModalClose`. Click "Verwerfen" → onClose-prop fired (parent's prop, sichtbar via mock).
- **I-10** Modal-Cleanup auf reopen (DK-2): User in Layout-Tab → close (clean state, kein dirty-confirm) → re-open → mode === "preview" (NICHT layout). LayoutEditor NICHT gemounted obwohl vorher aktiv.

**Total:** 10 tests. Coverage der vollen Glue-Logic ohne Editor-internals.

---

## Test-Infrastructure

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

describe("InstagramExportModal × LayoutEditor integration", () => {
  let InstagramExportModal: typeof import("./InstagramExportModal").InstagramExportModal;
  let layoutEditorPropsLog: Array<Record<string, unknown>>;

  beforeEach(async () => {
    vi.resetModules();
    layoutEditorPropsLog = [];
    vi.doMock("./LayoutEditor", () => ({
      LayoutEditor: (props: Record<string, unknown>) => {
        layoutEditorPropsLog.push({ ...props });
        // ... mock JSX as above
      },
    }));
    // Modal might also need stubs (Modal-component itself just renders children)
    ({ InstagramExportModal } = await import("./InstagramExportModal"));
  });

  afterEach(() => {
    cleanup();
    vi.resetModules();
  });

  // Tests ...
});
```

**Existing InstagramExportModal-Modul-imports** (JSZip, Modal, instagram-post): NICHT mocken — sind tree-shake-safe und tests rendern keinen actual download. Fetch wird per `vi.stubGlobal` gemockt für die metadata-fetch (line 195 in current modal).

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
| Confirm-Dialog open + outer Modal `disableClose={confirmDialog?.open}` race | `disableClose` ist explizit gewired. Confirm-Dialog rendert ÜBER der Modal-Body via `absolute inset-0`. Outer Modal-X click ist einfach disabled solange Confirm-offen. |
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
9. Vitest-Tests (`InstagramExportModal.test.tsx` neu, 10 cases)
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
