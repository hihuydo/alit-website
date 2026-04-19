# Spec: Agenda → Instagram Post Generator (v1)
<!-- Created: 2026-04-19 -->
<!-- Author: Planner (Claude) -->
<!-- Updated: 2026-04-19 v2 — Codex Spec-R1 findings addressed (11): Beide-Flow explicit gate, DK-9 split to mechanical invariants, v1-no-images user-visible banner, hard-cap clamp semantics, Cache-Control on PNG route, single-flight ZIP mutex, deleted-mid-session modal contract, locale_empty defined on flattened-text, ?download=1 accurately documented, auditLog() helper reused (no route-local INSERT), fail-closed font-loading. DK-13/14 moved to Release-PMC (separate section, not Sprint-Contract). -->
<!-- Updated: 2026-04-19 v3 — Codex Spec-R2 3 new findings addressed: isLocaleEmpty uses hasLocale() helper (not t() with DE-fallback), audit event contract normalized + route-entry invariant documented, "Beide"-Gate disabled während metadata loading (race fix). -->
<!-- Status: Draft (Codex R2 addressed) -->

## Summary
Admin-Dashboard Feature: per-row Button an Agenda-Einträgen öffnet ein Modal, das den Eintrag als 4:5 Instagram-Post-Set (1080×1350 PNG) rendert. Auto-Split auf mehrere Slides bei langem Content; Font-Scale wählbar (klein/mittel/groß). Server-side via `next/og` (built-in Satori+resvg). Design: roter Panel-1-Grund `#ff5048`, PP Fragment Sans weiß. Download als PNG (1 Slide) oder ZIP (N Slides / beide Locales).

## Context
- alit 3-Panel-Website: Panel 1 = Agenda mit rotem Grund `--color-verein: #ff5048`. Panel 2 = Journal schwarz. Panel 3 = weiß. Für Instagram-Export übernehmen wir Panel-1-Ästhetik.
- Agenda-Items leben in `agenda_items`: `datum`, `zeit`, `ort_url`, `title_i18n`, `lead_i18n`, `ort_i18n`, `content_i18n`, `hashtags` (mit `tag_i18n`), `images`. Siehe `src/lib/schema.ts`.
- `content_i18n` ist Rich-Text (JournalContent block[]) — für Instagram flatten wir zu plain-text + fontWeight-Hints pro Block-Typ (heading → ExtraBold, paragraph → Regular). Images/Embeds/Spacers im Rich-Text werden in v1 gestrippt.
- Fonts liegen bereits in `public/fonts/` als `.woff2` (PPFragment-SansLight/Regular/ExtraBold + Serif).
- Bestehende Audit-Infra: `src/lib/audit.ts` (`auditLog(event, details)` stdout-first + DB-persist fire-and-forget) + `src/lib/audit-entity.ts` (`extractAuditEntity` → entity_type/id mapping). Neue Events erweitern das `AuditEvent` union + `extractAuditEntity`-mapping — **keine route-lokalen `INSERT INTO audit_events`**.
- Bestehende Hierarchie in `src/components/AgendaItem.tsx` (Referenz für Design): Meta-Row (Datum+Zeit | Ort) → Titel → Lead → Content → Hashtags.
- Dashboard-Auth: `requireAuth` 3-gate pipeline (JWT → env-scoped DB-tv-check → CSRF auf non-GET). GETs brauchen kein CSRF-Token.

## Requirements

### Must Have (Sprint Contract)

1. **Per-Row „Instagram"-Button** in `AgendaSection.tsx` Row-Actions (neben Edit/Delete). Öffnet `InstagramExportModal` mit current agenda-item-id. Disabled wenn weder DE noch FR exportierbaren Text hat (siehe Must-Have-5 für `locale_empty`-Definition).

