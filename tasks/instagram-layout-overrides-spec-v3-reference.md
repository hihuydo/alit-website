# Spec: Instagram Layout Overrides — Block-Level Manual Slide Distribution
<!-- Created: 2026-04-28 -->
<!-- Author: Planner (Opus) -->
<!-- Status: Draft v3 (Sonnet R2 review: 3 Critical + 5 Major fixed; Block-ID-Stabilität + sanitizer + CAS jetzt korrekt) -->
<!-- Branch: feat/instagram-layout-overrides -->
<!-- Depends on: PR #129 (feat/instagram-grid-slide) merged to main -->
<!-- Source: tasks/instagram-layout-overrides-plan.md (Codex) -->
<!-- Reviews: tasks/qa-report.md → v1 SPLIT, v2 NEEDS WORK; v3 = final response -->

## Summary

Redakteur:innen können im Instagram-Export-Modal die automatisch berechnete Slide-Verteilung **block-weise** überschreiben — Text auf die nächste Slide schieben, von späterer Slide zurückholen, Slide-Bruch ab Block X erzwingen, oder zurück zu Auto-Layout.

Auto-Split bleibt der **Default**. Manuelle Eingriffe sind ein **persistierter Override** auf `agenda_items.instagram_layout_i18n` (per-locale + per-imageCount), keine Ersatzarchitektur.

**Was NICHT in Scope ist:**
- Drag-and-drop (Buttons sind testbarer + reichen für Workflow)
- Pixelgenauer Canvas-Editor
- Freie Textbearbeitung im Export-Modal (Body bleibt RichText-driven)
- Font-size Slider, per-Slide manuelles Padding/Spacing
- Override-Editing für Hashtags, Title, Lead, Header-Meta — nur Body-Block-Verteilung
- Override für Grid-Slide selbst — Slide 1 bleibt grid wenn `imageCount ≥ 1`
- Migration alter Layout-Hashes — neuer Hash-Algo startet leer
- Backfill von Block-IDs für Bestands-Einträge: lazy on first edit (siehe DK-3)

---

## Sprint Contract (Done-Kriterien)

1. **DB-Migration ausgerollt**: `agenda_items.instagram_layout_i18n JSONB NULL` via `ensureSchema()` `ADD COLUMN IF NOT EXISTS`. Bestehende Reihen bleiben `NULL`. Idempotent. Shared-DB-safe (siehe `patterns/deployment-staging.md`).
2. **Pure Resolver `resolveInstagramSlides(item, locale, imageCount)`** in `src/lib/instagram-post.ts`:
   - Kein Override → Auto-Layout (= existierendes `splitAgendaIntoSlides`).
   - Override mit passendem `contentHash` + alle Block-IDs auflösbar → manuelles Layout.
   - Override mit veraltetem `contentHash` → Auto-Layout + warning `layout_stale`.
   - Override mit unbekannten Block-IDs ODER nicht referenzierten aktuellen Blocks → stale.
