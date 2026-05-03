# Spec: Sprint M4 — Instagram Per-Slide Body-Text Override + Slide-1 Cover-Centering

<!-- Created: 2026-05-03 -->
<!-- Author: Planner (Claude Opus 4.7) -->
<!-- Status: R3 — Sonnet R2 11 Findings (3 Critical + 3 High + 5 Medium + 1 Low) alle addressed, awaiting re-eval -->
<!-- R1 Sonnet found: 6 Critical + 4 High + 3 Medium/Low. Alle in R2 fixed. -->
<!-- R2 Sonnet found: 3 Critical + 3 High + 5 Medium + 1 Low. Alle in R3 fixed: -->
<!--   #1 wrong route file → all PUT references switched to instagram-layout/route.ts -->
<!--   #2 E4/E5 contradicting B6b → both rewritten to use staleSlides shape -->
<!--   #3 currentHash missing → staleSlides extended to {slideIdx, currentHash}[] -->
<!--   #4 EditorSlide type → B1e new section requiring layout-editor-types.ts extension -->
<!--   #5 move-ops drop fields → C5b new section requiring spread + filter-guard -->
<!--   #6 runtime=nodejs → D1 explicit pin -->
<!--   #7 C8 test missing from E4 → E4 extended with empty-textarea-redirect test -->
<!--   #8 serverState staleSlides → C7b new section + Files-to-Change row update -->
<!--   #9 slideIdx bounds → D1 + E6 explicit 400 invalid_slide_index -->
<!--   #10 loadGridImageDataUrls → verified function exists, D1 explicit reference -->
<!--   #11 stored leadOnSlide → E3 explicit override-test for buildManualSlides -->
<!--   #12 useCallback dep-audit → Files-to-Change LayoutEditor row item (h) -->
<!--   #1 wrong file InstagramLayoutSlide → B1 fixed: instagram-post.ts -->
<!--   #2 Slide type + buildManualSlides → B1b + B1c added -->
<!--   #3 warnings shape conflict → B6b separate staleSlides top-level key -->
<!--   #4 MAX_BODY_CHARS_PER_SLIDE missing → B1d new const = 10000 -->
<!--   #5 C4 vs B8 contradiction → C4 hard-block client-side via Save-Disable -->
<!--   #6 preview DB-scope → D1 clarified: agenda+images aus DB, layout aus payload -->
<!--   #7 stale-hash algorithm → B6 explicit Option A (block-set-based) -->
<!--   #8 queries.ts non-existent → row removed from Files-to-Change -->
<!--   #9 empty textarea behavior → C8 added (client redirects "" to clear) -->
<!--   #10 blob URL lifecycle → D3b added (revoke on update + on unmount) -->
<!--   #11 A3 centering scope → A3 explicit: only Title+Lead centered, Body left-aligned -->
<!--   #12 useEffect debounce → D3 explicit useRef-Mutex code-block -->
<!--   #13 draft:true purpose → D1 removed draft flag entirely -->

## Summary

Zwei eng gekoppelte Änderungen am Instagram-Export:

1. **Per-Slide `textOverride`** — User kann pro Body-Slide einen freien Plaintext eingeben, der den auto-gerenderten Block-Text ersetzt. Realtime-Preview via debounced Draft-POST. Persistiert in `instagram_layout_i18n` per Locale. Stale-Detection pro Slide via `baseBodyHash`.

2. **Slide-1 Cover-Centering + Lead-Move** — Slide 1 (Cover, `kind: "grid"`) rendert ab jetzt Title + Lead + Image-Grid in dieser Reihenfolge, alle Elemente horizontal zentriert. Lead wandert von Slide 2 (`leadOnSlide`-Flag aktuell) auf Slide 1. Body-Slides starten ab Slide 2 ohne Lead-Prefix.

## Context

