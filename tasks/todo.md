# Sprint M3 — Supporter-Logo-Grid für Agenda-Einträge
<!-- Spec: tasks/spec.md -->
<!-- Started: 2026-05-02 -->

## Done-Kriterien

> Alle müssen PASS sein bevor der Sprint als fertig gilt.

- [x] **DK-1 Build-Test-Audit:** `pnpm build` clean, `pnpm test` 1296/1296 green (+109 von baseline 1187), `pnpm audit --prod` 0 HIGH/0 CRITICAL (1 moderate transitive in next/postcss, pre-existing).
- [x] **DK-2 Schema-Migration idempotent:** `ALTER TABLE agenda_items ADD COLUMN IF NOT EXISTS supporter_logos JSONB NOT NULL DEFAULT '[]'::jsonb` ergänzt in `src/lib/schema.ts`. 2× Boot-Idempotenz via `IF NOT EXISTS`. Staging/Prod-Verify im Visual-Smoke (DK-17).
- [x] **DK-3 Validator FK-Reject:** `validateSupporterLogos` in `src/lib/supporter-logos.ts` mit Cap=8, FK-check, Dup-reject, alt-Trim, dim-validation. 26 Unit-Tests grün.
- [x] **DK-4 API Partial-PUT-safe:** `'supporter_logos' in body` Guard in beiden Routen. PUT ohne Key → SET-Clause unverändert. Mit `[]` → cleared. 9 API-Tests grün.
- [x] **DK-5 (DROPPED — Audit out-of-scope für M3):** Kein audit-extension. Wenn jemals nötig: separater Sprint mit explizitem audit-design.
- [x] **DK-6 Public Render Conditional:** `AgendaSupporters.tsx` `if (logos.length === 0) return null`. AgendaItem mountet Section nur wenn `supporterLogos.length > 0`. Renderer + Position-Tests grün.
- [x] **DK-7 Public Render Logo-Höhe:** `<img>` style `height: clamp(20px, 2.2vw, 28px)` + `width: auto`. File-content-regex Test grün (JSDOM-CSSOM strips clamp). Visual-Smoke ausstehend (DK-17).
- [x] **DK-8 Editor Multi-Logo-Add:** `SupporterLogosEditor.tsx` mit MediaPicker multi-mode. Cap-disable bei 8. 12 Editor-Tests + 6 MediaPicker-multi-mode-Tests grün.
- [x] **DK-9 Editor Reorder + Alt-Edit:** ↑/↓-Buttons + alt-input. Tests grün (move/disable/alt-emit).
- [x] **DK-10 MediaPicker Backward-Compat:** 18/18 existing single-mode Tests grün ohne Anpassung. multi-mode ist opt-in via `multi: true`.
- [x] **DK-11 IG-Slide-Build (resolveInstagramSlides):** Single-Owner-Pattern in `instagram-overrides.ts`. `appendSupporterSlide` als finaler Step. Locale-Label korrekt durchgereicht. Tests: auto/manual/stale-Pfad alle appended.
- [x] **DK-12 IG-Slide-Build Locale-both:** Test "DE label vs FR label are passed through" grün — ZIP-Verify im Visual-Smoke (DK-17).
- [x] **DK-13 IG-Slide-Render via Satori:** `slide-template.tsx` Branch `kind:"supporters"` mit absolute-positioned Layout via `computeSupporterGridLayout`. Visual-Smoke (DK-17).
- [x] **DK-14 (DROPPED — IG-Audit-Extension out-of-scope für M3):** Bestehende `agenda_instagram_export` audit-payload unverändert.
- [x] **DK-15 Override-Path Parity:** Test "DK-15 parity — auto + manual produce identical supporter-slide tail" grün. Single-Owner-Pattern stellt Konvergenz aller 3 Pfade sicher.
- [x] **DK-16 Media-Usage Logo-Tracking:** `media-usage.ts` agenda SELECT erweitert um `COALESCE(supporter_logos, '[]'::jsonb)::text`. Test "matches raw public_id in agenda supporter_logos JSONB" grün.
- [ ] **DK-17 Visual-Smoke Staging:** Wartet auf Staging-Deploy + manuelle Verifikation (Mobile + Desktop + IG-Export).
- [x] **DK-18 Code-Quality-Gate:** Sonnet pre-push Gate clean (3 Push-Runden alle CLEAN). Codex PR-Review 3 Runden: R1 [P2] non-image-rejection (fixed) → R2 [P2] aspect-ratio-clamp (fixed) → R3 APPROVED. Tests final 1300 → 1302 (+115 vs Baseline).

## Tasks

### Phase A — Schema, Validator, Type (Foundation)

