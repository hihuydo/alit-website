# Spec: Sprint M4a — Instagram Slide-1 Cover-Centering + Image-Grid-Cap

<!-- Created: 2026-05-03 (split from M4 after Codex SPLIT_RECOMMENDED) -->
<!-- Author: Planner (Claude Opus 4.7) -->
<!-- Status: R10 Draft — Sonnet R9 7 findings (0C/3H/2M/2L) addressed; awaiting Sonnet R10 verdict -->
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

**A2c. `projectAutoBlocksToSlides` SAME FIX (Sonnet R9 #1 — DK-6 parity-break-prevention):**
`projectAutoBlocksToSlides` (instagram-post.ts ~lines 682-712) wird vom LayoutEditor aufgerufen für die Auto-Mode-Slide-Boundary-Preview. Hat eigene Budget-Formula die identisch reduziert (lines ~683-686):
```ts
// VORHER (projectAutoBlocksToSlides):
const firstSlideBudget = hasGrid && lead
  ? Math.max(SLIDE_BUDGET - leadHeightPx(lead), 200)
  : (hasGrid ? SLIDE_BUDGET : SLIDE1_BUDGET);

// NACHHER (analog A2b in splitAgendaIntoSlides):
const firstSlideBudget = hasGrid ? SLIDE_BUDGET : SLIDE1_BUDGET;
```

Plus: dieselbe grid-alone-guard-Entfernung (lines ~709-711) wie in `splitAgendaIntoSlides`. **Sonst diverge editor und renderer auf Slide-2-block-count → DK-6 Property-Test breaks (Editor/Renderer-Slide-Block-IDs nicht identisch).**

`leadHeightPx`-Helper kann nach (A2b) + (A2c) komplett entfernt werden — alle 3 Caller (splitAgendaIntoSlides, buildManualSlides, projectAutoBlocksToSlides) sind dann lead-free.

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
Satori CSS-Subset (siehe `nextjs-og.md`): `textAlign: "center"` muss DIRECT auf dem text-bearing `<div>` gesetzt sein, NICHT auf parent-wrapper. Daher brauchen TitleBlock und LeadBlock einen `centered?: boolean` prop. **WICHTIG (Sonnet R3 C2):** Existing required props (TitleBlock hat `marginTop`, LeadBlock hat `marginBottom`) werden BEIBEHALTEN als optional-mit-default — sonst TypeScript compile errors auf allen unchanged callers.

```ts
// TitleBlock Props (Sonnet R6 #2 — marginBottom existiert bereits als REQUIRED, MUSS zu optional geändert werden):
type TitleBlockProps = {
  title: string;
  marginTop: number;            // existing required (KEEP)
  marginBottom?: number;        // existing required → CHANGED to optional with default 0 (Sonnet R4 #2 + R6 #2 — preserves no-lead no-grid case wo TITLE_TO_BODY_GAP=64 nötig ist; KEINE neue Property — bestehende Property ändern)
  centered?: boolean;           // NEU
};

// LeadBlock Props (existing marginBottom bleibt OPTIONAL mit default 0, neu: marginTop + centered):
type LeadBlockProps = {
  lead: string;
  marginBottom?: number;        // existing — wird zu OPTIONAL mit default 0 (Sonnet R3 C2 — backward-compat für unchanged callers, NEU für grid-cover via LEAD_TO_GRID_GAP_GRID_COVER)
  marginTop?: number;           // NEU (default 0) — fuer grid-cover via TITLE_TO_LEAD_GAP_GRID_COVER
  centered?: boolean;           // NEU
};

// Inline-style auf text-div (TitleBlock + LeadBlock):
const textAlign = props.centered ? "center" : "left";
return <div style={{
  marginTop: props.marginTop ?? 0,
  marginBottom: props.marginBottom ?? 0,
  textAlign,
  ...
}}>{lead}</div>;
```

**Migration für unchanged callers:** `marginBottom` wird required→optional. Alle existing `<LeadBlock lead={...} marginBottom={N}/>` Aufrufer bleiben funktional unverändert (ihre `marginBottom={N}`-Werte bleiben durchgereicht).

**JSX-Call-Sites:**
- `kind === "grid"` branch (grid-cover): `<TitleBlock title={...} marginTop={HEADER_TO_TITLE_GAP_GRID_COVER} centered />` und `<LeadBlock lead={...} marginTop={TITLE_TO_LEAD_GAP_GRID_COVER} marginBottom={LEAD_TO_GRID_GAP_GRID_COVER} centered />` (Sonnet R3 C1 — `LEAD_TO_GRID_GAP_GRID_COVER` wird via marginBottom auf LeadBlock applied; löst auch C2)
- `kind === "text" && slide.isFirst && slide.leadOnSlide === true` branch (no-grid-cover):
  ```tsx
  <TitleBlock
    title={meta.title}
    marginTop={meta.hashtags.length > 0 ? HASHTAGS_TO_TITLE_GAP : HEADER_TO_BODY_GAP}
    marginBottom={meta.lead ? 0 : TITLE_TO_BODY_GAP}    // (Sonnet R5 #4 — single source-of-truth)
    centered
  />
  {meta.lead && (
    <LeadBlock
      lead={meta.lead}
      marginTop={TITLE_TO_LEAD_GAP}                     // 18px Title→Lead (single spacer)
      marginBottom={LEAD_TO_BODY_GAP}                   // 100px Lead→Body (Sonnet R5 #3 — pre-M4a unchanged)
      centered
    />
  )}
  ```

  **Spacing-Begründung (Sonnet R5 #3 + #4):**
  - **Title→Lead Gap = 18px** (TITLE_TO_LEAD_GAP single source). NICHT 36px doubled. Erreicht via TitleBlock.marginBottom=0 (wenn lead present) + LeadBlock.marginTop=TITLE_TO_LEAD_GAP=18.
  - **Lead→Body Gap = 100px** (LEAD_TO_BODY_GAP) — preserves pre-M4a behavior. Ohne marginBottom auf LeadBlock wäre der Gap 0px (body-region marginTop=0 für isFirst).
  - **No-Lead-Case:** TitleBlock.marginBottom=TITLE_TO_BODY_GAP=64 (existing pre-M4a behavior, no-lead-no-grid Visual-Regression vermieden, Sonnet R4 #2)

**Wichtig (Sonnet R4 #2):** TitleBlock behält `marginBottom`-Prop als optional (default 0) — analog LeadBlock-marginBottom-Behandlung. Damit ist die existing no-grid `kind === "text"` `isFirst`-JSX-Aufrufweise mit conditional `marginBottom` weiterhin funktional. Dropping marginBottom würde no-lead-no-grid-cover-Items mit Title direkt-an-Body rendern (Visual-Regression).

```ts
// TitleBlock-Props erweitert (Sonnet R4 #2):
type TitleBlockProps = {
  title: string;
  marginTop: number;            // existing required
  marginBottom?: number;        // NEU: optional default 0 (preserves existing no-grid no-lead case)
  centered?: boolean;           // NEU
};
```
- ALLE anderen Branches (non-first text-slides etc.): unchanged JSX ohne `centered` prop (default false → left-aligned), existing `marginBottom={...}` bleibt.

**A3f. Existing body-region `leadOnSlide`-Check MUSS entfernt werden (Sonnet R5 #1 — CRITICAL):**

Aktueller `SlideTemplate` Body-Region (slide-template.tsx text-kind branch) hat:
```tsx
{slide.leadOnSlide && meta.lead ? (
  <LeadBlock lead={meta.lead} marginBottom={LEAD_TO_BODY_GAP} />
) : null}
```

Vor M4a feuerte das auf grid-path-Slide-2 (`leadOnSlide: i === 0 && Boolean(lead)`). Nach M4a:
- A3b (grid-path forEach): `leadOnSlide: false` für ALL grid-path text-slides → Check feuert dort nie mehr
- A3b (no-grid-push): `leadOnSlide: !hasGrid === true` für no-grid-Slide-0 → Check feuert dort
- A3d rendert Lead in isFirst-Block für no-grid-Slide-0 (centered)
- → DOPPELTE Lead-Render auf no-grid-Slide-0 (einmal centered im isFirst-block, einmal left-aligned in body-region)

**Implementation MUSS den Body-Region-Check entfernen:**
```tsx
// VORHER (slide-template.tsx text-kind body-region):
// {slide.leadOnSlide && meta.lead ? (
//   <LeadBlock lead={meta.lead} marginBottom={LEAD_TO_BODY_GAP} />
// ) : null}

// NACHHER: ENTFERNEN (kein replacement)
// Alle Lead-Rendering passiert ausschliesslich im isFirst-Block bzw. grid-cover-Branch.
```

Nach Entfernung wird Lead nur noch:
- Im `kind === "grid"` Branch (grid-cover via A3d)
- Im `kind === "text" && slide.isFirst && slide.leadOnSlide === true` Branch (no-grid-cover via A3d)
- NIE mehr in der Body-Region.

**A3e. LeadBlock Conditional-Render bei empty lead (Sonnet R3 M2):**
JSX im grid-cover-Branch MUSS conditional sein:
```tsx
{slide.meta.lead && (
  <LeadBlock
    lead={slide.meta.lead}
    marginTop={TITLE_TO_LEAD_GAP_GRID_COVER}
    marginBottom={LEAD_TO_GRID_GAP_GRID_COVER}
    centered
  />
)}
```
Wenn `meta.lead` empty: kein LeadBlock → Grid sitzt direkt unter Title mit nur dem Title's nachfolgendem space. Das ist akzeptabel — Spacing-Cleanup wenn Lead absent ist nicht kritisch (E5 Visual-Smoke verifies).

**Wichtig (Sonnet R8 #7 correction):** A3b setzt `leadOnSlide: !hasGrid` UNCONDITIONALLY (NICHT `&& Boolean(meta.lead)`). Damit ist `leadOnSlide:true` der Detection-Anker für "no-grid-Slide-1" REGARDLESS of lead-emptiness — auch no-lead-no-grid-Items kriegen `leadOnSlide:true` → Title centered (siehe E5 "No-Grid + No-Lead-Path"). Empty-lead handling im Template via `{meta.lead && <LeadBlock>}`-Conditional (A3e). **NICHT** `&& Boolean(lead)` zur A3b-Bedingung hinzufügen — sonst bricht Detection für no-lead-Items.

**A3b. Beide Renderer MÜSSEN `leadOnSlide: true` explizit setzen für no-grid-Slide-1** (Sonnet R1 #2):

Aktuell setzt weder `splitAgendaIntoSlides` (line ~487: `rawSlides.push({ kind: "text", blocks: slidesWithChunks[0] ?? [] })`) noch `buildManualSlides` einen `leadOnSlide`-Wert auf no-grid-Slide-1 → das Feld ist `undefined`. Ohne expliziten Set würde die A3-Detection-Condition (`slide.leadOnSlide === true`) auf undefined fallen → entire Title+Lead-Block disappears.

```ts
// splitAgendaIntoSlides (instagram-post.ts) — no-grid-path Slide-0 push:
// VORHER: rawSlides.push({ kind: "text", blocks: slidesWithChunks[0] ?? [] });
// NACHHER:
rawSlides.push({
  kind: "text",
  blocks: slidesWithChunks[0] ?? [],
  leadOnSlide: !hasGrid,  // true wenn no-grid (A3-Cover-Layout), false wenn hasGrid
});
```

**Wichtig (Sonnet R3 L1):** `isFirst` wird vom finalen `clamped.map((s, i) => ({..., isFirst: i === 0, ...}))` gesetzt — KEIN `isFirst: true` auf rawSlides-Push (würde sonst dead-code).

```ts
// buildManualSlides (instagram-overrides.ts) — combined NACHHER-Expression (Sonnet R6 #6):
// Single source-of-truth fuer leadOnSlide ueber alle text-slides; vereint A2 (false bei hasGrid) und A3b (true bei no-grid Slide-0):
override.slides.forEach((overrideSlide, idx) => {
  // ... blocks-resolution etc. ...
  rawSlides.push({
    kind: "text",
    blocks: slideBlocks,
    leadOnSlide: !hasGrid && idx === 0,  // TRUE NUR fuer no-grid-Slide-0; FALSE everywhere else
  });
});
// (KEIN isFirst — wird vom finalen clamped.map() gesetzt, A3b-Sonnet R3 L1)
```

**Truth-Table (`leadOnSlide` post-M4a in `buildManualSlides`):**
| `hasGrid` | `idx === 0` | Resulting `leadOnSlide` |
|---|---|---|
| true  | true  | false (Lead lebt auf grid-cover, NICHT auf text-Slide-2) |
| true  | false | false (non-first text-slide) |
| false | true  | **true** (no-grid-cover, A3-Detection-Anker) |
| false | false | false (continuation text-slide) |

**A3b-Auto-Path Grid-forEach (Sonnet R3 M3):** Im grid-path setzt `splitAgendaIntoSlides` aktuell die `leadOnSlide` per text-slide-index:
```ts
// VORHER (instagram-post.ts ~line 477-483):
slidesWithChunks.forEach((blocks, i) => {
  rawSlides.push({
    kind: "text",
    blocks,
    leadOnSlide: i === 0 && Boolean(lead),  // ← Lead war auf erster text-slide nach grid
  });
});

// NACHHER (A2 — Lead wandert zur grid-slide, NIE auf text-slide bei hasGrid):
slidesWithChunks.forEach((blocks) => {
  rawSlides.push({
    kind: "text",
    blocks,
    leadOnSlide: false,  // ← ALL text-slides bei hasGrid haben leadOnSlide:false
  });
});
```

Damit ist nach M4a `leadOnSlide === true` GENAU für no-grid-Slide-1 (via A3b-no-grid-push), `false` für ALL grid-path text-slides UND für non-first text-slides → A3-Detection-Condition korrekt.

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
// slide-template.tsx im grid-kind branch — Sub-branch auf isFirst (Sonnet R6 #1):
// VORHER (für ALLE grid-slides, inkl. cover und pure-image):
//   const cols = slide.gridColumns ?? 1;
//   <ImageGrid cols={cols} images={slide.gridImages} dataUrls={...} maxHeight={GRID_MAX_HEIGHT} />

// NACHHER:
if (slide.kind === "grid" && slide.isFirst) {
  // Cover-Slide-1: count-based layout via computeSlide1GridSpec, cover-spezifische maxHeight
  const safeGridImages = slide.gridImages ?? [];     // (Sonnet R9 #2 — null-guard one-shot, prevents tsc 2532)
  const gridSpec = computeSlide1GridSpec(safeGridImages, safeGridImages.length);
  return (
    // ... TitleBlock, LeadBlock (siehe A3d), ...
    <ImageGrid
      cols={gridSpec.columns}
      images={gridSpec.cells}              // ← MUSS gridSpec.cells statt slide.gridImages
      dataUrls={gridImageDataUrls ?? safeGridImages.map(() => null)}  // (Sonnet R7 #5 + R9 #2) — safeGridImages ist non-undefined; gridSpec.cells ist Prefix von safeGridImages, Index-Alignment preserved
      maxHeight={GRID_MAX_HEIGHT_COVER}    // ← cover-spezifische Konstante (A1c), NICHT GRID_MAX_HEIGHT
    />
    // ... HashtagsRow ...
  );
} else if (slide.kind === "grid") {
  // Pure-image-Slides 2..N: UNCHANGED — original DB-driven cols + GRID_MAX_HEIGHT
  // (Sonnet R8 #6) Defensive `gridImages`-throw bleibt HIER (pure-image-branch);
  // Cover-Branch (oben) ist tolerant via `slide.gridImages ?? []`.
  if (!slide.gridImages || slide.gridImages.length === 0) {
    throw new Error(`[ig-export] kind="grid" slide ${slide.index} has empty gridImages`);
  }
  return <ImageGrid cols={slide.gridColumns ?? 1} images={slide.gridImages} dataUrls={...} maxHeight={GRID_MAX_HEIGHT} />;
}
```

**Wichtig (Sonnet R6 #1):** Pure-image-Slides (Slides 2..N im image-mode, kind="grid" aber NICHT isFirst) bleiben UNCHANGED — `GRID_MAX_HEIGHT_COVER=500` würde sie unnötig 28% kürzer rendern. Conditional-branching auf `isFirst` ist verbindlich.

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
`InstagramExportModal`-Number-Input Default = `Math.min(MAX_GRID_IMAGES, availableImages)`. Range: `0..min(MAX_GRID_IMAGES, availableImages)` über `min`/`max`-Attribute des `input[type=number]`. Modal-Open zeigt sofort den Cover-Grid mit allen verfügbaren Bildern (bis 4).

**A5d. State-Initialization-Timing (Sonnet R5 #6):**
`availableImages` ist erst nach `fetchMetadata`-Callback bekannt (Modal opent mit `availableImages: 0`-default). State-Init kann NICHT in initial `useState(...)` happen weil dort `availableImages` noch nicht definiert ist.

**Implementation-Pattern (Sonnet R6 #3 — TypeScript-strict guarded):**
`LocaleState` ist Union-Type `{ status: "loaded"; ...; availableImages: number } | { status: "error"; reason: string }` — `result.availableImages` braucht `status === "loaded"` Narrowing. Modal fetcht `deState` + `frState` parallel; beide haben dieselben locale-agnostischen images. Verwende `deState` als primary, fallback auf `frState` falls de in error-state.

```ts
// Im Promise.all-Callback nach beiden parallelen fetches:
.then(([deResult, frResult]) => {
  setDeState(deResult);
  setFrState(frResult);
  // Type-guard: availableImages nur via "loaded"-narrowing zugreifbar
  const loadedResult =
    deResult.status === "loaded" ? deResult :
    frResult.status === "loaded" ? frResult : null;
  if (!loadedResult) return;
  // Functional state-update (Sonnet R8 #5) — concurrent-safe vs closure-capture pattern.
  // Liest current state at dispatch-time (NICHT closure-time) → kein stale-closure risk falls
  // parent re-rendert während fetch in flight ist:
  setImageCount(prev =>
    prev === 0
      ? Math.min(MAX_GRID_IMAGES, loadedResult.availableImages)
      : prev   // user-changed-Wert preserve
  );
})
```

`useState`-Init-Wert bleibt `0` (open-default). Der eigentliche Default (`min(MAX_GRID_IMAGES, availableImages)`) wird im Promise.all-callback gesetzt. E3-Test verifies dass nach dem erstem Render mit fixture `availableImages=3` der state `imageCount === 3` ist.

**A5d-mount-strategy-decision (Sonnet R9 #4):**
`InstagramExportModal` wird im Parent-component conditional-mounted (`{open && <InstagramExportModal ... />}`-Pattern oder analog `key={item.id}` + remount-on-item-change). Damit ist `useState(0)`-init garantiert auf jedem Modal-Open neu, und die `prev === 0`-Bedingung im functional-update-Pattern ist korrekt — keine state-persistence über Modal-Closes. Implementer prüft via grep dass die Mount-Strategy stimmt (parent's `{showInstagramExport && <InstagramExportModal ... />}` oder Modal-internal early-return on `!open`). Falls Modal stays mounted und nur `open`-prop togglet → `useEffect` für reset auf `imageCount=0` bei `open=false → open=true` Transition zusätzlich nötig (dokumentiert hier, NICHT in M4a-implementation falls Mount-Strategy bereits remount-style ist).

(Nomenclature note Sonnet R4 #1: Das Modal hat `<input type="number">`, nicht `<input type="range">`. Spec-Begriff "Slider" wird im weiteren Verlauf vermieden — stattdessen "Number-Input" oder "Range-Cap".)

#### A5b. Neue Konstante `MAX_GRID_IMAGES = 4` in `src/lib/instagram-post.ts`
**NICHT** existing `MAX_BODY_IMAGE_COUNT` modifizieren — beide unabhängig:
- `MAX_BODY_IMAGE_COUNT` (existing): cap für `agenda_items.images` array-length und PUT-Validator-Schema-max (kann z.B. 12 oder 20 sein)
- `MAX_GRID_IMAGES = 4` (NEU): cap für die display-Anzahl im Cover-Grid (Layout-Constraint A4)

**A5c. `MAX_GRID_IMAGES` MUSS als named export aus `instagram-post.ts` exportiert werden (Sonnet R3 H2):**
```ts
// src/lib/instagram-post.ts:
export const MAX_GRID_IMAGES = 4;
```

Die Route-Files importieren via:
```ts
// src/app/api/dashboard/agenda/[id]/instagram-layout/route.ts
import { MAX_GRID_IMAGES } from "@/lib/instagram-post";

// src/app/api/dashboard/agenda/[id]/instagram/route.ts
import { MAX_GRID_IMAGES } from "@/lib/instagram-post";

// src/lib/instagram-cover-layout.ts (für computeSlide1GridSpec internal-clamp):
import { MAX_GRID_IMAGES } from "./instagram-post";

// src/app/dashboard/components/InstagramExportModal.tsx (für Slider-cap):
import { MAX_GRID_IMAGES } from "@/lib/instagram-post";
```

KEINE lokalen Re-Definitionen. Single-source-of-truth in `instagram-post.ts`.

#### A6. GET-Handler Image-Count Clamp + Pre-DB-Check entfernen
Existing `instagram-layout/route.ts` GET-handler hat bei lines ~89-98 einen pre-DB-Check `imageCount > MAX_BODY_IMAGE_COUNT → 400 image_count_too_large`. **Dieser Check MUSS entfernt werden** — er kollidiert mit dem post-DB silent-clamp.

Replace-Pattern:
```ts
// ENTFERNEN (lines ~89-98):
// if (imageCount > MAX_BODY_IMAGE_COUNT) return 400 image_count_too_large

// NEUE Logik **AFTER** der `const item = await getAgendaItem(...)` DB-load-Zeile platziert (Sonnet R9 #5 — countAvailableImages braucht item; Implementation MUSS diesen Block NACH dem item-fetch placen, NICHT bei lines ~89-92 wo der vorherige parseImageCount stand):
// (Sonnet R7 #4 — Math.floor preserves parseInt-truncation behavior für `?images=1.5`):
const rawN = Number(searchParams.get("images") ?? 0);
const requestedImageCount = Number.isFinite(rawN) ? Math.floor(rawN) : 0;
const imageCount = Math.min(
  MAX_GRID_IMAGES,
  Math.max(0, requestedImageCount),
  countAvailableImages(item)
);
```

**Wichtig (Sonnet R7 #4):** `Math.floor` (NICHT nur Number.isFinite) ist nötig damit `?images=1.5` → `imageCount=1` (integer), konsistent mit PUT's Zod `.int()` validator. Ohne floor wäre GET-Response `imageCount: 1.5` und PUT-Validation würde 1.5 ablehnen — API contract violation.

**`countAvailableImages` SELBST NICHT modifizieren** — die Funktion wird vom PUT-Validator (`if (validated.imageCount > countAvailableImages(item))`) genutzt für DB-Validation; Cap auf 4 würde existing PUTs mit imageCount > 4 silent-rejecten. PUT-Validator und DELETE-Path bleiben unangetastet.

**Existing GET-Tests die `400 image_count_too_large` asserten MÜSSEN entfernt/umgeschrieben werden** (`?images=999` returnt jetzt 200 mit gecapptem `imageCount=4` statt 400).

**A6b. Missing-`?images=`-Parameter Decision (Sonnet R1 #7):**
Aktuell: `searchParams.get("images")` returnt `null` bei missing param → `parseImageCount(null) === null` → `400 "Invalid images"`. Nach A6 verwendet der neue Code `searchParams.get("images") ?? 0` → missing param wird zu `imageCount = 0` (200 OK).

**Decision: behalte das neue Verhalten (200 mit imageCount=0) für missing param.** Konsistent mit silent-clamp-Philosophie für out-of-range/NaN-Cases. Missing param ist semantisch "kein Cover-Grid gewünscht" → kind="text" Slide-1.

**E4 muss expliziten Test für missing-param-Case enthalten:** `GET /…/instagram-layout (kein ?images=) → 200 OK mit imageCount=0`.

**A6e. `parseImageCount`-Function-Fate in `instagram-layout/route.ts` (Sonnet R3 M1):**
Aktueller Code:
```ts
// instagram-layout/route.ts lines 39-44:
function parseImageCount(v: string | null): number | null {
  if (v === null) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : null;
}
// lines 89-92:
const imageCount = parseImageCount(url.searchParams.get("images"));
if (imageCount === null) return 400 "Invalid images";
```

**Implementation-Decision (Sonnet R4 #4 + R7 #1 corrected):** Den `parseImageCount`-Aufruf im **GET-Handler** für `?images=` ENTFERNEN und durch inline-Logic A6 ersetzen. **Die Function `parseImageCount` selbst BLEIBT** — der DELETE-Handler (route.ts ~line 441) hat einen zweiten Caller (Spec war initial fälschlich "genau 1 caller"; das DELETE-Path-Verhalten bleibt unangetastet inkl. `parseImageCount`-Aufruf, weil DELETE für orphan-keys >availableImages cap-frei sein muss).

Nach M4a:
- GET-Handler: KEIN `parseImageCount`-Aufruf mehr (replaced by inline A6 logic)
- DELETE-Handler: `parseImageCount`-Aufruf BLEIBT unverändert (orphan-key-DELETE-Path)
- Function-Body BLEIBT (1 caller — DELETE — bleibt)

Damit kein TypeScript `noUnusedLocals` issue, kein dead-code Codex-Finding.

```ts
// VORHER (lines 89-92):
// const imageCount = parseImageCount(url.searchParams.get("images"));
// if (imageCount === null) return 400 "Invalid images";

// NACHHER (A6 + A6b + A8 + Sonnet R7 #4 floor):
const rawN = Number(url.searchParams.get("images") ?? 0);
const requestedImageCount = Number.isFinite(rawN) ? Math.floor(rawN) : 0;
const imageCount = Math.min(
  MAX_GRID_IMAGES,
  Math.max(0, requestedImageCount),
  countAvailableImages(item)  // countAvailableImages NACH item-load aufgerufen
);
```

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
- NEUE E4 Tests (alle Zod-Pfad, kein Mock-bypass nötig):
  - `PUT imageCount: 5 → 400 mit Zod-issue` (.max(4) check)
  - `PUT imageCount: 4.5 → 400 mit Zod-issue` (.int() check)
  - `PUT imageCount: -1 → 400 mit Zod-issue` (.min(0) check)

**Decision (Sonnet R3 L2):** Den 422 `image_count_exceeds_grid_cap` post-Zod-check BLEIBT in der Implementierung als defense-in-depth, aber wird NICHT separat getestet. Begründung: Der Pfad ist via Zod's `.max(4)` realistisch nicht erreichbar; ein Mock-bypass-Test wäre brittle (kuppelt an PutBodySchema-internals) und der zusätzliche Test-Wert ist gering. Der Code-Comment am post-Zod-check dokumentiert: `// Defense-in-depth: Zod .max(MAX_GRID_IMAGES) is the primary gate; this check guards against future schema changes that might widen the Zod range.`

#### A8. NaN-Guard im URL-Parameter
`?images=abc` (oder andere non-numeric Werte) → `Number(...)` returnt NaN. Defense-in-Depth via `Number.isFinite`-Check vor dem Clamp (siehe A6 code-snippet). Result: `imageCount = 0` (silent fallback statt NaN-Propagation in `resolveImages`).

### Tests

**E1.** Unit-Tests in `src/lib/instagram-cover-layout.test.ts` (NEU):
- `computeSlide1GridSpec([], 0)` returnt `{columns: 0, rows: 0, cells: []}` (defensive A4 #6)
- `computeSlide1GridSpec(images, 1..4)` returnt korrekte grid-spec (1=1×1, 2=2×1, 3=3×1, 4=2×2)
- `computeSlide1GridSpec(images.length=5, 5)` returnt clamped `{columns: 2, rows: 2, cells: images.slice(0,4)}`
- **Edge-Case (Sonnet R6 #4):** `computeSlide1GridSpec([img0], 3) → {columns: 3, rows: 1, cells: [img0]}` — `imageCount` ist authoritativ für columns/rows; `cells = images.slice(0, imageCount)` mit truncation (images.length < imageCount produces shorter cells-array)

**E2.** Unit-Tests in `src/lib/instagram-post.test.ts` (EXTEND):
- Slide-1 grid-path: Lead-rendering — `slides[0].kind === "grid"` carries Lead-data
- Slide-1 grid-path with `lead === null/empty`: `slides[0].kind === "grid"`, `meta.lead` falsy → SlideTemplate's conditional `{meta.lead && <LeadBlock>}` rendert keine LeadBlock (A3e/Sonnet R6 #5 — references lead-empty edge case)
- `splitAgendaIntoSlides` (auto-path): `leadOnSlide === false` für ALL text-slides bei `hasGrid === true`
- `splitAgendaIntoSlides` (no-grid-path): Slide-0 hat `leadOnSlide: true`, `isFirst: true`
- **Slide-2-Budget-Test (Sonnet R1 #1):** Mit `hasGrid: true` UND langem Body, Slide 2 nutzt `SLIDE_BUDGET` statt reduzierten — verify dass content nicht unnötig auf Slide 3 spillt (z.B. via blocks-count assertion)
- **Empty-body-with-grid-and-lead (Sonnet R9 #3):** `splitAgendaIntoSlides` mit `hasGrid=true`, non-empty lead, empty body → `slides.length === 1`, `slides[0].kind === "grid"` (verifies grid-alone-guard A2c removal — KEIN blank trailing text-slide)

**E2b.** Unit-Tests in `src/lib/instagram-overrides.test.ts` (EXTEND):
- Stored-leadOnSlide-Override: `buildManualSlides`-output `slide.leadOnSlide === false` für text-slides bei grid-path REGARDLESS of stored value
- No-grid Slide-0: `leadOnSlide === true`, `isFirst === true`
- **Slide-Budget-Test (Sonnet R2 #10):** Konkretes Fixture — construct `override.slides` mit einer slide die N block-IDs enthält wo:
  - Sum of `blockHeightPx(blocks[0..N-1])` ≈ 0.95 × `SLIDE_BUDGET` (passt in vollen Budget aber NICHT in `SLIDE_BUDGET - leadHeightPx(lead)`)
  - Mit `hasGrid=true` UND non-empty lead: assert `result[0].blocks.length === N` (alle blocks fitten in unreduced budget)
  - Mit `hasGrid=true` aber NICHT-Budget-Fix (sanity-control): assert `result[0].blocks.length < N` würde failen (zeigt dass Budget-Fix den Unterschied macht)

**E3.** Component-Tests in `src/app/dashboard/components/InstagramExportModal.test.tsx` (EXTEND):
- Default `imageCount` POST-fetchMetadata = `min(MAX_GRID_IMAGES, availableImages)` — **async-aware Test-Pattern (Sonnet R7 #3):** `useState`-Init ist 0; Default wird im Promise.all-callback gesetzt. Test MUSS auf async-resolution warten BEVOR assertion: `await waitFor(() => expect(screen.getByRole('spinbutton')).toHaveValue(3))` ODER `await act(async () => { await fetchMetadataMock.mockResolvedValueOnce(...) })`. Synchroner Read direkt nach `render()` würde `imageCount === 0` finden (initial useState).
- Number-Input-Range `max`-Attribut = `min(MAX_GRID_IMAGES, availableImages)` — **DOM-Query (Sonnet R4 #1):** Der Input ist `input[type=number]` (spinbutton), NICHT `input[type=range]`. Test verwendet `screen.getByRole('spinbutton')` ODER `document.querySelector('input[type=number]')` für Selection. Auch dieser Test braucht `waitFor` weil `max`-Attribut von `availableImages` abhängt.

**E4.** Integration-Tests in `src/app/api/dashboard/agenda/[id]/instagram-layout/route.test.ts` (EXTEND):
- GET ohne `?images=` (param missing) → 200 OK mit `imageCount: 0` (A6b)
- GET mit `?images=999` → 200 OK mit `imageCount: 4` (silent-clamp, NICHT 400)
- GET mit `?images=abc` → 200 OK mit `imageCount: 0` (NaN-guard)
- GET mit `?images=-5` → 200 OK mit `imageCount: 0` (negative-clamp)
- GET mit `?images=1.5` → 200 OK mit `imageCount: 1` (Math.floor, Sonnet R7 #4)
- GET mit `?images=3` und `availableImages=2` → 200 OK mit `imageCount: 2` (clamp auf available)
- GET mit `?images=99` und `availableImages=2` → 200 OK mit `imageCount: 2` (NICHT mehr `{stale, orphan_image_count}` — A6d isOrphan-removal)
- PUT mit `imageCount: 5` → 400 mit Zod issue (A7b — Zod-max=4)
- PUT mit `imageCount: 4.5` → 400 mit Zod issue (.int() check, weiterhin valid)
- PUT mit `imageCount: -1` → 400 mit Zod issue (.min(0) check)
- (Sonnet R3 L2: 422 post-Zod check NICHT separat getestet — siehe A7b Decision)
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
- **No-Grid + No-Lead-Path (Sonnet R4 #2):** Eintrag OHNE Bilder UND OHNE Lead-Text → Slide 1 = Title zentriert, Body beginnt mit ~64px Abstand (TITLE_TO_BODY_GAP) — KEINE Visual-Regression vs pre-M4a
- **Kind-Switch via imageCount=0 (Sonnet R5 #7):** Eintrag MIT 4 Bildern öffnen → Number-Input von 4 auf 0 setzen → Slide-1 PNG zeigt Title+Lead zentriert, Body links-bündig, KEIN Image-Grid (kind switcht von "grid" auf "text", isFirst+leadOnSlide:true)
- **Empty-Body-Item (Sonnet R9 #7):** Eintrag mit imageCount > 0, non-empty lead, ZERO body-content blocks → carousel = exakt 1 Slide (grid-cover), KEIN blank trailing text-slide (verifies grid-alone-guard removal A2c/instagram-post.ts item (f))
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
- **`useCallback`/`useMemo` dep-list-Audit in `InstagramExportModal.tsx` (Sonnet R6 #7 + R7 #6):** Konkret zu auditierende Hooks: `handleDownload`, `handleGenerate` (falls existing), `handleExport` (falls existing), und jede `useCallback`/`useMemo` die `imageCount` im body referenziert. ALLE diese Hooks MÜSSEN `imageCount` im dep-array haben (PR #110 Codex P2 precedent: `handleDownload` hatte stale-closure auf imageCount). Vor Implementation: grep `imageCount` in InstagramExportModal.tsx → für jede Stelle in einem hook-body verifizieren dass `imageCount` in deps ist. A5d-State-Init hat hier keine direkte Auswirkung, aber das Audit ist Pflicht damit re-introducing der default-init-Logic keine alte stale-closure neu öffnet.

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
| `src/lib/instagram-cover-layout.ts` | Create | Pure helper `computeSlide1GridSpec(images, count)` für A4-Rules. `computeSlide1GridSpec([], 0)` returnt defensively `{columns: 0, rows: 0, cells: []}` (A4 #6). Imports: `import { MAX_GRID_IMAGES } from "./instagram-post";` für internal `Math.min(count, MAX_GRID_IMAGES)`-clamp (A5c) UND `import type { GridImage } from "./instagram-post";` für Parameter-Typ (Sonnet R6 #8 — `GridImage` ist exported in `instagram-post.ts`). |
| `src/lib/instagram-cover-layout.test.ts` | Create | 6 Unit-Tests (0/1/2/3/4/5 images) |
| `src/lib/instagram-post.ts` | Modify | (a) NEW `export const MAX_GRID_IMAGES = 4` (A5b/A5c — exported for routes/modal), (b) `splitAgendaIntoSlides` (auto-path) grid-forEach: `leadOnSlide: false` für ALL text-slides bei `hasGrid === true` (VORHER `i === 0 && Boolean(lead)` — A3b VORHER/NACHHER Sonnet R3 M3), (c) **Slide-2 budget fix in `splitAgendaIntoSlides`**: `firstSlideBudget = hasGrid ? SLIDE_BUDGET : SLIDE1_BUDGET` (NICHT mehr Lead-Height-Reduktion bei hasGrid) — A2b/Sonnet R1 #1, (d) **No-grid-Slide-0 setzt explizit `leadOnSlide: !hasGrid`** (KEIN `isFirst` — wird vom finalen `clamped.map()` gesetzt, A3b L1) — Sonnet R1 #2, (e) Slide-1 grid bekommt `lead`-Daten + `gridImages` für SlideTemplate (Lead-rendering on grid-cover), (f) **Grid-alone-guard ENTFERNEN** (Sonnet R9 #3): `splitAgendaIntoSlides` lines ~453-455 `if (compactedGroups.length === 0 && hasGrid && lead) compactedGroups = [...compactedGroups, [] as ExportBlock[]];` — der Guard war ausschließlich für Lead-Carrying auf einer text-slide; nach M4a lebt Lead auf grid-cover-slide, deswegen kein blank trailing-slide mehr nötig. **Konsequenz:** für Items mit grid+lead+empty-body produziert M4a EXAKT 1 Slide (kind="grid"). E2-Test pflicht (siehe E2-Liste), (g) **`projectAutoBlocksToSlides` SAME FIX** (Sonnet R9 #1 CRITICAL — DK-6 parity-break): same `firstSlideBudget = hasGrid ? SLIDE_BUDGET : SLIDE1_BUDGET` (lines ~683-686 — KEIN `leadHeightPx(lead)` mehr); same grid-alone-guard removal (lines ~709-711) — sonst diverge editor/renderer auf Slide-2-block-count, (h) **`leadHeightPx`-disposition** (Sonnet R8 #4 + R9 #1): nach (c)+(g) sind ALLE 3 Caller von `leadHeightPx` entfernt; Function-Body ENTFERNEN. Implementer verifiziert via grep `leadHeightPx` dass keine weiteren Caller existieren (sollte 0 returnen post-changes). |
| `src/lib/instagram-post.test.ts` | Modify | Tests E2 + Slide-2-Budget-Test (DK-A2b: bei `hasGrid` und großem Body, Slide 2 nutzt vollen `SLIDE_BUDGET` statt reduzierten) |
| `src/lib/instagram-overrides.ts` | Modify | (a) `buildManualSlides` hardcodet `leadOnSlide: false` für text-slides bei grid-path REGARDLESS of stored value (A2), (b) `slideBudget = hasGrid ? SLIDE_BUDGET : SLIDE1_BUDGET` für idx===0 (NICHT mehr `leadHeightPx(lead)` Reduktion bei hasGrid) — A2b/Sonnet R1 #1, (c) Combined-expression `leadOnSlide: !hasGrid && idx === 0` für ALL forEach-slides (Sonnet R6 #6 truth-table; KEIN `isFirst` — wird vom finalen `clamped.map()` gesetzt, A3b L1), (d) **`const lead = meta.lead;` ENTFERNEN** (Sonnet R8 #4 — nach (a)+(b)+(c) hat das Variable keine Referenzen mehr → tsc `noUnusedLocals` fail), (e) **`leadHeightPx`-Import disposition** (Sonnet R8 #4): falls existing `import { leadHeightPx } from "./instagram-post"` und alle Aufrufe entfernt (durch (b)) → Import-Zeile entfernen. |
| `src/lib/instagram-overrides.test.ts` | Modify | Test für stored-leadOnSlide-override + Test für Slide-2-Budget bei hasGrid |
| `src/app/api/dashboard/agenda/[id]/instagram-slide/[slideIdx]/slide-template.tsx` | Modify | (a) NEUE Konstanten `HEADER_TO_TITLE_GAP_GRID_COVER = 60`, `TITLE_TO_LEAD_GAP_GRID_COVER = 32`, `LEAD_TO_GRID_GAP_GRID_COVER = 48`, `GRID_TO_HASHTAGS_GAP_GRID_COVER = 48`, `GRID_MAX_HEIGHT_COVER = 500` (A1b/A1c/Sonnet R1 #4 + #5), (b) **TitleBlock-Props erweitern** um `marginBottom?: number` (default 0, Sonnet R4 #2 — preserves no-lead no-grid case) UND `centered?: boolean` (existing required `marginTop` BLEIBT); **LeadBlock-Props erweitern** um `marginTop?: number` + `centered?: boolean` UND `marginBottom: number` → `marginBottom?: number` mit default 0 (A3d/Sonnet R3 C2 — backward-compat für unchanged callers); inline-styles wenden `textAlign: "center"` direkt aufs text-div an (Satori-CSS), (c) **HashtagsRow Component-Props erweitern** um `marginTop?: number` und `centered?: boolean` (A1d/Sonnet R2 #1) — default-Werte preserven existing behavior für nicht-grid-cover Aufrufer, (d) Slide-1 grid (kind="grid"): rendert in dieser vertikalen Reihenfolge `<TitleBlock marginTop={HEADER_TO_TITLE_GAP_GRID_COVER} centered />` → `{slide.meta.lead && <LeadBlock lead={slide.meta.lead} marginTop={TITLE_TO_LEAD_GAP_GRID_COVER} marginBottom={LEAD_TO_GRID_GAP_GRID_COVER} centered />}` (A3e/Sonnet R3 M2 conditional + C1 marginBottom-as-LEAD_TO_GRID_GAP-applicator) → `<ImageGrid cols={gridSpec.columns} images={gridSpec.cells} maxHeight={GRID_MAX_HEIGHT_COVER} />` (A4b — BEIDE Outputs gewired) → `<HashtagsRow marginTop={GRID_TO_HASHTAGS_GAP_GRID_COVER} centered />`, (e) text-slide mit `isFirst && leadOnSlide===true` (no-grid-cover): `<TitleBlock marginTop={meta.hashtags.length > 0 ? HASHTAGS_TO_TITLE_GAP : HEADER_TO_BODY_GAP} marginBottom={meta.lead ? 0 : TITLE_TO_BODY_GAP} centered />` (Sonnet R3 H1 + Sonnet R4 #2 + Sonnet R8 #2 — marginTop conditional UNCHANGED; marginBottom=0 wenn lead present (LeadBlock.marginTop ist alleinige source); marginBottom=TITLE_TO_BODY_GAP wenn lead empty) + `{meta.lead && <LeadBlock marginTop={TITLE_TO_LEAD_GAP} marginBottom={LEAD_TO_BODY_GAP} centered />}` (Sonnet R8 #3 — marginBottom=LEAD_TO_BODY_GAP=100 preserves pre-M4a Lead→Body spacing; lead-conditional render wenn empty greift TitleBlock.marginBottom=TITLE_TO_BODY_GAP), HashtagsRow UNCHANGED (default-props, A3c/Sonnet R2 #4), Body left-aligned (A3), (f) **REMOVE existing body-region `{slide.leadOnSlide && meta.lead ? <LeadBlock marginBottom={LEAD_TO_BODY_GAP}/>}`-Check aus dem text-kind branch** (A3f/Sonnet R5 #1 + R8 #1 CRITICAL — sonst Double-Lead-Render auf no-grid-Slide-1) |
| `src/app/api/dashboard/agenda/[id]/instagram-layout/route.ts` | Modify | (a) `import { MAX_GRID_IMAGES } from "@/lib/instagram-post"` (A5c/Sonnet R3 H2), (b) PUT-Validator BEIDES: Zod-schema `imageCount: z.number().int().min(0).max(MAX_GRID_IMAGES)` UND post-Zod check `if (validated.data.imageCount > MAX_GRID_IMAGES) return 422 image_count_exceeds_grid_cap` (A7b/Sonnet R2 #6 — defense-in-depth, NICHT separat getestet — A7b L2-Decision), (c) GET-Handler: pre-DB `image_count_too_large`-Check entfernen UND `parseImageCount`-Aufruf NUR im GET-Pfad durch inline A6-logic ersetzen (Sonnet R4 #4 + R7 #1 — `parseImageCount`-Function-Body BLEIBT weil DELETE-Handler ein zweiter Caller ist; DELETE-Pfad unangetastet) UND `MAX_BODY_IMAGE_COUNT` aus dem `@/lib/instagram-post`-Import entfernen (Sonnet R5 #2 — beide Use-Sites werden durch A6+A7b ersetzt → wird unused → tsc `noUnusedLocals` fail), post-DB silent-clamp via `Math.min(MAX_GRID_IMAGES, ..., countAvailableImages(item))` (A6), (d) NaN-guard via `Number.isFinite` (A8), (e) Missing-`?images=`-Param → 200 mit imageCount=0 (A6b), (f) **`isOrphan` dead-code-Branch + `stale/orphan_image_count` response entfernen** (A6d/Sonnet R2 #8) |
| `src/app/api/dashboard/agenda/[id]/instagram-layout/route.test.ts` | Modify | Tests E4 inkl. missing-param-Case (A6b) |
| `src/app/api/dashboard/agenda/[id]/instagram/route.ts` | Modify | (a) `import { MAX_GRID_IMAGES } from "@/lib/instagram-post"` (A5c/Sonnet R3 H2), (b) `MAX_GRID_IMAGES` zum existing post-DB `Math.min(requestedImages, availableImages)` Aufruf hinzufügen. **KEIN pre-DB-check entfernen** (gibt's hier nicht — Sonnet R1 #8/A6c) |
| `src/app/api/dashboard/agenda/[id]/instagram/route.test.ts` | Modify | **Sonnet R2 #9** — explizite Test-Szenarien (NICHT vague "neue Clamp-Behavior"): (1) `?images=5` mit `availableImages=6` → slide-assembly nutzt `imageCount=4` (`MAX_GRID_IMAGES`-clamp), (2) `?images=3` mit `availableImages=2` → `imageCount=2` (available-clamp), (3) `?images=4` mit `availableImages=4` → `imageCount=4` (no-op). Keine NaN/missing-param Tests nötig — `parseImageCount` in `instagram/route.ts` wird NICHT geändert und handhabt diese Cases bereits. |
| `src/app/dashboard/components/InstagramExportModal.tsx` | Modify | (a) `import { MAX_GRID_IMAGES } from "@/lib/instagram-post"` (A5c/Sonnet R3 H2), (b) `imageCount`-Default = `Math.min(MAX_GRID_IMAGES, availableImages)` (A5/A5d), (c) Number-Input `max`-Attribut = `min(MAX_GRID_IMAGES, availableImages)`, (d) **State-init-timing (Sonnet R5 #6):** `setImageCount(Math.min(MAX_GRID_IMAGES, result.availableImages))` MUSS nach erfolgreichem `fetchMetadata`-Callback aufgerufen werden (NICHT in initial useState — `availableImages` ist erst nach metadata-fetch bekannt). Conditional auf `imageCount === 0` (open-default), damit user-changed-Wert bei re-fetch nicht überschrieben wird. |
| `src/app/dashboard/components/LayoutEditor.tsx` | Modify | **Sonnet R5 #5 + R7 #2 corrected:** Add inline-Comment am `if (response.mode === "stale")`-Branch: `// isOrphan stale-trigger removed in M4a (A6d); content-hash + block-coverage stale paths still active via resolveInstagramSlides — full cleanup deferred to M4b.` Code-Logic NICHT entfernen (Branch ist NICHT dead — resolveInstagramSlides liefert mode:"stale" weiterhin via 2 andere Pfade). Comment markiert die partial-cleanup-Position für M4b. |
| `src/app/dashboard/components/InstagramExportModal.test.tsx` | Modify | Tests E3 |

### Architecture Decisions

- **No DB-Migration für legacy imageCount > 4 keys** — accept als harmlose JSONB-orphans. Future-Cleanup falls je relevant.
- **`MAX_GRID_IMAGES = 4` ist Design-Cap, NICHT DB-Cap.** `MAX_BODY_IMAGE_COUNT` bleibt für DB-row-validation untangiert.
- **Lead-Detection im SlideTemplate via existing `slide.isFirst && slide.leadOnSlide`** — keine neuen Slide-Type-Felder nötig. Nach A2/A3b ist die Kombination eindeutig (true NUR auf no-grid-Slide-1).
- **Auto-path AND Manual-path beide gefixt** — sonst doppelter Lead-Render bei legacy-Daten. Das ist die wichtigste M4-original-Lesson die in M4a überlebt.
- **Slide-2-Budget-Fix nicht optional (Sonnet R1 #1)** — sonst spillt Content unnötig auf Slide 3 wegen still-reduced budget für nicht-mehr-existierenden Lead.
- **Neue grid-cover-spezifische Spacing-Konstanten** (`HEADER_TO_TITLE_GAP_GRID_COVER` etc.) statt existing-Konstanten zu modifizieren — saubere Trennung zwischen cover-layout und body-slide-layout.
- **`computeSlide1GridSpec` MUSS consumer-side gewired werden** — sonst dead-code und legacy DB-rows mit `images_grid_columns` ignorieren das neue Mapping.
- **LayoutEditor.tsx stale-mode bleibt teilweise live in M4a (Sonnet R4 #3 + R7 #2 corrected):** A6d entfernt aus `instagram-layout/route.ts` NUR den `isOrphan`-Pfad (orphan_image_count → mode:"stale" wenn imageCount > availableImages). ABER `resolveInstagramSlides` in `instagram-overrides.ts` returnt `mode: "stale"` weiterhin via ZWEI andere Pfade die in M4a UNANGETASTET bleiben:
  - Content-Hash-Mismatch: `if (override.contentHash !== contentHash)` → mode:"stale"
  - Block-Coverage-Mismatch: `if (unknownInOverride || unreferencedCurrent)` → mode:"stale"

  → LayoutEditor's `if (response.mode === "stale")`-Branch ist NICHT dead code, ist weiterhin live für content-hash + block-coverage stale-detection. NUR der orphan_image_count-Trigger wird entfernt.

  PR-Description muss klarstellen: "M4a entfernt NUR den isOrphan stale-trigger; Content-hash/Block-coverage stale-paths bleiben live. M4b wird ALLE drei Stale-Detection-Pfade neu designen (server-derived baseBodyHash + Preview-Snapshot-Binding)."

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
