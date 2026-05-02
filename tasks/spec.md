# Spec: Sprint M3 — Supporter-Logo-Grid für Agenda-Einträge
<!-- Created: 2026-05-02 -->
<!-- Author: Planner (Claude) -->
<!-- Status: Draft -->

## Summary

Agenda-Einträge bekommen ein optionales Supporter-Logo-Grid mit lokalisiertem Label "Mit freundlicher Unterstützung von:" / "Avec le soutien aimable de :". Public Detail-View rendert die Logos in einer einheitlich kleinen Reihe (`clamp(20px, 2.2vw, 28px)` Höhe, `flex-wrap`); Instagram-Export hängt am Carousel-Ende einen zusätzlichen Supporter-Slide an. Logos werden aus dem bestehenden Medien-Tab ausgewählt — kein neuer Upload-Pfad.

## Context

- **Existing data model:** `agenda_items` hat bereits ein `images JSONB NOT NULL DEFAULT '[]'` Array für Hauptbilder. Shape via `AgendaImage` interface (`src/lib/agenda-images.ts:5`) mit `public_id`, `orientation`, `width/height/alt/cropX/cropY/fit`. `validateImages()` erzwingt `media`-FK, Hard-Cap 20, Duplikat-Reject.
- **Existing public renderer:** `src/components/AgendaItem.tsx` rendert expanded-view Bilder via 1-col / 2-col Layouts mit `alt={img.alt ?? ""}` Pattern (line 201/241).
- **Existing dashboard editor:** `src/app/dashboard/components/AgendaSection.tsx` hat MediaPicker für Slot-Fill (single-select, slot-targeted via `pickerTargetSlot` State, line 122/127). MediaPicker-Interface ist `onSelect: (result: MediaPickerResult) => void` — single-shot, schließt sich nach Pick.
- **Existing IG-Export:** `src/lib/instagram-post.ts` definiert `SlideKind = "text" | "grid"` (line 208). `splitAgendaIntoSlides(item, locale, imageCount)` baut die Slide-Sequenz. Override-Pfad in `src/lib/instagram-overrides.ts` muss synchron bleiben (DK-6 boundary parity, vgl. `memory/lessons.md` 2026-04-30 S2c).
- **Existing media-usage tracking:** `src/lib/media-usage.ts:75-91` scannt `agenda_items.images::text` per LIKE-match für refText. Critical: ein neuer JSONB-Pfad `supporter_logos` MUSS in dieselbe refText konkateniert werden, sonst kann der Admin Logo-Files löschen die in supporter_logos referenziert sind → broken-image im Public-Render.
- **i18n:** Dictionary-System (`src/dictionaries/de.ts`, `fr.ts`) liefert lokalisiertes UI. Neue Keys für Label + Editor-Strings.

## Requirements

### Must Have (Sprint Contract)