- [ ] `src/lib/schema.ts`: `ALTER TABLE agenda_items ADD COLUMN IF NOT EXISTS supporter_logos JSONB NOT NULL DEFAULT '[]'::jsonb` nach existing images-ALTER ergänzen
- [ ] `src/lib/supporter-logos.ts`: `SupporterLogo` interface + `validateSupporterLogos(raw)` async (Cap=8, FK-Check, dup-reject, alt-trim/maxlen)
- [ ] `src/lib/supporter-logos.test.ts`: 8+ Tests (cap-boundary, FK-reject, dup-reject, alt-trim/null/maxlen, public_id-shape, empty)
- [ ] `pnpm test src/lib/supporter-logos.test.ts` grün
- [ ] `pnpm dev` boot-test: Schema-ALTER fired, dev-server steht, `psql -c "\d agenda_items"` zeigt neue Spalte

### Phase B — Public Renderer

- [ ] `src/components/AgendaSupporters.tsx`: `<section>` + `<p>` Label + `<ul/div role="list">` + Logo-`<img>` Pure-Component, props `{logos: SupporterLogo[], label: string}`
- [ ] `src/components/AgendaSupporters.test.tsx`: empty-no-render, single, multi, alt-passthrough, height-style-assertion
- [ ] `src/components/AgendaItem.tsx`: Import + Render am Ende des expanded view (NACH Bilder, VOR Hashtags). Label aus dict via `t()`-Helper passing
- [ ] `src/components/AgendaItem.test.tsx`: Test-Update für Section-Position
- [ ] `pnpm test src/components/AgendaSupporters` + `AgendaItem` grün

### Phase C — Dictionary

- [ ] `src/dictionaries/de.ts`: `agenda.supporters: { label: "Mit freundlicher Unterstützung von", addLogo: "Logo hinzufügen", altPlaceholder: "z.B. Logo Pro Helvetia", removeLogo: "Entfernen", reorderLogos: "Reihenfolge ändern", capReached: "Maximum erreicht (8)" }`
- [ ] `src/dictionaries/fr.ts`: Mirror mit FR-Strings
- [ ] (Wenn dictionary type-strict): Dictionary-Shape-Type erweitern, fehlende Keys → tsc-Fehler
- [ ] `pnpm build` grün

### Phase D — MediaPicker Multi-Mode

- [ ] `src/app/dashboard/components/MediaPicker.tsx`: Optional `multi?: boolean` Prop, internal `selectedSet: Set<string>` + `initialSelectedSet`-Snapshot (für Cancel-rollback). Library-Grid-Tile zeigt Checkmark-Overlay bei selected im multi-mode. "Bestätigen ({n})"-Button im footer (disabled wenn n=0). `onSelect` bei multi: array statt single.
- [ ] `src/app/dashboard/components/MediaPicker.test.tsx`: Backward-compat-Tests (single-select-shape unverändert) + neue multi-mode-Tests (toggle-select, Cancel-rollback, Confirm-emit-array, n=0-disable)
- [ ] `pnpm test MediaPicker` grün

### Phase E — Editor Sub-Component

- [ ] `src/app/dashboard/components/SupporterLogosEditor.tsx`: Add-Button (öffnet MediaPicker multi-mode), Logo-Liste mit DragHandle + Alt-Input (max 500 chars) + Remove-Button. Cap-Disable bei `length >= 8`.
- [ ] `src/app/dashboard/components/SupporterLogosEditor.test.tsx`: add/remove/reorder/alt-edit/cap-disable/dirty-state Tests
- [ ] `src/app/dashboard/components/AgendaSection.tsx`: `<SupporterLogosEditor>` mounten unter dem images-Block, State-Verkabelung wie images
- [ ] Test-Updates für AgendaSection wenn nötig
- [ ] `pnpm test SupporterLogosEditor` + `AgendaSection` grün
- [ ] Manueller Editor-Smoke: 3 Logos hinzufügen, sortieren, Save, reload — Persistence verifiziert

### Phase F — API Routes (POST/PUT/GET)

- [ ] `src/app/api/dashboard/agenda/route.ts`: POST: lese `supporter_logos`, validate, INSERT
- [ ] `src/app/api/dashboard/agenda/[id]/route.ts`: PUT: `'supporter_logos' in input` Guard, validate, UPDATE; GET: select column; audit-Event `agenda_update` payload extended um count-diff
- [ ] Tests für POST/PUT/GET: Partial-PUT-preserve, validate-reject (cap, dup, FK), audit-emit-count-diff
- [ ] `pnpm test agenda` grün

### Phase G — Instagram Slide-Build

