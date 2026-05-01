# Sprint M1 — Mitgliedschaft + Newsletter Public-Page Texte editierbar via Dashboard
<!-- Spec: tasks/spec.md -->
<!-- Branch: feat/dashboard-submission-texts-editor -->
<!-- Started: 2026-05-01 (after Instagram-Export feature complete) -->

## Sprint Contract (Done-Kriterien)

> Synchronisiert mit `tasks/spec.md` §Sprint Contract — bei Spec-Updates beide Files manuell synchron halten.

- [ ] **DK-1** Neue API-Route `/api/dashboard/site-settings/submission-form-texts/` (GET auth-only, PUT auth+CSRF, `INSERT … ON CONFLICT DO UPDATE` upsert auf `site_settings.value` TEXT).
- [ ] **DK-2** Neuer `site_settings`-Key `submission_form_texts_i18n` mit nested JSON `{mitgliedschaft: {de, fr}, newsletter: {de, fr}}`. Lazy-Upsert beim ersten PUT, kein `ALTER TABLE`.
- [ ] **DK-3** Editierbare Felder: Mitgliedschaft (8 prose-keys: heading, intro, consent, successTitle, successBody, errorGeneric, errorDuplicate, errorRate), Newsletter (7 prose-keys: heading, intro, consent, successTitle, successBody, errorGeneric, errorRate, privacy). Form-Labels + Submit-Buttons + missing-Hinweis bleiben hardcoded in `dictionaries.ts`.
- [ ] **DK-4** Server-side Merge-Helper `resolveSubmissionFormTexts(dict, dbValue)` in `src/lib/submission-form-texts.ts`. Per-Field-Fallback (nicht per-Locale). Empty-string als „nicht gesetzt".
- [ ] **DK-5** Public-Pages lesen DB beim Render — `MitgliedschaftContent.tsx` + Newsletter-Caller. Server-Component-Layer fetcht 1× pro Request, übergibt merged dict an Wrappers. Pool-Failure → Fallback auf pure dict.
- [ ] **DK-6** Neuer Editor-Component `SubmissionTextsEditor.tsx` (analog `JournalInfoEditor.tsx`). Outer-Toggle Mitgliedschaft/Newsletter, Inner-Toggle DE/FR. `<input>` für single-line, `<textarea>` für intro/successBody/privacy. Save + Reset-to-Default Buttons. isDirty via JSON-snapshot. Single-save persistiert gesamtes Objekt.
- [ ] **DK-7** Sub-Tab „Inhalte" in `SignupsSection.tsx` — `View` Type erweitert auf `"memberships" | "newsletter" | "texts"`, drei Tab-Buttons mit gleicher CSS-Logik. Dirty-Guard bei Tab-Wechsel weg via `window.confirm`.
- [ ] **DK-8** Audit-Event `submission_form_texts_update` mit Details `{form, locale, changed_fields[]}`. Diff-Algorithmus emittiert 0..4 Events pro Save (eine pro tatsächlich geänderter Form×Locale). `extractAuditEntity` erweitert.
- [ ] **DK-9** Discovery-Verifikation **vor Implementation**: wo werden die Newsletter-prose-keys (`newsletter.heading`, `intro`, `privacy`) tatsächlich gerendert? Discovery sagte „NewsletterSignupForm headless, Caller (Projekt-Seite) rendert heading/intro" — verifizieren + alle Read-Sites sammeln.
- [ ] **DK-10** Test-Coverage: `route.test.ts` (GET/PUT/validation/diff), `submission-form-texts.test.ts` (merge-helper, alle Permutations), `SubmissionTextsEditor.test.tsx` (jsdom: render/isDirty/save/reset/dirty-guard). Mindestens 25 neue Tests.
- [ ] **DK-11** Manueller Visual-Smoke (DE+FR public pages, Save→public reflektiert, Reset-zu-Default, Logout-during-dirty).

## Done-Definition

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