2. **Modal-UI** bietet:
   - Locale-Radio: `DE` / `FR` / `Beide`
   - **„Beide"-Gate**: Radio-Option `Beide` disabled in drei Fällen (Tooltip passend): (a) während DE oder FR metadata noch loading (`loading===true` oder unresolved) — verhindert race-window; (b) wenn entweder DE oder FR `locale_empty` — asymmetrische ZIP-Failure-Modes ausgeschlossen; (c) während Single-Flight-Mutex aktiv. Default-Selection öffnet mit einem single-locale (DE wenn vorhanden, sonst FR), nicht „Beide" — so ist das Gate beim ersten Open-Click immer deterministisch.
   - Font-Scale-Slider: 3 Stufen `S` (klein, ~1800 chars/slide) / `M` (mittel, ~1200) / `L` (groß, ~800)
   - Live-Preview-Grid: N `<img src=.../>` Tiles (1 pro Slide, bei „Beide" 2 gestackte Reihen: DE-Grid + FR-Grid, je eigener State)
   - Download-Button mit **Single-Flight-Guard** (`useRef<boolean>`-Mutex + `disabled={inFlight}` + `aria-busy`; release in `finally`). Double-click produziert keinen zweiten Request-Pfad.
   - Bei `item.images.length > 0` ODER Rich-Text mit embedded Images: Info-Banner „Bilder werden in v1 nicht exportiert" im Modal-Header. Non-blocking.
   - Bei Metadata-Response mit `warnings.includes("too_long")`: Banner „Inhalt zu lang — bitte größere Schriftgröße wählen oder kürzen" + Preview-Tiles nur für geclampte Slide-Anzahl (siehe Must-Have-6).

3. **Metadata-Route** `GET /api/dashboard/agenda/[id]/instagram?locale=de|fr&scale=s|m|l` → JSON `{slideCount: number, warnings: string[]}`. `requireAuth`-gated, 404 `{error: "locale_empty"}` wenn exportierbarer Text leer (siehe Must-Have-5). 400 bei invalid query-params.

4. **Slide-Route** `GET /api/dashboard/agenda/[id]/instagram-slide/[slideIdx]?locale=X&scale=Y[&download=1]` → `image/png` 1080×1350. Node Runtime (`export const runtime = "nodejs"`). `requireAuth`-gated. Response-Header `Cache-Control: no-store, private` (nach Agenda-Edit darf kein stale-PNG ausgeliefert werden). 404 wenn slideIdx out-of-range des geclampten Slide-Counts. 422 wenn raw `splitAgendaIntoSlides` > 10 slides UND slideIdx ≥ 10 (Hard-Cap). 400 bei invalid query-params. 404 `{error: "locale_empty"}` wenn locale kein exportierbarer Text.

5. **Pure Split-Helper** `src/lib/instagram-post.ts`:
   - `splitAgendaIntoSlides(item, locale, scale): {slides: Slide[], warnings: string[]}`
   - Edge-safe (keine fs/Node-only imports — shared zwischen Edge-Middleware-Boundary und Node-Routes)
   - `flattenContent(content_i18n[locale]): {text, weight, isHeading}[]` — strippt `image`/`embed`/`spacer`-Blocks, behält nur Text-haltige Blocks.
   - **`locale_empty`-Definition (explizit)**: `isLocaleEmpty(item, locale) === true` genau dann wenn `!hasLocale(item.title_i18n, locale)` UND `flattenContent(item.content_i18n?.[locale] ?? null)` leer oder nur whitespace. Nutzt den bestehenden `hasLocale()`-Helper aus `src/lib/i18n-field.ts` (locale-local, kein DE-fallback) — **nicht** `t()`, weil dessen default `fallback="de"` eine FR-empty + DE-gefüllte Zeile fälschlich als non-empty einstufen würde. `lead_i18n` ist optional und trägt NICHT zur locale-empty-Prüfung bei.
   - Hard-Cap 10 Slides. Bei raw > 10: `slides = slides.slice(0, 10)`, `warnings = [..., "too_long"]`. Metadata-Route returnt den geclampten `slideCount` (≤ 10); Slide-Route 422 für `slideIdx ≥ 10`.

6. **Hierarchie pro Slide spiegelt Agenda-Item**:
   - **Slide 1**: Meta-Row (Datum+Zeit | Ort) | Titel (ExtraBold, groß) | Lead (Regular, mittel) | Content-Part-1 (Regular, multi-paragraph)
   - **Slide 2..N-1**: Slim Header (Datum + Titel-Short, kleiner) | Content-Part-N
   - **Slide N (letzte)**: Wie 2..N-1 + Hashtags am unteren Rand (Mono, vor dem Footer-Bar)
   - **Footer-Bar alle Slides**: „alit.ch" links + „N/total" rechts, 1 Zeile Mono unten

7. **Design**:
   - Background `#ff5048`, Text `#ffffff`
   - Fonts: PP Fragment Sans Light (300) / Regular (400) / ExtraBold (800) — via `fs.readFileSync` aus `public/fonts/*.woff2`, übergeben als `ImageResponse.fonts`
   - Padding: 80px horizontal, 80px top, 60px bottom
   - Layout flex-only (Satori-kompatibel, kein `display: grid`)
   - **Fail-closed Font-Loading**: wenn eine der drei Weight-Dateien beim Route-Handling nicht lesbar ist (throw aus `fs.readFileSync`), returnt die Route 500 + strukturierter Log `[ig-export] font_load_failed weight=<300|400|800> err=<msg>`. Kein Fallback-PNG mit Satori-Default-Font.

8. **v1 OHNE Bilder** in PNGs: `item.images` + embedded Rich-Text-Images werden ignoriert (nur Text-Flattening). Dokumentiert als v2-follow-up. Modal zeigt Info-Banner (siehe Must-Have-2).

9. **Audit-Log via zentralen Helper**:
   - `AuditEvent` union in `src/lib/audit.ts` wird um `"agenda_instagram_export"` erweitert
   - `AuditDetails` bekommt optionale Felder `agenda_id?: number`, `locale?: "de"|"fr"`, `scale?: "s"|"m"|"l"`, `slide_count?: number`. Die Felder sind **type-level optional** (shared `AuditDetails` hält viele Events zusammen), **logisch aber pflicht** für diesen Event — siehe Route-Entry-Invariante unten.
   - `extractAuditEntity` in `src/lib/audit-entity.ts` bekommt Mapping: `agenda_instagram_export` → `{entity_type: "agenda_items", entity_id: typeof details.agenda_id === "number" ? details.agenda_id : null}`. Das `??`-Pattern matcht `password_rehashed` + `slug_fr_change` exakt (bestehende Konvention).
   - Slide-Route ruft **nur** `auditLog("agenda_instagram_export", {...})` — **kein** route-lokaler `INSERT`.
   - **Route-Entry-Invariante**: `params.id` wird zu Beginn der Route via `Number(params.id)` parsed; `Number.isInteger(id) && id > 0` wird als 400-Gate geprüft VOR `requireAuth`. Damit ist `agenda_id` an der auditLog-Callsite garantiert eine gültige positive Integer — die type-level-optionality ist kein runtime-problem. Analog zu existierenden API-routes (`memberships/[id]`, `agenda/[id]`).
   - **Nur bei `?download=1`** feuern. `?download=1` ist ein **Client-declared Export-Intent** (nicht kryptographisch verifizierbar). Ein Admin-Client kann den Flag setzen/weglassen — da die Route `requireAuth`-gated ist und nur Admins überhaupt Zugriff haben, ist das akzeptabel. Der Audit-Event dokumentiert „Admin hat Download-Click ausgelöst" nach Best-Effort, nicht kryptographischen Beweis. Doku: `details` bekommt keinen `verified`-Claim.

10. **Build + Tests + Audit**: `pnpm build` pass, `pnpm test` pass (neue Tests siehe todo), `pnpm audit --prod` 0 HIGH/CRITICAL.

### Nice to Have (explicit follow-up, NOT this sprint)
1. Bilder als Hintergrund (blur+dim) oder eigene Slides (v2)
2. Manuelle Slide-Breaks via Marker im Editor
3. Weitere Panel-Farben (Journal-Schwarz, Weiß) als Template-Picker
4. Gleiches Feature für Journal-Einträge + Projekte
5. Editable Slide-Breaks in der Live-Preview (drag text zwischen slides)
6. PDF-Export
7. Auto-Upload via Meta Graph API
8. Client-side html-to-image als Alternative-Renderer
9. Asymmetric „Beide"-Export mit Partial-Failure-UI (aktuell via Gate ausgeschlossen; bei Bedarf später öffnen)

### Out of Scope
- Video-/Reels-Formate
- Post-Scheduling
- Cross-poster-Sync (Twitter/LinkedIn)
- Bilder-Einbettung v1

## Technical Approach

### Files to Change

| File | Change Type | Description |
|------|-------------|-------------|
| `package.json` | Modify | `+ jszip ^3.x` dep (ZIP-assembly im Client). `next/og` ist built-in in Next.js 16+, keine neue Dep |
| `src/lib/instagram-post.ts` | Create | Pure helper: `Slide` type, `splitAgendaIntoSlides`, `flattenContent`, `isLocaleEmpty(item, locale): boolean`, `SCALE_THRESHOLDS` const. Edge-safe, keine fs |
| `src/lib/instagram-post.test.ts` | Create | Unit: split short → 1 slide, long → N slides, >10 → clamp+warning, hashtags nur auf letzter slide, `isLocaleEmpty` for empty-title+empty-content/image-only-content/whitespace-only, flattenContent strips images/embeds |
| `src/lib/audit.ts` | Modify | Extend `AuditEvent` union mit `"agenda_instagram_export"`, extend `AuditDetails` mit optionalen `agenda_id`, `locale`, `scale`, `slide_count` |
| `src/lib/audit-entity.ts` | Modify | Mapping für `agenda_instagram_export` → `{entity_type: "agenda_items", entity_id: typeof details.agenda_id === "number" ? details.agenda_id : null}` (matcht bestehende `password_rehashed`/`slug_fr_change`-Konvention) |
| `src/lib/audit-entity.test.ts` | Modify | Test-Case für neues Mapping + null-handling (agenda_id missing) |
| `src/app/api/dashboard/agenda/[id]/instagram/route.ts` | Create | GET metadata: `requireAuth` → fetch agenda row → `splitAgendaIntoSlides` → JSON `{slideCount, warnings}`. 404 bei `isLocaleEmpty`. Node runtime |
| `src/app/api/dashboard/agenda/[id]/instagram-slide/[slideIdx]/route.ts` | Create | GET PNG: `requireAuth` → fetch row → `isLocaleEmpty`-check → split → try/catch on `fs.readFileSync` font-load (fail-closed 500) → `new ImageResponse(<SlideTemplate/>, {width:1080, height:1350, fonts:[...]})`. Response-Header `Cache-Control: no-store, private`. Audit via `auditLog()` NUR bei `?download=1`. Node runtime |
| `src/app/api/dashboard/agenda/[id]/instagram-slide/[slideIdx]/slide-template.tsx` | Create | JSX-only-für-Satori Component: nimmt `Slide`, `totalSlides`, `itemMeta` → renders 1080×1350 flex-layout. Inline styles only |
| `src/app/dashboard/components/InstagramExportModal.tsx` | Create | Client modal: useState per-locale `{loading, slideCount, warnings, error}`; useEffect fetcht metadata bei locale/scale-change (bei „Beide" 2 parallele Fetches); Preview-Grid; `useRef<boolean>`-Mutex für Download; 404/410-Handler (refetch once, dann Banner „Eintrag wurde gelöscht" + disable) |
| `src/app/dashboard/components/AgendaSection.tsx` | Modify | Row-actions: neuer Button „Instagram" (inline-SVG), öffnet Modal. Disabled wenn DE+FR beide `isLocaleEmpty` |

**11 Files total:** 1 deps-bump, 1 helper + test (2), 3 audit-updates (2 files + test), 2 API-routes, 1 slide-template, 1 Modal, 1 section-edit.

### Architecture Decisions

- **Server-side rendering via `next/og` (Satori+resvg)**: Built-in in Next.js 16+, keine neuen direkten Runtime-Deps außer jszip. Browser-agnostisch, deterministisch.
- **Split pro Slide als eigene URL**: sauber fetchbar, einfaches ZIP-assembly-im-Client (N fetches → N blobs → jszip). Alternative „single-endpoint-gibt-ZIP" abgelehnt: Preview würde N extra requests machen für die tiles.
- **Metadata-Route separat**: Client braucht slideCount upfront um Preview-Tiles zu rendern.
- **„Beide" via Gate statt Partial-Failure-UI**: Wenn DE oder FR `isLocaleEmpty`, ist „Beide" disabled. Eliminiert asymmetrische-ZIP-State-Maschine komplett. Nice-to-have für v2 wenn Bedarf da ist.
- **Hard-Cap 10 via Clamp**: Metadata returnt `slideCount = min(raw, 10)` + `warnings:["too_long"]`; Preview rendert nur 0..slideCount-1; Slide-Route 422 für ≥10. Kein gebrochenes-Tile-Rendering in der UI.
- **Cache-Control: no-store auf Slide-Route**: Agenda-Content ist mutable (Admin editiert) — Browser-Cache würde stale PNGs ausliefern. Cache-Bust `?v=` im Modal ist zusätzliche Client-Hygiene, aber Header ist die primäre Garantie.
- **Single-Flight-Mutex für ZIP via `useRef<boolean>`**: Synchroner Lock (`useRef.current = true` VOR `setState`/async work) — State-based Guard würde bei double-click-same-tick race (beide Handler sehen stale `false`). Pattern aus `patterns/react.md` „Synchronous useRef-Mutex für Single-Flight in async Handler".
- **Deleted-mid-session-Handling**: Modal cached metadata; bei 404/410 during preview refetch einmal; zweites 404 → Banner + disable download. User-Experience: klare Meldung statt gebrochene Tiles.
- **Char-threshold-Heuristik für Split statt DOM-measurement**: v1 approximation.
- **Node Runtime für beide Routes**: `fs.readFileSync` auf woff2-Fonts funktioniert nicht in Edge.
- **Fail-closed Font-Loading**: partieller Weight-Ausfall wäre leise (PNG kommt zurück, sieht aber falsch aus). try/catch um `fs.readFileSync` pro Weight → bei Fehler 500 + strukturierter Log. Besser hart-fehlschlagen als visuell-falsch.
- **Plain-text-Flattening von Rich-Text**: JournalContent → `{text, weight, isHeading}[]`. Images/Embeds/Spacers gestrippt.
- **GET-Routes + `requireAuth` ohne CSRF**: CSRF ist only non-GET.
- **Audit via zentralem `auditLog()`-Helper statt route-local INSERT**: Event-Typ zentral typisiert, `extractAuditEntity` mappt entity_type/id konsistent. Matcht bestehende events wie `membership_paid_toggle`.
- **ZIP-Struktur bei „Beide"**: 1 ZIP mit 2 Unterordnern `de/slide-1.png …` + `fr/slide-1.png …`. Unterschiedliche Slide-Counts pro Locale sind erlaubt (`isLocaleEmpty`-Gate garantiert beide > 0).

### Dependencies
- **External**: `jszip ^3` (Download-Assembly im Client). Audit beim Sprint-Ende: `pnpm audit --prod`.
- **Internal**: `requireAuth` (api-helpers.ts), `pool` (db.ts), `auditLog` + `extractAuditEntity` (audit.ts + audit-entity.ts), existing agenda-fetch-Pattern, `i18n-field.ts` helpers (`t`, `isEmptyField`).
- **Env-Vars**: keine neuen. Fonts bundled via public/.

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| Locale leer (title+content nach flatten leer) | Metadata 404 `{error: "locale_empty"}`. Modal: Radio-Option disabled, bei „Beide" komplett disabled |
| Locale hat nur Bilder, keinen Text | `flattenContent` returnt leer → `isLocaleEmpty = true` → 404 wie oben |
| Locale hat nur Titel, kein Content | `isLocaleEmpty = false`. 1 Slide mit Titel + Lead (falls present); Content-Body leer |
| Content >10 Slides bei scale=S | Metadata `{slideCount: 10, warnings: ["too_long"]}`. Modal zeigt Warning-Banner + 10 Preview-Tiles. Slide-Route 422 für slideIdx≥10 |
| Hashtags leer | Letzte Slide ohne Hashtag-Section |
| Rich-Text mit embedded Images/Embeds | `flattenContent` strippt sie. Modal zeigt Info-Banner „Bilder werden in v1 nicht exportiert" wenn `images.length > 0` ODER Rich-Text contained non-text-Blocks |
| Slide-index >= slideCount | 404 |
| `scale` / `locale` Parameter ungültig | 400 bad request |
| Unauthenticated | 401 via `requireAuth` |
| Agenda-Item gelöscht nach Modal-Open (mid-session) | Preview-Fetch 404/410: refetch metadata once; zweites 404 → Banner „Eintrag wurde gelöscht" + Download disabled. Modal bleibt offen, User schließt manuell |
| Agenda-Content editiert mid-session | `Cache-Control: no-store` + `?v=` cache-bust im Modal → nächster Preview-Request fetcht fresh. Download verwendet frisch-generierten Inhalt |
| Font-File fehlt oder unlesbar | Route 500 + Log `[ig-export] font_load_failed weight=<N>`. Kein PNG. Modal zeigt Error-State |
| Double-click auf Download-Button | Single-Flight-Mutex blockiert zweiten Call; Button disabled + aria-busy während Assembly |
| „Beide"-Radio aktiv wenn eine Locale mid-session leer wird | Nächstes Metadata-Refetch für die leere Locale returnt 404; Modal setzt `isLocaleEmpty=true` für diese Locale → disabled „Beide" + fällt zurück auf die volle Locale |
| Audit-Log `auditLog()` wirft intern (DB down) | `auditLog` schluckt Error via fire-and-forget; PNG-Response geht raus |
| iOS Safari ZIP-Download | Browser öffnet ZIP inline statt download. Modal zeigt Note „Am besten vom Desktop exportieren" |

## Risks

1. **Font-loading-Pfad im Standalone-Build**: `fs.readFileSync(path.join(process.cwd(), "public/fonts/*.woff2"))` muss im Next.js 16 standalone-Output erreichbar sein. **Mitigation**: Fail-closed bei Font-Fehler (siehe Must-Have-7) — Deploy-Smoke-Test (DK-14 in Release-PMC) verifiziert dass Fonts wirklich laden.

2. **Satori CSS-Subset**: Kein `grid`, kein `filter`, kein `box-shadow`. Layout pure flex. **Mitigation**: Template-File isoliert.

3. **ZIP-Assembly im Client via jszip**: 10 PNGs × 500 KB = 5 MB in-memory. iOS Safari kann zicken. **Mitigation**: Desktop-first-Note im Modal.

4. **Char-Threshold falsch kalibriert**: **Mitigation**: Admin wechselt Scale in Preview.

5. **Lange Titel brechen Slide 1 Layout**: **Mitigation**: Titel-Size-Cap bei ~5 Zeilen.

6. **Audit-Spam bei Script-gesteuertem Misuse**: Ein Admin-Skript könnte die Download-URL mit `?download=1` in Schleife aufrufen → viele `agenda_instagram_export`-Events. **Mitigation**: Akzeptabel da admin-gated (geringer Blast-Radius); bei tatsächlichem Misuse via `audit_events`-Query auffindbar.
