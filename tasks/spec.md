# Spec: Agenda Bilder-Grid 2.0 — Sprint 1 (Grid + Fit + Dashboard-UX-Rework)
<!-- Created: 2026-04-26 -->
<!-- Author: Planner (Claude) -->
<!-- Status: Draft v2 — split per Codex SPLIT-RECOMMENDED, Crop-Modal in Sprint 2 -->

## Summary

Bestehende orientation-aware 2-Spalten-Grid-Logik in Agenda-Einträgen wird ersetzt durch ein User-konfigurierbares Spalten-Grid (1–5 Spalten, fixe 2:3-Cells) plus Display-Mode-Switch (Cover/Letterbox). Neue Single-Source-of-Truth-Spalte `images_grid_columns` modelliert beide Modi: `cols=1` triggert die orientation-aware Single-Image-Render-Branch, `cols=2..5` triggert die Multi-Image-Grid-Branch. Dashboard-UX wird vom Linear-Upload-Flow auf einen Grid-first-Slot-Editor umgestellt: User wählt zuerst Spaltenzahl, sieht dann strikte N-Spalten-Layout-Slots, kann Bilder via Click-MediaPicker oder Drop-from-OS in jeden Slot laden, Slots untereinander per HTML5-Drag reorderen, und mit „+ neue Zeile" weitere `cols`-große Placeholder-Reihen explizit hinzufügen (für 3×2-Layout ohne erst 6 Bilder hochladen zu müssen). Per-Image-Crop ist explizit out-of-scope und wird als Sprint 2 nachgelagert.

## Context

### Current State

- `src/components/AgendaItem.tsx:172–203` rendert Bilder in einem 2-Spalten-Grid mit conditional `col-span-2` (landscape) / `col-span-1` (portrait), gepadded durch `var(--spacing-base)` und `gap-[var(--spacing-half)]`.
- `AgendaImage` (`src/lib/agenda-images.ts:3-9`) trägt `{public_id, orientation, width?, height?, alt?}`. **Typ ist dupliziert** in `src/components/AgendaItem.tsx:13-19` (lokal redefiniert) — wird in diesem Sprint zentralisiert.
- `images` JSONB-Spalte auf `agenda_items` wird beim POST + Partial-PUT als komplettes Array geschrieben/gelesen (`src/app/api/dashboard/agenda/route.ts` + `[id]/route.ts`), validiert via `validateImages()` (max 20, dedupe via public_id, validates against `media`-Tabelle).
- Dashboard `AgendaSection.tsx`: aktuelles Image-UI ist eine Liste mit ↑↓✕-Buttons (`src/app/dashboard/components/AgendaSection.tsx:574-576`), MediaPicker als Modal triggered via `setShowMediaPicker(true)` (`:524`), append-Pattern in `handleMediaSelect` (`:303`).
- Existing HTML5 D&D Pattern als Referenz: `src/app/dashboard/components/JournalSection.tsx:281,286` (`draggable` + `onDragStart`, vanilla, keine Library).

### Architektur-Nachbarschaft

- Public Reader: `src/lib/queries.ts:82–158` (`getAgendaItems`) maped DB-rows auf `AgendaItemData` und reicht `images` an `<AgendaItem>` durch.
- Modal-Pattern: `src/app/dashboard/components/Modal.tsx` (existing). **Nicht** in diesem Sprint genutzt für nested Crop-Modal — komplett vermieden.
- Dashboard-i18n lebt zentral in `src/app/dashboard/i18n.tsx` (Codex-Architecture-Hinweis: Dashboard-Strings gehören dort hin, nicht in Public-Dictionaries `src/i18n/dictionaries.ts`).
- Dirty-Editor-Guard: `DirtyContext` mit `setDirty(key, bool)`. Snapshot-Diff erkennt `form.images`-Änderungen automatisch, kein manueller Hook nötig.

### Referenzen

- `CLAUDE.md`, `memory/project.md` — Stack + DB + Auth-Architektur
- `tasks/codex-spec-review.md` — Findings die in diese Spec eingearbeitet sind
- `patterns/api.md` — Partial-PUT `!== undefined`, Boolean/Number-Type-Guard
- `patterns/deployment-staging.md` — shared-DB DDL + additive ALTER, **Staging-Push IST DDL-Deploy auf shared Prod-DB → keine destructive Write-Smokes auf Staging**
- `patterns/tailwind.md` — fluid `clamp()`, grid-template-columns mit `repeat(N, ...)`
- `patterns/admin-ui.md` — Snapshot-Diff, Modal `onClose` Stable-Callback

## Requirements

### Must Have (Sprint Contract)

