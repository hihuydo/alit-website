# Sprint: Newsletter-Signup auf Discours-Agités-Projekt-Seite konsolidieren
<!-- Spec: tasks/spec.md -->
<!-- Started: 2026-04-20 -->

## Done-Kriterien (Sprint Contract)

> Alle müssen PASS sein bevor der Sprint als fertig gilt.

- [ ] **DK-1 (Schema):** `projekte` hat Spalten `show_newsletter_signup BOOLEAN NOT NULL DEFAULT FALSE` + `newsletter_signup_intro_i18n JSONB`. ALTER ist idempotent (zweiter Run wirft keine Error).
- [ ] **DK-2 (Slug-Fix):** Projekt mit Typo-Slug `discours-agits` existiert in DB nicht mehr; wurde durch `discours-agites` ersetzt. SQL-Query: `SELECT slug_de FROM projekte WHERE id=10` → `discours-agites`. Fix ist idempotent.
- [ ] **DK-3 (Public-Read-Fallback):** `/de/projekte/discours-agites/` mit DB `newsletter_signup_intro_i18n=null` und `show_newsletter_signup=true` rendert Dict-Intro als Single-Paragraph + Signup-Form.
- [ ] **DK-4 (Public-Read-Custom-Intro):** Mit DB-gespeichertem Custom-Intro rendert genau dieser Rich-Text über `JournalBlockRenderer`, nicht der Dict-Text.
- [ ] **DK-5 (Flag-Off rendert kein Signup):** Projekt mit `show_newsletter_signup=false` zeigt nur Content, kein `<section id="newsletter-signup">`.
- [ ] **DK-6 (API PUT Partial-safe):** PUT mit Body ohne `show_newsletter_signup`-Key lässt DB-Wert unverändert (CASE WHEN statt COALESCE, verifiziert via Unit-Test).
- [ ] **DK-7 (API PUT Empty-Normalisierung):** PUT mit `newsletter_signup_intro_i18n.de = [{type:"paragraph",content:[{text:""}]}]` speichert DB als `{de: null, fr: ...}`.
- [ ] **DK-8 (API POST Defaults):** POST ohne neue Felder erzeugt Row mit `show_newsletter_signup=false`, `newsletter_signup_intro_i18n=null`.
- [ ] **DK-9 (Redirect):** `GET /de/newsletter` → 308 mit Location `/de/projekte/discours-agites#newsletter-signup`; `GET /fr/newsletter` → 308 mit Location `/fr/projekte/discours-agites#newsletter-signup`.
- [ ] **DK-10 (Panel-3-Nav):** Panel-3 zeigt `Alit` und `Mitgliedschaft`, **nicht** `Newsletter`. `NewsletterContent.tsx` existiert nicht mehr.
- [ ] **DK-11 (Dashboard-Editor):** ProjekteSection Form hat Checkbox "Newsletter-Signup auf Projekt-Seite anzeigen" + bei aktivem Flag einen per-Locale RichTextEditor für den Intro-Text. Save persistiert beide Felder.
- [ ] **DK-12 (Signup-Backend unverändert):** POST `/api/signup/newsletter/` funktioniert weiterhin; neue Row in `newsletter_subscribers` mit `source = 'form'`.
- [ ] **DK-13 (Build + Tests):** `pnpm build` ohne TS-Errors. `pnpm test` grün, +≥10 Tests (528 → ≥538).
- [ ] **DK-14 (Audit):** `pnpm audit --prod` 0 HIGH/CRITICAL.
- [ ] **DK-15 (Staging-Smoke):** Staging-Deploy grün. UI: Projekt-Checkbox speichern, öffentliche Seite zeigt Form, Submit erzeugt Subscriber-Row. Auf Mobile-Viewport (375px) rendert Form lesbar.

## Tasks

### Phase 1 — Schema + DB-Fix
- [ ] `src/lib/schema.ts` — ALTER TABLE für zwei neue Spalten (IF NOT EXISTS) + Slug-Fix UPDATE (idempotent)
- [ ] Staging-DB-Test: Container-Restart → SELECT-Verify für beide Effekte

