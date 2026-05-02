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
- **i18n:** Dictionary-System in `src/i18n/dictionaries.ts` (single file mit beiden locales als sub-objects, exported `getDictionary(locale): Dictionary`) liefert lokalisiertes UI. **Neue Public-Keys** unter neuem top-level key `agenda.supporters` (NUR `label` + `supporterSlideLabel` — Public-/Export-facing). **Dashboard-Editor-Strings separat** als locale-agnostic `DASHBOARD_SUPPORTER_STRINGS` const im Editor-Modul (DE-only, kein dict-import). Vgl. §13 für die exact-Trennung beider sources.

## Requirements

### Must Have (Sprint Contract)

1. **Schema-Migration**: `agenda_items.supporter_logos JSONB NOT NULL DEFAULT '[]'::jsonb`, idempotent in `ensureSchema()` via `ALTER TABLE … ADD COLUMN IF NOT EXISTS`. Existing rows sehen `[]` (kein Visual-Diff, kein Render).
2. **Validator + Type**: Neuer `src/lib/supporter-logos.ts` Pure-Module mit:
   - `SupporterLogo` interface: `{public_id: string, alt: string | null, width: number | null, height: number | null}` — width/height optional (`null` wenn pre-existing Logo ohne probe oder browser-probe failed). Browser-probe ans Picker-confirm-time analog `AgendaSection.tsx::probeImageUrl()` (line 259) — same Pattern wie für `images` JSONB. **KEIN** orientation/crop/fit (Logos brauchen das nicht).
   - **`validateSupporterLogos(raw)` async** mit exact signature: `Promise<{ok: true, value: SupporterLogo[]} | {ok: false, error: string}>` (analog `validateImages` ValidationResult).
   - Hard-Cap **8 Logos pro Eintrag** (Public OK, IG-Layout-Constraint = scharfer Cap).
   - **Guard-Reihenfolge** (deterministisch, in dieser exact Order):
     1. `if (raw === undefined)` → `{ok: true, value: []}` (empty-default für absent POST-key)
     2. `if (!Array.isArray(raw))` → `{ok: false, error: "supporter_logos must be an array"}`
     3. **early-exit empty: `if (raw.length === 0)` → `{ok: true, value: []}`** (skip FK-check + dup-check für common-case empty arrays — analog `validateImages` Pattern, spart DB-roundtrip)
     4. cap: `if (raw.length > 8)` → reject
     5. per-Logo: validate fields:
        - `public_id`: `typeof === "string"` AND `.trim().length > 0` AND length ≤ 100. Wenn nicht string → reject `"Each logo needs a public_id"` (NICHT silent-coerce — würde zu SQL type-error werden statt clean 400).
        - `alt`: optional (siehe alt-handling unten)
        - `width/height`: optional, `number > 0 && Number.isFinite`, gerundet via `Math.round()` auf Integer (consistent mit `validateImages` Pattern)
     6. dup-detect: same public_id 2× → reject
     7. FK-Check: `SELECT public_id FROM media WHERE public_id = ANY(...)` → fehlende public_ids → reject. **DB-Error-Handling**: Wenn `pool.query` selbst rejected (DB-down, connection-loss, timeout): Fehler propagiert ungeschwallt aus dem Validator → POST/PUT-handler fängt ihn als 500 (NICHT 400, weil DB-issue ≠ user-input-issue). Pattern: route-handler hat `try { const validation = await validateSupporterLogos(...) } catch (err) { /* 500 + log */ }`. Test: mock `pool.query` mit rejection → assert 500 response.
   - Error-Message-Strings (frozen, exhaustive, used in Test-Assertions): `"supporter_logos must be an array"`, `"Too many supporter logos (max 8)"`, `"Duplicate supporter logo"`, `"Unknown media reference"`, `"alt must be a string"`, `"alt text too long"`, `"public_id too long (max 100 chars)"`, `"Each logo needs a public_id"`, `"width must be a positive number"`, `"height must be a positive number"`.
   - **`alt` handling**:
     - `alt` key absent OR `=== undefined` OR `=== null` → `null` (kein Error)
     - `typeof alt === "string"` → trim → `""` → `null`; sonst use trimmed string
     - `typeof alt !== "string" && alt !== null && alt !== undefined` → reject `"alt must be a string"` (z.B. number, object)
     - alt > 500 chars (post-trim) → reject `"alt text too long"`
   - **`width/height` handling**:
     - `undefined`/`null` → `null` (pre-existing logo without probe — square-fallback im Render)
     - `number > 0 && Number.isFinite` → keep, gerundet auf int
     - `number ≤ 0`/non-finite/non-number → reject `"width|height must be a positive number"`
   - **`public_id` length cap**: max 100 chars (UUID ist 36).
3. **API**: `POST /api/dashboard/agenda` und `PUT /api/dashboard/agenda/:id` akzeptieren `supporter_logos` field, validieren via `validateSupporterLogos`, schreiben in DB.
   - **PUT (partial)**: `'supporter_logos' in input` Guard (vgl. `patterns/api-validation.md` undefined-vs-null) → bei missing key → preserve via `CASE WHEN`.
   - **POST (create)**: `'supporter_logos' in body ? await validateSupporterLogos(body.supporter_logos) : {ok: true, value: []}` — bei missing key → `[]` Default (entspricht DB-DEFAULT, kein extra SQL nötig). Validator NICHT mit `undefined` aufrufen.
   - GET-Routen geben `supporter_logos` zurück. Auch `instagram/route.ts` SELECT muss `supporter_logos` mitliefern (für IG-Slide-Build).
4. **Audit-Event: OUT OF SCOPE für M3.** Code-inspection bestätigt: `agenda_update`-Event existiert NICHT in `src/lib/audit.ts`, und `PUT /api/dashboard/agenda/[id]` ruft `auditLog` aktuell nicht. M3 führt **kein** neues Audit-Event ein und extends auch keinen bestehenden. Logo-Pflege ist nicht security-critical und keine vorhandene Convention erzwingt audit-tracking für agenda-content-Änderungen. Wenn audit-tracking jemals nötig: separater Sprint (siehe Nice-to-Have). **Konsequenzen für Spec:** Decision J (audit-key-order) gestrichen, Decision M (IG-Audit-Extension) modifiziert (siehe §11), kein DK für audit-fields, keine audit-Test-Anforderungen.
5. **Public Renderer**: Neuer `src/components/AgendaSupporters.tsx` Pure-Component mit Props `{logos: SupporterLogo[], label: string}` — beide REQUIRED. Caller (`AgendaItem.tsx`) resolvt label via dictionary lookup (siehe Implementation-Detail unten) und passt es als prop. Komponente macht KEINE i18n-Logik selbst (Edge-safe, keine dict-Imports).
   - **Render**: gerendert in `AgendaItem.tsx` am Ende des expanded view (NACH Bilder-Block + Content/Beschreibung, VOR Hashtags — Position 4.5 in der Expanded-View-Reihenfolge). Bei `logos.length === 0`: NICHTS rendern (kein Label-only-Block). Bei `length > 0`: `<section aria-label={label}>` (aria-label = label-string, gibt Screen-Reader klare Section-Identifikation) mit `<p>` Label + `<div role="list">` Logo-Reihe (siehe Decision A: `<p>` statt `<h4>`). Logo-`<img>` mit `style={{height: "clamp(20px, 2.2vw, 28px)", width: "auto"}}`, `alt={logo.alt ?? ""}`, `loading="lazy"`. Container `flex-wrap` + `gap-3`. Jedes Logo wrapped in `<div role="listitem">` für a11y-flat-list.
   - **Label-Prop-Source — exact threading chain (verifiziert per code-grep)**:
     1. `Wrapper.tsx` (line 27) hat `dict` bereits als prop verfügbar.
     2. `Wrapper.tsx` (line 157) rendert `<AgendaPanel ... supportersLabel={dict.agenda.supporters.label} />` — Wrapper resolvt aus dict.
     3. `AgendaPanel.tsx` bekommt neuen required prop `supportersLabel: string`, passt durch zu `<AgendaItem ... supportersLabel={supportersLabel} />`.
     4. `AgendaItem.tsx` bekommt neuen required prop `supportersLabel: string`, passt durch zu `<AgendaSupporters logos={item.supporter_logos} label={supportersLabel} />`.
     5. `AgendaSupporters.tsx` Prop ist `label: string`.
     **Begründung**: AgendaPanel + AgendaItem haben aktuell KEIN `dict` prop (verifiziert). Neuer string-prop-thread ist minimal-invasive. Wrapper ist der natürliche resolution-point weil er bereits dict hat. Wenn `dict.agenda.supporters` fehlt → TypeScript catched (dict ist getypt).
