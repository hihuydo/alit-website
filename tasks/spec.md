# Spec: Agenda Per-Image Crop Modal — Sprint 2
<!-- Created: 2026-04-27 -->
<!-- Author: Planner (Claude) -->
<!-- Status: Draft v12 — Sonnet R1-R10 + Codex-Spec-R1 (74 findings total) eingearbeitet -->
<!-- Sonnet R10 fixes (6 FAIL + 3 advisory): [FAIL] #1 Preview-Container = Pan-Drag-Container = EIN single <div> (sonst 2 nested divs → drag-math broken); [FAIL] #2 cleaned.push() MUSS REPLACE existing call (sonst doppelte Image-Entries in DB); [FAIL] #3 Live-preview-test als eigener AgendaSection-Bullet (5→6 Tests, 46→47 total); [FAIL] #4 Drag-reorder konkrete Assertion (mockDataTransfer.setData verifiziert, NICHT not.toThrow()); [FAIL] #5 Resize-invalidation konkrete Pixel-Assertion (frameWidth = 120 → 60 für 320×180 fixture); [FAIL] #6 vi.mock-Strategie: top-level mock für AgendaItem mit pflicht-Verifikation der existing tests; advisory A: cw===0 guard auch in onPointerMove (Symmetry mit onKeyDown); advisory B: prevOpen-Tracking entfernt (dead code unter conditional-rendering); advisory C: Test #2 mutation-assertion-Mechanismus präzisiert (re-open + data-attr persistence). -->
<!-- Sonnet R9 fixes (3 FAIL + 2 advisory): [FAIL] #1 AgendaItem.images inline-type line 39 erweitern (TS strict blockt sonst openEdit's img.cropX-read); [FAIL] #2 CropModal img.src trailing-slash test-assertion (sonst broken-URL silent green); [FAIL] #3 Y numeric-input empty-string-guard sub-assertion (X hatte sub-assertion, Y nicht — silent axis-divergence); advisory A: CropModal test-count Formel-Aufschlüsselung entfernt (per-file 10+5+2+20+5+2+2=46 ist canonical), B: defensive index-bound-check `cropModalIndex < form.images.length` in conditional-render. -->
<!-- Sonnet R8 fixes (4 FAIL + 3 advisory): [FAIL] #1 numeric input empty-string-guard (Number("")===0 würde state auf 0 snappen statt preserve); [FAIL] #2 SVG aria-hidden="true" auf Crop-Icon (sonst Screen-Reader Doppel-announce); [FAIL] #3 previewItem useMemo line 326 in Files-to-Change explizit + Live-Preview-Test (sonst Live-Preview rendert immer 50/50); [FAIL] #4 handleCropSave functional-updater-purity (Index VOR setForm capturen, StrictMode-safe); advisory A: Lucide Crop-SVG-Markup explizit, B: DirtyContext "Reference-Equality" → JSON.stringify-value-diff, C: clamp module-level statt im Component-Body. -->
<!-- Sonnet R7 fixes (3 FAIL + 3 advisory): [FAIL] #1 Files-to-Change table test counts (9→10, 4→5, 12+→20) reconciled mit body/DK-2; [FAIL] #2 imgRef.current!.getBoundingClientRect() non-null assertion (TS strict-mode narrowt nicht durch JSX-conditional); [FAIL] #3 Vollständiger onKeyDown-Handler-Code in Req 10 (fresh getBoundingClientRect + xHasRoom/yHasRoom in handler-scope, sonst frozen-axis-gate fehlt oder stale); advisory: image src URL `/api/media/${public_id}/`, smoke-test line 438 reworded, header +45 → +46. -->
<!-- Codex-Spec-R1 fixes (3 blockers): [Contract] #1 spec/todo internal consistency — Adjust-State-During-Render canonical pattern + test count reconciled to +46 across body/test-plan/DK-2 + nested-modal stack-safety language purged from todo.md; [Correctness] #1+#2 Req 5a hinzugefügt — silent-data-loss bei unrelated-edits via ImageDraft/openEdit/handleSave whitelist + End-to-End regression test; [Architecture] #1 Req 6 Resize-Invalidation Hook (forceRerender on window-resize/orientationchange) — sonst stale frame overlay nach viewport-change. -->
<!-- Sonnet R6 fixes (6 FAIL + 2 advisory): #1 +2 [id]/route.test.ts in test-plan-checklist, #2 +4→+5 AgendaItem.test.tsx count, #3 9→10 agenda-images.test.ts count, #4 Arrow-Keys gated by xHasRoom/yHasRoom (sonst silent state-corruption), #5 onPointerDown gated by imgLoaded (sonst NaN/silent-API-400), #6 CropModal-Mock konkretes Interface in Files-Table, advisory: useMemo-vs-inline render, mock-only test strategy -->

## Summary

User kann pro Bild im Agenda-Slot-Grid den sichtbaren Ausschnitt (`object-position`) selbst wählen. Implementation: zwei optionale Felder `cropX, cropY` (jeweils 0..100, default 50) auf `AgendaImage` in JSONB. Public-Renderer leitet `object-position: {cropX}% {cropY}%` ab. Dashboard bekommt einen kleinen Crop-Icon-Button (oben-links auf jedem filled Slot, neben dem ✕ oben-rechts), der ein Modal über der inline Edit-Form öffnet mit grossem Original-Bild-Preview, semi-transparenter 2:3-Frame-Overlay, Pan-Drag um den Frame zu verschieben, numerischen X/Y-Inputs für Tastatur-A11y und einem Reset-Button. Stack-Safety ist trivial: Edit-Form ist inline `<div>` (kein Modal), CropModal ist der einzige Modal — Escape closet nur CropModal, Focus kehrt deterministisch zum Crop-Button zurück.

## Context

### Current State

