# Sprint: Agenda Bilder-Grid 2.0 — Sprint 1 (Grid + Fit + Dashboard-UX-Rework)
<!-- Spec: tasks/spec.md -->
<!-- Started: 2026-04-26 -->
<!-- Branch: feat/agenda-images-grid-2 -->

## Done-Kriterien
> Alle müssen PASS sein bevor der Sprint als fertig gilt.

- [ ] DK-1: `pnpm build` grün, `pnpm exec tsc --noEmit` clean.
- [ ] DK-2: `pnpm test` grün, mindestens **+38 neue Tests** (siehe Spec-Requirement #12).
- [ ] DK-3: `pnpm audit --prod` 0 HIGH/CRITICAL.
- [ ] DK-4: `psql -c "\d agenda_items"` (auf Staging nach Deploy) zeigt beide neue Spalten: `images_grid_columns INT NOT NULL DEFAULT 1 CHECK (images_grid_columns BETWEEN 1 AND 5)` und `images_fit TEXT NOT NULL DEFAULT 'cover' CHECK (images_fit IN ('cover','contain'))`.
- [ ] DK-5: `AgendaImage` zentrale Single-Source — `grep -n "interface AgendaImage" src/components/AgendaItem.tsx` ist leer (Type wird importiert, nicht redefiniert).
- [ ] DK-6: **Lokal-Smoke** (eigene Dev-DB, NICHT Staging): Editor neuer Eintrag, Mode auf „3 Spalten" wählen + 6 Bilder hochladen → Editor zeigt 3×2-Layout, Save erfolgreich, DB-Row hat `images_grid_columns=3`.
- [ ] DK-7: **Lokal-Smoke**: bestehender Eintrag mit 4 Bildern + Mode 2 → Wechsel auf Mode 4 → Bilder bleiben, Editor reflowt zu 1×4, Save erfolgreich, DB hat `images_grid_columns=4` und 4 Bilder unverändert.
- [ ] DK-8: **Lokal-Smoke**: Drop einer JPG-Datei aus Finder auf einen empty Slot → upload + Slot füllt sich. Drop von 2 Files gleichzeitig → erste füllt Target-Slot, zweite füllt nächsten empty Slot.
- [ ] DK-9: **Lokal-Smoke**: Drag eines filled Slots auf einen anderen filled Slot → Reorder im Form-State (sichtbar im Editor, persistiert nach Save).
- [ ] DK-10: **Lokal-Smoke**: Soft-Warning erscheint wenn 4 Bilder + Mode 3 („Letzte Reihe enthält 1 von 3 Bildern"), verschwindet wieder bei 3 oder 6 Bildern.
- [ ] DK-11: **Lokal-Smoke** Public-Render: `cols=1 + 1 landscape` → full-width; `cols=1 + 1 portrait` → 50% zentriert; Bild ohne `width`/`height` → Fallback aspect-ratio (4/3 landscape, 3/4 portrait). `cols=3 + 6 cover` → 3×2 Grid mit cover-fit. `cols=3 + 6 contain` → 3×2 Grid mit Letterbox (transparenter BG, Panel-Rot scheint durch).
- [ ] DK-12: **API-Smoke** (lokal via curl, optional readonly auf Staging): `GET /api/agenda/` liefert `images_grid_columns` + `images_fit`. POST mit `images_grid_columns: 6` → 400 `invalid_grid_columns`. POST mit `images_fit: "fill"` → 400 `invalid_fit`.
- [ ] DK-13: **Staging-Deploy** (read-only smokes): `docker compose logs --tail=50 alit-staging` clean nach Deploy (keine ALTER-Errors, kein ensureSchema-Crash, keine SSR-Errors mit digest). Public-Render eines bestehenden Multi-Image-Eintrags lädt sichtbar als defensive Edge-Case Branch (= visuelle Migration sichtbar, akzeptiert per Spec-Risk #1).

## Tasks

### Phase 1 — Schema + Type-Cleanup + Public-Renderer
- [ ] `src/lib/schema.ts`: zwei `ALTER TABLE … ADD COLUMN IF NOT EXISTS` Statements + CHECK-Constraints in `ensureSchema()`. Update CREATE TABLE block für fresh DBs. Idempotent verifiziert (zweiter Boot crasht nicht).
- [ ] `src/lib/queries.ts`: `getAgendaItems` SELECT erweitert um `images_grid_columns, images_fit`. Mapping mit defensiven Fallbacks (`?? 1` bzw `=== "contain" ? "contain" : "cover"`).
- [ ] `src/components/AgendaItem.tsx`: (a) lokale `interface AgendaImage` löschen, `import { AgendaImage } from "@/lib/agenda-images"` UND `export type { AgendaImage } from "@/lib/agenda-images"` für downstream Consumer. Pre-Step: `grep -rn "AgendaImage" src/` für Blast-Radius-Liste. (b) `AgendaItemData` erweitert um `imagesGridColumns?: number` + `imagesFit?: "cover"|"contain"`. (c) Renderer leitet `cols = item.imagesGridColumns ?? 1` defensiv ab. Render-Logik komplett ersetzt (3 Branches: 0 / cols=1+length=1 mit beiden Fit-Modi / sonst). Alte col-span-Logik entfernt.
- [ ] +Test: `src/components/AgendaItem.test.tsx` (Create) — **12 Branches** gemäß Spec-Requirement #12.

### Phase 2 — API GET + POST + PUT
- [ ] `src/app/api/dashboard/agenda/route.ts` GET-Handler: nutzt `SELECT *`, neue Spalten kommen automatisch dazu nach ALTER TABLE. **Kein SQL-Change**, aber Row-Type in `AgendaSection.tsx` erweitert + Test für Response-Shape.
- [ ] `src/app/api/dashboard/agenda/route.ts` POST: explicit INSERT für `images_grid_columns` + `images_fit`. **Application-Defaults** wenn Felder fehlen (`?? 1` / `?? "cover"`, kein 400 für missing). **Strikte Type-Guards** (kein `parseInt`, siehe patterns/typescript.md): `typeof X !== "number" || !Number.isInteger(X) || X < 1 || X > 5` → 400. Analog `images_fit !== "cover" && images_fit !== "contain"` → 400.
- [ ] `src/app/api/dashboard/agenda/[id]/route.ts` PUT: dynamische SET-Clause via `!== undefined`-Branches + identische strikte Type-Guards. 400 bei out-of-range / falsch-typed.
- [ ] +Tests: `agenda/route.test.ts` GET-Response-Shape + POST-Validierung + `agenda/[id]/route.test.ts` PUT-Validierung gemäß Spec-Requirement #12.

### Phase 3 — Dashboard-UX-Rework + i18n
- [ ] `src/app/dashboard/i18n.tsx`: neue Strings (DE+FR) gemäß Spec-Requirement #9. **NICHT** in `src/i18n/dictionaries.ts`.
- [ ] `src/app/dashboard/components/AgendaSection.tsx`:
  - Form-State erweitert: `images_grid_columns: number` (default 1), `images_fit: "cover"|"contain"` (default cover), `visibleSlotCount: number` (UI-state, init = cols beim openEdit, NICHT max(cols, images.length)), `slotErrors: Record<number, string | null>` (transient hint-state für Upload-Failure).
  - Internal `AgendaItem` row-type erweitert um beide neue Felder, **stale `sort_order: number` Feld entfernen** (Spalte gedroppt in PR #108, Interface-Feld ist ghost).
  - emptyForm + openEdit + previewItem mapping erweitert (**previewItem MUSS neue Felder durchreichen**, openEdit nutzt **`images: item.images ?? []` null-Guard** — DB-Type erlaubt null, Form-State braucht non-null Array für Slot-Grid-Map).
  - Image-Block UI komplett neu:
    - **Mode-Picker** oben (Einzelbild/2/3/4/5 Spalten). Mode-Wechsel resettet `visibleSlotCount` auf neuen `cols` + cleart `slotErrors`. **Alle Buttons hier mit `type="button"`** (sonst form-submit-Trap, patterns/react.md).
    - **Fit-Toggle** neben Mode-Picker (Cover/Letterbox).
    - **Slot-Grid**: `style={{ gridTemplateColumns: \`repeat(\${cols}, 1fr)\` }}` inline (NICHT Tailwind arbitrary `grid-cols-[...]` — JIT scannt nur statische strings, runtime-cols silent broken). Sichtbare Slots = `Math.max(visibleSlotCount, images.length)`.
    - **Empty-Slot**: dashed border, „+", click → MediaPicker mit Target-Slot-Index, drop-from-OS → upload via Helper.
    - **Filled-Slot**: thumbnail + ✕ Remove top-right, `draggable=true`, click no-op, drop-from-anderen-Slot → reorder. OS-File-Drop = Noop.
    - **„+ neue Zeile"-Button** unter Slot-Grid (immer im DOM, bei cols=1 mit `disabled` Attribut + ausgegraut), erhöht `visibleSlotCount` um cols.
    - **Soft-Warning-Hints** unter Mode-Picker (beide Branches: `length > 0 && length % cols !== 0 && cols >= 2` UND `cols === 1 && length >= 2`).
  - State: `pickerTargetSlot: number | null` für MediaPicker-Target-Routing.
  - `handleMediaSelect` ersetzt: bei Slot-Index >= images.length → append am Ende (kein sparse-array). MediaPicker `onClose` + `onSelect` callbacks via `useCallback` stabilisiert (lessons.md 2026-04-19). `onClose` resettet zusätzlich `pickerTargetSlot=null` (verhindert stale-state bei consecutive clicks).
  - `uploadFileToMedia` Failure-Path: slot revert to empty + console.error + non-blocking inline hint. Multi-File-Loop bricht bei Failure ab, vorherige Erfolge bleiben.
- [ ] **`MediaPicker.tsx` Modify**: (a) `uploadFileToMedia(file: File): Promise<MediaPickerResult>` als named-export hinzufügen. (b) Props-Interface erhält `targetSlot?: number | null` als ignored passthrough (für AgendaSection-Type-Safety + Test-Mock data-slot Assertion).
- [ ] **Multi-File-Drop sequentiell**: `for (const file of files) { await uploadFileToMedia(file); ... }`, KEIN `Promise.all`. Bei Failure von File N: Loop bricht ab, Files 1..N-1 bleiben persisted.
- [ ] **`onDragOver={e => e.preventDefault()}` PFLICHT auf JEDEM Slot** — sonst feuert `onDrop` nicht in echten Browsern (Vitest mocks bypassen das, also kein Test-Fail aber Production-Bug).
- [ ] **DragEvent-Type-Discrimination**: `onDragStart` setzt `dataTransfer.setData('text/slot-index', ...)` + `effectAllowed='move'`; `onDrop` prüft `dataTransfer.types.includes('Files')` → OS-Upload-Branch (nur empty, filled=Noop), sonst Reorder-Branch.
- [ ] **Drag-Reorder Splice-Pattern**: `arr.splice(sourceIdx, 1)` zuerst (sonst Duplikat), dann `arr.splice(adjustedTargetIdx, 0, item)` mit `adjustedTargetIdx = targetIdx > sourceIdx ? targetIdx - 1 : targetIdx`. Für `targetIdx >= images.length`: `arr.push(arr.splice(sourceIdx, 1)[0])` (= append).
- [ ] **`useCallback`/`useMemo` dep-array Audit** — alle neuen `useState`-Lesungen in callbacks (handleMediaSelect, drag-handlers, mode-change-handler) → dep-arrays komplett. ESLint `react-hooks/exhaustive-deps` clean. (Pitfall lessons.md 2026-04-22 PR #110 R1 P2.)
- [ ] **Test-Infrastructure-Update**: `MediaPicker`-Mock in `AgendaSection.test.tsx` upgraden auf `({ targetSlot }) => targetSlot !== null ? <div data-testid="mock-picker" data-slot={String(targetSlot)} /> : null`. `makeItem()` Fixture-Helper bekommt Defaults `images_grid_columns: 1, images_fit: "cover" as const`.
- [ ] +Tests: `AgendaSection.test.tsx` gemäß Spec-Requirement #12 (Mode-Picker, Mode-Wechsel preserves+resets visibleSlotCount, „+ Zeile" inkl. disabled-bei-cols=1, Empty-Slot click + OS-drop, Filled-Slot OS-drop = Noop, Multi-File-sequential + Failure-Mid-Loop, Single-Upload-Failure revert, Drag-Reorder insert-before mit exakter post-array-Assertion, Soft-Warnings beide, previewItem-Mode-Update).

## Phase-Checkpoints
> Nach jeder Phase: `pnpm build` + `pnpm test` + `pnpm exec tsc --noEmit` grün, eigener Commit, eigener Codex-Round-fähiger Punkt.

## Notes
- **Crop-Modal komplett out-of-scope** — Sprint 2 (siehe `memory/todo.md`).
- **Staging-DB === Prod-DB** — schreibende Smokes lokal, Staging nur für DDL-Verify + Public-Render-Read + Logs-Check.
- Existing Lesson 2026-04-19 (Modal `onClose` instability) — irrelevant in Sprint 1, da kein neues Modal.
- Drag-Cancel-Race aus PR #103 (`memory/todo.md`-Follow-up) — bekannter HTML5-D&D-Quirk, in diesem Sprint nicht gefixt (UX-Polish-Sprint), aber dokumentieren wenn beim Slot-Reorder reproduzierbar.
- Bei Bestandseinträgen: Defaults via DB-DEFAULT (für neue Rows) + render-time-fallback (für Rows die noch nicht re-saved wurden). Kein UPDATE-Backfill.