6. **Dashboard Editor**: Neue Section "Mit freundlicher Unterstützung von" in `AgendaSection.tsx` Edit-Form mit:
   - "Logo hinzufügen"-Button (öffnet MediaPicker im Multi-Select-Modus mit `maxSelectable={8 - supporter_logos.length}` Prop — dynamisch berechnet aus aktuellem state)
   - Logo-Liste mit Reorder via `DragHandle` (analog `DragHandle.tsx` aus PR #103, NICHT die Auto-Sort-Story aus PR #102), Per-Slot Alt-Text-Input (max 500 chars), "Entfernen"-Button
   - "Logo hinzufügen"-Button disabled wenn `supporter_logos.length >= 8` (UI-Cap mirror des Validator-Cap; bei disabled: aria-label um capReached-string ergänzen)
7. **MediaPicker-Multi-Select**: MediaPicker erweitert um vier optionale Props (default-werte halten single-mode 100% backward-compat):
   - `multi?: boolean = false` — schaltet Multi-Mode an
   - `maxSelectable?: number` — hard-cap (im Multi-Mode UI: Tile-Click no-op wenn `selectedSet.size >= maxSelectable`)
   - `capReachedMessage?: string` — caller-resolvter String, wird vom Picker bei cap-violation als inline-Hint im footer-bereich geshown. MediaPicker hat KEINE dict-Imports — caller (Dashboard-Editor) passt `DASHBOARD_SUPPORTER_STRINGS.capReached` durch (Dashboard ist locale-agnostic, DE-only, kein dict). Wenn prop nicht gesetzt + cap erreicht: silent no-op (kein Hint).
   - `onConfirm?: (results: MediaPickerResult[]) => void` — multi-mode confirm-callback. Im Multi-Mode IGNORIERT der Picker `onSelect` und ruft AUSSCHLIESSLICH `onConfirm` mit Array auf (klare Trennung der zwei Modi).
   - **UX-Mode-Restriction**: Multi-Mode zeigt **NUR die Library-Tab/View** — Upload-Section (`MediaPicker.tsx:111`) UND Embed-URL-Section (`MediaPicker.tsx:157`) UND Caption/Width-Inputs sind **hidden/disabled**. Begründung: Logos kommen aus existing media-Library (User-Decision: kein neuer Upload-Pfad). Ein `multi=true`-User soll keine Embed-URLs auswählen können — die haben keine `public_id` und würden den DB-FK-check des supporter-validators failen. Implementation: outer-Wrap `{!multi && <UploadSection ... />}`, etc.
   - **`MediaPickerResult` extended um `public_id?: string`** (immer populated wenn der ausgewählte Eintrag aus der Library kommt — was im Multi-Mode der einzige Pfad ist; bei Single-Mode embed-URL bleibt undefined). Sub-Editor extrahiert public_id direkt aus diesem Feld, KEIN String-Parse aus `src`.
   - **WO public_id populated wird** (concrete Implementation in MediaPicker.tsx): selectedSet hält `Set<string>` (public_ids). Library-Tile-Click toggle-added zu/entfernt aus selectedSet (multi-mode). Bei Confirm-Click: `onConfirm(Array.from(selectedSet).map(public_id => buildResultFromMediaItem(public_id)))` — `buildResultFromMediaItem` ist die existing single-mode Logik die `MediaPickerResult` baut, jetzt erweitert um `public_id` field. Single-mode behält bisherige `onSelect`-Pfade unverändert (kein public_id-populate für embed-URLs).
   - Multi-Mode UX: Selection-Set-State + "Bestätigen ({n})"-Button (disabled wenn n=0). Cancel rollt zurück (only Picker-internal selection, NICHT outer-form). Existing single-select Konsumenten (RichTextEditor + Slot-Fill + JournalEditor) ungetouched (default `multi=false` preserved).
   - **Reset-Lifecycle**: `selectedSet` wird auf `Set()` (empty) reset bei jedem `open=true→false→true` Transition (Picker schließt + öffnet neu). Implementation: `useEffect(() => { if (open) setSelectedSet(new Set()); }, [open])`. Damit kann User nach Add-and-confirm den Picker wieder öffnen und kriegt sauberen Slate (nicht versehentlich dieselben Logos re-add). KEIN Carry-over zwischen open-cycles.
8. **IG-Slide-Build**: `SlideKind` erweitert um `"supporters"`. Neuer `Slide` Variant-Felder (optional) `supporterLogos?: SupporterSlideLogo[]` und `supporterLabel?: string`.
   - **`SupporterSlideLogo` Type** (definiert in `src/lib/supporter-logos.ts`, IMPORTIERT von `instagram-post.ts` — siehe Decision N gegen circular imports): `{public_id: string, alt: string | null, dataUrl: string, width: number | null, height: number | null}` — IG-Render-shape inkl. dimensions für aspect-correct Satori-Rendering. Satori unterstützt KEIN `width: auto` (vgl. `patterns/nextjs-og.md`). Dimensions stammen aus dem `supporter_logos` JSONB selbst (browser-probed beim Picker-confirm), NICHT aus dem `media`-Table.
   - **`AgendaItemForExport` extended**: zusätzliches Feld `supporter_logos: SupporterLogo[]` — **NICHT optional** (default `[]` via SQL `COALESCE(supporter_logos, '[]'::jsonb)` für ältere Rows; `undefined` darf nie das array sein). Existing Tests mit `baseItem()`-helpers MÜSSEN um `supporter_logos: []` ergänzt werden.
   - **Korrektur:** `projectAutoBlocksToSlides` lebt in `src/lib/instagram-post.ts:672` (NICHT in `instagram-overrides.ts`). LayoutEditor + Override-Pfad rufen es über `resolveInstagramSlides` aus `instagram-overrides.ts`.
   - **`appendSupporterSlide(slides, supporterSlideLogos, label, meta)` Pure-Helper** (NEU, `src/lib/instagram-supporter-slide.ts`, **canonical signature: 4 params**): nimmt aktuelle Slide-Liste + pre-resolved `SupporterSlideLogo[]` + resolved label-string + `SlideMeta` (vom caller via `buildSlideMeta(item, locale)` resolved). Gibt erweiterte Slide-Liste zurück. **Atomares Verhalten**: (a) flippt `slides[slides.length - 1].isLast = false` via cloned-last (immutable, NICHT mutation), (b) appended `kind:"supporters"`-Slide mit `isLast: true`, `index: prev.length`, `supporterLogos: <param>`, `supporterLabel: <param>`, `meta: <param>`. **Edge case** `slides.length === 0`: direkt single-supporter-slide mit `isLast: true` + `index: 0`. **Edge case** `supporterSlideLogos.length === 0`: no-op return slides unchanged.
   - **DK-6 parity guarantee — Single-Ownership-Pattern**: `appendSupporterSlide` wird **AUSSCHLIESSLICH IN `resolveInstagramSlides`** aufgerufen — am Ende, nachdem entweder auto-path oder override-path die Slide-Sequence gebaut hat. Das ist der canonical entry-point für Production-Slide-Build aus allen 3 route-handlers (instagram, instagram-slide, instagram-layout).
     - `splitAgendaIntoSlides` macht KEIN Supporter-Append — es ist die low-level auto-pipeline. Bestehende Tests bleiben unberührt durch supporter-Logik (kein `?supporterSlideLogos` 4. param hier).
     - `projectAutoBlocksToSlides` ist ein NIEDRIGERER PIPELINE-LAYER — returns `ExportBlock[][]` (block-groups per slide), NICHT `Slide[]`. Sie wird NICHT erweitert, KEIN Supporter-Append (architectural mismatch).
     - **`resolveInstagramSlides` ist der Single Owner** des Supporter-Slide-Appends. Beide Branches (`if (!override)` auto + override-with-projections) calling `appendSupporterSlide(slides, supporterSlideLogos, supporterLabel, slideMeta)` als finalen Step BEVOR return.
   - **Signatur-Erweiterungen** — minimal-invasiv:
     - `splitAgendaIntoSlides(item, locale, imageCount=0): {slides: Slide[], warnings: string[]}` — UNVERÄNDERT.
     - `projectAutoBlocksToSlides(item, locale, imageCount, exportBlocks): ExportBlock[][]` — UNVERÄNDERT (lower-level, no supporters).
     - `resolveInstagramSlides(item, locale, imageCount, override?, supporterSlideLogos?: SupporterSlideLogo[], supporterLabel?: string): ResolverResult` — **NEUE optionale 5./6. Params** am Ende. Wenn beide gesetzt + `supporterSlideLogos.length > 0`: rufe `appendSupporterSlide(...)` auf result.slides BEFORE return.
   - **`ResolverResult.slides` extends**: nach append ist `slides[last]` ein `kind:"supporters"`-Slide. Bestehende `mode: "auto" | "manual" | "stale"` und `warnings` unverändert.
   - **Defensive-Throw — Exact Condition**: `if (supporterSlideLogos && supporterSlideLogos.length > 0 && !supporterLabel) throw new Error("supporterLabel required when supporterSlideLogos provided")`. NICHT `!== undefined` — sonst würde der `[]`-empty-no-label backward-compat-fall throwen. Pinning-test in `instagram-overrides.test.ts`: `expect(() => resolveInstagramSlides(item, locale, imageCount, null, [], undefined)).not.toThrow()` (empty array + no label = OK), `expect(() => resolveInstagramSlides(item, locale, imageCount, null, [{...logo}], undefined)).toThrow()` (populated + no label = throw).
   - **IG 10-Slide-Cap Respect (CRITICAL)**: `splitAgendaIntoSlides` capped intern auf `SLIDE_HARD_CAP = 10` (vgl. `instagram-post.ts:166`). Wenn supporter-logos vorhanden sind, würde naives append einen 11. Slide produzieren → Bruch der IG-Carousel-Konvention. **Fix in `resolveInstagramSlides` BEVOR appendSupporterSlide**: wenn `result.slides.length === SLIDE_HARD_CAP` und supporters gehen rein → drop die LAST content-slide vor append. Sicherstellt total ≤ 10. Implementation:
     ```ts
     if (supporterSlideLogos && supporterSlideLogos.length > 0 && supporterLabel) {
       let baseSlides = result.slides;
       if (baseSlides.length >= SLIDE_HARD_CAP) {
         // Reserve the last slot for supporters; drop trailing content slide.
         baseSlides = baseSlides.slice(0, SLIDE_HARD_CAP - 1);
         result = { ...result, warnings: [...result.warnings, "supporter_slide_replaced_last_content"] };
       }
       const meta = baseSlides[0]?.meta ?? buildSlideMeta(item, locale);
       const finalSlides = appendSupporterSlide(baseSlides, supporterSlideLogos, supporterLabel, meta);
       result = { ...result, slides: finalSlides };
     }
     return result;
     ```
     Warning `"supporter_slide_replaced_last_content"` informiert User dass Content gekürzt wurde. Nicht-blocking. **`SLIDE_HARD_CAP` muss aus instagram-post.ts exported werden** wenn er nicht schon ist (Generator-Pflicht: prüfen + ggf. `export const SLIDE_HARD_CAP = 10`).
   - **Call-Site type-narrowing + Return-Type-Wrap**: `appendSupporterSlide` requires `SupporterSlideLogo[]` + `string` (NICHT optional) UND returns `Slide[]`. `resolveInstagramSlides` returns `ResolverResult` (`{slides, warnings, mode, contentHash}`). Append must wrap back:
     ```ts
     // inside resolveInstagramSlides (auto branch):
     let result: ResolverResult = { ...autoResult, mode: "auto", contentHash };
     if (supporterSlideLogos && supporterSlideLogos.length > 0 && supporterLabel) {
       const meta = result.slides[0]?.meta ?? buildSlideMeta(item, locale);
       const finalSlides = appendSupporterSlide(result.slides, supporterSlideLogos, supporterLabel, meta);
       result = { ...result, slides: finalSlides };
     }
     return result;
     ```
     Der combined-narrowing-check (`supporterSlideLogos && length > 0 && supporterLabel`) stellt sicher dass beide non-undefined sind BEVOR appendSupporterSlide aufgerufen wird. **NICHT** `appendSupporterSlide(slides, supporterSlideLogos ?? [], supporterLabel ?? "", meta)` — würde empty-array-non-no-op + broken-empty-label-render produzieren. **NICHT** `return appendSupporterSlide(...)` direkt — return-type-mismatch (Slide[] vs ResolverResult).
   - **Stale-Override-Branch**: Wenn `resolveInstagramSlides` einen `mode: "stale"` Branch hat (override exists aber contentHash mismatch → fallback auf auto + warning), MUSS dieser Branch ebenfalls `appendSupporterSlide` mit denselben params aufrufen. Items mit stale-overrides würden sonst keine Supporter-Slide im IG-Export zeigen während die Public-View sie zeigt — Inkonsistenz. Single-Owner-Pattern erstreckt sich auf ALLE 3 Branches: auto, manual, stale.
   - **`appendSupporterSlide` SlideMeta-Resolution**: Resolved per `meta = resolverResult.slides[0]?.meta ?? buildSlideMeta(item, locale)` — verwendet meta vom ersten existing slide oder fresh-build. Im edge-case `slides.length === 0` (locale_empty): kein meta verfügbar — append wird gar nicht erst gerufen weil `slides.length === 0` aus locale-fail kommt; Pre-condition.
   - **Label-Resolution-Chain**: Route-handlers resolven `supporterLabel` via `getDictionary(locale).agenda.supporters.label` und passen durch. Bei `?locale=both`: route ruft `resolveInstagramSlides` 2× — einmal pro locale mit jeweils dem Locale-Label.
   - **Bestehende `splitAgendaIntoSlides` Tests**: bleiben unberührt (keine Signatur-Änderung). Neue Supporter-Tests landen alle in `instagram-overrides.test.ts` (resolveInstagramSlides) ODER `instagram-supporter-slide.test.ts` (helper).
9. **IG-Slide-Render — Pre-Load + Render-Splitting**:
   - **Pre-Load Helper** (NEU, in `src/lib/supporter-logos.ts` exported): `async loadSupporterSlideLogos(logos: SupporterLogo[]): Promise<SupporterSlideLogo[]>` ruft `Promise.all(...)` auf `loadMediaAsDataUrl` für jede public_id. **width/height kommen aus dem JSONB selbst** (input `SupporterLogo.width/height`) — KEIN media-Table-Query für dimensions. dataUrl wird mit den existing-JSONB-dimensions gepaart. Returns nur Logos mit valider dataUrl (null gefiltert).
   - **Fail-soft DB error handling**: Wenn `loadMediaAsDataUrl` für ein Logo wirft (z.B. DB-down): try/catch → null → out-filter. Wenn ALLE failen → empty array → upstream renders kein Supporter-Slide. Niemals `throw` propagiert hoch.
   - DRY: alle 3 Route-Handler (instagram/route.ts, instagram-slide/[idx]/route.tsx, instagram-layout/route.ts) rufen denselben Helper.
   - **Route handlers pre-loaden vor jedem Slide-Build**:
     - `/api/dashboard/agenda/[id]/instagram` (ZIP+metadata)
     - `/instagram-slide/[slideIdx]` (single PNG)
     - `/api/dashboard/agenda/[id]/instagram-layout` (LayoutEditor preview)
   - Pattern: `const supporterSlideLogos = await loadSupporterSlideLogos(item.supporter_logos ?? []); const supporterLabel = getDictionary(locale).agenda.supporters.label; const result = resolveInstagramSlides(item, locale, imageCount, override, supporterSlideLogos, supporterLabel);` — single Production-Entry-Point. NIE direkt `splitAgendaIntoSlides` aus route handler.
   - **Null-Coalescing**: ALLE call-sites verwenden `(item.supporter_logos ?? []).map(...)` Pattern. Defense-in-Depth gegen DB-Migration-Race oder unmigrated-row.
   - Der `Slide`-Build ist sync (Satori-Constraint, vgl. `patterns/nextjs-og.md`); kein `loadMediaAsDataUrl` darf im template oder im pure helper aufgerufen werden.
   - Bei Logo ohne valide media-bytes (404 / DELETE-race): `loadMediaAsDataUrl` returns null → in pre-load-helper gefiltert → kein leerer slot im rendered slide.
   - **Satori-Template `slide-template.tsx`** branch für `kind:"supporters"`: 4:5 Frame, Label oben (Header-Style passend zum Slide-System), darunter Logo-Grid. Liest `slide.supporterLogos: SupporterSlideLogo[]` und nutzt `dataUrl` direkt im `<img src={...} width={w} height={h}>` (explizite dimensions PFLICHT, Satori-Constraint). **Layout via `position: "absolute"`**: Satori unterstützt `flexWrap: "wrap"` NICHT zuverlässig (vgl. `patterns/nextjs-og.md` lessons). Logos werden in absolute-positioned divs platziert, jedes mit `style={{position: "absolute", left: x + "px", top: y + "px", width: w + "px", height: h + "px"}}`. Outer-Container hat `position: "relative", width: frameWidth + "px", height: frameHeight + "px"`. Label ähnlich `position: "absolute", top: label.y + "px", left: IG_FRAME_PADDING + "px", fontSize: label.fontSize + "px"`.
   - **Frame-Konstanten** (frozen, single source of truth in `src/lib/instagram-supporter-layout.ts` als exported consts): `IG_FRAME_WIDTH = 1080`, `IG_FRAME_HEIGHT = 1350`, `IG_FRAME_PADDING = 80`, `SUPPORTER_LABEL_HEIGHT_RESERVE = 100`, `SUPPORTER_LOGO_HEIGHT = 100`, `SUPPORTER_LOGO_GAP = 24`, `SUPPORTER_LABEL_FONT_SIZE = 32`. Slide-Template importiert sie statt eigene zu definieren.
   - **`computeSupporterGridLayout(logos, frameWidth, frameHeight, label)` Pure-Helper** — 4 params. **`label` use**: NUR für return-shape `{label: {y, fontSize}}` (positions-meta, keine string-text-passthrough — Template hat den label-string bereits aus `slide.supporterLabel`). **`frameHeight` use**: Vertikales-Bounds-Check — wenn final-y + LOGO_HEIGHT > frameHeight - IG_FRAME_PADDING (Logos passen nicht in Frame), wird in dev-mode `console.warn` emittiert (real-world cap=8 + LOGO_HEIGHT=100 + GAP=24 + LABEL_RESERVE=100 = max 4-5 Reihen passt sicher in 1350-160=1190px. Über-cap → silent overflow akzeptiert, dev-warn als safety-net). Berechnet pro Logo `{public_id, x, y, w, h, alt, dataUrl}`:
     - **w-Berechnung**: `w = SUPPORTER_LOGO_HEIGHT * (logo.width / logo.height)` wenn beide dimensions valid (typeof number, >0, finite), sonst `w = SUPPORTER_LOGO_HEIGHT` (square fallback). Damit landscape-Logos breiter, square-Logos quadratisch.
     - Einheitliche `h = SUPPORTER_LOGO_HEIGHT`.
     - flex-wrap Layout — **explizit pseudocode**:
       ```
       const contentEnd = frameWidth - IG_FRAME_PADDING;
       let x = IG_FRAME_PADDING;
       let y = IG_FRAME_PADDING + SUPPORTER_LABEL_HEIGHT_RESERVE;
       for each logo:
         const w = computeWidth(logo, SUPPORTER_LOGO_HEIGHT); // square-fallback if dimensions null
         if (x + w > contentEnd && x > IG_FRAME_PADDING) {
           // wrap to next row (only if at least one logo already in current row)
           x = IG_FRAME_PADDING;
           y += SUPPORTER_LOGO_HEIGHT + SUPPORTER_LOGO_GAP;
         }
         emit logo with {x, y, w, h: SUPPORTER_LOGO_HEIGHT, alt, dataUrl, public_id};
         x += w + SUPPORTER_LOGO_GAP;
       ```
     - **Wichtig**: Overflow-check `x + w > contentEnd` ohne trailing GAP (weil das letzte Logo in der Reihe keinen GAP braucht). Single-logo-overflow (Logo breiter als content-width): rendert trotzdem in der Reihe, OUR-OF-FRAME-BLEED ist akzeptiert (sehr seltener Edge-Case bei extrem-Querformat-Logos — visual-smoke catched).
     - Return-shape: `{label: {y: number, fontSize: number}, logos: Array<{public_id, x, y, w, h, alt, dataUrl}>}`.
     - `label.y` = `IG_FRAME_PADDING` (top-of-frame), `label.fontSize` = `SUPPORTER_LABEL_FONT_SIZE`.
     - **Erste Logo-Reihe Y-Coordinate**: `IG_FRAME_PADDING + SUPPORTER_LABEL_HEIGHT_RESERVE` (label oben + reserve-Höhe für label-Block). Subsequent rows: `prev_y + SUPPORTER_LOGO_HEIGHT + SUPPORTER_LOGO_GAP`.
     - Logo-`alt` + `dataUrl` durchgereicht (a11y + render).
   - **Call-Location**: `computeSupporterGridLayout` wird IN `slide-template.tsx` aufgerufen (sync, im Satori render path), nicht im route handler. Layout-Berechnung ist deterministisch und billig — keine pre-compute nötig.
10. **IG-Locale-both**: Bei `?locale=both`: Route-handler ruft die **override-aware Build-Function** (`resolveInstagramSlides(item, locale, imageCount, override, supporterSlideLogos, supporterLabel)`) **2× auf** — einmal für `locale="de"` mit DE-label, einmal für `locale="fr"` mit FR-label. Identische `supporterSlideLogos`-Bytes, locale-spezifischer label-string. Resultat: 2 separate Slide-Sequences (de/fr), jede mit Supporter-Slide am Ende. **4. Param ist `override: InstagramLayoutOverride | null`** (verifiziert per `instagram-overrides.ts:160-164`), NICHT exportBlocks.
   - **Wichtig:** NIE `splitAgendaIntoSlides` direkt vom Route-Handler aufrufen — `splitAgendaIntoSlides` ist auto-only (kein override). `resolveInstagramSlides` ist der canonical Production-Entry-Point (handles override+auto).
11. **IG-Audit-Extension: OUT OF SCOPE.** `agenda_instagram_export` audit-payload bleibt unverändert. Begründung: konsistent mit Decision §4 — kein neuer audit-write in M3. Wenn jemals supporter-export-tracking gewünscht: separater Sprint mit explizitem audit-extension-design.
12. **Media-Usage-Extension**: `media-usage.ts` agenda-fetch erweitert: `refText` enthält ZUSÄTZLICH `supporter_logos::text`. Damit zeigt der Medien-Tab pro Logo-File "wird verwendet in Agenda: <Eintrag>" — Admin sieht broken-link-Risk vor Delete.
13. **Strings — zwei getrennte Sources** (clean separation Dashboard vs Public):

    **Public-page dictionary `dict.agenda.supporters`** (locale-aware DE+FR, in `src/i18n/dictionaries.ts`, von Public-Renderer + Satori-Slide-Templates + LayoutEditor-Preview konsumiert):
    - DE: `{label: "Mit freundlicher Unterstützung von", supporterSlideLabel: "Supporter-Folie"}`
    - FR: `{label: "Avec le soutien aimable de", supporterSlideLabel: "Slide soutiens"}`
    - Konsumenten: `<AgendaSupporters label={dict.agenda.supporters.label} />` (Public-Renderer), `getDictionary(locale).agenda.supporters.label` (IG-Slide-build im route-handler), `getDictionary(locale).agenda.supporters.supporterSlideLabel` (LayoutEditor read-only Slide-card-label).
    - **LayoutEditor-Sonderfall** (bewusst dict statt DASHBOARD-const): LayoutEditor zeigt eine **Preview des locale-spezifischen Export-Outputs** — wenn Admin den DE-Export previewt, soll das Slide-Card-Label "Supporter-Folie" zeigen; bei FR-Export "Slide soutiens". Der LayoutEditor hat bereits `locale: Locale` als prop (es ist eine per-locale-Preview-UI). Daher dict-resolution hier korrekt — es ist NICHT ein UI-Editor-string, sondern eine content-preview-string die zur Export-Locale gehört.

    **Dashboard-strings `DASHBOARD_SUPPORTER_STRINGS`** (locale-agnostic DE-only const, exported aus `src/app/dashboard/components/SupporterLogosEditor.tsx` oder co-located helper):
    - `{addLogo: "Logo hinzufügen", altPlaceholder: "z.B. Logo Pro Helvetia", removeLogo: "Entfernen", reorderLogos: "Reihenfolge ändern", capReached: "Maximum erreicht (8 Logos)", probeFailure: "Logo wurde hinzugefügt, aber die Größe konnte nicht ermittelt werden.", warningSlideReplaced: "Letzter Inhalts-Slide wurde durch Supporter-Folie ersetzt (max. 10 Slides)"}`
    - Konsumenten: `<SupporterLogosEditor strings={DASHBOARD_SUPPORTER_STRINGS} />`, MediaPicker `capReachedMessage={DASHBOARD_SUPPORTER_STRINGS.capReached}`, InstagramExportModal warning-render `DASHBOARD_SUPPORTER_STRINGS.warningSlideReplaced`.
    - **Begründung Trennung:** Dashboard ist locale-agnostic (kein /de/-prefix, Admin-Team DE), Public-page ist locale-aware (DE+FR User). Mischung würde Konsumenten verwirren.
    - **`capReached` ist statisch** (cap=8 single source of truth via Validator-Const), kein `{n}`-Placeholder. Wenn cap je geändert wird: an EINER Stelle (Validator-Const) anpassen, const-string mit anpassen.
14. **Tests**: Neue + erweiterte Test-Files (Files-to-Change-erweitert, ALLE explizit aufgelistet):
    - `src/lib/supporter-logos.test.ts` (Create) — Validator: cap, dup, FK, alt, public_id, width/height, non-array, undefined, empty-early-exit. Plus loadSupporterSlideLogos: dataUrl + dimensions roundtrip, null-filter via type-predicate, fail-soft per-logo isolation, import-from-instagram-images mock.
    - `src/lib/probe-image.test.ts` (Create) — JSDOM Image-mock, MUSS `// @vitest-environment jsdom` pragma haben.
    - `src/components/AgendaSupporters.test.tsx` (Create) — Renderer: empty-no-render, single, multi, alt-passthrough, height-style-assertion. MUSS `// @vitest-environment jsdom` pragma haben.
    - `src/app/dashboard/components/SupporterLogosEditor.test.tsx` (Create) — Editor: controlled-onChange, add/remove/reorder/alt-edit, cap-disable, MediaPicker-multi-confirm-thread, probe-failure-inline-banner (mit `DASHBOARD_SUPPORTER_STRINGS.probeFailure` als visible-text + dismiss-X-button).
    - `src/lib/instagram-supporter-slide.test.ts` (Create) — appendSupporterSlide: 4 params, immutability invariants, isLast-flip, isFirst-on-empty-input edge-case, no-op for empty supporter array.
    - `src/lib/instagram-supporter-layout.test.ts` (Create) — Layout-math: pseudocode coverage (single-row, multi-row-wrap, square-fallback, x-coordinate-tracking, label-positions).
    - `src/lib/instagram-post.test.ts` (Modify) — **NUR Test-Fixtures (`baseItem()`-helpers) um `supporter_logos: []` ergänzen** — TS-fail wenn missed. KEINE neuen Supporter-Slide-Tests hier (Single-Owner: alle Supporter-Logik lebt in resolveInstagramSlides + helper, NICHT in splitAgendaIntoSlides).
    - `src/lib/instagram-overrides.test.ts` (Modify) — DK-6 parity: override + non-override produzieren bit-identische Supporter-Slide-Sequence. **PLUS alle neuen Supporter-Slide-Tests hier**: Supporter-Slide-Position (last), locale-both-doubles, count-cap (≤8 enforced), empty-no-supporter-slide, isLast-flip auf displaced last slide, 10-Slide-Cap-respect (drop trailing content + warning), defensive-throw-bei-logos-without-label, stale-override-branch-also-appends.
    - `src/app/dashboard/components/MediaPicker.test.tsx` (Modify) — backward-compat single + multi-mode: toggle-select, Cancel-rollback, Confirm-emit-array, n=0-disable, selectedSet-reset-on-reopen, capReachedMessage-inline-hint im footer (kein toast).
    - `src/lib/media-usage.test.ts` (Modify) — logo-public_id im supporter_logos wird als agenda-usage erkannt.
    - `src/app/api/dashboard/agenda/route.test.ts` (Modify oder Create) — POST: validate-reject (cap, dup, FK), GET-list: supporter_logos im response. KEINE audit-Tests (out-of-scope).
    - `src/app/api/dashboard/agenda/[id]/route.test.ts` (Modify oder Create) — PUT: partial-PUT-preserve, validate-reject. KEINE audit-Tests.
    - `src/app/api/dashboard/agenda/[id]/instagram/route.test.ts` (Modify) — label-resolution from dict, resolveInstagramSlides-call mit pre-loaded logos. KEINE audit-extension-Tests.
    - `src/app/api/dashboard/agenda/[id]/instagram-layout/route.test.ts` (Modify oder Create) — LayoutEditor-Preview-Pfad mit Supporter-Logo-Fixture.
    - `src/app/dashboard/components/LayoutEditor.test.tsx` (Modify oder Create) — Decision K: text-slide-Numbering bleibt korrekt nach Supporter-Append, Supporter-Slide read-only marker, kein drag-handle/delete-button.
    - Tests-Total +60…+90 erwartet (Estimate adjusted higher mit explicit list).
15. **Build/Test/Audit-Gate**: `pnpm build` clean, `pnpm test` clean, `pnpm audit --prod` 0 HIGH/CRITICAL.
16. **Visual-Smoke (DK-manual)**: Auf Staging einen Agenda-Eintrag mit 3-5 echten Logos (mixed Querformat + Square) anlegen + Public-Detail-View aufrufen + IG-Export `?locale=both&images=2` runterladen + ZIP visuell prüfen (Supporter-Slide am Ende beider Locale-Sets, Label korrekt gesetzt, Logos lesbar).

> **Wichtig:** Nur Must-Have-Items sind Teil des Sprint Contracts. Diese werden im Review gegen PR-Findings **hart durchgesetzt** — alles außerhalb ist kein Merge-Blocker.

### Nice to Have (explicit follow-up, NOT this sprint)

1. **Logo-Klickbarkeit zu Sponsor-URL** — pro Logo ein optionales `link_url` Field, im Public-Renderer als `<a>` wrap. Würde ENV-driven Validator brauchen (URL-shape, no-javascript:, optional rel="noreferrer noopener"). Sprint M4 wenn Demand.
2. **Zentrale Sponsoren-Bibliothek mit Auswahl** — separate Tabelle `sponsors` mit Logo + Name + URL, agenda_items referenziert FKs. Spart Pflege bei wiederkehrenden Sponsoren. Sprint M5+ wenn echtes Pain.
3. **Logo-Crop / per-Image-Aspect-Override** — Logos werden as-uploaded skaliert. Falls je nötig: separater Sprint analog Agenda-Bilder-Crop (Sprint 2 deferred).
4. **Audit-Tracking für Logo-Änderungen (PUT) und IG-Export (`supporter_count`)** — M3 streicht alle audit-extensions (Code hat aktuell kein agenda_update event). Wenn forensik nötig: separater Sprint mit (a) neuem `agenda_update` event design, (b) audit-shape-decision (count-diff vs granular added/removed), (c) IG-`supporter_count` Extension. Sauber abgegrenzt von Logo-feature-content.
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
| `src/lib/supporter-logos.ts` | Create | **Single source of truth für Logo-Types**: `SupporterLogo` (DB-shape) + `SupporterSlideLogo` (IG-render-shape, beide exported). `validateSupporterLogos(raw)` async validator. PLUS exported `async loadSupporterSlideLogos(logos: SupporterLogo[]): Promise<SupporterSlideLogo[]>`. **Imports**: `import pool from "./db"` (FK-check), `import { loadMediaAsDataUrl } from "./instagram-images"` (data-URL fetch — confirmed lives at `src/lib/instagram-images.ts`). **Algorithmus**: `const results = await Promise.all(logos.map(async (logo): Promise<SupporterSlideLogo | null> => { try { const result = await loadMediaAsDataUrl(logo.public_id); if (!result) return null; return { public_id: logo.public_id, alt: logo.alt, dataUrl: result.dataUrl, width: logo.width, height: logo.height }; } catch { return null; } })); return results.filter((x): x is SupporterSlideLogo => x !== null);`. **WICHTIG: dimensions kommen aus dem `logo.width/height` PARAMETER (input JSONB), NICHT aus `result.width/height`** — `loadMediaAsDataUrl` gibt `MediaImage` mit `width: null, height: null` zurück (media-table hat keine dimensions, vgl. Decision L). Mismatch würde silent-square-render produzieren — visual-only Bug. try/catch INSIDE map-callback (per-logo isolated), Promise.all resolved-only. Type-predicate filter `(x): x is SupporterSlideLogo => x !== null`. |
| `src/lib/supporter-logos.test.ts` | Create | Validator-Tests (non-array-input, undefined→empty, cap, dup, FK, alt-len, alt-trim, alt-undefined→null, public_id-len) + loadSupporterSlideLogos-Tests (mock-pool, dataUrl + dimensions roundtrip, null-filtering) |
| `src/lib/queries.ts` | Modify | Public-page agenda SELECT (line ~144) erweitert um `supporter_logos` column. TypeScript-Type des returned agenda-item shape um `supporter_logos: SupporterLogo[]` (defaulted via SQL `COALESCE(supporter_logos, '[]'::jsonb)` für unmigrated rows safety). **WICHTIG: `import type { SupporterLogo } from "./supporter-logos"`** (type-only) — sonst wird `supporter-logos.ts`'s top-level `import pool from "./db"` (pg pool) in den Edge-runtime/public-page bundle gepullt. queries.ts ist Edge-safe und braucht NUR den Type. |
| `src/lib/probe-image.ts` | Create | Pure-Helper `async probeImageUrl(src: string): Promise<{width: number, height: number}>`. **Return-shape ist `{width, height}` ONLY** — KEINE `orientation` (wäre derived data, gehört nicht in low-level probe). Existing `AgendaSection.tsx:259-265` hatte `{orientation, width, height}` als return. Refactor: shared helper returns nur `{width, height}`, **AgendaSection.tsx leitet orientation lokal ab** via `const orientation = probe.height > probe.width ? "portrait" : "landscape"`. SupporterLogosEditor braucht orientation NICHT (Logos haben kein orientation-Feld). Probe-Failure: Promise rejected. Caller-side handling. |
| `src/lib/probe-image.test.ts` | Create | Tests via JSDOM Image-mock. **MUSS `// @vitest-environment jsdom` pragma haben** (vgl. `patterns/testing.md`) — `Image()` constructor existiert nicht im default node-env. |
| `src/lib/assert-never.ts` | Create (oder reuse if existing) | Generator-Audit: `grep -r "assertNever" src/lib/` — wenn helper schon existiert, IMPORTIERE. Wenn nicht: `export function assertNever(x: never): never { throw new Error(\`Exhaustive check failed: \${JSON.stringify(x)}\`); }`. Wird in `slide-template.tsx` + `LayoutEditor.tsx` für SlideKind exhaustive-switch verwendet. |
| `src/components/AgendaSupporters.tsx` | Create | Public-Renderer Pure-Component mit `{logos, label}` Props |
| `src/components/AgendaSupporters.test.tsx` | Create | Renderer-Tests (empty-no-render, single, multi, alt-passthrough, height-style-assertion). **MUSS `// @vitest-environment jsdom` pragma haben** (vgl. `patterns/testing.md`) — React-Component-Tests brauchen `document`. |
| `src/components/AgendaItem.tsx` | Modify | Import + Render `<AgendaSupporters>` am Ende des expanded view, NACH Bilder + Content, VOR Hashtags. **Neuer required-prop `supportersLabel: string`**. **Caller-Audit**: `grep -rn "<AgendaItem" src/` — aktuell `src/components/AgendaPanel.tsx:22`. Beide call-sites müssen erweitert werden. Test-mocks mit `<AgendaItem>` brauchen den neuen Prop. |
| `src/components/AgendaPanel.tsx` | Modify | **Resolution-Decision (single concrete path)**: AgendaPanel bekommt einen neuen required prop `supportersLabel: string`, passt durch zu `<AgendaItem>`. Caller resolvt via dict. Begründung: AgendaPanel hat aktuell KEIN dict prop (verifiziert per AgendaPanel.tsx grep) — der dict-prop-thread würde mehr changes erzeugen als nötig; einzelner string-prop-thread ist minimal-invasive. |
| `src/components/Wrapper.tsx` | Modify | **Verifiziertes Call-Site** für `<AgendaPanel>` (line 157, NICHT layout.tsx). Wrapper hat `dict` bereits als prop (line 27, verifiziert). Resolution: `<AgendaPanel ... supportersLabel={dict.agenda.supporters.label} />`. Layout.tsx wird NICHT modifiziert (kein direkter AgendaPanel-call dort). |
| `src/components/AgendaItem.test.tsx` | Modify | **23 `<AgendaItem>` call-sites global** (verifiziert via grep). Jeder Test-mock von `<AgendaItem>` braucht den neuen `supportersLabel` prop nach der Type-Änderung — sonst tsc fail. Generator: `grep -rn "<AgendaItem" src/` für alle Treffer + eachen ergänzen. |
| `src/app/dashboard/components/MediaPicker.tsx` | Modify | Optional `multi: boolean` Prop, Selection-Set State im multi-mode, "Bestätigen ({n})"-Button, Cancel-rollback |
| `src/app/dashboard/components/MediaPicker.test.tsx` | Modify | Tests für multi-mode (backward-compat single + multi-select-Bestätigung + Cancel-rollback) |
| `src/app/dashboard/components/SupporterLogosEditor.tsx` | Create | **Controlled Sub-Editor**, Props: `{value: SupporterLogo[], onChange: (next: SupporterLogo[]) => void, strings: typeof DASHBOARD_SUPPORTER_STRINGS}`. **Dashboard ist locale-agnostic** (kein /de/-prefix, DE-only Editor-strings — vgl. M1/M2a). Editor bekommt KEINEN dict/locale-prop. Stattdessen: ein `DASHBOARD_SUPPORTER_STRINGS` const-export im Editor selbst (oder co-located helper-file) mit DE-strings hardcodiert (gleicher Convention wie existing Dashboard-Editors). DE-string-Werte mirrorn die `dict.agenda.supporters` DE-Werte aus §13. Public-page nutzt dict (locale-aware), Dashboard-editor nutzt const (DE-only).
ALLE state-mutations (add/remove/reorder/alt-edit) gehen durch `onChange(next)`. Parent (`AgendaSection`) hält die `supporter_logos`-state. Add-Button öffnet MediaPicker multi-mode mit `maxSelectable={8 - value.length}` und `capReachedMessage={strings.capReached}`. **Probe-flow on confirm**: für jedes neu ausgewählte Logo `await probeImageUrl(\`/api/media/\${public_id}/\`)` (probe URL mit trailing slash, consistent mit existing `AgendaSection.tsx:259` Pattern). Probe-failure → Logo trotzdem hinzugefügt mit `width: null, height: null`. **Notification-Mechanism**: kein toast-system im repo. Probe-failure UX = inline-banner ÜBER der Logo-Liste (amber background, dismissable per X-button) mit `strings.probeFailure` text. Banner ist self-managed local-state innerhalb des Editors, NICHT durch parent. Liste mit DragHandle + Alt-Input (max 500 chars) + Remove. |
| `src/app/dashboard/components/SupporterLogosEditor.test.tsx` | Create | Editor-Tests: controlled-component invariants (onChange called on jede mutation), add/remove/reorder/alt-edit, cap-disable, MediaPicker-multi-mode-confirm threading, probe-failure non-blocking. |
| `src/app/dashboard/components/AgendaSection.tsx` | Modify | (a) Mount `<SupporterLogosEditor value={form.supporter_logos} onChange={(next) => setForm({...form, supporter_logos: next})} strings={DASHBOARD_SUPPORTER_STRINGS} />` im Edit-Form unter dem images-Block. (b) **Form-state-shape** (existing `editing`/`form` interface): `supporter_logos: SupporterLogo[]` als field ergänzen, default `[]`. **Initial-seed bei edit-open**: `setForm({...item, supporter_logos: item.supporter_logos ?? []})` — ohne diesen seed sind existing Logos beim form-open unsichtbar. (c) **Form-snapshot extension** (`line ~74` "Persistierbare Felder im form-Snapshot für DirtyContext"): `supporter_logos` zum snapshot-shape ergänzen, derived aus `form.supporter_logos`. Ohne diese Ergänzung firet dirty-guard NICHT bei Logo-Änderungen. (d) **PUT body construction**: existing save-handler baut PUT body aus form fields. MUSS `supporter_logos: form.supporter_logos` ins body inkludieren (sonst trigger der `'supporter_logos' in input`-PUT-guard nicht → preserve fires unintended). (e) Existing local `probeImageUrl` (line 259) auf import aus `src/lib/probe-image.ts` refaktorieren — single source of truth. (f) **useCallback dep-array audit** (PR #110 lesson): jeder useCallback der `supporter_logos`-relevanten state liest oder schreibt MUSS `supporter_logos` in der dep-array haben (insb. handleSave). Generator-Pflicht: `grep "useCallback" src/app/dashboard/components/AgendaSection.tsx` durchgehen. |
| `src/app/api/dashboard/agenda/route.ts` | Modify | (a) **POST**: `supporter_logos` in body lesen, `'supporter_logos' in body ? await validateSupporterLogos(body.supporter_logos) : {ok: true, value: []}`, INSERT. (b) **GET-list** (wenn dieser route die Liste für AgendaSection-Editor liefert): SELECT erweitern um `supporter_logos`, return im JSON. **Generator-Audit:** `grep "FROM agenda_items" src/app/api/dashboard/agenda/route.ts` — JEDER Treffer braucht Column. Editor-load mit `undefined` für supporter_logos würde dirty-guard breaken. |
| `src/app/api/dashboard/agenda/[id]/route.ts` | Modify | (a) **PUT**: `'supporter_logos' in input` Partial-PUT-Guard via `CASE WHEN`, validate + UPDATE. (b) **GET (single)**: SELECT erweitert um `supporter_logos`. KEIN audit-call (Audit out-of-scope für M3 — vgl. §4). |
| `src/lib/instagram-post.ts` | Modify | `SlideKind` erweitert um `"supporters"`. `Slide` type um `supporterLogos?: SupporterSlideLogo[]` + `supporterLabel?: string`. **`AgendaItemForExport.supporter_logos: SupporterLogo[]`** — **REQUIRED** (default-leeres-array via SQL `COALESCE`). Test-Fixtures (`baseItem()`-helpers in `instagram-post.test.ts`) MÜSSEN um `supporter_logos: []` ergänzt werden. **Types `SupporterLogo` + `SupporterSlideLogo` werden aus `./supporter-logos` IMPORTIERT** (single source of truth, vgl. Decision N). **`splitAgendaIntoSlides` und `projectAutoBlocksToSlides` Signaturen UNVERÄNDERT** — keine Supporter-Logik in low-level pipeline (DK-6 parity via single-owner-pattern in resolveInstagramSlides, nicht hier). `flattenContent` unverändert. |
| `src/lib/instagram-post.test.ts` | Modify | Test-Fixtures (`baseItem()` helpers) um `supporter_logos: []` ergänzen — TypeScript-cascade fängt fehlende Updates. KEINE neuen Supporter-Slide-Tests hier (Supporter-Logik lebt in resolveInstagramSlides → tests landen in instagram-overrides.test.ts). |
| `src/lib/instagram-supporter-slide.ts` | Create | **Pure-Helper `appendSupporterSlide(slides: Slide[], supporterSlideLogos: SupporterSlideLogo[], label: string, meta: SlideMeta): Slide[]`** — **4 PARAMS**. **Imports**: `import type { Slide, SlideMeta } from "./instagram-post"` (type-only, vgl. Decision N). **Immutability-Semantik:** input slides wird NICHT mutiert. Algorithmus: `const lastIdx = slides.length - 1; const prevLast = slides[lastIdx]; const updatedPrevLast = {...prevLast, isLast: false}; const newSlide: Slide = {kind: "supporters" as const, index: slides.length, isFirst: false, isLast: true, blocks: [], supporterLogos, supporterLabel: label, meta}; return [...slides.slice(0, lastIdx), updatedPrevLast, newSlide];`. Damit (a) `slides !== returned`, (b) `slides[lastIdx] !== returned[lastIdx]`, (c) `slides[lastIdx].isLast === true` (original unverändert). **Edge-cases**: `slides.length===0` → return `[{kind:"supporters", index:0, isFirst:true, isLast:true, blocks:[], supporterLogos, supporterLabel:label, meta}]` (**`isFirst:true`** — single-slide-Sequence ist sowohl first als auch last); `supporterSlideLogos.length===0` → return slides as-is (no-op). **Single-Owner-Pattern**: wird AUSSCHLIESSLICH aus `resolveInstagramSlides` (instagram-overrides.ts) gerufen — NIEMALS aus `splitAgendaIntoSlides` oder `projectAutoBlocksToSlides`. Das stellt DK-6 parity über alle Build-Pfade sicher (alle 3 routes calling resolveInstagramSlides bekommen denselben Append). Caller (`resolveInstagramSlides`) resolvt `meta` via `result.slides[0]?.meta ?? buildSlideMeta(item, locale)`. |
| `src/lib/instagram-supporter-slide.test.ts` | Create | Append-Tests (single-supporter, isLast-flip-correctness, immutability check, empty-supporter-array no-op, empty-slides single-push) |
| `src/lib/instagram-overrides.ts` | Modify | **`resolveInstagramSlides` ist Single Owner des Supporter-Append**. Signatur erweitert um zwei optionale Params am Ende: `supporterSlideLogos?: SupporterSlideLogo[]` + `supporterLabel?: string`. Beide Branches (`if (!override)` auto + override-with-projections) calling `appendSupporterSlide(slides, supporterSlideLogos, supporterLabel, slides[0]?.meta ?? buildSlideMeta(item, locale))` als finalen Step BEVOR return. Defensive throw wenn logos-without-label. Override-mode behält "manual"/"stale" semantik unverändert (Supporter ist suffix, nicht Teil des override-projection-state). |
| `src/lib/instagram-overrides.test.ts` | Modify | (a) Auto-path mit supporter-logos: appendSupporterSlide called genau 1×, slide[last].kind === "supporters". (b) Override-path mit supporter-logos: dieselben Tests. (c) DK-6 parity: auto + override produzieren bit-identische Supporter-Slide (deepEqual auf supporter-slide-shape) bei demselben supporterSlideLogos+label input. (d) supporter-logos absent + override absent + override present: backward-compat unbroken. (e) **Defensive throw**: `expect(() => resolveInstagramSlides(item, locale, imageCount, null, supporterSlideLogos /* no label */)).toThrow("supporterLabel required when supporterSlideLogos provided")` — explizit als test case. |
| `src/lib/instagram-supporter-layout.ts` | Create | Pure-Helper `computeSupporterGridLayout(logos: SupporterSlideLogo[], frameW: number, frameH: number, label: string)` — **4 PARAMS** (canonical; logoHeight ist EXPORTED CONST `SUPPORTER_LOGO_HEIGHT = 100`, nicht parameter). Returns `{label: {y: number, fontSize: number}, logos: Array<{public_id, x, y, w, h, alt, dataUrl}>}`. Plus exported consts: `IG_FRAME_WIDTH = 1080`, `IG_FRAME_HEIGHT = 1350`, `IG_FRAME_PADDING = 80`, `SUPPORTER_LABEL_HEIGHT_RESERVE = 100`, `SUPPORTER_LOGO_HEIGHT = 100`, `SUPPORTER_LOGO_GAP = 24`, `SUPPORTER_LABEL_FONT_SIZE = 32`. label.fontSize kommt aus letzterem const (statisch, nicht responsive — Satori-Frame ist fix 1080×1350). Alt + dataUrl durchgereicht (a11y + render). |
| `src/lib/instagram-supporter-layout.test.ts` | Create | Layout-Math-Tests (single-row, multi-row-wrap, max-cap-honored, square-fallback wenn width/height null, alt+dataUrl-passthrough, frame-constants-imports) |
| `src/app/api/dashboard/agenda/[id]/instagram-slide/[slideIdx]/slide-template.tsx` | Modify | Neuer Branch für `kind:"supporters"`, render Label-Header + Logo-Grid via Layout-Helper. **`<img src={dataUrl} width={w} height={h} style={{width: w + "px", height: h + "px", display: "block"}}>`** — **Pflicht: Satori-Style-Double-Pack** (vgl. `patterns/nextjs-og.md` Trap 2 + lesson PR #110). Width/Height MÜSSEN sowohl als HTML-Attribute (`width={w} height={h}`) UND als inline-style (`style={{width, height}}`) gesetzt werden — Satori beachtet inline-style, ignoriert teilweise HTML-attrs ohne style. KEIN async-Call im Template. **Wichtig:** Falls die existing kind-branches als `if/else` (NICHT `switch`) implementiert sind, MUSS Generator den `if`-Chain um expliziten `else if (slide.kind === "supporters")`-Branch erweitern UND einen final `else` mit `assertNever(slide.kind as never)` als safety net. Niemals silent-fallthrough. |
| `src/app/api/dashboard/agenda/[id]/instagram/route.ts` | Modify | (a) SELECT erweitert um `supporter_logos`. (b) Call `loadSupporterSlideLogos((item.supporter_logos ?? []))`. (c) Resolve label via `getDictionary(locale).agenda.supporters.label`. (d) Call **`resolveInstagramSlides(item, locale, imageCount, override, supporterSlideLogos, supporterLabel)`** (existing `override` als 4. param, neue 5./6. params am Ende). KEIN audit-payload-extension (Audit out-of-scope für M3 — vgl. §4). |
| `src/app/api/dashboard/agenda/[id]/instagram-slide/[slideIdx]/route.tsx` | Modify | Pattern wie `instagram/route.ts`: SELECT `supporter_logos`, `loadSupporterSlideLogos(...)`, label-resolve, `resolveInstagramSlides(...)` mit den 2 neuen params. Single-PNG-Endpoint MUSS denselben pre-load-Pfad nehmen damit Slide-Index zwischen ZIP-Build und Single-PNG-Build aligned bleibt. |
| `src/app/api/dashboard/agenda/[id]/instagram-layout/route.ts` | Modify | **LayoutEditor-Preview-Pfad**. **ALLE SELECT-Pfade** in der Datei erweitern um `supporter_logos` (Generator-Audit: `grep "FROM agenda_items" src/app/api/dashboard/agenda/[id]/instagram-layout/`). Pre-load via `loadSupporterSlideLogos(...)`. Resolve label via `getDictionary(locale).agenda.supporters.label`. Pass beide zu **`resolveInstagramSlides(item, locale, imageCount, override, supporterSlideLogos, supporterLabel)`** (canonical entry-point — NICHT direkt `projectAutoBlocksToSlides`, das ist lower-level pipeline). Tests mit Supporter-Logo-Fixture. |
| `src/app/dashboard/components/LayoutEditor.tsx` | Modify | `SlideKind`-Erweiterung trifft slide-label-numbering. **Decision K:** Supporter-Slide ist **read-only Last-Entry** in der Editor-Liste, mit Label "Supporter-Folie" — wird NICHT in die existing `slideIdx + 1 + (hasGrid ? 1 : 0)` Numbering-Formel der text-slides einbezogen (offset-skip). Plus `assertNever`-Helper für exhaustive-check über alle `kind`-switches. |
| `src/app/dashboard/components/LayoutEditor.test.tsx` | Modify (or Create) | Tests für Decision K: text-slide-Numbering bleibt korrekt nach Supporter-Append, Supporter-Slide zeigt "Supporter-Folie" Label, Supporter-Slide ist not-draggable + not-deletable in der Editor-Liste. |
| `src/app/dashboard/components/InstagramExportModal.tsx` | Modify | **(a) Modal-Item-Prop wird erweitert**: existing prop type für item (wahrscheinlich `AgendaItemForExport` oder modal-spezifische subset-shape) um `supporter_logos: SupporterLogo[]` ergänzen. Wenn `item.supporter_logos.length > 0`: Hint-Badge "+ N Supporter-Logos" zeigen (UX-clarity, nicht block). **(b) Neue Warning `"supporter_slide_replaced_last_content"` rendern**: Modal zeigt aktuell `too_long` und `image_partial` als amber/warn-Hints. Neue Warning analog rendern aus `DASHBOARD_SUPPORTER_STRINGS.warningSlideReplaced` ("Letzter Inhalts-Slide wurde durch Supporter-Folie ersetzt (max. 10 Slides)" — Dashboard ist DE-only, kein dict-import; selber Convention wie existing `too_long`/`image_partial`-Hints im Modal). **(c) Tests** ergänzen: Modal mit `warnings: ["supporter_slide_replaced_last_content"]` rendert den amber-Hinweis mit dem genauen const-string. |
| `src/lib/media-usage.ts` | Modify | Agenda-fetch SELECT um `supporter_logos::text` erweitern, `refText` Concat ergänzen |
| `src/lib/media-usage.test.ts` | Modify | Neuer Test: logo-public_id im supporter_logos wird als agenda-usage erkannt |
| `src/i18n/dictionaries.ts` | Modify | **Single file mit beiden Locales als sub-objects** (verifiziert — `src/dictionaries/de.ts` + `fr.ts` existieren NICHT). Neuer top-level key `agenda` (existiert noch nicht — `nav.agenda` ist nav-string, kein agenda-Block) auf BEIDEN locales mit sub-key `supporters` (NUR 2 public-keys): `label` (Public-Renderer-Heading) + `supporterSlideLabel` (LayoutEditor + IG-Slide-Header). Dashboard-only-Strings (addLogo, capReached, probeFailure, warningSlideReplaced etc.) gehören NICHT hier rein — die leben als `DASHBOARD_SUPPORTER_STRINGS` const im Dashboard-Editor (vgl. §13 für die exact-Strings beider sources). Dictionary-Type `Dictionary` (exported aus dieser Datei) wird automatisch erweitert — `tsc --noEmit` catched fehlende mirror-keys zwischen `de` + `fr` Sub-objects. |
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

**Decision C — DROPPED:** Audit-Diff Granularität war an audit-extension geknüpft. Audit-extension out-of-scope (§4) → keine M3-decision nötig. Wenn audit jemals nötig: separater Sprint entscheidet count-diff vs granular.

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

**Decision N — Module-Boundary gegen Circular Imports:**
- **Problem:** `instagram-post.ts` importiert `SupporterLogo` aus `supporter-logos.ts`. `supporter-logos.ts` exportiert `loadSupporterSlideLogos` der `SupporterSlideLogo` aus `instagram-post.ts` zurückgibt. Naive Implementation = circular import.
- **Chosen:** **`SupporterSlideLogo` lebt in `supporter-logos.ts`** (NICHT in `instagram-post.ts`), zusammen mit `SupporterLogo`. `instagram-post.ts` importiert `SupporterSlideLogo` aus `supporter-logos.ts`. `supporter-logos.ts` hat KEINE Imports aus `instagram-post.ts`.
- **Rationale:** `SupporterLogo` (DB-shape) und `SupporterSlideLogo` (render-shape) sind beide Logo-Type-Variants. Sie gehören in dasselbe Type-Modul. `instagram-post.ts` verwendet sie nur als Slide-Field (`Slide.supporterLogos: SupporterSlideLogo[]`).
- **Zweite Cycle-Surface — `instagram-supporter-slide.ts` Type-only-Import**: Der neue helper-File braucht `Slide` + `SlideMeta` Types aus `instagram-post.ts`. **Single-Owner-Pattern (siehe §8)**: `instagram-post.ts` hat KEINE Kenntnis von `appendSupporterSlide` (kein import). Caller des helpers ist AUSSCHLIESSLICH `instagram-overrides.ts:resolveInstagramSlides`. Damit existiert gar keine `instagram-post.ts ↔ instagram-supporter-slide.ts` cycle in erster Linie — nur ein-Richtungs-Type-Import:
  - `instagram-supporter-slide.ts`: `import type { Slide, SlideMeta } from "./instagram-post";` (type-only)
  - `instagram-overrides.ts`: `import { appendSupporterSlide } from "./instagram-supporter-slide";` (value import) — der EINZIGE call-site
  - `instagram-post.ts`: KEIN import des helpers
  Mit `import type`-Pattern bleibt der runtime-graph zyklen-frei (TypeScript erased die type-imports beim compile).
- **Verification:** `madge --circular src/lib/` (oder ähnlicher dep-graph-tool) MUSS clean sein nach Sprint. Wenn Generator-Build-Time circular detection kein Tool hat: vitest-test mit cross-import-shape-assertion ist akzeptabel.

**Decision G — Async data-URL pre-load im Route-Handler, NICHT im Template (Satori sync constraint):**
- **Chosen:** Route handler `instagram/route.ts` (und `instagram-slide/[idx]/route.tsx`) machen `Promise.all(supporter_logos.map(l => loadMediaAsDataUrl(l.public_id)))` BEVOR `splitAgendaIntoSlides` aufgerufen wird. Pre-loaded `SupporterSlideLogo[]` (mit dataUrl) wird als zusätzlicher Parameter durchgereicht. Satori-Template liest `slide.supporterLogos[i].dataUrl` direkt — kein async im sync render.
- **Reasoning:** Satori (next/og) ist sync — async-Calls im Template oder Pure-Helper crashen at runtime. Pre-load-im-Route-Handler ist das etablierte Pattern aus PR #110 (Instagram-Bild-Slides). DRY: Type `SupporterSlideLogo` ist DB-shape `SupporterLogo` + `dataUrl`-field; `splitAgendaIntoSlides` ist sync und arbeitet mit der vollen Render-shape.
- **Trap-Mitigation:** Spec markiert ALLE `splitAgendaIntoSlides`-call-sites in der Files-to-Change-Tabelle (instagram/route.ts + instagram-slide/[idx]/route.tsx). Generator MUSS audit-grep machen wenn weitere existieren.

**Decision H — Cap-Enforcement bei Multi-Picker-Confirm:**
- **Chosen:** **Picker-side hard-stop**: `MediaPicker` mit `maxSelectable={8 - currentLogoCount}` Prop. Tile-Click prüft `selectedSet.size < maxSelectable` — wenn cap erreicht: Click no-op + inline-Hint im Picker-footer mit string aus `DASHBOARD_SUPPORTER_STRINGS.capReached` ("Maximum erreicht (8 Logos)" — Dashboard-only DE, kein dict-import). Statischer string, kein `{n}`-Interpolation — cap=8 single source of truth (Validator-Const). Confirm-Button bleibt enabled solange n>0. Editor empfängt nur erlaubte Anzahl, kein truncate / kein silent-drop.
- **Reasoning:** User-Feedback-loud (Toast bei jedem block-click), keine silent-truncation, klare UI-Affordance. Editor-side truncate würde User verwirren ("ich hab 6 ausgewählt, aber nur 3 sind drin"). Editor-side error nach Confirm = roundtrip ohne Mehrwert.
- **Alternative considered:** Editor-side validate-on-confirm + 400-error mit "max 8 erreicht". Abgelehnt — schlechtere UX.

**Decision I — DirtyContext Integration:**
- **Chosen:** Bestehender `"agenda"`-Schreib-Pfad wiederverwendet. SupporterLogosEditor ist Sub-Component des AgendaSection-Edit-Forms — Logo-Mutationen sind Teil derselben form-state und daher derselben dirty-Tracking-Domain.
- **Reasoning:** Neuer Key würde double-tracking erfordern. Single dirty-key per Form = single-source-of-truth.
- **Implementation (verified via grep):** `AgendaSection.tsx:11` importiert `useDirty` von `../DirtyContext`. Line 938: `const { setDirty } = useDirty()` mit "Report dirty state SYNCHRONOUSLY within render" Pattern. Logo-Mutationen MUSS `supporter_logos` zum form-snapshot ergänzen (line ~74 "Persistierbare Felder im form-Snapshot für DirtyContext"). Sobald supporter_logos im snapshot ist, vergleicht der existing diff-Mechanismus automatisch — kein expliziter setDirty-Call nötig in `SupporterLogosEditor`. **Generator-Pflicht:** snapshot-shape um `supporter_logos: SupporterLogo[]` erweitern + initial-snapshot bei mount oder edit-open mit DB-state seeden. Ohne diese Ergänzung firet der dirty-guard bei Logo-Änderungen NICHT.

**Decision L — Logo Dimensions: JSONB statt media-Schema-Migration:**
- **Chosen:** width/height werden im `supporter_logos` JSONB selbst gespeichert (analog `agenda_items.images` JSONB shape), browser-probed beim MediaPicker-confirm im Editor (`naturalWidth/naturalHeight` via Image-load Promise, Pattern aus `AgendaSection.tsx::probeImageUrl()` line 259).
- **Reasoning:** `media`-Table hat KEINE `width`/`height` columns (verifiziert in `schema.ts:100-108`). Eine Schema-Migration mit Backfill wäre teuer (image-decode für jede existing media-row) und out-of-scope für M3. Existing `images`-JSONB-Pattern ist battle-tested und liefert dieselbe Daten direkt am Picker-confirm-Point.
- **Backfill-Story:** Pre-existing supporter_logos-rows (gibt es zu Sprint-M3-Start nicht, da die column neu ist) bekommen `width: null, height: null` — square-fallback im Render. Nicht-Issue für M3.
- **MediaPicker-multi probe-flow (CHOSEN)**: Beim Confirm im Multi-Mode probet der `SupporterLogosEditor` jedes neue Logo via `probeImageUrl(/api/media/<public_id>/)` BEVOR es in den State geht. Pattern: extract pure helper aus AgendaSection.tsx:259 als `src/lib/probe-image.ts::probeImageUrl(src): Promise<{width, height}>` (single-source-of-truth für browser-probe). MediaPicker bleibt clean (selectiert nur public_ids), Probe ist Editor-Verantwortung. **Reasoning für editor-side probe**: (a) MediaPicker sollte side-effect-frei bleiben (testbar ohne Image-loading mock), (b) AgendaSection probet auch editor-side für `images` JSONB → Konsistenz.
- **Probe-Failure-UX (single concrete behavior)**: Wenn `probeImageUrl(...)` rejected:
  1. Logo wird trotzdem dem state hinzugefügt mit `width: null, height: null` (kein blocking, square-fallback im Render).
  2. **Inline amber banner** ÜBER der Logo-Liste im Editor (kein toast — repo hat kein toast-system). Banner-text aus `DASHBOARD_SUPPORTER_STRINGS.probeFailure` (DE: "Logo wurde hinzugefügt, aber die Größe konnte nicht ermittelt werden." — Dashboard ist DE-only). Banner ist self-managed local-state innerhalb des Editors, dismissable per X-button, NICHT durch parent.
  3. KEIN error-state, KEIN red-banner, KEIN remove-from-state.
  Probe-failure ist edge-case (image kaputt / 404 / network). User wird informiert, kann manuell re-add wenn nötig.

**Decision M — DROPPED:** Audit-emit-point Decision war an audit-extension geknüpft. Da Audit out-of-scope (§4): bestehende `agenda_instagram_export` audit-emit-Logik bleibt unverändert. Single-PNG-renders emitten weiterhin keine audit-events (existing convention).

**Decision K — LayoutEditor Slide-Numbering bei `kind:"supporters"`:**
- **Chosen (a): Offset-skip — Supporter-Slide ist NICHT Teil der text-slide-Numbering-Formel.**
- **Implementation:** LayoutEditor (`src/app/dashboard/components/LayoutEditor.tsx`) iteriert über alle `slides` aber im UI:
  - Text-Slides behalten existing Formula `slideIdx + 1 + (hasGrid ? 1 : 0)` für Label "Slide N" (vgl. `memory/lessons.md` 2026-05-01 DK-8 — Editor↔Renderer Numbering-Drift).
  - Supporter-Slide bekommt **separates statisches Label** `dict.agenda.supporters.supporterSlideLabel` (DE: "Supporter-Folie", FR: "Slide soutiens") ohne Nummer.
  - **Read-only Markierung**: Supporter-Slide-Card bekommt `disabled` data-Attribute + `aria-disabled="true"`. Drag-Handle wird NICHT gerendert (Generator: prüfe ob existing slide-card-template einen drag-handle slot hat — wenn ja: branch `if (slide.kind !== "supporters")`). Delete-Button wird NICHT gerendert (analog). Card hat reduced opacity oder muted background um visual-distinct zu sein. Tooltip on-hover: "Wird automatisch aus Supporter-Logos generiert. Bearbeite die Liste im Eintrag-Editor."
- **Reasoning:** Numbering-Formel-Erweiterung (option b: "Slide N" mit N inkl. Supporter) würde:
  - DK-8-Lesson-Trap re-trigger ("offset-formula muss aus Metadaten berechenbar sein")
  - User confusion (text-slide-numbering changing post-supporter-add)
  - Mehr Test-Coverage erfordern
- **Alternative considered (b): Supporter-Slide bekommt "Slide N+1" Nummer.** Abgelehnt wegen DK-8-Trap.

**Decision J — DROPPED:** Audit-Field Key-Order war an audit-extension geknüpft. Audit-extension out-of-scope (§4) → diese Decision entfällt.

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
| Locale=both IG-Export | 2 Supporter-Slides am Ende (de/slide-N.png + fr/slide-N.png), identische Logo-Bytes, nur Label-Text gewechselt. Bestehende `agenda_instagram_export` audit-emit-convention unverändert (kein supporter-extension in M3). |
| Logo gehört zu media-File die GERADE umbenannt wird | media.public_id ist UUID-stable (Rename ändert NUR caption/filename, nicht public_id). Kein Render-Issue. |
| Concurrent Edit (zwei Admins) | Keine Optimistic-Concurrency in M3 (agenda-items haben keine etag). Last-write-wins, übernommen aus existing `images`-Verhalten. Wenn problem: separater Sprint analog M1. |
| Drag-Reorder während Save in-flight | Editor disabled save-button während save-pending; reorder-State updated lokal, merged in nächste save. Kein race. |
| MediaPicker-multi Cancel mit ausgewählten Logos | Selection-Set wird verworfen, Outer-Form-State unverändert. |
| MediaPicker-multi Confirm mit 0 ausgewählten | Confirm-Button disabled wenn `selectedSet.size === 0` (no-op). |
| User klickt Tile im Multi-Picker bei `selectedSet.size === maxSelectable` | Click no-op + inline-Hint im Picker-footer mit `DASHBOARD_SUPPORTER_STRINGS.capReached` ("Maximum erreicht (8 Logos)" — Dashboard ist DE-only). Statisch, kein `{n}`-Interpolation, cap=8 ist single source of truth. |
| Existing single-mode Konsumenten (RichTextEditor inline-image, JournalEditor MediaPicker) | KEINE Änderung. `multi=false` (default) → `onSelect` callback unverändert, `MediaPickerResult.public_id` ist optional und für single-mode nicht required (kann undefined sein). |
| `resolveInstagramSlides` ohne `supporterSlideLogos`+`supporterLabel` params (legacy callers) | Backward-compat: ohne 5./6. param oder `undefined`/`[]` → KEIN Supporter-Slide angehängt. |
| `appendSupporterSlide` bei leerem `slides[]` array | Helper-Edge-Case: keine prev-last zum Flippen. Pure-Helper darf NICHT crashen — bei `slides.length === 0` direkt single-supporter-slide pushen mit `isLast: true` + `index: 0`. Test pflicht. |
| Locale=both: slide indices in de vs fr | Beide Locales werden separat durch `splitAgendaIntoSlides` gebaut; da das selbe `item.supporter_logos` array hineingeht, ist die Slide-Anzahl deterministisch identisch. Slide-Index ist je-Locale 0-indexed. ZIP-Struktur `de/slide-N.png` + `fr/slide-N.png` matcht. |
| Logo-File aus media DELETE'd zwischen Pre-load und Render | `loadMediaAsDataUrl` returns null. Builder filtert null aus → Logo wird stillschweigend skipped (consistent mit IG-Image-Slide-Pattern PR #110). |

## Risks

- **Risk: MediaPicker-multi-mode bricht existing single-select-Konsumenten**
  *Mitigation:* `multi?: boolean = false` default backward-compat. Tests für single-mode unverändert grün halten + neue tests für multi-mode. Manuelle Smoke: RichTextEditor inline-image + AgendaSection-Slot-Fill nach Sprint nochmal klicken.

- **Risk: `SlideKind = "text" | "grid"` → "supporters" Erweiterung trifft exhaustive switch-statements im Repo** (TypeScript checks)
  *Mitigation:* `tsc --noEmit` im pre-commit hook fängt fehlende cases NUR wenn die switch-statements `assertNever(x)` als default-arm haben. Sprint-Pflicht: **Audit-grep `switch (slide.kind)` UND `case "text"` UND `case "grid"` über src/** als Phase-A-Subtask.** Alle Treffer:
  - `src/app/api/dashboard/agenda/[id]/instagram-slide/[slideIdx]/slide-template.tsx` — Branch hinzufügen + `assertNever`-Default
  - `src/app/dashboard/components/LayoutEditor.tsx` — Slide-Label-Numbering muss Supporter-Branch handhaben
  - Weitere Treffer (e.g. `instagram-overrides.ts`): Generator-Audit

- **Risk: `resolveInstagramSlides` Production-Call-Sites müssen alle den pre-load + label-resolution durchreichen** (DK-6 + Decision G)
  *Mitigation:* **Audit-grep `resolveInstagramSlides(` über src/** als Phase-G-Subtask.** Bekannte Production-call-sites (alle MÜSSEN supporterSlideLogos + supporterLabel passen):
  - `src/app/api/dashboard/agenda/[id]/instagram/route.ts` — ZIP+metadata
  - `src/app/api/dashboard/agenda/[id]/instagram-slide/[slideIdx]/route.tsx` — single PNG
  - `src/app/api/dashboard/agenda/[id]/instagram-layout/route.ts` — LayoutEditor preview

  `splitAgendaIntoSlides` selbst hat KEINE Supporter-Logik (Single-Owner in resolveInstagramSlides). Existing splitAgendaIntoSlides-call-sites (z.B. innerhalb resolveInstagramSlides:177, instagram-post.test.ts) bleiben unverändert.

- **Risk: IG-Supporter-Slide Layout wirkt visuell unbalanciert wenn Logos sehr unterschiedliche Aspect-Ratios haben** (Querformat 4:1 + Square 1:1 nebeneinander)
  *Mitigation:* Einheitliche Render-Höhe (z.B. 100px im 1350px-Frame), Breite frei. Visual-Smoke (DK-16) catched UX-Issues. Falls problematisch: Sprint-Followup mit Aspect-Slot-Padding o.ä.

- **Risk: media-usage-Query wird langsamer durch zusätzliches `supporter_logos::text` concat**
  *Mitigation:* `images::text` ist bereits ein full-table-scan-friendly Pattern. Ein zweiter JSONB::text-cast ist <1ms-Impact bei <1000 agenda-rows. Bei großem Wachstum: separater Index. Aktuelle DB hat ~10-20 agenda-rows, no-issue.

<!-- Risk Audit-Shape DROPPED (Audit out-of-scope für M3, §4). -->

- **Risk: `splitAgendaIntoSlides` + `instagram-overrides.ts` Drift** (DK-6 parity)
  *Mitigation:* DK-6 parity via Single-Owner-Pattern: `appendSupporterSlide(slides, supporterSlideLogos, label, meta)` (4 params canonical, vgl. §8 Files-to-Change) wird AUSSCHLIESSLICH aus `resolveInstagramSlides` aufgerufen. Damit alle 3 Build-Pfade (auto/manual/stale) durch denselben helper-call gehen — keine code-duplication, kein DK-6-drift-Risk. Test in lockstep verifiziert override + non-override produzieren identische supporter-slide-shape.

- **Risk: Validator FK-Race**: Admin lädt Picker, ein anderer Admin löscht media-File, erster Admin saved.
  *Mitigation:* `validateSupporterLogos` macht FK-Check zu POST/PUT-Zeit → 400. Klares Error-Mapping in Editor "Logo wurde gelöscht — bitte erneut auswählen". Race-Window <1s für realistic flows = akzeptabel ohne Lock.

