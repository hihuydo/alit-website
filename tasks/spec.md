# Spec: Editable i-bar Info-Text (Discours Agités)
<!-- Created: 2026-04-20 -->
<!-- Author: Planner (Claude) -->
<!-- Status: Draft -->

## Summary

Der Text hinter dem `i`-Button in Panel 2 (Discours Agités) ist aktuell hardcoded in `src/i18n/dictionaries.ts` (`journal.info` DE+FR). Admins bekommen im Dashboard-Tab **Discours Agités** einen Block "i-bar Info-Text" mit Rich-Text-Editor (Bold / Italic / Link), getrennt nach DE und FR. Storage via singleton-row in bestehender `site_settings`-Tabelle; Fallback auf Dict-Strings wenn Row leer.

## Context

- 3-Spalten-Layout: Panel 2 = Discours Agités (schwarz). `JournalSidebar.tsx:24` enthält den `i`-Button, der ein Info-Panel ein-/ausblendet (`JournalSidebar.tsx:36-42`). Inhalt aktuell: `<p>{infoText}</p>`, infoText kommt als String-Prop von `Wrapper.tsx:170` (`dict.journal.info`).
- Dashboard hat bereits ein etabliertes Muster für i18n-Content-Editing: `RichTextEditor` (HTML I/O) + `blocksToHtml`/`htmlToBlocks` (JournalContent-Konversion), Locale-Tab-Switcher (DE/FR) wie in `ProjekteSection.tsx:291-330` und `JournalEditor.tsx`.
- `site_settings` Tabelle existiert in `schema.ts:222-227` (Key TEXT, Value TEXT, updated_at), aktuell 0 Rows in Prod und Staging.
- `JournalBlockRenderer.tsx` rendert `JournalContent`-Blöcke (Paragraph, Heading, Link, Italic, Bold etc.) und wird bereits für Journal-Einträge, Projekt-Content und Agenda-Content verwendet.
- DirtyContext Keys: aktuell `"agenda" | "journal" | "projekte" | "alit" | "account"` — neue Key nötig für Info-Editor-Block, da dieser parallel zu einem geöffneten Entry-Editor dirty sein kann.

Reference: `CLAUDE.md`, `memory/project.md`, `memory/lessons.md` (Rich-Text Round-Trip, Sync-during-render Pattern, force-dynamic bei SSR-Reads).

## Requirements

### Must Have (Sprint Contract)

1. **Storage:** Neue `site_settings`-Row mit Key `journal_info_i18n`, Value = JSON-String `{"de": JournalContent | null, "fr": JournalContent | null}`. Kein Schema-Migrations-Schritt nötig (TEXT reicht). Keine Seed-Row — Abwesenheit = Dict-Fallback.
2. **Public-Read:** Neue `getJournalInfo(locale: Locale): Promise<{ content: JournalContent; isFallback: boolean }>` in `src/lib/queries.ts`. Liest Row, falls existiert und locale-value non-null → return parsed JournalContent + `isFallback: false`. Sonst → Fallback-Reihenfolge: (a) wenn FR leer, versuche DE-Row, (b) sonst locale-passender Dict-String als Single-Paragraph-Block. `isFallback` true wenn locale non-native (FR bekam DE-Row oder FR bekam DE-Dict-Wrap).
3. **SSR-Integration:** `src/app/[locale]/layout.tsx` holt `getJournalInfo(locale)` in bestehendem `Promise.all` und reicht es als Prop `journalInfo` an `Wrapper`. `Wrapper.tsx` reicht weiter an `JournalSidebar`. `JournalSidebar` rendert `<JournalBlockRenderer content={journalInfo.content}>` statt `<p>{infoText}</p>`, und setzt auf dem Info-Panel-Container `lang="de"` wenn `isFallback && locale !== "de"`.
4. **Dashboard-API:** Neuer Route `src/app/api/dashboard/site-settings/journal-info/route.ts`:
   - `GET` (admin-auth): returns `{success: true, data: {de: JournalContent | null, fr: JournalContent | null}}`. Row fehlt → `{de: null, fr: null}`. Invalid JSON in DB → 500 mit `error: "Gespeicherter Wert nicht lesbar"` + stderr-log (admin sieht Problem, überschreibt via Save).
   - `PUT` (admin-auth + CSRF via `requireAuthAndCsrf`): Body `{de: JournalContent | null, fr: JournalContent | null}`. Validiert via Zod-Schema (JournalContent structure, oder `null`). UPSERT (`ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`). Empty-Content (nur Whitespace, keine Blocks mit renderbarem Inhalt) wird server-seitig zu `null` normalisiert via neuer Helper `isJournalInfoEmpty()`.
