# Sprint M1 — Mitgliedschaft + Newsletter Public-Page Texte editierbar via Dashboard

<!-- Branch: feat/dashboard-submission-texts-editor -->
<!-- Started: 2026-05-01 (after Instagram-Export feature complete: PRs #136/#137/#138) -->

## Motivation

Aktuell sind alle Public-Page-Texte des Mitgliedschafts-Formulars (`/mitgliedschaft`) und des Newsletter-Formulars (`/projekte/discours-agites`) statisch in `src/i18n/dictionaries.ts` — Änderungen erfordern Code-Edit + Build + Deploy. Ziel: Admin kann beide Texte über das Dashboard editieren, ohne Code-Touch. Beide Formulare bleiben physisch wo sie sind (keine Verlagerung), nur die prose-haltigen Texte wandern in DB.

## Sprint Contract (Done-Kriterien)

- **DK-1** Neue API-Route `/api/dashboard/site-settings/submission-form-texts/` mit GET (auth-only) + PUT (auth + CSRF). Pattern strikt analog `/api/dashboard/site-settings/journal-info/route.ts` — `INSERT … ON CONFLICT DO UPDATE` upsert auf `site_settings.value` (TEXT, JSON.stringify), beide Locales required im PUT-Body.
- **DK-2** Neuer `site_settings`-Key `submission_form_texts_i18n`. JSON-Struktur:
  ```json
  {
    "mitgliedschaft": { "de": { "heading": "...", ... }, "fr": { ... } },
    "newsletter":     { "de": { "heading": "...", ... }, "fr": { ... } }
  }
  ```
  Fehlende Felder oder fehlende Locales sind erlaubt (per-Field-Fallback auf Dictionary). Kein `ALTER TABLE` nötig — `site_settings` ist Grow-Only-Key-Store, der Key wird via Lazy-Upsert beim ersten PUT angelegt.
- **DK-3** Editierbare Felder pro Form (prose-only, keine Form-Labels):
  - **Mitgliedschaft (8):** `heading`, `intro`, `consent`, `successTitle`, `successBody`, `errorGeneric`, `errorDuplicate`, `errorRate`
  - **Newsletter (7):** `heading`, `intro`, `consent`, `successTitle`, `successBody`, `errorGeneric`, `errorRate`, `privacy`
  - **Bleiben hardcoded in `dictionaries.ts`:** alle Form-Labels (vorname, nachname, strasse, nr, plz, stadt, woher, email), Submit-Button-Labels (`submit`, `submitting`), `missing`-Pflichtfeld-Hinweis, `newsletterOptIn`-Checkbox-Label
- **DK-4** Server-side Merge-Helper `resolveSubmissionFormTexts(dict, dbValue)` in neuem `src/lib/submission-form-texts.ts`. Returns merged dict mit DB-Override pro Feld. Fallback-Regel: **per-Field, nicht per-Locale** — wenn DB nur `mitgliedschaft.de.heading` setzt, alle anderen Felder kommen aus dict. Empty-string als „nicht gesetzt" behandeln (sonst kann Admin nicht versehentlich heading leer-saven; falls Admin explizit ein Feld leer will, geht das nicht — bewusste Einschränkung).
- **DK-5** Public-Pages lesen DB beim Render:
  - `MitgliedschaftContent.tsx` — bereits Client-Component, dict kommt als Prop. Caller (`Navigation.tsx` / Layout) muss merged dict übergeben.
  - `NewsletterSignupForm.tsx` (oder wo auch immer die Newsletter-prose-keys gerendert werden — siehe DK-9 für Discovery-Verifikation) — gleiche Merge-Logik, gleiches Pattern.
  - **Fetch-Strategie:** `/src/app/[locale]/layout.tsx` Server-Component fetcht 1× pro Request den `submission_form_texts_i18n` Wert + ruft `resolveSubmissionFormTexts(dict, dbValue)` auf, übergibt merged dict an Wrapper. Kein neuer DB-Hit pro Component-Render. Pool-Failure → Fallback auf pure dictionary (logged via `internalError`).
- **DK-6** Neuer Editor-Component `SubmissionTextsEditor.tsx` im `src/app/dashboard/components/`. Pattern strikt analog `JournalInfoEditor.tsx`:
  - `isDirty` via `useMemo(JSON.stringify(state) !== initialSnapshot)`
  - Initial-Snapshot via `useRef`
  - Save-Button `disabled={!isDirty || saving}`
  - 2000ms Saved-Flash nach erfolgreicher PUT
  - Lokaler Error-State (kein Toast)
  - **Layout:**
    - Outer-Toggle: `[Mitgliedschaft] [Newsletter]` (sub-section, nicht 2 Editor-Instanzen)
    - Inner-Toggle: `[DE] [FR]`
    - Form-Felder: `<input>` für single-line, `<textarea>` für `intro`, `successBody`, `privacy`
    - Footer: `[Speichern]`, `[Auf Standard zurücksetzen]` (lokal-revertet auf dict-Werte, kein Save bis User klickt Speichern)
  - **Single-Save-Granularität:** Klick auf „Speichern" persistiert das **gesamte** `submission_form_texts_i18n`-Objekt (alle 4 Form×Locale Kombinationen). Verhindert partial-state-races bei mehreren parallel offenen Browser-Tabs (wer zuletzt saved gewinnt — same wie journal-info heute).
- **DK-7** Sub-Tab „Inhalte" in `SignupsSection.tsx` integriert:
  - `View` Type-Erweiterung: `"memberships" | "newsletter" | "texts"`
  - Drei Sub-Tab-Buttons im existierenden Tab-Strip mit gleicher CSS-Klassen-Logik (border-b-2, conditional active-classes)
  - Beim View=`"texts"` wird der Editor gerendert, Memberships/Newsletter-Tabellen sind hidden
  - Sub-Tab-Switch zu „texts" während Memberships-Selection aktiv: bestehendes Selection-State bleibt erhalten (kein Reset). Ähnlich für umgekehrte Richtung.
  - **Dirty-Guard bei Tab-Wechsel weg:** Wenn Editor `isDirty=true` und User klickt anderen Sub-Tab → `window.confirm` mit „Ungespeicherte Änderungen verwerfen?" (analog `LayoutEditor` confirm-pattern, aber simpler — `window.confirm` reicht hier).
- **DK-8** Audit-Event neu: `submission_form_texts_update`. Details `{form: "mitgliedschaft" | "newsletter", locale: "de" | "fr", changed_fields: string[]}`. **Eine Audit-Row pro Form×Locale-Kombination die sich tatsächlich geändert hat** — die PUT-Route diff't gegen den vorherigen DB-State und emittiert 0..4 Events (eine pro tatsächlich geänderter Form×Locale-Combo). Keine Audit-Rows wenn nichts wirklich geändert hat (no-op-PUT).
  - `audit.ts` `extractAuditEntity` Erweiterung: für `submission_form_texts_update` → `entity_type: "site_settings"`, `entity_id: 0` (keine numerische ID, fixer Wert).
- **DK-9** Discovery-Verifikation **vor Implementation**: prüfen wo genau die Newsletter-prose-keys (`newsletter.heading`, `newsletter.intro`, `newsletter.privacy`, etc.) tatsächlich gerendert werden. Discovery-Bericht sagte „NewsletterSignupForm ist headless, Caller (Projekt-Seite) rendert heading/intro" — verifizieren ob das stimmt, und wenn ja, welcher Component die `dict.newsletter.heading` liest. Falls die Texte verteilt über mehrere Components gelesen werden, alle Read-Sites bei DK-5 berücksichtigen.
- **DK-10** Test-Coverage:
  - `submission-form-texts/route.test.ts` — GET (leer-DB → defaults), GET (gesetzt → returns), PUT-validation (missing-locale-key, malformed-body, oversized-body), PUT-success + GET-after-PUT round-trip, PUT changed_fields-diff (audit emits)
  - `submission-form-texts.test.ts` (merge-helper) — fully-empty-DB → all-from-dict, partial-DB → per-field merge, malformed-DB → fallback, empty-string als „nicht gesetzt" behandeln
  - `SubmissionTextsEditor.test.tsx` (jsdom) — initial render mit defaults, isDirty toggling, save success → flash, save error → state, reset-to-default lokal-only (no PUT), tab-switch dirty-guard
  - **Mindestens 25 neue Tests** (analog journal-info-Tests-Größe)
- **DK-11** Visual-Smoke (manuell):
  - Editor öffnen, beide Forms × beide Locales → Default-Werte stimmen mit dictionary überein
  - Heading auf Mitgliedschaft DE ändern, save, public `/mitgliedschaft` → Heading geändert. FR public unverändert.
  - Newsletter intro auf FR ändern, save, public `/projekte/discours-agites` (FR-Pfad) → intro geändert.
  - „Auf Standard zurücksetzen" → Form-Felder revertiert, isDirty=true (weil DB noch nicht saved), Speichern → DB persisted die defaults explizit (nicht no-op-Save).
  - Logout während Editor-isDirty=true → Login-Redirect, kein Crash.

## Done-Definition

- [ ] Sprint Contract vollständig (11 DKs)
- [ ] `pnpm build` clean (TypeScript)
- [ ] `pnpm test` grün (1047+ Tests, +25 neu)
- [ ] `pnpm audit --prod` 0 HIGH/CRITICAL
- [ ] Sonnet pre-push gate clean
- [ ] Codex PR-Review APPROVED (max 3 Runden)
- [ ] **Manueller Visual-Smoke DK-11 durch User signed-off**
- [ ] Staging-Deploy + Smoke vor Prod-Merge
- [ ] Prod merge nach explizitem User-Go
- [ ] Prod deploy verified (CI grün, /api/health 200, Logs clean)

## Architektur-Entscheidungen

### Single-Key vs Multi-Key Storage
**Gewählt: Single key `submission_form_texts_i18n`** mit nested `{form, locale, field}` JSON. Begründung:
- Beide Forms werden im selben UI editiert → atomic save vermeidet partial-state-races zwischen Tabs
- Eine API-Route, ein Editor-Component, ein Test-File — weniger Boilerplate
- Per-form-Granularität bei Audit kommt aus dem Diff-Algorithmus, nicht aus dem Storage-Schema

### Dictionary bleibt als Fallback
**Bewusste Entscheidung:** `dictionaries.ts` wird NICHT entfernt. Dient als:
- Default-Werte beim ersten GET wenn DB-Row noch nicht existiert
- Per-Field-Fallback wenn ein einzelnes Feld in DB fehlt
- Hardcoded Source für Form-Labels (vorname, nachname, ...) die NICHT editierbar sind
- „Auf Standard zurücksetzen"-Button-Source

Alternativen verworfen:
- Dict komplett rauswerfen → fresh-deploy hätte leere Form-Page, schlechtes Onboarding
- DB als Single-Source-of-Truth mit ensureSchema-Seeding → Code-Update der Defaults wäre umständlich, Backfill-Skript pro Default-Änderung nötig

### Empty-String-Behandlung
**Empty-String wird als „nicht gesetzt" behandelt** im Merge-Helper. Folge: Admin kann ein Feld nicht „explizit leer" speichern. Bewusste Einschränkung — die geringe Wahrscheinlichkeit dass jemand „kein Heading" will rechtfertigt nicht den UX-Komplexitätszuwachs (z.B. Checkbox „Feld leer lassen").