**Aktuelles Verhalten (Stand PR #110, prod 2026-04-22 + S2c PR #136):**
- Slide 1 mit `imageCount > 0`: `kind: "grid"` — Title (links-bündig) + Image-Grid. Lead rendert NICHT auf Slide 1.
- Slide 2 (erste text-Slide nach grid): `leadOnSlide: true` → Lead-Prefix + Body-Blocks
- Slides 3..N: pure body-text
- Slide N+1: Supporters (falls `supporter_logos.length > 0`)
- LayoutEditor: User kann ganze Blocks via `moveBlockToPrev/Next` und `splitSlideHere` zwischen Slides bewegen (block-granularität)
- Persistiert: `instagram_layout_i18n.[locale].slides[i].blocks: string[]` mit stable Block-IDs (`b0`, `b1`, …)

**Pain Points (User-Feedback 2026-05-03):**
- Body-Granularität: User kann nur ganze Paragraphen verschieben, keine Sätze/Wörter/Zeilen → wenn Paragraph zu lang für Slide, kein Workaround im Modal
- Workaround heute: Modal verlassen → Agenda-Eintrag Body editieren → Modal neu öffnen → wieder verschieben → ... Iterativ frustrierend
- Slide-1: Title links-bündig + kein Lead wirkt visuell unausgewogen, User möchte zentriertes Cover mit Lead

**Why bundled in one sprint:**
Slide-1 wird mit Lead-Move strukturell verändert. textOverride-Logic muss explizit definieren auf welchen Slides es gilt — wenn wir Slide-1-Layout im selben Sprint klären, ist die Override-Region eindeutig (nur Body-Slides ab Index 1, d.h. Slide 2..end). Zwei sequentielle PRs würden temporär einen Mixed-State haben.

**Source-of-Truth-Modell:**
- Agenda-Eintrag bleibt Source-of-Truth für Website + Auto-Layout
- Instagram-Export darf eigene lokale Overrides haben (textOverride, blocks-distribution)
- Stale-Detection signalisiert wenn Source-Content vom Override-Snapshot abweicht; User entscheidet (behalten / auf-Auto-zurücksetzen)

## Requirements

### Must Have (Sprint Contract)

> Alle Must-Have-Items werden im Codex-PR-Review hart durchgesetzt.

#### Block A — Slide-1 Cover-Centering + Lead-Move

**A1.** Slide 1 mit `kind: "grid"` rendert in genau dieser vertikalen Reihenfolge: Title → Lead → Image-Grid → Hashtags. Alle vier Elemente horizontal zentriert (`textAlign: "center"` für Title/Lead/Hashtags, Grid via `justifyContent: "center"` auf parent flex).

**A2.** Lead rendert auf Slide 1 (`kind: "grid"`) IF und only IF `meta.lead` non-empty. Der `leadOnSlide`-Flag auf Slide 2 (erste text-Slide nach grid) wird auf `false` gesetzt — Lead darf NICHT mehr auf Slide 2 erscheinen wenn Slide 1 grid ist.

**A3.** No-grid-Path (`imageCount === 0`): Slide 1 bleibt `kind: "text"` mit Title + Lead + Body wie heute. **Nur Title + Lead** in dieser Variante zentriert (visuelle Konsistenz mit grid-Path-Cover); **Body-Blocks bleiben links-bündig** (gleiche Behandlung wie alle anderen text-slides — Body ist immer left-aligned, unabhängig vom Slide-Index).

**A4.** Image-Grid-Layout-Rules (in `computeSlide1GridSpec(images, imageCount)`):
   - `imageCount === 0`: Slide 1 = `kind: "text"` (siehe A3)
   - `imageCount === 1`: 1×1 single full-width-cell
   - `imageCount === 2`: 1×2 horizontal row
   - `imageCount === 3`: 1×3 horizontal row
   - `imageCount === 4`: 2×2 grid
   - `imageCount > 4`: server-clamp auf 4 (warning `image_count_clamped`)
   - Aspect-Ratio-Handling pro Cell: existing `fitImage` helper, square-cells via grid

**A5.** `imageCount`-Default im `InstagramExportModal`-Selector auf `min(4, availableImages)` (Pick C). Slider-Range bleibt `0..min(4, availableImages)`. Existing-Eintrag-Open zeigt sofort den Cover-Grid mit allen Bildern (bis 4).

**A6.** `?images=N`-URL-Parameter Server-Validation: clamp auf `[0, min(4, availableImages)]`. Existing Range-Logic in `countAvailableImages` erweitert um `min(4, …)`-Cap.

**A7.** Pure-image-Slides (separate Slides für image[1..N-1]) werden in der aktuellen Architektur NICHT verwendet — alle Bilder rendern bereits im Slide-1-Grid. Nichts zu entfernen, nur Slide-1-Layout zu zentrieren + Lead zu verlegen.

#### Block B — Per-Slide `textOverride`

**B1.** `InstagramLayoutSlide`-Type (in `src/lib/instagram-post.ts`, line ~538 — die canonical definition; `instagram-overrides.ts` re-exportiert) erweitert um zwei optionale Felder:
   ```ts
   // src/lib/instagram-post.ts
   export type InstagramLayoutSlide = {
     blocks: string[];
     textOverride?: string;       // user-edited body text, undefined = auto
     baseBodyHash?: string;       // SHA-256 hex of auto-rendered body at time of save
   };
   ```

**B1b.** `Slide`-Type (renderer-facing, ebenfalls in `src/lib/instagram-post.ts` line ~229) MUSS ebenfalls erweitert werden — `SlideTemplate` empfängt `Slide`, nicht `InstagramLayoutSlide`:
   ```ts
   // src/lib/instagram-post.ts
   export type Slide = {
     // ... existing fields ...
     textOverride?: string;       // forwarded from InstagramLayoutSlide for renderer
   };
   ```

**B1c.** `buildManualSlides(layout, item, locale, ...)` in `src/lib/instagram-overrides.ts` MUSS `overrideSlide.textOverride` auf das resulting `Slide.textOverride` mappen. Aktuell baut die Funktion `Slide`-Objekte aus `InstagramLayoutSlide.blocks` — das Feld `textOverride` muss durchgereicht werden, sonst speichert User Override aber Renderer sieht es nie. Test-Pflicht in `instagram-overrides.test.ts`: roundtrip `setOverride → buildManualSlides → slide.textOverride === expected`.

**B1d.** Neuer Konstante in `src/lib/instagram-post.ts`:
   ```ts
   export const MAX_BODY_CHARS_PER_SLIDE = 10000;
   ```
   Dient als Single-Source für (a) Server-Validator (B8), (b) Client-Side Char-Counter + Disable-Save (C4), (c) Tests (E5).

**B1e.** **`EditorSlide` type in `src/lib/layout-editor-types.ts` MUSS auch erweitert werden** — separater Type vom `InstagramLayoutSlide` (B1) und `Slide` (B1b)! `EditorSlide` ist die LayoutEditor-internal-state-shape:
   ```ts
   // src/lib/layout-editor-types.ts
   export type EditorSlide = {
     blocks: { id: string; text: string; isHeading: boolean }[];
     textOverride?: string;       // NEU
     baseBodyHash?: string;        // NEU
   };
   ```
   Ohne diese Erweiterung haben `setSlideOverride` / `clearSlideOverride` (Phase 2 in todo) keine type-safe-storage und produzieren TypeScript-Errors.

**B2.** Override gilt **nur für Body-Slides** mit `kind === "text"`. Grid-Slide (Slide 1, `kind: "grid"`) und Supporter-Slide (`kind: "supporters"`) haben kein Override-Field — UI rendert keine Textarea, Validator weist `textOverride` auf diesen Slides ab (422 `override_not_allowed`).

**B3.** Renderer (`SlideTemplate.tsx`): bei `slide.kind === "text" && slide.textOverride !== undefined` rendert die Body-Region den `textOverride` als einzelnen Plaintext-Block (zentrierter Text-Container, gleiche Font/Size/Line-Height wie Auto-Body, Newlines via `whiteSpace: "pre-wrap"` Satori-safe).

**B4.** `slide.blocks: string[]` bleibt für Stale-Detection persisted, wird im Override-Render aber **ignoriert**. Block-IDs sind nur noch Stale-Anchor.

**B5.** `computeBodyHashForSlide(blocks: ContentBlock[]): Promise<string>` als pure helper in neuer Datei `src/lib/instagram-body-hash.ts`. Hash = SHA-256 hex (Web-Crypto via `crypto.subtle.digest`, Edge-safe). Input-Normalisierung:
   - Concatenate alle paragraph/heading/quote-Block-Texte mit `\n`-Separator
   - Trim-aware (strip leading/trailing whitespace pro Block)
   - Image/embed/video/spacer-Blocks SKIPPED
   - Output: 64-char hex string

**B6.** **Stale-Detection-Algorithmus (Option A — block-set-based, NOT position-based):** GET `/api/dashboard/agenda/[id]/instagram-layout/` iteriert über alle gespeicherten override-belegten Slides. Pro Slide:
   1. Lookup-Set bauen aus `overrideSlide.blocks: string[]` (gespeicherte stable Block-IDs `b0`, `b1`, ...).
   2. Aus current agenda-content (per locale) die ContentBlocks mit matchenden IDs filtern. Reihenfolge = Reihenfolge in `overrideSlide.blocks`.
   3. `currentHash = await computeBodyHashForSlide(matchedBlocks)`.
   4. Wenn `overrideSlide.baseBodyHash !== undefined && currentHash !== overrideSlide.baseBodyHash` → diese Slide ist stale; emit `{slideIdx, currentHash}`.

   **Wichtig:** NICHT `splitAgendaIntoSlides` ausführen + position-by-index zuordnen — das produziert false-positives bei Block-Move (User bewegt Block, Position ändert, Hash drifted, Slide wäre fälschlich stale obwohl Text unverändert). Block-Set-based ist position-invariant.

   **Performance:** Hash-Computation ist async (Web-Crypto). Pro `Promise.all` parallel ausführen — nicht sequential:
   ```ts
   const stale = await Promise.all(
     overrideSlides.map(async (s, idx) => {
       const matched = s.blocks.map(id => contentById.get(id)).filter(Boolean);
       const currentHash = await computeBodyHashForSlide(matched);
       return s.baseBodyHash !== undefined && currentHash !== s.baseBodyHash
         ? { slideIdx: idx, currentHash }
         : null;
     }),
   );
   const staleSlides = stale.filter((x): x is {slideIdx: number; currentHash: string} => x !== null);
   ```

**B6b.** **Response-Shape: separate Top-Level-Key, NICHT warnings-array-Mutation.** Existing `warnings: string[]` shape bleibt unangetastet (backward-compat für andere consumer wie `locale_empty`, `image_partial`). Neuer Top-Level-Key:
   ```ts
   // GET /api/dashboard/agenda/[id]/instagram-layout/ response
   {
     // ... existing fields ...
     warnings: string[];                                                // unchanged
     staleSlides: { slideIdx: number; currentHash: string }[];          // NEU — empty array wenn nichts stale
   }
   ```
   **`currentHash` ist required** — Client braucht den Hash-Wert um „Override behalten" zu implementieren (acknowledge-stale: setzt `baseBodyHash = currentHash` ohne Re-Compute, ohne extra GET). Empty array `[]` wenn nichts stale. Client iteriert `staleSlides` separat in C7. Kein Type-Konflikt mit existing warnings-strings.

**B7.** UI bei stale (per Slide): amber Banner unter Textarea: „Inhalt der Agenda wurde geändert. Override behalten oder auf Auto zurücksetzen?" + zwei Buttons. Banner rendert wenn `staleSlides.some(s => s.slideIdx === currentSlideIdx)`.

**B8.** PUT-Validator (in `src/app/api/dashboard/agenda/[id]/instagram-layout/route.ts` — **NICHT** `instagram/route.ts` welche read-only-GET ist) akzeptiert neue Shape:
   - `textOverride: string | undefined`, **max-length `MAX_BODY_CHARS_PER_SLIDE` (10000)** chars — überschreitendes 422 `body_too_long` (Defense gegen JSONB-blowup, Single-Source mit Client-Counter)
   - `baseBodyHash: string | undefined`, regex `^[a-f0-9]{64}$` (SHA-256 hex)
   - Empty-string `""` für `textOverride` rejected (422 `override_empty`) — Client soll `""` NIE senden (siehe C8); 422 ist Defense-in-Depth
   - `textOverride` auf grid/supporters-slide rejected (422 `override_not_allowed`)

**B9.** Audit-Event `agenda_instagram_layout_update` Payload erweitert um `text_overrides_count: number` (Anzahl Body-Slides mit `textOverride !== undefined` post-save).

#### Block C — LayoutEditor UI für textOverride

**C1.** Pro Body-Slide (`kind === "text"`) rendert LayoutEditor zusätzlich zur Block-Liste eine `<textarea>` (data-testid `slide-textarea-${slideIdx}`) mit current `textOverride` (oder leer string falls undefined).

**C2.** Textarea hat `placeholder="Auto-generierter Text"` wenn override leer.

**C3.** Auto-Button (data-testid `slide-override-clear-${slideIdx}`) neben Textarea: cleart override → setzt `textOverride` lokal auf undefined, Textarea-Wert auf empty string. Button **disabled** wenn `textOverride === undefined` (no-op).

**C4.** Char-Counter (data-testid `slide-override-counter-${slideIdx}`) unter Textarea: zeigt `${currentLength} / ${MAX_BODY_CHARS_PER_SLIDE}`. Konstante aus `src/lib/instagram-post.ts` (siehe B1d, neu zu erstellen mit Wert `10000`). Counter-Color:
   - `count <= 0.9 * MAX` (≤9000): gray
   - `0.9 * MAX < count <= 1.0 * MAX` (9001-10000): amber (`text-amber-700`)
   - `count > 1.0 * MAX` (>10000): red (`text-red-600`) **+ Save-Button disabled** + inline error message unter Textarea („Override-Text zu lang — max ${MAX} Zeichen erlaubt")

   **Hard-Block client-side**: Save kann NICHT abgesendet werden wenn irgendeine override-Slide >MAX chars hat. Verhindert silent 422 vom Server (B8). Single-Source-Constant (B1d) sichert Client + Server in sync.

**C5.** Move-Buttons (`moveBlockToPrev/Next`) auf override-belegter Slide: **disabled** mit `title="Override aktiv — auf Auto zurücksetzen um Blocks zu moven"`. Verhindert Inconsistency wo Block-Move den Hash-Anker drift produziert.

**C5b.** **Move-Ops müssen new EditorSlide-Fields preserven** (Defense-in-Depth, gegen programmatic-call ohne UI-Disable):
   ```ts
   // Heutiges Pattern in moveBlockToPrev/Next/splitSlideHere:
   return { blocks: [...s.blocks, block] };  // ❌ verliert textOverride/baseBodyHash
   .filter((s) => s.blocks.length > 0);       // ❌ dropt override-only Slide

   // Neuer Pattern:
   return { ...s, blocks: [...s.blocks, block] };  // ✅ spread alle existing fields
   .filter((s) => s.blocks.length > 0 || s.textOverride !== undefined);  // ✅ Override-only-Slide bleibt
   ```
   Funktionen in `src/lib/layout-editor-state.ts`: `moveBlockToPrevSlide`, `moveBlockToNextSlide`, `splitSlideHere` — alle drei müssen spread-Pattern + filter-guard erweitern. Test-Pflicht: `move(slide-with-override)` produziert resulting-state mit override + baseBodyHash erhalten.

**C6.** `splitSlideHere` auf override-belegter Slide: ebenfalls disabled (gleicher Hint).

**C7.** Stale-Banner (siehe B7): amber Banner unter Textarea wenn `staleSlides.some(s => s.slideIdx === currentSlideIdx)` (server response shape aus B6b — separate Top-Level-Key mit `{slideIdx, currentHash}`, KEINE warnings-array-Iteration). Zwei Buttons:
   - „Override behalten" → setzt `baseBodyHash` lokal auf `staleSlides.find(s => s.slideIdx === currentSlideIdx)!.currentHash` (acknowledges stale, no content change). Der Server hat den Hash bereits computed in B6 → kein client-side Re-Compute, kein zweiter GET-Roundtrip.
   - „Auto wiederherstellen" → cleart `textOverride` + `baseBodyHash` (Slide rendert wieder auto)

**C7b.** **`serverState` Type in `LayoutEditor.tsx` MUSS extended werden** mit `staleSlides`:
   ```ts
   // existing serverState shape (LayoutEditor.tsx)
   type ServerState = {
     mode: "auto" | "manual";
     contentHash: string;
     layoutVersion: number;
     imageCount: number;
     availableImages: number;
     warnings: string[];
     initialSlides: EditorSlide[];
     staleSlides: { slideIdx: number; currentHash: string }[];  // NEU
   };
   ```
   GET-Response-Parsing muss `staleSlides` aus dem JSON extrahieren und in `serverState` thread'en. Initial empty array `[]` falls server-side rückwärts-kompatibel keinen Key sendet (defense-in-depth).

**C8.** **Empty-Textarea-Behavior** (Test-Pflicht in E4 — siehe E4 unten): Wenn User alle Zeichen aus textarea löscht (`textOverride === ""` lokal):
   - State-Update: client wandelt `setSlideOverride(slideIdx, "")` automatisch in `clearSlideOverride(slideIdx)` um → `textOverride` lokal wird `undefined` (NICHT `""`).
   - Save-Payload: `textOverride: undefined` wird per JSON-stringify automatisch aus dem Body entfernt → Server sieht "kein Override gesetzt", kein 422.
   - Visual: Textarea bleibt leer (controlled-input mit `value={textOverride ?? ""}`), Auto-Button ist enabled wenn override aktiv war (nutzlich da User ggf. mehrfach typt + clear). Char-Counter zeigt `0 / 10000`.
   - Test-Pflicht: textarea-emptying produziert KEINE PUT-Payload mit `textOverride: ""`.

#### Block D — Draft-Preview-Route

**D1.** Neue Route `POST /api/dashboard/agenda/[id]/instagram-preview/[slideIdx]/route.tsx`:
   - **`export const runtime = "nodejs"` PFLICHT** als Erste Zeile nach Imports — Satori + pg.Pool sind Node-only. Edge-Runtime würde 500 nur bei Deploy fehlschlagen, nicht in Tests. Pattern-Match mit existing `instagram-slide/[slideIdx]/route.tsx`.
   - Body: layout-payload als JSON: `{ slides: InstagramLayoutSlide[], locale: "de"|"fr", imageCount: number }` (NO `draft` flag — gestrichen, hatte keinen Zweck)
   - Auth: `requireAuth` (CSRF gilt für POST)
   - **DB-Lookups-Scope:** der Server liest `agenda_items` aus DB (für Title/Lead/Datum/Hashtags/Image-Bytes — alle nicht im Payload), aber NICHT `instagram_layout_i18n` (das kommt aus dem Payload — das ist der draft-state der noch nicht gespeichert ist). Image-Bytes werden via existing `loadGridImageDataUrls(publicIds: string[])` aus `src/lib/instagram-images.ts` geladen (verifiziert vorhanden, line 61) genauso wie GET-Route — sonst wären grid-slide-Previews leer/broken.
   - Server berechnet Slide aus Payload-`slides[slideIdx]` + DB-fetched `agenda_items` row, rendert PNG via shared `renderSlideAsPng` Helper (siehe D2)
   - **`slideIdx` Bounds-Check:** wenn `slideIdx < 0` oder `slideIdx >= payload.slides.length` → 400 `invalid_slide_index` (verhindert unhandled crash bei `payload.slides[slideIdx]` undefined-render).
   - Response: `image/png`, body-bytes
   - Headers: `Cache-Control: no-store, private`
   - Audit: KEIN audit-event (Preview ist read-only, generiert keine User-visible Action)

**D2.** Render-Pipeline-Parität: `renderSlideAsPng(slide, ctx)` als shared helper in `src/lib/instagram-render-pipeline.ts` (NEU). Beide Routes rufen diesen auf:
   - Existing GET `/instagram-slide/[slideIdx]`: lädt agenda + layout aus DB → buildSlides → renderSlideAsPng(slide[idx])
   - Neuer POST `/instagram-preview/[slideIdx]`: lädt agenda aus DB, parsed layout aus payload → buildSlides via `buildManualSlides(payload.slides, item, ...)` → renderSlideAsPng(slide[idx])

   Kein Render-Drift möglich (Single-Owner-Pattern aus `patterns/api.md`).

**D3.** Client-Logic in LayoutEditor:
   - **Debounce-Pattern (useRef-Mutex aus `patterns/react.md`):**
     ```ts
     const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
     useEffect(() => {
       if (debounceRef.current) clearTimeout(debounceRef.current);
       debounceRef.current = setTimeout(() => { /* POST */ }, 300);
       return () => {
         if (debounceRef.current) clearTimeout(debounceRef.current);
       };
     }, [editedSlides]);
     ```
     Ein Timer pro Component-Lifetime, jeder neue Edit cleart den vorherigen. Trailing-edge debounce (nur letzte Eingabe wird gerendert).
   - Per-Slide Preview-Cache: `useRef<Map<number, string>>` mit blob-URLs pro slideIdx
   - Loading-State pro Slide (spinner overlay während POST in-flight)
   - Error-State pro Slide (banner „Preview fehlgeschlagen — letzten gespeicherten Stand gezeigt")
   - Bei Slide-textOverride-Edit re-rendert NUR diese Slide (nicht alle)
   - Bei Block-Move (state-change in editedSlides[from] + editedSlides[to]) re-rendert beide betroffenen Slides

**D3b.** **Blob-URL-Lifecycle-Management (Memory-Leak-Prevention):**
   - **Bei Cache-Update:** vor dem Schreiben einer neuen blob-URL für slideIdx N: `URL.revokeObjectURL(previewCache.current.get(N))` falls existing URL.
   - **Bei Modal-Unmount:** `useEffect(() => { return () => { for (const url of previewCache.current.values()) URL.revokeObjectURL(url); }; }, [])` — cleanup revoked alle remaining URLs.
   - **Bei Save (D4):** vor dem Cache-Clear: alle URLs revoken.
   - Test-Pflicht (E4): assert `URL.revokeObjectURL` wird aufgerufen bei (a) replace-Eintrag, (b) Modal-close.

**D4.** Save (existing PUT) cleart Preview-Cache (mit Revoke aller URLs aus D3b) → re-fetch via GET-Route (gespeicherte Truth).

#### Block E — Tests

**E1.** Unit-Tests in `src/lib/instagram-cover-layout.test.ts` (NEU):
   - `computeSlide1GridSpec`: 0/1/2/3/4/5 images → korrekte grid-spec
   - Aspect-Ratio-Handling pro count

**E2.** Unit-Tests in `src/lib/instagram-body-hash.test.ts` (NEU):
   - `computeBodyHashForSlide`: Determinismus (gleicher Input → gleicher Hash)
   - Whitespace-Trim-Handling
   - Image/embed-Block-Skip
   - Empty-blocks → consistent empty-hash

**E3.** Unit-Tests in `src/lib/instagram-post.test.ts` (EXTEND):
   - Slide-1 grid-path: Lead-rendering (Title + Lead + Grid auf Slide 1, alles zentriert)
   - Slide-1 no-grid-path: Title + Lead zentriert, Body links-bündig (per A3-Refinement)
   - `leadOnSlide`-Flag: false auf allen text-slides bei grid-path
   - **Stored-leadOnSlide-Override-Test:** existing row mit `leadOnSlide: true` in stored DB-state → `buildManualSlides`-output `slide.leadOnSlide === false` für text-slides bei grid-path (defense-in-depth gegen double-Lead-Render). `buildManualSlides` MUSS `leadOnSlide: false` immer hardcoden für text-slides bei grid-path, regardless of stored value.

**E4.** Component-Tests in `src/app/dashboard/components/LayoutEditor.test.tsx` (EXTEND):
   - Textarea pro body-slide rendert (kind="text")
   - Textarea NICHT rendered auf grid-slide oder supporters-slide
   - Auto-Button disabled bei undefined override, enabled bei aktivem override
   - Char-Counter zeigt korrekte length + Color-Branching (gray/amber/red)
   - **Save-Button disabled bei `count > MAX_BODY_CHARS_PER_SLIDE`** auf irgendeiner Slide (C4 Hard-Block)
   - Move-Buttons disabled bei aktivem override
   - **Stale-Banner bei `staleSlides=[{slideIdx: i, currentHash: "abc..."}]`** (NICHT `warnings.body_text_stale`) rendert mit beiden Buttons; „Override behalten" setzt local `baseBodyHash = currentHash` aus dem staleSlides-Eintrag
   - **C8-Test: Empty-Textarea redirect** — User clears textarea → state-update mit `""` → `setSlideOverride(idx, "")` redirected zu `clearSlideOverride(idx)` → `editedSlides[idx].textOverride === undefined` → save-payload via JSON.stringify enthält KEINEN `textOverride`-Key (verifiziert via dashboardFetch-mock-call-args)
   - **D3b-Tests: Blob-URL-Lifecycle** — (a) cache-replace ruft `URL.revokeObjectURL(oldUrl)` auf, (b) modal-unmount cleanup-effect revoket alle remaining URLs (verifiziert via `vi.spyOn(URL, "revokeObjectURL")`)

**E5.** Integration-Tests in `src/app/api/dashboard/agenda/[id]/instagram-layout/route.test.ts` (EXTEND — **NICHT** `instagram/route.test.ts` welche read-only-GET ist):
   - PUT mit `textOverride` + `baseBodyHash` round-trips
   - PUT mit `textOverride` auf grid-slide → 422 `override_not_allowed`
   - PUT mit `textOverride` länger als 10000 → 422 `body_too_long`
   - PUT mit `textOverride === ""` → 422 `override_empty` (defense — Client soll `""` nie senden)
   - PUT mit `baseBodyHash` non-hex/wrong-length → 422 (regex-validation)
   - **GET nach Body-change in agenda → response enthält `staleSlides: [{slideIdx, currentHash}]`** (NICHT `warnings.body_text_stale`)
   - GET ohne stale → response `staleSlides: []` (empty array, nicht missing)
   - Backward-compat: existing rows ohne `textOverride` werden korrekt gelesen

**E6.** Integration-Tests für Preview-Route `src/app/api/dashboard/agenda/[id]/instagram-preview/[slideIdx]/route.test.ts` (NEU):
   - POST 200 OK + image/png Content-Type + body-bytes > 0
   - POST ohne Auth → 401
   - POST ohne CSRF → 403
   - POST mit malformed payload → 400
   - **POST mit `slideIdx` out-of-bounds (negative oder ≥ payload.slides.length) → 400 `invalid_slide_index`**

**E7.** Visual-Smoke (DK-manual auf Staging):
   - **Grid-Path:** Eintrag mit 3 Bildern + langem Body öffnen → Slide 1 zeigt Title + Lead + 1×3 Grid zentriert (alle 4 Elemente center-aligned)
   - **No-Grid-Path:** Eintrag OHNE Bilder öffnen → Slide 1 zeigt Title + Lead zentriert + Body links-bündig (Body bleibt left-aligned per A3)
   - **Override-Flow:** Slide 2 textOverride tippen → Preview re-rendert nach 300ms mit override-Text → Save → Reopen Modal → Override persistiert + zeigt im Editor
   - **Auto-Reset:** Auto-Button → Slide 2 zurück auf auto-Render
   - **Stale-Detection:** Agenda-Body editieren + speichern → Modal neu öffnen → Stale-Banner auf Slide 2 mit beiden Buttons funktional
   - **Char-Counter Hard-Block:** 10001 Zeichen tippen → Save-Button disabled, inline error message, Char-Counter rot
   - **Empty-Clear:** alle Zeichen aus textarea löschen → state geht zu `undefined`, save-payload sendet KEIN `textOverride: ""` (per Network-Tab verifiziert)
   - **Memory-Leak-Check:** Modal mit 5 Slides öffnen, in jeder textOverride tippen, dann Modal schließen → DevTools-Memory-Profile zeigt blob-URLs revoked (Snapshot vor/nach Modal-Close)

### Nice to Have (NOT this sprint, → `memory/todo.md`)

- Pure-text Slides (User fügt Slide ohne Block-Anker hinzu)
- Word-Level-Split (Option B aus Design-Doc)
- Markdown/Rich-Text im textOverride
- Override für Title/Lead/Hashtags
- Bildunterschriften im Cover-Grid
- Drag-Reorder von Body-Slides (currently nur prev/next-buttons)

### Out of Scope

- Image-Slides mit eigenem Override (existieren post-Sprint nicht — current architecture hat schon nur grid+text+supporters)
- Supporter-Slide-Override (Layout fix aus Sprint M3)
- IG-Stories-Format 9:16
- Per-User-Defaults für `imageCount` (immer dynamisch berechnet)

## Technical Approach

### Files to Change

| File | Change | Description |
|---|---|---|
| `src/lib/instagram-post.ts` | Modify | (a) `InstagramLayoutSlide` type extended um `textOverride?` + `baseBodyHash?` (B1), (b) `Slide` type extended um `textOverride?` (B1b), (c) NEW const `MAX_BODY_CHARS_PER_SLIDE = 10000` (B1d), (d) Slide-1 grid mit Lead + zentriertes Cover, (e) `leadOnSlide:false` für text-slides bei grid-path |
| `src/lib/instagram-post.test.ts` | Modify | Tests für neue Slide-1-Layout (A1/A2/A3) + neue Konstante |
| `src/lib/instagram-overrides.ts` | Modify | (a) Zod-schema-update für `textOverride` + `baseBodyHash` validation (B8), (b) `buildManualSlides` mappt `overrideSlide.textOverride → slide.textOverride` (B1c) |
| `src/lib/instagram-overrides.test.ts` | Modify | Test für `buildManualSlides`-Mapping (B1c) + Zod-validation Cases |
| `src/lib/instagram-body-hash.ts` | Create | Pure helper SHA-256 via Web-Crypto |
| `src/lib/instagram-body-hash.test.ts` | Create | Unit tests für Hash-Determinismus + Whitespace-Normalisierung |
| `src/lib/instagram-cover-layout.ts` | Create | Pure helper `computeSlide1GridSpec` für grid-rules A4 |
| `src/lib/instagram-cover-layout.test.ts` | Create | Unit tests für 0/1/2/3/4/5 images |
| `src/lib/layout-editor-state.ts` | Modify | Neue Ops `setSlideOverride`, `clearSlideOverride`, `acknowledgeStale`. **Wichtig:** `setSlideOverride(idx, "")` muss internally `clearSlideOverride(idx)` callen (siehe C8) |
| `src/lib/layout-editor-state.test.ts` | Modify | Unit tests für neue Ops + C8 empty-string-redirect |
| `src/lib/instagram-render-pipeline.ts` | Create | Shared helper `renderSlideAsPng(slide, ctx): Promise<Buffer>` für Single-Owner-Pattern (D2) |
| `src/app/api/dashboard/agenda/[id]/instagram-slide/[slideIdx]/slide-template.tsx` | Modify | (a) Centering Slide-1 grid (Title + Lead + Grid + Hashtags), (b) override-rendering branch in text-slide via `slide.textOverride` |
| `src/app/api/dashboard/agenda/[id]/instagram-slide/[slideIdx]/route.tsx` | Modify | Refactor zu `renderSlideAsPng` shared helper |
| `src/app/api/dashboard/agenda/[id]/instagram-preview/[slideIdx]/route.tsx` | Create | New POST route für Draft-Preview, lädt agenda + image-bytes aus DB, layout-state aus payload (D1) |
| `src/app/api/dashboard/agenda/[id]/instagram-preview/[slideIdx]/route.test.ts` | Create | Integration tests E6 |
| `src/lib/layout-editor-types.ts` | Modify | `EditorSlide` extended um `textOverride?: string` + `baseBodyHash?: string` (B1e) |
| `src/app/api/dashboard/agenda/[id]/instagram-layout/route.ts` | Modify | (a) PUT-validator extension (B8 — **DIES IST DIE PUT-ROUTE**), (b) GET response erweitert um Top-Level `staleSlides: {slideIdx, currentHash}[]` (B6b), (c) Stale-Detection-Algorithmus B6 (block-set-based, parallel via Promise.all, NOT position-based), (d) audit-payload `text_overrides_count` (B9) |
| `src/app/api/dashboard/agenda/[id]/instagram-layout/route.test.ts` | Modify | Tests E5 — alle PUT/GET-Cases auf instagram-layout-Route (NICHT `instagram/route.test.ts`) |
| `src/app/dashboard/components/LayoutEditor.tsx` | Modify | (a) Per-slide Textarea + Auto-Button + Counter + Stale-Banner, (b) Move-Disable bei aktivem Override (C5/C6), (c) C8 empty-textarea handling, (d) Draft-Preview-Logic mit useRef-Mutex debounce (D3), (e) Blob-URL Revoke-Lifecycle (D3b), (f) Save-Button-Disable bei `count > MAX_BODY_CHARS_PER_SLIDE` auf irgendeiner Slide (C4 hard-block), (g) `serverState`-Type extended um `staleSlides` + GET-response-parsing (C7b), (h) **Audit ALL `useCallback`/`useMemo` dep-arrays** für hooks die `editedSlides` lesen (z.B. existing `handleDownload`) — neue `textOverride`/`baseBodyHash` fields müssen in dep-array (verhindert stale-closure, lessons.md PR #110 R1 P2) |
| `src/app/dashboard/components/LayoutEditor.test.tsx` | Modify | Component tests E4 |
| `src/app/dashboard/components/InstagramExportModal.tsx` | Modify | imageCount default `min(4, available)`, Slider-Range update |
| `src/app/dashboard/components/InstagramExportModal.test.tsx` | Modify | Test default-imageCount |

### Architecture Decisions

- **Hash function**: Web-Crypto `crypto.subtle.digest("SHA-256", encoded)` — Edge-safe, no dependencies, ~64 chars hex output. Async API, helper returns Promise<string>.
- **Override semantics**: `textOverride === undefined` → auto-render. `textOverride === ""` → invalid (Validator rejects, User muss Auto-Button für clear).
- **Move-Disable bei Override**: Verhindert Edge-Case wo User block-move auf override-Slide klickt → blocks-array ändert sich → baseBodyHash würde drift, aber Renderer rendert override (ignoriert blocks). Sicherer: User muss override clearen → move → optional neuen override setzen.
- **Slide-1 cover-type**: bleibt `kind: "grid"` (kein neues kind="cover" — minimaler Diff). Centering passiert in Template via `textAlign: "center"` und `justifyContent: "center"`.
- **Backward-Compat**: existing `instagram_layout_i18n` rows ohne `textOverride` bleiben gültig (Zod `.optional()`). Existing rows mit `leadOnSlide: true` Block-Markierung werden via dynamischer Berechnung post-Sprint handled — stored field ignoriert.

### Dependencies

- Web-Crypto API (eingebaut, no dep)
- Keine npm-package-Adds
- Schema-DDL: keine — JSONB additive in App-Code

## Edge Cases

| Case | Expected Behavior |
|---|---|
| User setzt textOverride, dann ändert Agenda-Body | Stale-Banner auf Slide; User wählt behalten oder auf-Auto-zurücksetzen |
| User setzt textOverride, save mit If-Match etag race | 412 Precondition Failed (existing optimistic-concurrency), User refresh + re-edit |
| User klickt Move auf override-Slide | Button disabled mit Tooltip „Override aktiv — Auto wiederherstellen" |
| `imageCount` > available | Server-clamp auf `min(N, available, 4)` (warning) |
| textOverride > 10_000 chars | Validator 422 `body_too_long` |
| textOverride === "" | Validator 422 — User muss Auto-Button klicken |
| Empty agenda body + textOverride gesetzt | Override gilt, Slide rendert override-Text. Auto-Button danach würde Slide leer machen — OK (User-decision) |
| Mobile-Modal Textarea-UX | Tablet+ supported, Mobile = Phase-2 (existing convention) |
| User tippt schnell, debounce-300ms | Trailing-edge debounce; nur letzte Eingabe gerendert |
| Migration existing rows | `leadOnSlide: true` field auf text-slide ignoriert post-Sprint, kein Schema-Break |
| Slide-1 grid mit > 4 Bildern | Server clamp auf 4, restliche images werden NICHT in grid gepackt (warning) |
| User reduziert imageCount von 4 auf 0 | Slide-1 wechselt von kind="grid" zu kind="text" mit Title+Lead+Body |
| Hash-Mismatch bei Save (concurrent edit) | 412 (existing) — kein neuer Failure-Mode |
| User-Browser blockiert Web-Crypto | Hash-Helper wirft → console.error → Override save would fail → Banner „Browser-Feature fehlt". Sehr seltener Edge-Case. |

## Risks

- **Render-Drift POST vs GET**: Wenn jemand SlideTemplate forked → Preview ≠ finaler Download. **Mitigation**: shared `renderSlideAsPng` helper, Single-Owner-Pattern (api.md) forced beide Routes durch denselben Code.
- **Hash-Determinismus über Whitespace**: `computeBodyHashForSlide` muss trim-aware + newline-normalisiert sein. **Mitigation**: explicit Test E2 für Whitespace-Edge-Cases.
- **JSONB-Größe**: textOverride 10_000 chars × ~10 slides × 2 locales = ~200kB pro Eintrag-Row. PG kein Problem aber UI-Roundtrip transferred. Akzeptabel.
- **Slide-1 Layout-Migration**: existing IG-Posts könnten andere Aspekt-Erwartung haben. **Mitigation**: Render-Time-Änderung, kein Datenmigration — nächster Export wird Cover-zentriert sein. Bestehende heruntergeladene PNGs unverändert.
- **Char-Counter MAX_BODY_CHARS_PER_SLIDE-Drift**: existing constant ist auf den Auto-Render kalibriert. textOverride könnte andere Wrap-Eigenschaften haben. **Mitigation**: Counter ist nur Soft-Warning, nicht Hard-Block. User sieht Preview als Truth.
- **Concurrent edit auf textOverride + blocks**: User1 ändert Slide-2 override, User2 bewegt block aus Slide-2. Optimistic-concurrency etag fängt das (existing).

---

**Sprint-Size-Estimate:** Medium-Large — ~18 Files (5 new + 13 modify), 5–8 Spec-Eval-Runden + 2–3 Codex-PR-Runden basierend auf S2c/M3-Komplexität.

**Sprint-Patterns referenziert:**
- `api.md` — Single-Owner-Pattern (Render-Pipeline shared helper)
- `api-validation.md` — Zod schema partial-PUT, FK-validator-mime-check (für textOverride scope)
- `database-concurrency.md` — Optimistic-Concurrency etag (existing, kein neuer Failure-Mode)
- `database-migrations.md` — JSONB additive (kein DDL nötig)
- `react.md` — useEffect+setState, useRef-Mutex (debounce + per-slide Preview-Cache)
- `nextjs-og.md` — Satori-CSS-Subset (whiteSpace pre-wrap), force-static decision-matrix
- `testing.md` — file-content-regex bei modern-CSS, Vitest jsdom-pragma
- `workflow.md` — Mirror-not-Refactor (renderSlideAsPng als shared, NICHT generalisierter override-engine)

**Spec-Status:** awaiting user approval. Bei Approval → tasks/todo.md schreiben, dann Implementation startet.