- `AgendaImage` Type in `src/lib/agenda-images.ts:3-9` trägt `{public_id, orientation, width?, height?, alt?}`. Re-exportiert von `src/components/AgendaItem.tsx`.
- Public-Renderer in `src/components/AgendaItem.tsx:175-202` (Single-Image) und `:215-235` (Multi-Image-Grid) rendert `<img>` mit hartkodiertem `style={{ objectFit: "cover" }}` (Letterbox wurde in PR #122 entfernt). `object-position` ist nicht gesetzt → default `50% 50%`.
- Dashboard-Editor `AgendaSection.tsx:778-846` rendert Slot-Grid (60px Cells, semi-transparente borders). Filled-Slots haben `<img>` + ✕-Remove-Button oben-rechts. **Click-on-filled-Slot ist No-Op** (vermeidet Drag/Click-Konflikt). `draggable=true` für Reorder, `onDragStart` setzt `text/slot-index`.
- API POST + PUT in `src/app/api/dashboard/agenda/route.ts` und `[id]/route.ts` validieren `images` via `validateImages()` (Range-Check für width/height, dedupe per public_id, media-table-existence-check).
- Modal-Primitive `src/app/dashboard/components/Modal.tsx` unterstützt `disableClose` für stack-safe nested-modal-Pattern (PR #53 Lesson). Escape-Handler ist live-readable über `disableCloseRef` (sync-during-render mutation).
- **Wichtig**: `AgendaSection.tsx` rendert das Edit-Formular **INLINE** als `<div>` (controlled by `showForm = creating || !!editing`, line 876+898) — **NICHT** wrapped in `<Modal>`. Stack-Safety zwischen CropModal und Edit-Form ist daher trivial: das Inline-Form hat keinen Esc-Handler, also fängt nur CropModal die Esc ab. Kein `disableClose` an irgendeinem Parent nötig (Sonnet-Spec-R2 [Critical] #1).
- Existing Pan-Drag-Pattern: keiner. HTML5-DragGesture mit Pan ist neu im Codebase.

### Architektur-Nachbarschaft

- `JournalSection.tsx` und ähnliche Editor-Modals nutzen `<Modal>` parent, kein nested-modal-Pattern aktiv im Repo. Wir sind die ersten.
- `RichTextEditor.tsx` öffnet `MediaPicker` als Sibling-Modal (über `setShowMediaPicker(true)` Toggle), aber NICHT mit `disableClose` Stack-Pattern — es ist eher serieller Open/Close.
- `DirtyContext` snapshottet `form.images` automatisch — `cropX/cropY`-Änderungen schlagen via `JSON.stringify(form) !== initialFormRef.current` (`AgendaSection.tsx:~877`) automatisch in DirtyContext durch, weil `handleCropSave` `setForm` mit neuem Object-Reference aufruft (kein separater Hook nötig). Sonnet-R8 advisory B: ältere Beschreibung sagte „Reference-Equality" — die Codebase nutzt aber JSON.stringify-value-diff, was funktional dasselbe Ergebnis liefert.

### Referenzen

- `CLAUDE.md`, `memory/project.md` — Stack + Auth-Architektur
- `memory/todo.md` Sprint-2-Block — Voraussetzungs-Checkliste aus Codex Sprint-1-Spec-SPLIT-RECOMMENDED
- `patterns/api.md` — Partial-PUT `!== undefined`, validation in JSONB
- `patterns/react.md` — Modal-Parent-Callback-Stability (lessons.md 2026-04-19), nested-modal Escape-Disambiguation
- `patterns/admin-ui.md` — Modal-onClose Stable-Callback, Dirty-Editor Snapshot-Diff
- `patterns/typescript.md` — Strikte Type-Guards (kein parseInt-Trap), `typeof + Number.isInteger + range-check`
- Sprint 1 spec ist gemerged (PR #121 + #122) → diese Datei überschreibt Sprint 1 spec safely.

## Requirements

### Must Have (Sprint Contract)

1. **`AgendaImage`-Typ erweitert** — `cropX?: number` und `cropY?: number` (jeweils optional, 0..100 inklusive, integer ODER fraction OK aber `Number.isFinite` check). `src/lib/agenda-images.ts:3-9` ergänzt. Re-Export via `src/components/AgendaItem.tsx` bleibt automatisch.

2. **`validateImages()` Range-Check + Output-Write** — Algorithm in dieser exakten Reihenfolge (Sonnet-Spec-R1 [Critical] #3 — null-coerce-vor-Type-Check):
   ```ts
   // Step 1: null/undefined coerce VOR type-check.
   // Beide Fehler nutzen exakt diesen String — Tests asserten /crop value out of range/i
   // (Sonnet-Spec-R3 #7: kein "Y coordinate invalid" oder andere Variante).
   if (img.cropX === undefined || img.cropX === null) { /* skip → omit from output */ }
   else if (typeof img.cropX !== "number" || !Number.isFinite(img.cropX) || img.cropX < 0 || img.cropX > 100) {
     return { ok: false, error: "crop value out of range" };
   }
   // analog für cropY mit identischem error-string "crop value out of range"
   ```
   **Pflicht: validierte Werte landen im Output** (Sonnet-Spec-R1 [Critical] #1 — sonst silent-discard). **Sonnet-R10 [FAIL] #2 — der bestehende `cleaned.push({ public_id: publicId, orientation, width, height, alt })` Aufruf am Ende der for-Loop in `agenda-images.ts:~41` MUSS REPLACED werden (nicht supplemented). Add-statt-Replace würde jedes Bild zweimal in `cleaned` einfügen → DB-Korruption + 20-image-cap inkonsistent zur loop-cap.**
   ```ts
   const validatedCropX = (img.cropX === undefined || img.cropX === null) ? undefined : img.cropX;
   const validatedCropY = (img.cropY === undefined || img.cropY === null) ? undefined : img.cropY;
   // REPLACE the existing cleaned.push (NOT add a second one):
   cleaned.push({ public_id, orientation, width, height, alt, cropX: validatedCropX, cropY: validatedCropY });
   ```
   **Auch der `raw` Parameter-Type von `validateImages()` muss erweitert werden** (Sonnet-Spec-R1 [Med] #7) — `cropX?: number | null; cropY?: number | null` an die Inline-Type-Definition.
   Test-Coverage explizit für: cropX=50/cropY=50 valid (UND output enthält die Werte!), cropX=-1 reject, cropX=101 reject, cropX="50" reject (parseInt-Trap-Regression), cropX=0 valid + im output (boundary), cropX=100 valid + im output (boundary), cropX=33.33 valid + im output (fraction), beide undefined → output ohne cropX/cropY (= preserve), **cropX=null → output ohne cropX (= preserve, kein 400)**, **cropY=null → output ohne cropY** (Sonnet-Spec-R5 #7 — symmetry-coverage).

3. **Public Renderer wendet `object-position` an** — `src/components/AgendaItem.tsx`: bei jedem `<img>` (Single-Image-Branch + Multi-Image-Grid) wird `objectPosition: \`${cropX ?? 50}% ${cropY ?? 50}%\`` zusätzlich zu `objectFit: "cover"` gesetzt. Test-Coverage: 4 Branches (Single/Multi × default/custom-crop). Default-Branch asserted `objectPosition` als `"50% 50%"` (nicht `undefined` — explizit für CSS-Determinismus).

4. **DB-Layer durchreicht cropX/cropY** — `src/lib/queries.ts` getAgendaItems mapping leitet `img.cropX` und `img.cropY` defensiv durch (`typeof === "number" && Number.isFinite ? value : undefined`). Test in `queries-agenda.test.ts` für Pass-Through + Legacy-Row (img ohne crop-Felder → undefined).

5. **Dashboard Crop-Icon-Button auf filled Slot** — `AgendaSection.tsx`: kleiner Crop-Icon-Button oben-links auf jedem `slot-filled-${i}` (analog zum existing ✕ oben-rechts). Inline-SVG (Crop-Icon, Lucide-style), `aria-label={t.crop.openModal}`, `data-testid="crop-${i}"`, `type="button"`. Click triggert `setCropModalIndex(i)`. Button stoppt nicht den parent draggable (= keine `e.stopPropagation()` auf click — drag funktioniert weiterhin auf restlicher Slot-Fläche).
   - **SVG-Element MUSS `aria-hidden="true"`** (Sonnet-R8 [FAIL] #2 — Button trägt `aria-label`, ohne aria-hidden auf SVG hört Screen-Reader doppelt: button-label + svg-content. Matched PR #109 MediaSection-Convention).
   - **SVG-Markup-Spec** (Sonnet-R8 advisory A — sonst implementation-drift):
     ```tsx
     <svg
       width="16"
       height="16"
       viewBox="0 0 24 24"
       stroke="currentColor"
       strokeWidth={2}
       fill="none"
       aria-hidden="true"
     >
       {/* Lucide Crop icon path: 2 corner brackets bildend ein Rechteck */}
       <path d="M6.13 1L6 16a2 2 0 0 0 2 2h15" />
       <path d="M1 6.13L16 6a2 2 0 0 1 2 2v15" />
     </svg>
     ```
   - **Test-Assertion in AgendaSection.test.tsx Crop-Icon-Button-Test**: `expect(cropBtn.querySelector("svg")).toHaveAttribute("aria-hidden", "true")`.

5a. **Dashboard Form-State PFLICHT erweitert für persisted-crop preserve** (Codex-Spec-R1 [Correctness] #1+#2 + Sonnet-R8 [FAIL] #3 — silent-data-loss-Risiko bei unrelated-edits + live-preview-mismatch bei live-preview-Mapping):
    - `interface ImageDraft` (`AgendaSection.tsx:49`) MUSS um `cropX?: number; cropY?: number` erweitert werden — sonst werden crop-Felder beim Form-Hydration verworfen.
    - `interface AgendaItem` images-inline-type (`AgendaSection.tsx:39`) MUSS ebenfalls um `cropX?: number; cropY?: number` erweitert werden (Sonnet-R9 [FAIL] #1 — dieser Type ist NICHT `AgendaImage[]` sondern eigene inline-shape; ohne diese Erweiterung wirft TS strict-mode in `openEdit()` `img.cropX`-Read und blockt pre-commit `tsc --noEmit`. `previewItem` useMemo's images-Field needs same shape).
    - `openEdit()` Image-Mapping (`AgendaSection.tsx:180-186`) MUSS `cropX: img.cropX, cropY: img.cropY` durchreichen — sonst load aus DB cropX=20 → form.images[0].cropX=undefined → Save sendet undefined → API persists undefined → DB-Row verliert crop.
    - **DREI Stellen MUSS aktualisiert werden** (Sonnet-R8 [FAIL] #3 — line 326 ist NICHT die handleSave-payload, sondern der live-preview-`useMemo`; Verwirrung war "326+533" als wären beides Save-Pfade):
      - **(a) `previewItem` useMemo Image-Mapping (`AgendaSection.tsx:~326`, der `useMemo([showPreview, form, editingLocale])` Block)**: MUSS `cropX: img.cropX, cropY: img.cropY` durchreichen — sonst rendert Live-Preview-Panel im Dashboard immer `objectPosition: 50% 50%` egal was User gesetzt hat (Visual-Mismatch zwischen Live-Preview und tatsächlichem Public-Render).
      - **(b) `handleSave()` POST-Payload (`AgendaSection.tsx:~533`, der `creating`-branch)**: MUSS `cropX: img.cropX, cropY: img.cropY` durchreichen.
      - **(c) `handleSave()` PUT-Payload (zweite handleSave-Stelle, der `editing`-branch)**: MUSS ebenfalls cropX/cropY durchreichen — beide API-Pfade müssen identisch persistieren.
    - **End-to-End Regression-Tests PFLICHT** (Codex-Spec-R1 [Correctness] #1 + Sonnet-R8 [FAIL] #3 — beide enthalten in den 5 AgendaSection-Tests):
      - **Test "Crop preserved on unrelated edit"**: render mit existing item.images=[{public_id, orientation, width, height, cropX: 20, cropY: 70}], openEdit, ändere title-input, handleSave, assert dashboardFetch wurde mit `body.images[0].cropX === 20` UND `cropY === 70` aufgerufen (= explizit preserve verifiziert via mock-fetch-call args).
      - **Test "Live preview reflects crop"**: nach `mock-crop-save` (cropX=75, cropY=25), assert dass Preview-Panel `AgendaItem` mock die crop-Werte als props bekommt — entweder via `screen.getByTestId("mock-agenda-item").dataset.cropX === "75"` (mock exposes prop als data-attr) ODER via direkten state-snapshot (nach mock-save, `form.images[i].cropX === 75` ist trivial — die ECHTE assertion ist dass previewItem-useMemo das durchreicht; daher mock `AgendaItem` mit `vi.mock("@/components/AgendaItem", () => ({ default: ({ images }) => <div data-testid="mock-agenda-item" data-images={JSON.stringify(images)} /> }))` und assert auf JSON.parse(...).images[0].cropX === 75).

6. **`CropModal.tsx` Component** — neue Datei `src/app/dashboard/components/CropModal.tsx`, exportiert `CropModal({ open, onClose, image, onSave })`:
   - **MUSS `"use client"` als first-line-directive** (Sonnet-Spec-R1 [Low] #10 — App-Router SSR-Fehler sonst). Verwendet hooks (useState/useRef) + pointer events.
   - **Props**: `open: boolean`, `onClose: () => void`, `image: AgendaImage` (= read-only, source-of-truth bei Open), `onSave: (cropX: number, cropY: number) => void`.
   - **i18n-Access** (Sonnet-Spec-R4 #8): CropModal importiert `dashboardStrings` direkt via `import { dashboardStrings } from "../i18n"` (matched bestehendes AgendaSection-Pattern, line 9-13 dort). Nutzt `dashboardStrings.agenda.crop.*`. KEIN i18n-prop am Interface.
   - **Internal Draft-State + Adjust-State-During-Render Pattern** (Sonnet-Spec-R1 [High] #4 — react.md anti-pattern verboten + Sonnet-Spec-R3 [High] #2 — open-toggle muss auch tracken):
     ```tsx
     const [draftCropX, setDraftCropX] = useState(image.cropX ?? 50);
     const [draftCropY, setDraftCropY] = useState(image.cropY ?? 50);
     const [imgLoaded, setImgLoaded] = useState(false);
     const [prevImage, setPrevImage] = useState(image);
     // Re-init bei image-prop change — synchronously during render, NICHT in
     // useEffect (lessons.md, react.md "Adjust state during render").
     // prevOpen-Tracking entfernt (Sonnet-R10 advisory B): unter conditional-rendering-Strategie
     // ({cropModalIndex !== null && <CropModal open={true}/>}) ist `open` immer true beim Render
     // → prevOpen-Vergleich wäre dead code. Component unmountet bei Close, mountet fresh bei Re-Open
     // → useState-init macht den Job. Open-Tracking ist nicht nötig solange parent CropModal
     // konditional rendert (verifiziert in AgendaSection Req 7).
     if (image !== prevImage) {
       setPrevImage(image);
       setDraftCropX(image.cropX ?? 50);
       setDraftCropY(image.cropY ?? 50);
       setImgLoaded(false); // Sonnet-Spec-R2 #3 — re-trigger onLoad-cycle
     }
     ```
     KEINE Mutation von `image` während Drag.
   - **Modal-Container**: nutzt `<Modal>` Primitive mit eigenem `open` + `onClose` (= props), eigenem Title `t.crop.modalTitle`. NICHT `disableClose` auf sich selbst (= darf via Esc geschlossen werden).
   - **Preview-Layout**: Original-Bild im Modal-Body, **`<img>` MUSS `src={`/api/media/${image.public_id}/`}`** (Sonnet-R7 advisory — matched `AgendaItem.tsx:188+:221` Convention, trailing slash pflicht; ohne explizite URL-Spec implementiert dev evtl. `/api/dashboard/media/...` oder `/media/...` und Modal zeigt broken-image-icon ohne dass unit-tests es fangen). **Plus `style={{ objectFit: "contain", maxWidth: "100%", maxHeight: "70vh" }}`** (Sonnet-Spec-R1 [Med] #9 — sonst croppt das Preview selbst und vereitelt das Crop-Tool). Container darüber für absolute-positioned Frame-Overlay.
   - **Image-Load Guard PFLICHT** (Sonnet-Spec-R2 [High] #3 — `getBoundingClientRect` returns falsche Dims vor image-load):
     ```tsx
     const [imgLoaded, setImgLoaded] = useState(false);
     // ...
     <img onLoad={() => setImgLoaded(true)} ... />
     {imgLoaded && /* render Frame Overlay HIER */}
     ```
     Frame-Overlay rendert NUR wenn `imgLoaded === true`. Numerische Inputs zeigen draftCropX/Y immer (unabhängig von imgLoaded). Beim image-prop-change (bei adjust-state-during-render): `setImgLoaded(false)` zurücksetzen damit der neue Image-onLoad-Cycle wieder triggert.
   - **`imgRef` deklaration PFLICHT** (Sonnet-Spec-R5 #5 — sonst TS-error `<img ref={imgRef}>` weil `MutableRefObject<null>` ≠ `Ref<HTMLImageElement>`):
     ```tsx
     const imgRef = useRef<HTMLImageElement>(null);
     ```
   - **Frame Overlay Math + Visual CSS** (Sonnet-Spec-R1 [High] #6 + R5 #2 — invisible overlay sonst). Frame-Overlay-`<div>` MUSS:
     - `data-testid="crop-frame-overlay"` (Sonnet-Spec-R3 #6)
     - `aria-label={dashboardStrings.agenda.crop.frameLabel}` (Sonnet-Spec-R4 #5)
     - **Visual style** (Sonnet-Spec-R5 #2):
       ```ts
       style={{
         position: "absolute",
         left: frameLeft,
         top: frameTop,
         width: frameWidth,
         height: frameHeight,
         border: "2px solid rgba(255,255,255,0.9)",
         boxShadow: "0 0 0 9999px rgba(0,0,0,0.4)",  // dimmt area aussen herum
         pointerEvents: "none",  // Frame schluckt keine Pointer — Container bekommt Drag
       }}
       ```
     ```ts
     // CropModal MODULE-LEVEL helper (Sonnet-Spec-R3 [High] #3 + Sonnet-R8 advisory C —
     // PFLICHT als module-level const ABOVE der Component-Function, NICHT inside dem
     // Component-Body, sonst re-creation per render. Die Function-Identity ist stable
     // weil pure):
     const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
     // 1. Container-Dims aus getBoundingClientRect des <img> Elements (NICHT Image.width/height-Props):
     // PFLICHT inline im render-body innerhalb {imgLoaded && ...} — NICHT in useMemo
     // (Sonnet-Spec-R6 advisory): useMemo wuerde nicht auf window-resize re-runnen,
     // stale frame position. Inline im render = fresh bei jedem render durch
     // draftCropX/Y state-changes — ABER React re-rendert NICHT automatisch auf
     // window-resize (Codex-Spec-R1 [Architecture] #1). Daher PFLICHT separater
     // resize-invalidation-Hook (siehe direkt darunter).
     // PFLICHT non-null assertion `!` (Sonnet-R7 [FAIL] #2 — TS strict-mode narrowt
     // imgRef.current NICHT durch JSX `{imgLoaded && ...}` Boundary; ohne `!` blockt
     // pre-commit `tsc --noEmit` den ersten commit. imgLoaded-Guard garantiert
     // semantically dass element gemounted ist, aber TS-control-flow-analysis sieht
     // das nicht).
     const { width: cw, height: ch } = imgRef.current!.getBoundingClientRect();
     const containerAspect = cw / ch; // image-rendered aspect (after object-fit:contain)
     const targetAspect = 2 / 3;
     // 2. Frame-Dims (= 2:3 inscribed in rendered image):
     const frameWidth  = containerAspect > targetAspect ? ch * targetAspect : cw;
     const frameHeight = containerAspect > targetAspect ? ch : cw / targetAspect;
     // 3. Frame-Position aus draftX/draftY:
     const frameCenterX = (cw * draftCropX) / 100;
     const frameCenterY = (ch * draftCropY) / 100;
     const frameLeft = clamp(frameCenterX - frameWidth / 2, 0, cw - frameWidth);
     const frameTop  = clamp(frameCenterY - frameHeight / 2, 0, ch - frameHeight);
     // 4. Drag-Delta-Mapping (in pointermove handler):
     const newCropX = clamp(startCropX + (deltaPx / cw) * 100, 0, 100);
     const newCropY = clamp(startCropY + (deltaPy / ch) * 100, 0, 100);
     ```
   - **Resize-Invalidation Hook PFLICHT** (Codex-Spec-R1 [Architecture] #1 — sonst stale Frame-Overlay nach viewport-resize/orientation-change während Modal offen, weil `getBoundingClientRect()` inline im render-body NICHT auto-re-evaluiert auf window-resize; pointer-Math liest später fresh dims → UI/Model-Mismatch im Drag genau in dem Tool dessen Job präzise Positionierung ist):
     ```tsx
     const [, forceRerender] = useReducer((x) => x + 1, 0);
     useEffect(() => {
       if (!open) return; // nur listen während CropModal offen
       const handler = () => forceRerender();
       window.addEventListener("resize", handler);
       window.addEventListener("orientationchange", handler);
       return () => {
         window.removeEventListener("resize", handler);
         window.removeEventListener("orientationchange", handler);
       };
     }, [open]);
     ```
     **Test-Coverage** (CropModal.test.tsx, +1 Test, Sonnet-R10 [FAIL] #5 — konkrete Pixel-Assertion pflicht): mount mit landscape 16:9 fixture (cw=320, ch=180, aspect=1.78). Stub `HTMLImageElement.prototype.getBoundingClientRect` initial → `{ width: 320, height: 180 }`. fireEvent.load(img). Frame-Math: `frameWidth = ch * (2/3) = 180 * 2/3 = 120`. Assert `parseFloat(screen.getByTestId("crop-frame-overlay").style.width)` ≈ 120 (`toBeCloseTo(120, 1)`). Re-stub getBoundingClientRect auf `{ width: 160, height: 90 }` (cw/ch halbiert), `act(() => window.dispatchEvent(new Event("resize")))`, await waitFor. Erwartete neue frameWidth: `90 * 2/3 = 60`. Assert `parseFloat(overlay.style.width)` ≈ 60 — NICHT noch 120 (= stale-Test fail).
   - **Pan-Drag** — vollständige Self-Contained-Handler (Sonnet-Spec-R3 #4 + R4 #1+#2 — useRef statt useState, fresh getBoundingClientRect im pointermove, onPointerCancel pflicht):
     ```ts
     const dragStartRef = useRef<{ cropX: number; cropY: number; pointerX: number; pointerY: number } | null>(null);

     // onPointerDown:
     // PFLICHT (Sonnet-Spec-R6 #5): gate auf imgLoaded — drag vor img.onLoad
     // liefert cw=0/ch=0 → division-by-zero in pointermove → NaN → silent-API-400.
     if (!imgLoaded || !imgRef.current) return;
     dragStartRef.current = { cropX: draftCropX, cropY: draftCropY, pointerX: e.clientX, pointerY: e.clientY };
     e.currentTarget.setPointerCapture(e.pointerId);

     // onPointerMove — fresh getBoundingClientRect (window-resize-safe, kein
     // stale-cw/ch-Risk):
     if (!dragStartRef.current) return;
     const { width: cw, height: ch } = imgRef.current!.getBoundingClientRect();
     if (cw === 0 || ch === 0) return; // Sonnet-R10 advisory A — Symmetry mit onKeyDown, division-by-zero-Schutz auch wenn imgLoaded normalerweise greift
     const imageAspect = cw / ch;
     const xHasRoom = imageAspect > 2 / 3;
     const yHasRoom = imageAspect < 2 / 3;
     const start = dragStartRef.current;
     const newCropX = clamp(start.cropX + ((e.clientX - start.pointerX) / cw) * 100, 0, 100);
     const newCropY = clamp(start.cropY + ((e.clientY - start.pointerY) / ch) * 100, 0, 100);
     if (xHasRoom) setDraftCropX(newCropX);
     if (yHasRoom) setDraftCropY(newCropY);

     // onPointerUp:
     dragStartRef.current = null;
     e.currentTarget.releasePointerCapture(e.pointerId);

     // onPointerCancel — PFLICHT (Sonnet-Spec-R4 #1 — Browser cancelt Gesture
     // bei iOS-momentum-scroll, system dialog, alt-tab; ohne Handler bleibt
     // dragStartRef stuck und PointerCapture geleakt):
     dragStartRef.current = null;
     e.currentTarget.releasePointerCapture(e.pointerId);
     ```
     Touch + Mouse via `pointerEvents` (single API). **Pan-Container MUSS `style={{ touchAction: "none" }}`** (Sonnet-Spec-R5 #3 — sonst claimt Mobile-Browser den Touch fuer scroll-pan, setPointerCapture fired silent-no-op, Drag funktioniert auf Mobile gar nicht).
   - **Preview-Container = Pan-Drag-Container = EIN single `<div>`** (Sonnet-R10 [FAIL] #1 — alle Properties unten + Pan-Drag-Container Properties (role, tabIndex, aria-label, touchAction, onPointerDown/Move/Up/Cancel, onKeyDown) gelten für DASSELBE Container-Element. NICHT zwei nested divs. Dieser eine `<div>` wraps direkt das `<img>` + frame-overlay-`<div>`. Sonst: pointer events landen auf inner pan-div statt img-area, frame-overlay-position vs imgRef.getBoundingClientRect-coords mismatch, drag delta math wrong).
   - **Preview/Pan-Container CSS** (Sonnet-Spec-R4 #6 + R5 #8 + R10 #1): Container `<div>` MUSS:
     - `position: relative` (für absolute Frame-Overlay)
     - KEINE feste Höhe (sonst rendert `<img>` mit object-fit:contain inside fixed height → getBoundingClientRect liefert container-box statt rendered-image-area)
     - **`width: "fit-content"` ODER `display: "inline-block"`** (Sonnet-Spec-R5 #8 — sonst extends container auf full modal-width waehrend portrait `<img>` narrower rendert; Drag in der grey-space-area outside image triggert exaggerated-delta math). Container shrinks zu image-width.
     - `touchAction: "none"` (Sonnet-Spec-R5 #3, hier am EINEN Container)
     - `role="application"`, `tabIndex={0}`, `aria-label={dashboardStrings.agenda.crop.dragHint}` (a11y, hier am EINEN Container)
     - `onPointerDown/Move/Up/Cancel` + `onKeyDown` Handler — alle am EINEN Container
     - `<img>` Element direkt als child: `display: block` (verhindert inline-baseline-gap), `maxWidth: "100%"`, `maxHeight: "70vh"`, `objectFit: "contain"`, `src={`/api/media/${image.public_id}/`}`.
     - frame-overlay-`<div>` direkt als sibling-child (siehe Frame-Overlay-CSS), conditional auf `imgLoaded`.
     - cw/ch aus `imgRef.current!.getBoundingClientRect()` = exactly rendered-image-area.
   - **Numerische Inputs**: zwei `<input type="number" min="0" max="100" step="1">` für X und Y, gelabelt mit `t.crop.xLabel` / `t.crop.yLabel`. **onChange braucht empty-string-guard VOR Number-cast + NaN-guard** (Sonnet-Spec-R5 #4 + Sonnet-R8 [FAIL] #1 — `Number("") === 0` und `Number.isFinite(0) === true`, also würde leeres Feld zu cropX=0 snappen statt preserve-state; explizite empty-check vorher):
     ```ts
     const v = e.target.value;
     if (v === "") return; // empty → preserve current draft (User mid-delete)
     const parsed = Number(v);
     if (Number.isFinite(parsed)) setDraftCropX(clamp(parsed, 0, 100));
     // invalid (NaN) input → state unverändert (User kann weiter tippen)
     ```
     **Pflicht: identischer guard auf BEIDE Inputs (X + Y)** — sonst silent UX-divergence zwischen Achsen.
     **+1 Test in CropModal.test.tsx-Bullet "Numeric input X update"**: erweitern um sub-assertion `fireEvent.change(xInput, { target: { value: "" } })` → assert `draftCropX` unverändert (war auf z.B. 50, bleibt 50, NICHT 0).
   - **Reset-Button**: setzt draftState auf `{cropX: 50, cropY: 50}`, `data-testid="crop-reset"`.
   - **Speichern-Button**: ruft `onSave(draftCropX, draftCropY)`, `data-testid="crop-save"`, `type="button"`.
   - **Abbrechen-Button**: ruft `onClose()` ohne save, `data-testid="crop-cancel"`.

7. **AgendaSection.tsx integriert CropModal** — neuer State `cropModalIndex: number | null` (= welcher Slot, null = closed). Render via **conditional-rendering** (Sonnet-Spec-R1 [Critical] #2 — `array[null]` TS-error sonst). Edit-Form ist inline → KEIN parent `disableClose` (Sonnet-Spec-R2 [Critical] #1):
   ```tsx
   {cropModalIndex !== null && cropModalIndex < form.images.length && (
     <CropModal
       open={true}
       onClose={handleCropClose}
       image={form.images[cropModalIndex]}
       onSave={handleCropSave}
     />
   )}
   /* Defensive index-bound-check (Sonnet-R9 advisory B) — TS-strict-config hat
    * kein noUncheckedIndexedAccess, daher kein compile-time-warn bei out-of-bounds.
    * Aktuelle UI macht race unmöglich (Modal-Backdrop blockt Slot-Interaktion),
    * aber 1-Token-Guard ist contract-explicit für Future-Refactor-Safety. */
   ```
   **Stable Callbacks via useCallback mit korrekten deps + functional-updater-purity** (Sonnet-Spec-R1 [Med] #11 + Sonnet-R8 [FAIL] #4 — closure-read INSIDE setForm verletzt React's "functional updater = pure function of prev state" Contract; StrictMode double-invoke + future concurrent-mode risk → Codex flaggt das als [P2] R1 sicher; Index VOR setForm capturen):
   ```tsx
   const handleCropOpen = useCallback((i: number) => setCropModalIndex(i), []);
   const handleCropClose = useCallback(() => setCropModalIndex(null), []);
   const handleCropSave = useCallback((cropX: number, cropY: number) => {
     const i = cropModalIndex; // capture index OUTSIDE updater (Sonnet-R8 [FAIL] #4)
     if (i === null) return;   // defensive null-check vor setForm
     setForm((prev) => {
       const images = [...prev.images];
       images[i] = { ...images[i], cropX, cropY };
       return { ...prev, images };
     });
     setCropModalIndex(null);
   }, [cropModalIndex]); // dep PFLICHT — capture-time value muss aktuell sein
   ```

8. **Stack-Safety** (Sonnet-Spec-R2 [Critical] #1 — Edit-Form ist inline, NICHT Modal):
   - `AgendaSection.tsx` rendert Edit-Form als inline `<div>`, nicht als `<Modal>`. Inline-Form hat KEINEN Esc-Handler.
   - CropModal ist der einzige Modal im Stack. CropModal's Esc-Handler closet sich selbst, fertig.
   - Focus return: CropModal cleanup-effect restored focus zum Crop-Icon-Button (= previously focused). Standard Modal-Behavior (Modal.tsx line 79).
   - Kein `disableClose` an irgendwas nötig — kein Parent-Modal existiert.
   - **Test-Coverage**: 1 Test: Esc während Crop offen → CropModal closet, Inline-Form bleibt sichtbar (assert `data-testid="slot-grid"` noch im DOM nach Esc).

9. **Pan-Drag Mapping-Contract** — präziser Algorithmus (Frame-Math siehe Req #6):
   - User zieht den 2:3-Frame über das Original-Bild.
   - Mapping: `cropX = clamp(startCropX + (deltaPx / cw) * 100, 0, 100)`, analog cropY. Drag-Delta = current-pointer-pos minus pointerDown-pos (NICHT absolute pointer position, sonst snapt Frame zum Pointer).
   - **Edge-Case „Achse ohne Bewegungsraum"** (Sonnet-Spec-R1 [High] #5 + R2 [High] #2 — generelle Regel mit korrekten Beispielen):
     ```ts
     const targetAspect = 2 / 3; // ≈ 0.667
     const imageAspect = cw / ch;
     // Wider als 2:3 (imageAspect > 0.667, z.B. landscape 16:9 = 1.78
     //   ODER mild-portrait 3:4 = 0.75): X-axis HAT Spielraum (Frame ist
     //   schmaler als image width), Y-axis NICHT (Frame deckt full height).
     // Schmaler als 2:3 (imageAspect < 0.667, z.B. portrait 1:2 = 0.5):
     //   Y-axis HAT Spielraum (Frame ist niedriger als image height),
     //   X-axis NICHT (Frame deckt full width).
     // Exact-2:3 (imageAspect === 0.667): beide Axes frozen.
     const xHasRoom = imageAspect > targetAspect;
     const yHasRoom = imageAspect < targetAspect;
     // In pointermove handler:
     if (xHasRoom) setDraftCropX(newCropX);
     if (yHasRoom) setDraftCropY(newCropY);
     ```
   - **Test-Coverage** (Mock pointerEvents in jsdom — pointerEvents nicht nativ in jsdom, custom CustomEvent mit pointerId/clientX/clientY workaround. **Plus jsdom braucht stub von `setPointerCapture`/`releasePointerCapture`** — Sonnet-Spec-R2 [High] #4):
     ```ts
     beforeEach(() => {
       HTMLElement.prototype.setPointerCapture = vi.fn();
       HTMLElement.prototype.releasePointerCapture = vi.fn();
     });
     ```
     - Drag-far-left → cropX clamped auf 0
     - Drag-far-right → cropX clamped auf 100
     - **Landscape 16:9 image fixture (cw=320, ch=180, aspect=1.78)**: Y-Drag → draftY unverändert (frozen), X-Drag bewegt cropX
     - **Mild-Portrait 3:4 image fixture (cw=300, ch=400, aspect=0.75)**: Y-Drag → draftY unverändert (frozen), X-Drag bewegt cropX (Sonnet-Spec-R2 [High] #2 — 3:4 ist wider-than-2:3, X HAT Spielraum)
     - **Tall-Portrait 1:2 image fixture (cw=200, ch=400, aspect=0.5)**: X-Drag → draftX unverändert (frozen), Y-Drag bewegt cropY
     - **Exact-2:3 portrait fixture (cw=200, ch=300, aspect=0.667)**: beide Axes frozen
     - jsdom getBoundingClientRect Stub mit fixed cw/ch zur deterministischen Math-Verifikation.

10. **Keyboard A11y** — Crop-Modal:
    - **Numerische Inputs**: existierender HTML-Input-Behavior (Up/Down arrows nudgen by step=1).
    - **Pan-Drag-Container**: `role="application"`, `tabIndex=0`, `aria-label={dashboardStrings.agenda.crop.dragHint}`. Arrow-Keys nudgen `draftX/draftY` by 1 (Plain), 10 (Shift). Mapping (Sonnet-Spec-R4 #4):
      - `ArrowLeft` → `draftX -= step` (clamp 0) — **nur wenn `xHasRoom`** (Sonnet-Spec-R6 #4 — sonst silent state-corruption auf frozen-axis)
      - `ArrowRight` → `draftX += step` (clamp 100) — nur wenn `xHasRoom`
      - `ArrowUp` → `draftY -= step` (clamp 0) — nur wenn `yHasRoom`
      - `ArrowDown` → `draftY += step` (clamp 100) — nur wenn `yHasRoom`
      `step = 10` wenn `e.shiftKey`, sonst `1`. **`e.preventDefault()` PFLICHT** im Handler (Sonnet-Spec-R3 #5 — sonst scrollen Arrow-Keys parallel die Modal/Page). preventDefault feuert IMMER, auch bei frozen-axis (sonst page-scroll). Nur die State-Mutation wird gegated. Tests: 4 Arrow-Tests (jede Direction +1/+10), assert `defaultPrevented === true`. **+ 2 frozen-axis tests** (Sonnet-Spec-R6 #4): landscape 16:9 fixture + ArrowDown → draftY UNVERAENDERT (Y frozen), portrait 1:2 fixture + ArrowRight → draftX UNVERAENDERT (X frozen).
    - **Vollständiger onKeyDown-Handler** (Sonnet-R7 [FAIL] #3 — Pointer-Handler-Pattern allein reicht nicht, render-body `xHasRoom`/`yHasRoom` sind nicht in handler-scope):
      ```ts
      const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        const key = e.key;
        if (key !== "ArrowLeft" && key !== "ArrowRight" &&
            key !== "ArrowUp" && key !== "ArrowDown") return;
        e.preventDefault(); // IMMER, auch bei frozen-axis (sonst page-scroll)
        if (!imgLoaded || !imgRef.current) return; // pre-load Noop
        // Fresh getBoundingClientRect — render-body Variablen sind nicht in scope:
        const { width: cw, height: ch } = imgRef.current.getBoundingClientRect();
        if (cw === 0 || ch === 0) return; // defensive
        const imageAspect = cw / ch;
        const xHasRoom = imageAspect > 2 / 3;
        const yHasRoom = imageAspect < 2 / 3;
        const step = e.shiftKey ? 10 : 1;
        if (key === "ArrowLeft" && xHasRoom) {
          setDraftCropX((prev) => clamp(prev - step, 0, 100));
        } else if (key === "ArrowRight" && xHasRoom) {
          setDraftCropX((prev) => clamp(prev + step, 0, 100));
        } else if (key === "ArrowUp" && yHasRoom) {
          setDraftCropY((prev) => clamp(prev - step, 0, 100));
        } else if (key === "ArrowDown" && yHasRoom) {
          setDraftCropY((prev) => clamp(prev + step, 0, 100));
        }
        // frozen-axis: preventDefault feuerte schon, state bleibt unverändert
      };
      ```
      Bound auf den Pan-Drag-Container `<div onKeyDown={onKeyDown} ...>`. Functional setState-Updates (`(prev) => ...`) sind wichtig damit Shift+Arrow rapid-fire keine stale-closure-Werte stackt.
    - **Tab-Reihenfolge**: Pan-Container → X-Input → Y-Input → Reset → Cancel → Save. Modal-Focus-Trap aus existing Modal.tsx kümmert sich um Tab-Cycling.

11. **API POST + PUT durchreichen `cropX, cropY`** — keine separaten Validation-Routen nötig (passiert in `validateImages()` per-image). API-Tests:
    - POST: 201 mit `{cropX: 50, cropY: 50}`, 400 mit `{cropX: 101}` (error matches `/crop/i`).
    - **PUT-Test pflicht** (Sonnet-Spec-R1 [Med] #8 — fehlende PUT-Coverage): PUT mit `{images: [{..., cropX: 101}]}` → 400 (error matches `/crop/i`). PUT mit `{images: [{..., cropX: 50}]}` → 200.

12. **Dashboard-i18n Strings** — `src/app/dashboard/i18n.tsx` neue Keys unter `agenda.crop`:
    - `openModal`: „Bildausschnitt anpassen"
    - `modalTitle`: „Bildausschnitt"
    - `xLabel`: „Horizontal (%)"
    - `yLabel`: „Vertikal (%)"
    - `dragHint`: „Ziehen oder Pfeiltasten zum Verschieben"
    - `reset`: „Zurücksetzen"
    - `save`: „Übernehmen"
    - `cancel`: „Abbrechen"
    - `frameLabel`: „Sichtbarer Ausschnitt (2:3)"

13. **Tests grün** — `pnpm build` + `pnpm test` + `pnpm exec tsc --noEmit` clean. Mindestens **+47 neue Tests** (Sonnet-R10 [FAIL] #3 reconciliation — AgendaSection 5→6 wegen Live-Preview-Test; file-by-file: 10 + 5 + 2 + 20 + 6 + 2 + 2 = 47. CropModal-Bullets unten wo ein Bullet ≥2 Tests enthält explizit als „(2 Tests)" markiert):
    - `agenda-images.test.ts` (extend or create) — 10 Tests für validateImages crop-validation (siehe #2; +1 für `cropX=null` + 1 für `cropY=null` symmetry).
    - `AgendaItem.test.tsx` (extend) — 5 Tests für object-position (Single/Multi × default/custom + **cropX=0 boundary** — Sonnet-Spec-R4 #7, regression-guard `??` vs `||`: assert `style.objectPosition === "0% 50%"` für `imagesFit/cropX=0`, NICHT 50%).
    - `queries-agenda.test.ts` (extend) — 2 Tests für cropX/cropY mapping (defined / undefined).
    - `CropModal.test.tsx` (new) — **mindestens 20 Tests** (Sonnet-R9 advisory A — alte Formel-Aufschlüsselung entfernt, weil Bullet-Anzahl unten je nach Interpretation 22-25 ergibt; verbindlicher Contract ist „≥20" plus per-file-Breakdown 10+5+2+20+5+2+2=46 in DK-2/test-plan):
      - Renders mit initial draft = image.cropX/cropY oder default 50/50, **plus assert `<img>.src === `/api/media/${testPublicId}/`` mit trailing-slash** (Sonnet-R9 [FAIL] #2 — sonst kann broken-URL-Variante grün durch + Modal-Preview tot ohne dass tests es fangen)
      - Numeric input X update draftX **+ sub-assertion `fireEvent.change(xInput, {target:{value:""}})` → `draftCropX` unverändert** (Sonnet-R8 [FAIL] #1 empty-string-guard regression)
      - Numeric input Y update draftY **+ sub-assertion `fireEvent.change(yInput, {target:{value:""}})` → `draftCropY` unverändert** (Sonnet-R9 [FAIL] #3 — identischer guard auf BEIDE Achsen, sonst Y-axis silent-snap-to-0 während X korrekt funktioniert)
      - Reset-Button setzt beide auf 50
      - Speichern-Button calls onSave(draftX, draftY) + parent sees mutation
      - Abbrechen-Button calls onClose ohne onSave
      - Pan-Drag pointerDown+Move+Up updated draftX/draftY synchronously
      - Pan-Drag clamped at 0 (drag-far-left)
      - Pan-Drag clamped at 100 (drag-far-right)
      - Arrow-Key nudge X: Right +1, Left -1
      - **Arrow-Key nudge Y: Down +1, Up -1** (Sonnet-Spec-R4 #4 — explizit Y-axis testen)
      - Shift+Arrow nudge: +10/-10 (test 1 X-direction + 1 Y-direction) **(2 Tests)**
      - **onPointerCancel cleart dragStartRef** (Sonnet-Spec-R4 #1 — assert nach pointercancel: dragStartRef.current === null und releasePointerCapture wurde aufgerufen)
      - **pointerDown vor img.onLoad ist Noop** (Sonnet-Spec-R6 #5): fireEvent.pointerDown ohne vorherigen img-load-event → keine state-change, kein dragStartRef set
      - **Frozen-axis arrow keys gated** (Sonnet-Spec-R6 #4): landscape 16:9 fixture + ArrowDown → draftY UNVERAENDERT, portrait 1:2 fixture + ArrowRight → draftX UNVERAENDERT, beide assert defaultPrevented=true **(2 Tests)**
      - **Resize-Invalidation re-rechnet Frame-Overlay** (Codex-Spec-R1 [Architecture] #1): mount mit landscape-fixture + onLoad → assert frame-overlay-width = X. Stub getBoundingClientRect auf neue Dims (cw halbiert), `window.dispatchEvent(new Event("resize"))`, await waitFor → assert frame-overlay-width neu berechnet (nicht stale).
      - Pan-Container has role="application" + tabIndex=0 + aria-label
      - Modal title shown
      - All buttons have type="button" (form-submit-trap regression)
      - On image-prop change while open, draft re-initialized
      - **Cancel → re-open same slot resets draft to persisted value** (Sonnet-Spec-R3 #2 + Sonnet-R10 advisory B — funktioniert via fresh-mount unter conditional-rendering, NICHT mehr via prevOpen-tracking): open with cropX=20, drag to cropX=80, onClose (= parent unmountet CropModal weil cropModalIndex=null), re-open mit same image-ref (= fresh mount, useState-init liest image.cropX=20) → draftCropX=20, NICHT 80
      - **Frame-overlay nicht im DOM bevor img.onLoad** (Sonnet-Spec-R3 #6): assert `data-testid="crop-frame-overlay"` ist null vor onLoad-event, sichtbar nach fireEvent.load(img)
      - **Arrow-Key handler ruft preventDefault** (Sonnet-Spec-R3 #5): focus container, dispatchEvent ArrowRight, assert `event.defaultPrevented === true`
    - `AgendaSection.test.tsx` (extend) — **6 Tests** (Sonnet-Spec-R2 [Critical] #1 + [Med] #6 + Codex-Spec-R1 [Correctness] #1 + Sonnet-R10 [FAIL] #3 — Live-Preview-Test ist eigener Bullet, nicht in #2 versteckt):
      - Crop-Icon-Button rendered on filled slot, not on empty slot — plus assert `cropBtn.querySelector("svg").getAttribute("aria-hidden") === "true"` (Sonnet-R8 [FAIL] #2)
      - Click crop-button opens CropModal (assert via mock-data-testid="mock-crop-modal"). Mock-onSave-Click verifiziert state-mutation indem nach Click ein Re-Open des Modals (`fireEvent.click(cropBtn)` zweimal mit close dazwischen) zeigt dass `image-public_id` data-attr gleich bleibt UND draftCropX/Y im next-render von cropX=75 startet (= form.images[i] wurde tatsächlich mutated).
      - **Crop preserved on unrelated edit** (Codex-Spec-R1 [Correctness] #1, siehe Req 5a): render mit existing item.images=[{public_id, orientation, width, height, cropX: 20, cropY: 70}], openEdit, ändere title-input, handleSave, assert dashboardFetch wurde mit `body.images[0].cropX === 20` UND `cropY === 70` aufgerufen — verhindert silent-data-loss bei Form-State-Whitelist.
      - **Live preview reflects crop** (Sonnet-R10 [FAIL] #3, Req 5a Test B): mock `@/components/AgendaItem` mit data-images attr (siehe Files-to-Change Tabelle für Mock-Strategie), render Preview-Panel, fire mock-crop-save (cropX=75, cropY=25), assert `JSON.parse(screen.getByTestId("mock-agenda-item").dataset.images)[0].cropX === 75` UND `cropY === 25` — verifiziert dass previewItem useMemo cropX/cropY durchreicht (sonst Live-Preview-Mismatch zum Public-Render).
      - **Esc während Crop offen** → CropModal closet, Inline-Form bleibt sichtbar (assert `data-testid="slot-grid"` noch im DOM)
      - **Drag-Reorder regression** (Sonnet-Spec-R2 [Med] #6 + Sonnet-R10 [FAIL] #4 — konkrete Assertion pflicht): Click crop-button auf slot 0 (sets cropModalIndex=0), close modal (fireEvent.keyDown Esc → cropModalIndex=null), THEN `fireEvent.dragStart(slot1, { dataTransfer: mockDataTransfer })` → assert `mockDataTransfer.setData` wurde mit `("text/slot-index", "1")` aufgerufen (= drag-state ist clean nach crop-button-click pollution check). Trivial-pass `not.toThrow()` ist explizit verboten.

### Nice to Have (explicit follow-up, NOT this sprint)

1. Touch-Pinch-to-Zoom für Crop-Modal Mobile.
2. Visualization der gecroppten Cell-Area direkt im Slot-Grid Thumbnail (= live preview).
3. Bulk-Crop-Reset („alle Bilder dieses Eintrags auf default 50/50 zurücksetzen").
4. Crop-Preset-Buttons („top", „center", „bottom" für vertikales Quick-Crop, analog horizontal).

### Out of Scope

- DROP COLUMN `agenda_items.images_fit` (orphan vom letterbox-removal in PR #122) — separater 3-Phase shared-DB-safe Sprint.
- DROP COLUMN `agenda_items.images_as_slider` (orphan vom revert PR #120) — separater Sprint.
- Discours-Agités Bilder-Crop (`journal_entries.images` haben gleiche Struktur, aber Sprint Agenda-only).
- Per-Image-Aspect-Override (Crop ist immer 2:3 aus Multi-Grid; Sprint 3 könnte cell-aspect konfigurierbar machen).
- Per-Image-Filter / Brightness / Contrast.

## Technical Approach

### Files to Change

| File | Change Type | Description |
|---|---|---|
| `src/lib/agenda-images.ts` | Modify | `AgendaImage` Type um `cropX?: number; cropY?: number` ergänzen. `validateImages()` per-image Loop um Crop-Range-Check (0..100, optional, present-but-invalid → reject). |
| `src/lib/agenda-images.test.ts` | Create | 10 Tests siehe Spec-Requirement #2 (inkl. cropY=null symmetry). |
| `src/lib/queries.ts` | Modify | Mapping in `getAgendaItems` extend: `cropX: typeof img.cropX === "number" && Number.isFinite(img.cropX) ? img.cropX : undefined` analog für cropY. |
| `src/lib/queries-agenda.test.ts` | Modify | +2 Tests für cropX/cropY pass-through + legacy-row defensive undefined. |
| `src/components/AgendaItem.tsx` | Modify | Beide `<img>`-Branches (Single + Multi-Grid): `style={{ objectFit: "cover", objectPosition: \`${img.cropX ?? 50}% ${img.cropY ?? 50}%\` }}`. |
| `src/components/AgendaItem.test.tsx` | Modify | +5 Tests siehe Spec-Requirement #3 (inkl. cropX=0 boundary regression-guard). |
| `src/app/dashboard/components/CropModal.tsx` | Create | Neues Component, ~250 Zeilen. Pan-Drag via pointerEvents, numerische Inputs, Reset/Save/Cancel-Buttons, Modal-Wrapper. |
| `src/app/dashboard/components/CropModal.test.tsx` | Create | 20 Tests siehe Spec-Requirement #13 (inkl. resize-invalidation, frozen-axis arrows, pointerDown-vor-load Noop). |
| `src/app/dashboard/components/AgendaSection.tsx` | Modify | (a) Neuer State `cropModalIndex: number \| null`. (b) Crop-Icon-Button auf filled-slot oben-links (parallel zum ✕), Inline-SVG mit `aria-hidden="true"` (Sonnet-R8 [FAIL] #2). (c) **KEIN disableClose** — Edit-Form ist inline `<div>`, kein Parent-Modal vorhanden (Sonnet-Spec-R2 [Critical] #1 + R3 [Critical] #1). (d) `<CropModal>` conditional-rendered (`{cropModalIndex !== null && cropModalIndex < form.images.length && ...}`) mit defensive index-bound-check (Sonnet-R9 advisory B — guards future-refactor crash wenn index out-of-bounds würde), useCallback-stabilisierten onClose/onSave. (e) `handleCropSave` mutiert `form.images[i]` mit cropX+cropY — Index VOR `setForm` capturen (Sonnet-R8 [FAIL] #4 functional-updater-purity). (f) **`previewItem` useMemo Image-Mapping (line ~326)** MUSS cropX/cropY durchreichen (Sonnet-R8 [FAIL] #3 — sonst Live-Preview-Mismatch). (g) **Beide handleSave-payload-Mappings** (POST-create line ~533 + PUT-edit Stelle) MÜSSEN cropX/cropY durchreichen — Codex-Spec-R1 [Correctness] #1 silent-data-loss. (h) `interface ImageDraft` (line 49) extend mit `cropX?: number; cropY?: number`. (i) `openEdit()` mapping (line 180-186) hydrate cropX/cropY aus DB. (j) **`interface AgendaItem` images-inline-type (line 39)** MUSS extend mit `cropX?: number; cropY?: number` (Sonnet-R9 [FAIL] #1 — sonst TS strict-mode error in `openEdit()` `img.cropX`-Read, blockt pre-commit `tsc --noEmit`. Dieser Type ist NICHT `AgendaImage[]` sondern eigene inline-shape; Type-Erweiterung in `agenda-images.ts` reicht NICHT). |
| `src/app/dashboard/components/AgendaSection.test.tsx` | Modify | +6 Tests (Sonnet-R10 [FAIL] #3 — 5→6). **Top-level vi.mock-Strategie für ZWEI Module** (Sonnet-R10 [FAIL] #6 — Vitest hoists `vi.mock` an file-top, gilt für ALLE Tests; deshalb mocks müssen design-by-passthrough bleiben damit existing tests nicht brechen): (1) `vi.mock("./CropModal", () => ({ CropModal: ({ open, onSave, onClose, image }) => open ? (<div data-testid="mock-crop-modal" data-image-id={image?.public_id}><button data-testid="mock-crop-save" onClick={() => onSave(75, 25)} /><button data-testid="mock-crop-cancel" onClick={onClose} /></div>) : null }));` (CropModal ist neu in Sprint 2 — keine existing tests, kein conflict). (2) `vi.mock("@/components/AgendaItem", () => ({ default: ({ images }: { images: unknown[] }) => <div data-testid="mock-agenda-item" data-images={JSON.stringify(images)} /> }));` (AgendaItem wird im Preview-Panel gerendert — alle existing Tests die Preview-Inhalte assertet hätten brechen mit diesem Mock; **PFLICHT-Verifikation vor Implementation**: grep `AgendaSection.test.tsx` für Assertions auf `getByText("Eintrag-Titel")` o.ä., die müssten umgestellt werden auf `JSON.parse(mock-agenda-item.dataset.images)` checks ODER stattdessen `vi.doMock("@/components/AgendaItem", ...)` lokal in der Live-Preview-test-`describe`-Block + `vi.resetModules()` davor benutzen (isoliert). Einfachster path: top-level mock UND existing preview-tests umstellen — weniger Code-Komplexität, single source of truth). Fixed save-values 75/25 machen Test-Assertions deterministisch. |
| `src/app/dashboard/i18n.tsx` | Modify | Neue Keys unter `agenda.crop` (siehe #12). |
| `src/app/api/dashboard/agenda/route.ts` | No-Op | POST nutzt validateImages() — neue Felder werden automatisch validated und persistiert. |
| `src/app/api/dashboard/agenda/[id]/route.ts` | No-Op | PUT nutzt validateImages() — ebenfalls automatisch. |
| `src/app/api/dashboard/agenda/route.test.ts` | Modify | +2 Tests: POST mit `images: [{..., cropX: 50, cropY: 50}]` → 201; POST mit `images: [{..., cropX: 101}]` → 400 (error matches `/crop/i`). |
| `src/app/api/dashboard/agenda/[id]/route.test.ts` | Modify | +2 Tests (Sonnet-Spec-R1 #8): PUT mit `{images: [{..., cropX: 50}]}` → 200; PUT mit `{images: [{..., cropX: 101}]}` → 400 (error matches `/crop/i`). |
| `src/lib/schema.ts` | No-Op | `images` ist bereits JSONB — keine ALTER nötig. Felder kommen via JSONB-shape. |

### Architecture Decisions

- **`cropX/cropY` in JSONB statt eigene DB-Spalte** — bleibt im `images` JSONB-Array, genau wie `width`, `height`, `alt`. Kein Schema-Change. Defaults sind code-side (`?? 50`), nicht DB-side. Vereinfacht Migration komplett (kein DDL-Deploy).
- **Optional + default 50** — `undefined` = „User hat nie gecropped" → 50/50 (= visuelles Zentrum, equivalent zu pre-Sprint-2-default). Kein Migration-UPDATE nötig.
- **Stack-Safety trivial — Edit-Form ist inline, kein nested-modal-Pattern** (Sonnet-Spec-R2 [Critical] #1) — `AgendaSection.tsx` Edit-Form ist `<div>` controlled by `showForm`, hat keinen Esc-Handler. CropModal ist der einzige Modal im Stack. Esc im CropModal closet nur sich selbst. Kein `disableClose`-Mechanismus an irgendwas. Test verifiziert: Esc → CropModal weg, slot-grid bleibt im DOM.
- **Pan-Drag via pointerEvents** — single-API für Mouse + Touch + Pen. Kein separater touchstart/touchmove. Pointer-Capture (`setPointerCapture`) auf Drag-Start damit Drag auch über Container-Grenzen hinaus funktioniert.
- **Draft-State im CropModal lokal, nicht in form** — verhindert dass jeder Pixel-Pixel-Drag im DirtyContext landet UND dass Cancel den State zurückrollen müsste. Save commits einmalig zu `form.images[i]`.
- **Crop-Icon-Button als separates Click-Target** — analog dem ✕-Button (oben-rechts). Click triggert `e.stopPropagation()` NICHT — Drag der gesamten Slot-Container bleibt funktional (Crop-Button-Click ist Single-Pointer-Up, nicht Drag). HTML5 Drag fires NUR bei `mousemove > threshold` zwischen mousedown + mouseup, einzelner Click triggert kein Drag. **Test pflicht**: Crop-Button click + dann Drag-Reorder funktioniert weiterhin (kein Drag-State-Pollution).
- **`object-position: 50% 50%` als expliziter Default in Renderer** — nicht `undefined` weil unterschiedliche Browser/CSS-Cascade-Effekte unklar machen würden welcher Default greift. Explizit setzen = deterministisch.
- **Frame-Overlay vs Image-Pan-Strategie** — User zieht den FRAME, nicht das BILD. Mental Model: „ich verschiebe den Sucher". Alternative wäre „User zieht das Bild unter einem fixen Frame durch" (= invertierte Drag-Direction). Wir wählen Frame-Drag weil:
  1. Konsistent mit „crop"-Mental-Model vieler Tools (Photoshop Crop-Tool, Figma Frame).
  2. Visuell intuitiver: User sieht „den sichtbaren Bereich".
  3. Drag-Direction matches CSS `object-position` Direktionen (right-Drag erhöht cropX, exactly was user expects).
- **Kein eigenes Image-Resize / Lightbox** — Crop-Modal lädt das Bild in maximal 70vw × 70vh Container, Image wird via CSS auf max-width:100% skaliert. Original-Auflösung bleibt unverändert auf Server, nur die clientseitige Frame-Position-Berechnung skaliert proportional.
- **Touch-Support included im MVP** — pointerEvents API gibt Touch quasi-frei. Test-Coverage minimal aber Browser-Test in Smoke.

### Dependencies

- **External**: keine neuen npm-Pakete. Native HTML5 + pointerEvents API.
- **Internal**:
  - `agenda_items.images` JSONB unverändert — additive Felder im JSON.
  - Modal.tsx disableClose-Mechanismus (existing PR #53).
  - Existing Single-Image + Multi-Image Render-Branches (post-Sprint-1).

## Edge Cases

- **Bild gelöscht aus media-table während Crop-Modal offen** — `image.public_id` zeigt auf nicht-mehr-existierendes Asset. Browser zeigt broken-image. Crop-Modal bleibt funktional (User kann saven, persistiertem cropX/cropY ist egal). Bei Public-Render fängt das image-onerror nichts ab (existing behavior). Nicht in Sprint Scope.
- **Bild-Dimensionen unbekannt (legacy ohne width/height)** — Crop-Modal preview funktioniert weiterhin (CSS object-fit). 2:3-Frame-Berechnung nutzt rendered-image-bounding-box (`getBoundingClientRect`), nicht `image.width/height`-Felder. Test-Coverage: Image ohne width/height.
- **Esc während CropModal offen** — Da das Edit-Formular kein Modal ist und keinen Esc-Handler registriert, fängt nur CropModal die Esc-Taste ab. Stack-Safety ist trivial. Test pflicht: Esc → CropModal closes, slot-grid bleibt im DOM (Sonnet-Spec-R4 #3 — alte Modal-vs-Modal Beschreibung war stale).
- **CropModal `image`-Prop ändert sich während offen** — z.B. User klickt Crop-Button auf Slot 0, dann (irgendwie) auf Slot 1 ohne dazwischen Close. Sollte nicht passieren da Slot 0's Crop-Modal-Render ist exclusive. Aber defensive: Adjust-State-During-Render Pattern in CropModal (siehe Req 6) re-initialisiert draft bei `image !== prevImage`. **Kein useEffect** (react.md anti-pattern). Test-Coverage.
- **Viewport-Resize / Orientation-Change während CropModal offen** — getBoundingClientRect() inline im render-body würde stale bleiben weil React nicht auto-re-rendert auf window-resize. Mitigation: Resize-Invalidation-Hook in CropModal (siehe Req 6) listened auf `resize` + `orientationchange` und triggert forceRerender. Frame-Overlay-Math + pointer-Math nutzen dann beide fresh dims. Test-Coverage in CropModal.test.tsx (Codex-Spec-R1 [Architecture] #1).
- **Pan-Drag während Save-Click** — User zieht, while-mid-drag clickt Save. PointerUp + Click feuern beide. Sollte nicht passieren (Save-Button nicht im Pan-Container). Aber defensive: pointer-events-isolation per Container. Sollte CSS via `pointer-events` regulär greifen.
- **cropX=0 vs cropX=undefined Render-Effekt** — Renderer macht `cropX ?? 50`, also `0` valid → 0%, undefined → 50%. Test pflicht.

## Test plan
- [ ] Schema/Validation: agenda-images.test.ts +10 Tests (inkl. cropX=null + cropY=null preserve)
- [ ] Public Renderer: AgendaItem.test.tsx +5 Tests (inkl. cropX=0 boundary)
- [ ] Queries: queries-agenda.test.ts +2 Tests
- [ ] CropModal: CropModal.test.tsx +20 Tests (new file; inkl. Resize-Invalidation aus Codex-Spec-R1 [Architecture] #1)
- [ ] AgendaSection: AgendaSection.test.tsx +6 Tests (inkl. drag-reorder regression + crop-preserved-on-unrelated-edit + Live-Preview-Test aus Sonnet-R10 [FAIL] #3)
- [ ] API: agenda/route.test.ts +2 Tests
- [ ] API: agenda/[id]/route.test.ts +2 Tests (Sonnet-Spec-R6 #1 — fehlte in checklist)
- [ ] Total agenda suite: 64 → ~111 passed (47 neue Tests, body/test-plan/DK-2 reconciled)
- [ ] tsc clean, pnpm audit 0 HIGH/CRITICAL
- [ ] Lokal-Smoke: Editor → Crop-Button → Modal öffnet → Pan-Drag funktioniert → Save schreibt cropX/cropY in form → DB-Row hat crop-Werte
- [ ] Public-Render-Smoke: bestehender Eintrag mit cropX=20 → object-position: 20% 50% sichtbar (nach prod-deploy)
- [ ] Lokal-Smoke Stack-Safety: Esc während Crop offen → CropModal schließt, Inline-Edit-Form bleibt sichtbar (slot-grid noch im DOM). Sonnet-R7 advisory — alte Formulierung war missverständlich.
- [ ] Staging-Deploy + Logs clean

## Risks

1. **Pan-Drag-Mapping mit nicht-quadratischen Bildern** — komplexes 2:3-vs-Image-Aspect-Math. Mitigation: präziser Test-Plan mit Mock-Pointer-Events, Boundary-Werte 0/100 verifizieren visuell.
2. **Esc-Routing während CropModal offen** — Edit-Form ist inline `<div>` (kein Modal, kein Esc-Handler), CropModal ist der einzige Modal im Stack. Keine Race möglich. Mitigation: Test verifiziert Esc → CropModal weg, slot-grid bleibt im DOM. Kein `disableClose`-Mechanismus nötig (Sonnet-Spec-R2 [Critical] #1 — alte nested-modal-Sorge entfällt).
3. **Crop-Button vs Drag-Reorder Konflikt** — Click auf Crop-Button darf nicht den slot draggable interferieren. Mitigation: HTML5 Drag triggert nur bei mousemove > threshold, einzelner Click ist safe. Test verifiziert beide Pfade unabhängig.
4. **Mobile Touch-Drag-Genauigkeit** — pointerEvents geben Touch-Support gratis, aber 2:3-Frame-Drag auf 320px Mobile ist fummelig. Mitigation: numerische Inputs als A11y-Fallback. Bulk-mobile-UX-Optimierung als Nice-to-Have.
5. **JSONB-Migration bestehender Bilder** — alle existing rows haben `images[i]` ohne cropX/cropY. Renderer fallback `?? 50` greift, kein Backfill nötig. Mitigation: defensiver Test mit legacy-shape image.

## References

- PR #122 (vorheriger Sprint): compact slot-grid + grid-above-editor + remove letterbox
- PR #121 (Sprint 1): Bilder-Grid 2.0 (cols + slot editor)
- PR #53 Codex R1 P2: Modal disableClose live-readable mechanism (= unsere stack-safety Voraussetzung)
- lessons.md 2026-04-19: Modal-onClose useCallback-stable