3. **Block-ID-Stabilität (3-Layer Round-Trip)**: IDs überleben den vollständigen Editor-Round-Trip:
   - **Layer 1 — `journal-html-converter.ts`**: `blocksToHtml(block)` emittiert pro Block `data-bid="<id>"`. `htmlToBlocks(html)` liest `data-bid` per Element via `readBidOrGenerate(el)`, fällt auf `id()` zurück nur wenn Attribut fehlt oder nicht zum Format `/^b[0-9a-z]+-[0-9a-z]+$/` passt.
   - **Layer 2 — `RichTextEditor.tsx::sanitizeHtml`** (Sonnet R2 NEW FAIL #1): per-tag attribute allowlists werden um `data-bid` erweitert für ALLE block-tags die `htmlToBlocks` als Block-Quelle nutzt: `p`, `h2`, `h3`, `blockquote`, `figure`. Single-Line-Edit:
     ```ts
     if (["p","h2","h3","blockquote","figure"].includes(tag) && attr.name === "data-bid") continue;
     ```
   - **Layer 3 — `journal-validation.ts::validateBlock`**: bleibt unverändert (akzeptiert beliebige `block.id` strings — `b<ts>-<n>` Format passt). Note: future hardening to UUID-format would break overrides; documentation in spec für Zukunft.
   - **Backfill**: keine eager-Migration. Bestands-Einträge bekommen IDs lazy on first edit (Editor lädt → htmlToBlocks generiert → User speichert → IDs persistieren). Bis dahin Modal-Tab disabled.
   - **Tests**: 3-Layer-Round-Trip-Test invokes the FULL pipeline: `blocksToHtml(blocks) → set as innerHTML → sanitizeHtml(innerHTML) → htmlToBlocks(sanitized) → IDs preserved` über N=5 Zyklen.
4. **Stable Export-Block-IDs** in `flattenContentWithIds(content)` (Sonnet R2 NEW FAIL #3 vollständig spec):
   - **Signature**: `function flattenContentWithIds(content: JournalContent | null): ExportBlock[]` (single arg, no opts).
   - **Output Type**: `type ExportBlock = SlideBlock & { id: string; sourceBlockId: string; }` — `id` ist `block:<journalBlockId>`, `sourceBlockId` ist der raw `block.id` ohne Prefix.
   - **Filter-Behavior**: identisch zu existierendem `flattenContent` — strippt `image|video|embed|spacer` Blocks (nicht-text), strippt empty/whitespace-only Text-Blocks. Override referenziert NUR Blocks die `flattenContent` zurückgeben würde.
   - **Beziehung zu `flattenContent`**: `flattenContent` bleibt unverändert + wird vom Auto-Path (`splitAgendaIntoSlides`) weiter benutzt. `flattenContentWithIds` ist NEUE Funktion die NUR vom Resolver-Path (`resolveInstagramSlides` für Stale-Detection und `buildManualSlides` für Block-Lookup) genutzt wird. Auto-Path bleibt bit-identisch (DK-12).
   - **`splitOversizedBlock` Position**: passiert NICHT in `flattenContentWithIds`. Auto-path: in `splitAgendaIntoSlides`. Manual-path: inline in `buildManualSlides`. Damit produziert `flattenContentWithIds` 1:1 Original-Block-IDs ohne Segmentierung.
   - **Empty-Block-Edge**: empty paragraph `{id: "x", type: "paragraph", content: [{text: ""}]}` wird gefiltert (text.trim().length === 0). Nicht in exportBlocks → nicht in `allCurrentBlocks` Set → muss nicht in Override sein. Konsistent.
5. **Content Hash** über deterministisch sortierte Inputs mit DE-Fallback (Sonnet R2 NEW FAIL #9):
   - SHA-256 hex, 16-char Prefix.
   - **Deterministisches `JSON.stringify`** via Recursive-Walker `stableStringify(value)` der Object-Keys vor `JSON.stringify` rekursiv sortiert.
   - **Image-Normalisierung**: `images` gefiltert (`Array.isArray + i.public_id is string`), only `public_id` extracted, in attached-order beibehalten. `null`/`[]`/`undefined` alle → `[]`.
   - **Content-Normalisierung**: `null` und `[]` gleich behandelt (Hash = `[]`). Block-IDs werden BEIM HASHEN entfernt (`b.id` weg) — Hash robust gegen ID-Regenerierung in Bestand-Code-Pfaden.
   - **`gridColumns` Floor + Default**: `Math.max(1, Math.floor(item.images_grid_columns ?? 1))` — gleiche Logik wie Auto-Resolver.
   - **DE-Fallback für fallback-Felder** (NEW FAIL #9): `lead`, `ort`, `hashtags` werden mit `resolveWithDeFallback`/`resolveHashtags` resolved BEVOR sie in den Hash gehen — **mirror der Renderer-Resolution**. Andernfalls: FR-Override-Hash sieht leere FR-lead, Renderer rendert DE-lead → silent stale-miss bei DE-lead-Edit. Title bleibt locale-only (kein DE-Fallback im Renderer).
6. **API: 3 neue Endpoints** unter `/api/dashboard/agenda/[id]/instagram-layout`:
   - `GET ?locale=de&images=N` → `{success, mode: "auto"|"manual"|"stale", contentHash, layoutVersion, imageCount, slides[]}`
   - `PUT` body `{locale, imageCount, contentHash, layoutVersion, slides[]}` → 200 / 400 / 404 / 409 / 412 / 422 (siehe Validierung)
   - `DELETE ?locale=de&images=N` → 204 (idempotent)
   - Alle 3: `requireAuth(req)` (CSRF wird intern für PUT/DELETE durch `STATE_CHANGING_METHODS` erzwungen — KEIN `requireAuthAndCsrf`).
   - **Audit-Log** (Sonnet R2 NEW FAIL #12): PUT schreibt `auditLog("agenda_layout_update", {agenda_id, locale, image_count, slide_count, actor_email, ip})`. DELETE schreibt `auditLog("agenda_layout_reset", {agenda_id, locale, image_count, actor_email, ip})`. Forensic-Trail für Multi-Admin-Konflikte.
   - **Multi-Admin-Race CAS** (Sonnet R2 NEW FAIL #11 — concrete SQL): Optimistic-Concurrency via **Postgres-side `md5()`** (built-in, kein Extension). Client sendet `layoutVersion` (16-char sha256-prefix), Server berechnet `md5(coalesce(...)::text)` der CURRENT-row JSON inside des UPDATE-WHERE. Match-Comparison: server hashed both with same algo. Concrete SQL (siehe Architektur §API-Routen). Wenn `rowsAffected = 0` → 412 + Modal "Anderer Admin hat Layout geändert".
7. **Bestehende Routen verwenden Resolver**:
   - `GET /api/dashboard/agenda/[id]/instagram` (metadata): SELECT um `instagram_layout_i18n` erweitern, `slideCount` aus Resolver, warnings extended um `layout_stale`. Response-Shape um `layoutMode: "auto"|"manual"|"stale"` Field erweitert.
   - `GET /api/dashboard/agenda/[id]/instagram-slide/[slideIdx]` (PNG): SELECT erweitert, Resolver entscheidet welche Blocks pro Slide. Grid-Slide-Logic unverändert.
   - **DK-12 Scope-Klarstellung**: Bit-Identität gilt für `splitAgendaIntoSlides`'s Pure-Output (Slide[] + warnings[]). HTTP-Response der Metadata-Route ist NICHT bit-identisch (neues Feld `layoutMode`). Bestehende Snapshot-Tests müssen angepasst werden.
8. **Modal Layout-Modus**: `InstagramExportModal` bekommt Tab-Switch `Vorschau | Layout anpassen`.
   - **Tab-disabled** wenn nicht alle current Body-Blocks IDs haben (DK-3 Backfill noch nicht erfolgt). Tooltip: "Eintrag erst speichern um Layout-Anpassung zu aktivieren".
   - Layout-Modus zeigt Slides als Listen von Block-Cards (Text-Excerpt 100 chars, Heading-Marker, Block-ID hidden).
   - Pro Block: `← Vorherige Slide`, `Nächste Slide →`, `Neue Slide ab hier`.
   - Footer: `Speichern` (PUT), `Auto-Layout zurücksetzen` (DELETE), `Abbrechen`.
   - Stale-Banner amber wenn `mode === "stale"` mit `Automatisch neu verteilen` Action.
   - **GET via `dashboardFetch`** (Sonnet R2 NEW FAIL #4): NICHT raw `fetch` — auch GET soll 401-redirect handlen. Plus error-state für non-2xx (404 locale_empty, 500, network) → Modal zeigt error-banner statt blindly accessing `data.slides`.
   - **Dirty-Detect via Snapshot-Diff** (Sonnet R2 NEW FAIL #5/#6 — nicht touched-flag): `initialEditedSlidesSnapshot = stableStringify(slides)` nach GET. `isDirty = stableStringify(currentEditedSlides) !== initialEditedSlidesSnapshot`. Reverts-to-original sind NICHT dirty. Pattern: `patterns/admin-ui.md` § Dirty-Editor-Cluster.
   - **In-Modal Confirm-Dialog** (Sonnet R2 NEW FAIL #5/#6 — nicht `window.confirm`): Bei dirty-leave-attempt zeigt Layout-Editor einen In-Modal-Confirm-Bereich (nicht `window.confirm` — bricht in iOS Safari + jsdom-Tests). Pattern: existierendes `Modal` component + state-flag `confirmDiscardOpen`. UX wie MediaPicker dirty-guard PR #84.
   - **Tab-switch / imageCount / locale guards** (Sonnet R2 NEW FAIL #7/#8): Wrapping handlers in InstagramExportModal:
     ```ts
     const guardedSetMode = (next) => isDirty ? setConfirmDiscardOpen({onConfirm: () => setMode(next)}) : setMode(next);
     const guardedSetImageCount = (n) => mode === "layout" && isDirty ? setConfirmDiscardOpen({onConfirm: () => setImageCount(n)}) : setImageCount(n);
     const guardedSetLocale = (l) => mode === "layout" && isDirty ? setConfirmDiscardOpen({onConfirm: () => setLocale(l)}) : setLocale(l);
     ```
   - **Reset re-trigger fix** (Sonnet R2 NEW FAIL #7): `handleReset` → DELETE → increment `refetchKey` state (in useEffect deps). Statt `setMode("preview");setMode("layout")` (React batched, breaks):
     ```ts
     const [refetchKey, setRefetchKey] = useState(0);
     useEffect([mode, item.id, locale, imageCount, refetchKey], () => { /* GET */ });
     const handleReset = async () => {
       await dashboardFetch(..., {method:"DELETE"});
       setRefetchKey((k) => k + 1);  // forces useEffect re-fire even if deps else identical
       setCacheBust(String(Date.now()));
     };
     ```
   - Save-Success: `cacheBust` neu setzen → Preview-PNGs neu fetchen, Tab wechselt zurück zu "Vorschau". Stale-Reset (DELETE) hält in Layout-Tab mit fresh Auto-Layout.
9. **Tests grün** — Vitest + tsc clean. **Baseline 806 → ~840+ nach Sprint** (~34 neue Tests, siehe Test-Sektion).
10. **Manueller Smoke auf Staging** (DK-12/13/14/15):
    - **DK-12** Override speichern + Reload → Layout persistiert, mode="manual" sichtbar
    - **DK-13** Body-Edit nach Override → Modal zeigt Stale-Banner
    - **DK-14** Reset auf Auto → DELETE fired, JSONB-key entfernt
    - **DK-15** Grid-Pfad mit `imageCount=2` + Override → Grid bleibt Slide 1, Override wirkt nur auf Slides 2+
11. **Codex PR-Review** nach Staging-Smoke — in-scope Findings (Contract/Security/Correctness) gefixt.
12. **Backward-compat Kontrakt**: Wenn Resolver kein Override findet (NULL row), Output von `splitAgendaIntoSlides` ist **bit-identisch** zum aktuellen Behavior — keine Verhaltensänderung für Einträge ohne manuelles Layout. (Pure-Helper-Output, nicht HTTP-Response — siehe DK-7.)
13. **Stale-UI/Code-Reste-Grep** (Sonnet R2 NEW FAIL #14 — corrected paths): `rg -n 'splitAgendaIntoSlides\(' 'src/app/api/dashboard/agenda' --type ts --type tsx | grep -v '\.test\.' | grep -v '//'` zeigt **0 Hits** (alle direkten Aufrufe wurden auf `resolveInstagramSlides` umgestellt, Test-Files + Comments excluded).

---

## Architektur

### DK-3: Block-ID-Stabilität (3-Layer Round-Trip)

#### Layer 1 — `journal-html-converter.ts`

```ts
// VORHER:
export function blocksToHtml(blocks: JournalContent): string {
  return blocks.map((block) => {
    switch (block.type) {
      case "paragraph":
        return `<p>${textNodesToHtml(block.content)}</p>`;       // ← keine ID
      // ...
    }
  });
}

// NACHHER:
function bidAttr(id: string | undefined): string {
  return id ? ` data-bid="${escapeAttr(id)}"` : "";
}

export function blocksToHtml(blocks: JournalContent): string {
  return blocks.map((block) => {
    const bid = bidAttr(block.id);
    switch (block.type) {
      case "paragraph":
        return `<p${bid}>${textNodesToHtml(block.content)}</p>`;
      case "heading":
        return `<h${block.level}${bid}>${textNodesToHtml(block.content)}</h${block.level}>`;
      case "quote": {
        const attrAttr = block.attribution
          ? ` data-attribution="${escapeAttr(block.attribution)}"`
          : "";
        return `<blockquote${bid}${attrAttr}><p>${textNodesToHtml(block.content)}</p></blockquote>`;
      }
      case "highlight":
        return `<p${bid} data-block="highlight">${textNodesToHtml(block.content)}</p>`;
      case "caption":
        return `<p${bid} data-block="caption">${textNodesToHtml(block.content)}</p>`;
      case "image":
      case "video":
      case "embed":
      case "spacer":
        // Non-text blocks: bleiben non-overridable, aber data-bid für Konsistenz wenn id da ist.
        return /* existing markup */;
    }
  });
}

// htmlToBlocks: jeder Block-Build verwendet readBidOrGenerate(el):
function readBidOrGenerate(el: Element): string {
  const bid = el.getAttribute("data-bid");
  if (bid && /^b[0-9a-z]+-[0-9a-z]+$/.test(bid)) return bid;  // strict format check
  return id();  // fallback for legacy HTML or invalid format
}
```

#### Layer 2 — `RichTextEditor.tsx::sanitizeHtml` (Sonnet R2 NEW FAIL #1)

```ts
// Existing line 75 + 76: extend with data-bid
for (const attr of Array.from(el.attributes)) {
  // ... existing tag-specific allowlists ...
  if (tag === "p" && ["data-block", "data-size"].includes(attr.name)) continue;
  if (tag === "blockquote" && attr.name === "data-attribution") continue;
  if (tag === "figure" && ["data-width", "data-media"].includes(attr.name)) continue;
  // NEU: data-bid für ALLE block-tags
  if (["p", "h2", "h3", "blockquote", "figure"].includes(tag) && attr.name === "data-bid") continue;
  el.removeAttribute(attr.name);
}
```

#### 3-Layer Round-Trip Tests (DK-3)

```ts
// src/app/dashboard/components/journal-html-converter.test.ts
it("3-layer round-trip preserves block IDs through editor sanitizer", () => {
  const original: JournalContent = [
    { id: "stable-id-1", type: "paragraph", content: [{ text: "x" }] },
    { id: "stable-id-2", type: "heading", level: 2, content: [{ text: "y" }] },
    { id: "stable-id-3", type: "blockquote", content: [{ text: "z" }] },
    { id: "stable-id-4", type: "highlight", content: [{ text: "w" }] },
    { id: "stable-id-5", type: "caption", content: [{ text: "v" }] },
  ];
  let blocks = original;
  for (let i = 0; i < 5; i++) {
    const html = blocksToHtml(blocks);
    const sanitized = sanitizeHtml(html);  // ← simulates contentEditable + emitChange()
    blocks = htmlToBlocks(sanitized);
  }
  expect(blocks.map((b) => b.id)).toEqual(original.map((b) => b.id));
});

it("legacy HTML without data-bid generates fresh IDs (one-time backfill)", () => {
  const legacyHtml = "<p>old paragraph</p><h2>old heading</h2>";
  const sanitized = sanitizeHtml(legacyHtml);
  const blocks = htmlToBlocks(sanitized);
  blocks.forEach((b) => expect(b.id).toMatch(/^b[0-9a-z]+-[0-9a-z]+$/));
});

it("invalid data-bid format gets re-generated", () => {
  const malformedHtml = '<p data-bid="not-our-format">x</p>';
  const sanitized = sanitizeHtml(malformedHtml);
  const blocks = htmlToBlocks(sanitized);
  expect(blocks[0].id).not.toBe("not-our-format");
  expect(blocks[0].id).toMatch(/^b[0-9a-z]+-[0-9a-z]+$/);
});
```

### DB-Schema-Erweiterung

```sql
-- src/lib/schema.ts in ensureSchema():
ALTER TABLE agenda_items
  ADD COLUMN IF NOT EXISTS instagram_layout_i18n JSONB NULL;
```

Idempotent. Kein DEFAULT (NULL = "kein Override gesetzt"). Shared-DB-safe.

### Override-Shape (JSONB) — 3-Level

```ts
type InstagramLayoutOverrides = {
  de?: PerImageCountOverrides | null;
  fr?: PerImageCountOverrides | null;
};

type PerImageCountOverrides = {
  [imageCountStr: string]: InstagramLayoutOverride | null;
};

type InstagramLayoutOverride = {
  contentHash: string;
  layoutVersion: string;            // optimistic concurrency token
  slides: InstagramLayoutSlide[];
};

type InstagramLayoutSlide = {
  blocks: string[];
};
```

**Slide-Index-Konvention**:
- **Grid-Pfad** (`imageCount ≥ 1`): `override.slides[0]` ist die **erste TEXT-Slide** (= logische Slide 2 mit Lead-Prefix). Override-Length entspricht `slides.length - 1` der Resolver-Output.
- **No-Grid-Pfad** (`imageCount = 0`): `override.slides[0]` ist die **logische Slide 1**. Override-Length entspricht `slides.length` der Resolver-Output 1:1.

### `flattenContentWithIds` Vollspezifikation (Sonnet R2 NEW FAIL #3)

```ts
// src/lib/instagram-post.ts

export type ExportBlock = SlideBlock & {
  id: string;                     // "block:<journalBlockId>"
  sourceBlockId: string;          // raw journal block.id ohne prefix
};

/** Same content-shape filtering as flattenContent, but preserves block-IDs
 *  for override-referencing. Auto-path keeps using flattenContent (no IDs).
 *  Manual-path uses this helper exclusively. */
export function flattenContentWithIds(
  content: JournalContent | null | undefined,
): ExportBlock[] {
  if (!content || !Array.isArray(content)) return [];
  const out: ExportBlock[] = [];
  for (const block of content) {
    // Skip blocks without a stable ID — Backfill state, Modal-Tab disabled
    // for these items, never flows into the resolver.
    if (typeof block.id !== "string" || block.id.length === 0) continue;
    switch (block.type) {
      case "paragraph":
      case "quote":
      case "highlight": {
        const text = block.content.map((n) => n.text).join("");
        if (text.trim().length === 0) break;
        out.push({
          id: `block:${block.id}`,
          sourceBlockId: block.id,
          text,
          weight: 400,
          isHeading: false,
        });
        break;
      }
      case "heading": {
        const text = block.content.map((n) => n.text).join("");
        if (text.trim().length === 0) break;
        out.push({
          id: `block:${block.id}`,
          sourceBlockId: block.id,
          text,
          weight: 800,
          isHeading: true,
        });
        break;
      }
      case "caption": {
        const text = block.content.map((n) => n.text).join("");
        if (text.trim().length === 0) break;
        out.push({
          id: `block:${block.id}`,
          sourceBlockId: block.id,
          text,
          weight: 300,
          isHeading: false,
        });
        break;
      }
      // image / video / embed / spacer → stripped (mirror flattenContent)
    }
  }
  return out;
}
```

### `buildManualSlides` Vollspezifikation

```ts
function buildManualSlides(
  item: AgendaItemForExport,
  locale: Locale,
  imageCount: number,
  override: InstagramLayoutOverride,
  exportBlocks: ExportBlock[],
  meta: SlideMeta,
  hasGrid: boolean,
  gridImages: GridImage[],
  gridColumns: number,
): Slide[] {
  const blockById = new Map(exportBlocks.map((b) => [b.id, b]));
  const rawSlides: Array<Omit<Slide, "index" | "isFirst" | "isLast" | "meta">> = [];

  // Grid-Slide vorangestellt (NICHT aus Override)
  if (hasGrid) {
    rawSlides.push({ kind: "grid", blocks: [], gridColumns, gridImages });
  }

  override.slides.forEach((overrideSlide, idx) => {
    const slideBlocks: SlideBlock[] = [];
    for (const blockId of overrideSlide.blocks) {
      const exportBlock = blockById.get(blockId);
      if (!exportBlock) continue;  // defensive — should be unreachable post-stale-check
      const slideBudget = (idx === 0 && hasGrid)
        ? Math.max(SLIDE_BUDGET - leadHeightPx(meta.lead), 200)
        : SLIDE_BUDGET;
      slideBlocks.push(...splitOversizedBlock(exportBlock, slideBudget));
    }
    rawSlides.push({
      kind: "text",
      blocks: slideBlocks,
      leadOnSlide: idx === 0 && hasGrid && Boolean(meta.lead),
    });
  });

  // SLIDE_HARD_CAP (10) — defensive clamp; PUT validation should reject earlier
  const clamped = rawSlides.slice(0, SLIDE_HARD_CAP);
  const total = clamped.length;
  return clamped.map((s, i) => ({
    index: i, isFirst: i === 0, isLast: i === total - 1,
    kind: s.kind, blocks: s.blocks, leadOnSlide: s.leadOnSlide,
    gridColumns: s.gridColumns, gridImages: s.gridImages, meta,
  }));
}
```

### Pure Resolver

```ts
export type ResolverResult = {
  slides: Slide[];
  warnings: string[];
  mode: "auto" | "manual" | "stale";
  contentHash: string;
  layoutVersion: string | null;
};

export function resolveInstagramSlides(
  item: AgendaItemForExport,
  locale: Locale,
  imageCount: number,
  override?: InstagramLayoutOverride | null,
): ResolverResult {
  const exportBlocks = flattenContentWithIds(item.content_i18n?.[locale] ?? null);
  const contentHash = computeLayoutHash({ item, locale, imageCount });
  const autoResult = splitAgendaIntoSlides(item, locale, imageCount);

  if (!override) {
    return { ...autoResult, mode: "auto", contentHash, layoutVersion: null };
  }

  if (override.contentHash !== contentHash) {
    return {
      ...autoResult,
      warnings: [...autoResult.warnings, "layout_stale"],
      mode: "stale", contentHash,
      layoutVersion: override.layoutVersion,
    };
  }

  const allOverrideBlocks = new Set(override.slides.flatMap((s) => s.blocks));
  const allCurrentBlocks = new Set(exportBlocks.map((b) => b.id));
  const unknownInOverride = [...allOverrideBlocks].some((id) => !allCurrentBlocks.has(id));
  const unreferencedCurrent = [...allCurrentBlocks].some((id) => !allOverrideBlocks.has(id));

  if (unknownInOverride || unreferencedCurrent) {
    return {
      ...autoResult,
      warnings: [...autoResult.warnings, "layout_stale"],
      mode: "stale", contentHash,
      layoutVersion: override.layoutVersion,
    };
  }

  // Manual path
  const hasGrid = imageCount >= 1 && Array.isArray(item.images) && (item.images as unknown[]).length > 0;
  const gridImages = hasGrid ? resolveImages(item, imageCount) : [];
  const gridColumns = normalizeGridColumns(item.images_grid_columns);
  const meta = autoResult.slides[0]?.meta ?? buildSlideMeta(item, locale);
  const manualSlides = buildManualSlides(item, locale, imageCount, override, exportBlocks, meta, hasGrid, gridImages, gridColumns);

  return {
    slides: manualSlides,
    warnings: autoResult.warnings.filter((w) => w !== "too_long"),
    mode: "manual", contentHash,
    layoutVersion: override.layoutVersion,
  };
}
```

**Empty body / 0 slides handling**:
- exportBlocks = [] AND override.slides = [] → mode="manual", slides = [grid only if hasGrid]
- exportBlocks = [] AND override.slides has entries → unreferencedCurrent triggered → stale
- isLocaleEmpty (existing) → Resolver throwt 'locale_empty' (mirror existing)
- GET /instagram-layout returns 404 + error:"locale_empty" wenn isLocaleEmpty.

### Content Hash with DE-Fallback (Sonnet R2 NEW FAIL #9)

```ts
import { createHash } from "node:crypto";

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(",")}}`;
}

function normalizeContentForHash(content: JournalContent | null): unknown {
  if (!content) return [];
  return content.map((block) => {
    const { id: _id, ...rest } = block as JournalBlock & { id?: string };
    return rest;
  });
}

function normalizeImagesForHash(images: unknown): string[] {
  if (!Array.isArray(images)) return [];
  return images
    .filter((i): i is { public_id: string } =>
      typeof i === "object" && i !== null && typeof (i as { public_id?: unknown }).public_id === "string")
    .map((i) => i.public_id);
}

function normalizeGridColumns(raw: number | null | undefined): number {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 1) return 1;
  return Math.floor(raw);
}

export function computeLayoutHash(opts: {
  item: AgendaItemForExport;
  locale: Locale;
  imageCount: number;
}): string {
  const { item, locale, imageCount } = opts;
  // Mirror renderer-resolution: use resolveWithDeFallback for fallback fields.
  const lead = resolveWithDeFallback(item.lead_i18n, locale);
  const ort = resolveWithDeFallback(item.ort_i18n, locale);
  const hashtags = resolveHashtags(item, locale);  // already DE-fallback inside

  const payload = {
    title: item.title_i18n?.[locale] ?? "",  // Title: locale-only, no fallback (mirror renderer)
    lead: lead ?? "",
    ort: ort ?? "",
    content: normalizeContentForHash(item.content_i18n?.[locale] ?? null),
    hashtags,
    imagePublicIds: normalizeImagesForHash(item.images),
    gridColumns: normalizeGridColumns(item.images_grid_columns),
    imageCount,
  };
  return createHash("sha256").update(stableStringify(payload)).digest("hex").slice(0, 16);
}
```

### API-Routen — `/api/dashboard/agenda/[id]/instagram-layout/route.ts`

```ts
export async function GET(req, { params }) {
  // requireAuth
  // SELECT ... + instagram_layout_i18n FROM agenda_items WHERE id = $1
  // 404 not_found wenn 0 rows
  // 404 locale_empty wenn isLocaleEmpty(item, locale)
  // override = item.instagram_layout_i18n?.[locale]?.[String(imageCount)] ?? null
  // result = resolveInstagramSlides(item, locale, imageCount, override)
  // → return {
  //     success: true,
  //     mode: result.mode,
  //     contentHash: result.contentHash,
  //     layoutVersion: result.layoutVersion,
  //     imageCount,
  //     slides: result.slides
  //       .filter((s) => s.kind === "text")  // grid slide nicht für override-editing
  //       .map((s, i) => ({
  //         index: i,
  //         blocks: s.blocks.map((b) => ({
  //           id: b.id,         // Note: SlideBlock hat keine id; ExportBlock hat eine.
  //                              // GET muss ExportBlock-formattierte slides zurückgeben.
  //           text: b.text, isHeading: b.isHeading,
  //         })),
  //       })),
  //   }
}

export async function PUT(req, { params }) {
  // requireAuth → CSRF auto
  // body Zod-validate: { locale, imageCount, contentHash, layoutVersion, slides: [{blocks: string[]}] }
  // 
  // Validation order (each fail = early return):
  // 1. 400: body Zod schema fail OR imageCount < 0 OR > MAX_IMAGES
  // 2. 400: slides.length === 0 → empty_layout
  // 3. 400: slides.length > SLIDE_HARD_CAP (10) → too_many_slides
  // 4. SELECT row → 404 not_found wenn 0
  // 5. 404: isLocaleEmpty(item, locale) → locale_empty
  // 6. compute serverHash; 409: serverHash !== body.contentHash → content_changed
  // 7. exportBlocks = flattenContentWithIds(item.content_i18n[locale])
  //    requestedBlocks = new Set(body.slides.flatMap((s) => s.blocks))
  //    a. 422: requestedBlocks duplicate (Set.size < array.length) → duplicate_block
  //    b. 422: requestedBlocks has id ∉ exportBlocks → unknown_block
  //    c. 422: exportBlocks has id ∉ requestedBlocks → incomplete_layout
  // 8. ATOMIC UPDATE per md5-CAS (siehe SQL unten)
  //    412: rowsAffected === 0 → layout_modified_by_other
  //
  // 9. compute newLayoutVersion = computeLayoutVersion(savedOverride)
  // 10. auditLog("agenda_layout_update", {agenda_id, locale, image_count, slide_count, actor_email, ip})
  // 11. → 200 { success: true, layoutVersion: newLayoutVersion }
}

export async function DELETE(req, { params }) {
  // requireAuth → CSRF auto
  // ?locale=de&images=N
  // ATOMIC UPDATE: remove key + collapse leeres locale-object zu null (2-Phase, siehe SQL)
  // auditLog("agenda_layout_reset", {agenda_id, locale, image_count, actor_email, ip})
  // → 204
}
```

### CAS-SQL — Postgres `md5()` (Sonnet R2 NEW FAIL #11)

```sql
-- PUT (atomic UPDATE with md5-based optimistic concurrency):
WITH updated AS (
  UPDATE agenda_items
     SET instagram_layout_i18n = jsonb_set(
       COALESCE(instagram_layout_i18n, '{}'::jsonb),
       ARRAY[$2::text, $3::text],         -- ['de', '2']
       $4::jsonb,                          -- new override
       true                                -- create_if_missing (explicit)
     )
   WHERE id = $1
     AND COALESCE(
       substring(md5((instagram_layout_i18n -> $2 -> $3)::text) FROM 1 FOR 16),
       'null-layout'                       -- sentinel for missing override
     ) = $5                                -- $5 = client's layoutVersion (or 'null-layout' for first-save)
  RETURNING instagram_layout_i18n;
)
SELECT instagram_layout_i18n FROM updated;
```

**App-side**:
- Before UPDATE: client's `layoutVersion` = result of GET-time hash (16-char md5-prefix of `(override JSONB)::text` per server).
- For first-PUT (no prior override): client sends sentinel `"null-layout"`.
- Server-Hash (`computeLayoutVersion`) MUST match Postgres `substring(md5(jsonb::text) FROM 1 FOR 16)`. Concrete impl:
  ```ts
  // computeLayoutVersion in app code: matches substring(md5(jsonb::text), 1, 16)
  function computeLayoutVersion(override: InstagramLayoutOverride): string {
    return createHash("md5").update(stableStringify(override)).digest("hex").slice(0, 16);
  }
  ```
- **Risk**: stableStringify (sorted keys) vs Postgres `jsonb::text` (Postgres-internal-order). These DIVERGE. **Solution**: server normalizes via `jsonb_strip_nulls(...)` + Postgres jsonb keys ARE sorted alphabetically by Postgres internally upon serialization to text → comparing match should work. **Verifikation in DK-3 erforderlich** via test:
  ```sql
  SELECT substring(md5('{"b":2,"a":1}'::jsonb::text) FROM 1 FOR 16);  -- = ?
  -- vs app: createHash('md5').update(stableStringify({b:2,a:1})).digest('hex').slice(0,16)
  -- Beide MÜSSEN gleich sein. Wenn nicht: server muss Postgres-Stringification mirror.
  ```
- **Falls divergent**: Switch to App-Side-CAS — server SELECTs current row INSIDE transaction → compares with client's layoutVersion in app code → if match: UPDATE, else 412. SELECT...FOR UPDATE für transaction-isolation. Pattern: `patterns/database.md` "Deterministic Lock-Order FOR UPDATE".

```sql
-- DELETE (2-phase: unset key + collapse to NULL):
-- Phase 1: remove the per-imageCount key
UPDATE agenda_items
   SET instagram_layout_i18n = instagram_layout_i18n #- ARRAY[$2::text, $3::text]
 WHERE id = $1
   AND instagram_layout_i18n IS NOT NULL;

-- Phase 2: collapse to NULL if all locale-objects became empty/null
UPDATE agenda_items
   SET instagram_layout_i18n = NULL
 WHERE id = $1
   AND instagram_layout_i18n IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM jsonb_each(instagram_layout_i18n) AS kv
     WHERE kv.value IS NOT NULL
       AND kv.value <> 'null'::jsonb
       AND kv.value <> '{}'::jsonb
   );
```

### Bestehende Routen-Updates

```ts
// src/app/api/dashboard/agenda/[id]/instagram/route.ts (metadata) — added field:
return NextResponse.json({
  success: true, slideCount: result.slides.length, availableImages,
  imageCount, warnings: result.warnings,
  layoutMode: result.mode,            // NEU
});

// src/app/api/dashboard/agenda/[id]/instagram-slide/[slideIdx]/route.tsx (PNG):
// Same SELECT + resolveInstagramSlides → slides[numSlideIdx] für ImageResponse.
```

### Modal Layout-Mode (komplett überarbeitet, Sonnet R2 NEW FAILs #4-#8)

```tsx
// src/app/dashboard/components/InstagramExportModal.tsx
import { dashboardFetch } from "../lib/dashboardFetch";
import { stableStringify } from "@/lib/stable-stringify";  // shared helper

const [mode, setMode] = useState<"preview" | "layout">("preview");
const [editedSlides, setEditedSlides] = useState<EditableSlide[] | null>(null);
const [initialSnapshot, setInitialSnapshot] = useState<string | null>(null);
const [layoutVersion, setLayoutVersion] = useState<string | null>(null);
const [layoutContentHash, setLayoutContentHash] = useState<string | null>(null);
const [layoutLoadError, setLayoutLoadError] = useState<string | null>(null);
const [refetchKey, setRefetchKey] = useState(0);
const [confirmDiscardOpen, setConfirmDiscardOpen] = useState<{onConfirm: () => void} | null>(null);

// Tab-availability check
const layoutTabAvailable = useMemo(() => {
  if (!item?.content_i18n?.[locale]) return false;
  const blocks = item.content_i18n[locale];
  if (!Array.isArray(blocks)) return false;
  return blocks.every((b) => typeof b.id === "string" && b.id.length > 0);
}, [item, locale]);

// Snapshot-diff dirty-detect (NEW FAIL #6)
const isDirty = useMemo(() => {
  if (!editedSlides || !initialSnapshot) return false;
  return stableStringify(editedSlides) !== initialSnapshot;
}, [editedSlides, initialSnapshot]);

// GET on tab-open via dashboardFetch (NEW FAIL #4)
useEffect(() => {
  if (mode !== "layout" || !item) return;
  let canceled = false;
  setLayoutLoadError(null);
  dashboardFetch(`/api/dashboard/agenda/${item.id}/instagram-layout?locale=${locale}&images=${imageCount}`)
    .then(async (res) => {
      if (canceled) return;
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setLayoutLoadError(body?.error ?? "load_failed");
        return;
      }
      const data = await res.json();
      setEditedSlides(data.slides);
      setInitialSnapshot(stableStringify(data.slides));
      setLayoutVersion(data.layoutVersion);
      setLayoutContentHash(data.contentHash);
    })
    .catch(() => !canceled && setLayoutLoadError("network_error"));
  return () => { canceled = true; };
}, [mode, item?.id, locale, imageCount, refetchKey]);  // refetchKey forces re-fire

// Guarded handlers (NEW FAILs #7, #8)
const guardedSetMode = useCallback((next: typeof mode) => {
  if (isDirty && next !== mode) {
    setConfirmDiscardOpen({ onConfirm: () => { setMode(next); setEditedSlides(null); setInitialSnapshot(null); }});
  } else {
    setMode(next);
  }
}, [isDirty, mode]);

const guardedSetImageCount = useCallback((n: number) => {
  if (mode === "layout" && isDirty) {
    setConfirmDiscardOpen({ onConfirm: () => { setImageCount(n); /* useEffect refetches */ }});
  } else {
    setImageCount(n);
  }
}, [mode, isDirty]);

const guardedSetLocale = useCallback((l: LocaleChoice) => {
  if (mode === "layout" && isDirty) {
    setConfirmDiscardOpen({ onConfirm: () => { setLocale(l); }});
  } else {
    setLocale(l);
  }
}, [mode, isDirty]);

// Handler bindings (replace existing setMode, setImageCount, setLocale calls):
// - Tab buttons: onClick={() => guardedSetMode("preview" | "layout")}
// - Number-input onChange → guardedSetImageCount
// - Radio onChange → guardedSetLocale
// - Modal onClose → if (isDirty) setConfirmDiscardOpen({onConfirm: onClose}) else onClose()

// Save
const handleSave = async () => {
  if (!item || !editedSlides || !layoutContentHash) return;
  const res = await dashboardFetch(`/api/dashboard/agenda/${item.id}/instagram-layout`, {
    method: "PUT",
    body: JSON.stringify({
      locale, imageCount, contentHash: layoutContentHash, layoutVersion,
      slides: editedSlides.map((s) => ({ blocks: s.blocks.map((b) => b.id) })),
    }),
  });
  if (res.status === 412) { setLayoutLoadError("layout_modified_by_other"); return; }
  if (res.status === 409) { setLayoutLoadError("content_changed"); return; }
  if (!res.ok) { setLayoutLoadError("save_failed"); return; }
  const data = await res.json();
  setInitialSnapshot(stableStringify(editedSlides));  // mark clean
  setLayoutVersion(data.layoutVersion);
  setMode("preview");
  setCacheBust(String(Date.now()));
};

// Reset (NEW FAIL #7 fix via refetchKey)
const handleReset = async () => {
  if (!item) return;
  await dashboardFetch(`/api/dashboard/agenda/${item.id}/instagram-layout?locale=${locale}&images=${imageCount}`, {
    method: "DELETE",
  });
  setRefetchKey((k) => k + 1);  // force useEffect refetch — robust gegen React batching
  setCacheBust(String(Date.now()));
};

// In-Modal-Confirm-Dialog (replace window.confirm — NEW FAIL #5):
{confirmDiscardOpen && (
  <div className="absolute inset-0 bg-white/95 flex items-center justify-center" role="alertdialog">
    <div className="border p-6 max-w-md">
      <h3 className="font-medium mb-3">Layout-Änderungen verwerfen?</h3>
      <p className="text-sm text-gray-600 mb-4">Ungespeicherte Änderungen am Layout gehen verloren.</p>
      <div className="flex justify-end gap-2">
        <button onClick={() => setConfirmDiscardOpen(null)}>Abbrechen</button>
        <button onClick={() => { confirmDiscardOpen.onConfirm(); setConfirmDiscardOpen(null); }} className="bg-red-600 text-white">
          Verwerfen
        </button>
      </div>
    </div>
  </div>
)}
```

### Test-Setup im Detail

#### Pure Tests (`src/lib/instagram-post.test.ts`)
- `flattenContentWithIds` produces `block:<srcId>` IDs for all text-block-types (paragraph/heading/quote/highlight/caption)
- `flattenContentWithIds` strips image/video/embed/spacer (mirror flattenContent)
- `flattenContentWithIds` strips empty/whitespace-only text
- `flattenContentWithIds` strips blocks ohne ID (Backfill state)
- `computeLayoutHash` deterministisch — gleicher Input → gleicher Hash
- `computeLayoutHash` verschiedene Inputs (Title/Lead/Content/Hashtags/Images/imageCount/Locale) → verschiedene Hashes
- `computeLayoutHash` invariant gegen `block.id`-Änderungen (normalizeContentForHash strips id)
- `computeLayoutHash` mit DE-Fallback: FR locale + empty FR-lead + populated DE-lead → hash matches DE-lead-input (NEW FAIL #9)
- `computeLayoutVersion` deterministisch + matches expected substring(md5(stableStringify), 1, 16)
- `stableStringify` produziert sortierte Keys recursive
- `resolveInstagramSlides` mit `override=null` → mode="auto"
- `resolveInstagramSlides` mit gültigem Override → mode="manual"
- `resolveInstagramSlides` mit veraltetem `contentHash` → stale + warning
- `resolveInstagramSlides` mit Unknown-Block-ID → stale
- `resolveInstagramSlides` mit nicht-referenzierten current-Blocks → stale
- `resolveInstagramSlides` Grid-Pfad: `slides[0]=grid`, override-blocks ab `slides[1]`
- `resolveInstagramSlides` No-image-Pfad: override wirkt ab slides[0]
- `resolveInstagramSlides` empty body + empty override → mode="manual", slides=[grid?] only
- `resolveInstagramSlides` mit oversized block in override → inline-split
- `buildManualSlides` mit override.slides.length > SLIDE_HARD_CAP → clamped to 10
- Backward-compat: ALLE bestehenden `splitAgendaIntoSlides` Tests grün

#### `journal-html-converter.test.ts` (DK-3 — 3-layer round-trip)
- `blocksToHtml` emittiert `data-bid` für jeden Block-Type
- `htmlToBlocks` liest `data-bid` zurück
- 3-LAYER Roundtrip `blocksToHtml → sanitizeHtml → htmlToBlocks` preserves IDs für N=5 Zyklen
- Legacy HTML ohne `data-bid` bekommt frisch generierte ID
- Invalid `data-bid` (falsches Format) bekommt frisch generierte ID

#### `RichTextEditor.test.tsx` (DK-3 — sanitizer)
- `sanitizeHtml(<p data-bid="x">text</p>)` preserves data-bid attribute
- `sanitizeHtml(<h2 data-bid="x">text</h2>)` preserves data-bid
- `sanitizeHtml(<blockquote data-bid="x"><p>text</p></blockquote>)` preserves data-bid on outer
- `sanitizeHtml(<p data-foo="evil">text</p>)` STILL strips other custom attrs (regression-guard)

#### `instagram-layout/route.test.ts`
- `GET` ohne Override → mode="auto"
- `GET` mit Override + matching hash → mode="manual"
- `GET` mit Override + content-edit → mode="stale"
- `GET` ohne Auth → 401
- `GET` mit isLocaleEmpty → 404 + "locale_empty"
- `PUT` happy path → 200 + DB-row updated + return new layoutVersion
- `PUT` mit altem `contentHash` → 409 "content_changed"
- `PUT` mit altem `layoutVersion` → 412 "layout_modified_by_other"
- `PUT` mit invalid block-id → 422 "unknown_block"
- `PUT` mit duplicate block-id → 422 "duplicate_block"
- `PUT` mit incomplete coverage → 422 "incomplete_layout"
- `PUT` mit slides.length > 10 → 400 "too_many_slides"
- `PUT` mit slides.length === 0 → 400 "empty_layout"
- `PUT` ohne CSRF → 403
- `PUT` ohne Auth → 401
- `PUT` writes `audit_log` entry "agenda_layout_update"
- `DELETE` happy path → 204 + key entfernt
- `DELETE` ohne Override → 204 (idempotent)
- `DELETE` collapsed locale-object → NULL
- `DELETE` writes `audit_log` entry "agenda_layout_reset"
- `DELETE` ohne Auth → 401
- Bestehende `instagram` metadata-route returns `layoutMode` field
- `instagram-slide` PNG-route mit Override + slideIdx → korrekte Block-Verteilung
- **CAS-Verifikation** (DK-3 supplementary): manual SQL-test that `substring(md5(jsonb::text), 1, 16)` matches `computeLayoutVersion` output for sample overrides. **If divergent**: switch to app-side CAS (SELECT FOR UPDATE + compare in app code) and document in spec.

#### `InstagramExportModal.test.tsx`
- Tab "Layout anpassen" disabled wenn block ohne ID (Backfill not done)
- Tab "Layout anpassen" enabled wenn alle blocks haben IDs
- Tab-switch open Layout-Modus + GET fetched (via dashboardFetch)
- GET error → error-banner statt blank state
- GET 404 locale_empty → error-banner mit specific message
- Block kann auf nächste Slide verschoben werden
- Block kann auf vorherige Slide verschoben werden
- "Neue Slide ab hier" erzeugt zusätzliche Gruppe
- Save → PUT-fetch (dashboardFetch) mit korrekten contentHash + layoutVersion
- Save success → cacheBust updated, mode="preview"
- Save 412 → Error-Banner "Layout wurde geändert"
- Save 409 → Error-Banner "Inhalt hat sich geändert"
- Reset → DELETE-fetch + refetchKey increment → fresh layout (NEW FAIL #7)
- Reset re-trigger fires GET (regression-test for setMode-batching bug)
- Stale-Banner sichtbar wenn API mode="stale"
- Stale-Banner-Button "Auto-Layout" → DELETE
- Snapshot-diff dirty-detect: revert-to-original is NOT dirty (NEW FAIL #6)
- In-Modal Confirm-Dialog opens auf Tab-switch mit dirty (NOT window.confirm — NEW FAIL #5)
- Confirm "Verwerfen" → discard + perform original action
- Confirm "Abbrechen" → close dialog + stay
- Tab-switch zurück mit dirty → confirm
- Modal-Close mit dirty → confirm
- imageCount-change mit dirty → confirm (NEW FAIL #8)
- locale-change mit dirty → confirm (NEW FAIL #8)

---

## Risk Surface

| Risiko | Mitigation |
|---|---|
| **Block-ID-Stabilität (3-Layer)** | DK-3 inline gelöst: data-bid Round-Trip + sanitizer whitelist + 3-Layer-Test mit echtem sanitizeHtml-Aufruf. |
| **DB-Schema-Drift Staging↔Prod** | `ADD COLUMN IF NOT EXISTS`. Spalte NULL-default → prod-code (pre-deploy) liest nicht → kein Crash. |
| **Override-Shape-Migration** | `contentHash` als Versionierungs-Proxy. Hash-Algo-Änderung → alle Overrides stale → Auto-Fallback. |
| **Race Layout-vs-Content** | `contentHash` mismatch → 409. |
| **Race Layout-vs-Layout** | `layoutVersion` Optimistic-Concurrency via Postgres `md5()` CAS in WHERE-clause. **Verifikation in DK-3 erforderlich**: Postgres `substring(md5(jsonb::text), 1, 16)` muss app-`createHash("md5")(stableStringify(...))` matchen. Falls divergent: Fallback auf app-side SELECT FOR UPDATE + compare. |
| **DE-Fallback im Hash** | Hash mirrors renderer-resolution für lead/ort/hashtags via `resolveWithDeFallback`/`resolveHashtags`. Title bleibt locale-only. |
| **Modal raw fetch ohne 401** | Ersetzt durch `dashboardFetch` für GET + PUT + DELETE. Plus error-state für non-2xx. |
| **`window.confirm` UX/iOS/jsdom** | Ersetzt durch In-Modal-Confirm-Pattern (state + alertdialog). |
| **Dirty-touched-flag Anti-Pattern** | Ersetzt durch snapshot-diff via `stableStringify`. |
| **Reset re-trigger React-batching** | `refetchKey` state in useEffect deps statt setMode-toggle. |
| **imageCount/locale-Wechsel ohne Guard** | Wrapping handlers `guardedSetImageCount`/`guardedSetLocale` mit dirty-confirm. |
| **Audit-Log fehlt** | DK-6 + API-Architektur: `auditLog("agenda_layout_update"/"agenda_layout_reset", ...)` für PUT/DELETE. |
| **Block-IDs Format-Hardening Future** | Note in DK-3: `validateBlock` accepts opaque strings. Future UUID-only validation würde Override break — documentation für Zukunfts-Devs. |
| **Empty body / 0 slides** | Resolver + GET 404 explizit. |
| **DELETE leaves dangling JSONB** | DELETE-SQL 2-Phase mit collapse-empty-zu-NULL. |
| **Per-imageCount orphans** | Accept als Storage-Cost. Out-of-scope für aggressive cleanup-affordance. |
| **`layoutMode` HTTP-Field bricht Snapshot-Tests** | DK-7+DK-12: Pure-helper bit-identisch, HTTP-Response erweitert (intentional). |

**Blast Radius**: MEDIUM. Neue API-Routes + DB-Spalte + Modal-Tab + Editor-Round-Trip-Fix. Bestehende Slide-Render-Pipeline funktional unverändert für Einträge ohne Override.

---

## Implementation Order

1. **Block-ID-Stabilität (DK-3)** — `journal-html-converter.ts` data-bid + `RichTextEditor.tsx` sanitizer whitelist + 3-Layer-Round-Trip-Tests. **Erst-Schritt** weil alle nachfolgenden Schritte stabile IDs voraussetzen.
2. **CAS-SQL Sanity-Check** (DK-3 supplementary) — manual `psql` test: vergleiche `substring(md5('{"b":2,"a":1}'::jsonb::text) FROM 1 FOR 16)` mit `createHash("md5").update(stableStringify({b:2,a:1})).digest("hex").slice(0,16)`. Falls divergent: switch zu app-side SELECT FOR UPDATE + compare. Spec entsprechend updaten.
3. **Schema-Migration** — `ensureSchema()` ADD COLUMN.
4. **Pure Helper** — `flattenContentWithIds`, `stableStringify` (eigene Datei `src/lib/stable-stringify.ts` für shared use), `computeLayoutHash`, `computeLayoutVersion`, `buildManualSlides`, `resolveInstagramSlides` + Tests.
5. **API-Route** `/instagram-layout` GET/PUT/DELETE + audit-log + Tests.
6. **Bestehende Routen** auf Resolver umstellen + DK-12 Snapshot-Tests anpassen für `layoutMode` field.
7. **Modal Layout-Tab** — `LayoutEditor` Component, snapshot-diff dirty-detect, in-Modal confirm, refetchKey re-trigger, dashboardFetch für GET, error-states.
8. **Modal Tests** — Vitest+jsdom für alle DK-8-Punkte.
9. **`pnpm tsc --noEmit` + `pnpm test` + DK-13 grep clean** + commit.
10. **Push → Staging-Deploy → DK-12..15 Manual Smoke**.
11. **Codex PR-Review (max 3 Runden)**.
12. **Merge nach grünem Codex + post-merge Verifikation**.

---

## Out of Scope (Follow-ups → memory/todo.md)

- Drag-and-drop block reordering (v2)
- Per-block-Visualisierung im Layout-Editor mit live-Preview-PNG-Cards
- Override-Audit-Log-Viewer (Audit-Entries werden geschrieben, kein UI-Reader im Sprint)
- Bulk-Operation: "alle Einträge mit imageCount=0 zurücksetzen"
- Override-Vererbung zwischen DE↔FR (jetzt strict per-locale)
- Override für Grid-Slide-Image-Reihenfolge (separate concern)
- Custom-Block-Splitting: User splittet langen Absatz an gewünschter Stelle
- Per-imageCount orphan-cleanup affordance
- Eager-Backfill für Bestand-Einträge

---

## Notes

- Plan-Source: `tasks/instagram-layout-overrides-plan.md` (Codex)
- Test-Erwartung: ~36 neue Cases. Bestehende 806 Tests bleiben grün (bis auf intentional Snapshot-Updates für `layoutMode` Field).
- Sonnet adversarial review history:
  - **v1**: SPLIT RECOMMENDED (14 findings, fatal: Block-ID-Stabilität)
  - **v2**: NEEDS WORK (12/14 v1 fixed; 3 NEW Critical + 5 NEW Major)
  - **v3 (this)**: alle 3 NEW Critical + 5 NEW Major adressiert. Re-Run nach v3-Commit erwartet.
- Codex spec-eval war geplant, hat Usage-Limit erreicht (verfügbar wieder 29.04. 00:51) — kann nach Sonnet-Re-Run trotzdem laufen für Independent-Cross-Check.
