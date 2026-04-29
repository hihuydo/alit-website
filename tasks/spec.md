# Spec: S1a — Layout-Overrides Foundation (Schema + Resolver, NO new API)
<!-- Created: 2026-04-29 -->
<!-- Author: Planner (Opus) -->
<!-- Status: Draft v1 (split aus monolithic-S1 per Codex spec-eval SPLIT RECOMMENDED) -->
<!-- Branch: feat/instagram-layout-overrides-s1a-foundation -->
<!-- Depends on: PR #130 (S0 Block-ID Stabilität + AuditEvent extension) merged ✓ -->
<!-- Enables: S1b (Persistence API) → S2 (Modal UI) -->
<!-- Source: tasks/instagram-layout-overrides-spec-v3-reference.md (besonders §Resolver, §Content Hash) -->

## Summary

Backend-Foundation für Layout-Overrides — **kein neues HTTP-API in diesem Sprint**. Adds:
- Schema-Spalte `agenda_items.instagram_layout_i18n JSONB NULL` (NULL-default → backward-compat trivial)
- Pure Resolver `resolveInstagramSlides(item, locale, imageCount, override?)` mit 3 Modi (auto/manual/stale)
- Pure Helpers (`flattenContentWithIds`, `stableStringify`, `computeLayoutHash`, `buildSlideMeta`, `projectAutoBlocksToSlides`)
- Bestehende Routes (`/instagram` metadata + `/instagram-slide/[slideIdx]` PNG) konsumieren den Resolver — backward-compat für Einträge ohne Override (NULL row → bit-identische auto-Layout)

**Was NICHT in Scope ist (kommt in S1b):**
- `/api/dashboard/agenda/[id]/instagram-layout` GET/PUT/DELETE Routes
- App-side SELECT FOR UPDATE CAS / `computeLayoutVersion` Token (kommt mit Persistence-API)
- Audit-Log-Integration (`agenda_layout_update`/`agenda_layout_reset` Events sind via S0 already in Union — bleiben unbenutzt bis S1b)
- Manueller staging smoke mit `psql UPDATE` (kein Persistence ohne API)
- `patterns/database-concurrency.md` Note (gehört zur CAS-Doku in S1b)
- DB-Schema rollback / orphan-cleanup policy (theoretisch nur relevant wenn API existiert)

**Was NICHT in Scope ist (Follow-up nach S2):**
- Modal Layout-Tab UI
- Drag-and-drop block reordering
- DE↔FR Vererbung

---

## Sprint Contract (Done-Kriterien)

> Single Source of Truth: diese Spec. Kein paralleles `tasks/todo.md` mit DK-Drift — `todo.md` enthält nur die Implementation-Order checkbox, alle Acceptance-Criteria sind hier.

1. **DB-Migration**: `agenda_items.instagram_layout_i18n JSONB NULL` via `ensureSchema()` `ADD COLUMN IF NOT EXISTS`. Idempotent. Bestehende Reihen bleiben `NULL`. Shared-DB-safe (siehe `patterns/deployment-staging.md`).
2. **`pnpm build` grün, `pnpm exec tsc --noEmit` clean.**
3. **`pnpm test` grün** — neue tests added; baseline + neue Cases laufen alle. (Konkrete Zahl wird vom Generator als CI-Output erfasst, nicht hardcoded in der Spec — vermeidet Drift wenn andere Sprints parallel test counts ändern.)
4. **`pnpm audit --prod` 0 HIGH/CRITICAL.**
5. **Public Helpers exposed** über DREI Dateien (Bundle-Trennung — siehe DK-5b):
   - `src/lib/stable-stringify.ts` (NEU, pure, runtime-agnostic):
     - `stableStringify(value): string`
   - `src/lib/instagram-post.ts` (existing — bleibt **client-importable**, KEIN node:crypto):
     - `flattenContentWithIds(content): ExportBlock[]`
     - `isExportBlockId(s): s is string`
     - `buildSlideMeta(item, locale): SlideMeta` (extrahiert aus `splitAgendaIntoSlides`)
     - `projectAutoBlocksToSlides(item, locale, imageCount, exportBlocks): ExportBlock[][]`
     - `ExportBlock` type + die 4 Override-Types (export type only — keine Runtime-Surface)
   - `src/lib/instagram-overrides.ts` (NEU, Node-only — darf node:crypto importieren):
     - `computeLayoutHash({item, locale, imageCount}): string` (16-char sha256-prefix mit DE-Fallback)
     - `ResolverResult` type
     - `resolveInstagramSlides(item, locale, imageCount, override?): ResolverResult`
     - `buildManualSlides` (file-private innerhalb `instagram-overrides.ts`, getestet via resolver)
5b. **Bundle-Safety**: `instagram-post.ts` bleibt client-importable (siehe `InstagramExportModal.tsx` + `AgendaSection.tsx` consumers). KEIN `import { createHash } from "node:crypto"` darin. Alle Node-only Logik (sha256-Hashing, Resolver) lebt in `instagram-overrides.ts` — API-Routes importieren von dort. Verifikation: `pnpm build` muss client-pass ohne `node:crypto`-Resolution-Fehler durchlaufen (DK-2 catches automatisch wenn falsch).
6. **Override-Types `export`-ed** (4 type-only definitions in `src/lib/instagram-post.ts`): `InstagramLayoutOverrides`, `PerImageCountOverrides`, `InstagramLayoutOverride`, `InstagramLayoutSlide`. S1b's API-Routes + `instagram-overrides.ts` importieren sie.
7. **Bestehende Routes auf Resolver umgestellt**:
   - `GET /api/dashboard/agenda/[id]/instagram` (metadata): SELECT um `instagram_layout_i18n` erweitern, `slideCount` aus Resolver, response um `layoutMode: "auto"|"manual"|"stale"` Field erweitert. Bestehende `image_partial` post-resolver Check verbatim erhalten (DK-9).
   - `GET /api/dashboard/agenda/[id]/instagram-slide/[slideIdx]` (PNG): SELECT um `instagram_layout_i18n` erweitern, override extraction + an Resolver geben, Resolver entscheidet welche Blocks pro Slide. Math.min imageCount-clamp bleibt.