### Phase 2 — Public-Read-Pfad
- [ ] `src/content/projekte.ts` — `Projekt` Type um `showNewsletterSignup: boolean` + `newsletterSignupIntro: JournalContent | null`
- [ ] `src/lib/queries.ts` — `getProjekte` + `getProjekteForSitemap` um neue Felder erweitern; Dict-Fallback via `wrapDictAsParagraph` (reuse aus `journal-info-shared.ts`)
- [ ] Unit-Test für `getProjekte` mit/ohne gespeicherten Intro

### Phase 3 — API (Dashboard)
- [ ] `src/app/api/dashboard/projekte/route.ts` — POST akzeptiert neue Felder (Defaults für fehlende)
- [ ] `src/app/api/dashboard/projekte/[id]/route.ts` — PUT Partial-PUT-safe via CASE WHEN, Zod-artige Validation für Intro-Struktur, Empty-Normalisierung
- [ ] API-Tests: POST default, PUT happy, PUT partial (unchanged), PUT empty-normalize, PUT invalid-struct

### Phase 4 — Form-Extraction + Redirect
- [ ] `src/components/NewsletterSignupForm.tsx` — aus NewsletterContent extrahiert, ohne Heading/Intro
- [ ] `src/components/NewsletterSignupForm.test.tsx` — Render + Submit + Honeypot + Success
- [ ] `src/components/nav-content/NewsletterContent.tsx` — DELETE
- [ ] `src/components/Navigation.tsx` — `newsletter` aus `navItems` + `renderContent` entfernt, Import weg
- [ ] `src/app/[locale]/newsletter/page.tsx` — DELETE
- [ ] `src/app/[locale]/newsletter/route.ts` — NEW: GET → 308 Redirect
- [ ] `src/app/[locale]/newsletter/route.test.ts` — Redirect-Target, Status-Code
- [ ] `src/app/sitemap.ts` — `/newsletter` raus

### Phase 5 — Projekt-Public-Rendering
- [ ] `src/components/ProjekteList.tsx` — conditional `<section id="newsletter-signup">` mit Intro + Form

### Phase 6 — Dashboard-Editor
- [ ] `src/app/dashboard/components/ProjekteSection.tsx` — Checkbox + per-Locale RichTextEditor, Save-Flow inkl. neuer Felder in Payload
- [ ] Component-Test: ProjekteSection Form-Submit persistiert neue Felder (Smoke)

### Phase 7 — Verification
- [ ] `pnpm build` lokal grün
- [ ] `pnpm test` lokal grün, +≥10 neue Tests
- [ ] `pnpm audit --prod` 0 HIGH/CRITICAL
- [ ] Dev-Smoke: Projekt-Dashboard → Flag aktivieren → Projekt-Seite öffnen → Form-Submit → Subscriber-Row
- [ ] Staging-Push + Deploy-Verifikation (CI grün + Health + UI-Smoke + Logs clean)
- [ ] Staging-Smoke: `/de/newsletter` → 308 → `#newsletter-signup`; Panel-3 zeigt kein Newsletter mehr; Form submit erfolgreich

## Notes

- **Patterns-Check vor Start:**
  - `patterns/api.md` → Partial-PUT `CASE WHEN` statt `COALESCE` (**kritisch für DK-6**)
  - `patterns/database.md` → idempotente ALTER, `ADD COLUMN IF NOT EXISTS`
  - `patterns/react.md` → Rich-Text Round-Trip
- **Re-Use aus PR #99 (journal-info):**
  - `isJournalInfoEmpty()`, `wrapDictAsParagraph()` aus `src/lib/journal-info-shared.ts`
  - `blocksToHtml`/`htmlToBlocks` aus `src/app/dashboard/components/journal-html-converter.ts`
- **Keine Breaking-URL-Changes für bestehende Projekt-URLs:** Slug-Fix betrifft genau 1 Row, der alte URL `/projekte/discours-agits` hatte keine Hashtag-Refs und war gerade erst angelegt (ID=10, wahrscheinlich keine externen Backlinks). Nice-to-Have Redirect für dieses old-slug → in `memory/todo.md`.
- **Branch-Konvention:** neuer Feature-Branch `feat/newsletter-to-discours-agites`.
- **Deploy-Reihenfolge:** Schema-Migration läuft beim Container-Start via `ensureSchema()`. Neue App-Revision läuft erst nach Migration, daher konsistent.
