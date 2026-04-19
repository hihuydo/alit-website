# Spec: Agenda → Instagram Post Generator (v1)
<!-- Created: 2026-04-19 -->
<!-- Author: Planner (Claude) -->
<!-- Status: Draft -->

## Summary
Admin-Dashboard Feature: per-row Button an Agenda-Einträgen öffnet ein Modal, das den Eintrag als 4:5 Instagram-Post-Set (1080×1350 PNG) rendert. Auto-Split auf mehrere Slides bei langem Content; Font-Scale wählbar (klein/mittel/groß). Server-side via `next/og` (built-in Satori+resvg). Design: roter Panel-1-Grund `#ff5048`, PP Fragment Sans weiß. Download als PNG (1 Slide) oder ZIP (N Slides / beide Locales).

## Context
- alit 3-Panel-Website: Panel 1 = Agenda mit rotem Grund `--color-verein: #ff5048`. Panel 2 = Journal schwarz. Panel 3 = weiß. Für Instagram-Export übernehmen wir Panel-1-Ästhetik.
- Agenda-Items leben in `agenda_items`: `datum`, `zeit`, `ort_url`, `title_i18n`, `lead_i18n`, `ort_i18n`, `content_i18n`, `hashtags` (mit `tag_i18n`), `images`. Siehe `src/lib/schema.ts`.
- `content_i18n` ist Rich-Text (JournalContent block[]) — für Instagram flatten wir zu plain-text + fontWeight-Hints pro Block-Typ (heading → ExtraBold, paragraph → Regular).
- Fonts liegen bereits in `public/fonts/` als `.woff2` (PPFragment-SansLight/Regular/ExtraBold + Serif).
- Bestehende Hierarchie in `src/components/AgendaItem.tsx` (Referenz für Design): Meta-Row (Datum+Zeit | Ort) → Titel → Lead → Content → Hashtags.
- Dashboard-Auth: `requireAuth` 3-gate pipeline (JWT → env-scoped DB-tv-check → CSRF auf non-GET). GETs brauchen kein CSRF-Token.

## Requirements

### Must Have (Sprint Contract)

1. **Per-Row „Instagram"-Button** in `AgendaSection.tsx` Row-Actions (neben Edit/Delete). Öffnet `InstagramExportModal` mit current agenda-item-id.