8. **Backward-compat Garantie**: Wenn Resolver kein Override findet (NULL row), Output von `splitAgendaIntoSlides` ist **bit-identisch** zum aktuellen Behavior — keine Verhaltensänderung für Einträge ohne manuelles Layout. (Pure-Helper-Output, NICHT HTTP-Response.)
9. **`image_partial` Regression-Guard**: bestehender DB-check (`SELECT public_id FROM media WHERE = ANY($1)`) nach `gridImages.publicId`-dedupe MUSS verbatim erhalten bleiben — appendet `"image_partial"` zu warnings wenn media-rows fehlen. PR #129's 2 image_partial-Tests müssen weiterhin grün sein. (Regression-Indikator wenn nicht.)
10. **Stale-Code-Grep**: `rg -n 'splitAgendaIntoSlides\(' src/app/api/dashboard/agenda --type ts | grep -v '\.test\.' | grep -v '//'` zeigt **0 Hits** (alle direkten Aufrufe wurden auf `resolveInstagramSlides` umgestellt; Test-Files + Comments excluded). `--type ts` matcht bereits beide `.ts` UND `.tsx` — KEIN zusätzliches `--glob '*.tsx'` (würde sonst .ts Files wie `instagram/route.ts` ausschließen).
11. **Block-ID centralization** (Codex finding): die Decision wie ExportBlock-IDs aussehen (heute: `block:<journalBlockId>`) ist **eine** zentrale function. Concrete: `flattenContentWithIds` ist single source-of-truth — der `block:`-Prefix wird nur dort gebildet. Tests + future S1b PUT validation referenzieren denselben helper, kein zweites Regex an anderer Stelle. (Wenn S1b später eine Validation braucht, importiert sie eine `isExportBlockId(s)` helper oder `parseExportBlockId(s) → sourceBlockId`-Funktion — beide leben in `instagram-post.ts`.)
12. **Codex PR-Review** — in-scope Findings (Contract/Security/Correctness) gefixt. Erwartung: 1 Runde für reinen Helper+Schema-Sprint.
13. **Prod-Merge** + post-merge Verifikation (CI grün + `/api/health/` HTTP 200 + Container healthy + Logs clean — pattern aus PR #130).

---

## Architektur

### DB-Schema-Erweiterung

```sql
-- src/lib/schema.ts in ensureSchema():
ALTER TABLE agenda_items
  ADD COLUMN IF NOT EXISTS instagram_layout_i18n JSONB NULL;
```

Idempotent. Kein DEFAULT (NULL = "kein Override gesetzt"). Shared-DB-safe — bestehender Prod-Code (pre-deploy) liest die Spalte nicht → kein Crash.

### Override-Shape (JSONB) — 3-Level (alle 4 types EXPORT-ed)

```ts
// src/lib/instagram-post.ts — alle 4 Types EXPORTED, sonst können
// S1b API-Routes und Resolver-Tests sie nicht importieren.
export type InstagramLayoutOverrides = {
  de?: PerImageCountOverrides | null;
  fr?: PerImageCountOverrides | null;
};

export type PerImageCountOverrides = {
  [imageCountStr: string]: InstagramLayoutOverride | null;
};

export type InstagramLayoutOverride = {
  contentHash: string;        // 16-char sha256 prefix; binds override to a specific content version
  slides: InstagramLayoutSlide[];
};

export type InstagramLayoutSlide = {
  blocks: string[];           // ExportBlock IDs (siehe flattenContentWithIds)
};
```

**Note**: `layoutVersion` Field aus dem monolithic-S1 entwurf ist bewusst entfernt (Codex finding). S1b wird CAS via SELECT FOR UPDATE machen mit on-the-fly recomputation, nicht via stored token. Das eliminiert die data-integrity-trap (stored ≠ recomputed → permanent 412 loop).

**Slide-Index-Konvention**:
- **Grid-Pfad** (`imageCount ≥ 1`): `override.slides[0]` = erste TEXT-Slide (= logische Slide 2 mit Lead-Prefix). Override-length = `slides.length - 1` der Resolver-Output.
- **No-Grid-Pfad** (`imageCount = 0`): `override.slides[0]` = logische Slide 1. Override-length = `slides.length` 1:1.

### `flattenContentWithIds` — Block-ID-preserving Variant + Centralization

```ts
// src/lib/instagram-post.ts
export type ExportBlock = SlideBlock & {
  id: string;                  // "block:<journalBlockId>" — single source-of-truth
  sourceBlockId: string;       // raw journal block.id ohne prefix
};

const EXPORT_BLOCK_PREFIX = "block:" as const;

/** Same content-shape filtering as flattenContent, but preserves block-IDs
 *  for override-referencing. Auto-path keeps using flattenContent (no IDs).
 *  Manual-path uses this helper exclusively. */
export function flattenContentWithIds(
  content: JournalContent | null | undefined,
): ExportBlock[] {
  if (!content || !Array.isArray(content)) return [];
  const out: ExportBlock[] = [];
  for (const block of content) {
    // Skip blocks without a stable ID (S0 Backfill not done; Modal-Tab in S2 gates this).
    if (typeof block.id !== "string" || block.id.length === 0) continue;
    switch (block.type) {
      case "paragraph":
      case "quote":
      case "highlight": {
        const text = block.content.map((n) => n.text).join("");
        if (text.trim().length === 0) break;
        out.push({ id: `${EXPORT_BLOCK_PREFIX}${block.id}`, sourceBlockId: block.id, text, weight: 400, isHeading: false });
        break;
      }
      case "heading": {
        const text = block.content.map((n) => n.text).join("");
        if (text.trim().length === 0) break;
        out.push({ id: `${EXPORT_BLOCK_PREFIX}${block.id}`, sourceBlockId: block.id, text, weight: 800, isHeading: true });
        break;
      }
      case "caption": {
        const text = block.content.map((n) => n.text).join("");
        if (text.trim().length === 0) break;
        out.push({ id: `${EXPORT_BLOCK_PREFIX}${block.id}`, sourceBlockId: block.id, text, weight: 300, isHeading: false });
        break;
      }
      // image/video/embed/spacer → stripped (mirror flattenContent)
    }
  }
  return out;
}

/** Test-helper / S1b validation entry-point: is this string a well-formed ExportBlock ID?
 *  Single source-of-truth — no second regex elsewhere. */
export function isExportBlockId(s: unknown): s is string {
  return typeof s === "string" && s.startsWith(EXPORT_BLOCK_PREFIX) && s.length > EXPORT_BLOCK_PREFIX.length;
}
```

**`splitOversizedBlock` Position**: NICHT in `flattenContentWithIds`. Auto-path: in `splitAgendaIntoSlides`. Manual-path (kommt in S1b über buildManualSlides): inline. So produziert `flattenContentWithIds` 1:1 Original-Block-IDs ohne Segmentierung.

### `stableStringify` — Shared Helper (`src/lib/stable-stringify.ts`)

```ts
// src/lib/stable-stringify.ts
/** Recursive JSON.stringify with sorted object keys at every level.
 *  Always returns a string — `undefined` and `null` both map to `"null"` so
 *  the output is always valid JSON (avoids template-literal "undefined"
 *  poisoning of hash inputs).
 *
 *  CONTRACT: callers must pass plain JSON-serializable structures (literal
 *  objects, arrays, primitives, null, undefined). Class instances such as
 *  `Date`, `Map`, `Set`, RegExp etc. would be serialized as `{}` because
 *  `Object.keys(new Date())` returns `[]`. If a future hash payload ever
 *  needs to include a `Date`, convert via `.toISOString()` before passing.
 *  Used für content-hashing (deterministisch über Object-Order). */
export function stableStringify(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
    .join(",")}}`;
}
```

### `computeLayoutHash` mit DE-Fallback

Lives in **`src/lib/instagram-overrides.ts`** (NEU) — Node-only weil `node:crypto`-Import nicht client-bundle-safe ist (siehe DK-5b).

```ts
// src/lib/instagram-overrides.ts
import { createHash } from "node:crypto";
import { stableStringify } from "./stable-stringify";
import type { AgendaItemForExport, JournalContent, Locale } from "./instagram-post";

