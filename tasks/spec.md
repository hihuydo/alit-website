# Spec: Sprint M4a — Instagram Slide-1 Cover-Centering + Image-Grid-Cap

<!-- Created: 2026-05-03 (split from M4 after Codex SPLIT_RECOMMENDED) -->
<!-- Author: Planner (Claude Opus 4.7) -->
<!-- Status: R3 Draft — Sonnet R2 11 findings (2C/4H/3M/2L) addressed; awaiting Sonnet R3 verdict -->
<!-- Original M4 + Sonnet R1-R7 + Codex review archived in tasks/m4-*.archived -->

## Summary

Slide 1 des Instagram-Carousels rendert ab jetzt **Title + Lead + Image-Grid + Hashtags zentriert** (statt aktuell Title + image-grid links-bündig, Lead auf Slide 2). Cover-Grid hat fixen Layout-Cap von 4 Bildern. Default `imageCount` im Modal-Slider ist `min(4, available)` (heute: 0).

**Scope-Split-Begründung (Codex Spec-Review 2026-05-03):** Das ursprüngliche M4 hat zwei ungleich große Änderungen gebündelt — A (kleiner Layout-Fix, lokal) und B/C/D (großer Override-/Preview-/Stale-Refactor). Nach 7 Sonnet-Runden + Codex-Architektur-Findings ist klar dass die B/C/D-Architektur (`baseBodyHash` lifecycle, Preview-Snapshot, Out-of-Order-Race) nochmal frisch durchdacht werden muss. M4a shippt heute den Layout-Fix risikoarm; M4b kommt als separater Sprint mit fresh spec + Codex-Findings als Foundation.

## Context

