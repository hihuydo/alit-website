# Sprint M3 — Supporter-Logo-Grid für Agenda-Einträge
<!-- Spec: tasks/spec.md -->
<!-- Started: 2026-05-02 -->

## Done-Kriterien

> Alle müssen PASS sein bevor der Sprint als fertig gilt.

- [ ] **DK-1 Build-Test-Audit:** `pnpm build` clean, `pnpm test` clean, `pnpm audit --prod` 0 HIGH/CRITICAL. Tests +50–70 erwartet (Validator + Renderer + Editor + IG-Slide + media-usage + API).
- [ ] **DK-2 Schema-Migration idempotent:** `pnpm dev` auf clean DB → `agenda_items.supporter_logos JSONB NOT NULL DEFAULT '[]'` existiert. 2× Boot ohne Schema-Drift. Existing Prod-Rows nach Deploy: `SELECT supporter_logos FROM agenda_items WHERE id IN (...) ` returns `[]` für alle.
- [ ] **DK-3 Validator FK-Reject:** `validateSupporterLogos([{public_id: "non-existent-uuid", alt: null}])` resolves `{ok: false, error: "Unknown media reference"}`. Cap=8 enforced (9. Logo → `Too many supporter logos (max 8)`). Duplikate gerejected. alt-Trim aktiv (alt=`"  "` → `null`).
- [ ] **DK-4 API Partial-PUT-safe:** `PUT /api/dashboard/agenda/:id` ohne `supporter_logos` Key → DB-Wert unchanged. Mit `supporter_logos: []` → DB cleared zu `[]`. Mit `supporter_logos: [{public_id, alt}]` → ersetzt Array.
- [ ] **DK-5 Audit-Diff:** `agenda_update` Audit-Event hat `supporter_count_before` + `supporter_count_after` Felder NUR wenn supporter_count sich geändert hat. SQL: `SELECT details FROM audit_events WHERE event='agenda_update' ORDER BY id DESC LIMIT 5` zeigt Felder bei Logo-Änderung. Bei unverändertem supporter_logos: keine count-Felder im Audit-Detail.
- [ ] **DK-6 Public Render Conditional:** Agenda-Eintrag mit `supporter_logos.length === 0` → keine Section, kein `<p>` Label im DOM (E2E DOM-Query: `expect($("[data-testid=agenda-supporters]")).not.toBeInDocument()`). Mit `length >= 1` → Section sichtbar, Label korrekt lokalisiert (DE: "Mit freundlicher Unterstützung von", FR: "Avec le soutien aimable de").
- [ ] **DK-7 Public Render Logo-Höhe:** `<img>`-Element hat inline-style `height: clamp(20px, 2.2vw, 28px)` (oder Tailwind-class `h-[clamp(...)]`). Visual-smoke 375px Mobile + 1440px Desktop: Logos einheitlich klein, Breite via aspect-ratio variabel.
- [ ] **DK-8 Editor Multi-Logo-Add:** `/dashboard/` → Agenda-Eintrag editieren → "Logo hinzufügen" → MediaPicker im multi-mode → 3 Logos auswählen → "Bestätigen (3)" → Liste zeigt 3 Logos mit Alt-Inputs + Reorder-Handles + Remove-Buttons. Save → DB-Row hat 3 logos. UI cap-disable: bei 8 logos ist "Logo hinzufügen" disabled.
- [ ] **DK-9 Editor Reorder + Alt-Edit:** Drag-Sort 3 Logos → Save → DB-Order matcht UI-Order. Alt-Edit "Pro Helvetia" → Save → DB `supporter_logos[0].alt === "Pro Helvetia"`. Public Render zeigt korrektes alt-Attribut.
- [ ] **DK-10 MediaPicker Backward-Compat:** Single-mode (existing RichTextEditor + JournalEditor + AgendaSection-Slot-Fill) unverändert. Bestehende `MediaPicker.test.tsx` Tests grün ohne Anpassung an neue API (kein Breaking-Change-Default).
- [ ] **DK-11 IG-Slide-Build (`splitAgendaIntoSlides`):** Item mit `supporter_logos.length > 0` + `imageCount=2` produziert Slides: `[grid, text..., supporters]` mit `slides[last].kind === "supporters"`. Item ohne Logos: keine `kind:"supporters"`-Slide. `slides[last].supporterLabel === "Mit freundlicher Unterstützung von"` für locale=de bzw `"Avec le soutien aimable de"` für locale=fr.
- [ ] **DK-12 IG-Slide-Build Locale-both:** `getSlidesForBoth(item)` aka separater de+fr Build hat ZWEI Supporter-Slides am jeweiligen Ende. Identische `supporterLogos`-Arrays, label gewechselt.
- [ ] **DK-13 IG-Slide-Render via Satori:** `/instagram-slide/[idx]?...` für Supporter-Slide produziert PNG mit Label oben + Logo-Grid darunter. Visual-smoke ZIP-Download zeigt Supporter-Slide am Ende beider Locale-Sets bei `?locale=both`.
- [ ] **DK-14 IG-Audit `supporter_count`:** `audit_events` zeigt für `agenda_instagram_export` Event ein `supporter_count: number` Feld (default 0 wenn keine Logos). Bei `?locale=both`: einmal emittiert, nicht doppelt.
- [ ] **DK-15 Override-Path Parity:** `instagram-overrides.ts:projectAutoBlocksToSlides` produziert dasselbe Supporter-Slide-Result wie `splitAgendaIntoSlides` für Item mit Logos. Property-Test (DK-6 aus S2c-Pattern) auf 3 Fixtures × 2 Locales × 2 imageCount = 12 Combos.
- [ ] **DK-16 Media-Usage Logo-Tracking:** Medien-Tab `/dashboard/` → Logo-File anklicken → "Verwendung" zeigt "Agenda: <Eintrag-Datum>: <Titel>". DELETE auf Logo-File ist disabled (oder warned) wenn Usage > 0.
- [ ] **DK-17 Visual-Smoke Staging:** Agenda-Eintrag auf Staging mit 3-5 echten Logos (mixed Querformat + Square) → Public-Detail-View aufrufen + Mobile (375px) + Desktop (1440px) → Logos sichtbar, Cluster-Wrap funktioniert. IG-Export `?locale=both&images=2` → ZIP runterladen → 4 PNGs öffnen → Supporter-Slide in `de/slide-N.png` + `fr/slide-N.png` ist am Ende, Label korrekt.
- [ ] **DK-18 Code-Quality-Gate:** Sonnet pre-push Gate clean (keine `[Critical]` in `tasks/review.md`). Codex PR-Review keine in-scope `[Critical]` Findings.

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
- [ ] `src/app/api/dashboard/agenda/[id]/instagram/route.ts`: Audit-Event payload um `supporter_count`
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
