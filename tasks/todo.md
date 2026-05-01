# Sprint M1 — Mitgliedschaft + Newsletter Public-Page Texte editierbar via Dashboard
<!-- Spec: tasks/spec.md -->
<!-- Branch: feat/dashboard-submission-texts-editor -->
<!-- Started: 2026-05-01 (after Instagram-Export feature complete) -->
<!-- R1 (2026-05-01): Sonnet evaluator caught 9 gaps, Spec angepasst. todo synced. -->
<!-- R2 (2026-05-01): Sonnet caught 7 more (transaction API, DB-error catch, reset-default source, body-size, audit format/fail, no-op test). todo synced. -->
<!-- R3 (2026-05-01): Sonnet caught 9 more (response-shapes, mock-strategies, conditional render, first-save diff, broader grep, Zod strict). todo synced. -->
<!-- R4 (2026-05-01): Sonnet caught 7 more — 4 critical (isDirty-vs-ref-race, reset-userTouched, GET-normalization, isDirty-flow-callback) + 3 minor. -->
<!-- R5 (2026-05-01): Sonnet caught 4 critical (audit-types, audit-ip, stale-editorIsDirty, GET-vs-loader-ambiguity) + 4 minor. R5 = FINAL — falls noch blocker emerged → SKIP_HOOKS + Codex spec review als finale Gate. -->

## Sprint Contract (Done-Kriterien)

> Synchronisiert mit `tasks/spec.md` §Sprint Contract — Zusammenfassung, kein wortwörtliches Kopie. Bei Spec-Updates beide Files manuell synchron halten.

