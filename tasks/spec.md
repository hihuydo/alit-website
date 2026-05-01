# Sprint M1 — Mitgliedschaft + Newsletter Public-Page Texte editierbar via Dashboard

<!-- Branch: feat/dashboard-submission-texts-editor -->
<!-- Started: 2026-05-01 (after Instagram-Export feature complete: PRs #136/#137/#138) -->
<!-- R1 (2026-05-01): Sonnet spec-evaluator caught 9 gaps. Fixes inline (DK-1/2 contradiction, DK-3 field count, DK-4 use existing getLeisteLabels pattern, DK-5 per-page fetch + console.warn fallback, DK-6 DirtyContext + userTouchedRef + re-snapshot, DK-8 transaction + entity_id null, DK-9 in Done-Definition). -->
<!-- R2 (2026-05-01): Sonnet spec-evaluator caught 7 more gaps. Fixes inline (DK-1 pool.connect() client+BEGIN/COMMIT pattern, DK-4 explicit DB-error try/catch, DK-6 reset-default via getDictionary import, DK-1 MAX_BODY_SIZE 256KB referenced, DK-8 changed_fields format example + audit-fail behavior, DK-10 no-op-PUT test added). -->
<!-- R3 (2026-05-01): Sonnet caught 9 more gaps (response-shape, mock-strategies, edge-cases). Fixes: DK-1 GET+PUT response-shape explicit, DK-6 getDictionary sync verified + reset-pattern, DK-7 conditional render, DK-8 first-save-diff semantics, DK-9 grep-pattern erweitert, DK-10 mock-strategies (pool.connect, auditLog), DK-1 Zod strict schema. -->
<!-- R4 (2026-05-01): Sonnet caught 7 more — 4 real (isDirty-vs-ref-race, reset-userTouched, GET-normalization, isDirty-flow-to-SignupsSection) + 3 minor (parseBody explicit, audit-diff-undefined-vs-empty, mock-per-call). Fixes inline. Letzte Runde — Generator startet danach (max 4 spec rounds = mehr als project-convention von 3, aber Sprint M1 architektonisch komplex genug; weitere Rounds würden ins Diminishing-Returns gehen). -->

## Motivation

Aktuell sind alle Public-Page-Texte des Mitgliedschafts-Formulars (`/mitgliedschaft`) und des Newsletter-Formulars (`/projekte/discours-agites`) statisch in `src/i18n/dictionaries.ts` — Änderungen erfordern Code-Edit + Build + Deploy. Ziel: Admin kann beide Texte über das Dashboard editieren, ohne Code-Touch. Beide Formulare bleiben physisch wo sie sind (keine Verlagerung), nur die prose-haltigen Texte wandern in DB.

## Sprint Contract (Done-Kriterien)

- **DK-1** Neue API-Route `/api/dashboard/site-settings/submission-form-texts/` mit GET (auth-only) + PUT (auth + CSRF). GET-Pattern analog journal-info (`pool.query()` ohne Transaction reicht für reads). **PUT-Pattern divergiert** wegen DK-8 atomic-diff-and-upsert: NICHT `pool.query()` (kann keine Transaction halten), stattdessen `pool.connect()` → explizit Client mit `client.query("BEGIN")`, dann `SELECT … FOR UPDATE`, dann `INSERT … ON CONFLICT DO UPDATE`, dann `client.query("COMMIT")` (`ROLLBACK` im catch), `client.release()` im `finally`. Standard `pg`-pattern, in diesem Repo bisher nicht verwendet aber Tech-Stack-natural — ggf. mit kurzem helper-comment „first transaction-using route, pattern für künftige Atomic-Mutations".
  - **PUT-Body validation:** BEIDE top-level form-keys (`mitgliedschaft`, `newsletter`) UND in jeder Form BEIDE Locales (`de`, `fr`) müssen present sein (auch wenn als leere `{}` Objekte). Verhindert dass malformed Client mit partial body andere Sektionen löscht. **Innerhalb jedes `{form}.{locale}` Objekts sind einzelne Felder optional/empty** — werden per-Field auf dictionary-Defaults gefallen (siehe DK-4). Kein Widerspruch zu DK-2: top-level Required, per-Field optional.
  - **Body-size limit:** Route MUSS `parseBody<T>(req)` aus `src/lib/api-helpers.ts` benutzen (NICHT `req.json()` direkt) — `parseBody` enforced `MAX_BODY_SIZE = 256 * 1024` (256KB) via content-length-Check + body-text-Length-Check, returnt `null` bei Verletzung. Spec-mäßig genug — alle 32 Felder × ~500 chars Worst-case = ~16KB, weit unter Limit. Test: PUT mit 257KB body → `parseBody` returns `null` → 400 (analog journal-info).
  - **Zod schema mit `.strict()`** für PUT-Body validation: explizit `z.object({mitgliedschaft: z.object({de: z.object({...8 fields all .string().optional()}).strict(), fr: ...}).strict(), newsletter: ...}).strict()`. Strict-mode lehnt unknown keys ab — verhindert dass ein malformed Client per `extra_field: "..."` die DB JSONB pollutet.
  - **GET response shape:** `{success: true, data: <normalized stored JSON>}` — NICHT mit defaults gemerged, ABER strukturell normalisiert: GET-handler garantiert ALWAYS die volle nested-Struktur `{mitgliedschaft: {de: {}, fr: {}}, newsletter: {de: {}, fr: {}}}` selbst wenn DB-Row fehlt ODER nur partielle Subkeys hat. Verhindert Editor-Crash durch undefined-access (z.B. wenn admin manuell `{mitgliedschaft: {de: {heading: "X"}}}` in DB schreibt → ohne fr/newsletter → Editor's `state.newsletter.de.heading` würde undefined → crash). Fields innerhalb der `{form}.{locale}`-Objekte sind weiterhin nicht-required (per-Field-Fallback).
  - **PUT 200 response shape:** `{success: true, data: <normalized payload>}` — `data` ist das **post-server-normalisierte** Objekt (z.B. nach Zod-coerce, nach trim()-Anwendung falls implementiert). Editor verwendet das für `initialSnapshotRef.current = JSON.stringify(response.data)` Re-Snapshot. Falls Server keine Normalisierung macht: `data === <eingehender Body>`. Konkret: ohne `data` Field bleibt isDirty=true forever nach Save (Sonnet R3 #2 catch).
- **DK-2** Neuer `site_settings`-Key `submission_form_texts_i18n`. JSON-Struktur:
  ```json
  {
    "mitgliedschaft": { "de": { "heading": "...", ... }, "fr": { ... } },
    "newsletter":     { "de": { "heading": "...", ... }, "fr": { ... } }
  }
  ```
  Per-Field-Fallback auf Dictionary innerhalb jeder `{form}.{locale}`-Sektion. Top-level (form/locale) keys sind in PUT-Body required (DK-1). Kein `ALTER TABLE` nötig — `site_settings` ist Grow-Only-Key-Store, Key wird via Lazy-Upsert beim ersten PUT angelegt.
- **DK-3** Editierbare Felder pro Form (prose-only, keine Form-Labels):
  - **Mitgliedschaft (8):** `heading`, `intro`, `consent`, `successTitle`, `successBody`, `errorGeneric`, `errorDuplicate`, `errorRate`
  - **Newsletter (8):** `heading`, `intro`, `consent`, `successTitle`, `successBody`, `errorGeneric`, `errorRate`, `privacy`
  - **Bleiben hardcoded in `dictionaries.ts`:** alle Form-Labels (vorname, nachname, strasse, nr, plz, stadt, woher, email), Submit-Button-Labels (`submit`, `submitting`), `missing`-Pflichtfeld-Hinweis, `newsletterOptIn`-Checkbox-Label
- **DK-4** Server-side Loader+Merge-Helper `getSubmissionFormTexts(locale)` in `src/lib/queries.ts` (oder eigene `src/lib/submission-form-texts.ts`). Pattern analog existierender `getLeisteLabels(locale)`, **mit einem expliziten Unterschied** (siehe unten):
  - **Defaults-Quelle:** `getDictionary(locale).mitgliedschaft` + `getDictionary(locale).newsletter` (slice der editierbaren prose-Keys via Pick-Helper). Single source of truth — keine Duplikation der Default-Texte. `getDictionary` ist plain-TS, Server- UND Client-Components dürfen importieren (siehe DK-6 reset-button).
  - **DB-Query:** SELECT `value` FROM `site_settings` WHERE key = `submission_form_texts_i18n`. **Explizit in `try { … } catch (err) { console.warn(…); return defaults; }` umschließen** — divergiert von `getLeisteLabels` (das nur JSON-parse fängt, nicht DB-Errors → bei DB-Down crasht das public-page render). Spec dokumentiert Backport zu `getLeisteLabels` als follow-up in `memory/todo.md`.
  - **Malformed-JSON-Handling:** wie `getLeisteLabels` — `try {JSON.parse(...)} catch { console.warn; defaults }`.
  - **Per-Field-Merge:** Helper analog `pickField(stored, default)` aus `getLeisteLabels` — empty-string als „nicht gesetzt" behandeln, sonst kann Admin nicht versehentlich Heading leer-saven.
  - **Returns:** `{ mitgliedschaft: {...editierbare 8 fields, merged}, newsletter: {...8 fields, merged} }` für die übergebene `locale`.
  - **Bewusste Einschränkung:** Admin kann ein Feld nicht „explizit leer" speichern. Falls jemals nötig → separates Feld-Schema mit `null`-vs-`""`-Distinktion.
- **DK-5** Public-Pages lesen DB beim Render via `getSubmissionFormTexts(locale)`:
  - **Fetch-Site:** `src/app/[locale]/layout.tsx` (Server-Component, bereits `export const dynamic = "force-dynamic"`, bereits mit `Promise.all` über mehrere `getXxx(locale)`-Loaders — das neue `getSubmissionFormTexts(locale)` reiht sich exakt dort ein, analog `getLeisteLabels(locale)`). **Kein zusätzliches Page-level-Fetching** — die Layout-zentralisierung folgt dem etablierten Pattern.
  - **Dict-Overlay:** `dict = { ...baseDict, leiste: leisteLabels, mitgliedschaft: { ...baseDict.mitgliedschaft, ...submissionTexts.mitgliedschaft }, newsletter: { ...baseDict.newsletter, ...submissionTexts.newsletter } }` — preserves Form-Labels aus baseDict, overrides nur die editierbaren prose-Felder mit gemergten Werten.
  - **Read-Sites die merged dict konsumieren:** `MitgliedschaftContent.tsx` (Client-Component, dict via Wrapper→Navigation→NavBars→Component), plus die bei DK-9 identifizierten Newsletter-Read-Sites. Kein Component-Code ändert sich struktur-mäßig — nur die Merge-Quelle wandert in den Loader.
  - **Pool-Failure-Verhalten:** `getSubmissionFormTexts` returnt bei DB-Error die hardcoded defaults (analog `getLeisteLabels`). Layout-Render läuft durch.
- **DK-6** Neuer Editor-Component `SubmissionTextsEditor.tsx` im `src/app/dashboard/components/`. Pattern strikt analog `JournalInfoEditor.tsx`:
  - **`isDirty` mit ref-tracking via snapshot-version-state:** `useMemo` allein ist defekt weil deps nur primitives tracken — wenn `initialSnapshotRef.current` mutiert (post-save re-snapshot), feuert useMemo nicht neu. Fix: `const [snapshotVersion, setSnapshotVersion] = useState(0); const isDirty = useMemo(() => JSON.stringify(state) !== initialSnapshotRef.current, [state, snapshotVersion]);`. Bei JEDER ref-mutation (initial-snapshot-set nach GET, re-snapshot nach Save): `setSnapshotVersion(v => v + 1)` triggert useMemo-Re-evaluation. Sonst bleibt `isDirty=true` forever nach Save → Save-Button enabled obwohl nichts geändert.
  - Initial-Snapshot via `useRef`, **gesetzt erst NACHDEM der GET-Fetch resolved** (analog `AccountSection.tsx::userTouchedRef`-Pattern). Schutz vor mount-vs-fetch race.
    - Konkret: `userTouchedRef = useRef(false)`; im GET-`useEffect` nach `setState(serverData)` IF `!userTouchedRef.current` THEN `initialSnapshotRef.current = JSON.stringify(serverData)` + `setSnapshotVersion(v=>v+1)`. Jedes onChange-Handler setzt `userTouchedRef.current = true`. **Reset-Button-Click setzt ebenfalls `userTouchedRef.current = true`** (sonst überschreibt ein noch-nicht-resolved-GET den lokalen Reset).
  - **Re-snapshot nach erfolgreichem Save** — analog `JournalInfoEditor`: nach PUT 200, `initialSnapshotRef.current = JSON.stringify(server-response.data)` (nicht von local state, sondern vom Server-Response, um server-side Normalisierung zu absorbieren) + `setSnapshotVersion(v=>v+1)`. Sonst bleibt `isDirty` true wenn Server z.B. trim() oder empty-string-zu-null normalisiert.
  - **isDirty-Flow zur SignupsSection** (für DK-7 sub-tab guard): Editor accepts optional callback prop `onDirtyChange?: (isDirty: boolean) => void`. `useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange])`. SignupsSection holds `editorIsDirty` state, lifted-up. Bei Sub-Tab-Click-Handler in DK-7 wird dieses State für `window.confirm`-Trigger gelesen. DirtyContext (DK-6 oben) coverage outer-Tab-navigation, callback-prop coverage inner-sub-tab.
  - **DirtyContext-Integration** — analog `JournalInfoEditor.tsx:33,47`:
    - `const { setDirty } = useDirty();`
    - `useEffect(() => { setDirty("submission-texts", isDirty); }, [isDirty, setDirty]);`
    - Cleanup on unmount: `useEffect(() => () => setDirty("submission-texts", false), [setDirty]);`
    - Damit guard'd der äußere SectionTab-Wechsel automatisch (außerhalb von SignupsSection) — DK-7 ergänzt nur den **inneren** Sub-Tab-Switch (memberships/newsletter/texts) durch eigenes `window.confirm`.
  - Save-Button `disabled={!isDirty || saving}`
  - 2000ms Saved-Flash nach erfolgreicher PUT
  - Lokaler Error-State (kein Toast)
  - **Layout:**
    - Outer-Toggle: `[Mitgliedschaft] [Newsletter]` (sub-section innerhalb des Editors, nicht 2 Editor-Instanzen)
    - Inner-Toggle: `[DE] [FR]`
    - Form-Felder: `<input>` für single-line, `<textarea>` für `intro`, `successBody`, `privacy`
    - Footer: `[Speichern]`, `[Auf Standard zurücksetzen]` (lokal-revertet auf dict-Werte, kein Save bis User klickt Speichern → setzt `userTouchedRef.current = true` damit `isDirty` sichtbar wird)
  - **Reset-Button Default-Source:** Editor läuft unter `/dashboard/` (no URL-locale), liest Defaults via `import { getDictionary } from "@/i18n/dictionaries"`. **`getDictionary` ist sync** (`src/i18n/dictionaries.ts:117` `export function getDictionary(locale: Locale)` returns plain object, no dynamic import) — Reset-Button-Click kann sofort `setState` mit dem dict-Slice aufrufen. Beim Click pro aktiv-getoggeltem (form, locale): `setState((s) => ({ ...s, [form]: { ...s[form], [locale]: pickEditableFields(getDictionary(locale)[form]) } }))`. Kein API-Call, rein lokal — Speichern-Button wird isDirty=true.
  - **Single-Save-Granularität:** Klick auf „Speichern" persistiert das **gesamte** `submission_form_texts_i18n`-Objekt (alle 4 Form×Locale Kombinationen). Verhindert partial-state-races bei mehreren parallel offenen Browser-Tabs (wer zuletzt saved gewinnt — same wie journal-info heute).
- **DK-7** Sub-Tab „Inhalte" in `SignupsSection.tsx` integriert:
  - `View` Type-Erweiterung: `"memberships" | "newsletter" | "texts"`
  - Drei Sub-Tab-Buttons im existierenden Tab-Strip mit gleicher CSS-Klassen-Logik (border-b-2, conditional active-classes)
  - **Conditional render** (NICHT always-mounted): `{view === "texts" ? <SubmissionTextsEditor ... /> : null}`. Beim Switch weg → Editor unmounts → DirtyContext-cleanup feuert (DK-6) → State weg. Nächster Switch zurück → fresh mount → fresh GET. Memberships/Newsletter-Sektionen können always-mounted bleiben (existing behavior, nicht ändern).
  - Sub-Tab-Switch zu „texts" während Memberships-Selection aktiv: bestehendes Selection-State bleibt erhalten (kein Reset). Ähnlich für umgekehrte Richtung.
  - **Dirty-Guard innerhalb der Sub-Tab-Navigation:** Wenn Editor `isDirty=true` und User klickt anderen Sub-Tab (memberships/newsletter) → `window.confirm("Ungespeicherte Änderungen verwerfen?")`. Confirm OK → switch + reset Editor-State (next mount lädt fresh GET). Cancel → bleibt auf texts-tab.
  - **Outer-Tab-Wechsel** (zwischen den 6 Top-Level-Tabs Agenda/Discours/...) ist bereits durch DirtyContext gesichert (DK-6) — kein doppelter Guard nötig.
- **DK-8** Audit-Event neu: `submission_form_texts_update`. Details:
  ```ts
  {
    form: "mitgliedschaft" | "newsletter",
    locale: "de" | "fr",
    changed_fields: string[]   // editor-feld-namen, z.B. ["heading", "intro"]
  }
  ```
  Beispiel: User ändert nur `mitgliedschaft.de.heading` und `mitgliedschaft.de.intro`, nichts anderes. Resultat: **eine** Audit-Row, `details = {form: "mitgliedschaft", locale: "de", changed_fields: ["heading", "intro"]}`. Wenn parallel `newsletter.fr.privacy` geändert wurde: zweite Audit-Row für `{form: "newsletter", locale: "fr", changed_fields: ["privacy"]}`. **Keine Audit-Rows wenn no-op** (User klickt Speichern ohne Änderung — DK-10 testet das explizit).
  - **Atomare Diff+Save-Transaktion** (verhindert audit-vs-save race): PUT umschließt SELECT + UPSERT in einer einzigen Postgres-Transaction mit `SELECT … FROM site_settings WHERE key = $1 FOR UPDATE`. Concurrent-Saves serialisieren sich, jeder sieht den korrekten pre-save-State. **Audit-emit erst NACH erfolgreichem COMMIT** (kein audit-of-rolled-back-write). Konkret: `client.query("BEGIN")` → SELECT FOR UPDATE → diff-compute → UPSERT → `client.query("COMMIT")` → DANN für jede geänderte Form×Locale-Combo `auditLog(...)` aufrufen.
  - **First-save-edge-case (DB-row fehlt)**: SELECT FOR UPDATE returnt 0 rows. Pre-state für diff-purposes ist effective `{mitgliedschaft: {de: {}, fr: {}}, newsletter: {de: {}, fr: {}}}` (keine stored values, **NICHT** dictionary-defaults — Audit dokumentiert was der User gespeichert hat, nicht was vs-defaults different ist). Jedes nicht-leere Feld im PUT-Body wird als „changed" gediff't → first-save mit allen 32 Feldern → bis zu 4 Audit-Rows mit allen entsprechenden field-names. First-save mit nur einem Feld pro Combo → 1-4 audit rows mit jeweils 1 changed_field.
  - **`undefined` vs `""` Diff-Konsistenz:** Beim Diff-Compute werden BEIDE als „nicht gesetzt" behandelt — `pre[field] === post[field]` IF `(pre[field] ?? "") === (post[field] ?? "")`. Verhindert false-positive-audit wenn z.B. Pre-State Feld nicht im JSON hatte (undefined) und Post-State explicit `""` schickt. Konsistent mit DK-4 empty-string-as-unset.
  - **Audit-INSERT-Failure-Verhalten:** `auditLog()` ist in diesem Projekt fire-and-forget (try/catch + stdout-Fallback siehe `src/lib/audit.ts`). DB-Write bleibt persistiert auch wenn audit-INSERT failt. Konsistent mit existing audit-call-sites — kein Special-Handling im neuen Sprint nötig. Nur Spec-mäßig dokumentieren dass das bewusst ist.
  - `audit-entity.ts::extractAuditEntity` Erweiterung: für `submission_form_texts_update` → `entity_type: "site_settings"`, `entity_id: null` (no row-id; consistent mit existing patterns wie `account_change` die ebenfalls `entity_id: null` returnen — NICHT `0`, das wäre invalid).
- **DK-9** Discovery-Verifikation **als Implementation-Step 1** (BLOCKING — siehe Done-Definition): Bevor DK-5 implementiert wird, mehrere `grep`-patterns ausführen und ALLE Read-Sites enumerieren:
  1. `grep -rn "dict\.newsletter" src/` (direct property access)
  2. `grep -rn "dict\.mitgliedschaft" src/` (selbe für Mitgliedschaft)
  3. `grep -rn "newsletter:" src/` + `grep -rn "mitgliedschaft:" src/` (destructuring `const {newsletter} = dict`)
  4. `grep -rn "Dictionary\[\"newsletter\"\]" src/` + `grep -rn "Dictionary\[\"mitgliedschaft\"\]" src/` (type-indexed access)
  5. Optional-chaining: `grep -rn "dict\?\.newsletter\|dict\?\.mitgliedschaft" src/`
  Discovery-Vermutung: `NewsletterSignupForm.tsx` ist headless, der Caller (Projekt-Page für `discours-agites`) rendert heading/intro selbst. Verifikations-Output: kommentar-Block oder kurzes notes-File mit File:Line Liste, dient Codex-Review als Vollständigkeits-Beleg. Falls weitere Read-Sites gefunden → DK-5 erweitert um diese.
- **DK-10** Test-Coverage:
  - **Mock-Strategien:**
    - `pool.connect()` — `vi.spyOn(pool, "connect")` returnt mock-Client mit per-call differentiated `query: vi.fn().mockImplementation(sql => ...)` und `release: vi.fn()`. Per-call-Differenzierung: SELECT-FOR-UPDATE-call returnt unterschiedliche pre-state-shapes je test-case (empty-DB, partial-DB, full-DB), UPSERT-call returnt rowCount. `query.mock.calls` arrayed → assert-able dass BEGIN, SELECT FOR UPDATE, INSERT/UPDATE, COMMIT in der richtigen Reihenfolge gefeuert haben. Rollback-test: zweiter SELECT- oder UPSERT-call wirft → assert `ROLLBACK` als nächster call (nicht COMMIT).
    - `auditLog` — `vi.mock("@/lib/audit", () => ({ auditLog: vi.fn() }))`. `auditLog.mock.calls.length` für „N audit rows", `auditLog.mock.calls[i][0]` für event-name + details-shape pro Row.
    - `pool.query` für GET-Pfad — analog journal-info-tests, einfacher Mock.
  - `submission-form-texts/route.test.ts`:
    - GET (leer-DB → defaults für beide Forms × Locales)
    - GET (gesetzt → returns nested JSON)
    - PUT-validation: missing top-level form-key, missing locale-key, body-not-object, oversized body (≥257KB → parseBody returns null → 400)
    - PUT-success + GET-after-PUT round-trip (verify persisted)
    - **PUT changed_fields-diff** (audit emits exactly N rows for N changed Form×Locale-Combos)
    - **PUT no-op** (state-equal payload → 0 audit rows, COMMIT happens regardless)
    - PUT transaction-rollback (mock UPSERT-throw → SELECT-FOR-UPDATE released, kein partial state)
  - `submission-form-texts.test.ts` (merge-helper): fully-empty-DB → all-from-dict, partial-DB → per-field merge, malformed-JSON-DB → fallback, **DB-pool-error → fallback** (mock pool.query throw, expect defaults), empty-string als „nicht gesetzt"
  - `SubmissionTextsEditor.test.tsx` (jsdom): initial render mit defaults, isDirty toggling, save success → flash, save error → state, reset-to-default lokal-only (no PUT), tab-switch dirty-guard, **userTouchedRef-race** (mount→GET-resolve doesn't flip isDirty), **re-snapshot-after-save** (next save without further edit is no-op)
  - **Mindestens 25 neue Tests** (analog journal-info-Tests-Größe)
- **DK-11** Visual-Smoke (manuell):
  - Editor öffnen, beide Forms × beide Locales → Default-Werte stimmen mit dictionary überein
  - Heading auf Mitgliedschaft DE ändern, save, public `/mitgliedschaft` → Heading geändert. FR public unverändert.
  - Newsletter intro auf FR ändern, save, public `/projekte/discours-agites` (FR-Pfad) → intro geändert.
  - „Auf Standard zurücksetzen" → Form-Felder revertiert, isDirty=true (weil DB noch nicht saved), Speichern → DB persisted die defaults explizit (nicht no-op-Save).
  - Logout während Editor-isDirty=true → Login-Redirect, kein Crash.

## Done-Definition

- [ ] **DK-9 Discovery-Verifikation FIRST** (Implementation-Step 1, blocking — alle Newsletter-prose-key-Read-Sites enumeriert + dokumentiert)
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
