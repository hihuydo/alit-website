# Spec: Agenda Per-Image Crop Modal — Sprint 2
<!-- Created: 2026-04-27 -->
<!-- Author: Planner (Claude) -->
<!-- Status: Draft v2 — Sonnet R1 11 findings incorporated (3 critical + 3 high + 4 med + 1 low) -->
<!-- Sonnet R1 fixes: #1 cleaned.push includes crop, #2 conditional-render not array[null], #3 null-coerce-vor-typecheck + null-test, #4 adjust-state-during-render not useEffect, #5 axis-without-room generelle-Regel, #6 Frame-CSS-Math expliziert, #7 raw param type extended, #8 PUT crop test, #9 preview img object-fit:contain, #10 use-client directive, #11 useCallback deps inkl. cropModalIndex -->

## Summary

User kann pro Bild im Agenda-Slot-Grid den sichtbaren Ausschnitt (`object-position`) selbst wählen. Implementation: zwei optionale Felder `cropX, cropY` (jeweils 0..100, default 50) auf `AgendaImage` in JSONB. Public-Renderer leitet `object-position: {cropX}% {cropY}%` ab. Dashboard bekommt einen kleinen Crop-Icon-Button (oben-links auf jedem filled Slot, neben dem ✕ oben-rechts), der ein nested Modal über dem Edit-Modal öffnet mit grossem Original-Bild-Preview, semi-transparenter 2:3-Frame-Overlay, Pan-Drag um den Frame zu verschieben, numerischen X/Y-Inputs für Tastatur-A11y und einem Reset-Button. Stack-Safe: Parent-Modal bekommt `disableClose=true` solange Crop-Modal offen, Escape closet nur das oberste Modal, Focus kehrt deterministisch zum Crop-Button zurück.

## Context

### Current State

