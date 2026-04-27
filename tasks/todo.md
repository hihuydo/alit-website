# Sprint: Agenda Per-Image Crop Modal — Sprint 2
<!-- Spec: tasks/spec.md -->
<!-- Started: 2026-04-27 -->
<!-- Branch: feat/agenda-image-crop-modal -->

## Done-Kriterien
> Alle müssen PASS sein bevor der Sprint als fertig gilt.

- [ ] DK-1: `pnpm build` grün, `pnpm exec tsc --noEmit` clean.
- [ ] DK-2: `pnpm test` grün, mindestens **+30 neue Tests** verteilt auf 6 Files (siehe Spec-Requirement #13).
- [ ] DK-3: `pnpm audit --prod` 0 HIGH/CRITICAL.
- [ ] DK-4: `AgendaImage` Type hat `cropX?: number; cropY?: number` (grep verifies in agenda-images.ts).
- [ ] DK-5: `validateImages()` rejected bei `cropX=101` oder `cropX="50"` (Range + Type-Guard, siehe Spec #2).
- [ ] DK-6: Public Renderer setzt `objectPosition` auf BEIDEN render-paths (Single-Image + Multi-Grid). Test asserted `style.objectPosition === "50% 50%"` für default und `"33% 67%"` für custom-crop.
- [ ] DK-7: `getAgendaItems()` mapping passes `cropX/cropY` durch. Legacy-row ohne crop-Felder → undefined (nicht 0, nicht null).
- [ ] DK-8: **Lokal-Smoke**: Editor → bestehender Eintrag mit Bildern editieren → Crop-Button (oben-links auf Slot 0) sichtbar → click öffnet Crop-Modal → Pan-Drag verschiebt Frame visuell → Save → DB-Row hat `images[0].cropX/cropY` Werte.
- [ ] DK-9: **Lokal-Smoke**: Pan-Drag bis ans Limit → cropX clamped auf 0/100, cropY clamped auf 0/100 (verifiziert via numerische Input-Anzeige).
- [ ] DK-10: **Lokal-Smoke**: Crop-Modal offen → Esc → nur Crop-Modal closet, Edit-Modal bleibt offen. Click ✕ am Edit-Modal während Crop offen ist → no-op (disableClose true). Crop close → ✕ am Edit-Modal wird wieder klickbar.
- [ ] DK-11: **Lokal-Smoke**: Numeric-Input X = 0 → frame ganz links → Save → public render bei nächstem reload zeigt object-position: 0% Y%. Numeric-Input X = 100 → ganz rechts.
- [ ] DK-12: **Lokal-Smoke**: Reset-Button → beide draftX/draftY auf 50 → Save → DB-Row hat 50/50.
- [ ] DK-13: **Lokal-Smoke**: Crop-Button click triggert KEINEN Drag-Reorder (Slot-Position bleibt unverändert). Drag der restlichen Slot-Fläche reordert weiterhin korrekt.
- [ ] DK-14: **Lokal-Smoke a11y**: Tab in Crop-Modal cycles Pan-Container → X-Input → Y-Input → Reset → Cancel → Save. ArrowRight in Pan-Container → cropX += 1. Shift+ArrowRight → cropX += 10.
- [ ] DK-15: **Staging-Deploy** Logs clean (keine SSR-Errors mit digest, keine ensureSchema crashes — keine erwartet da kein Schema-Change).
- [ ] DK-16: **Public-Render Browser-Smoke nach Staging-Deploy**: bestehender Multi-Image-Eintrag mit cropX=20 cropY=70 in DB → öffentlicher Eintrag rendert mit `object-position: 20% 70%` (DevTools-Verifikation).

## Tasks

### Phase 1 — Schema/Validation + Public Renderer + Queries
- [ ] `src/lib/agenda-images.ts`: `AgendaImage` Type extend mit `cropX?: number; cropY?: number`. `validateImages()` per-image Loop um Crop-Range-Check.
- [ ] +Test: `src/lib/agenda-images.test.ts` (Create) — 8 Tests (siehe Spec #2).
- [ ] `src/lib/queries.ts`: in der image-mapping innerhalb `getAgendaItems`-Loop, `cropX/cropY` als zusätzliche Felder durchreichen mit `Number.isFinite`-guard.
- [ ] +Test: `src/lib/queries-agenda.test.ts` (extend) — 2 neue Tests für crop-pass-through.
- [ ] `src/components/AgendaItem.tsx`: in beiden `<img>`-Branches `style.objectPosition` setzen mit `${cropX ?? 50}% ${cropY ?? 50}%` Template.
- [ ] +Test: `src/components/AgendaItem.test.tsx` (extend) — 4 neue Tests.

### Phase 2 — CropModal Component
- [ ] `src/app/dashboard/components/CropModal.tsx` (Create): Component-Skelett mit Modal-Wrapper, Preview-Container, Pan-Drag-pointerEvents-Handler, numerische X/Y-Inputs, Reset/Save/Cancel-Buttons, Inline-Crop-Icon-SVG. Draft-State via useState, useEffect-re-init bei `[image, open]`.
- [ ] Pan-Drag-Algorithmus: PointerDown setzt isDragging=true + setPointerCapture; PointerMove berechnet relative-position innerhalb getBoundingClientRect (clamp 0..100); PointerUp clearet isDragging + releasePointerCapture.
- [ ] Frame-Overlay-CSS: absolute-positioned div mit semi-transparenter border + halbtransparenter Maske aussen herum.
- [ ] Keyboard-Handler auf Pan-Container: ArrowKeys nudgen draftState by 1 (Plain) / 10 (Shift), preventDefault auf Browser-Scroll.
- [ ] Alle Buttons `type="button"` (form-submit-trap regression).
- [ ] +Tests: `src/app/dashboard/components/CropModal.test.tsx` (Create) — 12+ Tests (siehe Spec #13).

### Phase 3 — AgendaSection Integration + Stack-Safe Nested Modal
- [ ] `src/app/dashboard/components/AgendaSection.tsx`:
  - Import `CropModal`. Neuer State `cropModalIndex: number | null`.
  - `handleCropOpen`, `handleCropClose`, `handleCropSave` Callbacks via `useCallback`.
  - Edit-Modal `disableClose={cropModalIndex !== null}` an existing `<Modal>` prop.
  - Crop-Icon-Button im filled-slot template oben-links: inline-SVG, `aria-label`, `data-testid="crop-${i}"`, `type="button"`.
  - `<CropModal>` als sibling am Ende des Editor-Modal-Body, mit null-guard image prop.
- [ ] `src/app/dashboard/i18n.tsx`: neue Keys unter `agenda.crop` (siehe Spec #12).
- [ ] +Tests: `src/app/dashboard/components/AgendaSection.test.tsx` (extend) — 4+ neue Tests (siehe Spec #13).
- [ ] CropModal-Mock im AgendaSection-Test analog MediaPicker-Mock-Pattern.

### Phase 4 — API + Verify
- [ ] `src/app/api/dashboard/agenda/route.test.ts` (extend) — 2 neue Tests: POST mit valid crop → 201, POST mit `cropX=101` → 400.
- [ ] `pnpm build` + `pnpm test` + `pnpm exec tsc --noEmit` grün.
- [ ] `pnpm audit --prod` 0 HIGH/CRITICAL.

## Phase-Checkpoints
> Nach jeder Phase: `pnpm build` + `pnpm test` + `pnpm exec tsc --noEmit` grün, eigener Commit, eigener Codex-Round-fähiger Punkt.

## Notes
- **Schema-Change ist additive im JSONB** — kein DDL, kein ensureSchema-Change, kein Migration-Risk.
- **Defensive Default 50/50** — alle bestehenden rows ohne crop bleiben visuell identisch.
- **DROP COLUMN für `images_fit`** ist orthogonal — bleibt als Follow-up sprint in `memory/todo.md`.
- **pointerEvents ist breit unterstützt** (>96% Browsern, Caniuse) — kein Polyfill nötig.
- **Stack-Safety mit existing Modal.tsx-Mechanismus** — wir reusen disableClose-Pattern statt eigenen Stack zu bauen.