**Aktuelles Verhalten (Stand PR #110, prod 2026-04-22 + S2c PR #136):**
- Slide 1 mit `imageCount > 0`: `kind: "grid"` — Title (links-bündig) + Image-Grid. Lead rendert NICHT auf Slide 1.
- Slide 2 (erste text-Slide nach grid): `leadOnSlide: true` → Lead-Prefix + Body-Blocks
- Default `imageCount` im Modal: 0 (User muss aktiv hochdrehen um Cover-Grid zu sehen)
- `imageCount`-Range im Slider: `0..countAvailableImages(item)` (heute uncapped)
- DB-Storage: `agenda_items.instagram_layout_i18n: {[locale]: {[imageCount]: InstagramLayoutOverride}}` — beliebige imageCount-Keys möglich (heute bis MAX_BODY_IMAGE_COUNT)

**Pain Points (User-Feedback 2026-05-03):**
- Slide-1 Title links-bündig ohne Lead wirkt visuell unausgewogen
- Default-imageCount=0 zwingt User jedes Mal aktiv hochzudrehen

**Out-of-Scope (M4b — separater Sprint):**
- Per-Slide `textOverride` (User editiert Body-Text pro Slide)
- `baseBodyHash` Stale-Detection
- Draft-Preview-Route (POST mit unsaved Layout)
- LayoutEditor textarea + Auto-Button + Stale-Banner

## Requirements

### Must Have (Sprint Contract)

#### A1. Slide-1 Cover-Layout — zentriert
Slide 1 mit `kind: "grid"` rendert in genau dieser vertikalen Reihenfolge: **Title** → **Lead** → **Image-Grid** → **Hashtags**. Alle vier Elemente horizontal zentriert (`textAlign: "center"` für Title/Lead/Hashtags, Grid via `justifyContent: "center"` auf parent flex).

#### A1b. Spacing-Konstanten für Grid-Cover Layout (Sonnet R1 #4)
Da die vertikale Reihenfolge von `[Hashtags → Title → Grid]` zu `[Title → Lead → Grid → Hashtags]` wechselt, brauchen wir neue Konstanten in `slide-template.tsx`. Existing `HASHTAGS_TO_TITLE_GAP = 60`, `HEADER_TO_BODY_GAP = 60`, `TITLE_TO_GRID_GAP = 48`, `LEAD_TO_BODY_GAP = 100`, `TITLE_TO_LEAD_GAP = 18`, `HEADER_TO_HASHTAGS_GAP = 32` werden NICHT modifiziert (für nicht-grid-cover Slides weiterhin verwendet).

Neue Konstanten für grid-cover-Layout:
- `HEADER_TO_TITLE_GAP_GRID_COVER = 60` (px) — zwischen Header und Title (ersetzt das vorher von Hashtags+Gap belegte vertical space)
- `TITLE_TO_LEAD_GAP_GRID_COVER = 32` (px) — zwischen Title und Lead (engerer Reading-Flow als TITLE_TO_GRID_GAP)
- `LEAD_TO_GRID_GAP_GRID_COVER = 48` (px) — zwischen Lead und Grid
- `GRID_TO_HASHTAGS_GAP_GRID_COVER = 48` (px) — zwischen Grid und Hashtags

Diese Werte sind die initial-Targets und können per Visual-Smoke E5 nachjustiert werden falls nötig (Pixel-Tuning ist NICHT separater Spec-Roundtrip-Anlass).

**A1b-Naming-Disambiguation (Sonnet R2 #11):**
- `TITLE_TO_LEAD_GAP = 18` — EXISTIERT, wird AUSSCHLIESSLICH im `kind === "text"` `isFirst`-Branch (no-grid-path) verwendet. NICHT modifizieren, NICHT durch GRID_COVER-Variant ersetzen.
- `TITLE_TO_LEAD_GAP_GRID_COVER = 32` — NEU, AUSSCHLIESSLICH im `kind === "grid"`-Branch verwendet.
- Beide existieren parallel, kein Replace.

#### A1d. HashtagsRow-Component-Props für grid-cover-Branch (Sonnet R2 #1)
Existing `HashtagsRow` (slide-template.tsx ~lines 163–187) hat `marginTop: HEADER_TO_HASHTAGS_GAP = 32` HARDCODED in seinem inline-style und KEIN `justifyContent: center` (default left-align via `display: flex` ohne explicit justify). Für grid-cover-Branch wo Hashtags AFTER Grid + zentriert rendern müssen, brauchen wir Component-Prop-Erweiterung.

**Implementation-Anweisung:**
```ts
// HashtagsRow Props erweitern:
type HashtagsRowProps = {
  hashtags: string[];
  marginTop?: number;       // override für default HEADER_TO_HASHTAGS_GAP
  centered?: boolean;        // wenn true: justifyContent: "center"
};

// Inline-style:
const resolvedMarginTop = props.marginTop ?? HEADER_TO_HASHTAGS_GAP;
const justifyContent = props.centered ? "center" : "flex-start";
return <div style={{ marginTop: resolvedMarginTop, display: "flex", justifyContent, gap: 16, ... }}>...</div>;
```

**JSX-Call-Sites:**
- `kind === "grid"` branch (grid-cover): `<HashtagsRow hashtags={meta.hashtags} marginTop={GRID_TO_HASHTAGS_GAP_GRID_COVER} centered />`
- ALLE anderen Branches: unchanged `<HashtagsRow hashtags={meta.hashtags} />` (default props = unmodified existing behavior).

Damit ist die existing-no-grid-text-Slide-1 Hashtag-Render (line ~549 isFirst-Block) bit-identisch zu vor M4a — keine visual-regression auf no-grid-cover.

#### A1c. `GRID_MAX_HEIGHT` für Cover-Layout neu berechnen (Sonnet R1 #5)
Existing `GRID_MAX_HEIGHT = 700` wurde berechnet für `[Hashtags(94) + Title(280) + TITLE_TO_GRID_GAP(48)]` = 422 over Grid. Nach A1 ist die Reihenfolge anders — Grid ist eingeklemmt zwischen [Title + Lead] oben und [Hashtags] unten.

Neue Budget-Rechnung für Slide-1 grid-cover:
```
Available height: 1350 - 2×80 padding = 1190
- HeaderRow:                           34
- HEADER_TO_TITLE_GAP_GRID_COVER:      60
- Title (worst-case 3-line ≈ 280):    280
- TITLE_TO_LEAD_GAP_GRID_COVER:        32
- Lead (worst-case 2-line ≈ 126):     126
- LEAD_TO_GRID_GAP_GRID_COVER:         48
- GRID_TO_HASHTAGS_GAP_GRID_COVER:     48
- Hashtags (~32):                      32
                          Subtotal:   660
Grid-available: 1190 - 660 = 530 → round down to 500 für safety margin.
```

Neue Konstante: `GRID_MAX_HEIGHT_COVER = 500` (px) für grid-cover-Layout. Existing `GRID_MAX_HEIGHT = 700` bleibt unmodifiziert für image-only-Slides (Slides 2..N im image-mode haben kein Title/Lead/Hashtags).

`computeGridDimensions`/`fitImage`-Helper werden im SlideTemplate-Cover-Branch mit `GRID_MAX_HEIGHT_COVER` aufgerufen (statt `GRID_MAX_HEIGHT`). Wird im Files-to-Change-Eintrag für `slide-template.tsx` explizit gefordert.

#### A2. Lead-Move von Slide 2 auf Slide 1
Lead rendert auf Slide 1 (`kind: "grid"`) IF `meta.lead` non-empty. Der `leadOnSlide`-Flag auf Slide 2 wird auf `false` gesetzt — Lead darf NICHT mehr auf Slide 2 erscheinen wenn Slide 1 grid ist.

**Wichtig:** Both `splitAgendaIntoSlides` (auto-path renderer) AND `buildManualSlides` (manual-path) müssen `leadOnSlide: false` für ALLE text-slides setzen wenn `hasGrid === true`. Stored `leadOnSlide: true` aus legacy-rows wird im manual-path hardcoded auf `false` overridden (verhindert double-Lead-Render).

**A2b. Slide-2-Budget muss nach Lead-Move auf `SLIDE_BUDGET` gesetzt werden** (Sonnet R1 #1):

Aktueller Code in `splitAgendaIntoSlides` (`instagram-post.ts` ~lines 434–437) reduziert das Budget der ersten text-slide um `leadHeightPx(lead)` weil Lead dort gerendert wurde. Nach A2 wandert Lead aber auf die grid-slide → diese Reduktion muss entfernt werden, sonst wird Slide 2 künstlich underfilled und Content spillt unnötig auf Slide 3+.

```ts
// VORHER (instagram-post.ts):
const slide2BodyBudget = hasGrid
  ? Math.max(SLIDE_BUDGET - leadHeightPx(lead), 200)
  : SLIDE_BUDGET;
const firstSlideBudget = hasGrid ? slide2BodyBudget : SLIDE1_BUDGET;

// NACHHER:
const firstSlideBudget = hasGrid ? SLIDE_BUDGET : SLIDE1_BUDGET;
// (slide2BodyBudget Variable entfernen — Lead lebt jetzt auf Slide 1 grid)
```

```ts
// VORHER (instagram-overrides.ts buildManualSlides ~lines 117–124):
const slideBudget = idx === 0
  ? hasGrid ? lead ? Math.max(SLIDE_BUDGET - leadHeightPx(lead), 200) : SLIDE_BUDGET
             : SLIDE1_BUDGET
  : SLIDE_BUDGET;

// NACHHER:
const slideBudget = idx === 0
  ? hasGrid ? SLIDE_BUDGET : SLIDE1_BUDGET
  : SLIDE_BUDGET;
```

`leadHeightPx`-Helper bleibt verwendbar (für grid-cover-Layout-Budget A1b), aber NICHT mehr für Slide-2-Budget bei grid-path.

#### A3. No-Grid-Path Slide 1 (`imageCount === 0`)
Slide 1 bleibt `kind: "text"`. **Nur Title + Lead** zentriert (visuelle Konsistenz mit grid-Path-Cover). **Body-Blocks bleiben links-bündig** (gleiche Behandlung wie alle anderen text-slides). **Hashtags bleiben an aktueller Position (BEFORE Title) und unzentriert** (Sonnet R2 #4) — siehe A3c.

**SlideTemplate-Detection-Condition für no-grid-cover:** `slide.kind === "text" && slide.isFirst && slide.leadOnSlide === true`. Nach A2 ist `leadOnSlide: true` NUR auf no-grid-Slide-1 (grid-path-text-slides haben alle `false`). Eindeutige Detection.

**A3c. Hashtags-Fate auf no-grid-Slide-1 (Sonnet R2 #4):**
Decision: **Hashtags bleiben an current position (BEFORE Title) und unzentriert** (default `<HashtagsRow hashtags={meta.hashtags} />` ohne `centered`/`marginTop` props). Begründung:
- M4a-Scope ist Slide-1 grid-cover Layout-Fix; no-grid-cover bekommt nur Title+Lead-Centering als visuelle Konsistenz
- Hashtag-Suppression oder Hashtag-Move auf no-grid-Slide-1 wäre eine zusätzliche Behavior-Änderung außerhalb des Sprint-Scopes
- Visual-Konsistenz zwischen no-grid und grid-cover ist NICHT Must-Have (no-grid hat kein Grid → asymmetrisches Layout ist sowieso erwartet)

E5 Visual-Smoke MUSS explizit assert: "no-grid Slide 1 Hashtags rendern wie vor M4a (vor Title, links-bündig); nur Title+Lead sind zentriert".

**A3d. TitleBlock/LeadBlock zentrieren via `centered`-Prop (Sonnet R2 #3):**
Satori CSS-Subset (siehe `nextjs-og.md`): `textAlign: "center"` muss DIRECT auf dem text-bearing `<div>` gesetzt sein, NICHT auf parent-wrapper. Daher brauchen TitleBlock und LeadBlock einen `centered?: boolean` prop:

```ts
// TitleBlock + LeadBlock Props erweitern:
type TitleBlockProps = { title: string; marginTop?: number; centered?: boolean };
type LeadBlockProps = { lead: string; marginTop?: number; centered?: boolean };

// Inline-style auf text-div:
const textAlign = props.centered ? "center" : "left";
return <div style={{ marginTop: ..., textAlign, ... }}>{title}</div>;
```

**JSX-Call-Sites:**
- `kind === "grid"` branch (grid-cover): `<TitleBlock title={...} marginTop={HEADER_TO_TITLE_GAP_GRID_COVER} centered />` und `<LeadBlock lead={...} marginTop={TITLE_TO_LEAD_GAP_GRID_COVER} centered />`
- `kind === "text" && slide.isFirst && slide.leadOnSlide === true` branch (no-grid-cover): `<TitleBlock title={...} marginTop={...} centered />` und `<LeadBlock lead={...} marginTop={TITLE_TO_LEAD_GAP} centered />` (existing TITLE_TO_LEAD_GAP=18 weiterverwenden — A1b-Disambiguation)
- ALLE anderen Branches (non-first text-slides etc.): unchanged ohne `centered` prop (default false → left-aligned).

**A3b. Beide Renderer MÜSSEN `leadOnSlide: true` explizit setzen für no-grid-Slide-1** (Sonnet R1 #2):

Aktuell setzt weder `splitAgendaIntoSlides` (line ~487: `rawSlides.push({ kind: "text", blocks: slidesWithChunks[0] ?? [] })`) noch `buildManualSlides` einen `leadOnSlide`-Wert auf no-grid-Slide-1 → das Feld ist `undefined`. Ohne expliziten Set würde die A3-Detection-Condition (`slide.leadOnSlide === true`) auf undefined fallen → entire Title+Lead-Block disappears.

```ts
// splitAgendaIntoSlides (instagram-post.ts) — no-grid-path Slide-0 push:
// VORHER: rawSlides.push({ kind: "text", blocks: slidesWithChunks[0] ?? [] });
// NACHHER:
rawSlides.push({
  kind: "text",
  blocks: slidesWithChunks[0] ?? [],
  isFirst: true,
  leadOnSlide: !hasGrid,  // true wenn no-grid (A3-Cover-Layout), false wenn hasGrid
});
```

```ts
// buildManualSlides (instagram-overrides.ts) — no-grid-Slide-0:
// VORHER: setzte `leadOnSlide` aus stored-row OR ließ undefined
// NACHHER (für idx === 0):
leadOnSlide: !hasGrid,  // hardcode REGARDLESS of stored value (override-safety A2)
isFirst: idx === 0,
```

Damit ist nach M4a `leadOnSlide === true` GENAU für no-grid-Slide-1, `false` für ALL grid-path text-slides UND für non-first text-slides → A3-Detection-Condition korrekt.

#### A4. Image-Grid-Layout-Rules
Pure helper `computeSlide1GridSpec(images: GridImage[], imageCount: number): Slide1GridSpec` in neuer Datei `src/lib/instagram-cover-layout.ts`:
```ts
export type Slide1GridSpec = {
  columns: number;
  rows: number;
  cells: GridImage[];
};
```
Layout-Mapping:
- `imageCount === 0`: returned defensively `{columns: 0, rows: 0, cells: []}` (Sonnet R1 #6 — Contract eindeutig, E1 0-case implementable; Caller im SlideTemplate guarded via `kind === "grid"` check, so this defensive return wird in Practice nie an `<ImageGrid>` weitergereicht)
- `imageCount === 1`: `{columns: 1, rows: 1, cells: [img0]}`
- `imageCount === 2`: `{columns: 2, rows: 1, cells: [img0, img1]}`
- `imageCount === 3`: `{columns: 3, rows: 1, cells: [img0, img1, img2]}`
- `imageCount === 4`: `{columns: 2, rows: 2, cells: [img0, img1, img2, img3]}`
- `imageCount > 4`: clamped intern auf 4 → `{columns: 2, rows: 2, cells: images.slice(0, 4)}`

**Contract bei `images.length < imageCount` (Sonnet R2 #7):**
`imageCount` ist authoritativ für das Layout (columns/rows). `cells = images.slice(0, imageCount)`. Wenn `images.length < imageCount`, sind `cells.length < imageCount` und der `<ImageGrid>` rendert empty-div placeholders für trailing cells (existing behavior). In der normalen Pipeline (`resolveImages(item, imageCount)` pre-resolved) tritt das nie auf — Helper-Contract muss aber für unit-testability explizit sein. E1 muss edge-case `computeSlide1GridSpec([img0], 3) → {columns: 3, rows: 1, cells: [img0]}` testen.

Aspect-Ratio-Handling pro Cell im SlideTemplate (consumer): existing `fitImage` helper, square-cells via CSS grid.

#### A4b. `computeSlide1GridSpec` MUSS in `slide-template.tsx` consumer-side gewired werden (Sonnet R1 #3)
Aktuell verwendet `SlideTemplate` für grid-Slides `slide.gridColumns` (DB-Feld `images_grid_columns`) als column-count. Nach A4 muss das für Slide-1 (kind="grid", isFirst) durch `computeSlide1GridSpec(slide.gridImages, slide.gridImages.length).columns` ersetzt werden — sonst ist der Helper dead-code und legacy DB-rows mit `images_grid_columns: 3` würden bei `imageCount=4` fälschlich 3+1 statt 2×2 rendern.

```ts
// slide-template.tsx im grid-kind branch — MUSS sowohl cols ALS AUCH images replacen:
// VORHER:
//   const cols = slide.gridColumns ?? 1;
//   <ImageGrid cols={cols} images={slide.gridImages} dataUrls={...} maxHeight={GRID_MAX_HEIGHT} />
// NACHHER:
const gridSpec = computeSlide1GridSpec(slide.gridImages ?? [], (slide.gridImages ?? []).length);
<ImageGrid
  cols={gridSpec.columns}
  images={gridSpec.cells}                // ← MUSS gridSpec.cells statt slide.gridImages
  dataUrls={...}
  maxHeight={GRID_MAX_HEIGHT_COVER}      // ← cover-spezifische Konstante (A1c), NICHT GRID_MAX_HEIGHT
/>
```

**Wichtig (Sonnet R2 #2):** Die Replacement umfasst BEIDE Props (`cols` UND `images`), NICHT nur `cols`. `gridSpec.cells === images.slice(0, imageCount)` ist defense-in-depth gegen edge-cases wo `slide.gridImages.length > imageCount` reinkäme; ohne `images={gridSpec.cells}` wäre `cells` dead-code und Codex würde das als P1-Finding flaggen.

`slide.gridColumns` (DB-Feld) bleibt unmodifiziert für Backward-Compat, wird aber für die Cover-Slide ignoriert. (Future-Cleanup wenn das Feld nirgendwo mehr genutzt wird.)

**A4c. TitleBlock.marginTop in grid-cover-Branch (Sonnet R2 #5):**
Existing TitleBlock erhält `marginTop={meta.hashtags.length > 0 ? HASHTAGS_TO_TITLE_GAP : HEADER_TO_BODY_GAP}` — diese hashtag-conditional-Logic ist im grid-cover-Branch logisch stale (Hashtags sind nicht mehr adjacent zu Title). Im grid-cover-Branch MUSS unconditional `marginTop = HEADER_TO_TITLE_GAP_GRID_COVER` gesetzt werden:

```ts
// kind === "grid" branch:
<TitleBlock title={meta.title} marginTop={HEADER_TO_TITLE_GAP_GRID_COVER} centered />
// (NICHT die hashtag-conditional aus den anderen Branches — die ist stale weil Hashtags below grid)
```

#### A5. Default `imageCount` im Modal
`InstagramExportModal`-Selector Default = `Math.min(MAX_GRID_IMAGES, availableImages)`. Slider-Range: `0..min(MAX_GRID_IMAGES, availableImages)`. Modal-Open zeigt sofort den Cover-Grid mit allen verfügbaren Bildern (bis 4).

#### A5b. Neue Konstante `MAX_GRID_IMAGES = 4` in `src/lib/instagram-post.ts`
**NICHT** existing `MAX_BODY_IMAGE_COUNT` modifizieren — beide unabhängig:
- `MAX_BODY_IMAGE_COUNT` (existing): cap für `agenda_items.images` array-length und PUT-Validator-Schema-max (kann z.B. 12 oder 20 sein)
- `MAX_GRID_IMAGES = 4` (NEU): cap für die display-Anzahl im Cover-Grid (Layout-Constraint A4)

#### A6. GET-Handler Image-Count Clamp + Pre-DB-Check entfernen
Existing `instagram-layout/route.ts` GET-handler hat bei lines ~89-98 einen pre-DB-Check `imageCount > MAX_BODY_IMAGE_COUNT → 400 image_count_too_large`. **Dieser Check MUSS entfernt werden** — er kollidiert mit dem post-DB silent-clamp.

Replace-Pattern:
```ts
// ENTFERNEN (lines ~89-98):
// if (imageCount > MAX_BODY_IMAGE_COUNT) return 400 image_count_too_large

// NEUE Logik nach DB-Item-Load:
const rawN = Number(searchParams.get("images") ?? 0);
const requestedImageCount = Number.isFinite(rawN) ? rawN : 0;
const imageCount = Math.min(
  MAX_GRID_IMAGES,
  Math.max(0, requestedImageCount),
  countAvailableImages(item)
);
```

**`countAvailableImages` SELBST NICHT modifizieren** — die Funktion wird vom PUT-Validator (`if (validated.imageCount > countAvailableImages(item))`) genutzt für DB-Validation; Cap auf 4 würde existing PUTs mit imageCount > 4 silent-rejecten. PUT-Validator und DELETE-Path bleiben unangetastet.

**Existing GET-Tests die `400 image_count_too_large` asserten MÜSSEN entfernt/umgeschrieben werden** (`?images=999` returnt jetzt 200 mit gecapptem `imageCount=4` statt 400).

**A6b. Missing-`?images=`-Parameter Decision (Sonnet R1 #7):**
Aktuell: `searchParams.get("images")` returnt `null` bei missing param → `parseImageCount(null) === null` → `400 "Invalid images"`. Nach A6 verwendet der neue Code `searchParams.get("images") ?? 0` → missing param wird zu `imageCount = 0` (200 OK).

**Decision: behalte das neue Verhalten (200 mit imageCount=0) für missing param.** Konsistent mit silent-clamp-Philosophie für out-of-range/NaN-Cases. Missing param ist semantisch "kein Cover-Grid gewünscht" → kind="text" Slide-1.

**E4 muss expliziten Test für missing-param-Case enthalten:** `GET /…/instagram-layout (kein ?images=) → 200 OK mit imageCount=0`.

**A6c. `instagram/route.ts` Pre-DB-Check Klarstellung (Sonnet R1 #8):**
Existing `instagram/route.ts` hat NICHT den `image_count_too_large` Pre-DB-Check (im Gegensatz zu `instagram-layout/route.ts`). Nur `instagram-layout/route.ts` braucht den `entfernen`-Schritt. Für `instagram/route.ts` reicht: `MAX_GRID_IMAGES` zum existing post-DB `Math.min(requestedImages, availableImages)` hinzufügen. Files-to-Change-Tabelle entsprechend präzisieren.

**A6d. `isOrphan` dead-code-Branch entfernen (Sonnet R2 #8):**
Existing `instagram-layout/route.ts` line ~124 hat `const isOrphan = imageCount > availableImages` und einen `stale/orphan_image_count`-Response-Branch (lines ~129–140). Nach A6 garantiert der neue clamp `imageCount = Math.min(MAX_GRID_IMAGES, ..., countAvailableImages(item))`, dass `imageCount <= availableImages` IMMER. → `isOrphan === false` immer → der branch ist unreachable dead-code.

**Implementation:**
- `isOrphan`-Variable entfernen
- Den `stale/orphan_image_count`-Response-Branch entfernen
- Existing Tests die diese Response asserten entfernen/rewriten (E4 explicit list)

E4 muss expliziten Test enthalten: "Vor M4a: GET `?images=99` mit availableImages=2 returnte `{stale, orphan_image_count}`. Nach M4a: returnt 200 mit `imageCount=2` (clamp via A6)."

#### A7. Legacy-Override-Keys mit imageCount > 4 — Read-Tolerance
**Codex-Finding #2 Adressierung:** Existing DB-Rows können `instagram_layout_i18n[locale][imageCount]`-Keys mit imageCount > 4 enthalten (z.B. "5", "10", "20"). Nach M4a:
- **Modal-Slider** kann nicht imageCount > 4 anfordern → Layout für solche Keys wird nie via Slider geladen
- **PUT-Validator**: explicit cap `validated.imageCount <= MAX_GRID_IMAGES` (4) — ablehnt PUTs mit imageCount > 4 (422 `image_count_exceeds_grid_cap`)
- **GET-Handler**: silent-clamp im URL-Parser (A6) bedeutet `?images=10` wird zu `imageCount=4` → falls layout-key "10" existiert wird er nicht angefragt; falls layout-key "4" existiert wird er angefragt
- **Legacy-Orphan-Keys** bleiben in DB unberührt (keine proactive Migration). Sind harmlose JSONB-Bytes, kein Read/Write-Pfad mehr. Optional Future-Cleanup-Migration falls JSONB-Größe zum Problem wird.

**A7b. PUT-Validator Implementation: Zod-schema-change UND post-Zod check (Sonnet R2 #6):**
Existing Zod schema: `imageCount: z.number().int().min(0).max(MAX_BODY_IMAGE_COUNT)`. Wenn nur Zod `.max()` zu `MAX_GRID_IMAGES` geändert wird, ist der returned error generic Zod-validation (`{error: "invalid_type", ...}`) statt spec-gefordertes `{error: "image_count_exceeds_grid_cap"}`. Wenn nur post-Zod check ohne Zod-change: `imageCount: 21` würde Zod `.max(MAX_BODY_IMAGE_COUNT=20)` failen (400 generic) statt 422 erreichen.

**Implementation MUSS BEIDES:**
```ts
// (a) Zod schema change:
const PutBodySchema = z.object({
  imageCount: z.number().int().min(0).max(MAX_GRID_IMAGES),  // 4 statt MAX_BODY_IMAGE_COUNT
  // ... rest
});

// (b) Post-Zod explicit check (belt-and-suspenders, defense-in-depth):
const validated = PutBodySchema.safeParse(body);
if (!validated.success) return 400 with Zod issue details;
if (validated.data.imageCount > MAX_GRID_IMAGES) {
  return 422 { error: "image_count_exceeds_grid_cap" };
}
```

**Test-Implications:**
- Existing `400 bei imageCount > MAX_BODY_IMAGE_COUNT (Zod)` PUT-Test MUSS entfernt werden (kein Pfad mehr für imageCount=21 → 400 erreichbar; jetzt 400 für imageCount > 4 via Zod)
- Existing `400 bei imageCount > MAX_BODY_IMAGE_COUNT (GET)` Test MUSS entfernt werden (GET ist silent-clamp, A6)
- NEUE E4 Tests: `PUT imageCount: 5 → 400 mit Zod-issue` UND `PUT imageCount: 4.5 → 400 mit Zod-issue` (.int() check) UND `PUT imageCount: -1 → 400 mit Zod-issue` (.min(0) check). 422 `image_count_exceeds_grid_cap` ist nur für edge-case wo Zod passieren würde — defense-in-depth, aber realistisch nie reached durch Zod's eigene `.max(4)`. Test asseriert es trotzdem via direkt PUT-route-call mit Zod-bypass-fixture (z.B. mock `PutBodySchema.safeParse` returnt success für imageCount=5).

#### A8. NaN-Guard im URL-Parameter
`?images=abc` (oder andere non-numeric Werte) → `Number(...)` returnt NaN. Defense-in-Depth via `Number.isFinite`-Check vor dem Clamp (siehe A6 code-snippet). Result: `imageCount = 0` (silent fallback statt NaN-Propagation in `resolveImages`).

### Tests

**E1.** Unit-Tests in `src/lib/instagram-cover-layout.test.ts` (NEU):
- `computeSlide1GridSpec([], 0)` returnt `{columns: 0, rows: 0, cells: []}` (defensive A4 #6)
- `computeSlide1GridSpec(images, 1..4)` returnt korrekte grid-spec (1=1×1, 2=2×1, 3=3×1, 4=2×2)
- `computeSlide1GridSpec(images.length=5, 5)` returnt clamped `{columns: 2, rows: 2, cells: images.slice(0,4)}`

**E2.** Unit-Tests in `src/lib/instagram-post.test.ts` (EXTEND):
- Slide-1 grid-path: Lead-rendering — `slides[0].kind === "grid"` carries Lead-data
- `splitAgendaIntoSlides` (auto-path): `leadOnSlide === false` für ALL text-slides bei `hasGrid === true`
- `splitAgendaIntoSlides` (no-grid-path): Slide-0 hat `leadOnSlide: true`, `isFirst: true`
- **Slide-2-Budget-Test (Sonnet R1 #1):** Mit `hasGrid: true` UND langem Body, Slide 2 nutzt `SLIDE_BUDGET` statt reduzierten — verify dass content nicht unnötig auf Slide 3 spillt (z.B. via blocks-count assertion)

**E2b.** Unit-Tests in `src/lib/instagram-overrides.test.ts` (EXTEND):
- Stored-leadOnSlide-Override: `buildManualSlides`-output `slide.leadOnSlide === false` für text-slides bei grid-path REGARDLESS of stored value
- No-grid Slide-0: `leadOnSlide === true`, `isFirst === true`
- **Slide-Budget-Test (Sonnet R2 #10):** Konkretes Fixture — construct `override.slides` mit einer slide die N block-IDs enthält wo:
  - Sum of `blockHeightPx(blocks[0..N-1])` ≈ 0.95 × `SLIDE_BUDGET` (passt in vollen Budget aber NICHT in `SLIDE_BUDGET - leadHeightPx(lead)`)
  - Mit `hasGrid=true` UND non-empty lead: assert `result[0].blocks.length === N` (alle blocks fitten in unreduced budget)
  - Mit `hasGrid=true` aber NICHT-Budget-Fix (sanity-control): assert `result[0].blocks.length < N` würde failen (zeigt dass Budget-Fix den Unterschied macht)

**E3.** Component-Tests in `src/app/dashboard/components/InstagramExportModal.test.tsx` (EXTEND):
- Default `imageCount` bei Modal-Open = `min(MAX_GRID_IMAGES, availableImages)` (verifiziert via initial-state-Read nach erstem Render mit fixture `availableImages=3` → expects `imageCount=3`)
- Slider-Range `max` = `min(MAX_GRID_IMAGES, availableImages)` (verifiziert via DOM `input[type=range]` `max`-Attribut)

**E4.** Integration-Tests in `src/app/api/dashboard/agenda/[id]/instagram-layout/route.test.ts` (EXTEND):
- GET ohne `?images=` (param missing) → 200 OK mit `imageCount: 0` (A6b)
- GET mit `?images=999` → 200 OK mit `imageCount: 4` (silent-clamp, NICHT 400)
- GET mit `?images=abc` → 200 OK mit `imageCount: 0` (NaN-guard)
- GET mit `?images=-5` → 200 OK mit `imageCount: 0` (negative-clamp)
- GET mit `?images=3` und `availableImages=2` → 200 OK mit `imageCount: 2` (clamp auf available)
- GET mit `?images=99` und `availableImages=2` → 200 OK mit `imageCount: 2` (NICHT mehr `{stale, orphan_image_count}` — A6d isOrphan-removal)
- PUT mit `imageCount: 5` (via mocked Zod-bypass) → 422 `image_count_exceeds_grid_cap` (A7b post-Zod check)
- PUT mit `imageCount: 5` (real Zod path) → 400 mit Zod issue (A7b — Zod-max=4)
- PUT mit `imageCount: 4.5` → 400 mit Zod issue (.int() check, weiterhin valid)
- **Tests zu entfernen/rewriten:**
  - existing `400 bei imageCount > MAX_BODY_IMAGE_COUNT` (Zod) PUT-Test → entfernen (A7b — neue Range ist max 4)
  - existing `400 image_count_too_large` GET-Test → ersetzen mit silent-clamp-Test
  - existing `{stale, orphan_image_count}` GET-Test → ersetzen mit silent-clamp-Test (A6d)

**E5.** Visual-Smoke (DK-manual auf Staging):
- **Grid-Path (3 Bilder):** Modal öffnen → Slide 1 zeigt Title + Lead + 1×3 Grid zentriert + Hashtags zentriert
- **Grid-Path (4 Bilder):** Modal öffnen → Slide 1 zeigt 2×2 Grid zentriert
- **Grid-Path (>4 Bilder, e.g. 6):** Modal-Slider geht nur bis 4; bei `imageCount=4` 2×2 Grid; restliche Bilder NICHT im Cover
- **Grid-Path mit langem Body:** Eintrag mit langem Body und `imageCount=2` → Slide 2 sollte mehr Content tragen als vor M4a (DK-A2b — Budget-Fix)
- **Grid-Path Layout-Override:** Eintrag mit `images_grid_columns = 3` und `imageCount: 4` → Slide 1 zeigt 2×2 (NICHT 3+1) — DK-A4b
- **No-Grid-Path:** Eintrag OHNE Bilder öffnen → Slide 1 = Title + Lead zentriert, Body links-bündig
- **Default-imageCount:** Eintrag mit 2 Bildern öffnen → Modal initial bei `imageCount=2` (nicht 0)
- **Lead nicht doppelt:** keine Slide hat Lead-Prefix wenn Slide 1 = grid (vorher: Slide 2 hatte Lead-Prefix)
- **Long-Lead-Overflow-Test:** Eintrag mit 2-zeiligem Lead UND 3 Bildern → Cover-Layout passt vertikal in Frame, Hashtags sichtbar ohne Clipping (DK-A1c — `GRID_MAX_HEIGHT_COVER`)

### Code-Quality Gates
- `pnpm exec tsc --noEmit` clean
- `pnpm test` clean (current 1329 → expected ~1345 mit ~16 neuen Tests)
- `pnpm build` clean
- `pnpm audit --prod` 0 HIGH/CRITICAL
- Sonnet pre-push code-reviewer CLEAN
- Codex PR-Review APPROVED (max 3 Runden)
- Visual-Smoke E5 auf Staging dokumentiert in PR-Description

### Out of Scope (M4b oder später)
- Per-Slide `textOverride`
- `baseBodyHash` Stale-Detection
- Draft-Preview-Route (POST mit unsaved Layout)
- LayoutEditor textarea + Auto-Button + Stale-Banner
- Per-Slide-Direkter-Texteditor
- Word-Level oder Sentence-Level Split
- Pure-text-Slides ohne Block-Anker

## Technical Approach

### Files to Change

| File | Change | Description |
|---|---|---|
| `src/lib/instagram-cover-layout.ts` | Create | Pure helper `computeSlide1GridSpec(images, count)` für A4-Rules. `computeSlide1GridSpec([], 0)` returnt defensively `{columns: 0, rows: 0, cells: []}` (A4 #6) |
| `src/lib/instagram-cover-layout.test.ts` | Create | 6 Unit-Tests (0/1/2/3/4/5 images) |
| `src/lib/instagram-post.ts` | Modify | (a) NEW const `MAX_GRID_IMAGES = 4` (A5b), (b) `splitAgendaIntoSlides` (auto-path): `leadOnSlide: false` für ALL text-slides bei `hasGrid === true` (A2), (c) **Slide-2 budget fix**: `firstSlideBudget = hasGrid ? SLIDE_BUDGET : SLIDE1_BUDGET` (NICHT mehr Lead-Height-Reduktion bei hasGrid) — A2b/Sonnet R1 #1, (d) **No-grid-Slide-0 setzt explizit `leadOnSlide: !hasGrid` und `isFirst: true`** — A3b/Sonnet R1 #2, (e) Slide-1 grid bekommt `lead`-Daten + `gridImages` für SlideTemplate (Lead-rendering on grid-cover) |
| `src/lib/instagram-post.test.ts` | Modify | Tests E2 + Slide-2-Budget-Test (DK-A2b: bei `hasGrid` und großem Body, Slide 2 nutzt vollen `SLIDE_BUDGET` statt reduzierten) |
| `src/lib/instagram-overrides.ts` | Modify | (a) `buildManualSlides` hardcodet `leadOnSlide: false` für text-slides bei grid-path REGARDLESS of stored value (A2), (b) `slideBudget = hasGrid ? SLIDE_BUDGET : SLIDE1_BUDGET` für idx===0 (NICHT mehr `leadHeightPx(lead)` Reduktion bei hasGrid) — A2b/Sonnet R1 #1, (c) idx===0 setzt explizit `leadOnSlide: !hasGrid`, `isFirst: true` — A3b/Sonnet R1 #2 |
| `src/lib/instagram-overrides.test.ts` | Modify | Test für stored-leadOnSlide-override + Test für Slide-2-Budget bei hasGrid |
| `src/app/api/dashboard/agenda/[id]/instagram-slide/[slideIdx]/slide-template.tsx` | Modify | (a) NEUE Konstanten `HEADER_TO_TITLE_GAP_GRID_COVER = 60`, `TITLE_TO_LEAD_GAP_GRID_COVER = 32`, `LEAD_TO_GRID_GAP_GRID_COVER = 48`, `GRID_TO_HASHTAGS_GAP_GRID_COVER = 48`, `GRID_MAX_HEIGHT_COVER = 500` (A1b/A1c/Sonnet R1 #4 + #5), (b) **TitleBlock + LeadBlock Component-Props erweitern** um `centered?: boolean` der `textAlign: "center"` direkt am text-div setzt (A3d/Sonnet R2 #3 — Satori-CSS-Subset requires textAlign on text-div, NICHT parent), (c) **HashtagsRow Component-Props erweitern** um `marginTop?: number` und `centered?: boolean` (A1d/Sonnet R2 #1) — default-Werte preserven existing behavior für nicht-grid-cover Aufrufer, (d) Slide-1 grid (kind="grid"): rendert in dieser vertikalen Reihenfolge `<TitleBlock marginTop={HEADER_TO_TITLE_GAP_GRID_COVER} centered />` (A4c/Sonnet R2 #5) → `<LeadBlock marginTop={TITLE_TO_LEAD_GAP_GRID_COVER} centered />` → `<ImageGrid cols={gridSpec.columns} images={gridSpec.cells} maxHeight={GRID_MAX_HEIGHT_COVER} />` (A4b/Sonnet R2 #2 — `cells` MUSS gewired werden, NICHT nur `cols`) → `<HashtagsRow marginTop={GRID_TO_HASHTAGS_GAP_GRID_COVER} centered />`, (e) text-slide mit `isFirst && leadOnSlide===true` (no-grid-cover): TitleBlock + LeadBlock mit `centered`, HashtagsRow UNCHANGED (default-props, A3c/Sonnet R2 #4 — Hashtags bleiben at current position before Title), Body left-aligned (A3) |
| `src/app/api/dashboard/agenda/[id]/instagram-layout/route.ts` | Modify | (a) PUT-Validator BEIDES: Zod-schema `imageCount: z.number().int().min(0).max(MAX_GRID_IMAGES)` UND post-Zod check `if (validated.data.imageCount > MAX_GRID_IMAGES) return 422 image_count_exceeds_grid_cap` (A7b/Sonnet R2 #6 — defense-in-depth), (b) GET: pre-DB `image_count_too_large`-Check entfernen, post-DB silent-clamp via `Math.min(MAX_GRID_IMAGES, ..., countAvailableImages(item))` (A6), (c) NaN-guard via `Number.isFinite` (A8), (d) Missing-`?images=`-Param → 200 mit imageCount=0 (A6b), (e) **`isOrphan` dead-code-Branch + `stale/orphan_image_count` response entfernen** (A6d/Sonnet R2 #8) |
| `src/app/api/dashboard/agenda/[id]/instagram-layout/route.test.ts` | Modify | Tests E4 inkl. missing-param-Case (A6b) |
| `src/app/api/dashboard/agenda/[id]/instagram/route.ts` | Modify | Add `MAX_GRID_IMAGES` zum existing post-DB `Math.min(requestedImages, availableImages)` Aufruf. **KEIN pre-DB-check entfernen** (gibt's hier nicht — Sonnet R1 #8/A6c) |
| `src/app/api/dashboard/agenda/[id]/instagram/route.test.ts` | Modify | **Sonnet R2 #9** — explizite Test-Szenarien (NICHT vague "neue Clamp-Behavior"): (1) `?images=5` mit `availableImages=6` → slide-assembly nutzt `imageCount=4` (`MAX_GRID_IMAGES`-clamp), (2) `?images=3` mit `availableImages=2` → `imageCount=2` (available-clamp), (3) `?images=4` mit `availableImages=4` → `imageCount=4` (no-op). Keine NaN/missing-param Tests nötig — `parseImageCount` in `instagram/route.ts` wird NICHT geändert und handhabt diese Cases bereits. |
| `src/app/dashboard/components/InstagramExportModal.tsx` | Modify | (a) `imageCount`-Default = `Math.min(MAX_GRID_IMAGES, availableImages)` (A5), (b) Slider-Range `max` = `min(MAX_GRID_IMAGES, availableImages)` |
| `src/app/dashboard/components/InstagramExportModal.test.tsx` | Modify | Tests E3 |

### Architecture Decisions

- **No DB-Migration für legacy imageCount > 4 keys** — accept als harmlose JSONB-orphans. Future-Cleanup falls je relevant.
- **`MAX_GRID_IMAGES = 4` ist Design-Cap, NICHT DB-Cap.** `MAX_BODY_IMAGE_COUNT` bleibt für DB-row-validation untangiert.
- **Lead-Detection im SlideTemplate via existing `slide.isFirst && slide.leadOnSlide`** — keine neuen Slide-Type-Felder nötig. Nach A2/A3b ist die Kombination eindeutig (true NUR auf no-grid-Slide-1).
- **Auto-path AND Manual-path beide gefixt** — sonst doppelter Lead-Render bei legacy-Daten. Das ist die wichtigste M4-original-Lesson die in M4a überlebt.
- **Slide-2-Budget-Fix nicht optional (Sonnet R1 #1)** — sonst spillt Content unnötig auf Slide 3 wegen still-reduced budget für nicht-mehr-existierenden Lead.
- **Neue grid-cover-spezifische Spacing-Konstanten** (`HEADER_TO_TITLE_GAP_GRID_COVER` etc.) statt existing-Konstanten zu modifizieren — saubere Trennung zwischen cover-layout und body-slide-layout.
- **`computeSlide1GridSpec` MUSS consumer-side gewired werden** — sonst dead-code und legacy DB-rows mit `images_grid_columns` ignorieren das neue Mapping.

### Edge Cases

| Case | Expected Behavior |
|---|---|
| `?images=999` (out-of-bounds) | Server silent-clamp auf 4 (A6) |
| `?images=abc` (NaN) | Server silent-fallback auf 0 (A8) |
| `?images=-5` (negative) | Server clamp auf 0 (A6) |
| Legacy DB-row mit `imageCount=10` | PUT mit `imageCount=10` rejected 422 (A7); GET mit silent-clamp findet "10"-Key nicht; Layout dort orphan |
| Eintrag ohne Bilder, Modal öffnet | imageCount-Default = 0, Slide 1 = no-grid (kind="text") |
| Eintrag mit 1 Bild, Modal öffnet | imageCount-Default = 1, Slide 1 = grid 1×1 |
| Eintrag mit 6 Bildern, Modal öffnet | imageCount-Default = 4, Slider-Range 0-4, Slide 1 = grid 2×2 mit images[0..3] |
| User reduziert imageCount von 4 auf 0 | Slide 1 wechselt von kind="grid" zu kind="text" mit Title+Lead zentriert+Body |
| Stored row mit `leadOnSlide: true` und current `hasGrid` | `buildManualSlides` hardcodet `false`, kein doppelter Lead-Render |

### Risks

- **Visual Diff für existing IG-Posts:** post-Sprint Re-Export eines bestehenden Eintrags wird Cover anders aussehen. **Mitigation:** Render-Time-Änderung, kein Datenmigrationen — heruntergeladene PNGs in der Vergangenheit bleiben unverändert. Visual-Smoke E5 dokumentiert das neue Look.
- **Legacy imageCount > 4 Layouts unreachable:** harmlose JSONB-Orphans. Kein Read/Write-Pfad. **Mitigation:** dokumentiert in A7. Future cleanup migration wenn notwendig.

---

**Sprint-Size-Estimate:** Small-Medium — ~7-9 Files (2 new + 5-7 modify), ~18-20 neue Tests (1329 → ~1347). Erwarte 1-2 Spec-Eval-Runden + 1 Codex-PR-Runde. Sonnet R1 (8 findings: 2C/3H/2M/1L) addressed in dieser Spec-Revision.

**Patterns referenziert:**
- `nextjs-og.md` — Satori CSS-Subset (`textAlign: "center"`, `justifyContent: "center"`)
- `api.md` — silent-clamp pattern (kein 400 mehr für out-of-bounds image-count)
- `testing.md` — `@vitest-environment jsdom`, Vitest 4.1 mockReset

**Status:** awaiting user approval. Bei Approval → tasks/todo.md schreibt sich, Implementation startet.
