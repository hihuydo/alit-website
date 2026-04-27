# Sprint: Agenda Per-Image Crop Modal — Sprint 2
<!-- Spec: tasks/spec.md -->
<!-- Started: 2026-04-27 -->
<!-- Branch: feat/agenda-image-crop-modal -->

## Done-Kriterien
> Alle müssen PASS sein bevor der Sprint als fertig gilt.

- [ ] DK-1: `pnpm build` grün, `pnpm exec tsc --noEmit` clean.
- [ ] DK-2: `pnpm test` grün, mindestens **+47 neue Tests** verteilt auf 7 Files (Sonnet-R10 [FAIL] #3 + Codex-R2 [Contract] reconciliation: spec body, test plan und DK-2 nennen ALLE die gleiche Zahl). Total: agenda-images 10 + AgendaItem 5 + queries-agenda 2 + CropModal 20 + AgendaSection 6 + agenda/route 2 + agenda/[id]/route 2 = 47. CropModal 20 = 17 single-Bullets + 2 multi-Bullets à 2 Tests + 1 Resize-Invalidation-Test. AgendaSection 6 = Crop-Icon-Render + Click-opens-modal + crop-preserved-on-unrelated-edit (Codex-R1) + Live-preview-reflects-crop (Sonnet-R10 #3) + Esc-stack-safety + Drag-reorder-regression.
- [ ] DK-3: `pnpm audit --prod` 0 HIGH/CRITICAL.
- [ ] DK-4: `AgendaImage` Type hat `cropX?: number; cropY?: number` (grep verifies in agenda-images.ts).
- [ ] DK-5: `validateImages()` rejected bei `cropX=101` oder `cropX="50"` (Range + Type-Guard, siehe Spec #2).
- [ ] DK-6: Public Renderer setzt `objectPosition` auf BEIDEN render-paths (Single-Image + Multi-Grid). Test asserted `style.objectPosition === "50% 50%"` für default und `"33% 67%"` für custom-crop.
- [ ] DK-7: `getAgendaItems()` mapping passes `cropX/cropY` durch. Legacy-row ohne crop-Felder → undefined (nicht 0, nicht null).
- [ ] DK-8: **Lokal-Smoke**: Editor → bestehender Eintrag mit Bildern editieren → Crop-Button (oben-links auf Slot 0) sichtbar → click öffnet Crop-Modal → Pan-Drag verschiebt Frame visuell → Save → DB-Row hat `images[0].cropX/cropY` Werte.
- [ ] DK-9: **Lokal-Smoke**: Pan-Drag bis ans Limit → cropX clamped auf 0/100, cropY clamped auf 0/100 (verifiziert via numerische Input-Anzeige).
- [ ] DK-10: **Lokal-Smoke**: Crop-Modal offen → Esc → nur Crop-Modal closet, Inline-Edit-Form bleibt sichtbar (Form ist inline `<div>`, KEIN parent-Modal — Sonnet R2 [Critical] #1). Kein disableClose-Mechanismus involved.
- [ ] DK-11: **Lokal-Smoke**: Numeric-Input X = 0 → frame ganz links → Save → public render bei nächstem reload zeigt object-position: 0% Y%. Numeric-Input X = 100 → ganz rechts.
- [ ] DK-12: **Lokal-Smoke**: Reset-Button → beide draftX/draftY auf 50 → Save → DB-Row hat 50/50.
- [ ] DK-13: **Lokal-Smoke**: Crop-Button click triggert KEINEN Drag-Reorder (Slot-Position bleibt unverändert). Drag der restlichen Slot-Fläche reordert weiterhin korrekt.
- [ ] DK-14: **Lokal-Smoke a11y**: Tab in Crop-Modal cycles Pan-Container → X-Input → Y-Input → Reset → Cancel → Save. ArrowRight in Pan-Container → cropX += 1. Shift+ArrowRight → cropX += 10.
- [ ] DK-15: **Staging-Deploy** Logs clean (keine SSR-Errors mit digest, keine ensureSchema crashes — keine erwartet da kein Schema-Change).
- [ ] DK-16: **Public-Render Browser-Smoke nach Staging-Deploy**: bestehender Multi-Image-Eintrag mit cropX=20 cropY=70 in DB → öffentlicher Eintrag rendert mit `object-position: 20% 70%` (DevTools-Verifikation).

## Tasks

### Phase 1 — Schema/Validation + Public Renderer + Queries
- [ ] `src/lib/agenda-images.ts`: `AgendaImage` Type extend mit `cropX?: number; cropY?: number`. `validateImages()` per-image Loop um Crop-Range-Check.
- [ ] +Test: `src/lib/agenda-images.test.ts` (Create) — 10 Tests (siehe Spec #2; inkl. cropX=null + cropY=null preserve).
- [ ] `src/lib/queries.ts`: in der image-mapping innerhalb `getAgendaItems`-Loop, `cropX/cropY` als zusätzliche Felder durchreichen mit `Number.isFinite`-guard.
- [ ] +Test: `src/lib/queries-agenda.test.ts` (extend) — 2 neue Tests für crop-pass-through.
- [ ] `src/components/AgendaItem.tsx`: in beiden `<img>`-Branches `style.objectPosition` setzen mit `${cropX ?? 50}% ${cropY ?? 50}%` Template.
- [ ] +Test: `src/components/AgendaItem.test.tsx` (extend) — 5 neue Tests (inkl. cropX=0 boundary `??` vs `||` regression-guard).

### Phase 2 — CropModal Component
- [ ] `src/app/dashboard/components/CropModal.tsx` (Create): `"use client"` first-line directive. Component-Skelett mit Preview/Pan-Container = EIN single `<div>` (Sonnet-R10 [FAIL] #1 — wraps direkt `<img>` + frame-overlay, `width: fit-content`, `position: relative`, `touchAction: none`, role/tabIndex/aria-label, alle Pan-Drag-pointerEvents-Handler + onKeyDown an diesem Container). Numerische X/Y-Inputs, Reset/Save/Cancel-Buttons. Draft-State via useState. **Re-init via Adjust-State-During-Render** (Codex-Spec-R1 + Sonnet-R10 advisory B — `if (image !== prevImage) { setDraftCropX(...); ... }` synchronously im render-body, NICHT useEffect; **prevOpen-Tracking entfernt** weil unter conditional-rendering open immer true ist und das Component bei Close unmountet). `clamp` als module-level const ABOVE Component (Sonnet-R8 advisory C).
- [ ] **Resize-Invalidation-Hook** (Codex-Spec-R1 [Architecture] #1, siehe Spec Req 6): `useReducer((x)=>x+1,0)` + `useEffect` listening auf `window.resize` + `orientationchange` während `open === true` → forceRerender. Sonst stale Frame-Overlay nach viewport-resize/orientation.
- [ ] Pan-Drag-Algorithmus: PointerDown gated on `imgLoaded` (Sonnet-Spec-R6 #5), `dragStartRef = useRef` setzen + setPointerCapture; PointerMove berechnet fresh getBoundingClientRect (window-resize-safe), delta-mapping, `if (xHasRoom) setDraftCropX(...)` / `if (yHasRoom) setDraftCropY(...)`; PointerUp + PointerCancel clearen dragStartRef + releasePointerCapture.
- [ ] Frame-Overlay-CSS: absolute-positioned div mit `border: 2px solid rgba(255,255,255,0.9)` + `boxShadow: 0 0 0 9999px rgba(0,0,0,0.4)` + `pointerEvents: none`. Nur rendered wenn `imgLoaded === true`.
- [ ] Pan-Container CSS: `touchAction: none` (Sonnet-Spec-R5 #3 — sonst silent-no-op auf Mobile), `role="application"`, `tabIndex={0}`, `aria-label`.
- [ ] Keyboard-Handler auf Pan-Container: ArrowKeys nudgen draftState by 1 (Plain) / 10 (Shift), `e.preventDefault()` IMMER auch bei frozen-axis (sonst page-scroll), state-mutation nur wenn `xHasRoom`/`yHasRoom`.
- [ ] Alle Buttons `type="button"` (form-submit-trap regression).
- [ ] +Tests: `src/app/dashboard/components/CropModal.test.tsx` (Create) — **20 Tests** (siehe Spec #13). beforeEach stub `HTMLElement.prototype.setPointerCapture` + `releasePointerCapture` (jsdom-Lücke, Sonnet-Spec-R2 #4).

### Phase 3 — AgendaSection Integration (kein Stack-Safety nötig — inline-Form, kein nested-modal-Pattern)
- [ ] `src/app/dashboard/components/AgendaSection.tsx`:
  - **Form-State Crop-Preserve** (Codex-Spec-R1 [Correctness] #1+#2 + Sonnet-R8 [FAIL] #3 + Codex-R2 [Correctness] — silent-data-loss + Live-Preview-Mismatch-Fix). DREI Stellen MUSS aktualisiert werden:
    - `interface AgendaItem` images-inline-type (`AgendaSection.tsx:39`) extend mit `cropX?: number; cropY?: number` (Sonnet-R9 [FAIL] #1 — sonst TS strict-mode error).
    - `interface ImageDraft` (`AgendaSection.tsx:49`) extend mit `cropX?: number; cropY?: number`.
    - `openEdit()` Image-Mapping (`AgendaSection.tsx:180-186`) extend mit `cropX: img.cropX, cropY: img.cropY`.
    - **(a) `previewItem` useMemo Image-Mapping (`AgendaSection.tsx:~326`, der `useMemo([showPreview, form, editingLocale])` Block)** — NICHT die handleSave-payload! (Sonnet-R8 [FAIL] #3 + Codex-R2 [Correctness] — alte stale "326+533 als Save-Pfade"-Beschreibung entfernt). MUSS cropX/cropY durchreichen sonst rendert Live-Preview immer 50/50.
    - **(b) `handleSave()` POST-Payload (`AgendaSection.tsx:~533`, der `creating`-branch)** — MUSS cropX/cropY durchreichen.
    - **(c) `handleSave()` PUT-Payload (zweite handleSave-Stelle, `editing`-branch)** — MUSS ebenfalls cropX/cropY durchreichen.
  - Import `CropModal`. Neuer State `cropModalIndex: number | null`.
  - `handleCropOpen`, `handleCropClose`, `handleCropSave` Callbacks via `useCallback` (deps: `[]`, `[]`, `[cropModalIndex]`). **`handleCropSave` MUSS `const i = cropModalIndex` VOR `setForm` capturen + null-check VOR setForm** (Sonnet-R8 [FAIL] #4 functional-updater-purity).
  - Edit-Form ist inline `<div>` — KEIN parent `<Modal>`, KEIN `disableClose`-Mechanismus nötig.
  - Crop-Icon-Button im filled-slot template oben-links: inline-SVG mit `aria-hidden="true"` (Sonnet-R8 [FAIL] #2), `aria-label`, `data-testid="crop-${i}"`, `type="button"`.
  - `<CropModal>` conditional-rendered (`{cropModalIndex !== null && cropModalIndex < form.images.length && <CropModal ... />}` mit defensive index-bound-check, Sonnet-R9 advisory B) am Ende des Inline-Form-Body, mit `image={form.images[cropModalIndex]}`.
- [ ] `src/app/dashboard/i18n.tsx`: neue Keys unter `agenda.crop` (siehe Spec #12).
- [ ] +Tests: `src/app/dashboard/components/AgendaSection.test.tsx` (extend) — **6 neue Tests** (siehe Spec #13): Crop-Icon-Render (+ aria-hidden assert) + Click-opens-modal + crop-preserved-on-unrelated-edit (Codex-R1) + **Live-preview-reflects-crop (Sonnet-R10 [FAIL] #3 — eigener Bullet, nicht versteckt)** + Esc-stack-safety + Drag-reorder-regression (mit konkreter mockDataTransfer.setData-Assertion, NICHT not.toThrow trap — Sonnet-R10 [FAIL] #4).
- [ ] **ZWEI top-level vi.mocks** (Sonnet-R10 [FAIL] #6 — Hoisting-Konsistenz): (1) `vi.mock("./CropModal", ...)` (neu in Sprint 2, kein conflict), (2) `vi.mock("@/components/AgendaItem", () => ({ default: ({ images }) => <div data-testid="mock-agenda-item" data-images={JSON.stringify(images)} /> }))` (PFLICHT-Verifikation existing tests vorher: grep `getByText("Eintrag")` o.ä. — könnten brechen, dann anpassen auf JSON.parse(dataset.images)-Assertions).

### Phase 4 — API + Verify
- [ ] `src/app/api/dashboard/agenda/route.test.ts` (extend) — 2 neue Tests: POST mit valid crop → 201, POST mit `cropX=101` → 400.
- [ ] `src/app/api/dashboard/agenda/[id]/route.test.ts` (extend) — 2 neue Tests (Sonnet R1 #8): PUT mit valid crop → 200, PUT mit cropX=101 → 400.
- [ ] `pnpm build` + `pnpm test` + `pnpm exec tsc --noEmit` grün.
- [ ] `pnpm audit --prod` 0 HIGH/CRITICAL.

## Phase-Checkpoints
> Nach jeder Phase: `pnpm build` + `pnpm test` + `pnpm exec tsc --noEmit` grün, eigener Commit, eigener Codex-Round-fähiger Punkt.

## Notes
- **Schema-Change ist additive im JSONB** — kein DDL, kein ensureSchema-Change, kein Migration-Risk.
- **Defensive Default 50/50** — alle bestehenden rows ohne crop bleiben visuell identisch.
- **DROP COLUMN für `images_fit`** ist orthogonal — bleibt als Follow-up sprint in `memory/todo.md`.
- **pointerEvents ist breit unterstützt** (>96% Browsern, Caniuse) — kein Polyfill nötig.
- **Kein Stack-Safety / disableClose nötig** — Edit-Form ist inline `<div>`, CropModal ist der einzige Modal im Stack (Sonnet R2 [Critical] #1). Esc routed deterministisch zu CropModal. Verifiziert via Test (DK-10 + AgendaSection.test.tsx).
- **Adjust-State-During-Render statt useEffect** für CropModal draft-re-init bei image-prop-change (Codex-Spec-R1, react.md anti-pattern verboten). prevOpen-Tracking entfernt (Sonnet-R10 advisory B — dead code unter conditional-rendering, fresh mount übernimmt re-init). Plus separater Resize-Invalidation-Hook (`useReducer + useEffect window.resize+orientationchange`) gegen stale Frame-Overlay (Codex-Spec-R1 [Architecture] #1).
- **Codex-R2 (Final): APPROVED architecturally** — alle 4 Findings waren spec/todo document-drift (test counts, prevOpen-pattern, line 326 stale pointer). Eingearbeitet. Codex max=2 erreicht — Generator darf starten.
