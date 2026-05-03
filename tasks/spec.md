# Spec: Sprint M4 — Instagram Per-Slide Body-Text Override + Slide-1 Cover-Centering

<!-- Created: 2026-05-03 -->
<!-- Author: Planner (Claude Opus 4.7) -->
<!-- Status: Draft — awaiting user approval -->

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

**A3.** No-grid-Path (`imageCount === 0`): Slide 1 bleibt `kind: "text"` mit Title + Lead + Body wie heute. Title + Lead in dieser Variante AUCH zentriert (für visuelle Konsistenz mit grid-Path).

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

**B1.** `InstagramLayoutSlide`-Type (in `src/lib/instagram-overrides.ts`) erweitert um zwei optionale Felder:
   ```ts
   {
     blocks: string[];
     textOverride?: string;       // user-edited body text, undefined = auto
     baseBodyHash?: string;       // SHA-256 hex of auto-rendered body at time of save
   }
   ```

**B2.** Override gilt **nur für Body-Slides** mit `kind === "text"`. Grid-Slide (Slide 1, `kind: "grid"`) und Supporter-Slide (`kind: "supporters"`) haben kein Override-Field — UI rendert keine Textarea, Validator weist `textOverride` auf diesen Slides ab (422 `override_not_allowed`).

**B3.** Renderer (`SlideTemplate.tsx`): bei `slide.kind === "text" && slide.textOverride !== undefined` rendert die Body-Region den `textOverride` als einzelnen Plaintext-Block (zentrierter Text-Container, gleiche Font/Size/Line-Height wie Auto-Body, Newlines via `whiteSpace: "pre-wrap"` Satori-safe).

**B4.** `slide.blocks: string[]` bleibt für Stale-Detection persisted, wird im Override-Render aber **ignoriert**. Block-IDs sind nur noch Stale-Anchor.

**B5.** `computeBodyHashForSlide(blocks: ContentBlock[]): Promise<string>` als pure helper in neuer Datei `src/lib/instagram-body-hash.ts`. Hash = SHA-256 hex (Web-Crypto via `crypto.subtle.digest`, Edge-safe). Input-Normalisierung:
   - Concatenate alle paragraph/heading/quote-Block-Texte mit `\n`-Separator
   - Trim-aware (strip leading/trailing whitespace pro Block)
   - Image/embed/video/spacer-Blocks SKIPPED
   - Output: 64-char hex string

**B6.** Stale-Detection: GET `/api/dashboard/agenda/[id]/instagram/` berechnet pro Override-belegter Slide den aktuellen Body-Hash. Wenn `baseBodyHash` gesetzt UND `currentHash !== baseBodyHash` → response.warnings array enthält `{type: "body_text_stale", slideIdx: N}` für jede betroffene Slide.

**B7.** UI bei stale (per Slide): amber Banner unter Textarea: „Inhalt der Agenda wurde geändert. Override behalten oder auf Auto zurücksetzen?" + zwei Buttons.

**B8.** PUT-Validator akzeptiert neue Shape:
   - `textOverride: string | undefined`, max-length 10000 chars (Defense gegen JSONB-blowup)
   - `baseBodyHash: string | undefined`, regex `^[a-f0-9]{64}$` (SHA-256 hex)
   - Empty-string `""` für `textOverride` rejected → User muss explizit Auto-Button klicken (entfernt key)
   - `textOverride` auf grid/supporters-slide rejected (422 `override_not_allowed`)

**B9.** Audit-Event `agenda_instagram_layout_update` Payload erweitert um `text_overrides_count: number` (Anzahl Body-Slides mit `textOverride !== undefined` post-save).

#### Block C — LayoutEditor UI für textOverride

**C1.** Pro Body-Slide (`kind === "text"`) rendert LayoutEditor zusätzlich zur Block-Liste eine `<textarea>` (data-testid `slide-textarea-${slideIdx}`) mit current `textOverride` (oder leer string falls undefined).

**C2.** Textarea hat `placeholder="Auto-generierter Text"` wenn override leer.

**C3.** Auto-Button (data-testid `slide-override-clear-${slideIdx}`) neben Textarea: cleart override → setzt `textOverride` lokal auf undefined, Textarea-Wert auf empty string. Button **disabled** wenn `textOverride === undefined` (no-op).

