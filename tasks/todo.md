# Sprint M1 — Mitgliedschaft + Newsletter Public-Page Texte editierbar via Dashboard
<!-- Spec: tasks/spec.md -->
<!-- Branch: feat/dashboard-submission-texts-editor -->
<!-- Started: 2026-05-01 (after Instagram-Export feature complete) -->
<!-- R1 (2026-05-01): Sonnet evaluator caught 9 gaps, Spec angepasst. todo synced. -->
<!-- R2 (2026-05-01): Sonnet caught 7 more (transaction API, DB-error catch, reset-default source, body-size, audit format/fail, no-op test). todo synced. -->

## Sprint Contract (Done-Kriterien)

> Synchronisiert mit `tasks/spec.md` §Sprint Contract — Zusammenfassung, kein wortwörtliches Kopie. Bei Spec-Updates beide Files manuell synchron halten.

- [ ] **DK-1** Neue API-Route `/api/dashboard/site-settings/submission-form-texts/` (GET auth-only via `pool.query`, PUT auth+CSRF mit explizitem `pool.connect()` + `BEGIN/SELECT FOR UPDATE/UPSERT/COMMIT` Transaction-Pattern — first transaction-using route in repo). PUT-Body validation: BEIDE top-level form-keys + BEIDE locales required (innen pro Field optional/empty). Body-size 256KB (parseBody MAX_BODY_SIZE).
- [ ] **DK-2** Neuer `site_settings`-Key `submission_form_texts_i18n` mit nested JSON `{mitgliedschaft: {de, fr}, newsletter: {de, fr}}`. Lazy-Upsert beim ersten PUT, kein `ALTER TABLE`.
- [ ] **DK-3** Editierbare Felder: Mitgliedschaft (8 prose-keys), Newsletter (8 prose-keys inkl. `privacy`). Form-Labels + Submit-Buttons + missing-Hinweis bleiben hardcoded in `dictionaries.ts`.
- [ ] **DK-4** Server-side Loader+Merge-Helper `getSubmissionFormTexts(locale)` analog `getLeisteLabels(locale)` mit **expliziter Divergenz**: try/catch um die DB-Query (gegen DB-down crash beim public-page render — Backport zu `getLeisteLabels` in `memory/todo.md` als follow-up). Defaults via `getDictionary(locale)`-Slice (single source of truth, kein duplicate). Per-Field-Fallback, empty-string als „nicht gesetzt".
- [ ] **DK-5** Public-Pages lesen DB via `getSubmissionFormTexts(locale)` aus `[locale]/layout.tsx` (bereits `force-dynamic`, bereits `Promise.all` über mehrere Loaders — neuer Loader reiht sich exakt ein). Dict-Overlay preserves Form-Labels, overrides nur prose-Felder. Read-Sites: `MitgliedschaftContent.tsx` + bei DK-9 identifizierte Newsletter-Read-Sites.
- [ ] **DK-6** Neuer Editor `SubmissionTextsEditor.tsx` analog `JournalInfoEditor.tsx`. Outer-Toggle Mitgliedschaft/Newsletter, Inner-Toggle DE/FR. `<input>` single-line, `<textarea>` für intro/successBody/privacy. **`userTouchedRef`-Guard gegen mount-vs-fetch race**, **Re-snapshot vom Server-Response nach Save** (absorb normalisierung), **DirtyContext-Integration `setDirty("submission-texts", isDirty)` + cleanup** (analog journal-info), Reset-to-Default Button (lokal, kein Save) — Defaults via `import { getDictionary }` aus `@/i18n/dictionaries` (plain TS, Client-Component-safe).
- [ ] **DK-7** Sub-Tab „Inhalte" in `SignupsSection.tsx` — `View` Type erweitert. Drei Tab-Buttons. Dirty-Guard bei innerem Sub-Tab-Switch via `window.confirm`. Outer-Tab-Wechsel automatisch durch DirtyContext (DK-6) gesichert.
- [ ] **DK-8** Audit-Event `submission_form_texts_update` mit `details: {form, locale, changed_fields: string[]}` (Beispiel: `["heading", "intro"]`). Diff-emit nur für tatsächlich geänderte Form×Locale-Combos (0..4 events), AFTER COMMIT (kein audit-of-rolled-back). Audit-INSERT-failure → fire-and-forget (existierendes auditLog-Pattern, DB bleibt persistiert). `extractAuditEntity` für neuen Event: `entity_type: "site_settings"`, `entity_id: null` (NICHT `0`).
- [ ] **DK-9** **Implementation-Step 1, BLOCKING**: `grep -rn "dict\.newsletter" src/` ausführen, alle Newsletter-prose-Read-Sites enumerieren + dokumentieren (notes-File oder Code-Kommentar). Codex-Review-Beleg für Vollständigkeit von DK-5.
- [ ] **DK-10** Test-Coverage ≥25 neue Tests: `route.test.ts` (GET, PUT-validation incl. 256KB-oversized, PUT-success+roundtrip, **PUT-diff with N changed → N audit rows**, **PUT no-op → 0 audit rows**, transaction-rollback). `submission-form-texts.test.ts` (merge-helper, alle Permutations, malformed-JSON-DB, **DB-pool-error → fallback**, empty-string-as-unset). `SubmissionTextsEditor.test.tsx` (render/isDirty/save/reset/dirty-guard/**userTouchedRef-race**/**re-snapshot-after-save**).
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
