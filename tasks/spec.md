# Spec: Instagram Slide-1 Image Grid (1:1 Mirror of Agenda Renderer)
<!-- Created: 2026-04-28 -->
<!-- Author: Planner (Opus) -->
<!-- Status: Draft v10 (Codex R1 spec-eval findings addressed — 6 substantive issues fixed) -->
<!-- Branch: feat/instagram-grid-slide -->
<!-- Depends on: PR #128 (feat/instagram-fixed-sizes) merged to main -->

## Summary

Wenn der Admin im Instagram-Export-Modal `Bilder im Grid auf Slide 1 ≥ 1` setzt, zeigt Slide 1 das **gleiche Image-Grid wie auf der Website** (`src/components/AgendaItem.tsx`) — als pixel-orientierte Kopie ohne Editier-Features. Der Body-Text rückt entsprechend nach hinten: Slide 2 erhält das `lead` als Präfix vor den ersten Body-Blöcken, Slides 3..N tragen Body-Continuation.

Wenn `imageCount = 0`: bestehende Struktur unverändert (Titel + Lead auf Slide 1, Body greedy-fill).

**Was NICHT in Scope ist:**
- Keine Editier-UI für Grid (kein Reorder, kein per-Image-Fit-Toggle im Export)
- Keine pro-Eintrag-Grid-Konfiguration im Modal — `agenda_items.images_grid_columns` ist Single Source of Truth
- Keine neuen Image-Felder oder DB-Migrationen
- Keine Audit-Log-Erweiterung über das bestehende `image_count` hinaus
- Keine pure-image carousel slides mehr (alte `kind="image"` Architektur wird vollständig entfernt)

---

## Sprint Contract (Done-Kriterien)

1. **Slide 1 rendert tatsächlich als PNG** wenn `imageCount ≥ 1` (HTTP 200, kein Broken-Image im Preview-Modal).
2. **Grid-Layout = 1:1 Kopie** der `AgendaItem.tsx`-Logik:
   - `cols = agenda_items.images_grid_columns ?? 1`
   - `cols=1 + length=1` → Single-Image-Branch: portrait → 50% Slide-Breite zentriert mit `aspectRatio: "3/4"` Fallback wenn keine `width/height`; landscape → 100% Slide-Breite mit `aspectRatio: "4/3"` Fallback
   - `cols ≥ 2` → Multi-Image-Grid mit `min(cols, images.length)` Spalten, jede Zelle Aspect-Ratio 2:3 (`height = width * 3 / 2`)
   - `cols = 1 + length ≥ 2` (defensive) → 2-Spalten-Grid (`min(2, length)`)
   - Per-Image `fit: "contain" | "cover"` wird respektiert.
   - **`cropX` / `cropY` (objectPosition) werden ebenfalls respektiert** — mirror AgendaItem.tsx:211 (`objectPosition: ${cropX ?? 50}% ${cropY ?? 50}%`). Codex R1 #1: out-of-scope wäre Drift vs Website. Satori-Support muss empirisch verifiziert werden (DK-19); Falls Satori objectPosition still ignoriert, ist der Fallback Default-Center — DAS muss aber explizit verifiziert sein, nicht als Annahme.
