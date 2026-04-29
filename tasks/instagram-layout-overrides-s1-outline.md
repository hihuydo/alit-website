# Outline: S1 — Layout-Overrides Backend (Schema + Resolver + 3 API Routes)
<!-- Created: 2026-04-29 -->
<!-- Status: Outline (volle Spec wird geschrieben wenn S0 merged) -->
<!-- Branch: feat/instagram-layout-overrides-backend -->
<!-- Depends on: S0 merged (Block-ID Stabilität + AuditEvent extension) -->
<!-- Source: tasks/instagram-layout-overrides-spec-v3-reference.md -->

## Summary

Backend-Foundation für Layout-Overrides: DB-Spalte, Pure-Resolver, 3 API-Routes (GET/PUT/DELETE). Kein UI. Bestehende Slide-Routes verwenden den Resolver (backward-compat).

## Scope (vorläufig)

- **DB**: `agenda_items.instagram_layout_i18n JSONB NULL` via `ensureSchema()` (idempotent, shared-DB-safe)
- **Pure Helper** (`src/lib/instagram-post.ts` + neue `src/lib/stable-stringify.ts`):
  - `flattenContentWithIds(content) → ExportBlock[]`
  - `stableStringify(value) → string` (recursive sorted-keys walker)
  - `computeLayoutHash({item, locale, imageCount}) → 16-char sha256-prefix` mit DE-fallback für lead/ort/hashtags
  - `computeLayoutVersion(override) → 16-char md5-prefix`
  - `buildManualSlides(item, locale, imageCount, override, exportBlocks, meta, hasGrid, gridImages, gridColumns) → Slide[]`
  - `resolveInstagramSlides(item, locale, imageCount, override?) → ResolverResult` (3 modes: auto/manual/stale)
  - **`buildSlideMeta`** als shared helper extrahiert (war v3 NEW FAIL #M12)
- **API-Routes** `/api/dashboard/agenda/[id]/instagram-layout/route.ts`:
  - `GET ?locale=de&images=N` → mode/contentHash/layoutVersion/slides
  - `PUT` → 200/400/404/409/412/422 mit **app-side SELECT FOR UPDATE CAS** (NICHT md5-in-WHERE — v3 NEW FAIL #C1)
  - `DELETE ?locale=de&images=N` → 204 (idempotent + 2-phase NULL-collapse)
  - Audit-log calls: `auditLog("agenda_layout_update"|"agenda_layout_reset", ...)` (Events sind dank S0 in Union)
- **Bestehende Routen erweitern**:
  - `instagram` (metadata): SELECT um instagram_layout_i18n erweitern, slideCount aus Resolver, response um `layoutMode` Field
  - `instagram-slide` (PNG): SELECT erweitern, Resolver entscheidet Block-Verteilung pro Slide
- **GET Response-Shape Auto-Mode** (v3 NEW FAIL #M1): Server re-berechnet `flattenContentWithIds` + projiziert auto-slides 1-Block-pro-Slide auf Block-IDs (auto-mode liefert "starter layout" das User direkt editieren kann), oder strikte Trennung `{slides: [{blocks: ExportBlock-shape}]}` für manual und `{slides: null}` für auto-mode (UI bietet "Manual editing starten" Button). Variant wird in voller Spec entschieden.

## Tests (vorläufig ~30)

- Pure: ~17 (alle Helper + Resolver in 5 Modi + Edge-Cases)
- API: ~15 (GET/PUT/DELETE happy + alle Error-Codes + audit-log + CAS-race)

## Risk Highlights

- CAS via app-side SELECT FOR UPDATE — pattern: `patterns/database.md` Deterministic-Lock-Order
- DK-12 backward-compat: `splitAgendaIntoSlides` Pure-Output bit-identisch
- HTTP-Response der Metadata-Route bekommt `layoutMode` Field — bestehende Snapshot-Tests müssen angepasst werden

## Out of Scope (kommt in S2)

- Modal UI
- Manueller Smoke für Layout-Override-Workflow

## Notes

- Volle Detail-Spec wird via Planner geschrieben sobald S0 merged ist
- Source-Material: tasks/instagram-layout-overrides-spec-v3-reference.md (besonders §`buildManualSlides`, §Pure Resolver, §Content Hash)
- v3 NEW FAIL #C1 (md5-CAS) muss in voller Spec mit SELECT FOR UPDATE primary path commited werden
- v3 NEW FAIL #M1 (GET-shape) muss in voller Spec mit klarer Variant-Entscheidung addressed werden
- v3 NEW FAIL #M10 (empty body / round-trip) muss klargestellt werden
- v3 NEW FAIL #M11 (SLIDE1_BUDGET in manual no-grid path) muss eingebaut werden