**C4.** Char-Counter (data-testid `slide-override-counter-${slideIdx}`) unter Textarea: zeigt `${currentLength} / ${MAX_BODY_CHARS_PER_SLIDE}`. Existing `MAX_BODY_CHARS_PER_SLIDE` constant aus `instagram-post.ts` re-exported. Counter-Color:
   - `count <= 0.9 * MAX`: gray
   - `0.9 * MAX < count <= 1.0 * MAX`: amber (`text-amber-700`)
   - `count > 1.0 * MAX`: red (`text-red-600`) — aber **kein Hard-Block**, save geht trotzdem durch

**C5.** Move-Buttons (`moveBlockToPrev/Next`) auf override-belegter Slide: **disabled** mit `title="Override aktiv — auf Auto zurücksetzen um Blocks zu moven"`. Verhindert Inconsistency wo Block-Move den Hash-Anker drift produziert.

**C6.** `splitSlideHere` auf override-belegter Slide: ebenfalls disabled (gleicher Hint).

**C7.** Stale-Banner (siehe B7): amber Banner unter Textarea bei `warnings: [{type: "body_text_stale", slideIdx: i}]` für die jeweilige Slide. Zwei Buttons:
   - „Override behalten" → setzt `baseBodyHash` lokal auf currentHash (acknowledges stale, no content change)
   - „Auto wiederherstellen" → cleart `textOverride` + `baseBodyHash` (Slide rendert wieder auto)

#### Block D — Draft-Preview-Route

**D1.** Neue Route `POST /api/dashboard/agenda/[id]/instagram-preview/[slideIdx]/route.tsx`:
   - Body: full layout-payload `{ slides, locale, imageCount, draft: true }` JSON
   - Auth: `requireAuth` (CSRF gilt für POST)
   - Server berechnet Slide aus Payload (NICHT aus DB), rendert PNG via existing SlideTemplate-Pipeline
   - Response: `image/png`, body-bytes
   - Headers: `Cache-Control: no-store, private`
   - Audit: KEIN audit-event (Preview ist read-only, generiert keine User-visible Action)

**D2.** Render-Pipeline-Parität: `renderSlideAsPng(slide, ctx)` als shared helper extrahiert. Beide Routes (existing GET `/instagram-slide/[slideIdx]`, neuer POST `/instagram-preview/[slideIdx]`) rufen den auf. Kein Render-Drift möglich (Single-Owner-Pattern aus `patterns/api.md`).

