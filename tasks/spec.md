# Spec: Leisten-Labels Editor — Sprint 3
<!-- Created: 2026-04-27 -->
<!-- Author: Planner (Claude) -->
<!-- Status: Draft v1 -->

## Summary

User kann die 6 Leisten-Labels (Panel-1/Panel-2/Panel-3 Headings + Subtitles) im Dashboard pro Locale (DE/FR) editieren. Speicherung in existierender `site_settings` Tabelle (key/value, kein DDL nötig — analog zu PR #99 `journal_info`-Pattern). Empty-per-Locale fällt auf `dictionaries.ts`-Default zurück. Neuer Dashboard-Tab „Beschriftung". Save triggert `revalidatePath`-Cache-Invalidation auf allen Public-Routes.

## Context

### Current State

- **Public Render**: `Wrapper.tsx:140,152,184` rendert die 3 Leisten via `dict.leiste.{verein,vereinSub,literatur,literaturSub,stiftung,stiftungSub}`. Dict wird im `[locale]/layout.tsx` aus `dictionaries.ts` aufgebaut.
- **Dictionary**: `src/i18n/dictionaries.ts:12-19,73-80` — 6 hardcoded Strings × 2 Locales (DE+FR identisch heute).
- **Existing pattern**: `journal_info_i18n` (PR #99) — gespeichert in `site_settings` (key=`journal_info_i18n`, value=JSON). Editor-Component `JournalInfoEditor.tsx` (~149 Zeilen) im Dashboard. Read via `getJournalInfo(locale)` in `src/lib/queries.ts:31` mit dict-fallback. API: `src/app/api/dashboard/site-settings/journal-info/route.ts` (GET + PUT, `revalidatePath`-Aufruf on save).
- **Dashboard tabs**: 6 aktuell (`agenda, journal, projekte, media, alit, signups`) — neue Tab-Definition lokal in `src/app/dashboard/(authed)/page.tsx:21+`.

### Architektur-Nachbarschaft

- `JournalInfoEditor` ist heute IM `journal`-Tab gefolded — er editiert nur 1 Feld (`journal_info_i18n`).
- Wir brauchen einen ähnlichen Editor für 6 Felder × 2 Locales = 12 Inputs. Eigener Tab macht das discoverbar.
- `Wrapper.tsx` ist Server-Component (kein "use client"), nimmt `dict` prop. Layout muss DB-Override merged dict bauen.

### Referenzen

- `CLAUDE.md`, `memory/project.md`
- PR #99 (Journal-Info-Editor) — exact pattern to mirror
- `patterns/admin-ui.md` — Dirty-Editor-Snapshot, Optimistic-UI single-flight Lock
- `patterns/nextjs.md` — `revalidatePath` für CMS-Component-Caching
- `patterns/api.md` — Partial-PUT, Honeypot, `validateImages`-style validation

## Requirements

### Must Have (Sprint Contract)

1. **Schema-Type `LeisteLabelsI18n`** — neuer File `src/lib/leiste-labels-shared.ts` exportiert:
   ```ts
   export interface LeisteLabels {
     verein: string;
     vereinSub: string;
     literatur: string;
     literaturSub: string;
     stiftung: string;
     stiftungSub: string;
   }
   export interface LeisteLabelsI18n {
     de: LeisteLabels | null;
     fr: LeisteLabels | null;
   }
   export const LEISTE_LABELS_KEY = "leiste_labels_i18n";
   export function isLeisteLabelsEmpty(labels: LeisteLabels | null | undefined): boolean { /* alle 6 fields .trim() === "" */ }
   ```
   Edge-safe (kein Node imports).

2. **Validation** in der API-Route: alle 6 Strings sind `string` Type-Guard, Length ≤200 chars, Trim. Empty per-Locale erlaubt (= clear → fall back to dict). Schwer-erlaubte Werte: HTML-Tags trimmed via `String(v).slice(0, 200).trim()` (kein DOMPurify nötig — Render via `{dict.leiste.X}` ist text-content, kein dangerouslySetInnerHTML).

3. **Read-Helper** in `src/lib/queries.ts`: neue Funktion `getLeisteLabels(locale: Locale): Promise<LeisteLabels>` —
   - SELECT value FROM site_settings WHERE key = 'leiste_labels_i18n'
   - JSON.parse value, lese `result[locale]`
   - Per-Field-Fallback: `result[locale]?.X || DEFAULT_LEISTE_LABELS_DE.X` (FR-empty falls DE-empty fällt auf dict-default).
   - Defensive: invalid-JSON → log warn + return dict default.
   - Tests: 5 (DB-row vorhanden mit beiden locales, DB-row mit nur DE+FR-null fällt auf DE, kein DB-row → dict default, invalid-JSON → dict default, leeres Feld → dict-fallback per-field).

4. **Layout integration** — `src/app/[locale]/layout.tsx` (oder wo dict gebaut wird) ruft `getLeisteLabels(locale)` und merged in das `dict.leiste`-Objekt vor Pass an Wrapper. KEIN Change in Wrapper.tsx selbst.

5. **API-Routes** — neuer Folder `src/app/api/dashboard/site-settings/leiste-labels/route.ts`:
   - **GET**: `requireAuth` + return current value (DB-row oder dict default als fallback).
   - **PUT**: `requireAuthAndCsrf` + body-Validation + UPSERT `site_settings`-row + `revalidatePath('/de', 'layout')` + `revalidatePath('/fr', 'layout')`.
   - Body shape: `{ de: LeisteLabels | null; fr: LeisteLabels | null }`. Null per-locale erlaubt = explicit clear.
   - Tests: 6 (GET 200 mit row, GET 200 ohne row → fallback, PUT 200 happy, PUT 400 fehlende Felder, PUT 401 ohne Auth, PUT 403 ohne CSRF).

6. **Dashboard Tab „Beschriftung"** — `src/app/dashboard/(authed)/page.tsx` erweitert um neuen Tab-Eintrag `{ key: "leiste", label: "Beschriftung" }` + render-Branch `{active === "leiste" && data && <LeisteLabelsSection initial={data.leiste} />}`. Fetch parallel zu existing `journalInfo`-Fetch.

7. **`LeisteLabelsSection.tsx` Component** — neue Datei `src/app/dashboard/components/LeisteLabelsSection.tsx`:
   - **`"use client"`** first-line.
   - Props: `initial: LeisteLabelsI18n`.
   - State: 12 controlled inputs (6 Felder × DE/FR), Save/Reset/Dirty-Tracking.
   - **Layout**: 2-Spalten-Grid (DE links, FR rechts), pro Spalte 6 `<input>` Felder mit Labels + Hint „Leer lassen für Standardwert".
   - **Save-Button**: dashboardFetch PUT, Optimistic-UI single-flight Lock (= disable während pending), Success-Toast „Gespeichert".
   - **Reset-Button**: setze State zurück auf `initial`.
   - **Dirty-tracking**: JSON.stringify(state) !== JSON.stringify(initial). Save-button disabled wenn nicht dirty.
   - **DirtyContext**: integrate über `useDirty()` damit Tab-Switch-Warning greift (analog AgendaSection).
   - All buttons `type="button"`.
   - Tests: 5 (renders mit initial, edit input update state, dirty-state enables save, save calls dashboardFetch mit body, reset rollback to initial).

8. **Schema-Init Trigger (no-op DDL)** — `src/lib/schema.ts` braucht KEINE Änderung (site_settings table existiert, key/value generic). Aber: das schema-init muss optional eine default-row INSERT ON CONFLICT DO NOTHING — explizit NICHT tun, weil empty-row = "use dict default" Verhalten. KEINE Migration nötig.

9. **i18n strings** — `src/app/dashboard/i18n.tsx` extend mit `leiste`-Namespace:
   ```ts
   leiste: {
     tabLabel: "Beschriftung",
     heading: "Leisten-Beschriftung",
     intro: "Diese Texte erscheinen als Spalten-Überschriften auf der Website. Leer lassen für Standardwert (siehe Hinweis unten).",
     defaultHint: "Standard: ",  // wird mit defaultValue prefixed
     localeDeHeading: "Deutsch",
     localeFrHeading: "Französisch",
     fieldVerein: "Panel 1 — Heading",
     fieldVereinSub: "Panel 1 — Untertitel",
     fieldLiteratur: "Panel 2 — Heading",
     fieldLiteraturSub: "Panel 2 — Untertitel",
     fieldStiftung: "Panel 3 — Heading",
     fieldStiftungSub: "Panel 3 — Untertitel",
     save: "Speichern",
     saving: "Speichert…",
     reset: "Zurücksetzen",
     savedToast: "Gespeichert",
   }
   ```

10. **Done — verify**: `pnpm build` + `pnpm exec tsc --noEmit` + `pnpm test` + `pnpm audit --prod` 0 HIGH/CRITICAL.

### Nice to Have (NOT this sprint)

1. Live-Preview im Editor („so sieht die Leiste aus" Mini-Preview).
2. Per-locale FR-fällt-auf-DE Fallback im Read-Helper (aktuell fällt FR direkt auf dict-default, nicht auf admin's DE).
3. Audit-Log-Eintrag pro Save.

### Out of Scope

- Editierbarkeit anderer i18n-Strings (Newsletter-Text, Mitgliedschafts-Text etc.) — separater Sprint pro Domain.

## Technical Approach

### Files to Change

| File | Change Type | Description |
|---|---|---|
| `src/lib/leiste-labels-shared.ts` | Create | `LeisteLabels`/`LeisteLabelsI18n` types, `LEISTE_LABELS_KEY` const, `isLeisteLabelsEmpty()` helper, `DEFAULT_LEISTE_LABELS_DE`/`_FR` Konstanten (mirror dict-default damit fallback testable ist ohne dict-import). |
| `src/lib/leiste-labels-shared.test.ts` | Create | 3 Tests für `isLeisteLabelsEmpty` (alle leer, 1 gefüllt, null) — type-only-Validation. |
| `src/lib/queries.ts` | Modify | `getLeisteLabels(locale)` Funktion (~30 Zeilen, analog zu `getJournalInfo`). Per-field fallback to dict default. |
| `src/lib/queries.test.ts` o.ä. | Create or extend | 5 Tests für getLeisteLabels (4 fallback-paths + 1 happy). |
| `src/app/api/dashboard/site-settings/leiste-labels/route.ts` | Create | GET + PUT, ~80 Zeilen, mirror `journal-info/route.ts` exact pattern. |
| `src/app/api/dashboard/site-settings/leiste-labels/route.test.ts` | Create | 6 Tests (siehe Spec #5). |
| `src/app/dashboard/components/LeisteLabelsSection.tsx` | Create | ~180 Zeilen, "use client", 12 controlled inputs, dashboardFetch save. |
| `src/app/dashboard/components/LeisteLabelsSection.test.tsx` | Create | 5 Tests (siehe Spec #7). |
| `src/app/dashboard/(authed)/page.tsx` | Modify | (a) Add `{ key: "leiste", label: "Beschriftung" }` zu TABS. (b) data-state extends mit `leiste: LeisteLabelsI18n`. (c) parallel-fetch in initial loader. (d) render-branch `{active === "leiste" && data && <LeisteLabelsSection ... />}`. |
| `src/app/dashboard/i18n.tsx` | Modify | Neuer `leiste`-Namespace (siehe #9). |
| `src/app/[locale]/layout.tsx` | Modify | (a) `await getLeisteLabels(locale)` parallel zu existing dict-build. (b) merge `labels` into `dict.leiste` vor Pass an Wrapper. |
| `src/i18n/dictionaries.ts` | No-Op | bleibt unverändert — dient als Default-Fallback. |
| `src/lib/schema.ts` | No-Op | site_settings existiert bereits, key/value-generic. |

### Architecture Decisions

- **Same pattern as journal_info** — Mirror PR #99 1:1 für Konsistenz. Future-Maintainer hat eine Vorlage.
- **No DDL** — site_settings ist key/value, neuer key = neue logische Spalte ohne Migration.
- **Per-field-fallback statt per-locale** — User kann z.B. nur DE-Leiste-1 ändern und Sub bleibt leer → dict-default greift für Sub. Granularer = User-friendlier.
- **revalidatePath statt revalidateTag** — Simpler, layout-level (alle Routen unter /[locale] re-render). Nicht kritisch dass es eine Sekunde dauert (Editorial-Tool).
- **Eigener Tab statt fold-in** — Discoverability. „Beschriftung" als label statt „Leiste" weil das User-mental-model wahrscheinlich „die Texte oben links/Mitte/rechts" ist, nicht „Leiste".
- **DE+FR side-by-side statt Tab-Switch** — User kann beide gleichzeitig editieren, vermeidet Context-Switch-Reibung. 6 Felder × 2 Locales = 12 Inputs passen in Standard-Viewport.

### Dependencies

- **External**: keine.
- **Internal**: existing `dashboardFetch`, `useDirty()`, `requireAuthAndCsrf`, `revalidatePath`.

## Edge Cases

- **DB-row mit invalidem JSON** — try/catch + log warn → return dict default (nicht throw — Public-Site darf nicht crashen wegen Editorial-Bug).
- **Admin clears alle Felder** — Save sendet `{de: {alle 6 ""}, fr: ...}` → Stored as-is, getLeisteLabels per-field-fallback bringt dict-defaults zurück. Verhalten: visuell zurück zum default.
- **Locale ohne dict-default** (= zukünftige neue Locale wie `it`) — dict-default für `it` existiert nicht → Read-Helper muss explicit auf `de`-default fallen. Derzeit nur de+fr → kein konkretes Risk, aber im Code defensive coden.
- **Concurrent edit zwischen 2 Admins** — last-write-wins (= acceptable, nicht critical content). Kein Versioning nötig.

## Test plan

- [ ] `leiste-labels-shared.test.ts` +3 Tests
- [ ] `queries.test.ts` (or new file) +5 Tests für getLeisteLabels
- [ ] `leiste-labels/route.test.ts` (new) +6 Tests
- [ ] `LeisteLabelsSection.test.tsx` (new) +5 Tests
- [ ] **Total: +19 neue Tests** (737 → ~756 passed)
- [ ] tsc clean, pnpm audit 0 HIGH/CRITICAL
- [ ] **Lokal-Smoke**: Dashboard → Tab „Beschriftung" → Felder editieren → Save → Public-Site reload → neue Labels sichtbar in 3 Spalten.
- [ ] **Lokal-Smoke**: Felder leeren → Save → Public-Site fällt zurück auf dict-default.
- [ ] **Staging-Deploy** + Public-Render-Smoke: bearbeitete Labels sichtbar.

## Risks

1. **Cache-Stale nach Save** — `revalidatePath` sollte greifen, aber Server-Component-Cache kann hartnäckig sein. Mitigation: Test mit Hard-Refresh + Logs prüfen.
2. **DE+FR Dictionary divergence** — wenn `dictionaries.ts` mal DE-only-strings hat und FR-fallback fehlt, würde unser Read-Helper undefined rendern. Mitigation: explicit DE-fallback wenn FR-default fehlt (kein crash).
3. **Empty-string vs null in Input** — controlled `<input value={""}>` ist OK, aber bei JSON.parse aus DB könnte `null` zurückkommen wo `""` erwartet wird. Mitigation: read-helper coerced `null → ""` für controlled-input-safety.

## References

- PR #99 (Journal-Info-Editor) — exact pattern to mirror
- `patterns/admin-ui.md` — Dirty-Editor + Optimistic-UI single-flight
- `patterns/nextjs.md` — revalidatePath für CMS-Caching
- `patterns/api.md` — Partial-PUT, validation