- [ ] `src/lib/instagram-post.ts`: `SlideKind` erweitert um `"supporters"`. `Slide` type: optional `supporterLogos?: SupporterSlideLogo[]` + `supporterLabel?: string`. `splitAgendaIntoSlides` hängt Supporter-Slide am Ende (wenn `item.supporter_logos.length > 0`)
- [ ] `src/lib/instagram-supporter-layout.ts`: Pure-Helper `computeSupporterGridLayout(logos, frameW, frameH, label, logoHeight)` → `{label, logos: [{x,y,w,h,public_id}]}`
- [ ] `src/lib/instagram-supporter-layout.test.ts`: Layout-Math-Tests (single-row, multi-row-wrap, cap-honored)
- [ ] `src/lib/instagram-post.test.ts`: Supporter-Slide-Position, locale-both-doubles, count-cap, empty-no-supporter-slide
- [ ] `src/lib/instagram-overrides.ts`: Override-Pfad mirror Supporter-Slide
- [ ] `src/lib/instagram-overrides.test.ts`: Parity-Test override + non-override produzieren identische Supporter-Slide
- [ ] `pnpm test instagram` grün

### Phase H — Instagram Slide-Render

- [ ] `src/components/instagram/slide-template.tsx`: Branch für `kind:"supporters"`, render Label-Header + Logo-Grid via Layout-Helper. `loadMediaAsDataUrl(public_id)` für Logo-bytes
- [ ] `src/app/api/dashboard/agenda/[id]/instagram/route.ts`: KEIN audit-payload extension (out-of-scope M3)
- [ ] `src/app/dashboard/components/InstagramExportModal.tsx`: Hint-Badge "+ N Supporter-Logos" bei `supporter_logos.length > 0`
- [ ] `pnpm test InstagramExportModal` + slide-template grün
- [ ] Manueller IG-Smoke: 1 Eintrag mit 3 Logos → Export `?locale=both&images=2` → ZIP runterladen → 4 PNGs visuell prüfen

### Phase I — Media-Usage-Tracking

- [ ] `src/lib/media-usage.ts`: agenda-fetch SELECT erweitern um `supporter_logos::text`, refText-Concat
- [ ] `src/lib/media-usage.test.ts`: neuer Test (logo-public_id im supporter_logos wird als agenda-usage erkannt)
- [ ] `pnpm test media-usage` grün
- [ ] Manueller Smoke: Medien-Tab → Logo-File → "Verwendung" zeigt "Agenda: …"

### Phase J — Final Gate

- [ ] `pnpm build` clean
- [ ] `pnpm test` clean (alle 1187+~50…+70 Tests grün)
- [ ] `pnpm audit --prod` 0 HIGH/CRITICAL
- [ ] DK-Liste durchgegangen — alle [x]
- [ ] PR aufmachen, Sonnet-Pre-Push-Gate-Auto-Run
- [ ] Codex PR-Review starten

## Notes

- **Patterns referenced (geladen vom Generator):**
  - `database-migrations.md` (additive ALTER)
  - `api-validation.md` (Partial-PUT `'field' in input` Guard)
  - `api.md` (escapeHtml exact-once NEW M2a, Audit-Shape Key-Order)
  - `nextjs-og.md` (Satori CSS-Subset, fitImage helper, base64 data-URL)
  - `admin-ui-forms.md` (Multi-Select picker)
  - `admin-ui.md` (Dirty-Editor Snapshot)
  - `react.md` (react-hooks/purity)
  - `tailwind.md` (clamp() fluid)
  - `testing.md` (Vitest jsdom-pragma, mockReset, file-content-regex)

- **Memory-lessons referenced:**
  - 2026-05-01 Sprint M1 (PR #139): Optimistic-Concurrency NICHT in M3 nötig (last-write-wins akzeptabel, Logo-Konflikte selten)
  - 2026-04-30 S2c (PR #136): DK-6 Editor↔Renderer Lockstep — `splitAgendaIntoSlides` + `instagram-overrides.ts:projectAutoBlocksToSlides` MÜSSEN identische Supporter-Slide produzieren. Property-Test in beiden Pfaden.
  - 2026-04-22 PR #110: Satori `loadMediaAsDataUrl` + `fitImage` Pattern für Logo-bytes
  - 2026-05-02 Sprint M2a (PR #140): escapeHtml exact-once — falls Editor-State HTML-Escape macht, NICHT doppelt escapen

- **Sprint-Größe:** Medium-Large (~22 Files: 12 Create, 10 Modify). Erwarte 5–8 Spec-Runden + 2–3 Codex PR-Runden basierend auf M1/M2a-Komplexität.

- **DK-6 Critical:** Override-Pfad mirror-sync ist der Spot wo S2c P1-Race lebte. Property-Test in lockstep, beide Pfade müssen denselben Supporter-Slide produzieren.

- **Phase-Reihenfolge bewusst:** A→B→C→D→E→F→G→H→I. Dependencies: Phase B braucht A (type), Phase E braucht D (multi-picker), Phase G braucht A (type) + dict (Phase C), Phase H braucht G (slide-build). Kann aber parallelisiert werden wenn Generator multi-track arbeitet — A+C parallel, dann B+D parallel, dann E+F parallel, dann G+I parallel, dann H+J.