5. **Dashboard-UI:** Neue Component `src/app/dashboard/components/JournalInfoEditor.tsx`:
   - Locale-Tab-Switcher DE/FR (gleiches Muster wie `ProjekteSection.tsx:291-330`).
   - `RichTextEditor` pro Locale (beide mounted, inaktiv via CSS hidden — gleiches Pattern gegen Keystroke-Verlust beim Tab-Switch).
   - "Speichern"-Button, disabled wenn !dirty oder während save.
   - Dirty-State via `setDirty("journal-info", ...)` (neuer DirtyKey).
   - Integriert als `<details>`-Block oberhalb der Einträge-Liste in `JournalSection.tsx`, eingeklappt by default (Label z.B. "i-bar Info-Text bearbeiten").
6. **Dashboard-Page:** `src/app/dashboard/(authed)/page.tsx` fetcht initial `/api/dashboard/site-settings/journal-info/` parallel zu den anderen 6 Fetches, reicht als Prop `journalInfo` an `JournalSection`.
7. **DirtyContext erweitern:** `DirtyKey` um `"journal-info"`, `INITIAL_DIRTY` und `DIRTY_KEYS` entsprechend erweitert.
8. **Tests:**
   - Unit-Tests für `getJournalInfo()` Fallback-Pfade: no-row, only-DE-set, both-set, FR-leer-Fallback-auf-DE-Row, invalid-JSON, `isFallback`-Flag korrekt.
   - API-Tests für PUT: valid body, CSRF-miss (403), admin-miss (401), invalid Zod-Struktur (400), empty-content → null-Normalisierung.
   - Component-Test für `JournalInfoEditor`: Dirty-Toggle on RichTextEditor-Change, Save-Button-Disabled-State, Round-Trip nach Save.
9. **Quality Gates:** `pnpm build` ✓, `pnpm test` ✓ (mindestens +8 neue Tests), `pnpm audit --prod` 0 HIGH/CRITICAL.

### Nice to Have (explicit follow-up, NOT this sprint)

1. Audit-Event `site_setting_update` in `audit_events` mit Key + User-ID (→ `memory/todo.md`).
2. Versioning / Undo-History für site_settings.
3. Explizites "Auf Default zurücksetzen"-Button (Textfeld leeren geht schon — dieser wäre nur UX-Komfort).
4. Weitere i-bars (Panel 1 Agenda, Panel 3 Projekte) editierbar — gleiches Setting-Schema wiederverwendbar.

### Out of Scope

- Heading / Quote / Image / Embed / Hashtag-Tags in i-bar — Admin-Disziplin; kein programmatischer Strip-Filter (RichTextEditor-Toolbar bleibt unverändert).
- Öffentlicher `/api/site-settings/journal-info`-Endpoint — Public-Read geht nur SSR via `getJournalInfo()`, keine client-public API.
- Rate-Limiting für PUT — Admin-gated, Low-Traffic.
- Auto-Save (wie JournalEditor) — explizites Save genügt bei einem selten geänderten Singleton.
- Re-seeding / Migration der bestehenden Dict-Werte in die DB.

## Technical Approach

### Files to Change