function normalizeContentForHash(content: JournalContent | null): unknown {
  if (!content) return [];
  return content.map((block) => {
    // Cast as JournalContent[number] (= JournalBlock union) — already has `id: string`.
    // Spread to omit id; resulting object is safe to hash (Block-IDs werden entfernt
    // → Hash robust gegen ID-Regenerierung in Bestand-Code-Pfaden).
    const { id: _id, ...rest } = block as JournalContent[number] & { id: string };
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
  // Mirror renderer-resolution: DE-fallback for fields the renderer falls back on.
  // Title bleibt locale-only (kein DE-Fallback im Renderer).
  const lead = resolveWithDeFallback(item.lead_i18n, locale);
  const ort = resolveWithDeFallback(item.ort_i18n, locale);
  const hashtags = resolveHashtags(item, locale);  // already DE-fallback inside

  const payload = {
    title: item.title_i18n?.[locale] ?? "",
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

**File-private** (no public re-export needed):
- In `instagram-post.ts`: `resolveWithDeFallback`, `resolveHashtags`, `resolveImages` — bleiben file-private, werden via `import` in `instagram-overrides.ts` referenziert. ⚠️ Wenn aktuell `function`-decl ohne `export`: hier müssen sie `export function` werden, weil Cross-File-Import sonst fehlt. Spec-Fix: alle 3 erhalten `export` keyword in `instagram-post.ts`. (Sind eh harmless für client bundle — pure Helper ohne node:crypto.)
- In `instagram-overrides.ts`: `normalizeContentForHash`, `normalizeImagesForHash`, `normalizeGridColumns` bleiben file-private. Tested indirekt via `computeLayoutHash`.

### `buildSlideMeta` — extrahierter Helper

```ts
// src/lib/instagram-post.ts
/** Build SlideMeta for a given (item, locale). Extracted from splitAgendaIntoSlides
 *  inline-block so resolver + manual-path can reuse without duplication. */
export function buildSlideMeta(item: AgendaItemForExport, locale: Locale): SlideMeta {
  return {
    datum: item.datum,
    zeit: item.zeit,
    ort: resolveWithDeFallback(item.ort_i18n, locale) ?? "",
    title: item.title_i18n?.[locale] ?? "",
    lead: resolveWithDeFallback(item.lead_i18n, locale),
    hashtags: resolveHashtags(item, locale),
    locale,
  };
}
```

`splitAgendaIntoSlides` interner Code wird auf diesen Helper umgestellt — Output bleibt bit-identisch (DK-8 backward-compat). **Concrete replace-target**: in der bestehenden Funktion (siehe `src/lib/instagram-post.ts` ~line 530–541, das inline-Block `const meta: SlideMeta = { datum, zeit, ort: …, title: …, lead: …, hashtags, locale }`) → ersetzen durch `const meta = buildSlideMeta(item, locale);`. Alle anderen Aufrufer (Tests etc.) bleiben unverändert.

**`SlideMeta` Type-Check**: `SlideMeta` enthält bereits `locale: Locale` (verifiziert: `src/lib/instagram-post.ts:203` — `locale: Locale;`). Keine Änderung nötig.

### `projectAutoBlocksToSlides` — Starter Layout für späteren Editor

Used by S1b's `GET /instagram-layout` für `mode === "auto"` und `mode === "stale"` — projiziert die Auto-Layout-Block-Verteilung auf Block-ID-Ebene. Hier in S1a wird die Funktion exposed + getestet, aber NICHT konsumiert — bestehende Routes brauchen sie nicht.

```ts
// src/lib/instagram-post.ts
/** Greedy-fill exportBlocks into slide-groups using SLIDE_BUDGET (mirror auto
 *  3-phase logic) but at block-ID level — no oversized-block splitting.
 *  Returns the list of slide-block-groups (text-slides only; grid-slide is
 *  prepended by the resolver if hasGrid). For a starter layout the user can
 *  save as-is, or edit. */
export function projectAutoBlocksToSlides(
  item: AgendaItemForExport,
  locale: Locale,
  imageCount: number,
  exportBlocks: ExportBlock[],
): ExportBlock[][] {
  if (exportBlocks.length === 0) return [];
  const hasGrid = imageCount >= 1
    && Array.isArray(item.images)
    && (item.images as unknown[]).length > 0;
  const lead = resolveWithDeFallback(item.lead_i18n, locale);
  const slide2BodyBudget = hasGrid && lead
    ? Math.max(SLIDE_BUDGET - leadHeightPx(lead), 200)
    : SLIDE_BUDGET;

  // Budget strategy: first group gets the lead-slide budget. Subsequent
  // groups always SLIDE_BUDGET. Block splitting is intentionally deferred
  // to the renderer in manual mode — this helper produces a starter layout
  // at block-ID granularity.
  const groups: ExportBlock[][] = [[]];
  let remaining = hasGrid ? slide2BodyBudget : SLIDE1_BUDGET;

  for (const block of exportBlocks) {
    const cost = blockHeightPx(block);  // bestehender helper
    if (cost > remaining && groups[groups.length - 1].length > 0) {
      groups.push([]);
      remaining = SLIDE_BUDGET;
    }
    groups[groups.length - 1].push(block);
    remaining -= cost;
  }
  return groups.filter((g) => g.length > 0);
}
```

### `buildManualSlides` — file-private (für Resolver)

Lives in **`src/lib/instagram-overrides.ts`** (NEU) — same file as resolver weil sie nur dort konsumiert wird.

```ts
// src/lib/instagram-overrides.ts (NICHT exported)
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
  const lead = meta.lead;
  const rawSlides: Array<Omit<Slide, "index" | "isFirst" | "isLast" | "meta">> = [];

  if (hasGrid) {
    rawSlides.push({ kind: "grid", blocks: [], gridColumns, gridImages });
  }

  override.slides.forEach((overrideSlide, idx) => {
    // Per-slide budget mirror auto-path. `&& lead` guard mirrors
    // projectAutoBlocksToSlides for DK-8 backward-compat — lead-less
    // grid entries get the same full budget in auto + manual.
    const slideBudget = idx === 0
      ? (hasGrid
          ? (lead ? Math.max(SLIDE_BUDGET - leadHeightPx(lead), 200) : SLIDE_BUDGET)
          : SLIDE1_BUDGET)
      : SLIDE_BUDGET;

    const slideBlocks: SlideBlock[] = [];
    for (const blockId of overrideSlide.blocks) {
      const exportBlock = blockById.get(blockId);
      if (!exportBlock) continue;  // defensive — should be unreachable post-stale-check
      slideBlocks.push(...splitOversizedBlock(exportBlock, slideBudget));
    }

    rawSlides.push({
      kind: "text",
      blocks: slideBlocks,
      leadOnSlide: idx === 0 && hasGrid && Boolean(lead),
    });
  });

  // SLIDE_HARD_CAP defensive clamp; S1b PUT validation rejects earlier.
  const clamped = rawSlides.slice(0, SLIDE_HARD_CAP);
  const total = clamped.length;
  return clamped.map((s, i) => ({
    index: i, isFirst: i === 0, isLast: i === total - 1,
    kind: s.kind, blocks: s.blocks, leadOnSlide: s.leadOnSlide,
    gridColumns: s.gridColumns, gridImages: s.gridImages, meta,
  }));
}
```

### `resolveInstagramSlides` — Pure Resolver

Lives in **`src/lib/instagram-overrides.ts`** (NEU). Imports the full helper-set + types from `instagram-post.ts`. **Verified-vollständige Import-Liste** (alle Cross-File-Refs in `instagram-overrides.ts` sind drin — `computeLayoutHash` braucht `resolveWithDeFallback`/`resolveHashtags`, `buildManualSlides` braucht `splitOversizedBlock` + `ExportBlock`/`GridImage`/`SlideMeta`):

```ts
// src/lib/instagram-overrides.ts
import {
  // value-imports (functions):
  flattenContentWithIds,
  buildSlideMeta,
  projectAutoBlocksToSlides,
  splitAgendaIntoSlides,
  splitOversizedBlock,           // for buildManualSlides per-slide split
  isLocaleEmpty,
  resolveImages,
  resolveWithDeFallback,         // for computeLayoutHash DE-fallback
  resolveHashtags,               // for computeLayoutHash hashtags
  leadHeightPx,                  // for buildManualSlides budget calc
  SLIDE_BUDGET,
  SLIDE1_BUDGET,
  SLIDE_HARD_CAP,
  // type-imports:
  type AgendaItemForExport,
  type Locale,
  type Slide,
  type SlideMeta,
  type SlideBlock,
  type ExportBlock,
  type GridImage,
  type InstagramLayoutOverride,
  type InstagramLayoutOverrides,  // optional but useful for Map<>/Set<> type hints
} from "./instagram-post";
import { stableStringify } from "./stable-stringify";
import { createHash } from "node:crypto";
import type { JournalContent } from "./journal-types";  // siehe normalizeContentForHash
export type ResolverResult = {
  slides: Slide[];
  warnings: string[];
  mode: "auto" | "manual" | "stale";
  contentHash: string;
};

export function resolveInstagramSlides(
  item: AgendaItemForExport,
  locale: Locale,
  imageCount: number,
  override?: InstagramLayoutOverride | null,
): ResolverResult {
  // Guard isLocaleEmpty BEFORE splitAgendaIntoSlides — existing helper throws
  // Error("locale_empty"). Resolver must be self-contained / not throw.
  if (isLocaleEmpty(item, locale)) {
    return {
      slides: [],
      warnings: ["locale_empty"],
      mode: "auto",
      contentHash: computeLayoutHash({ item, locale, imageCount }),
    };
  }

  const exportBlocks = flattenContentWithIds(item.content_i18n?.[locale] ?? null);
  const contentHash = computeLayoutHash({ item, locale, imageCount });
  const autoResult = splitAgendaIntoSlides(item, locale, imageCount);

  if (!override) {
    return { ...autoResult, mode: "auto", contentHash };
  }

  if (override.contentHash !== contentHash) {
    return {
      ...autoResult,
      warnings: [...autoResult.warnings, "layout_stale"],
      mode: "stale",
      contentHash,
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
      mode: "stale",
      contentHash,
    };
  }

  // Manual path
  const hasGrid = imageCount >= 1 && Array.isArray(item.images) && (item.images as unknown[]).length > 0;
  const gridImages = hasGrid ? resolveImages(item, imageCount) : [];
  const gridColumns = normalizeGridColumns(item.images_grid_columns);
  const meta = buildSlideMeta(item, locale);
  const manualSlides = buildManualSlides(item, locale, imageCount, override, exportBlocks, meta, hasGrid, gridImages, gridColumns);

  return {
    slides: manualSlides,
    // Filter "too_long" — manual override implicitly accepts the slide-count.
    warnings: autoResult.warnings.filter((w) => w !== "too_long"),
    mode: "manual",
    contentHash,
  };
}
```

**Edge cases**:
- exportBlocks=[] AND override.slides=[] → mode=manual (override matches), slides=[grid only if hasGrid]
- exportBlocks=[] AND override.slides has entries → unknownInOverride=true → stale
- isLocaleEmpty → guarded inline; returns empty-but-valid result with `warnings: ["locale_empty"]`

**Performance-Note (intentional)**: `splitAgendaIntoSlides` wird auch im Manual-Path aufgerufen, obwohl `autoResult.slides` dort verworfen wird — Grund: alle non-`too_long` Warning-Messages sollen weiterhin bubble-up. Doppelberechnung akzeptiert (admin-only, low-frequency). Future-refactor: separate `computeWarnings(item, locale, imageCount)` helper extrahieren — out-of-scope für S1a.

### Bestehende Routen-Updates

**Imports für beide Routes** — die existing import-Liste muss explizit erweitert werden:

```ts
// instagram/route.ts UND instagram-slide/[slideIdx]/route.tsx — beide:
import { resolveInstagramSlides } from "@/lib/instagram-overrides";  // NEU
import {
  // … bestehende value-imports unverändert …
  type InstagramLayoutOverrides,                                     // NEU für Type-Cast
} from "@/lib/instagram-post";
```

**Type-Erweiterung für beide Routes** — SELECT muss `instagram_layout_i18n` neu mit selektieren UND der `as`-Cast muss um die Intersection erweitert werden, sonst tsc:

```ts
// VORHER (beide Routes):
const item = row.rows[0] as AgendaItemForExport;

// NACHHER:
const item = row.rows[0] as AgendaItemForExport & {
  instagram_layout_i18n: InstagramLayoutOverrides | null;
};
```

#### Metadata Route — `instagram/route.ts`

**KRITISCH**:
- Bestehender `image_partial` post-resolver check MUSS verbatim erhalten bleiben (siehe unten).
- Bestehende `isLocaleEmpty` 404-Early-Return MUSS verbatim erhalten bleiben — der Resolver-Guard ist Defense-in-Depth (für pure-callers + future server renderers), aber HTTP-Behavior bleibt unverändert (404 + `error: "locale_empty"`). Sonst wäre das ein silent breaking API-change (modal/tests branchen auf 404).
- SQL-Query: bestehende SELECT-Liste muss `instagram_layout_i18n` zusätzlich enthalten. Beispiel:
  ```sql
  SELECT id, title_i18n, lead_i18n, ort_i18n, hashtags, content_i18n,
         datum, zeit, images, images_grid_columns, instagram_layout_i18n
    FROM agenda_items WHERE id = $1
  ```
  Wenn die Spalte fehlt, ist `item.instagram_layout_i18n` zur Laufzeit `undefined`, der `?.[locale]?.[String(imageCount)] ?? null` Chain liefert silent `null`, alle Overrides werden permanent ignoriert (mode immer `"auto"`). KEIN tsc-Fehler. KEIN Test fängt das (weil Tests das Feld via Mock supplien können). Daher muss der SQL string explizit angepasst sein.

```ts
const override = item.instagram_layout_i18n?.[locale]?.[String(imageCount)] ?? null;
const result = resolveInstagramSlides(item, locale, imageCount, override);
const warnings = [...result.warnings];

// PRESERVE: bestehende image_partial pre-check (PR #129 Codex R1 #5 + R1 [P2] dedupe).
const gridSlide = result.slides.find((s) => s.kind === "grid");
if (gridSlide?.gridImages && gridSlide.gridImages.length > 0) {
  const uniqueIds = Array.from(new Set(gridSlide.gridImages.map((g) => g.publicId)));
  const { rows: mediaRows } = await pool.query<{ public_id: string }>(
    `SELECT public_id FROM media WHERE public_id = ANY($1)`,
    [uniqueIds],
  );
  if (mediaRows.length < uniqueIds.length) warnings.push("image_partial");
}

return NextResponse.json({
  success: true,
  slideCount: result.slides.length,
  availableImages,
  imageCount,
  warnings,                            // ← combined: resolver + image_partial
  layoutMode: result.mode,             // NEU
});
```

**Test-Erwartung**: bestehende `image_partial` Tests (PR #129's 2 cases) MÜSSEN grün bleiben.

#### PNG Slide Route — `instagram-slide/[slideIdx]/route.tsx`

**KRITISCH**:
- Override extraction identisch zur Metadata-Route + als 4. Argument in `resolveInstagramSlides` — sonst rendern manuelle Layouts silently als auto.
- imageCount-Clamping: BEHÄLT bestehende `Math.min(requestedImages, available)` Logik. Override-Lookup nutzt den geclampten Wert (Konsistenz mit Metadata-Route).
- **Bestehende `numSlideIdx >= slides.length` 422/404-Guard MUSS verbatim erhalten bleiben** — angepasst auf `result.slides.length` und `result.warnings.includes("too_long")`. Ohne diese Guard crasht out-of-range-slideIdx mit `TypeError: Cannot read properties of undefined` → 500.
- SQL-Query: SELECT muss `instagram_layout_i18n` zusätzlich enthalten (siehe Metadata-Route Beispiel). Variablenname ist `rows[0]` (nicht `row.rows[0]`), passe an existing route style an.

```ts
// SQL: bestehende SELECT-Liste + instagram_layout_i18n
const { rows } = await pool.query(
  `SELECT id, title_i18n, lead_i18n, ort_i18n, hashtags, content_i18n,
          datum, zeit, images, images_grid_columns, instagram_layout_i18n
     FROM agenda_items WHERE id = $1`,
  [id],
);
if (rows.length === 0) return /* existing 404 */;
const item = rows[0] as AgendaItemForExport & {
  instagram_layout_i18n: InstagramLayoutOverrides | null;
};
if (isLocaleEmpty(item, locale)) return /* existing 404 locale_empty */;

const requestedImages = parseImageCountQueryParam(...);  // wie bestehend
const imageCount = Math.min(requestedImages, countAvailableImages(item));
const overrideForSlide = item.instagram_layout_i18n?.[locale]?.[String(imageCount)] ?? null;
const result = resolveInstagramSlides(item, locale, imageCount, overrideForSlide);

// PRESERVE: bestehende isTooLong / out-of-range guard, angepasst auf result.*
if (numSlideIdx >= result.slides.length) {
  const isTooLong = result.warnings.includes("too_long");
  return NextResponse.json(
    { success: false, error: isTooLong ? "too_long" : "slide_not_found" },
    { status: isTooLong ? 422 : 404 },
  );
}
const slide = result.slides[numSlideIdx];  // ImageResponse rendert exact diesen Slide
```

---

## Tests

> Bullet-Liste — Generator schreibt jeden Bullet als min. 1 Vitest-Case. Falls Cases sich logisch zusammenlegen lassen, ist das OK; Hauptsache jede Verhaltens-Aussage hat Coverage. CI-output zählt automatisch.

### Pure Tests

> Test-Files: drei separate (mirror Source-File-Trennung):
> - `src/lib/stable-stringify.test.ts` — stableStringify (4)
> - `src/lib/instagram-post.test.ts` — extended with: flatten, isExportBlockId, buildSlideMeta, projectAutoBlocks (~15)
> - `src/lib/instagram-overrides.test.ts` (NEU) — computeLayoutHash + resolveInstagramSlides (~16)

#### `src/lib/stable-stringify.test.ts` (~4)
- Sorted keys recursively for nested objects
- Handles arrays (preserves order, recurses on elements)
- Handles primitives (string/number/null/boolean)
- Handles undefined: `stableStringify(undefined) === "null"` and `stableStringify({a: undefined, b: 1}) === '{"a":null,"b":1}'`

#### `flattenContentWithIds` (~5)
- Produces `block:<srcId>` for all text-block-types (paragraph/heading/quote/highlight/caption)
- Strips image/video/embed/spacer (mirror flattenContent)
- Strips empty/whitespace-only text-blocks
- Strips blocks ohne ID (Backfill state)
- `weight` and `isHeading` mirror flattenContent semantics

#### `isExportBlockId` (~3)
- Accepts well-formed `block:<id>` strings
- Rejects empty / non-string / missing prefix / prefix-only
- Round-trips with `flattenContentWithIds.id` output

#### `computeLayoutHash` in `instagram-overrides.test.ts` (~4)
- Deterministic — same input twice → same hash
- Different inputs (Title/Lead/Content/Hashtags/Images/imageCount/Locale) → different hashes
- Invariant against `block.id` changes (normalizeContentForHash strips id)
- DE-fallback path: FR locale + empty FR-lead + populated DE-lead → hash matches DE-lead-input

#### `resolveInstagramSlides` in `instagram-overrides.test.ts` (~12)
- `override=null` → mode="auto"
- Valid override matching contentHash + all blocks → mode="manual"
- Override with stale contentHash → mode="stale" + `layout_stale` warning
- Override with unknown block-IDs → mode="stale"
- Override with unreferenced current blocks → mode="stale"
- Grid-Pfad (imageCount=2): `slides[0]=grid`, override-blocks ab `slides[1]`
- **Manual grid-path with lead present**: `result.slides[1].leadOnSlide === true` (first text-slide carries lead overlay), `result.slides[2+].leadOnSlide` falsy. Verifiziert dass Renderer das Lead auf der korrekten Slide einzieht.
- No-image path: override wirkt ab `slides[0]`
- Empty body + empty override → mode="manual", slides=[] (or [grid] if hasGrid)
- Manual path with oversized block → inline-split via splitOversizedBlock
- `isLocaleEmpty(item, locale)` true → `{slides:[], warnings:["locale_empty"], mode:"auto"}` ohne throw
- **Manual mode filters `too_long`**: item dessen auto-path `too_long` warning produziert + valid manual override → `result.warnings` enthält NICHT `"too_long"` (manual override implicitly accepts slide-count). Andere warnings (z.B. `image_partial`) werden weitergeleitet.

#### `projectAutoBlocksToSlides` (~4)
- `!hasGrid` → first group budget = `SLIDE1_BUDGET`
- `hasGrid && lead` → first group budget = `Math.max(SLIDE_BUDGET - leadHeightPx(lead), 200)`
- `hasGrid && !lead` → first group budget = full `SLIDE_BUDGET` (no reduction)
- Returns `[]` when exportBlocks empty + does NOT split oversized blocks

#### `buildSlideMeta` + Backward-compat (~3)
- `buildSlideMeta` produces correct meta for DE/FR with DE-fallback
- `splitAgendaIntoSlides` Pure-Output bit-identisch nach buildSlideMeta-Refactor (alle bestehenden Tests grün)
- `buildManualSlides` clamp to `SLIDE_HARD_CAP` — Test via `resolveInstagramSlides` mit crafted item ≥11 paragraph-blocks + 11-slide override; erwartet `result.slides.length === SLIDE_HARD_CAP`

### Existing-Routes Updates (~3)

- `instagram` metadata-route returns `layoutMode` field (snapshot-Test-Update)
- `instagram-slide` PNG-route ohne Override → mode="auto", auto-Block-Verteilung (regression-guard)
- `instagram-slide` PNG-route MIT manuellem Override + slideIdx → korrekte override-blocks für jeden slideIdx.
  **Test-fixture-Pattern** (vermeidet stale-trap durch hardcoded contentHash):
  ```ts
  // Use a minimal fixture mit ≥2 paragraph-blocks und compute contentHash inline,
  // damit override.contentHash garantiert dem item.content_i18n entspricht.
  const item: AgendaItemForExport & { instagram_layout_i18n: ... } = {
    id: 1, title_i18n: { de: "T", fr: "" }, lead_i18n: { de: "L", fr: null },
    ort_i18n: { de: "O", fr: null }, hashtags: { de: ["#x"], fr: [] },
    content_i18n: { de: [
      { id: "b1-1", type: "paragraph", content: [{ text: "p1" }] },
      { id: "b1-2", type: "paragraph", content: [{ text: "p2" }] },
    ], fr: [] },
    datum: "2026-04-29", zeit: null, images: [], images_grid_columns: 1,
    instagram_layout_i18n: null,  // wird gleich überschrieben
  };
  // contentHash inline berechnen (importierbar aus test als interne export):
  const ch = computeLayoutHash({ item, locale: "de", imageCount: 0 });
  item.instagram_layout_i18n = {
    de: { "0": { contentHash: ch, slides: [{ blocks: ["block:b1-1"] }, { blocks: ["block:b1-2"] }] } },
  };
  // pool.query mock liefert dieses item; assert dass mode="manual" + slide-blocks korrekt verteilt sind.
  ```

### Regression-Guard für PR #129 (~2)

- `image_partial` warning erscheint weiterhin in `instagram` metadata-route (gridImages mit fehlender media-row → warnings include "image_partial")
- `image_partial` dedupe (PR #129 Codex R1 [P2]): same publicId 2× attached → 1 unique → 1 media-query → keine false-positive

---

## Risk Surface

| Risiko | Mitigation |
|---|---|
| **Schema-Drift Staging↔Prod** | `ADD COLUMN IF NOT EXISTS`. Spalte NULL-default → prod-code (pre-deploy) liest nicht → kein Crash. Genau dieselbe pattern wie PR #100 (newsletter), PR #97 (audit-event). |
| **Override-Shape-Migration (Hash-Algo Future)** | `contentHash` als Versionierungs-Proxy. Hash-Algo-Änderung → alle Overrides stale → Auto-Fallback. |
| **DE-Fallback im Hash Drift** | Hash mirrors renderer-resolution für lead/ort/hashtags via `resolveWithDeFallback`/`resolveHashtags`. Title bleibt locale-only. Test deckt FR+empty+DE-fallback case ab. |
| **`buildSlideMeta`-Extraktion ändert `splitAgendaIntoSlides` Pure-Output** | DK-8: alle bestehenden Tests laufen weiter — Extraktion ist refactor, kein semantic change. |
| **`layoutMode` HTTP-Field bricht Snapshot-Tests** | DK-7: Pure-helper bit-identisch, HTTP-Response erweitert (intentional Schema-Erweiterung). Snapshot-Tests werden angepasst. |
| **Empty body / 0 slides** | Resolver explicit (siehe Edge cases). Bestehende Routes haben bereits Empty-Body-Handling (PR #129). |
| **Block-ID format koppelt Persistence an Editor-Generator** (Codex finding) | Centralized via `flattenContentWithIds` + `isExportBlockId`. S1b importiert nur diese helper, kein zweites Regex. Wenn Editor-IDs später UUIDs werden, ändert sich nur der Inhalt (`block:<x>`), nicht die format-validation in S1b. |
| **Override existiert in DB ohne API zum Setzen** | KEIN Risk in S1a — Spalte ist NULL-default und wird via S1a NICHT geschrieben. Resolver tolerates NULL (mode=auto). Tests können DB-direkt schreiben für coverage. |

**Blast Radius**: SMALL. Schema-Spalte + Pure-Helper-Erweiterung + 2 Route-Refactors. Keine neuen Mutation-Pfade. Bestehende Slide-Render-Pipeline funktional unverändert für Einträge ohne Override (= alle bestehenden Einträge).

---

## Implementation Order

1. **Schema-Migration** — `ensureSchema()` `ADD COLUMN IF NOT EXISTS`. (1-Zeile, kein Behavior-Change.)
2. **`src/lib/stable-stringify.ts`** — neue Datei + Tests (~4).
3. **Extends in `src/lib/instagram-post.ts`** (KEIN node:crypto, bleibt client-importable):
   - `export type ExportBlock` + 4 Override-Types (InstagramLayoutOverrides, PerImageCountOverrides, InstagramLayoutOverride, InstagramLayoutSlide)
   - `export function flattenContentWithIds` + Tests (~5)
   - `export function isExportBlockId` + Tests (~3)
   - `export function buildSlideMeta` Extraktion + verify backward-compat (replace inline meta-block in `splitAgendaIntoSlides`)
   - `export function projectAutoBlocksToSlides` + Tests (~4)
   - **Add `export` keyword to currently file-private symbols** that `instagram-overrides.ts` needs to import: `resolveWithDeFallback`, `resolveHashtags`, `resolveImages`, `splitOversizedBlock`. (Bisher private weil nur intern benutzt; werden public weil Cross-File-Konsumption in S1a ansteht. Sind alle pure helpers, kein client-bundle-risk.)
4. **NEU `src/lib/instagram-overrides.ts`** (Node-only):
   - `import { createHash } from "node:crypto"` + `import { stableStringify } from "./stable-stringify"`
   - `import { … } from "./instagram-post"` — alle benötigten helpers + types
   - file-private: `normalizeContentForHash`, `normalizeImagesForHash`, `normalizeGridColumns`, `buildManualSlides`
   - `export function computeLayoutHash` + Tests (~4)
   - `export type ResolverResult` + `export function resolveInstagramSlides` + Tests (~12)
5. **Bestehende Routen** auf Resolver umstellen — `instagram` metadata + `instagram-slide` PNG:
   - SQL um `instagram_layout_i18n` erweitern
   - Type-cast um Override-Intersection erweitern
   - Override extraction `item.instagram_layout_i18n?.[locale]?.[String(imageCount)] ?? null` + an Resolver geben
   - Bestehende `isLocaleEmpty` 404-Early-Return BEIBEHALTEN
   - Metadata-Route: bestehender `image_partial` post-resolver check verbatim erhalten
   - PNG-Route: bestehender `numSlideIdx >= slides.length` 422/404-Guard verbatim erhalten (angepasst auf `result.warnings`/`result.slides`)
   - Snapshot-Tests für `layoutMode` field anpassen; image_partial-Tests verifizieren
6. **DK-10 Stale-Code-Grep** verify.
7. **`pnpm tsc --noEmit` + `pnpm build` (DK-2 — verifies node:crypto bundle-trennung) + `pnpm test` + `pnpm audit --prod`** + commit.
8. **Push → Staging-Deploy** (curl `/api/dashboard/agenda/[id]/instagram?locale=de&images=0` → check response includes `layoutMode: "auto"`).
9. **Codex PR-Review** (max 3 Runden — erwartet 1).
10. **Merge nach grünem Codex + post-merge Verifikation**.

---

## Out of Scope (kommt in S1b oder später)

- `/api/dashboard/agenda/[id]/instagram-layout` GET/PUT/DELETE → **S1b**
- App-side SELECT FOR UPDATE CAS + `computeLayoutVersion` token → **S1b**
- Audit-Log integration (`agenda_layout_update`/`agenda_layout_reset` events sind via S0 in Union, bleiben unbenutzt) → **S1b**
- Manueller staging smoke mit psql UPDATE / disposable test-row / pg_dump → **S1b**
- `patterns/database-concurrency.md` Note (CAS-pattern doc) → **S1b**
- Modal Layout-Tab UI → **S2**
- Drag-and-drop, Custom-Block-Splitting, DE↔FR Vererbung → memory/todo.md
- Per-imageCount orphan-cleanup affordance → S1b decides API-shape; UI-affordance in S2 oder later

---

## Notes

- **Source**: `tasks/instagram-layout-overrides-spec-v3-reference.md` (v3 Sonnet R3 SPLIT-Recommendation Quelle); split-decision driven by Codex spec-eval R1 verdict (SPLIT RECOMMENDED) — see `tasks/codex-spec-review.md`.
- **Foundation gelegt durch**: PR #130 (S0 — Block-ID Stabilität + AuditEvent extension).
- **Spec drift prevention**: dieser file IS canonical. `tasks/spec.md` ist eine Kopie für hook-targeting (post-commit/pre-push). `tasks/todo.md` enthält nur Implementation-Order checkbox-list — KEINE parallelen DKs.
- **Codex R1 split rationale (kept here for context)**: "Schema change on a shared DB + pure layout refactor + 3 new persistence routes with concurrency control + integration rewires of both existing render routes plus staging race-smoke" → 4 risk classes in 1 sprint = too dense. S1a removes the persistence-routes + concurrency + race-smoke; S1b adds them on top of S1a foundation.