- [ ] **DK-1** Neue API-Route `/api/dashboard/site-settings/submission-form-texts/` (GET auth-only via `pool.query`, PUT auth+CSRF mit explizitem `pool.connect()` + `BEGIN/SELECT FOR UPDATE/UPSERT/COMMIT` Transaction-Pattern). PUT-Body via `parseBody<T>(req)` (NICHT `req.json()`, parseBody enforces 256KB limit). Zod `.strict()`-validation, BEIDE top-level form-keys + BEIDE locales required. **GET response: `{success: true, data: <ALWAYS structurally-normalized to {form: {de: {}, fr: {}}}>}`** (verhindert editor-crash bei partial-DB-rows). **PUT 200 response: `{success: true, data: <normalized payload>}`** (Editor braucht das für Re-Snapshot).
- [ ] **DK-2** Neuer `site_settings`-Key `submission_form_texts_i18n` mit nested JSON `{mitgliedschaft: {de, fr}, newsletter: {de, fr}}`. Lazy-Upsert beim ersten PUT, kein `ALTER TABLE`.
- [ ] **DK-3** Editierbare Felder: Mitgliedschaft (8 prose-keys), Newsletter (8 prose-keys inkl. `privacy`). Form-Labels + Submit-Buttons + missing-Hinweis bleiben hardcoded in `dictionaries.ts`.
- [ ] **DK-4** Server-side Loader+Merge-Helper `getSubmissionFormTexts(locale)` **NUR für DK-5 Public-Page-Render** (NICHT für GET-API-Route — die returnt raw, sonst sieht Editor merged-defaults statt user-Werte → Codex P2). Pattern analog `getLeisteLabels` mit **expliziter Divergenz**: try/catch um die DB-Query (gegen DB-down crash beim public-page render — Backport zu `getLeisteLabels` in `memory/todo.md`). Defaults via `getDictionary(locale)`-Slice. Per-Field-Fallback, empty-string als „nicht gesetzt".
- [ ] **DK-5** Public-Pages lesen DB via `getSubmissionFormTexts(locale)` aus `[locale]/layout.tsx` (bereits `force-dynamic`, bereits `Promise.all` über mehrere Loaders — neuer Loader reiht sich exakt ein). Dict-Overlay preserves Form-Labels, overrides nur prose-Felder. Read-Sites: `MitgliedschaftContent.tsx` + bei DK-9 identifizierte Newsletter-Read-Sites.
- [ ] **DK-6** Neuer Editor `SubmissionTextsEditor.tsx` analog `JournalInfoEditor.tsx`. Outer-Toggle Mitgliedschaft/Newsletter, Inner-Toggle DE/FR. `<input>` single-line, `<textarea>` für intro/successBody/privacy. **`isDirty` mit snapshotVersion-state-bump bei jeder ref-mutation** (sonst useMemo deps tracken die ref-Mutation nicht → isDirty stuck nach Save). **`userTouchedRef`-Guard gegen mount-vs-fetch race + Reset-Button setzt ihn auch true** (sonst überschreibt GET den Reset). **Re-snapshot vom Server-Response nach Save** (absorb normalisierung). **DirtyContext-Integration `setDirty("submission-texts", isDirty)` + cleanup** (analog journal-info). **`onDirtyChange?: (isDirty: boolean) => void` callback prop** für SignupsSection sub-tab guard (DK-7). Defaults via `import { getDictionary }` aus `@/i18n/dictionaries`.
- [ ] **DK-7** Sub-Tab „Inhalte" in `SignupsSection.tsx` — `View` Type erweitert. Drei Tab-Buttons. **Conditional render** Editor (mounts only beim view===texts). **`editorIsDirty` state in SignupsSection** befüllt via Editor's `onDirtyChange` callback prop. Sub-Tab-Switch-Handler liest `editorIsDirty` für `window.confirm`. **Confirm-OK MUSS `setEditorIsDirty(false)` aufrufen** sonst stuck-state → spurious confirm-prompts bei folgenden tab-clicks. Outer-Tab-Wechsel automatisch durch DirtyContext (DK-6).
- [ ] **DK-8** Audit-Event `submission_form_texts_update` mit `details: {ip, actor_email, form, locale, changed_fields: string[]}` (`ip` REQUIRED via `getClientIp(req.headers)`). **`src/lib/audit.ts` Type-Extensions:** `AuditEvent` union erweitert + `AuditDetails` um `form?` und `changed_fields?` (sonst `pnpm build` fail). Diff-emit nur für tatsächlich geänderte Form×Locale-Combos (0..4 events), AFTER COMMIT. **First-save-edge-case** (DB-row fehlt): pre-state ist `{}` für jede Form×Locale, jedes nicht-leere Feld im PUT zählt als changed. Audit-INSERT-failure → fire-and-forget. `extractAuditEntity` für neuen Event: `entity_type: "site_settings"`, `entity_id: null`.
- [ ] **DK-9** **Implementation-Step 1, BLOCKING**: 5 grep-patterns ausführen (direct-property, destructuring, type-indexed, optional-chaining, beide forms) für vollständige Read-Site-Enumeration. Notes-File mit File:Line. Codex-Review-Beleg für Vollständigkeit von DK-5.
- [ ] **DK-10** Test-Coverage ≥25 neue Tests. **Mock-Strategien:** `pool.connect()` returns mock-Client (`query: vi.fn(), release: vi.fn()`), `vi.mock("@/lib/audit")` für `auditLog.mock.calls` assertions. Tests: `route.test.ts` (GET, PUT-validation incl. Zod-strict-rejects-extra-keys, PUT 256KB-oversized, PUT-success+roundtrip, **PUT-diff N changed → N audit rows**, **PUT no-op → 0 audit rows**, **first-save → audit für jedes nicht-leere Feld**, transaction-rollback assert ROLLBACK call). `submission-form-texts.test.ts` (merge-helper Permutations, malformed-JSON-DB, **DB-pool-error → fallback**, empty-string-as-unset). `SubmissionTextsEditor.test.tsx` (render/isDirty/save/reset/dirty-guard/**userTouchedRef-race**/**re-snapshot-after-save** verify `data` in PUT-response consumed).
- [ ] **DK-11** Manueller Visual-Smoke (DE+FR public pages, Save→public reflektiert, Reset-zu-Default, Logout-during-dirty).

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