**D3.** Client-Logic in LayoutEditor:
   - `useEffect` auf `editedSlides` mit 300ms-debounce → POST per slide die geändert wurde
   - Per-Slide Preview-Cache (Map<slideIdx, blob-URL>) für rendered Drafts
   - Loading-State pro Slide (spinner overlay während POST in-flight)
   - Error-State pro Slide (banner „Preview fehlgeschlagen — letzten gespeicherten Stand gezeigt")
   - Bei Slide-textOverride-Edit re-rendert NUR diese Slide (nicht alle)
   - Bei Block-Move (state-change in editedSlides[from] + editedSlides[to]) re-rendert beide betroffenen Slides

**D4.** Save (existing PUT) cleart Preview-Cache → re-fetch via GET-Route (gespeicherte Truth).

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
   - Slide-1 grid-path: Lead-rendering (Title + Lead + Grid auf Slide 1)
   - Slide-1 no-grid-path: Title + Lead + Body wie vorher
   - `leadOnSlide`-Flag: false auf allen text-slides bei grid-path

**E4.** Component-Tests in `src/app/dashboard/components/LayoutEditor.test.tsx` (EXTEND):
   - Textarea pro body-slide rendert (kind="text")
   - Textarea NICHT rendered auf grid-slide oder supporters-slide
   - Auto-Button disabled bei undefined override, enabled bei aktivem override
   - Char-Counter zeigt korrekte length + Color-Branching
   - Move-Buttons disabled bei aktivem override
   - Stale-Banner bei `warnings.body_text_stale` rendert mit beiden Buttons

**E5.** Integration-Tests in `src/app/api/dashboard/agenda/[id]/instagram/route.test.ts` (EXTEND):
   - PUT mit `textOverride` + `baseBodyHash` round-trips
   - PUT mit `textOverride` auf grid-slide → 422 `override_not_allowed`
   - PUT mit `textOverride` länger als 10000 → 422 `body_too_long`
   - GET nach Body-change in agenda → warnings enthält `body_text_stale`
   - Backward-compat: existing rows ohne `textOverride` werden korrekt gelesen

**E6.** Integration-Tests für Preview-Route `src/app/api/dashboard/agenda/[id]/instagram-preview/[slideIdx]/route.test.ts` (NEU):
   - POST 200 OK + image/png Content-Type + body-bytes > 0
   - POST ohne Auth → 401
   - POST ohne CSRF → 403
   - POST mit malformed payload → 400

**E7.** Visual-Smoke (DK-manual auf Staging):
   - Echter Eintrag mit 3 Bildern + langem Body öffnen
   - Modal: Slide 1 zeigt Title + Lead + 1×3 Grid zentriert
   - Slide 2 textOverride tippen → Preview re-rendert nach 300ms mit override-Text
   - Save → Reopen Modal → Override persistiert + zeigt im Editor
   - Auto-Button → Slide 2 zurück auf auto-Render
   - Agenda-Body editieren + speichern → Modal neu öffnen → Stale-Banner auf Slide 2

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
| `src/lib/instagram-overrides.ts` | Modify | Type extended um `textOverride?` + `baseBodyHash?`, Zod-schema-update |
| `src/lib/instagram-body-hash.ts` | Create | Pure helper SHA-256 via Web-Crypto |
| `src/lib/instagram-body-hash.test.ts` | Create | Unit tests für Hash-Determinismus |
| `src/lib/instagram-cover-layout.ts` | Create | Pure helper `computeSlide1GridSpec` für grid-rules A4 |
| `src/lib/instagram-cover-layout.test.ts` | Create | Unit tests für 0/1/2/3/4/5 images |
| `src/lib/instagram-post.ts` | Modify | Slide-1 grid mit Lead, no-grid Title+Lead zentriert, `leadOnSlide:false` für text-slides bei grid-path |
| `src/lib/instagram-post.test.ts` | Modify | Tests für neue Slide-1-Layout |
| `src/lib/layout-editor-state.ts` | Modify | Neue Ops `setSlideOverride`, `clearSlideOverride`, `acknowledgeStale` |
| `src/lib/layout-editor-state.test.ts` | Modify | Unit tests für neue Ops |
| `src/lib/instagram-render-pipeline.ts` | Create | Shared helper `renderSlideAsPng(slide, ctx)` für Single-Owner-Pattern |
| `src/app/api/dashboard/agenda/[id]/instagram-slide/[slideIdx]/slide-template.tsx` | Modify | Centering Slide-1 grid + override-rendering branch in text-slide |
| `src/app/api/dashboard/agenda/[id]/instagram-slide/[slideIdx]/route.tsx` | Modify | Refactor zu `renderSlideAsPng` shared helper |
| `src/app/api/dashboard/agenda/[id]/instagram-preview/[slideIdx]/route.tsx` | Create | New POST route für Draft-Preview |
| `src/app/api/dashboard/agenda/[id]/instagram-preview/[slideIdx]/route.test.ts` | Create | Integration tests |
| `src/app/api/dashboard/agenda/[id]/instagram/route.ts` | Modify | PUT-validator extension + GET stale-warnings |
| `src/app/api/dashboard/agenda/[id]/instagram/route.test.ts` | Modify | Tests für neue PUT-Validation + Stale-warnings |
| `src/app/dashboard/components/LayoutEditor.tsx` | Modify | Textarea + Auto-Button + Counter + Stale-Banner + Move-Disable + Draft-Preview-Logic |
| `src/app/dashboard/components/LayoutEditor.test.tsx` | Modify | Component tests E4 |
| `src/app/dashboard/components/InstagramExportModal.tsx` | Modify | imageCount default `min(4, available)`, slider-range update |
| `src/app/dashboard/components/InstagramExportModal.test.tsx` | Modify | Test default-imageCount |
| `src/lib/queries.ts` | Modify | `getInstagramLayout` returns warnings array (stale-detection) |

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