| File | Change Type | Description |
|------|-------------|-------------|
| `src/lib/queries.ts` | Modify | `getJournalInfo(locale)` mit Dict-Fallback, JSON-Parse-Error-Handling, `isFallback`-Flag |
| `src/lib/journal-info-shared.ts` | Create | Shared Types + `isJournalInfoEmpty(content)` Helper + `wrapDictAsParagraph(text)` |
| `src/app/[locale]/layout.tsx` | Modify | `getJournalInfo()` in `Promise.all`, Prop durch zu Wrapper |
| `src/components/Wrapper.tsx` | Modify | Prop `journalInfo: {content, isFallback}` statt String-Lookup, weiter an JournalSidebar |
| `src/components/JournalSidebar.tsx` | Modify | Props-Typ ändern, `<JournalBlockRenderer>` statt `<p>`, `lang="de"` Wrapper wenn `isFallback && locale !== "de"` |
| `src/app/api/dashboard/site-settings/journal-info/route.ts` | Create | GET (admin) + PUT (admin+CSRF), Zod-Validation, UPSERT |
| `src/app/dashboard/components/JournalInfoEditor.tsx` | Create | Locale-Tab + RichTextEditor + Save-Button + Dirty-Hook |
| `src/app/dashboard/components/JournalSection.tsx` | Modify | `<details>`-Block oben + Editor einbinden, `journalInfo`-Prop akzeptieren |
| `src/app/dashboard/(authed)/page.tsx` | Modify | 7. Fetch ergänzt in `Promise.all`, Prop an JournalSection |
| `src/app/dashboard/DirtyContext.tsx` | Modify | `DirtyKey` um `"journal-info"`, `INITIAL_DIRTY`, `DIRTY_KEYS` |
| `src/lib/__tests__/queries-journal-info.test.ts` | Create | Fallback-Pfade + `isFallback`-Semantik |
| `src/app/api/dashboard/site-settings/journal-info/__tests__/route.test.ts` | Create | PUT happy-path + CSRF-miss + admin-miss + Zod-reject + empty-null |
| `src/app/dashboard/components/__tests__/JournalInfoEditor.test.tsx` | Create | Dirty-Toggle + Save Round-Trip mocked fetch |

### Architecture Decisions

- **Storage in `site_settings` (TEXT + JSON-String) statt JSONB:** Tabelle existiert mit TEXT-Schema. ALTER zu JSONB wäre zusätzlicher Migration-Schritt und reale Gewinn gering (single-row reads, kein JSONB-Query-Pattern). JSON-parse-Error-Handling in `getJournalInfo()` abgefangen → Fallback auf Dict. (Alternative geprüft: direkt JSONB — abgelehnt wegen Migrations-Overhead bei trivialem Wert.)
- **Full-Toolbar RichTextEditor statt subset-Toolbar:** Existierender Editor ist ausgereift und überall konsistent. Subset wäre neue Prop + Branches + Tests für wenig UX-Gewinn. (Alternative: neuen Mini-Editor bauen — abgelehnt wegen Scope-Explosion.)
- **Keine Seed-Row:** Keine initiale `INSERT ... ON CONFLICT DO NOTHING` in `ensureSchema()`. Grund: Dict-Fallback ist einziger Zustand, bis Admin explizit speichert. Das hält Staging/Prod DB-State symmetrisch zu dem vor diesem Sprint.
- **`"journal-info"` als eigener DirtyKey statt `"journal"` geshart:** Info-Editor und Entry-Editor können gleichzeitig dirty sein (Editor-Modal + Info-Block oben offen). Shared Key würde zu falschen Dirty-Meldungen führen.
- **Fallback-Reihenfolge FR-Locale:** FR-Row `null` → versuche DE-Row (wenn non-null) → sonst FR-Dict. Matches bestehendes `t()`-Pattern (`src/lib/i18n-field.ts`).
- **`isFallback`-Flag im SSR-Read:** Analog zu `AlitSection`-Pattern. Public-Sidebar setzt `lang="de"` auf Fallback-Content für Accessibility (Screen-Reader pronunciation).
- **GET-Response-Shape `{de, fr}` mit potenziellen `null`-Werten** statt resolved content: Dashboard braucht rohen Zustand pro Locale (DE gesetzt, FR nicht — Admin soll nicht FR mit DE-Fallback überschreiben beim Save). Public-SSR-Read löst dagegen immer zu konkreter `JournalContent`.

