# Sprint: Editable i-bar Info-Text (Discours Agités)
<!-- Spec: tasks/spec.md -->
<!-- Started: 2026-04-20 -->

## Done-Kriterien (Sprint Contract)

> Alle müssen PASS sein bevor der Sprint als fertig gilt.

- [ ] **DK-1 (Storage):** `site_settings`-Row mit Key `journal_info_i18n` speichert JSON-String `{de, fr}`. PUT + reload zeigt persistierten Wert. Keine Schema-Migration (Spalte bleibt `TEXT`).
- [ ] **DK-2 (Public-Read-Fallback):** `getJournalInfo("de")` bei leerer DB-Row liefert Single-Paragraph mit Dict-DE-Text + `isFallback: false`. `getJournalInfo("fr")` bei leerer DB-Row liefert Single-Paragraph mit Dict-FR-Text + `isFallback: true`.
- [ ] **DK-3 (FR-auf-DE-Fallback):** Wenn DB-Row DE-Content enthält aber FR=null → `getJournalInfo("fr")` liefert DE-Content + `isFallback: true`. Unit-Test verifiziert.
- [ ] **DK-4 (SSR-Render):** JournalSidebar rendert gespeicherten Rich-Text via `JournalBlockRenderer`. `curl -s https://staging.alit.hihuydo.com/de/` enthält neu gespeicherten Markup im HTML (nach Save + Reload).
- [ ] **DK-5 (Lang-Attribut bei Fallback):** Info-Panel-Container setzt `lang="de"` wenn `isFallback && locale !== "de"`. Unit-Test verifiziert render-output.
- [ ] **DK-6 (API PUT happy path):** `PUT /api/dashboard/site-settings/journal-info/` mit validen Body + CSRF → 200 + Row persistiert. Re-GET liefert identische Daten.
- [ ] **DK-7 (API PUT Security-Gates):** PUT ohne CSRF → 403; PUT ohne Admin-Auth → 401; PUT mit invalidem Zod-Body → 400.
- [ ] **DK-8 (Empty-Normalisierung):** PUT mit `{de: [{type:"paragraph", children:[{text:""}]}], fr: null}` speichert DB-Row mit `{de: null, fr: null}` (Empty-Normalisierung via `isJournalInfoEmpty()`).
- [ ] **DK-9 (Dashboard-UI):** Im Discours-Tab ist `<details>`-Block "i-bar Info-Text bearbeiten" sichtbar. Öffnen zeigt Locale-Tabs DE/FR + RichTextEditor + Speichern-Button (disabled when !dirty).
- [ ] **DK-10 (Dirty-Guard):** Editieren ohne Speichern + Tab-Wechsel triggert bestehendes Discard-Modal via `"journal-info"` DirtyKey.
- [ ] **DK-11 (Build + Tests):** `pnpm build` ohne TS-Errors. `pnpm test` grün mit +≥8 neuen Tests (490 → ≥498).
- [ ] **DK-12 (Audit):** `pnpm audit --prod` 0 HIGH/CRITICAL.
- [ ] **DK-13 (Staging-Smoke):** Staging-Deploy grün; via UI DE-Text bearbeiten + speichern; Public-Seite `/de/` zeigt Update (nach Reload). Gleiches für FR.

## Tasks

### Phase 1 — Shared Types + Backend
- [ ] `src/lib/journal-info-shared.ts` anlegen: Shared Types + `isJournalInfoEmpty(content)` + `wrapDictAsParagraph(text)`
- [ ] `src/lib/queries.ts` — `getJournalInfo(locale)` mit Dict-Fallback, `isFallback`-Flag, JSON-Parse-Error-Handling
- [ ] `src/app/api/dashboard/site-settings/journal-info/route.ts` — GET (admin) + PUT (admin+CSRF) mit Zod-Validation + UPSERT + Empty-Normalisierung
- [ ] Unit-Tests `getJournalInfo` (no-row, only-DE, both, FR-auf-DE-Fallback, invalid-JSON)
- [ ] API-Tests (PUT happy, CSRF-miss, admin-miss, Zod-reject, empty-null)

### Phase 2 — SSR Integration
- [ ] `src/app/[locale]/layout.tsx` — `getJournalInfo()` ergänzen, Prop an Wrapper
- [ ] `src/components/Wrapper.tsx` — Prop `journalInfo: {content, isFallback}`, weiter an JournalSidebar
- [ ] `src/components/JournalSidebar.tsx` — `<JournalBlockRenderer>` statt `<p>`, `lang`-Attribut für Fallback

### Phase 3 — Dashboard UI
- [ ] `src/app/dashboard/DirtyContext.tsx` — `DirtyKey` + `INITIAL_DIRTY` + `DIRTY_KEYS` um `"journal-info"` erweitern
- [ ] `src/app/dashboard/components/JournalInfoEditor.tsx` anlegen (Locale-Tabs + RichTextEditor + Save + Dirty-Hook)
- [ ] `src/app/dashboard/components/JournalSection.tsx` — `<details>`-Block oben einbinden, `journalInfo`-Prop akzeptieren
- [ ] `src/app/dashboard/(authed)/page.tsx` — 7. Fetch in `Promise.all`, Prop an JournalSection
- [ ] Component-Test `JournalInfoEditor` (Dirty-Toggle + Save Round-Trip)

### Phase 4 — Verification
- [ ] `pnpm build` lokal grün
- [ ] `pnpm test` lokal grün (+≥8 neue Tests)
- [ ] `pnpm audit --prod` 0 HIGH/CRITICAL
- [ ] Dev-Server manuell: Edit DE, Save, Reload `/de/`, verify Rich-Text rendert mit Bold/Italic/Link
- [ ] Staging-Push + Deploy-Verifikation (CI grün + `/api/health/` + UI-Smoke)

## Notes

- Rich-Text-Round-Trip-Gotchas: siehe `memory/lessons.md` (Rich-Text + JournalEditor-Pattern). Empty-Paragraph Edge Case explizit abfangen in `isJournalInfoEmpty()`.
- `site_settings` Tabelle hat TEXT-Spalten — JSON als String speichern, kein JSONB (bewusste Entscheidung, siehe Spec).
- FR-Fallback-Reihenfolge: FR-Row → DE-Row → FR-Dict (matches existing `t()` pattern).
- `isFallback`-Flag wie bei `AlitSection` — `lang="de"` auf Fallback-Render für Screen-Reader.
- Branch-Konvention: neue Feature-Branch (z.B. `feat/journal-info-editor`).