1. **Schema-Migration**: `agenda_items.supporter_logos JSONB NOT NULL DEFAULT '[]'::jsonb`, idempotent in `ensureSchema()` via `ALTER TABLE … ADD COLUMN IF NOT EXISTS`. Existing rows sehen `[]` (kein Visual-Diff, kein Render).
2. **Validator + Type**: Neuer `src/lib/supporter-logos.ts` Pure-Module mit `SupporterLogo` interface (`{public_id: string, alt: string|null}` — KEIN orientation/width/height/crop/fit) und async `validateSupporterLogos(raw)` Funktion. Hard-Cap **8 Logos pro Eintrag** (Public OK, IG-Layout-Constraint = scharfer Cap). Duplikat-Reject. `media`-FK-Check via `SELECT public_id FROM media WHERE public_id = ANY(...)` analog `validateImages`. alt-Trim + max 500 chars.
3. **API**: `POST /api/dashboard/agenda` und `PUT /api/dashboard/agenda/:id` akzeptieren `supporter_logos` field, validieren via `validateSupporterLogos`, schreiben in DB. Partial-PUT-safe: `'supporter_logos' in input` Guard (vgl. `patterns/api-validation.md` undefined-vs-null), bei missing key → preserve. GET-Routen geben `supporter_logos` zurück.
4. **Audit-Event**: Bestehendes `agenda_update`-Event-Detail-Shape erweitert um `supporter_count_before` + `supporter_count_after` bei Änderung (count-diff, NICHT granular pro public_id — vergleichbar zu existing `image_count` Pattern bei IG-Audit). Wenn unverändert: kein Audit-Field. `auditLog`-Helper-Audit-Shape Key-Order konsistent (vgl. `patterns/api.md`).
5. **Public Renderer**: Neuer `src/components/AgendaSupporters.tsx` Pure-Component, gerendert in `AgendaItem.tsx` am Ende des expanded view (NACH Bilder-Block, VOR Hashtags). Bei `supporter_logos.length === 0`: NICHTS rendern (kein Label-only-Block). Bei `length > 0`: `<section>` mit `<h4>` Label + `<ul>` (oder `<div role="list">`) Logo-Reihe. Logo-`<img>` mit `height: clamp(20px, 2.2vw, 28px)`, `width: auto`, `alt={logo.alt ?? ""}`, `loading="lazy"`. Container `flex-wrap` + `gap-3`. Heading-Level: passend zum surrounding-DOM (in expanded view ist h3 typisch — Logo-Section ggf. `<p>` + role="list" um Heading-Outline nicht zu brechen — siehe Decision-Log A).
6. **Dashboard Editor**: Neue Section "Mit freundlicher Unterstützung von" in `AgendaSection.tsx` Edit-Form mit:
   - "Logo hinzufügen"-Button (öffnet MediaPicker im Multi-Select-Modus)
   - Logo-Liste mit Reorder via `DragHandle` (analog `DragHandle.tsx` aus PR #103, NICHT die Auto-Sort-Story aus PR #102), Per-Slot Alt-Text-Input (max 500 chars), "Entfernen"-Button
   - "Logo hinzufügen" disabled wenn `supporter_logos.length >= 8` (UI-Cap mirror des Validator-Cap)
7. **MediaPicker-Multi-Select**: MediaPicker um optionalen `multi: boolean` Prop erweitern (default false = backward-compat single-select). Bei `multi=true`: Selection-Set State, "Bestätigen ({n})"-Button, Cancel rollt zurück. Existing single-select Konsumenten (RichTextEditor + Slot-Fill) ungetouched (default-Verhalten preserved). Decision-Log B begründet warum Extension statt neuer Component.
8. **IG-Slide-Build**: `SlideKind` erweitert um `"supporters"`. Neuer `Slide` Variant-Felder (optional) `supporterLogos?: SupporterSlideLogo[]` und `supporterLabel?: string`. `splitAgendaIntoSlides(item, locale, imageCount)` hängt bei `item.supporter_logos.length > 0` einen `kind:"supporters"`-Slide mit lokalisiertem Label am Ende der Sequenz an. Override-Pfad (`instagram-overrides.ts:projectAutoBlocksToSlides`) mirror-sync (DK-6 parity).
9. **IG-Slide-Render**: Satori-Template `slide-template.tsx` rendert für `kind:"supporters"`: 4:5 Frame, Label oben (Header-Style passend zum Slide-System), darunter Logo-Grid. Logos via `loadMediaAsDataUrl(public_id)` als base64 data-URLs (kein Self-HTTP, vgl. `patterns/nextjs-og.md`). `computeSupporterGridLayout(logos, frameWidth, frameHeight, label)` Pure-Helper berechnet pro Logo `{x,y,width,height}` mit einheitlicher Render-Höhe (z.B. 100px) und packt sie in flex-wrap-Grid. Bei Logo ohne valide media-bytes: Fail-soft skip (consistent mit IG-Bild-Slides Pattern aus PR #110).
10. **IG-Locale-both**: Bei `?locale=both`: 2 Supporter-Slides (de + fr) mit identischen Logo-Bytes, NUR Label-Text gewechselt.
11. **IG-Audit-Extension**: `agenda_instagram_export`-Event-Payload um `supporter_count: number` (analog existing `image_count`). Default 0 wenn keine Logos.
12. **Media-Usage-Extension**: `media-usage.ts` agenda-fetch erweitert: `refText` enthält ZUSÄTZLICH `supporter_logos::text`. Damit zeigt der Medien-Tab pro Logo-File "wird verwendet in Agenda: <Eintrag>" — Admin sieht broken-link-Risk vor Delete.
13. **Dictionary**: Neue Keys `dict.agenda.supporters.label` (DE: "Mit freundlicher Unterstützung von", FR: "Avec le soutien aimable de") + Editor-Strings (DE: "Mit freundlicher Unterstützung von", "Logo hinzufügen", "Alt-Text (optional)", "Entfernen", "Reihenfolge ändern" / FR: jeweils Übersetzungen).
14. **Tests**: Neue Test-Files für Validator (cap-Boundaries, FK-reject, dup-reject, alt-trim/maxlen), Public-Renderer (empty-render-nothing, single-logo, multi-row wrap, alt-passthrough), Editor (add/remove/reorder/alt-edit, cap-disable, dirty-guard parity), IG-Slide-Builder (label-locale-swap, supporter-slide-position-last, locale-both-doubles, count-cap-mirror), MediaPicker-multi-mode (backward-compat single + multi-select-roll-back), media-usage (logo public_id detected from supporter_logos), API (partial-PUT-preserve, audit-diff). Tests-Total +50…+70 erwartet.
15. **Build/Test/Audit-Gate**: `pnpm build` clean, `pnpm test` clean, `pnpm audit --prod` 0 HIGH/CRITICAL.
16. **Visual-Smoke (DK-manual)**: Auf Staging einen Agenda-Eintrag mit 3-5 echten Logos (mixed Querformat + Square) anlegen + Public-Detail-View aufrufen + IG-Export `?locale=both&images=2` runterladen + ZIP visuell prüfen (Supporter-Slide am Ende beider Locale-Sets, Label korrekt gesetzt, Logos lesbar).

> **Wichtig:** Nur Must-Have-Items sind Teil des Sprint Contracts. Diese werden im Review gegen PR-Findings **hart durchgesetzt** — alles außerhalb ist kein Merge-Blocker.

### Nice to Have (explicit follow-up, NOT this sprint)

1. **Logo-Klickbarkeit zu Sponsor-URL** — pro Logo ein optionales `link_url` Field, im Public-Renderer als `<a>` wrap. Würde ENV-driven Validator brauchen (URL-shape, no-javascript:, optional rel="noreferrer noopener"). Sprint M4 wenn Demand.
2. **Zentrale Sponsoren-Bibliothek mit Auswahl** — separate Tabelle `sponsors` mit Logo + Name + URL, agenda_items referenziert FKs. Spart Pflege bei wiederkehrenden Sponsoren. Sprint M5+ wenn echtes Pain.
3. **Logo-Crop / per-Image-Aspect-Override** — Logos werden as-uploaded skaliert. Falls je nötig: separater Sprint analog Agenda-Bilder-Crop (Sprint 2 deferred).
4. **Granulares Audit-Diff (per public_id added/removed)** — count-diff reicht für M3. Wenn forensik-detail nötig: separate JSON-Diff in audit_events.details.
5. **"Hauptsponsor"-Highlighting** — größeres Logo, anderer Slot. UX-research first.

> **Regel:** Nice-to-Have wird im aktuellen Sprint NICHT gebaut. Beim Wrap-Up wandern diese Items nach `memory/todo.md`.

### Out of Scope

- Logo-Klickbarkeit (siehe Nice-to-Have #1)
- Zentrale Sponsoren-Bibliothek (siehe Nice-to-Have #2)
- Logo-Crop / Aspect-Override (siehe Nice-to-Have #3)
- Aspect-Ratio-Normalisierung der Logos (mixed Querformat + Square ist gewollt)
- Klickbare Logos in IG-Export (IG-Slides sind PNG)
- Newsletter/Mitgliedschaft-Mail-Logo-Footer (nicht Teil dieses Sprints — separater Sprint wenn nötig)

## Technical Approach

### Files to Change

| File | Change Type | Description |
|------|-------------|-------------|
| `src/lib/schema.ts` | Modify | `ALTER TABLE agenda_items ADD COLUMN IF NOT EXISTS supporter_logos JSONB NOT NULL DEFAULT '[]'` nach existing images-ALTER (~line 84) |
| `src/lib/supporter-logos.ts` | Create | `SupporterLogo` type + `validateSupporterLogos(raw)` async validator (Pure module, einziger DB-Hit ist FK-Check via shared `pool`) |
| `src/lib/supporter-logos.test.ts` | Create | Validator-Tests (cap, dup, FK, alt-len, alt-trim, public_id-shape) |
| `src/components/AgendaSupporters.tsx` | Create | Public-Renderer Pure-Component mit `{logos, label}` Props |
| `src/components/AgendaSupporters.test.tsx` | Create | Renderer-Tests (empty-no-render, single, multi, alt-passthrough, wrap-class) |
| `src/components/AgendaItem.tsx` | Modify | Import + Render `<AgendaSupporters>` am Ende des expanded view, NACH Bilder, VOR Hashtags |
| `src/app/dashboard/components/MediaPicker.tsx` | Modify | Optional `multi: boolean` Prop, Selection-Set State im multi-mode, "Bestätigen ({n})"-Button, Cancel-rollback |
| `src/app/dashboard/components/MediaPicker.test.tsx` | Modify | Tests für multi-mode (backward-compat single + multi-select-Bestätigung + Cancel-rollback) |
| `src/app/dashboard/components/SupporterLogosEditor.tsx` | Create | Sub-Editor: Add-Button (öffnet MediaPicker multi-mode), Liste mit DragHandle + Alt-Input + Remove |
| `src/app/dashboard/components/SupporterLogosEditor.test.tsx` | Create | Editor-Tests (add/remove/reorder/alt-edit, cap-disable, dirty-state) |
| `src/app/dashboard/components/AgendaSection.tsx` | Modify | Mount `<SupporterLogosEditor>` im Edit-Form unter dem images-Block, State-Verkabelung wie `images` |
| `src/app/api/dashboard/agenda/route.ts` | Modify | POST: `supporter_logos` in body lesen + `validateSupporterLogos` + INSERT |
| `src/app/api/dashboard/agenda/[id]/route.ts` | Modify | PUT: `'supporter_logos' in input` Partial-PUT-Guard, validate + UPDATE; GET: select column; audit-diff für count |
| `src/lib/instagram-post.ts` | Modify | `SlideKind` erweitert um `"supporters"`, `Slide` type um `supporterLogos?` + `supporterLabel?`, `splitAgendaIntoSlides` hängt Supporter-Slide an Ende, `flattenContent` unverändert (Supporter ist NICHT im content-Pfad) |
| `src/lib/instagram-post.test.ts` | Modify | Neue Tests (Supporter-Slide-Position, locale-both-doubles, count-cap, empty-no-supporter-slide) |
| `src/lib/instagram-overrides.ts` | Modify | Override-Pfad: Supporter-Slide am Ende mirror-anhängen, DK-6 boundary-parity |
| `src/lib/instagram-overrides.test.ts` | Modify | Parity-Test override + non-override produzieren identische Supporter-Slide |
| `src/lib/instagram-supporter-layout.ts` | Create | Pure-Helper `computeSupporterGridLayout(logos, frameW, frameH, label, logoHeight)` → `{label: {y, fontSize}, logos: [{public_id, x, y, w, h}]}` |
| `src/lib/instagram-supporter-layout.test.ts` | Create | Layout-Math-Tests (single-row, multi-row-wrap, max-cap-honored, label-overflow-handle) |
| `src/components/instagram/slide-template.tsx` | Modify | Neuer Branch für `kind:"supporters"`, render Label-Header + Logo-Grid via Layout-Helper |
| `src/app/api/dashboard/agenda/[id]/instagram/route.ts` | Modify | Audit-Event payload um `supporter_count` extended, supporter_logos im response-shape |
| `src/app/instagram-slide/[slideIdx]/route.tsx` | Modify | Pass-through der Supporter-Slide an Template (sollte mostly transparent sein wenn `Slide` discriminated union sauber renderered wird) |
| `src/app/dashboard/components/InstagramExportModal.tsx` | Modify | Wenn `item.supporter_logos.length > 0`: Hint-Badge "+ N Supporter-Logos" zeigen (UX-clarity, nicht block) |
| `src/lib/media-usage.ts` | Modify | Agenda-fetch SELECT um `supporter_logos::text` erweitern, `refText` Concat ergänzen |
| `src/lib/media-usage.test.ts` | Modify | Neuer Test: logo-public_id im supporter_logos wird als agenda-usage erkannt |
| `src/dictionaries/de.ts` | Modify | `agenda.supporters` Block: `label`, `addLogo`, `altPlaceholder`, `removeLogo`, `reorderLogos`, `capReached` |
| `src/dictionaries/fr.ts` | Modify | Mirror DE-Keys |
| `src/lib/dictionary-shape.ts` (oder type-File) | Modify (if exists) | Erweitern wenn dictionary-shape typed ist |

**Total: ~22 Files** (12 Create, 10 Modify) — Medium-Large.

### Architecture Decisions

**Decision A — Heading-Level für Public-Block:**
- **Chosen:** `<section>` mit `<p class="…">` als Label (NICHT `<h4>`).
- **Reasoning:** AgendaItem expanded view hat bereits `<h3>` für Titel und `<h4>`-Slots (Bilder-Caption etc.). Ein neues `<h4>` würde Heading-Outline ohne semantic-content padden ("Mit freundlicher Unterstützung von:" ist mehr Caption als Section-Heading). `<p>` mit visual-styling matcht UX-Intent + cleaner a11y. ARIA-mapping: `<section aria-label="…">` umschließt für Screenreader-Skip.
- **Alternative considered:** `<h4>` würde Outline-Konsistenz suggerieren — abgelehnt weil Logo-Block ist supportive content, nicht navigable section.

**Decision B — MediaPicker Extension vs. neue Component:**
- **Chosen:** MediaPicker um `multi?: boolean` Prop erweitern.
- **Reasoning:** (1) MediaPicker hat bereits Library-Grid + Search + Tab-Switching — duplizieren würde 80% Code-Reuse verlieren. (2) Backward-compat: default `multi=false` → existing 4 Konsumenten (RichTextEditor + AgendaSection-Slot-Fill + JournalEditor + …) ungetouched. (3) Caption-Dirty-Guard (PR #84) ist im Caption-Flow, NICHT im Library-Flow — multi-mode liegt im Library-Flow → kein Konflikt.
- **Alternative considered:** Separate `MultiMediaPicker.tsx`-Component — abgelehnt wegen 80% Duplication. Modal-Stack-Composition (Picker im Picker) wäre overkill.
- **Trap-Mitigation:** Multi-Mode hat eigenen `selectedSet: Set<string>` State + own Dirty-Tracking (selectedSet !== initialSet → Confirm enabled). Cancel rollt nicht den Outer-Form-State zurück, NUR die Picker-internal Selection.

**Decision C — Audit-Diff Granularität:**
- **Chosen:** count-diff (`supporter_count_before/after`), NICHT per-public_id-diff.
- **Reasoning:** Mirrors existing `image_count` Pattern aus IG-Audit (PR #110). Forensik-Detail (welche Logos genau) ist nice-to-have, count-Trend reicht für M3-Acceptance ("Admin hat Logos gepflegt"). Wenn jemals nötig: separater Audit-Field `supporter_logos_diff: {added: string[], removed: string[]}`.

**Decision D — IG-Supporter-Slide Hard-Cap:**
- **Chosen:** Hard-Cap 8 Logos enforced VALIDATOR-side (Public + IG share denselben Cap).
- **Reasoning:** IG-Frame ist 1080×1350 (4:5). Bei Logo-Render-Höhe 100px (passend zur Slide) + 16px gap + ~150px-300px Logo-Breite (variabel je Aspect): 4 Logos pro Reihe, 2 Reihen = 8 Logos passen sauber rein. >8 → entweder shrinken (Logos werden unleserlich) oder weiter wrappen (overflow, Layout-Risk). Cap-on-Validator hält Public + IG konsistent. UI-Disable des Add-Buttons mirror-enforces.
- **Alternative considered:** Excess-Slide (>8 Logos → 2. Supporter-Slide) — abgelehnt wegen IG-Carousel-Gesamtcap (10 Slides total nach Sprint M2-pre). Zu viele Supporter würden Beschreibungs-Slides verdrängen.
- **Alternative considered:** Cap=12 Public + Cap=8 IG (split-cap). Abgelehnt: Inkonsistenz zwischen UI-Kontexten verwirrt User ("warum kann ich 12 hinzufügen aber IG-Export zeigt nur 8?"). Single source of truth = Validator.

**Decision E — IG-Supporter-Slide Position:**
- **Chosen:** AM ENDE der Slide-Sequenz, NACH Beschreibungs-Slides, NACH Image-Slides (wenn `?images=N>0`).
- **Reasoning:** "Mit freundlicher Unterstützung" ist Closing-Credit — passt am Ende. User scrollt durch Carousel von links nach rechts, Supporter-Card als finaler Slide ist Brand-Convention (Filme: Credits am Ende). Grid+Lead-Slide am Anfang würde gegen die "Logos sind backing-credit, nicht Hero"-Semantik verstoßen.
- **Alternative considered:** Vor Beschreibungs-Slides (= Slide 2). Abgelehnt: bricht visual-flow.

**Decision F — Validator-FK-Check in MediaPicker-multi vs. POST/PUT:**
- **Chosen:** FK-Check NUR in `validateSupporterLogos` (Server-side bei POST/PUT). MediaPicker-multi rendert nur was er aus `media`-Table kriegt → public_ids sind per Construction valide; Race-Risk = Admin löscht media-File zwischen Picker-Open und Save → POST/PUT-Validator catched FK-Violation → 400 mit klarer Meldung.
- **Reasoning:** Defense-in-Depth durch zwei Layers wäre überspezifiziert. Single Source of Truth = Server-Validator. Klient-side Race-Window ist <1s für realistic Admin-Flows.

### Dependencies

- **DB:** keine neuen ENV, keine neuen Tables, nur additive ALTER auf `agenda_items`. Idempotent. Shared-DB-safe (Staging + Prod teilen DB → ALTER ist safe weil DEFAULT '[]').
- **External:** keine neuen npm-deps (nodemailer/Satori bereits installiert, keine neuen Mailcaps).
- **Internal:** kein Konflikt mit M2a (Mail-Sprint). Build kann parallel zu M2a-Phase-2 laufen — Mail-ENV-Befüllung beeinflusst Logo-Sprint nicht.
- **Patterns referenced:**
  - `database-migrations.md` — additive ALTER pattern, idempotent ensureSchema
  - `api-validation.md` — Partial-PUT `'field' in input` Guard
  - `nextjs-og.md` — Satori CSS-Subset, fitImage helper, base64 data-URL
  - `admin-ui-forms.md` — Multi-Select picker pattern
  - `admin-ui.md` — Dirty-Editor Snapshot
  - `api.md` — escapeHtml exact-once (NEW M2a wrap-up), Audit-Shape Key-Order

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| Empty `supporter_logos` (`[]`) | Public: kein Block (kein Label-only). IG: kein Supporter-Slide. Editor: Section sichtbar mit "Logo hinzufügen"-Button + Empty-State-Hint. |
| `supporter_logos` enthält Logo das aus `media`-Table gelöscht wurde | POST/PUT: 400 "Unknown media reference". GET (read-existing): Public-Renderer rendert `<img>` mit broken-src — Browser zeigt alt-text. IG-Export: `loadMediaAsDataUrl` returns null → fail-soft skip im Layout. media-usage-Index zeigt orphan-removed nicht mehr (FK-broken Row landet in stale-data). |
| Single Logo (length=1) | Public: 1 Logo allein in Reihe (kein Wrap). IG: 1 Logo zentriert auf Supporter-Slide unter Label. |
| Mixed Querformat + Square | Beide werden auf einheitliche Höhe `clamp(20px, 2.2vw, 28px)` skaliert; Breite via `width: auto`. Visuell unterschiedliche Breiten, gewünscht. |
| Logo mit fehlendem alt-Text | `alt={logo.alt ?? ""}` → decorative für Screenreader. Im Editor: Alt-Input leer + Placeholder-Hint "z.B. Logo Pro Helvetia". |
| Cap-Boundary (8 Logos) | Validator: 9. Logo POST/PUT → 400 "Too many supporter logos (max 8)". UI: Add-Button disabled bei `length >= 8` + Hint "Maximum erreicht (8)". |
| Locale=both IG-Export | 2 Supporter-Slides am Ende (de/slide-N.png + fr/slide-N.png), identische Logo-Bytes, nur Label-Text gewechselt. Audit `supporter_count` wird einmal pro DOWNLOAD-call emittiert (nicht doppelt für both-Locales — siehe IG-Audit aus PR #110). |
| Logo gehört zu media-File die GERADE umbenannt wird | media.public_id ist UUID-stable (Rename ändert NUR caption/filename, nicht public_id). Kein Render-Issue. |
| Concurrent Edit (zwei Admins) | Keine Optimistic-Concurrency in M3 (agenda-items haben keine etag). Last-write-wins, übernommen aus existing `images`-Verhalten. Wenn problem: separater Sprint analog M1. |
| Drag-Reorder während Save in-flight | Editor disabled save-button während save-pending; reorder-State updated lokal, merged in nächste save. Kein race. |
| MediaPicker-multi Cancel mit ausgewählten Logos | Selection-Set wird verworfen, Outer-Form-State unverändert. |
| MediaPicker-multi Confirm mit 0 ausgewählten | Confirm-Button disabled wenn `selectedSet.size === 0` (no-op). |

## Risks

- **Risk: MediaPicker-multi-mode bricht existing single-select-Konsumenten**  
  *Mitigation:* `multi?: boolean = false` default backward-compat. Tests für single-mode unverändert grün halten + neue tests für multi-mode. Manuelle Smoke: RichTextEditor inline-image + AgendaSection-Slot-Fill nach Sprint nochmal klicken.

- **Risk: `SlideKind = "text" | "grid"` → "supporters" Erweiterung trifft exhaustive switch-statements im Repo** (TypeScript checks)  
  *Mitigation:* `tsc --noEmit` im pre-commit hook fängt fehlende cases. Audit-grep aller `switch (slide.kind)` und `case "text":/case "grid":` nach Sprint. Ggf. `assertNever`-Helper-Pattern wenn nicht schon vorhanden.

- **Risk: IG-Supporter-Slide Layout wirkt visuell unbalanciert wenn Logos sehr unterschiedliche Aspect-Ratios haben** (Querformat 4:1 + Square 1:1 nebeneinander)  
  *Mitigation:* Einheitliche Render-Höhe (z.B. 100px im 1350px-Frame), Breite frei. Visual-Smoke (DK-16) catched UX-Issues. Falls problematisch: Sprint-Followup mit Aspect-Slot-Padding o.ä.

- **Risk: media-usage-Query wird langsamer durch zusätzliches `supporter_logos::text` concat**  
  *Mitigation:* `images::text` ist bereits ein full-table-scan-friendly Pattern. Ein zweiter JSONB::text-cast ist <1ms-Impact bei <1000 agenda-rows. Bei großem Wachstum: separater Index. Aktuelle DB hat ~10-20 agenda-rows, no-issue.

- **Risk: Audit-Shape Key-Order-Drift** (vgl. `patterns/api.md` Audit-Shape Key-Order-Invariante)  
  *Mitigation:* Audit-Field `supporter_count_before/after` hinten an Key-Liste anhängen, nicht in middle. Tests via raw-string-assertion wenn Key-Order strict war (prüfen: gibt es bestehenden Audit-Key-Order-Test für `agenda_update`?).

- **Risk: `splitAgendaIntoSlides` + `instagram-overrides.ts` Drift** (DK-6 parity)  
  *Mitigation:* Beide Pfade müssen denselben Supporter-Slide-Build aufrufen — extrahiert in shared Pure-Helper `appendSupporterSlide(slides, item, locale, label)`. Test in lockstep.

- **Risk: Validator FK-Race**: Admin lädt Picker, ein anderer Admin löscht media-File, erster Admin saved.  
  *Mitigation:* `validateSupporterLogos` macht FK-Check zu POST/PUT-Zeit → 400. Klares Error-Mapping in Editor "Logo wurde gelöscht — bitte erneut auswählen". Race-Window <1s für realistic flows = akzeptabel ohne Lock.