### Dependencies

- Keine neuen npm-Pakete.
- Keine neuen env-Vars.
- Keine Schema-Migrations.
- Nutzt bestehende Helper: `requireAuthAndCsrf` (`src/lib/auth.ts`), `blocksToHtml`/`htmlToBlocks` (`src/app/dashboard/components/journal-html-converter.ts`), `getDictionary` (`src/i18n/dictionaries.ts`), `t()` (`src/lib/i18n-field.ts`).

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| Row fehlt, DB-Query erfolgreich | `getJournalInfo(locale)` → Dict-Fallback als Single-Paragraph; `isFallback: locale !== "de"`. |
| Row existiert, Value-JSON `{"de": null, "fr": null}` | Wie Row-fehlt (Dict-Fallback). |
| Row existiert, invalid JSON | `JSON.parse` throws → try/catch → Dict-Fallback + stderr-Warning. Admin-GET bekommt 500 mit klarer Message. |
| DE-Content gesetzt, FR-Content `null` | Public-FR → DE-Row als Fallback, `isFallback: true` → `lang="de"` auf Renderer. Dashboard-FR-Textarea zeigt leer. |
| Admin speichert FR nur mit Whitespace / empty paragraph | Server normalisiert zu `null` via `isJournalInfoEmpty()`. Dict-Fallback greift wieder. |
| Admin speichert beide Locales gleichzeitig | Single PUT → UPSERT ersetzt komplette Row. Atomic. |
| Admin speichert invalide JournalContent-Struktur | Zod-reject → 400 mit `error: "Ungültiges Format"`, keine DB-Änderung. |
| Admin speichert ohne CSRF-Token | 403 `code: "csrf_*"` → `dashboardFetch` retry'et automatisch (existierender Wrapper). |
| DB offline beim SSR-Read | Error propagiert, SSR-Fehlerseite (Standard-Verhalten für andere Queries). |
| DirtyContext: User wechselt Tab mit ungespeicherten Info-Änderungen | Discard-Modal via bestehendes `confirmDiscard`. |
| User öffnet Entry-Editor während Info-Block dirty ist | Beide Keys parallel dirty, bestehende Discard-UX. |
| User klappt `<details>`-Block zu während dirty | Markup bleibt offen (via `open`-Attribute-Control), um Dirty-Warning-Visibility zu erhalten — ODER: zuklappen darf, aber Dirty-State bleibt. Entscheidung: Zuklappen erlaubt, Dirty-State bleibt sichtbar via Tab-Wechsel-Guard. |

## Risks

- **Rich-Text-Round-Trip-Verlust:** `htmlToBlocks(blocksToHtml(content)) !== content` kann bei ungewöhnlichen Konstrukten drift auslösen. **Mitigation:** Round-trip-Test in der Test-Suite (gleiche Patterns wie JournalEditor). Admin-UX signalisiert dirty sobald RichTextEditor onChange feuert.
- **Falsche Dict-Fallback-Locale im FR-Fall:** Wrong-Locale-Fallback wäre subtiler UX-Bug (User sieht DE-Text unter `lang="fr"`). **Mitigation:** `isFallback`-Flag explizit getestet + Wrapper-`lang`-Attribut.
- **Cache / Stale SSR:** `dynamic = "force-dynamic"` ist bereits auf Locale-Layout gesetzt (`layout.tsx:8`), also kein Caching-Risiko.
- **CSP / nonce:** Kein neuer Inline-Script, kein neuer External-Host — CSP Report-Only unverändert.
- **Empty-Paragraph-Edge-Case:** Bekannter Round-Trip-Gotcha: RichTextEditor kann `<p></p>` produzieren, `htmlToBlocks` macht daraus einen Empty-Paragraph-Block. `isJournalInfoEmpty()` muss das als leer erkennen (kein "renderbarer" Inhalt).