### Tab-Switch Dirty-Guard via window.confirm
**`window.confirm` statt Custom-Modal** — `LayoutEditor` hat ein eigenes Confirm-Modal weil es auch Locale/imageCount-Switches abfangen muss. Hier reicht ein einziger Trigger (Sub-Tab-Wechsel weg von „texts") + die Out-of-Modal-Navigation (Tab im Browser, Logout) — `window.confirm` ist genug. Falls später mehr Confirm-Stellen dazukommen → Refactor auf Custom-Modal.

### Audit Granularität
**Pro Form×Locale eigene Audit-Row** statt einer Sammel-Row. Begründung: Audit-Suche (`actor_email + entity_type + form`) wird präziser, Diff-Trail ist klarer. Cost: bis zu 4 Rows pro Save statt 1 — vernachlässigbar bei diesem Edit-Volume (Mitgliedschafts-Texte ändern sich selten).

## Test Strategy

- **Route-Tests:** Mock `dashboardFetch`/`pool`-query (analog `journal-info/route.test.ts`). Exercise: leere DB GET, malformed-body PUT, oversized-body PUT, valid PUT + GET-roundtrip, changed-fields diff.
- **Merge-Helper-Tests:** Pure-function-Tests, keine Mocks nötig. Exercise: alle Permutations (empty/partial/full DB), empty-string-as-unset, malformed-DB-as-empty.
- **Editor-Component-Tests:** jsdom + `@testing-library/react`. Exercise: render + check defaults visible, isDirty true after input change, save → loading state → success-flash, save error → error message, reset → form reverts, dirty tab-switch → confirm.
- **Public-Page-Integration NICHT in dieser Test-Runde** — Pattern bei journal-info ist auch nur Editor + Helper isoliert. Visual-Smoke (DK-11) deckt das End-to-End ab.

## Out of Scope (M2+ falls überhaupt)

- **Form-Labels editierbar machen** (vorname, nachname, ...) — keine bekannte Demand, dictionary-Pattern bleibt
- **Submit-Button-Labels editierbar** — gleiches
- **Rich-Text-Formatting** in den prose-Feldern — Plain text reicht, kein RichTextEditor
- **Per-Field-Save** — Single-save bleibt (alle 4 Form×Locale Kombos atomar)
- **Versionierung / Undo** — nur „letzter Save gewinnt" wie bei allen anderen Editor-Patterns im Projekt
- **Markdown-Support** in `intro` / `successBody` / `privacy` — Plain-Text. Wenn später nötig: separates Sprint mit RichTextEditor-Integration
- **Newsletter-Form-Verlagerung in eigenen Tab** — bleibt unter `/projekte/discours-agites`
- **Test-Coverage für Public-Page-Render-Pfad** — Visual-Smoke + Merge-Helper-Unit-Tests reichen, kein E2E-Test