2. **Modal-UI** bietet:
   - Locale-Radio: `DE` / `FR` / `Beide`
   - Font-Scale-Slider: 3 Stufen `S` (klein, ~1800 chars/slide) / `M` (mittel, ~1200) / `L` (groß, ~800)
   - Live-Preview-Grid: N `<img src=.../>` Tiles (1 pro Slide, bei „Beide" 2 Reihen DE+FR)
   - Download-Button: 1 Slide → PNG direkt; mehrere Slides oder „Beide" → ZIP via jszip

3. **Metadata-Route** `GET /api/dashboard/agenda/[id]/instagram?locale=de|fr&scale=s|m|l` → JSON `{slideCount: number, warnings: string[]}`. `requireAuth`-gated, 404 wenn locale-Content leer.

4. **Slide-Route** `GET /api/dashboard/agenda/[id]/instagram-slide/[slideIdx]?locale=X&scale=Y` → `image/png` 1080×1350. Node Runtime (`export const runtime = "nodejs"`). `requireAuth`-gated. 404 wenn slideIdx out-of-range oder locale leer.

5. **Pure Split-Helper** `src/lib/instagram-post.ts`:
   - `splitAgendaIntoSlides(item, locale, scale): {slides: Slide[], warnings: string[]}`
   - Edge-safe (keine fs/Node-only imports — shared zwischen Edge-Middleware-Boundary und Node-Routes)
   - Plain-text-Flattening von JournalContent (paragraph-array preservation + per-block fontWeight-Hint)
   - Hard-Cap 10 Slides. Darüber → `warnings: ["too_long"]` im metadata-endpoint + 422 beim slide-fetch

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

8. **v1 OHNE Bilder**: `item.images` wird ignoriert. Dokumentiert als v2-follow-up.

9. **Audit-Log-Event** pro Download: `agenda.instagram_export` via bestehender `audit_events`-Table (actor_email, entity_type=agenda_items, entity_id, details: `{locale, scale, slideCount, version:1}`). Billigster Visibility-Pfad (siehe patterns/admin-ui.md). **Nur bei `?download=1`**, nicht bei Preview-Requests.

10. **Build + Tests + Audit**: `pnpm build` pass, `pnpm test` pass (neue Tests siehe todo), `pnpm audit --prod` 0 HIGH/CRITICAL.

11. **Staging-Deploy grün + Smoke-Test**: CI success → Login → Agenda-Row → Modal öffnet → Preview rendert 1+ Slide → Download PNG funktioniert → Audit-Log zeigt Event.

### Nice to Have (explicit follow-up, NOT this sprint)
1. Bilder als Hintergrund (blur+dim) oder eigene Slides (v2)
2. Manuelle Slide-Breaks via Marker im Editor
3. Weitere Panel-Farben (Journal-Schwarz, Weiß) als Template-Picker
4. Gleiches Feature für Journal-Einträge + Projekte
5. Editable Slide-Breaks in der Live-Preview (drag text zwischen slides)
6. PDF-Export
7. Auto-Upload via Meta Graph API
8. Client-side html-to-image als Alternative-Renderer

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
| `src/lib/instagram-post.ts` | Create | Pure helper: `Slide` type, `splitAgendaIntoSlides`, `flattenContent` (JournalContent → `{text, weight}[]`). Edge-safe, keine fs |
| `src/lib/instagram-post.test.ts` | Create | Unit: split short → 1 slide, long → N slides, >10 → warning, hashtags nur auf letzter slide, empty locale → throws |
| `src/app/api/dashboard/agenda/[id]/instagram/route.ts` | Create | GET metadata: `requireAuth` → fetch agenda row → `splitAgendaIntoSlides` → JSON `{slideCount, warnings}`. Node runtime |
| `src/app/api/dashboard/agenda/[id]/instagram-slide/[slideIdx]/route.ts` | Create | GET PNG: `requireAuth` → fetch row + split → `new ImageResponse(<SlideTemplate/>, {width:1080, height:1350, fonts:[...]})`. Fonts via `fs.readFileSync` aus `public/fonts/`. Audit-Log `agenda.instagram_export` NUR bei `?download=1`. Node runtime |
| `src/app/api/dashboard/agenda/[id]/instagram-slide/[slideIdx]/slide-template.tsx` | Create | JSX-only-für-Satori Component: nimmt `Slide`, `totalSlides`, `itemMeta` → renders 1080×1350 flex-layout. Inline styles only. Font-families match registered font-names |
| `src/app/dashboard/components/InstagramExportModal.tsx` | Create | Client modal: useState `locale`, `scale`; useEffect fetcht metadata; Preview-Grid via `<img src="/api/.../instagram-slide/N?...">`; Download-Button assembly via jszip |
| `src/app/dashboard/components/AgendaSection.tsx` | Modify | Row-actions: neuer Button „Instagram" öffnet Modal mit `itemId` + schließt auf onClose. Icon via inline-SVG (analog zu Edit/Delete-Buttons). Button nur enabled wenn mindestens DE ODER FR title+content non-empty |

**8 Files total:** 1 deps-bump, 1 helper + test, 2 API-routes (metadata + slide), 1 slide-template, 1 Modal, 1 section-edit.

### Architecture Decisions

- **Server-side rendering via `next/og` (Satori+resvg)**: Built-in in Next.js 16+, keine neuen direkten Runtime-Deps außer jszip. Browser-agnostisch, deterministisch. Nicht client-side html-to-image (font-loading-races, pixel-inkonsistenz zwischen Browsern).
- **Split pro Slide als eigene URL**: sauber fetchbar, einfaches ZIP-assembly-im-Client (N fetches → N blobs → jszip). Alternative „single-endpoint-gibt-ZIP" abgelehnt: Preview würde N extra requests machen für die tiles.
- **Metadata-Route separat**: Client braucht slideCount upfront um Preview-Tiles zu rendern. Probing via „fetch bis 404" wäre unnötig N+1 Requests.
- **Char-threshold-Heuristik für Split statt DOM-measurement**: v1 approximation. Satori misst nichts ohne zu rendern (kein DOM); Admin sieht Preview, scale runtergehen wenn zu gedrängt / raufgehen wenn zu viel Luft. Gut-genug.
- **Node Runtime für beide Routes**: `fs.readFileSync` auf woff2-Fonts funktioniert nicht in Edge. Standalone-build liefert public/ mit aus, `path.join(process.cwd(), "public/fonts/...")` stable.
- **Plain-text-Flattening von Rich-Text**: JournalContent → `{text, weight, isHeading}[]`. Links/Marks ignoriert (Instagram rendert sowieso keine Links in Images). Paragraph-breaks preserved für saubere Satori-Zeilen.
- **GET-Routes + `requireAuth` ohne CSRF**: CSRF ist only non-GET. `requireAuth` 3-gate: JWT → env-scoped tv → CSRF-sub-gate (skipped für GET). Analog zu `/api/auth/csrf/` + `/api/health/`.
- **Audit-Log statt dedizierter Export-Table**: 0-schema-add, existing Audit-UI rendert sofort. Details-JSONB hält `{version:1, locale, scale, slideCount}`.
- **ZIP-Struktur bei „Beide"**: 1 ZIP mit 2 Unterordnern `de/slide-1.png …` + `fr/slide-1.png …`. Alternative „2 separate ZIPs" = extra-Click.

### Dependencies
- **External**: `jszip ^3` (Download-Assembly im Client). Audit beim Sprint-Ende: `pnpm audit --prod`.
- **Internal**: `requireAuth` (api-helpers.ts), `pool` (db.ts), existing agenda-fetch-Pattern aus `/api/dashboard/agenda/[id]/route.ts`, `i18n-field.ts` helpers (`t`, `isEmptyField`), `audit_events`-Table.
- **Env-Vars**: keine neuen. Fonts bundled via public/.

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| Locale leer (kein DE-Titel) | Metadata-Route 404 mit `{error: "locale_empty"}`. Modal: Button „DE" disabled |
| Content komplett leer, nur Titel | 1 Slide mit Titel + Lead; Content-Body empty (flex-spacer fills space) |
| Content >10 Slides bei scale=S | Metadata `warnings: ["too_long"]`. Modal zeigt Hinweis „Bitte größere Schriftgröße wählen". Slide-Route returnt 422 für slideIdx≥10 |
| Hashtags leer | Letzte Slide ohne Hashtag-Section, Content-Body füllt mehr Fläche |
| Hashtag mit langem Tag (>30 chars) | flexWrap im Hashtag-Container, Tag bricht auf neue Zeile |
| Rich-Text mit embedded Images | v1 ignoriert embedded images (nur text-flattening). Dokumentiert, Modal zeigt Info falls images erkannt |
| Slide-index >= slideCount | 404 |
| `scale` Parameter ungültig | 400 bad request |
| `locale` Parameter ungültig | 400 bad request |
| Unauthenticated | 401 via `requireAuth` (gleiche Pipeline wie alle anderen API-Routes) |
| Audit-Log-Insert schlägt fehl | Swallow-error (`\|\| true`), PNG-Response geht raus — Audit darf UX nicht blockieren |
| iOS Safari ZIP-Download | Browser öffnet ZIP inline statt download. Modal zeigt Note „Am besten vom Desktop exportieren". v1-akzeptabel, nicht Must-Have |

## Risks

1. **Font-loading-Pfad im Standalone-Build**: `fs.readFileSync(path.join(process.cwd(), "public/fonts/*.woff2"))` muss im Next.js 16 standalone-Output erreichbar sein. Next.js kopiert public/ neben den standalone-server; Pfad relativ zu cwd stabil. **Mitigation**: Integration-Test der Slide-Route gegen `process.cwd()`-relative Fonts, zusätzlich smoke-Test auf Staging dass Fonts rendern (nicht Satori-Default-Font).

2. **Satori CSS-Subset**: Kein `grid`, kein `filter`, kein `box-shadow`. Layout muss in pure flex ausdrückbar sein. **Mitigation**: Template-File ist isoliert, bei Überraschung einfach umstrukturieren — kein cross-file-impact.

3. **ZIP-Assembly im Client via jszip**: 10 PNGs × 500 KB = 5 MB in-memory + ZIP-building. iOS Safari kann bei 10-Slide-ZIPs zicken. **Mitigation**: dokumentieren als Desktop-first v1, nicht blocker.

4. **Audit-Log-Event-Spam**: Preview-Refresh triggert pro Scale-Change N slide-fetches = N Audit-Events. **Mitigation**: Audit-Event nur beim explizit-Download-Klick loggen, nicht bei Preview-Requests. Unterscheidung via Query-Param `?download=1` (default off → kein audit; `?download=1` → audit). Explicit im Slide-Template-Layout dokumentiert.

5. **Char-Threshold falsch kalibriert**: Slides wirken zu voll/zu leer. **Mitigation**: Admin kann zwischen S/M/L wechseln; Preview zeigt Wirkung. Kalibrierung via 2-3 realer Agenda-Einträge während Implementation.

6. **Lange Titel brechen Slide 1 Layout**: ExtraBold+groß+flex-wrap kann bei 3+ Zeilen unhübsch. **Mitigation**: Titel-Size-Cap bei ~5 Zeilen, danach ellipsis. Visual-Test mit längstem Titel im DB.