- `AgendaImage` Type in `src/lib/agenda-images.ts:3-9` trägt `{public_id, orientation, width?, height?, alt?}`. Re-exportiert von `src/components/AgendaItem.tsx`.
- Public-Renderer in `src/components/AgendaItem.tsx:175-202` (Single-Image) und `:215-235` (Multi-Image-Grid) rendert `<img>` mit hartkodiertem `style={{ objectFit: "cover" }}` (Letterbox wurde in PR #122 entfernt). `object-position` ist nicht gesetzt → default `50% 50%`.
- Dashboard-Editor `AgendaSection.tsx:778-846` rendert Slot-Grid (60px Cells, semi-transparente borders). Filled-Slots haben `<img>` + ✕-Remove-Button oben-rechts. **Click-on-filled-Slot ist No-Op** (vermeidet Drag/Click-Konflikt). `draggable=true` für Reorder, `onDragStart` setzt `text/slot-index`.
- API POST + PUT in `src/app/api/dashboard/agenda/route.ts` und `[id]/route.ts` validieren `images` via `validateImages()` (Range-Check für width/height, dedupe per public_id, media-table-existence-check).
- Modal-Primitive `src/app/dashboard/components/Modal.tsx` unterstützt `disableClose` für stack-safe nested-modal-Pattern (PR #53 Lesson). Escape-Handler ist live-readable über `disableCloseRef` (sync-during-render mutation).
- Existing Pan-Drag-Pattern: keiner. HTML5-DragGesture mit Pan ist neu im Codebase.

### Architektur-Nachbarschaft

- `JournalSection.tsx` und ähnliche Editor-Modals nutzen `<Modal>` parent, kein nested-modal-Pattern aktiv im Repo. Wir sind die ersten.
- `RichTextEditor.tsx` öffnet `MediaPicker` als Sibling-Modal (über `setShowMediaPicker(true)` Toggle), aber NICHT mit `disableClose` Stack-Pattern — es ist eher serieller Open/Close.
- `DirtyContext` snapshottet `form.images` automatisch — `cropX/cropY`-Änderungen schlagen via Reference-Equality automatisch in DirtyContext durch (kein separater Hook nötig).

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
   if (img.cropX === undefined || img.cropX === null) { /* skip → omit from output */ }
   else if (typeof img.cropX !== "number" || !Number.isFinite(img.cropX) || img.cropX < 0 || img.cropX > 100) {
     return { ok: false, error: "crop value out of range" };
   } // analog cropY
   ```
   **Pflicht: validierte Werte landen im Output** (Sonnet-Spec-R1 [Critical] #1 — sonst silent-discard):
   ```ts
   const validatedCropX = (img.cropX === undefined || img.cropX === null) ? undefined : img.cropX;
   const validatedCropY = (img.cropY === undefined || img.cropY === null) ? undefined : img.cropY;
   cleaned.push({ public_id, orientation, width, height, alt, cropX: validatedCropX, cropY: validatedCropY });
   ```
   **Auch der `raw` Parameter-Type von `validateImages()` muss erweitert werden** (Sonnet-Spec-R1 [Med] #7) — `cropX?: number | null; cropY?: number | null` an die Inline-Type-Definition.
   Test-Coverage explizit für: cropX=50/cropY=50 valid (UND output enthält die Werte!), cropX=-1 reject, cropX=101 reject, cropX="50" reject (parseInt-Trap-Regression), cropX=0 valid + im output (boundary), cropX=100 valid + im output (boundary), cropX=33.33 valid + im output (fraction), beide undefined → output ohne cropX/cropY (= preserve), **cropX=null → output ohne cropX (= preserve, kein 400)**.

3. **Public Renderer wendet `object-position` an** — `src/components/AgendaItem.tsx`: bei jedem `<img>` (Single-Image-Branch + Multi-Image-Grid) wird `objectPosition: \`${cropX ?? 50}% ${cropY ?? 50}%\`` zusätzlich zu `objectFit: "cover"` gesetzt. Test-Coverage: 4 Branches (Single/Multi × default/custom-crop). Default-Branch asserted `objectPosition` als `"50% 50%"` (nicht `undefined` — explizit für CSS-Determinismus).

4. **DB-Layer durchreicht cropX/cropY** — `src/lib/queries.ts` getAgendaItems mapping leitet `img.cropX` und `img.cropY` defensiv durch (`typeof === "number" && Number.isFinite ? value : undefined`). Test in `queries-agenda.test.ts` für Pass-Through + Legacy-Row (img ohne crop-Felder → undefined).

5. **Dashboard Crop-Icon-Button auf filled Slot** — `AgendaSection.tsx`: kleiner Crop-Icon-Button oben-links auf jedem `slot-filled-${i}` (analog zum existing ✕ oben-rechts). Inline-SVG (Crop-Icon, ähnlich Lucide), `aria-label={t.crop.openModal}`, `data-testid="crop-${i}"`, `type="button"`. Click triggert `setCropModalIndex(i)`. Button stoppt nicht den parent draggable (= keine `e.stopPropagation()` auf click — drag funktioniert weiterhin auf restlicher Slot-Fläche).

6. **`CropModal.tsx` Component** — neue Datei `src/app/dashboard/components/CropModal.tsx`, exportiert `CropModal({ open, onClose, image, onSave })`:
   - **MUSS `"use client"` als first-line-directive** (Sonnet-Spec-R1 [Low] #10 — App-Router SSR-Fehler sonst). Verwendet hooks (useState/useRef) + pointer events.
   - **Props**: `open: boolean`, `onClose: () => void`, `image: AgendaImage` (= read-only, source-of-truth bei Open), `onSave: (cropX: number, cropY: number) => void`.
   - **Internal Draft-State + Adjust-State-During-Render Pattern** (Sonnet-Spec-R1 [High] #4 — react.md anti-pattern verboten):
     ```tsx
     const [draftCropX, setDraftCropX] = useState(image.cropX ?? 50);
     const [draftCropY, setDraftCropY] = useState(image.cropY ?? 50);
     const [prevImage, setPrevImage] = useState(image);
     // Re-init bei image-prop change ODER open-toggle (false→true) — synchronously
     // during render, NICHT in useEffect (lessons.md, react.md "Adjust state during render").
     if (image !== prevImage) {
       setPrevImage(image);
       setDraftCropX(image.cropX ?? 50);
       setDraftCropY(image.cropY ?? 50);
     }
     ```
     KEINE Mutation von `image` während Drag.
   - **Modal-Container**: nutzt `<Modal>` Primitive mit eigenem `open` + `onClose` (= props), eigenem Title `t.crop.modalTitle`. NICHT `disableClose` auf sich selbst (= darf via Esc geschlossen werden).
   - **Preview-Layout**: Original-Bild im Modal-Body, **`<img>` MUSS `style={{ objectFit: "contain", maxWidth: "100%", maxHeight: "70vh" }}`** (Sonnet-Spec-R1 [Med] #9 — sonst croppt das Preview selbst und vereitelt das Crop-Tool). Container darüber für absolute-positioned Frame-Overlay.
   - **Frame Overlay Math** (Sonnet-Spec-R1 [High] #6 — explizite Formeln):
     ```ts
     // 1. Container-Dims aus getBoundingClientRect des <img> Elements (NICHT Image.width/height-Props):
     const { width: cw, height: ch } = imgRef.current.getBoundingClientRect();
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
   - **Pan-Drag**: PointerDown auf Preview-Container startet Drag (saved start-cropX/Y + start-pointer-coords), `setPointerCapture` für drag-beyond-container. PointerMove updated draftCropX/Y via Drag-Delta-Mapping. PointerUp endet Drag + `releasePointerCapture`. Touch + Mouse via `pointerEvents` (single API).
   - **Numerische Inputs**: zwei `<input type="number" min="0" max="100" step="1">` für X und Y, gelabelt mit `t.crop.xLabel` / `t.crop.yLabel`. onChange updated draftState (mit clamp 0..100).
   - **Reset-Button**: setzt draftState auf `{cropX: 50, cropY: 50}`, `data-testid="crop-reset"`.
   - **Speichern-Button**: ruft `onSave(draftCropX, draftCropY)`, `data-testid="crop-save"`, `type="button"`.
   - **Abbrechen-Button**: ruft `onClose()` ohne save, `data-testid="crop-cancel"`.

7. **AgendaSection.tsx integriert CropModal** — neuer State `cropModalIndex: number | null` (= welcher Slot, null = closed). Render via **conditional-rendering** (Sonnet-Spec-R1 [Critical] #2 — `array[null]` TS-error sonst):
   ```tsx
   {cropModalIndex !== null && (
     <CropModal
       open={true}
       onClose={handleCropClose}
       image={form.images[cropModalIndex]}
       onSave={handleCropSave}
     />
   )}
   ```
   **Stable Callbacks via useCallback mit korrekten deps** (Sonnet-Spec-R1 [Med] #11 — sonst stale-closure):
   ```tsx
   const handleCropOpen = useCallback((i: number) => setCropModalIndex(i), []);
   const handleCropClose = useCallback(() => setCropModalIndex(null), []);
   const handleCropSave = useCallback((cropX: number, cropY: number) => {
     setForm((prev) => {
       if (cropModalIndex === null) return prev; // defensive
       const images = [...prev.images];
       images[cropModalIndex] = { ...images[cropModalIndex], cropX, cropY };
       return { ...prev, images };
     });
     setCropModalIndex(null);
   }, [cropModalIndex]); // PFLICHT — sonst stale-closure mutiert immer slot 0
   ```

8. **Stack-Safe Nested Modal** — Parent Edit-Modal in `AgendaSection.tsx` bekommt `disableClose={cropModalIndex !== null}`. Solange Crop-Modal offen ist:
   - Edit-Modal blockt Esc + Backdrop-Click + ✕-Button (via existing Modal disableClose mechanism).
   - Esc im Crop-Modal closet nur Crop-Modal (Crop-Modal hat KEIN disableClose).
   - Focus return: Crop-Modal cleanup-effect restored focus zum Crop-Icon-Button (= previously focused). Das ist bereits standard Modal-Behavior (line 79 in Modal.tsx).
   - **Test-Coverage**: 3 Tests: (a) Edit-Modal `disableClose=true` während Crop offen, (b) Esc bei beiden offen schliesst nur Crop, (c) nach Crop close ist Edit-Modal wieder dismissible.

9. **Pan-Drag Mapping-Contract** — präziser Algorithmus (Frame-Math siehe Req #6):
   - User zieht den 2:3-Frame über das Original-Bild.
   - Mapping: `cropX = clamp(startCropX + (deltaPx / cw) * 100, 0, 100)`, analog cropY. Drag-Delta = current-pointer-pos minus pointerDown-pos (NICHT absolute pointer position, sonst snapt Frame zum Pointer).
   - **Edge-Case „Achse ohne Bewegungsraum"** (Sonnet-Spec-R1 [High] #5 — generelle Regel statt nur exact-2:3):
     ```ts
     const targetAspect = 2 / 3;
     const imageAspect = cw / ch;
     // Wider-than-2:3 image (landscape z.B. 16:9): Y-axis hat keinen Spielraum
     //   (Frame deckt full image height ab) → Y-drag freezen.
     // Taller-than-2:3 image (portrait z.B. 3:4): X-axis hat keinen Spielraum
     //   (Frame deckt full image width ab) → X-drag freezen.
     // Exact-2:3: beide Axes frozen.
     const yHasRoom = imageAspect < targetAspect; // taller than 2:3 → Y can move
     const xHasRoom = imageAspect > targetAspect; // wider  than 2:3 → X can move
     // In pointermove handler:
     if (xHasRoom) setDraftCropX(newCropX);
     if (yHasRoom) setDraftCropY(newCropY);
     ```
   - **Test-Coverage** (Mock pointerEvents in jsdom — pointerEvents nicht nativ in jsdom, custom CustomEvent mit pointerId/clientX/clientY workaround):
     - Drag-far-left → cropX clamped auf 0
     - Drag-far-right → cropX clamped auf 100
     - **Landscape 16:9 image fixture**: Y-Drag → draftY unverändert (frozen)
     - **Portrait 3:4 image fixture**: X-Drag → draftX unverändert (frozen)
     - Square (= exact-2:3 with cw=200, ch=300) image: beide Axes frozen
     - jsdom getBoundingClientRect Stub mit fixed cw/ch zur deterministischen Math-Verifikation.

10. **Keyboard A11y** — Crop-Modal:
    - **Numerische Inputs**: existierender HTML-Input-Behavior (Up/Down arrows nudgen by step=1).
    - **Pan-Drag-Container**: `role="application"`, `tabIndex=0`, `aria-label={t.crop.dragHint}`. Arrow-Keys nudgen `draftX/draftY` by 1 (Plain), 10 (Shift). Test: focus container + ArrowRight → draftX += 1, Shift+ArrowRight → +=10, clamp at 100.
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

13. **Tests grün** — `pnpm build` + `pnpm test` + `pnpm exec tsc --noEmit` clean. Mindestens **+30 neue Tests**:
    - `agenda-images.test.ts` (extend or create) — 9 Tests für validateImages crop-validation (siehe #2; +1 für `cropX=null → preserve`).
    - `AgendaItem.test.tsx` (extend) — 4 Tests für object-position (Single/Multi × default/custom).
    - `queries-agenda.test.ts` (extend) — 2 Tests für cropX/cropY mapping (defined / undefined).
    - `CropModal.test.tsx` (new) — 12+ Tests:
      - Renders mit initial draft = image.cropX/cropY oder default 50/50
      - Numeric input X update draftX
      - Numeric input Y update draftY
      - Reset-Button setzt beide auf 50
      - Speichern-Button calls onSave(draftX, draftY) + parent sees mutation
      - Abbrechen-Button calls onClose ohne onSave
      - Pan-Drag pointerDown+Move+Up updated draftX/draftY synchronously
      - Pan-Drag clamped at 0 (drag-far-left)
      - Pan-Drag clamped at 100 (drag-far-right)
      - Arrow-Key nudge: Right +1, Left -1
      - Shift+Arrow nudge: +10/-10
      - Pan-Container has role="application" + tabIndex=0 + aria-label
      - Modal title shown
      - All buttons have type="button" (form-submit-trap regression)
      - On image-prop change while open, draft re-initialized
    - `AgendaSection.test.tsx` (extend) — 4+ Tests:
      - Crop-Icon-Button rendered on filled slot, not on empty slot
      - Click crop-button opens CropModal (data-testid="crop-modal" oder via mock)
      - Edit-Modal has disableClose=true while crop modal open
      - onSave from CropModal mutates form.images[i].cropX/cropY, dirty-context flagged
      - Esc while crop open does not close edit modal (parent disabled)

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
| `src/lib/agenda-images.test.ts` | Create | 8 Tests siehe Spec-Requirement #2. |
| `src/lib/queries.ts` | Modify | Mapping in `getAgendaItems` extend: `cropX: typeof img.cropX === "number" && Number.isFinite(img.cropX) ? img.cropX : undefined` analog für cropY. |
| `src/lib/queries-agenda.test.ts` | Modify | +2 Tests für cropX/cropY pass-through + legacy-row defensive undefined. |
| `src/components/AgendaItem.tsx` | Modify | Beide `<img>`-Branches (Single + Multi-Grid): `style={{ objectFit: "cover", objectPosition: \`${img.cropX ?? 50}% ${img.cropY ?? 50}%\` }}`. |
| `src/components/AgendaItem.test.tsx` | Modify | +4 Tests siehe Spec-Requirement #3. |
| `src/app/dashboard/components/CropModal.tsx` | Create | Neues Component, ~250 Zeilen. Pan-Drag via pointerEvents, numerische Inputs, Reset/Save/Cancel-Buttons, Modal-Wrapper. |
| `src/app/dashboard/components/CropModal.test.tsx` | Create | 12+ Tests siehe Spec-Requirement #13. |
| `src/app/dashboard/components/AgendaSection.tsx` | Modify | (a) Neuer State `cropModalIndex: number \| null`. (b) Crop-Icon-Button auf filled-slot oben-links (parallel zum ✕). (c) Edit-Modal `disableClose={cropModalIndex !== null}`. (d) `<CropModal>` als sibling, mit useCallback-stabilisierten onClose/onSave. (e) `handleCropSave` mutiert `form.images[i]` mit cropX+cropY. |
| `src/app/dashboard/components/AgendaSection.test.tsx` | Modify | +4 Tests siehe Spec-Requirement #13. Mock `CropModal` analog MediaPicker-Mock-Pattern. |
| `src/app/dashboard/i18n.tsx` | Modify | Neue Keys unter `agenda.crop` (siehe #12). |
| `src/app/api/dashboard/agenda/route.ts` | No-Op | POST nutzt validateImages() — neue Felder werden automatisch validated und persistiert. |
| `src/app/api/dashboard/agenda/[id]/route.ts` | No-Op | PUT nutzt validateImages() — ebenfalls automatisch. |
| `src/app/api/dashboard/agenda/route.test.ts` | Modify | +2 Tests: POST mit `images: [{..., cropX: 50, cropY: 50}]` → 201; POST mit `images: [{..., cropX: 101}]` → 400 (error matches `/crop/i`). |
| `src/app/api/dashboard/agenda/[id]/route.test.ts` | Modify | +2 Tests (Sonnet-Spec-R1 #8): PUT mit `{images: [{..., cropX: 50}]}` → 200; PUT mit `{images: [{..., cropX: 101}]}` → 400 (error matches `/crop/i`). |
| `src/lib/schema.ts` | No-Op | `images` ist bereits JSONB — keine ALTER nötig. Felder kommen via JSONB-shape. |

### Architecture Decisions

- **`cropX/cropY` in JSONB statt eigene DB-Spalte** — bleibt im `images` JSONB-Array, genau wie `width`, `height`, `alt`. Kein Schema-Change. Defaults sind code-side (`?? 50`), nicht DB-side. Vereinfacht Migration komplett (kein DDL-Deploy).
- **Optional + default 50** — `undefined` = „User hat nie gecropped" → 50/50 (= visuelles Zentrum, equivalent zu pre-Sprint-2-default). Kein Migration-UPDATE nötig.
- **Nested-Modal Stack-Safe via Parent.disableClose** — Parent (Edit-Modal) wird unbedien­bar wenn Crop-Modal offen ist. Esc im Crop-Modal trifft Crop-Modals eigenen Handler zuerst (= cancellable Bubble-Phase im keydown). Tests verifizieren NICHT Bubble-Order direkt sondern Effekt: Esc → nur Crop closes, Edit bleibt offen. Modal.tsx hat bereits diesen Mechanismus (lesson PR #53 R1 P2).
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
- **Modal vs Modal — beide haben Esc-Handler aktiv via `window.addEventListener`** — beide listener feuern. Aber Crop-Modal-Handler resettet seinen own `cropModalIndex=null`, Edit-Modal-Handler greift seinen eigenen `disableCloseRef.current = true` und macht nix. Effekt: nur Crop closes. Test-pflicht: Esc bei beiden offen → assert nur Crop closes.
- **CropModal `image`-Prop ändert sich während offen** — z.B. User klickt Crop-Button auf Slot 0, dann (irgendwie) auf Slot 1 ohne dazwischen Close. Sollte nicht passieren da Slot 0's Crop-Modal-Render ist exclusive. Aber defensive: useEffect on `[image, open]` re-initialisiert draft. Test-Coverage.
- **Pan-Drag während Save-Click** — User zieht, while-mid-drag clickt Save. PointerUp + Click feuern beide. Sollte nicht passieren (Save-Button nicht im Pan-Container). Aber defensive: pointer-events-isolation per Container. Sollte CSS via `pointer-events` regulär greifen.
- **cropX=0 vs cropX=undefined Render-Effekt** — Renderer macht `cropX ?? 50`, also `0` valid → 0%, undefined → 50%. Test pflicht.

## Test plan
- [ ] Schema/Validation: agenda-images.test.ts +8 Tests
- [ ] Public Renderer: AgendaItem.test.tsx +4 Tests
- [ ] Queries: queries-agenda.test.ts +2 Tests
- [ ] CropModal: CropModal.test.tsx +12 Tests (new file)
- [ ] AgendaSection: AgendaSection.test.tsx +4 Tests
- [ ] API: agenda/route.test.ts +2 Tests
- [ ] Total agenda suite: 64 → ~96 passed
- [ ] tsc clean, pnpm audit 0 HIGH/CRITICAL
- [ ] Lokal-Smoke: Editor → Crop-Button → Modal öffnet → Pan-Drag funktioniert → Save schreibt cropX/cropY in form → DB-Row hat crop-Werte
- [ ] Public-Render-Smoke: bestehender Eintrag mit cropX=20 → object-position: 20% 50% sichtbar (nach prod-deploy)
- [ ] Lokal-Smoke Stack-Safety: Edit-Modal Esc nicht dismissible während Crop offen
- [ ] Staging-Deploy + Logs clean

## Risks

1. **Pan-Drag-Mapping mit nicht-quadratischen Bildern** — komplexes 2:3-vs-Image-Aspect-Math. Mitigation: präziser Test-Plan mit Mock-Pointer-Events, Boundary-Werte 0/100 verifizieren visuell.
2. **Nested-Modal Esc-Handler-Race** — beide modals listen `window.keydown`, beide React-Effects mounted. Mitigation: existing Modal disableCloseRef pattern (PR #53 lesson) + 3 explizite Tests für Stack-Safety.
3. **Crop-Button vs Drag-Reorder Konflikt** — Click auf Crop-Button darf nicht den slot draggable interferieren. Mitigation: HTML5 Drag triggert nur bei mousemove > threshold, einzelner Click ist safe. Test verifiziert beide Pfade unabhängig.
4. **Mobile Touch-Drag-Genauigkeit** — pointerEvents geben Touch-Support gratis, aber 2:3-Frame-Drag auf 320px Mobile ist fummelig. Mitigation: numerische Inputs als A11y-Fallback. Bulk-mobile-UX-Optimierung als Nice-to-Have.
5. **JSONB-Migration bestehender Bilder** — alle existing rows haben `images[i]` ohne cropX/cropY. Renderer fallback `?? 50` greift, kein Backfill nötig. Mitigation: defensiver Test mit legacy-shape image.

## References

- PR #122 (vorheriger Sprint): compact slot-grid + grid-above-editor + remove letterbox
- PR #121 (Sprint 1): Bilder-Grid 2.0 (cols + slot editor)
- PR #53 Codex R1 P2: Modal disableClose live-readable mechanism (= unsere stack-safety Voraussetzung)
- lessons.md 2026-04-19: Modal-onClose useCallback-stable