1. **DB-Schema additiv erweitert** — `agenda_items.images_grid_columns INT NOT NULL DEFAULT 1 CHECK (images_grid_columns BETWEEN 1 AND 5)` + `agenda_items.images_fit TEXT NOT NULL DEFAULT 'cover' CHECK (images_fit IN ('cover','contain'))`. Beide via `ALTER TABLE … ADD COLUMN IF NOT EXISTS …` in `ensureSchema()`. CREATE TABLE-Block ebenfalls aktualisiert (für fresh DBs).

2. **`AgendaImage`-Typ zentralisiert** — kanonische Definition bleibt in `src/lib/agenda-images.ts`. `src/components/AgendaItem.tsx` löscht lokale Type-Redefinition und `import { AgendaImage }` von `@/lib/agenda-images`. **Re-Export pflicht**: `AgendaItem.tsx` fügt `export type { AgendaImage } from "@/lib/agenda-images"` hinzu, damit downstream Consumer (z.B. `AgendaSection.tsx`, Instagram-Export-Components) ihre `import { AgendaImage } from "@/components/AgendaItem"` nicht brechen. Pre-Implementation: `grep -rn "AgendaImage" src/` für vollständige Blast-Radius-Liste. Kein Drift-Risiko mehr beim wichtigsten JSONB-Shape.

3. **Public Renderer Single-Image-Branch (`cols === 1`)** — Renderer leitet `cols` defensiv ab: `const cols = item.imagesGridColumns ?? 1`. Bei `images.length === 1` UND `cols === 1`:
   - `landscape` → volle Panel-Breite (innerhalb `var(--spacing-base)` Padding), aspect-ratio aus `width`/`height` wenn vorhanden, sonst Fallback `4:3`.
   - `portrait` → 50% Panel-Breite, zentriert (mx-auto), aspect-ratio aus `width`/`height` wenn vorhanden, sonst Fallback `3:4`.
   - **`imagesFit` wird respektiert**: `cover` (default) → `object-fit: cover` auf Container mit Aspect-Ratio (Bild füllt Container, schneidet ggf. ab); `contain` → `object-fit: contain` auf gleichem Container (Bild komplett sichtbar mit Letterbox, transparenter BG).
   - Test-Coverage explizit für beide Fallback-Branches UND beide Fit-Modi.