3. **Slide 2 Lead-Präfix** rendert oberhalb der Body-Blöcke wenn `lead` non-empty UND `imageCount ≥ 1`.
4. **`imageCount = 0` Pfad strukturelle Invarianz** zur Pre-Sprint-main: gleiche Slide-Anzahl, gleiche Block-Verteilung, gleiche `kind`/`isFirst`/`isLast`/`leadOnSlide` Werte (Inline-Expected-Values Test, siehe Test-Sektion). Codex R1 #2: "bit-identisch" wäre ohne Golden-PNG-Baseline nicht mechanisch testbar — der `SlideTemplate`-Refactor (helper-Component-Extraction) ändert ggf. Whitespace im rendered HTML/SVG-Pfad, auch wenn das Visual identisch bleibt. Strukturelle Invarianz auf `splitAgendaIntoSlides`-Output ist mechanisch testbar und ausreichend für Regression-Schutz; visuelle Invarianz wird per DK-11 Manual-Smoke verifiziert.
5. **Tests grün** — Vitest + tsc clean. Alle bisherigen `kind === "image"` Tests entfernt oder migriert.
6. **Manueller Smoke auf Staging**: Modal öffnen mit Bild-tragendem Eintrag, `images=1` (cols=1 single, cols=1 mit 2 Bildern defensive 2-Spalten), `images=3` (cols=2 oder cols=3) — alle Slides rendern als sichtbare PNGs.
7. **Stale UI/Code-Reste-Grep** (Lessons 2026-04-22 Codex R1 PR #110): nach Implementation `rg -n '"image"|imagePublicId|imageAspect|imageDataUrl|fitImage|aspectOf|kind === .image.|totalSlides|scale: Scale|parseScale|hasInlineImage|inlineImageBox' src/` — 0 in-scope Hits in `instagram-post.ts`, `instagram-post.test.ts`, `slide-template.tsx`, route-files. (`images_grid_columns` und `images:` JSONB-Field sind LEGITIM und nicht Treffer dieser Kategorie.)
8. **Modal-Copy-Drift-Audit**: `rg -n 'einzelnes Bild|Bild auf Titel-Slide|carousel|pure.image|image.only' src/app/dashboard/components/InstagramExportModal.tsx` — 0 Hits. Alte Copy-Strings aus pre-grid-Architektur sind weg (helper-text, fieldset-legend, banners). Lessons 2026-04-22 PR #110 R1 — Codex flaggt sicher wenn Copy-String die alte Architektur beschreibt aber Code die neue macht.
9. **`width: "100%"` Audit auf Satori-Layout-Reste**: `rg -n 'width: "100%"' src/app/api/dashboard/agenda/\[id\]/instagram-slide/` — sollte 0 Hits ergeben außer bewusst dokumentiert. PR #97 Lesson: Satori `width: "100%"` propagiert content-width an siblings → flex-row + flex-column-Mix kollabiert. Alle layout-tragenden divs MÜSSEN `width: INNER_WIDTH` (= 920) verwenden.

---

## Sonnet R6 False-Positives (logged, not addressed)

> Sonnet's R6-Review flaggte 2 angebliche Build-Blocker die in der post-PR-#128 Codebase gar nicht existieren — Sonnet schaute auf den aktuellen Branch-State (pre-PR-#128 main) statt auf den Rebase-Target. Verifiziert via `git show origin/feat/instagram-fixed-sizes:…`:
>
> - **`scale` parameter / `Scale` type / `parseScale` in routes** → bereits durch PR #128 entfernt (`grep parseScale|Scale` in route.tsx + instagram/route.ts post-PR-#128 = 0 Hits). Dieser Sprint trifft keinen `Scale`-Code mehr.
> - **`bodySize` / `BODY_SIZES` / `continuationMeta` in slide-template.tsx** → bereits durch PR #128 entfernt (PR #128 ersetzte sie durch fixe `BODY_SIZE=40` const + neue `HeaderRow` auf jeder Slide). Dieser Sprint trifft sie nicht.
>
> `hasInlineImage` + `inlineImageBox` (auch von Sonnet R6 erwähnt) sind echte Aufräum-Kandidaten — explizit in der Lösch-Liste oben.

## PR #128 Dependency (was Sprint vorher landet)

PR #128 (`feat/instagram-fixed-sizes`) ändert auf main ein:
- `SLIDE1_OVERHEAD` = 450 (war 200) — wieder ersetzt durch height-basierten `SLIDE_BUDGET=1080` + `SLIDE1_BUDGET=350`.
- Neue Helper `paraHeightPx(text)`, Konstanten `BODY_LINE_HEIGHT_PX=52`, `PARAGRAPH_GAP_PX=22`, `CHARS_PER_LINE=36`.
- `splitAgendaIntoSlides` Body-Greedy-Fill operiert auf Pixel-Höhe statt Char-Cost.
- `intro-only-seed` wenn erster Block > `SLIDE1_BUDGET` → seeded leere Slide 1.
- Balance-Pass nur für `slide1IsIntroOnly` UND ≥3 continuation-Slides (verteilt continuation-Blocks gleichmäßig per `remainingCost / remainingSlides`).
- `SlideTemplate` ohne `Scale` Prop. Fixe Konstanten `BODY_SIZE=40`, `TITLE_SIZE=74`, `LEAD_SIZE=40`, `META_SIZE=26`, `HASHTAG_SIZE=26`. Gaps `HEADER_TO_HASHTAGS_GAP=32`, `HASHTAGS_TO_TITLE_GAP=60`, `TITLE_TO_LEAD_GAP=18`, `TITLE_TO_BODY_GAP=64`, `LEAD_TO_BODY_GAP=100`, `HEADER_TO_BODY_GAP=60`.
- `HeaderRow` (datum/zeit + ort, mit calendar/clock/globe SVG-Icons, `INNER_WIDTH=920`) auf JEDER Slide.
- Hashtags-Row nur auf Slide 1.

**Bereits auf main NACH PR #128 vorhanden** (NICHT in diesem Sprint nochmal implementieren):
- Alle obigen Höhen-Budget-Helper + Konstanten
- `SlideKind = "text" | "image"` (PR #128 ändert das NICHT — diese Sprint entfernt `"image"`)
- `imagePublicId?` + `imageAspect?` auf `Slide` (PR #128 ändert das NICHT — dieser Sprint entfernt sie)

---

## Architektur

### Type-Migration (`src/lib/instagram-post.ts`)

```ts
// VORHER (nach PR #128 merge):
export type SlideKind = "text" | "image";
export type Slide = {
  …
  kind: SlideKind;
  blocks: SlideBlock[];
  imagePublicId?: string;
  imageAspect?: number;
  meta: SlideMeta;
};

// NACHHER (dieser Sprint):
export type SlideKind = "text" | "grid";   // "image" RAUS

export type GridImage = {
  publicId: string;
  width: number | null;
  height: number | null;
  orientation: "portrait" | "landscape";   // resolveImages defaultet auf "landscape" wenn missing (mirror AgendaItem fallback)
  fit?: "cover" | "contain";               // undefined → template behandelt als "cover"
  cropX?: number;                           // 0-100 percent, default 50 (Center) — mirror AgendaItem
  cropY?: number;                           // 0-100 percent, default 50 (Center) — mirror AgendaItem
  alt?: string | null;
};

export type Slide = {
  index: number;
  isFirst: boolean;
  isLast: boolean;
  kind: SlideKind;
  blocks: SlideBlock[];
  /** Set on the FIRST text-slide that follows a `grid` slide. Template
   *  prefixes the body region with the lead. */
  leadOnSlide?: boolean;
  /** kind="grid" only: column count from agenda_items.images_grid_columns. */
  gridColumns?: number;
  /** kind="grid" only: full image array to render in the grid. */
  gridImages?: GridImage[];
  meta: SlideMeta;
  // imagePublicId und imageAspect ENTFERNT.
};

export type AgendaItemForExport = {
  /* … existing fields … */
  /** From agenda_items.images_grid_columns. Drives slide-1 grid cols. */
  images_grid_columns?: number | null;
};
```

**Konkrete Lösch-Liste:**
- `SlideKind` Union: `"image"` ENTFERNT.
- `Slide.imagePublicId?` ENTFERNT.
- `Slide.imageAspect?` ENTFERNT.
- `aspectOf(img: ImageRef)` Helper-Funktion ENTFERNT (war nur für `imageAspect` da).
- `ImageRef` interner Typ ENTFERNT, ersetzt durch `GridImage`.
- `SlideTemplate` Prop `imageDataUrl?: string | null` ENTFERNT, ersetzt durch `gridImageDataUrls?: (string | null)[] | null`.
- `SlideTemplate` Branch `if (kind === "image")` (Lines ~117–141 nach PR #128) ENTFERNT.
- `SlideTemplate` `slide-1-with-image` Branch (im `kind === "text"` Pfad) ENTFERNT — Slide 1 ist entweder `kind="grid"` (mit Bildern) oder `kind="text"` (ohne Bilder, klassisches Lead-Layout).
- `hasInlineImage` + `inlineImageBox` (locals im `kind === "text"` Pfad nach PR #128) ENTFERNT — diese stützten den slide-1-mit-image-Fall, der durch das neue `kind="grid"` ersetzt ist.
- `textBase = { width: "100%", … }` (locals im SlideTemplate-body) ENTFERNT — wird durch die neuen Helper-Components (`<TitleBlock>`, `<LeadBlock>`, `<BodyRegion>`) ersetzt, die alle `width: INNER_WIDTH` (920) numerisch setzen. Body-blocks (`blocks.map(...)`) MÜSSEN inline `width: INNER_WIDTH` setzen (nicht `width: "100%"` aus textBase recyceln) — DK-18 Audit.
- `fitImage(aspect, maxW, maxH)` Helper in `slide-template.tsx` ENTFERNT — wird durch die explizite `renderW/renderH` Berechnung im `<ImageGrid>` Single-Image-Branch ersetzt (siehe Implementation-Pseudocode unten). Inline-Formel:
  ```ts
  // Compute renderW × renderH so aspect preserved AND box ≤ (cellMaxW × maxHeight).
  let renderW = cellMaxW;
  let renderH = Math.floor(cellMaxW / (aspectW / aspectH));
  if (renderH > maxHeight) {
    renderH = maxHeight;
    renderW = Math.floor(maxHeight * (aspectW / aspectH));
  }
  ```

### `countAvailableImages` Update — KEINE Änderung gegenüber main

Codex R1 #4 (legacy-image-drift): die ursprüngliche Spec-Variante (orientation als required-Filter) hätte legacy-Items aus dem Modal ausgeblendet, während `AgendaItem.tsx:191` defensiv auf `?? "landscape"` defaultet. Das wäre Website-vs-Export-Drift.

**Korrektur:** `countAvailableImages` bleibt **wie es nach PR #128 ist** (nur `public_id`-Check). `resolveImages` defaultet missing/invalid `orientation` ebenfalls auf `"landscape"` (mirror AgendaItem). Damit existieren alle bekannten Bilder im Export, und Legacy-Items aus pre-PR-#103 funktionieren genauso wie auf der Website.

Konsequenzen:
- Pre-PR-#103-Items: Modal zeigt `max N` (alle Bilder zählen), Grid rendert sie alle als landscape (kann visuell suboptimal sein für portrait-Logos, aber matched die Website).
- Kein Pre-merge DB-Audit nötig — die defensive Fallback-Strategie macht den Sprint robust gegen unbekannte DB-Qualität.

### `resolveImages` rewrite

```ts
function resolveImages(item: AgendaItemForExport, count: number): GridImage[] {
  if (count <= 0 || !Array.isArray(item.images)) return [];
  const out: GridImage[] = [];
  for (const raw of item.images as unknown[]) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as {
      public_id?: unknown; orientation?: unknown;
      width?: unknown; height?: unknown;
      fit?: unknown; cropX?: unknown; cropY?: unknown; alt?: unknown;
    };
    if (typeof r.public_id !== "string" || r.public_id.length === 0) continue;
    // Codex R1 #4 — defensive landscape default für legacy-Items pre-PR-#103.
    // AgendaItem.tsx:191 macht denselben Fallback. Image NICHT überspringen.
    const orientation: "portrait" | "landscape" =
      r.orientation === "portrait" ? "portrait" : "landscape";
    out.push({
      publicId: r.public_id,
      orientation,
      width: typeof r.width === "number" ? r.width : null,
      height: typeof r.height === "number" ? r.height : null,
      fit: r.fit === "contain" ? "contain" : r.fit === "cover" ? "cover" : undefined,
      cropX: typeof r.cropX === "number" ? r.cropX : undefined,
      cropY: typeof r.cropY === "number" ? r.cropY : undefined,
      alt: typeof r.alt === "string" ? r.alt : null,
    });
    if (out.length >= count) break;
  }
  return out;
}
```

**Defaults:**
- `fit` undefined → Template rendert als `objectFit: "cover"`.
- `cropX` / `cropY` undefined → Template defaultet auf `50%` (Center) — mirror AgendaItem `?? 50` Pattern.
- `orientation` missing/invalid → defensive Default `"landscape"` (mirror AgendaItem.tsx:191). validateImages enforced orientation auf der Schreibseite seit PR #103, aber legacy-Items aus pre-PR-#103 könnten orientation-less sein und MÜSSEN trotzdem rendern.

### `splitAgendaIntoSlides` Logik

**Function-Signatur (post-PR-#128 + dieser Sprint):**
```ts
export function splitAgendaIntoSlides(
  item: AgendaItemForExport,
  locale: Locale,
  imageCount: number = 0,
): { slides: Slide[]; warnings: string[] }
```
- Kein `scale` Parameter (entfernt durch PR #128).
- Kein `totalSlides`-Output-Field (Slides berechnen `isFirst`/`isLast` selbst).
- Call-Sites in `instagram/route.ts` + `instagram-slide/[slideIdx]/route.tsx` rufen mit drei Argumenten — wenn nach PR-#128-Rebase noch ein vierter `scale`-Argument vorhanden ist, ENTFERNEN.



**WICHTIG:** `leadHeightPx` ist eine NEUE Funktion, NICHT identisch mit `paraHeightPx` (das nach PR #128 schon existiert). Unterschied:

| Funktion | gap | Verwendung |
|---|---|---|
| `paraHeightPx(text)` | `+22px` (PARAGRAPH_GAP_PX) | body block kosten — folgt von einem nächsten body block |
| `leadHeightPx(text)` | `+100px` (LEAD_TO_BODY_GAP) | lead-prefix — folgt von ERSTEM body block, nicht weiterem lead |

→ NICHT `paraHeightPx` für lead recyceln. Sonst budget um 78px überschätzt → erste body-Block-Schätzung daneben → bleibt Vitest unsichtbar, kommt erst beim Staging-Smoke raus.

```ts
const lead = resolveWithDeFallback(item.lead_i18n, locale);

// Lead-Höhen-Schätzung für slide-2 budget reduction. NEUE Funktion (siehe Tabelle oben).
// EXPORTIERT für Test-Importierbarkeit (mirror paraHeightPx pattern).
export function leadHeightPx(text: string | null): number {
  if (!text) return 0;
  const lines = Math.max(1, Math.ceil(text.length / CHARS_PER_LINE));
  return lines * BODY_LINE_HEIGHT_PX + LEAD_TO_BODY_GAP; // 100px gap zur ersten body-Block
}

const images = resolveImages(item, imageCount);
const hasGrid = images.length > 0;
const gridColumns = (() => {
  const raw = item.images_grid_columns;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 1) return 1;
  return Math.floor(raw);
})();

const slide2BodyBudget = hasGrid
  ? Math.max(SLIDE_BUDGET - leadHeightPx(lead), 200)  // Floor 200 verhindert
                                                       // Endlos-Splitten bei
                                                       // gigantischem Lead.
  : SLIDE_BUDGET;
```

**Greedy-Fill Phasen** (3 disjunkte States, abhängig von `groups.length` und `hasGrid`):

| Phase | Trigger | Budget |
|---|---|---|
| `intro` | `!hasGrid && groups.length === 0` | `SLIDE1_BUDGET` (350px) |
| `leadSlide` | `hasGrid && groups.length === 0` | `slide2BodyBudget` |
| `normal` | sonst | `SLIDE_BUDGET` (1080px) |

**Slide-Reihenfolge `hasGrid`:**
1. `kind="grid"` mit `gridImages` + `gridColumns`, `blocks=[]`.
2. Für jede Greedy-Group `i`: `kind="text"` mit `leadOnSlide = (i === 0 && Boolean(lead))`, `blocks=group`.

**Slide-Reihenfolge `!hasGrid`:** unverändert von main (greedy groups → `kind="text"` slides; intro-only-seed wenn erster Block > SLIDE1_BUDGET; balance-pass nur wenn slide-1 leer-seeded UND ≥3 continuation slides).

**Title-only Edge Cases:**
- `groups.length === 0 && !hasGrid` → push `[]` (leere intro slide für title+lead). Unverändert.
- `groups.length === 0 && hasGrid && lead` → push `[]` (leere lead-only text slide nach grid).
- `groups.length === 0 && hasGrid && !lead` → KEINE leere slide pushen (grid-Slide alleine reicht).

**Balance-Pass für `hasGrid` Pfad:** ENTFÄLLT in v1. Greedy-Fill ab Slide 2 mit reduziertem Slide-2-Budget. Akzeptiert eventuelle Single-Paragraph-Last-Slide. Dokumentation im Code: `// hasGrid: no balance pass — slide-2 has lead-prefix budget reduction; rebalancing across mixed-budget slides is non-trivial. Acceptable in v1.`

**Hard-Cap (`SLIDE_HARD_CAP = 10`):** gilt für **Total-Carousel** (grid + body slides), NICHT für `groups.length` allein.
- `hasGrid = true`: cap `groups.length` an `SLIDE_HARD_CAP - 1 = 9` (1 grid + bis zu 9 body = max 10 total). Wenn original `groups.length > 9`: `warnings.push("too_long")`, slice auf 9.
- `hasGrid = false`: cap `groups.length` an `SLIDE_HARD_CAP = 10` (unverändert von main).
- Implementation: cap der `rawSlides`-Array, wie bisher: `if (rawSlides.length > SLIDE_HARD_CAP) { clamped = rawSlides.slice(0, SLIDE_HARD_CAP); warnings.push("too_long"); }` — funktioniert für beide Pfade einheitlich, weil `rawSlides` für `hasGrid` schon das grid-Element enthält.

### Route-Änderungen

**`instagram-slide/[slideIdx]/route.tsx`:**
- SQL SELECT erweitern um EINE neue Spalte. Die existing `images` Spalte ist seit PR #110 schon im SELECT — NICHT verdoppeln. Konkret: `images, images_grid_columns` am Ende des bestehenden SELECT-Clusters.
- Route-Tests die `pool.query` mocken müssen `images_grid_columns: null` (oder konkreten Wert) zur Fixture-Row hinzufügen — sonst kommt das Field als `undefined` an und `gridColumns` defaultet stillschweigend zu 1, was Multi-Column-Coverage maskiert.
- Image-Loading Block ersetzen:
  ```ts
  let gridImageDataUrls: (string | null)[] | null = null;
  if (slide.kind === "grid" && slide.gridImages) {
    gridImageDataUrls = await Promise.all(
      slide.gridImages.map(async (img) => {
        try {
          const media = await loadMediaAsDataUrl(img.publicId);
          if (!media) {
            console.warn(`[ig-export] image not loadable public_id=${img.publicId} slide=${numSlideIdx}`);
            return null;
          }
          return media.dataUrl;
        } catch (err) {
          // Per-image try/catch verhindert dass ein einzelner DB-Throw die
          // ganze Grid-Slide auf 500 hochreißt. Failed image → null (template
          // rendert leere Zelle), die anderen Images überleben.
          console.warn(`[ig-export] image load threw public_id=${img.publicId} slide=${numSlideIdx}`, err);
          return null;
        }
      }),
    );
  }
  ```
  **Erlaubte 5xx-Fälle des Routes:** font-load-fail (PR #128), DB-failure auf der `agenda_items`-SELECT (außerhalb image-load), unerwartete `ImageResponse`-throw. **Nicht erlaubt**: einzelne Image-Load-Failures dürfen die ganze Slide nicht 500en — pro-image try/catch oben garantiert das.

**Codex R1 #5 — User-Feedback bei partial image-load fail:**

Wenn 1+ Bild-Load fehlschlägt, ist „Slide rendert mit leerer Zelle, aber 200 OK" stille Unterlieferung — Admin lädt N Bilder runter, denkt es passte. Lösung: warnings-Channel im Metadata-Endpoint:

- `instagram/route.ts` GET: nach dem `splitAgendaIntoSlides` UND BEVOR die Antwort gesendet wird, soll der Endpoint die Image-IDs der `kind="grid"` Slides gegen `media`-Tabelle vorab probelaufen (existence-only `SELECT public_id FROM media WHERE public_id = ANY($1)`). Wenn weniger Treffer als IDs: `warnings.push("image_partial")`.
- Alternative (einfacher, aber weniger früh): der Slide-Endpoint selbst returns `warnings: ["image_partial"]` im response-header `X-IG-Export-Warnings` wenn loaded image count < expected. Modal liest header beim Slide-fetch und zeigt Banner.
- **Spec-Wahl für v1**: Variante A (Pre-Check im metadata GET). Modal zeigt amber Banner: „Mindestens 1 Bild konnte nicht geladen werden — bitte Modal schließen und nochmal öffnen, oder Bild im Eintrag erneut hochladen."
- Test (DK-2 Erweiterung): `instagram/route.ts.test.ts` mit fehlendem media row → returned `warnings: ["image_partial"]`.
- Route Call-Site: `<SlideTemplate slide={slide} gridImageDataUrls={gridImageDataUrls} />`. **Komplette Prop-Liste post-Sprint:**
  - `slide: Slide` ✅ (bleibt)
  - `gridImageDataUrls?: (string | null)[] | null` ✅ (NEU)
  - `imageDataUrl?: string | null` ❌ ENTFERNT
  - `totalSlides: number` ❌ ENTFERNT (war bereits durch PR #128 weg, aber falls nach Rebase als Hangover noch im Call-Site da: löschen)
  - `scale: Scale` ❌ ENTFERNT (war bereits durch PR #128 weg, gleicher Hinweis)
- Audit-Payload `image_count` bleibt.

**`instagram/route.ts` (Metadata):**
- SQL SELECT: ebenfalls nur `images_grid_columns` ergänzen (wie oben). `images` bleibt unverändert.
- `splitAgendaIntoSlides` Call-Site unverändert (`imageCount` bleibt der Eingang).

### Slide-Template

**Komponenten-Helper (Refactor von Inline-JSX):**
- `<HeaderRow meta />` (existing, unverändert).
- `<HashtagsRow hashtags />` (neu — extrahiert aus aktueller `slide.isFirst`-Inline-JSX).
- `<TitleBlock title marginTop marginBottom />` (neu — extrahiert).
- `<LeadBlock lead marginBottom />` (neu — extrahiert; benutzt von slide-1-text-Pfad UND slide-2-lead-prefix-Pfad).
- `<ImageGrid cols images dataUrls maxHeight />` (neu — siehe unten).

**Pflicht-Inline-Style für ALLE 3 neuen Helper** (`HashtagsRow`, `TitleBlock`, `LeadBlock`) PLUS `<FullWidthCol>`/`<BodyRegion>`-Wrapper:
- `display: "flex"` (Satori-Pflicht).
- `flexDirection: "column"` (außer HashtagsRow → `"row"` mit `flexWrap: "wrap"`).
- `width: INNER_WIDTH` (920px — pinned, kein `width: "100%"` weil Satori-Quirk dann content-width an siblings weiterreicht — siehe lessons.md PR #97).
- `flexShrink: 0` (Pflicht — header elements MÜSSEN gegen flex-grow body shrinken; ohne das werden sie auf 0 height kollabiert. Use existing `NO_SHRINK = { flexShrink: 0 as const }` const aus aktuellem slide-template). Siehe lessons.md 2026-04-19 (PR #97 12-Runden-Saga).

**`<HashtagsRow>` Null-Guard + Margin:** `if (hashtags.length === 0) return null;` als allerersten Statement. Niemals leeren Container rendern. Wenn vorhanden: rendert mit `marginTop: HEADER_TO_HASHTAGS_GAP` (32px) — definiert auf dem `<HashtagsRow>` Outer-Container, NICHT durch den Parent. Items ohne Hashtags rendern Title-Block direkt nach Header (mit `HEADER_TO_BODY_GAP=60` margin-top), kein 32px Phantom-Gap.

**`<FullWidthCol>` Margin:** der Wrapper hat KEIN intrinsisches `marginTop`. Spacing entsteht aus dem ERSTEN Child:
- Wenn `meta.hashtags.length > 0` → erstes Child = `<HashtagsRow>` (32px marginTop).
- Wenn `meta.hashtags.length === 0` → erstes Child = `<TitleBlock marginTop={HEADER_TO_BODY_GAP}>` (60px).
- Damit ist das Spacing zwischen `<HeaderRow>` und Title eindeutig und unabhängig vom Vorhandensein der HashtagsRow.

**Outer Layout Column Structure (`outerStyle` Container):**
```
<div style={outerStyle}>                    // flexDirection: "column", padding: 80
  <HeaderRow meta />                        // immer (NO_SHRINK)
  // Bei kind="grid":
  <HashtagsRow hashtags />                  // (NO_SHRINK)
  <TitleBlock marginBottom={TITLE_TO_GRID_GAP} />  // (NO_SHRINK)
  <ImageGrid />                             // (NO_SHRINK)
  // Bei kind="text" + slide.isFirst:
  <FullWidthCol>                            // wrapper für alle isFirst-content
    <HashtagsRow />
    <TitleBlock marginBottom={leadGap} />
    {meta.lead && <LeadBlock marginBottom={LEAD_TO_BODY_GAP} />}
  </FullWidthCol>
  <BodyRegion marginTop={isFirst ? 0 : HEADER_TO_BODY_GAP}>
    {leadOnSlide && <LeadBlock />}
    {blocks.map(...)}
  </BodyRegion>
</div>
```

**`<FullWidthCol>` Definition:**
```tsx
<div style={{
  display: "flex",
  flexDirection: "column",
  width: INNER_WIDTH,
  flexShrink: 0,
}}>
  {children}
</div>
```
Funktion: stellt sicher dass HashtagsRow+TitleBlock+LeadBlock als ein layout-block behandelt werden — verhindert Satori-Quirk wo nested flex-rows widht an columns weiterreichen (PR #97 R1 fix, slide-1 title kollabierte ohne diesen Wrapper).

**`<BodyRegion>` Definition:**
```tsx
<div style={{
  display: "flex",
  flexDirection: "column",
  flexGrow: 1,
  minHeight: 0,
  width: INNER_WIDTH,
  marginTop,  // prop-driven — 0 für isFirst, HEADER_TO_BODY_GAP sonst
}}>
  {children}
</div>
```
Funktion: das Body-Container, der `flexGrow: 1` hat (nimmt restliche Höhe nach HeaderRow + Title-Block) und `minHeight: 0` (Satori-required für flex-shrink-fähigkeit). Kein `flexShrink: 0` hier — Body MUSS shrinken können.

**Neue Konstante:** `TITLE_TO_GRID_GAP = 48` (px).

**`maxHeight` Berechnung für `<ImageGrid />`:**
```ts
// Available height for grid on slide 1:
//   1350 (canvas) - 2*80 (padding) - 34 (HeaderRow) - 32+62 (hashtags row + gap, when present)
//   - ~280 (worst-case 3-line title @ 74px*1.04*3 + buffer) - 48 (TITLE_TO_GRID_GAP)
//   ≈ 750. Round down to 700 for safety. Hashtag-less items get a bit more.
const GRID_MAX_HEIGHT = 700;
```
Hard-coded constant in v1 (Done-Kriterium #6 verifiziert via Manual Smoke). Wenn Tests zeigen dass es eng ist: nachjustieren in einer Follow-up Iteration.

**`<ImageGrid />` Implementation:**

> **Branch-Selection:** der Single-Image-Branch greift NUR bei exakt `cols === 1 && images.length === 1` (matches AgendaItem.tsx:188). Alle anderen Kombinationen (auch das defensive `cols ≥ 2 && images.length === 1`) gehen in den Multi-Cell-Branch und rendern in einer 2:3-Zelle. Das ist absichtlich: 1:1-Mirror der Website. Wenn Admin `cols=2` setzt aber nur 1 Bild hochlädt, sieht das Bild im Export wie auf der Website aus (forced 2:3 portrait crop für Landscape-Bild). Bewusste Konsequenz der „1:1-Kopie"-Anforderung.

- `cols=1 + length=1` Single-Image-Branch:
  - `const img = images[0]`, `const url = dataUrls[0]`, `const fit = img.fit` (kann undefined sein).
  - `const isPortrait = img.orientation === "portrait"`
  - `const aspectW = img.width ?? (isPortrait ? 3 : 4)`
  - `const aspectH = img.height ?? (isPortrait ? 4 : 3)`
  - `const cellMaxW = isPortrait ? Math.floor(INNER_WIDTH * 0.5) : INNER_WIDTH`
  - Compute `renderW × renderH` so `renderW ≤ cellMaxW`, `renderH ≤ maxHeight`, aspect preserved.
  - **Wenn `url === null`** (image-load-fail): NICHT `<img src={null}>` rendern — das war der Bug von commit 4bfe4ce. Stattdessen leeres `<div>` mit gleicher renderW×renderH-Box rendern (slate-grey background als Visual-Marker, oder einfach nichts — Hauptsache kein null-src). Render-Pseudo:
    ```tsx
    <div style={{display:'flex', width:INNER_WIDTH, justifyContent:'center'}}>
      {url ? (
        <img
          src={url}
          width={renderW} height={renderH}
          alt={img.alt ?? ""}
          style={{
            width:renderW, height:renderH,
            objectFit: fit==='contain' ? 'contain' : 'cover',
            objectPosition: `${img.cropX ?? 50}% ${img.cropY ?? 50}%`,
            ...(fit==='contain' && {backgroundColor:'#fff'}),
          }}
        />
      ) : (
        <div style={{display:'flex', width:renderW, height:renderH, backgroundColor:'#cccccc'}} />
      )}
    </div>
    ```
- Multi-Cell Branch (alle nicht-`(cols=1 && length=1)` Fälle):
  - `effectiveCols = cols >= 2 ? Math.min(cols, images.length) : Math.min(2, images.length)`
  - `rows = Math.ceil(images.length / effectiveCols)`
  - `pad = (effectiveCols - (images.length % effectiveCols)) % effectiveCols` — Anzahl leerer Trailing-Cells in der letzten Reihe.
  - `GAP = 13` px (Match für `--spacing-half: clamp(10px, 0.5rem + 0.6vw, 13.333px)` aus `globals.css` — bei 1080px canvas-width clampt der vw-Term auf maximum 13.333, gefloort auf 13. Sicherer als 12 weil näher am Website-Render).
  - `cellW = Math.floor((INNER_WIDTH - GAP * (effectiveCols - 1)) / effectiveCols)`
  - `cellH = Math.floor(cellW * 3 / 2)` (aspect 2:3, mirror AgendaItem.tsx:238).
  - Wenn `cellH * rows + GAP * (rows - 1) > maxHeight`: scale down — `cellH = Math.floor((maxHeight - GAP * (rows - 1)) / rows)`, `cellW = Math.floor(cellH * 2 / 3)`.

  **Outer Grid-Container Struktur** (Satori braucht explizite Layout — kein `display: grid`):
  ```tsx
  <div style={{
    display: "flex",
    flexDirection: "column",
    width: INNER_WIDTH,
    flexShrink: 0,
  }}>
    {Array.from({ length: rows }).map((_, r) => (
      <div key={`row-${r}`} style={{
        display: "flex",
        flexDirection: "row",
        width: INNER_WIDTH,
        marginTop: r > 0 ? GAP : 0,    // vertikaler Row-Gap, nur zwischen Reihen
      }}>
        {Array.from({ length: effectiveCols }).map((_, c) => {
          const idx = r * effectiveCols + c;
          const img = images[idx];
          if (!img) {
            // Empty trailing cell (last row only, when pad > 0)
            return (
              <div key={`empty-${r}-${c}`} style={{
                display: "flex",
                width: cellW,
                height: cellH,
                marginLeft: c > 0 ? GAP : 0,   // horizontaler Cell-Gap
              }} />
            );
          }
          const url = dataUrls[idx] ?? null;
          const fit = img.fit;
          return (
            <div key={`${img.publicId}-${idx}`} style={{
              display: "flex",
              width: cellW,
              height: cellH,
              marginLeft: c > 0 ? GAP : 0,
              overflow: "hidden",
              ...(fit === "contain" && { backgroundColor: "#fff" }),
            }}>
              {url ? (
                <img
                  src={url}
                  width={cellW}
                  height={cellH}
                  alt={img.alt ?? ""}
                  style={{
                    width: cellW,
                    height: cellH,
                    objectFit: fit === "contain" ? "contain" : "cover",
                    objectPosition: `${img.cropX ?? 50}% ${img.cropY ?? 50}%`,
                  }}
                />
              ) : null /* leer → bg-color (rot) bleibt sichtbar */}
            </div>
          );
        })}
      </div>
    ))}
  </div>
  ```
  - Vertikaler Gap: `marginTop: GAP` auf row-Container ab `r > 0` (NIE `gap: GAP` auf Parent — Satori unterstützt das nicht zuverlässig).
  - Horizontaler Gap: `marginLeft: GAP` auf cell-Container ab `c > 0`.
  - **`objectPosition` WIRD gesetzt** (Codex R1 #1 Mirror-Forderung): `objectPosition: \`${img.cropX ?? 50}% ${img.cropY ?? 50}%\`` auf jede `<img>`. DK-19 verifiziert empirisch ob Satori es wirklich anwendet (Smoke-Test mit gecropptem Bild, cropX=0 vs cropX=100 müssen visuell unterschiedlich aussehen). Falls Satori objectPosition still ignoriert: dokumentiert als bekanntes Visual-Drift in `memory/lessons.md`, NICHT als Spec-Failure — die Code-Anweisung ist dann korrekt, nur der Renderer ist limitiert.

**Branch in `SlideTemplate`:**

> **Defensive Guard:** wenn `kind === "grid"` aber `slide.gridImages` leer/undefined ist (sollte nie passieren — `splitAgendaIntoSlides` produziert `kind="grid"` nur mit `images.length > 0`), wirft die Render-Funktion `throw new Error("grid slide without gridImages")`. Falscher Fall-Through zum text-Template wäre ein silent-bug. Test-Fixture-Mismatches schlagen damit lautstark fehl.

```tsx
if (kind === "grid") {
  if (!slide.gridImages || slide.gridImages.length === 0) {
    throw new Error(
      `[ig-export] kind="grid" slide ${slide.index} hat keine gridImages — splitAgendaIntoSlides invariant verletzt`,
    );
  }
  return (
    <div style={outerStyle}>
      <HeaderRow meta={meta} />
      <HashtagsRow hashtags={meta.hashtags} />
      <TitleBlock
        title={meta.title}
        marginTop={meta.hashtags.length > 0 ? HASHTAGS_TO_TITLE_GAP : HEADER_TO_BODY_GAP}
        marginBottom={TITLE_TO_GRID_GAP}
      />
      <ImageGrid
        cols={slide.gridColumns ?? 1}
        images={slide.gridImages}
        dataUrls={gridImageDataUrls ?? slide.gridImages.map(() => null)}
        maxHeight={GRID_MAX_HEIGHT}
      />
    </div>
  );
}

// kind === "text"
return (
  <div style={outerStyle}>
    <HeaderRow meta={meta} />
    {slide.isFirst ? (
      <FullWidthCol>
        <HashtagsRow hashtags={meta.hashtags} />
        <TitleBlock
          title={meta.title}
          marginTop={meta.hashtags.length > 0 ? HASHTAGS_TO_TITLE_GAP : HEADER_TO_BODY_GAP}
          marginBottom={meta.lead ? TITLE_TO_LEAD_GAP : TITLE_TO_BODY_GAP}
        />
        {meta.lead ? <LeadBlock lead={meta.lead} marginBottom={LEAD_TO_BODY_GAP} /> : null}
      </FullWidthCol>
    ) : null}
    <BodyRegion marginTop={slide.isFirst ? 0 : HEADER_TO_BODY_GAP}>
      {slide.leadOnSlide && meta.lead ? (
        <LeadBlock lead={meta.lead} marginBottom={LEAD_TO_BODY_GAP} />
      ) : null}
      {blocks.map(...)}
    </BodyRegion>
  </div>
);
```

**Grid-Slide Header-Zusammensetzung** (klargestellt — alle aus `meta`):
- `HeaderRow` zeigt datum + zeit links, ort rechts (gleich wie slide.isFirst-text).
- `HashtagsRow` ja, wie slide.isFirst-text.
- Lead ERSCHEINT NICHT auf grid-Slide (rückt zu slide 2).

### Modal-Änderungen (minimal, keine neue State)

- Helper-Text unter Number-Input:
  - `imageCount === 0` → „kein Grid — Titel + Lead auf Slide 1"
  - `imageCount ≥ 1` → „Grid auf Slide 1, Lead + Body ab Slide 2"
- Legend: „Bilder im Grid auf Slide 1 (max N)"
- Audit-Payload (`image_count`) bleibt unverändert.
- **`useCallback`-Check** (lessons.md 2026-04-22): `imageCount` MUSS in `handleDownload` dep-array bleiben (existing). KEINE neue useState in diesem Sprint.

---

## Satori-Risiken (explizit adressieren)

> Letzter Versuch (commit `4bfe4ce` auf PR #128, reverted) zeigte Slide 1 als Broken-Image im Preview-Modal. Wahrscheinliche Ursachen — alle in der Implementation explizit prüfen:

1. **`<img>` ohne explicit `width`/`height` Props** → Satori rendert null. Fix: beide HTML-Attribute (`<img width={N} height={N}>`) PLUS `style.width`/`style.height` (numerisch in px).
2. **`objectPosition: "X% Y%"`** → Satori-Support unklar. Codex R1 Pflicht: trotzdem setzen (Mirror-Forderung). DK-19 Smoke-Test verifiziert empirisch ob Satori es respektiert. Falls nein: kein Spec-Failure — Logiken sind korrekt, Renderer ist limitiert; in `memory/lessons.md` als known-Visual-Drift dokumentieren.
3. **`backgroundColor: undefined`** → manche Satori-Versionen werfen. Fix: Property nur via Spread setzen wenn `fit === "contain"`: `...(fit === "contain" && { backgroundColor: "#fff" })`. Sonst Property komplett weglassen.
4. **Nested CSS-Grid** → Satori unterstützt `display: grid` lückenhaft. Fix: nested `display: flex; flexDirection: row`-Chains für Mehrzeilen-Grid.
5. **Empty trailing cells** (Formel: `pad = (effectiveCols - (images.length % effectiveCols)) % effectiveCols`) → leere Zelle als `<div style={{display:'flex', width: cellW, height: cellH}} />`. KEIN nicht-explizites `display`.
6. **`data-URL` zu groß** → falls Slide 1 mit 6 Bildern × 3MB einen 18MB-data-URL erzeugt: Render-Timeout möglich. Fix: Logging im Route hinzufügen (nicht im Critical-Path), falls relevant Down-Sampling vor v1 (TBD nach Manuell-Test).
7. **Tailwind-Notation in JSX** → `aspect-[3/4]` etc. funktionieren NICHT in Satori-JSX (kein CSS-Loader). Alle Aspect-Ratios als inline-Style: `style={{ aspectRatio: '3/4' }}` oder als hartkodierte `width`+`height` numbers (bevorzugt, weil Satori `aspectRatio` ebenfalls lückenhaft).

**Test-Strategie für Satori:**
- Vitest deckt `splitAgendaIntoSlides`-Logik vollständig ab.
- **Codex R1 #3 — neue Pflicht**: route-level Test mit gemocktem `loadMediaAsDataUrl`. Mocks: (a) erfolgreich, (b) returns `null`, (c) throws. Verifiziert dass:
  - Route 200 OK in allen 3 Fällen (kein 5xx auf einzelnem image-fail).
  - `gridImageDataUrls`-Prop an `<SlideTemplate>` korrekt durchgereicht wird (parallel zu `slide.gridImages`, mit `null` wo Mock `null`/throw).
  - Pro-image try/catch isoliert (1 image throw → die anderen N-1 Images überleben).
- **Template-Snapshot-Test** (neu, Codex R1 #3): Vitest renders `<SlideTemplate>` als JSX-Tree (kein Satori), assertet:
  - `kind="grid"` + `gridImages.length=0` → wirft (defensive guard).
  - `kind="grid"` + 3 images, alle `null` URLs → renders 3 leere cells (kein crash).
  - `kind="text" + leadOnSlide=true` → erste Child im body-region ist `<LeadBlock>`.
- Done-Kriterium #1 + #11 = manueller Browser-Smoke + `docker logs` clean (zusätzlich zur Vitest-Coverage).

---

## Tests (Done-Kriterium #5)

### `instagram-post.test.ts` Migration

**Existing Tests zum LÖSCHEN:**
- `it("imageCount=2 → slide-1 + 1 pure-image slide + body text slides")` — komplette Test-Erwartung obsolet.
- `it("imageCount=1 → slide-1 carries image, body text moves to slide-2")` — slide 1 ist jetzt grid, nicht text-mit-image.
- `it("title-only item with image → 1 text slide (title+lead+image), no body")` — slide 1 ist jetzt grid.
- Jeder Test der `slide.kind === "image"` oder `slide.imagePublicId` oder `slide.imageAspect` assertet.

**`baseItem()` Fixture-Helper Erweiterung:**
- Aktueller `baseItem()` in `instagram-post.test.ts` hat keine `images_grid_columns` Property.
- Diesen Sprint: `baseItem(overrides)` extension so anpassen dass `images_grid_columns: number | null | undefined` als optionaler override-key angenommen wird (default `null` damit `resolveImages` defaultet zu cols=1).
- Grid-Tests setzen `cols` explizit per `baseItem({ images_grid_columns: 2 })`.
- **`img()` Test-Helper (`const img = (id, w?, h?)`)**: erweitern um optional `orientation`-Param mit Default `"landscape"`. Grid-Path-Tests können orientation explizit setzen oder den default landscape annehmen. Codex R1 #4 Update: `resolveImages` defaultet missing orientation seit v10 auf `"landscape"`, also `skip`t es Bilder NICHT MEHR — Test ohne orientation funktioniert trotzdem.
  ```ts
  const img = (
    id: string,
    w = 1200,
    h = 800,
    orientation: "portrait" | "landscape" = "landscape",
  ) => ({ public_id: id, width: w, height: h, orientation });
  ```

**Existing Tests zu BEHALTEN (keine Änderung):**
- `flattenContent` Tests (alle).
- `isLocaleEmpty` Tests (alle).
- `splitAgendaIntoSlides` non-image Tests `(a)–(h)`.
- `countAvailableImages` Test.
- Hard-cap Test (anpassen falls nötig — siehe neue Cases).
- Long-body-block-Test (intro-only-seed Verhalten).
- `imageCount=0 → no image slides` Test.

**Neue Tests:**
```ts
describe("grid path (imageCount > 0)", () => {
  it("imageCount=1 + cols=1 → 1 grid slide (single image) + 1 text-with-leadOnSlide");
  it("imageCount=2 + cols=1 → defensive 2-col grid, 1 grid slide + 1 text-with-leadOnSlide");
  it("imageCount=3 + cols=2 → 2-col grid (3 cells, 1 empty trailing pad), 1 grid + 1 text");
  it("imageCount=5 + cols=3 → 3-col grid (2 rows: 3+2 cells, 1 empty pad), 1 grid + body slides");
  it("imageCount > available → silent clamp to available count");
  it("title-only + grid + lead → 1 grid + 1 lead-only text slide (blocks=[], leadOnSlide=true)");
  it("title-only + grid + no lead → 1 grid slide alone");
  it("long lead pushes body off slide-2 budget → lead bleibt auf slide-2, body splittet ab slide-3");
  it("hard-cap mit Grid (1 grid + 9 body) → exact 10 slides, no warning");
  it("hard-cap mit Grid (1 grid + 12 body) → 10 slides + too_long warning");
  it("gridImages enthalten orientation/fit/cropX/cropY aus images JSONB");
  it("gridImage ohne orientation → orientation defaultet auf 'landscape' (mirror AgendaItem, NICHT mehr skipped seit Codex R1 #4)");
  it("alle Slides außer index 0: isFirst=false; isLast nur auf letzter slide");
  it("hasGrid path: slide[0].kind='grid' isFirst=true; slide[1].kind='text' isFirst=false leadOnSlide=true");
  it("hasGrid path mit ≥3 body slides: slide[2..N].leadOnSlide ist falsy (nur slide[1] hat leadOnSlide)");
  it("gridColumns=0 in DB → defensive default cols=1 (mirror AgendaItem fallback)");
  it("gridColumns=null in DB → defensive default cols=1");
  it("gridColumns=NaN in DB → defensive default cols=1 (Number.isFinite guard)");
});

describe("legacy-image fallback (Codex R1 #4 — orientation defensive default)", () => {
  it("resolveImages mit Bild ohne orientation → returned als orientation='landscape'");
  it("resolveImages mit Bild orientation='invalid' → returned als 'landscape'");
  it("countAvailableImages zählt orientation-less Items (kein Skip — match Website-Behavior)");
});

describe("leadHeightPx — distinguishable from paraHeightPx (gap difference matters)", () => {
  // Sentinel: 50-char text (≈ 1.4 lines → ceil to 2 lines × 52 = 104px)
  // paraHeightPx: 104 + 22 = 126px
  // leadHeightPx: 104 + 100 = 204px (78px more — exactly LEAD_TO_BODY_GAP - PARAGRAPH_GAP_PX)
  it("leadHeightPx('x'.repeat(50)) === 204 px (≠ paraHeightPx which would be 126)");
  it("leadHeightPx(null) === 0 px (no body-budget reduction when lead absent)");
  it("leadHeightPx('') === 0 px (treated like null)");
});
```

### `imageCount=0` Bit-Identity Test

Basierend auf existierender Test `it("imageCount=0 → no image slides, body fits on slide-1 when short enough")` — die expected-values bleiben unverändert. Zusätzlich ein konkreter Multi-Paragraph-Snapshot:

```ts
it("imageCount=0 (legacy regression): exact slide structure unchanged from main", () => {
  // 3 × 200-char paragraphs = 3 × paraHeightPx (≈ 6 lines × 52 + 22 = 334px each).
  // Greedy-fill against SLIDE1_BUDGET=350 / SLIDE_BUDGET=1080:
  //   Slide 1 (intro phase, budget 350): para1 (334px) fits → currentSize=334.
  //                                       para2 (334px) → 334+334=668>350 → push.
  //   Slide 2 (normal, budget 1080):     para2 → currentSize=334.
  //                                       para3 → 334+334=668≤1080 → fits.
  // Expected: 2 slides, blocks = [[para1], [para2, para3]].
  const item = baseItem({
    lead_i18n: { de: "Ein Lead", fr: null },
    content_i18n: { de: paragraphs(3, 200), fr: null },
  });
  const { slides } = splitAgendaIntoSlides(item, "de", 0);
  expect(slides).toHaveLength(2);
  expect(slides[0].kind).toBe("text");
  expect(slides[0].blocks).toHaveLength(1);
  expect(slides[1].kind).toBe("text");
  expect(slides[1].blocks).toHaveLength(2);
  expect(slides[0].leadOnSlide).toBeFalsy(); // legacy path: no leadOnSlide flag
});
```
*Hinweis: Falls die actual-numbers nach PR-#128-rebase abweichen (line-counts gerundet anders, Konstanten verschoben), expected-Werte korrigieren — aber NICHT die Test-Struktur ändern. Der Test prüft Struktur-Invarianz, nicht eine konkrete Slide-Count.*

### Modal-Tests

- Bestehende Modal-Tests dürfen NICHT brechen. Helper-Text-Änderungen sind String-Änderungen — falls Test darauf assertet, anpassen.
- **Neuer Test (Codex R2 #5)**: `InstagramExportModal.test.tsx` — `image_partial` amber Banner:
  - Mock metadata-fetch returns `{ slideCount, availableImages, warnings: ["image_partial"] }`.
  - Banner mit Copy „Mindestens 1 Bild konnte nicht geladen werden — bitte Modal schließen und nochmal öffnen, oder Bild im Eintrag erneut hochladen." muss sichtbar sein.
  - Bei `warnings: []` darf der Banner NICHT erscheinen.
  - Wenn `image_partial` UND `embeddedMedia` Banner gleichzeitig zutreffen: beide rendern (independent banners, keine Hierarchie). PR #110-Lesson: Copy-Drift checked.

---

## Risk Surface

- **Blast Radius (Codex R1 #6 ehrliche Korrektur)**: MITTEL, nicht niedrig wie zuvor behauptet. Das Feature ist FORMAL hinter `imageCount > 0` Toggle (Default 0), aber dieser Sprint refactort `splitAgendaIntoSlides`, `resolveImages`, das Route-Image-Loading UND `SlideTemplate` für ALLE Pfade — inklusive `imageCount=0`. Ein Refactor-Bug trifft den Default-Pfad genauso. Konkrete Mitigation:
  - DK-5 (`imageCount=0` strukturelle Invarianz) ist HARD GATE — wenn die Tests dort nicht 1:1 dieselbe Slide-Anzahl + Block-Verteilung wie main produzieren, ist der Sprint gescheitert.
  - Staging-Smoke (DK-11) MUSS `imageCount=0` Export auf einem realen Eintrag testen, nicht nur die Grid-Pfade.
  - Codex-Review nach Push wird gegen den `imageCount=0` Pfad besonders aufmerksam sein.
- **Reversibilität**: trivial — neuer Branch, eigener PR. Bei Problemen: Revert ist sauber.
- **Cross-Cutting**:
  - Auth: Route bleibt `requireAuth`-gated.
  - i18n: Title/Lead/Hashtags/Ort respektieren bestehende `resolveWithDeFallback`/`resolveHashtags`-Logik.
  - Audit: `image_count` Field bereits da, semantisch unverändert.
  - Performance: Slide-1 Render lädt jetzt N Bilder via `Promise.all` parallel.

---

## Out-of-Scope (→ `memory/todo.md` falls relevant)

- (`cropX/cropY` / `objectPosition` ist seit Codex R1 #1 in-Scope — siehe Sprint Contract DK #2 + Implementation. Wenn DK-19 Smoke zeigt dass Satori es ignoriert, in `memory/lessons.md` als known-Limitation eintragen, NICHT als Spec-Failure.)
- **Down-Sampling großer Bilder vor Satori-Render** — nur falls 6×3MB-Test failt.
- **Editier-UI im Modal** (Reorder, per-Image-Fit-Toggle).
- **Pro-Eintrag-Grid-Cols Override im Export-Modal**.
- **Balance-Pass für hasGrid-Pfad** — akzeptiert eventuelle Single-Paragraph-Last-Slide in v1.

---

## Migration / Rollout

- Keine DB-Migration (`images_grid_columns` Spalte existiert bereits seit PR #103/#105/#108-Zeit).
- Keine Feature-Flag — Toggle ist `imageCount > 0` im Modal.
- Reihenfolge:
  1. PR #128 mergen
  2. Diesen Branch auf main rebasen
  3. Implementieren gemäß `tasks/todo.md` Reihenfolge
  4. Staging-Smoke (DK-11/12/13)
  5. Codex-Review (R1)
  6. Prod-Merge nach grünem Codex + post-merge Verifikation

### Legacy-Image-Backward-Compat (Codex R1 #4 Resolution)

`agenda_items.images[i].orientation` wurde mit PR #103 als required eingeführt. Items aus pre-PR-#103-Zeit können orientation-less sein. Codex R1 #4 flaggte den Drift wenn Export sie skipped während Website sie rendert.

**Resolution: defensive Fallback in `resolveImages` (siehe oben)**:
- `countAvailableImages` zählt sie wie immer (nur public_id-Check) → Modal zeigt korrekten Cap.
- `resolveImages` defaultet missing orientation auf `"landscape"` (mirror AgendaItem.tsx:191) → Grid rendert sie als landscape-Bilder.
- Public-Site-Anzeige unverändert: `AgendaItem.tsx` behandelt missing orientation seit jeher mit `?? "landscape"`.
- **Visual-Consequenz**: ein legacy-portrait-Logo wird im Export als landscape-cropped Cell (2:3) gerendert — gleiches Verhalten wie auf der Website. Admin kann das beheben durch Edit + neuen Save (orientation kommt durch validateImages dazu).
- **Kein Pre-merge DB-Audit nötig** — robust gegen unbekannte DB-Qualität.
