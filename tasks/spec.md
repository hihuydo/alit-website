# Spec: Newsletter-Signup auf Discours-Agités-Projekt-Seite konsolidieren
<!-- Created: 2026-04-20 -->
<!-- Author: Planner (Claude) -->
<!-- Status: Implemented v2 — DK-4 + DK-9 addressed, re-trigger Sonnet re-evaluation -->

## Summary

Das Newsletter-Signup zieht weg von `/[locale]/newsletter` und der Panel-3-Navigation auf die **Discours-Agités-Projekt-Seite** (`/[locale]/projekte/discours-agites/`). Die Signup-Aktivierung + der editierbare Intro-Paragraph sind zwei neue Spalten in der `projekte`-Tabelle — **für diesen Sprint bewusst nur auf dem einen kanonischen Projekt (slug `discours-agites`) aktiviert**; die Felder sind zwar per-Projekt, aber Routing und Anchor sind single-project-scoped. Gleichzeitig wird der Slug-Typo `discours-agits` → `discours-agites` behoben (inkl. 308-Redirect vom alten Slug, wegen shared Staging/Prod-DB zwingend).

## Context

- **Newsletter heute:** `src/app/[locale]/newsletter/page.tsx` returns `null`; der Content wird von `Navigation.tsx → NavBars → NewsletterContent` basierend auf Pathname gerendert. Das Signup ist ein reines Formular (kein Content), Subscribers landen in `newsletter_subscribers`-Tabelle (`/api/signup/newsletter/`). Keine Mailer-Integration.
- **Discours-Agités-Projekt existiert:** DB-Row `projekte.id = 10` mit `slug_de = "discours-agits"` (Typo: fehlendes `e`). `slug_fr = null`. `hashtags` in `agenda_items` und `journal_entries` referenzieren diesen Slug **null-mal** (verifiziert via DB-query) — Slug-Fix ist risikofrei.
- **Projekt-Panel-Rendering:** `src/app/[locale]/projekte/[slug]/page.tsx` returns `null` (nur URL-Anker + Metadata). Der Projekt-Expansion-Content rendert in Panel 3 über `src/components/ProjekteList.tsx` via `useParams`. ⇒ Signup-Form muss in `ProjekteList`, nicht in der slug-Route.
- **Projekte-DB-Schema:** `projekte` hat bereits i18n-JSONB-Spalten (`title_i18n`, `kategorie_i18n`, `content_i18n`) + Slug-Paar (`slug_de` NOT NULL, `slug_fr` NULLABLE mit UNIQUE-Index WHERE NOT NULL). Neue Spalten werden via `ensureSchema` + `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` idempotent angehängt.
- **Previous Sprint Pattern (PR #99, journal-info):** Editierbarer Rich-Text-Content mit Dict-Fallback via `JournalBlockRenderer` ist etabliert. Dieser Sprint verwendet das gleiche Rendering-Pattern — nur der Storage-Ort verschiebt sich von globalem `site_settings` zu per-Projekt.

Reference: `CLAUDE.md`, `memory/project.md`, `memory/lessons.md` (Rich-Text Round-Trip, Partial-PUT-Falle bei nullable Feldern, One-time-migration marker-table).

## Requirements

### Must Have (Sprint Contract)

1. **Schema-Migration (idempotent, in `ensureSchema()`):**
   - `ALTER TABLE projekte ADD COLUMN IF NOT EXISTS show_newsletter_signup BOOLEAN NOT NULL DEFAULT FALSE`
   - `ALTER TABLE projekte ADD COLUMN IF NOT EXISTS newsletter_signup_intro_i18n JSONB`
   - One-time Slug-Fix: `UPDATE projekte SET slug_de = 'discours-agites' WHERE slug_de = 'discours-agits'` (idempotent via WHERE-Clause; zweiter Run ist No-op).
2. **API-Update `/api/dashboard/projekte/…`:**
   - **GET** (both list + by-id): Response-Shape erweitert um `show_newsletter_signup: boolean` und `newsletter_signup_intro_i18n: {de: JournalContent | null, fr: JournalContent | null} | null`. Dashboard muss den persistierten State round-trippen können — sonst verliert der Editor die Feld-Werte nach Save+Reload.
   - **PUT**: akzeptiert optional `show_newsletter_signup: boolean` und `newsletter_signup_intro_i18n: {de: JournalContent | null, fr: JournalContent | null} | null`. **Top-Level Partial-PUT** (Key fehlt im Body) lässt DB-Wert unverändert (CASE WHEN, kein COALESCE — siehe `patterns/api.md`). **Nested i18n-Write ist full-object**: Wenn `newsletter_signup_intro_i18n` im Body steht, wird das komplette JSONB-Objekt ersetzt (beide Locales); Client muss `{de, fr}` mit expliziten Werten (oder `null`) schicken. Keine locale-level Merge-Semantik.
   - Validierung der `newsletter_signup_intro_i18n`-Struktur: muss Objekt mit genau den Keys `de` und `fr` sein, deren Werte entweder `null` oder valider `JournalContent` (via bestehendem `validateContent()` aus `journal-validation.ts`). Fehlender Key → 400.
   - Empty-Content (via `isJournalInfoEmpty()`) pro Locale normalisiert auf `null` **vor** dem DB-Write.
   - **POST** akzeptiert die gleichen Felder (Defaults: `show_newsletter_signup = false`, `newsletter_signup_intro_i18n = null`).
3. **Public-Read (`getProjekte`, `Projekt` Type):**
   - `Projekt` Type erweitert um `showNewsletterSignup: boolean` und `newsletterSignupIntro: JournalContent | null` (locale-resolved). Intro fällt zurück auf Dict-String (`dict.newsletter.intro`) wenn Row-Value null/empty — in Single-Paragraph wrapped (gleiches Pattern wie `getJournalInfo`).
   - `isFallback` wird **nicht** extra geflaggt (der Intro-Text ist in beiden Locales via Dict vorhanden, echter Cross-Locale-Fallback ist selten praktisch relevant und fügt Komplexität für wenig Gewinn hinzu).
4. **NewsletterSignupForm-Component extrahieren (neu: `src/components/NewsletterSignupForm.tsx`):**
   - Enthält nur das `<form>`-Element + Status-State (idle/submitting/success/error) + Submit-Handler + Honeypot + Consent-Checkbox + DSGVO-Privacy-Text.
   - Prop `dict: Dictionary["newsletter"]` — Labels, Error-Messages, Submit-Button, Success-Copy bleiben Dict-gestrichen (kein Admin-Override).
   - **Kein** Heading und **kein** Intro intern — die rendert der Caller.
5. **Projekt-Public-Rendering (`ProjekteList.tsx`):**
   - Wenn `p.showNewsletterSignup === true` und das Projekt expanded ist: nach dem Content-Block rendert ein `<section aria-labelledby="newsletter-signup-heading-{slug}" id="newsletter-signup-{slug}">` mit:
     - Sichtbarer `<h2 id="newsletter-signup-heading-{slug}">{dict.newsletter.heading}</h2>` (Text aus Dict: „Bleibe auf dem Laufenden" / „Restez informé·e") — Landmark-Heading für Screen-Reader, damit die neue Section a11y-äquivalent zur alten `NewsletterContent` ist.
     - `<JournalBlockRenderer content={p.newsletterSignupIntro}>` (editbarer Intro-Paragraph)
     - `<NewsletterSignupForm dict={dict.newsletter}>` (Form)
   - Section-ID pro Slug verhindert Duplicate-ID-Regressionen falls das Flag später auf mehreren Projekten aktiv wäre (defensive Defense-in-Depth, auch wenn Sprint-Scope nur 1 Projekt).
   - Für den `/newsletter`-Redirect-Handler (Single-Project-Scope) existiert **zusätzlich** ein Alias-Anker `#newsletter-signup` auf dem Discours-Agités-`<section>` (z.B. via zweitem `id` oder dedicated inner `<a id="newsletter-signup">` direkt davor), damit der Redirect-Hash funktioniert.
6. **Route-Redirects + Nav-Removal:**
   - `src/app/[locale]/newsletter/page.tsx` wird **gelöscht**.
   - Ersetzt durch `src/app/[locale]/newsletter/route.ts` mit GET-Handler: `return NextResponse.redirect(new URL('/<locale>/projekte/discours-agites#newsletter-signup', req.url), 308)`.
   - **Old-Slug-Redirect (Must-Have, nicht Nice-to-Have):** `src/app/[locale]/projekte/discours-agits/route.ts` GET-Handler: `return NextResponse.redirect(new URL('/<locale>/projekte/discours-agites', req.url), 308)`. Grund: shared Staging/Prod-DB — die Schema-Migration rewriet `slug_de` beim ersten Deploy (z.B. Staging), während die Prod-App noch alte Routes serviert. Ohne Redirect bekommen Prod-User sofort 404 auf Deep-Links + Bookmarks + Crawler-URLs. Der Redirect-Handler darf auch nach dem Prod-Deploy bleiben (covers bookmarks/cached crawls).
   - `src/components/Navigation.tsx`: `newsletter` aus `navItems` + `renderContent`-switch entfernt; `NewsletterContent`-Import + -File gelöscht.
   - `src/i18n/dictionaries.ts`: `nav.newsletter` Dict-Schlüssel **bleibt** (unused — Entfernen wäre Spurious-Change, kein Sprint-Ziel). `newsletter.heading`, `newsletter.intro` etc. bleiben — werden weiterhin von Form + Section-Heading gebraucht.
   - `src/app/sitemap.ts`: `/<locale>/newsletter` aus Sitemap entfernt.
7. **Dashboard-Editor in Projekt-Edit-Form (`ProjekteSection.tsx`):**
   - Neuer Checkbox-Field "Newsletter-Signup auf Projekt-Seite anzeigen" (binded an `show_newsletter_signup`).
   - Wenn Checkbox true: per-Locale RichTextEditor-Block „Einleitungstext (Newsletter)" im bestehenden Locale-Tab-Container (DE/FR). Gleiches Muster wie Projekt-Description.
   - Wenn Checkbox false: Editor ausgegraut / versteckt — gespeicherter Intro bleibt erhalten (nicht bei Toggle-Off gelöscht).
   - Dirty-Guard: nutzt bestehenden DirtyKey `"projekte"` (kein neuer Key nötig — Projekt-Edit ist bereits tracked).
8. **Audit-Event (Must-Have, promoted aus Nice-to-Have):**
   - Public-facing Lead-Capture-Surface + Admin-seitig mutierbar → Änderungen an `show_newsletter_signup` UND an `newsletter_signup_intro_i18n` (pro Locale) erzeugen ein Audit-Event. Pattern matcht bestehende `slug_fr_change`- und `agenda_instagram_export`-Events in `src/lib/audit.ts`.
   - Single Event-Type `projekt_newsletter_signup_update` mit Details-Payload: `{ show_newsletter_signup_changed: boolean, intro_de_changed: boolean, intro_fr_changed: boolean, show_newsletter_signup_new?: boolean }`. Fires im PUT-Handler nach erfolgreichem DB-Write.
   - Entity-Mapping in `extractAuditEntity`: `projekte` → Projekt-ID.
9. **Tests:**
   - Unit-Test: `getProjekte` liefert `showNewsletterSignup` + `newsletterSignupIntro` mit Dict-Fallback bei null.
   - API-Test: GET-Response enthält neue Felder für alle List- und By-ID-Responses.
   - API-Test: PUT akzeptiert neue Felder, Partial-PUT (Key fehlt) ändert DB-Wert nicht, Empty-Normalisierung auf `null`, invalide i18n-Shape → 400.
   - API-Test: Audit-Event wird bei change geschrieben, nicht bei no-op-PUT.
   - Redirect-Test: GET `/de/newsletter` → 308 mit Location `/de/projekte/discours-agites#newsletter-signup`.
   - Redirect-Test: GET `/de/projekte/discours-agits` → 308 mit Location `/de/projekte/discours-agites` (old-slug compat).
   - Component-Test: `NewsletterSignupForm` mounted + Submit POSTet Payload an `/api/signup/newsletter/`.
   - Dashboard-Component-Test: ProjekteSection Form-Submit mit Checkbox+Intro persistiert (minimum Smoke, nicht umfassend).
10. **Quality Gates:** `pnpm build` ✓, `pnpm test` grün (≥+12 neue Tests, 528 → ≥540), `pnpm audit --prod` 0 HIGH/CRITICAL.
11. **Staging-Smoke:**
   - `/de/projekte/discours-agites/` zeigt Heading + Form + Intro unter Projekt-Content.
   - `/de/newsletter` → 308 → `/de/projekte/discours-agites#newsletter-signup`.
   - `/de/projekte/discours-agits` → 308 → `/de/projekte/discours-agites` (old-slug compat).
   - Panel-3-Nav zeigt nur `Alit` und `Mitgliedschaft` (nicht mehr `Newsletter`).
   - Signup-Form submit schreibt erfolgreich in `newsletter_subscribers`-Tabelle.
   - Admin-UI: Checkbox toggeln + Save → Audit-Event im `audit_events`-Table mit Entity `projekte` + Projekt-ID.

### Nice to Have (explicit follow-up, NOT this sprint)

1. **Editable Consent/Privacy-Texts** via Dashboard — DSGVO-Risiko, bewusst out-of-scope.
2. **`nav.newsletter` Dict-Key cleanup** — jetzt unused, future-scope.
3. **Multi-Project-Signup-Support** — wenn der Kunde später auf mehreren Projekten Signup aktivieren will, muss:
   - `/newsletter`-Redirect-Target dynamisch werden (z.B. erstes Projekt mit Flag, oder fester Default aus `site_settings`).
   - Form-`action` / Section-Heading ggf. per-Projekt unterscheiden.
   - Tracking woher der Subscriber kam (Projekt-ID in `newsletter_subscribers.source`).
   Section-IDs sind bereits per-Slug (kein Duplicate-ID-Risiko).
4. **DSGVO-Re-Consent-Banner** falls der Kontext-Wechsel (Newsletter → Discours-Agités) als materielle Change in der Zweckbindung gilt.

### Out of Scope

- Admin-UI für Subscriber-Management (bleibt in `SignupsSection`, unverändert).
- Migration bestehender Subscriber oder Re-Opt-in-E-Mails.
- `MitgliedschaftContent`-Parallelisierung — Mitgliedschaft-Form bleibt wo sie ist.
- Mailer-Integration oder automatische E-Mail-Versände aus dem neuen Setup.

## Technical Approach

### Files to Change

| File | Change Type | Description |
|------|-------------|-------------|
| `src/lib/schema.ts` | Modify | ALTER TABLE + Slug-Fix UPDATE (beide idempotent) |
| `src/lib/queries.ts` | Modify | `getProjekte` + `getProjekteForSitemap` um neue Felder erweitern, Intro-Fallback via Dict |
| `src/content/projekte.ts` | Modify | `Projekt` Type um `showNewsletterSignup` + `newsletterSignupIntro` |
| `src/app/api/dashboard/projekte/route.ts` | Modify | GET (list) + POST inkludieren neue Felder |
| `src/app/api/dashboard/projekte/[id]/route.ts` | Modify | GET (by-id) inkludiert neue Felder; PUT Partial-PUT-sicher + full-object-i18n + Audit-Event |
| `src/app/api/dashboard/projekte/route.test.ts` | Modify/Create | Tests für GET-shape, POST defaults, PUT partial/full/empty-normalize/invalid-shape/audit |
| `src/components/NewsletterSignupForm.tsx` | Create | Extrahiertes `<form>` ohne Heading/Intro |
| `src/components/NewsletterSignupForm.test.tsx` | Create | Render + Submit + Honeypot + Success-State |
| `src/components/nav-content/NewsletterContent.tsx` | Delete | Nicht mehr benötigt |
| `src/components/Navigation.tsx` | Modify | `newsletter` entfernt aus `navItems` + `renderContent`-switch, Import weg |
| `src/components/ProjekteList.tsx` | Modify | Render `<section id="newsletter-signup">` mit Intro + Form wenn Flag true |
| `src/app/[locale]/newsletter/page.tsx` | Delete | Ersetzt durch Route-Handler |
| `src/app/[locale]/newsletter/route.ts` | Create | GET → 308 Redirect |
| `src/app/[locale]/newsletter/route.test.ts` | Create | Redirect-Target + Status-Code |
| `src/app/[locale]/projekte/discours-agits/route.ts` | Create | Old-slug GET → 308 Redirect auf `discours-agites` (Must-Have wegen shared-DB) |
| `src/app/[locale]/projekte/discours-agits/route.test.ts` | Create | Old-slug redirect-Target + Status-Code |
| `src/app/sitemap.ts` | Modify | `/newsletter` aus Sitemap-Einträgen entfernt |
| `src/lib/audit.ts` | Modify | Neuer Event-Type `projekt_newsletter_signup_update` |
| `src/lib/audit-entity.ts` | Modify | Mapping für neuen Event-Type auf `projekte`-Entity |
| `src/app/dashboard/components/ProjekteSection.tsx` | Modify | Checkbox + per-Locale RichTextEditor im Form |
| `src/app/dashboard/components/ProjekteSection.test.tsx` | Modify/Create | Test für Checkbox+Intro-Speichern |

### Architecture Decisions

- **Per-Projekt-Felder + Single-Project-Scope diesen Sprint:** Die DB-Spalten sind per-Projekt, aber `/newsletter`-Redirect-Target ist hardcoded auf `discours-agites`, der Section-Heading-Text ist ein globaler Dict-String, und die Form postet zum gemeinsamen `/api/signup/newsletter/`-Endpoint (keine Source-Projekt-Tracking). **Multi-Project ist explizit out-of-scope** (→ Nice-to-Have #3). Wenn Admin das Flag später auf ein zweites Projekt setzt, rendert dort zwar die Form, aber `/newsletter` zeigt weiter auf discours-agites und alle Subscriber landen ohne Source-Unterscheidung im gleichen Topf.
- **Section-ID per Slug (`newsletter-signup-{slug}`)** — defensive Pattern gegen Duplicate-IDs falls Multi-Project jemals aktiv. Zusätzlich ein `newsletter-signup`-Alias-Anker auf der discours-agites-Section, damit der `/newsletter`-Hash-Redirect funktioniert.
- **`newsletter_signup_intro_i18n` full-object-write:** Partial-PUT-Semantik gilt nur auf Top-Level-Key-Ebene (`show_newsletter_signup`, `newsletter_signup_intro_i18n` vorhanden/fehlend im Body). Nested Locale-Merge ist explizit **nicht** unterstützt — Client sendet immer `{de, fr}` komplett. Reason: Nested Partial-Semantik ist die exakte Klasse von Bugs, die der Partial-PUT-Pattern im Repo vermeidet.
- **Kein neuer DirtyKey:** Der Projekt-Edit-Flow ist bereits als `"projekte"` Dirty-getracked. Das neue Feld ist Teil des Projekt-Form-State, kein eigener Editor-Block mit Save-Button → kein Extra-Key nötig.
- **Intro-Dict-Fallback ohne `isFallback`-Flag:** Der Intro-Text ist in beiden Locales in der Dict hinterlegt, kein Cross-Locale-Fallback-Case im Public-Read.
- **Slug-Fix: idempotente UPDATE + Must-Have-Redirect (nicht Nice-to-Have):** `slug_de`-Rewrite ist 1 Row, aber `slug_de` ist live-URL / sitemap / canonical / bookmark-target. Shared staging/prod-DB (PR #99 Pattern dokumentiert in `memory/lessons.md`) heißt: Staging-Deploy mutiert die Prod-DB **bevor** der Prod-Code läuft. Ohne old-slug-Redirect würden Prod-User während des Deploy-Windows sofort 404 auf `/projekte/discours-agits` bekommen. Redirect als Route-Handler in `src/app/[locale]/projekte/discours-agits/route.ts`.
- **308 statt 301:** `permanentRedirect` aus `next/navigation` nutzt 308 (methode-preserving). Konsistent mit `[slug]/page.tsx`-Canonical-Redirects.
- **`NewsletterContent` wird gelöscht, nicht deprecated:** Einziger Consumer ist Navigation.tsx, der auch angepasst wird.
- **Audit-Event (Must-Have, nicht Nice-to-Have):** Public-facing Lead-Capture-Surface + Admin-Mutability → Änderungs-Visibility erforderlich. Einziger Event-Type `projekt_newsletter_signup_update` erfasst sowohl Checkbox-Toggle als auch Intro-Text-Change, im PUT-Handler nach erfolgreichem DB-Write.

### Dependencies

- Keine neuen npm-Pakete.
- Keine neuen env-Vars.
- Keine externen API-Integrationen.
- Nutzt bestehende: `requireAuth` + CSRF (via `src/lib/api-helpers.ts`), `validateContent` (`src/lib/journal-validation.ts`), `isJournalInfoEmpty`/`wrapDictAsParagraph` (`src/lib/journal-info-shared.ts`), `JournalBlockRenderer`, `RichTextEditor`, `blocksToHtml`/`htmlToBlocks`.

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| Admin aktiviert Checkbox, speichert ohne Intro-Text einzugeben | Intro in DB bleibt `null`; Public rendert Dict-Fallback. |
| Admin deaktiviert Checkbox, Intro-Text bleibt gespeichert | Public rendert kein Signup; gespeicherter Intro bleibt erhalten. Bei Re-Aktivierung erscheint alter Intro wieder. |
| Admin löscht Intro-Text (leere Paragraphen), speichert | `isJournalInfoEmpty()` normalisiert auf `null`; Dict-Fallback greift. |
| User hat `/de/newsletter` gebookmarkt | 308 Redirect → `/de/projekte/discours-agites#newsletter-signup`; Browser scrollt zur Form. |
| User ist auf `/de/projekte/discours-agites`, Projekt ist **archived** | Archive-Flag betrifft Visibility nicht, nur Archive-Badge. Signup wird weiterhin gerendert. |
| FR-Variante: User auf `/fr/projekte/discours-agites` (kein `slug_fr` gesetzt) | Rendert FR-Dict-Intro + FR-Dict-Labels + FR-Success-Copy. Funktional identisch zu DE. |
| Projekt-Slug-Fix läuft mehrfach (Container-Restart) | Idempotent: `UPDATE WHERE slug_de = 'discours-agits'` matcht 0 Rows beim zweiten Run. |
| Admin speichert mit invalidem JournalContent im Intro | `validateContent`-Return → 400 `Ungültiges Format (newsletter_signup_intro)`. |
| Admin öffnet Projekt ohne `show_newsletter_signup` im DB-Row (DEFAULT FALSE) | Checkbox unchecked; Editor-Block collapsed. |
| `newsletter_subscribers`-Insert schlägt fehl (DB down) | Signup-Form zeigt `error-generic` (bestehendes Verhalten, unverändert). |
| User submittet Form während `show_newsletter_signup` gerade false wurde | Request landet trotzdem bei `/api/signup/newsletter/` (Backend-API unverändert). Kein 404/403. |

## Risks

- **Rich-Text-Round-Trip bei Intro:** Bereits bekanntes Risiko (Patterns: `patterns/react.md`, `memory/lessons.md`). Mitigation: gleiches Pattern wie für journal-info, welches bereits geshipped ist (PR #99).
- **Dashboard Partial-PUT-Regression:** Wenn der PUT-Handler nicht Partial-PUT-safe ist, kann ein Save ohne `show_newsletter_signup`-Feld den Flag auf `false` zurücksetzen. Mitigation: Test für Partial-PUT (nur `title_i18n` ändern → `show_newsletter_signup` bleibt). CASE WHEN-Pattern, nicht COALESCE.
- **Nested-i18n-Clobber:** Wenn Client versehentlich `{de: null, fr: null}` sendet statt die Feld-Update auszulassen, wird der komplette Intro gelöscht. Mitigation: Test für "sending both locales" + Dashboard-Editor sendet immer den aktuellen State beider Locales.
- **Slug-Fix-Race mit Live-Deploy (shared Staging+Prod-DB):** Staging-Deploy rewriet `slug_de` in der prod-DB bevor der Prod-Code redeployed ist. Ohne Old-Slug-Redirect würden Prod-User sofort 404 bekommen. **Mitigation: Old-slug-Redirect ist Must-Have** (siehe Req #6). Zusätzlich: Migration läuft instant, Redirect deckt bookmarks+cached crawls ab auch post-deploy.
- **Slug-Fix-Blast-Radius breiter als ursprünglich angenommen:** `slug_de` ist live-URL, sitemap, canonical, hreflang, user-visible Link-Ziel. Mitigation: Redirect deckt Bookmarks/Cached-Crawls; Sitemap wird nach Code-Deploy von Suchmaschinen neu gecrawlt.
- **Audit-Event-Noise:** Wenn Admin bei Save keine Felder ändert, darf kein leeres Audit-Event feuern. Mitigation: Change-Detection (alter Wert vs. neuer Wert) vor `auditLog()`-Call.
- **A11y-Regression durch fehlende Heading:** Addressed via Must-Have `<h2>` mit `aria-labelledby`.
- **CSP: Neue `<section>` mit Inline-Form** — keine neuen Scripts, kein CSP-Impact.
- **SEO / Sitemap:** `/newsletter` entfällt aus Sitemap. Suchmaschinen folgen 308 → indexieren Projekt-Seite. Link-Equity sollte zum neuen Target transferieren.
- **Mobile Sub-Viewport:** Panel 3 auf Mobile zeigt Projekt-Expansion; Signup-Form muss in dem schmalen Container rendern. Mitigation: Visual-Check auf Staging im 375px-Viewport.