4. **Public Renderer Multi-Image-Grid (`cols >= 2`)** — bei `images.length >= 1` UND `cols >= 2` (siehe defensive Ableitung in Requirement #3):
   - Effektive Spaltenzahl = `Math.min(images_grid_columns, images.length)` (Cap bei wenigen Bildern, kein leerer Slot im Render).
   - `display: grid; grid-template-columns: repeat(N, 1fr); gap: var(--spacing-half)`.
   - Cells starr 2:3 via Tailwind `aspect-[2/3]`.
   - Bilder: `object-fit: cover` (default) ODER `object-fit: contain` (letterbox, transparent BG).
   - **Kein per-Image Crop** in diesem Sprint — `object-position` bleibt default `50% 50%`.

5. **Edge-Case `cols === 1` aber `images.length >= 2`** — sollte praktisch nicht vorkommen (Dashboard-UX bindet Mode + Bilderzahl), aber Renderer muss defensiv sein: wenn `cols === 1 && images.length >= 2`, render als Multi-Image-Grid mit `Math.min(2, images.length)` Spalten (best-effort, no crash). Test-Coverage.

6. **Alte orientation-aware col-span-Logik komplett entfernt** — keine Reste in `AgendaItem.tsx`, kein Code-Pfad mehr der `col-span-2` für Landscape rendert.

7. **Dashboard Grid-first UX (Single-Image-Mode + Grid-Modes)** — `AgendaSection.tsx` Image-Block wird komplett neu gebaut:
   - **Mode-Picker** ganz oben (immer sichtbar): „Einzelbild" (`cols=1`) | „2 Spalten" | „3 Spalten" | „4 Spalten" | „5 Spalten". Persistiert als `images_grid_columns`. Default neuer Eintrag: `1` (Einzelbild).
   - **Slot-Layout** unter dem Mode-Picker: `display: grid; grid-template-columns: repeat(cols, 1fr)` (bei `cols=1` einzelne Spalte). Sichtbare Slot-Anzahl = `Math.max(visibleSlotCount, images.length)` mit `visibleSlotCount` initial = `cols` und wächst um `cols` pro Klick auf „+ neue Zeile". `visibleSlotCount` ist UI-State (form-internal), nicht persistiert — Render leitet sich allein aus `images.length` + `cols` ab.
   - **Mode-Wechsel resettet `visibleSlotCount` auf den neuen `cols`-Wert** (egal wie hoch es vorher war). Verhindert Stale-State wie „4-col + 2× '+ Zeile' = 12 Slots → Wechsel auf 2-col zeigt 12 Slots in 6 Reihen". `images.length` bleibt unverändert (preserves Bilder).
   - **`openEdit`-Mapping initialisiert `visibleSlotCount = form.images_grid_columns`** (nur cols, NICHT `Math.max(cols, images.length)`). Display-Formel `Math.max(visibleSlotCount, images.length)` zeigt eh alle Bilder. Klick auf „+ Zeile" gibt deterministisch `cols + cols` Slots, nicht `max(...) + cols`.
   - **MediaPicker `onClose` callback MUSS via `useCallback`** stabilisiert sein (lessons.md 2026-04-19, patterns/react.md „Modal-Parent callback stability"). Sonst Focus-Reset bei jedem Re-Render während Picker offen ist. Gleiches gilt für `onSelect` (= `handleMediaSelect`), das `pickerTargetSlot` State liest.
   - **Empty Slot**: dashed border, „+" Icon zentriert, klickbar (öffnet MediaPicker mit Target-Slot-Index State) ODER Drop-Target für OS-Files (Drop triggert Upload via MediaPicker-Pipeline und füllt Target-Slot).
   - **Upload-Failure-Verhalten** (OS-Drop): bei Fehler von `uploadFileToMedia(file)` (400 wrong type, 413 oversize, network) bleibt Slot empty (Revert auf Pre-Drop-State), Fehler wird via `console.error` geloggt + non-blocking Inline-Hint-Text unter dem Slot („Upload fehlgeschlagen — bitte erneut versuchen"). Im Multi-File-Loop: bei Failure von File N wird Loop **abgebrochen** (kein silent-skip), bereits-erfolgreiche Uploads (Files 1..N-1) bleiben in `form.images`. Test-Coverage: Unit-Test mit mock `uploadFileToMedia` rejectet → assert slot bleibt empty + kein Crash.
   - **Filled Slot**: Thumbnail (cover-fit innerhalb 2:3), kleines ✕-Remove-Button top-right. Whole-slot ist `draggable=true`. Drag-on-Slot-A + Drop-on-Slot-B → reorder via **insert-before** (A wird an Position B eingefügt, B und alles rechts davon rückt um 1; wie `JournalSection.tsx:286` Pattern). Click-on-filled-Slot ist **No-Op** (keine inline action — vermeidet Klick/Drag-Konflikt).
   - **OS-File Drop auf filled Slot**: Drop wird **ignoriert** (Noop, kein Upload, kein Replace). Empty-Slot bleibt einziger Drop-Target für OS-Files. Verhindert versehentliches Überschreiben.
   - **„+ neue Zeile"-Button** unter dem Slot-Grid, **immer im DOM präsent** (kein conditional render); bei `cols=1` mit `disabled` Attribut + visuell ausgegraut. Klick erhöht `visibleSlotCount` um `cols`. Test-Coverage explizit für disabled-state-bei-cols=1 (Button existiert in DOM, hat `disabled`, kein hidden).
   - **Soft-Warning-Hints** unter dem Mode-Picker (nicht-blockierend, rein UX):
     - Wenn `cols >= 2 && images.length > 0 && images.length % cols !== 0`: „Letzte Reihe enthält nur {N} von {cols} Bildern."
     - Wenn `cols === 1 && images.length >= 2`: „Im Modus Einzelbild wird nur das erste Bild vollständig angezeigt."
   - **Mode-Wechsel preserves alle Bilder** — wenn User von 4 Bilder im 2er-Grid auf 3er-Grid wechselt, bleiben alle 4 Bilder, reflowen visuell zu 3+1 mit Hint.
   - **`useCallback`/`useMemo` dep-array Audit pflicht** — bei jedem neuen `useState`-Lesen in einer Callback (handleMediaSelect, drag-handlers) muss die dep-array vollständig sein. Bekannter Pitfall (lessons.md 2026-04-22, PR #110 Codex R1 P2): stale closure bei vergessenen deps. ESLint `react-hooks/exhaustive-deps` muss clean bleiben.

8. **Dashboard Fit-Toggle** — Radio-Group oder `<select>` neben dem Mode-Picker: „Anzeige-Modus: Cover (default) | Letterbox". Persistiert als `images_fit`. Default `cover`.

9. **Dashboard-i18n Strings in `src/app/dashboard/i18n.tsx`** — neue Strings (DE/FR): `agenda.imageMode.label/single/cols2/cols3/cols4/cols5`, `agenda.imageFit.label/cover/letterbox`, `agenda.slot.empty/remove`, `agenda.addRow.button`, `agenda.warningLastRow`, `agenda.warningSingleMode`. **Nicht** in `src/i18n/dictionaries.ts` (das ist Public-Site-Content).
   - **Format**: alle Werte sind plain `string` (kein Function-call-Type-Mix). Interpolation via `{filled}` / `{total}` Placeholders, am Call-Site mit `.replace()` substituiert. Beispiel: `agenda.warningLastRow: { de: "Letzte Reihe enthält {filled} von {total} Bildern.", fr: "La dernière rangée ne contient que {filled} image(s) sur {total}." }`. Aufruf: `t.agenda.warningLastRow.replace("{filled}", String(f)).replace("{total}", String(c))`.

10. **API GET + POST + PUT durchreicht beide neue Felder** — GET-Handler in `route.ts` nutzt aktuell `SELECT *` (auto-includes neue Spalten nach ALTER TABLE → kein Code-Change nötig). Mapping zur Response: prüfen dass die TypeScript-Type für die GET-Response (`AgendaItem` row-shape in `AgendaSection.tsx`) die neuen Felder explizit deklariert, damit `openEdit` sie type-safe lesen kann. POST INSERT schreibt `images_grid_columns` + `images_fit` explizit (kein DB-DEFAULT-Fallback). PUT partial-PUT mit `!== undefined` Branch + Type-Guards (INT range 1–5, TEXT enum). 400 mit `{error: "invalid_grid_columns"}` bzw. `{error: "invalid_fit"}` bei ungültigen Werten. **Test pflicht**: Unit-Test für GET-Response-Shape (Felder vorhanden mit korrekten Typen).

11. **Bestehende Einträge visuell migriert** — alle Rows behalten ihre Bilder; `images_grid_columns` defaultet zu `1`, `images_fit` zu `cover`. Bestehende Multi-Image-Einträge (z.B. 3 Bilder + alter col-span-Render) zeigen nach Deploy: **Single-Image-Branch nur wenn images.length=1 UND cols=1** → bestehende Multi-Image-Rows fallen in Edge-Case 5 (defensiver Multi-Image-Grid-Render mit `min(2, length)` Spalten). User akzeptiert visuelle Änderung; Wrap-Up listet betroffene Einträge per psql-Query auf.

12. **Tests grün** — `pnpm build` + `pnpm test` + `pnpm exec tsc --noEmit` clean. Mindestens **+30 neue Tests** für:
    - `AgendaItem.test.tsx` (Create) — **12 Branches**: 0 / cols1+1landscape+cover / cols1+1landscape+contain / cols1+1portrait+cover / cols1+1portrait+contain / cols1+1landscape-no-dims (Fallback 4:3) / cols1+1portrait-no-dims (Fallback 3:4) / cols2+2 / cols4+2 cap / cols=1+images>=2 defensive Multi-Branch / cover-vs-contain object-fit attribute auf Multi-Grid / **`imagesGridColumns: undefined` + 1 image fällt via `?? 1` in Single-Image-Branch** (regression test gegen silent blank).
    - `agenda-images.test.ts` — keine neuen Tests (cropX/cropY in Sprint 2).
    - `AgendaSection.test.tsx` (extend) — Mode-Picker-Render mit allen 5 Optionen, Mode-Wechsel preserves Bilder + resettet visibleSlotCount, „+ neue Zeile" erhöht visibleSlotCount um cols, „+ neue Zeile" Button bei cols=1 ist `disabled` (existiert in DOM, nicht hidden), Empty-Slot click triggert MediaPicker mit korrektem Target-Index, OS-File-Drop auf empty Slot triggert Upload, OS-File-Drop auf filled Slot ist Noop, Multi-File-Drop läuft sequentiell (assertion: distinct slots), Multi-File-Drop bei Failure von File 2: File 1 bleibt persisted + slot 2 empty, Single-File-Upload-Failure: slot reverts to empty + kein crash, Drag-Reorder zwischen 2 filled Slots = insert-before (assertion: exact post-array), Soft-Warning „Letzte Reihe..." erscheint/verschwindet, Soft-Warning „Einzelbild..." erscheint bei cols=1+length>=2, **Mode-Wechsel updated `previewItem.imagesGridColumns`** (live-preview reflects mode).
    - `agenda/route.test.ts` (extend) — POST mit allen 3 Werten persistiert + INSERT-Spalte-Count match, POST 400 bei `grid=6`, POST 400 bei `fit="fill"`, GET-Response enthält `images_grid_columns` + `images_fit` mit korrekten Typen.
    - `agenda/[id]/route.test.ts` (extend) — PUT partial mit jeweils nur einem Feld, Preserve-Semantik bei `undefined`, 400 bei invalid Werten.

   **Test-Infrastructure-Updates** (pflicht):
   - `MediaPicker`-Mock in `AgendaSection.test.tsx` upgraden für Target-Slot-Assertion: `vi.mock("./MediaPicker", () => ({ MediaPicker: ({ targetSlot }: { targetSlot: number | null }) => targetSlot !== null ? <div data-testid="mock-picker" data-slot={String(targetSlot)} /> : null }))`. Tests assertieren via `screen.getByTestId("mock-picker").dataset.slot === "<expected>"`.
   - `makeItem()`-Fixture-Helper in `AgendaSection.test.tsx` muss neue Required-Felder mit Defaults bekommen: `images_grid_columns: 1, images_fit: "cover" as const`. Sonst brechen alle bestehenden Tests durch tsc strict-mode.

### Nice to Have (explicit follow-up, NOT this sprint)

1. **Per-Image-Crop (cropX/cropY) + Crop-Modal** — kompletter Sprint 2 (siehe `memory/todo.md`).
2. Touch-D&D-Support für Slot-Reorder auf Mobile/Tablet.
3. Tastatur-Reorder via Arrow-Keys auf focused Slot.
4. Multi-Select-Upload aus MediaPicker → fill consecutive empty slots.
5. Per-Eintrag Gap-Konfiguration.
6. Drag-Reorder zwischen Slots mit Animation.
7. Bulk-Action „alle Bilder dieses Eintrags entfernen".

### Out of Scope

- **Crop-Modal** und alles drum herum — `cropX/cropY` Schema-Erweiterung, CropModal-Component, Pan-Drag-Logic. Komplett Sprint 2.
- DROP COLUMN `agenda_items.images_as_slider` (orphan vom revert PR #120) — separater 3-Phase shared-DB-safe Sprint.
- Discours-Agités Bilder (`journal_entries.images` haben gleiche Struktur, aber Sprint Agenda-only).
- Sponsoren-Sektion „Mit freundlicher Unterstützung von" (separater Sprint).
- Mobile Touch-D&D (Slot-Reorder bleibt Mouse-only im MVP, Mobile zeigt ✕-Remove + neue UI für Reorder).

## Technical Approach

### Files to Change

| File | Change Type | Description |
|---|---|---|
| `src/lib/schema.ts` | Modify | Zwei `ALTER TABLE … ADD COLUMN IF NOT EXISTS` für `images_grid_columns` (`INT NOT NULL DEFAULT 1 CHECK 1..5`) + `images_fit` (`TEXT NOT NULL DEFAULT 'cover' CHECK IN ('cover','contain')`). CREATE TABLE-Block sync. |
| `src/lib/agenda-images.ts` | No-Op | `AgendaImage` bleibt kanonische Single-Source-of-Truth. Keine Erweiterung in diesem Sprint (Crop-Felder in Sprint 2). |
| `src/lib/queries.ts` | Modify | `getAgendaItems` SELECT erweitert um `images_grid_columns, images_fit`. Mapping auf `AgendaItemData.imagesGridColumns: r.images_grid_columns ?? 1` + `imagesFit: r.images_fit === "contain" ? "contain" : "cover"` (defensive Fallbacks). |
| `src/components/AgendaItem.tsx` | Modify | (a) `AgendaImage` lokale Type-Redefinition löschen, importieren von `@/lib/agenda-images`, **`export type { AgendaImage }` re-export** für downstream Consumer. (b) `AgendaItemData` erweitert um `imagesGridColumns?: number` + `imagesFit?: "cover"\|"contain"` (optional für Legacy-Compat). (c) Renderer leitet `cols = item.imagesGridColumns ?? 1` defensiv ab. Render-Logik komplett ersetzt: 0 Images → kein Block; `cols=1 && length=1` → Single-Image-Branch (orientation-aware mit width/height-Fallback, beide imagesFit-Modi); sonst → Multi-Image-Grid mit `repeat(min(cols, length), 1fr)`. Alte col-span-Logik weg. |
| `src/app/dashboard/components/AgendaSection.tsx` | Modify | (a) Form-State: `images_grid_columns: number` (default 1), `images_fit: "cover"\|"contain"` (default cover), `visibleSlotCount: number` (UI-State, init=cols, grows on „+ Zeile"). (b) Internal `AgendaItem` row-type erweitert um `images_grid_columns: number` + `images_fit: "cover"\|"contain"`. (c) emptyForm + openEdit + previewItem mapping erweitert (previewItem MUSS neue Felder durchreichen sonst live-preview ignoriert mode). (d) Image-Block UI komplett neu: Mode-Picker + Fit-Toggle + Slot-Grid mit empty/filled-States + „+ Zeile"-Button (immer im DOM, disabled bei cols=1) + Soft-Warnings. (e) MediaPicker mit Target-Slot-Index State (`pickerTargetSlot: number \| null`), `onClose` + `onSelect` callbacks via `useCallback` stabilisiert. (f) `handleMediaSelect` füllt am Ende von `images` an (append-pattern, kein sparse-array bei `slot >= images.length`). (g) Slot-Drop-Handlers mit Type-Discrimination, Multi-File sequentiell mit error-handling. |
| `src/app/api/dashboard/agenda/route.ts` | Modify | (a) GET-Handler nutzt `SELECT *` (auto-includes neue Spalten — kein Code-Change am SQL). TypeScript-Row-Type für GET-Response in `AgendaSection.tsx` muss neue Felder explizit deklarieren. (b) POST: explicit INSERT für 2 neue Felder (Type-Guards: INT 1..5, TEXT enum). 400 mit klaren `error`-Codes. |
| `src/app/api/dashboard/agenda/[id]/route.ts` | Modify | PUT: dynamische SET-Clause via `!== undefined`-Branches + Type-Guards. 400 bei out-of-range. |
| `src/app/dashboard/i18n.tsx` | Modify | Neue Dashboard-Strings (DE+FR): `agenda.imageMode.*`, `agenda.imageFit.*`, `agenda.slot.empty/remove`, `agenda.addRow.button`, `agenda.warningLastRow`. **Nicht** in `src/i18n/dictionaries.ts`. |
| `src/i18n/dictionaries.ts` | No-Op | Keine Dashboard-Strings hier. |
| `src/components/AgendaItem.test.tsx` | Create | Unit-Tests: **12 Branches** gemäß Spec-Requirement #12 (inkl. cover/contain für Single-Image, defensive `?? 1` Fallback). |
| `src/app/dashboard/components/AgendaSection.test.tsx` | Modify | +Tests: Mode-Picker-Render, Mode-Wechsel preserves Bilder + Reflow, „+ Zeile"-Button erhöht visibleSlotCount, Empty-Slot click triggert MediaPicker mit Target-Index, Drop-from-OS triggert Upload, Drag-Reorder zwischen 2 filled Slots, Soft-Warning erscheint/verschwindet korrekt. |
| `src/app/api/dashboard/agenda/route.test.ts` | Modify | +Tests: POST mit allen 3 Werten persistiert, 400 bei `grid=6`, 400 bei `fit="fill"`, INSERT-Spalte-Count match. |
| `src/app/api/dashboard/agenda/[id]/route.test.ts` | Modify | +Tests: PUT partial mit jedem Feld einzeln, Preserve-Semantik bei `undefined`, 400 bei invalid Werten. |

### Architecture Decisions

- **`cols=1` als Single-Image-Mode (statt separater Bool)** — eine Spalte modelliert beide Konzepte. Renderer: `cols === 1 && length === 1` → orientation-aware Branch. Jede andere Kombination → Grid-Branch. Cleanest Schema, keine redundante Truth.
- **HTML5 DragEvent Type-Discrimination Protocol** — Slot-`onDrop` muss zwei Drop-Sources auseinanderhalten (filled-slot-Reorder vs OS-File-Upload):
  - In `onDragStart` (filled slot): `e.dataTransfer.setData('text/slot-index', String(sourceIdx))` + `e.dataTransfer.effectAllowed = 'move'`.
  - In `onDrop`: erst `e.dataTransfer.types.includes('Files')` prüfen → OS-File-Upload-Branch (für empty slot) oder Noop (für filled slot). Sonst `e.dataTransfer.getData('text/slot-index')` lesen → Reorder-Branch (insert-before).
  - Fehlende Discrimination = Reorder triggert Upload oder Upload triggert Reorder. Test-Coverage explizit für beide Pfade.
- **MediaPicker `handleMediaSelect` Target-Index Behavior** — wenn User klickt empty Slot bei Index `i`:
  - Wenn `i < images.length`: ungenutzt (kann nicht passieren — empty slot heißt definitorisch `i >= images.length`).
  - Wenn `i >= images.length`: Selection wird **am Ende** angefügt (`images.push(newImage)`). Visueller Slot-Index ≠ images-Array-Index ist explizit OK — leere Lücken zwischen `images.length-1` und `i` bleiben leer (visibleSlotCount-Slots), kein sparse-Array, kein `undefined`-Hole. Vereinfacht Daten-Model und vermeidet Filler-Logik.
- **Mode-Wechsel preserves images, kein DB-Backfill** — alle bestehenden Einträge starten mit `cols=1 + fit=cover`. Bestehende Multi-Image-Einträge fallen in defensiven Edge-Case (cols=1, length>=2 → Grid mit min(2, length) Spalten). Wrap-Up listet betroffene Einträge auf, User wechselt Mode beim nächsten Edit.
- **`visibleSlotCount` ist UI-only, nicht persistiert** — User sieht beim nächsten Öffnen genau `max(cols, images.length)` Slots. Wer 6 leere Slots im 3er-Grid „behalten" will (3×2 ohne Bilder), muss „+ Zeile" beim nächsten Edit erneut klicken. Vereinfacht Schema, Edge-case ist akzeptabel weil Empty-Slot-Persistenz kein Render-Effekt hat.
- **Whole-slot `draggable=true` für filled, click-no-op** — vermeidet Klick/Drag-Konflikt. ✕-Button ist separates Click-Target. Empty-Slot ist klickbar (öffnet MediaPicker) UND drop-target (OS-File). Filled-Slot ist drag-source UND drop-target (für Reorder).
- **Drop-from-OS reuses MediaPicker-Upload-Pipeline programmatisch** — kein neuer Upload-Code-Pfad. Helper-Funktion (z.B. `uploadFileToMedia(file): Promise<MediaPickerResult>`) extrahiert aus MediaPicker, callable von Slot-onDrop. Hält Auth + Validation konsistent.
- **Multi-File OS-Drop läuft sequentiell** — bei Drop von 2+ Files gleichzeitig: `for (const file of files) { const r = await uploadFileToMedia(file); setForm(f => append(f, r)); }`. KEIN concurrent `Promise.all` — sonst race condition wo beide Callbacks dieselbe `images.length` lesen und in denselben Slot schreiben (zweite überschreibt erste). Test-Coverage: Unit-Test mit 2 Files asserted distinct slots.
- **Dashboard-Strings in `src/app/dashboard/i18n.tsx`** — Codex-Architecture-Finding adressiert. Public-`dictionaries.ts` bleibt site-locale Content. Verhindert i18n-System-Mixing.
- **Single-Image width/height Fallback orientation-based** — wenn `width` oder `height` fehlt (Legacy-Rows ohne dimensions-probe), wird CSS `aspect-ratio` aus `orientation` abgeleitet: landscape = 4/3, portrait = 3/4. Vermeidet layout-shift, deterministisches Render.
- **Kein Crop, kein Modal** — Sprint 1 nutzt nur defaults `object-position: 50% 50%`. Crop-Modal-Komplexität (Stack-safe, Draft-State, Clamp-Mapping, Keyboard) komplett in Sprint 2 — sauberer Soak-Pfad, kleinere Sprint-Surface.

### Dependencies

- **External**: keine neuen npm-Pakete. Native HTML5 D&D wie in `JournalSection.tsx`.
- **Internal**:
  - `agenda_items` shared zwischen prod + staging — DDL-Deploy via Staging-Push, additiv (`IF NOT EXISTS`).
  - DROP COLUMN für `images_as_slider` (orphan vom revert) NICHT in diesem Sprint.

## Edge Cases

| Case | Expected Behavior |
|---|---|
| 0 Bilder | Bilder-Block wird nicht gerendert (existing). Editor zeigt Mode-Picker + initial `cols` empty Slots. |
| 1 Bild Landscape, cols=1 | volle Panel-Breite, native aspect-ratio (oder Fallback 4/3 wenn dimensions fehlen). |
| 1 Bild Portrait, cols=1 | 50% Panel-Breite zentriert, native aspect-ratio (oder Fallback 3/4). |
| 1 Bild, cols=3 | Multi-Image-Grid-Branch mit `min(3,1)=1` Spalte → ein 2:3-Cell mit cover/contain. |
| 5 Bilder, cols=2 | 2 Spalten, 3 Reihen (2+2+1). Letzte Cell hat 1 Bild, Grid füllt linksbündig. Editor zeigt Soft-Warning „Letzte Reihe enthält 1 von 2 Bildern". |
| 4 Bilder, cols=4 | 4 Spalten, 1 Reihe — kein Soft-Warning (4 % 4 === 0). |
| Mode-Wechsel von cols=4 (4 Bilder) auf cols=2 | Bilder bleiben unverändert, Editor reflowt zu 2×2, Render = 2 Spalten 2 Reihen, kein Datenverlust. |
| User klickt „+ neue Zeile" bei cols=3, 0 Bilder | visibleSlotCount: 3 → 6, Editor zeigt 6 leere Slots. |
| User klickt „+ neue Zeile" bei cols=3, 5 Bilder (Editor frisch geöffnet, visibleSlotCount=3 per init) | visibleSlotCount: 3 → 6. Display = `max(6, 5) = 6` Slots. |
| Empty-Slot: User droppt 2 Files aus Finder gleichzeitig | **Sequentiell**: erstes File hochgeladen + appended, zweites File hochgeladen + appended. Beide landen in distinct slots (kein race-overwrite). |
| Filled-Slot: User droppt OS-File aus Finder darauf | **Drop ignoriert** (Noop). Empty-Slots sind einzige Drop-Targets für OS-Files. Verhindert versehentliches Überschreiben. Optional: visuelles Feedback dass Drop nicht akzeptiert wurde (cursor-not-allowed). |
| Drag filled-Slot A onto filled-Slot B | A wird an Position B **eingefügt** (insert-before), B und alles rechts davon rückt um 1. Pattern wörtlich aus `JournalSection.tsx:286`. |
| Drag filled-Slot A onto empty-Slot | A bewegt sich an die Position des empty-Slots (= reorder; bei `i >= images.length` erfolgt append am Ende, leere Slot-Lücken bleiben). |
| Mode-Wechsel von cols=4 (visibleSlotCount=12 nach 2× '+ Zeile') auf cols=2 | `visibleSlotCount` resettet auf neuen `cols`-Wert (2). `images.length` bleibt unverändert (preserves Bilder). Editor zeigt `Math.max(2, images.length)` Slots. |
| Mode-Wechsel auf cols=1 mit images.length>=2 | Editor zeigt 1 Slot mit erstem Bild + `Math.max(1, images.length)` slots in 1-spaltiger Liste (also alle Bilder untereinander). Soft-Warning „Im Modus Einzelbild wird nur das erste Bild vollständig angezeigt." Public-Render fällt in defensive Edge-Case-Branch (Multi-Image-Grid mit min(2, length) Spalten). |
| User klickt ✕ am letzten Bild eines Multi-Image-Sets | Bilder-Array auf 0, visibleSlotCount bleibt = cols (zeigt N empty slots). |
| Concurrent Edit | Last-write-wins (existing, kein neuer Failure-Mode). |
| 400 bei out-of-range Grid (`6`) | API rejects mit `{error: "invalid_grid_columns"}`. Dashboard validates client-side via fixed Mode-Picker-Optionen. |
| 400 bei invalid Fit (`"fill"`) | API rejects mit `{error: "invalid_fit"}`. Dashboard validates client-side via fixed Toggle-Optionen. |
| Mobile Viewport (375px), cols=5 | Grid bleibt 5 Spalten — sehr kleine Cells (~64px). User-Empfehlung im Dashboard: 1–3 Spalten für Mobile. KEIN responsive auto-fallback im MVP. |
| Bestehender Eintrag mit alter „landscape col-span-2"-Optik (nicht reeditiert) | Beim ersten Re-Render zeigt defensive Edge-Case (cols=1, length>=2) Branch → Multi-Image-Grid mit `min(2, length)` Spalten + Cover. Nicht bit-identisch zur Vorher-Optik, dokumentiert in Risks #1. |

## Risks

1. **Visuelle Regression bei bestehenden Einträgen** — alle Multi-Image-Einträge bekommen neuen Look (defensive Edge-Case Branch in Renderer, da Default `cols=1`). Wrap-Up-Skill: psql-Query `SELECT id, title_i18n->>'de' FROM agenda_items WHERE jsonb_array_length(images) >= 2;` listet betroffene Einträge. Mitigation: visueller Smoke auf Staging mit ≥1 betroffenem Eintrag VOR Prod-Merge.
2. **Empty-Slot-Drop-from-OS Upload-Pipeline** — Refactor von MediaPicker-internal-Upload-Logic zu shared Helper kann bestehenden MediaPicker-Flow brechen. Mitigation: Helper extrahiert OHNE bestehende MediaPicker-API zu ändern, Tests für beide Pfade (Modal-Pick + Direct-Drop).
3. **DB-Migration Race auf Staging-Push** — `agenda_items` shared mit Prod. Beide ALTERs additiv (`IF NOT EXISTS`) und Defaulted (`DEFAULT 1` bzw `DEFAULT 'cover'`) — keine Insert-Failures, kein Backfill nötig. Pre-Flight: `psql -c "\d agenda_items"` nach Staging-Deploy.
4. **HTML5-D&D Cross-Browser-Inconsistency** — Safari/Firefox haben historisch unterschiedliche `dragend`-Semantik (siehe `memory/todo.md` Follow-up aus PR #103: „Drag-Cancel persistiert unerwünschte Reorders" — same root cause). Mitigation: Reuse JournalSection D&D-Pattern wörtlich, dokumentiere bekannte Cancel-Race als out-of-scope für UX-Polish-Sprint.
5. **Mode=1 + length>=2 defensive Branch** — User könnte verwirrt sein wenn er „Einzelbild" wählt aber 3 Bilder hat (Editor zeigt 1-Spalten-Layout?). Mitigation: bei Mode-Wechsel auf cols=1 mit images.length>=2 zeigt Soft-Warning „Mehrere Bilder vorhanden, Mode ‚Einzelbild' rendert nur das erste vollständig." Dashboard kann Mode-Wechsel erlauben (kein Block), Public-Render fällt in defensive Branch.

## Rollback

Falls dieser Sprint nach Merge revert werden muss:
- `git revert <merge-sha>` — entfernt Code-Änderungen.
- Beide neue DB-Spalten bleiben orphan (analog `images_as_slider`-Pattern). Kein DROP COLUMN — Race-Window bei shared DB. Drop in separatem 3-Phase Sprint.

## Verification (Sprint Done-Kriterien)

Siehe `tasks/todo.md` DK-1..DK-13.

**Wichtig — Staging-Smokes:**
- Schreibende Smokes (Create/Edit eines Test-Eintrags) erfolgen **lokal/dev** (eigene local DB oder docker-compose.local), NICHT auf Staging — `staging_db === prod_db` per CLAUDE.md.
- Auf Staging nur: DDL-Verifikation (`\d agenda_items`), Public-Render-Smoke eines BESTEHENDEN Eintrags (read-only), Logs-Check (`docker compose logs --tail=50 alit-staging`).
