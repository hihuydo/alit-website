# Sprint M1 — Mitgliedschaft + Newsletter Public-Page Texte editierbar via Dashboard
<!-- Spec: tasks/spec.md -->
<!-- Branch: feat/dashboard-submission-texts-editor -->
<!-- Started: 2026-05-01 (after Instagram-Export feature complete) -->
<!-- R1 (2026-05-01): Sonnet evaluator caught 9 gaps, Spec angepasst. todo synced. -->
<!-- R2 (2026-05-01): Sonnet caught 7 more (transaction API, DB-error catch, reset-default source, body-size, audit format/fail, no-op test). todo synced. -->
<!-- R3 (2026-05-01): Sonnet caught 9 more (response-shapes, mock-strategies, conditional render, first-save diff, broader grep, Zod strict). todo synced. -->
<!-- R4 (2026-05-01): Sonnet caught 7 more — 4 critical (isDirty-vs-ref-race, reset-userTouched, GET-normalization, isDirty-flow-callback) + 3 minor. -->
<!-- R5 (2026-05-01): Sonnet caught 4 critical (audit-types, audit-ip, stale-editorIsDirty, GET-vs-loader-ambiguity) + 4 minor. -->
<!-- R6 (2026-05-01): Sonnet caught 4 critical (1 false-positive, 3 fixed) + 4 minor (deferred). -->
<!-- R7 (2026-05-01): Codex spec review caught 2 show-stoppers Sonnet missed: (1) newsletter.intro dead-code → drop from editable. (2) lost-update race → optimistic concurrency etag. -->
<!-- R8 (2026-05-01): User PR-review 4 fixes (DK-11, DirtyContext, etag-format, initial-merge) + DK-4 drift. -->
<!-- R9 (2026-05-01): R8 contract drift (display/payload sep, re-snapshot from merged, GET-test raw, DK-11 reset semantics, 32→30, helpers spec'd). -->
<!-- R10 (2026-05-01): R9 terminology drift (etag-sec, PUT-shape, dictMap, setDisplayState). -->
<!-- R11 (2026-05-01): 2 letzte Drift: (P2) mergeWithDefaults trim-aware (whitespace-only fällt auf default), (P3) Helper-section + Save-Pipeline auf dictMap vereinheitlicht. SPEC FINAL. -->

## Sprint Contract (Done-Kriterien)

> Synchronisiert mit `tasks/spec.md` §Sprint Contract — Zusammenfassung, kein wortwörtliches Kopie. Bei Spec-Updates beide Files manuell synchron halten.

- [ ] **DK-1** Neue API-Route `/api/dashboard/site-settings/submission-form-texts/` (GET auth-only, PUT auth+CSRF mit explizitem `pool.connect()` + `BEGIN/SELECT FOR UPDATE/UPSERT/COMMIT`). PUT-Body via `parseBody<T>(req)`. Zod `.strict()`-validation: outer body `{data, etag}`, top-level form-keys + locales required, leaf-fields optional (stripped payloadState). **Etag canonical format = JS `Date.toISOString()`**. GET typed Date → `.toISOString()`. **GET: `{data: <raw normalized>, etag: ISO|null}`**. **PUT request: `{data: <stripped payloadState>, etag}`**. **PUT 200: `{data, etag}`**. **PUT 409 stale_etag**: canonical-ISO compare nach SELECT FOR UPDATE, mismatch → ROLLBACK + 409. First-save-edge: DB-row missing AND body.etag null → success.
- [ ] **DK-2** Neuer `site_settings`-Key `submission_form_texts_i18n` mit nested JSON `{mitgliedschaft: {de, fr}, newsletter: {de, fr}}`. Lazy-Upsert beim ersten PUT, kein `ALTER TABLE`.
- [ ] **DK-3** Editierbare Felder: Mitgliedschaft (8 prose-keys), Newsletter (**7** prose-keys: heading, consent, successTitle, successBody, errorGeneric, errorRate, privacy — **`intro` BEWUSST AUSGENOMMEN** weil dead-code: real source = `projekte.newsletter_signup_intro_i18n` per Projekt, editierbar in `ProjekteSection.tsx` seit PR #100). Form-Labels + Submit-Buttons + missing-Hinweis bleiben hardcoded.
- [ ] **DK-4** Server-side Loader+Merge-Helper `getSubmissionFormTexts(locale)` **NUR für DK-5 Public-Page-Render** (NICHT für GET-API-Route — die returnt raw, sonst sieht Editor merged-defaults statt user-Werte → Codex P2). Pattern analog `getLeisteLabels` mit **expliziter Divergenz**: try/catch um die DB-Query (gegen DB-down crash beim public-page render — Backport zu `getLeisteLabels` in `memory/todo.md`). Defaults via `getDictionary(locale)`-Slice. Per-Field-Fallback, empty-string als „nicht gesetzt".
- [ ] **DK-5** Public-Pages lesen DB via `getSubmissionFormTexts(locale)` aus `[locale]/layout.tsx` (bereits `force-dynamic`, bereits `Promise.all` über mehrere Loaders — neuer Loader reiht sich exakt ein). Dict-Overlay preserves Form-Labels, overrides nur prose-Felder. Read-Sites: `MitgliedschaftContent.tsx` + bei DK-9 identifizierte Newsletter-Read-Sites.
- [ ] **DK-6** Neuer Editor `SubmissionTextsEditor.tsx` analog `JournalInfoEditor.tsx`. **Two-state model:** `displayState` (= React state, fully merged via `mergeWithDefaults` von raw GET + dict, basis für UI/snapshot/isDirty) vs `payloadState` (= computed `stripDictEqual(displayState, dict)` zum PUT-Zeitpunkt, niemals in state gehalten). Outer-Toggle Mitgliedschaft/Newsletter, Inner-Toggle DE/FR. `<input>` / `<textarea>` für intro/successBody/privacy. **`isDirty` mit snapshotVersion-state-bump**. **`userTouchedRef`-Guard + Reset-Button**. **Re-snapshot post-save: `displayState = mergeWithDefaults(response.data, dict)` → setState + snapshot von display, NICHT von raw response.data** (sonst isDirty stuck). **DirtyContext `setDirty("submission-texts", isDirty)` + cleanup**, **`DirtyContext.tsx` extension**. **`onDirtyChange?` callback prop**. **Etag-State + 409-Handling**. Pure helpers `mergeWithDefaults` + `stripDictEqual` + `pickEditableFields` in `src/lib/submission-form-fields.ts` (no server deps, importable from Client).
- [ ] **DK-7** Sub-Tab „Inhalte" in `SignupsSection.tsx` — `View` Type erweitert. Drei Tab-Buttons. **Conditional render** Editor (mounts only beim view===texts). **`editorIsDirty` state in SignupsSection** befüllt via Editor's `onDirtyChange` callback prop. Sub-Tab-Switch-Handler liest `editorIsDirty` für `window.confirm`. **Confirm-OK MUSS `setEditorIsDirty(false)` aufrufen** sonst stuck-state → spurious confirm-prompts bei folgenden tab-clicks. Outer-Tab-Wechsel automatisch durch DirtyContext (DK-6).
- [ ] **DK-8** Audit-Event `submission_form_texts_update` mit `details: {ip, actor_email, form, locale, changed_fields: string[]}` (`ip` REQUIRED via `getClientIp(req.headers)`). **`src/lib/audit.ts` Type-Extensions:** `AuditEvent` union erweitert + `AuditDetails` um `form?` und `changed_fields?` (sonst `pnpm build` fail). Diff-emit nur für tatsächlich geänderte Form×Locale-Combos (0..4 events), AFTER COMMIT. **First-save-edge-case** (DB-row fehlt): pre-state ist `{}` für jede Form×Locale, jedes nicht-leere Feld im PUT zählt als changed. Audit-INSERT-failure → fire-and-forget. `extractAuditEntity` für neuen Event: `entity_type: "site_settings"`, `entity_id: null`.
- [ ] **DK-9** **Implementation-Step 1, BLOCKING**: 5 grep-patterns ausführen (direct-property, destructuring, type-indexed, optional-chaining, beide forms) für vollständige Read-Site-Enumeration. Notes-File mit File:Line. Codex-Review-Beleg für Vollständigkeit von DK-5.
- [ ] **DK-10** Test-Coverage ≥30 neue Tests. **Mock-Strategien:** `pool.connect()` returns mock-Client, `vi.mock("@/lib/audit")`. Tests: `route.test.ts` (GET incl. etag canonical-ISO format, PUT-validation incl. Zod-strict + missing data/etag wrapper + 256KB-oversized, PUT-success+roundtrip incl. new etag, **PUT-diff N changed → N audit rows**, **PUT no-op → 0 audit rows**, **first-save → audit für nicht-leere Felder**, transaction-rollback assert ROLLBACK, **`pool.connect` selber wirft → 500 + kein release-call**, **PUT 409 stale_etag** 3 cases). `submission-form-texts.test.ts` (merge-helper Permutations, malformed-JSON-DB, **DB-pool-error → fallback**, empty-string-as-unset). `SubmissionTextsEditor.test.tsx` (render-mit-merged-defaults / isDirty / save / reset / dirty-guard / **userTouchedRef-race** / **re-snapshot-after-save** / **strip-dict-equal-fields-vor-PUT** / **409 staleConflict banner + Neu-laden**). **`audit-entity.test.ts`** Case für `submission_form_texts_update`. **`DirtyContext.test.tsx`** assert `DIRTY_KEYS` enthält `"submission-texts"` (oder existing test erweitert).
- [ ] **DK-11** Manueller Visual-Smoke: Default-Werte stimmen mit dictionary überein (initial-merge), Mitgliedschaft-DE-heading-change reflected on /mitgliedschaft, Newsletter-FR-`privacy`-change (NICHT `intro` — out-of-scope DK-3) reflected auf `/projekte/discours-agites`, Reset-to-Default + Save → DB row für jene Form×Locale wird minimal/leer, public Page liest via getSubmissionFormTexts → falls back auf dict-defaults (User-Sicht: defaults wieder sichtbar), Logout-during-dirty kein Crash.

## Done-Definition

- [ ] **DK-9 Discovery-Verifikation FIRST** (Implementation-Step 1, blocking)
- [ ] Sprint Contract vollständig (11 DKs)
- [ ] `pnpm build` clean
- [ ] `pnpm test` grün (1047+ → 1072+)
- [ ] `pnpm audit --prod` 0 HIGH/CRITICAL
- [ ] Sonnet pre-push gate clean
- [ ] Codex PR-Review APPROVED (max 3 Runden)
- [ ] **Manueller Visual-Smoke DK-11 durch User signed-off**
- [ ] Staging-Deploy + Smoke vor Prod-Merge
- [ ] Prod merge nach explizitem User-Go
- [ ] Prod deploy verified (CI grün, /api/health 200, Logs clean)

## Out of Scope (M2+ falls überhaupt)

- Form-Labels editierbar (vorname, nachname, ...) — kein Demand
- Submit-Button-Labels editierbar
- Rich-Text-Formatting in prose-Feldern — Plain text reicht
- Per-Field-Save — Single-save bleibt
- Versionierung / Undo
- Markdown-Support in intro/successBody/privacy
- Newsletter-Form-Verlagerung — bleibt unter `/projekte/discours-agites`
- Test-Coverage für Public-Page-Render-Pfad — Visual-Smoke deckt's
