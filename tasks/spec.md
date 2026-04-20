# Spec: Newsletter-Signup auf Discours-Agités-Projekt-Seite konsolidieren
<!-- Created: 2026-04-20 -->
<!-- Author: Planner (Claude) -->
<!-- Status: Draft -->

## Summary

Das Newsletter-Signup zieht weg von `/[locale]/newsletter` und der Panel-3-Navigation auf die **Discours-Agités-Projekt-Seite** (`/[locale]/projekte/discours-agites/`). Die Signup-Aktivierung + der editierbare Intro-Paragraph sind **per-Projekt** Felder in der `projekte`-Tabelle — Admin aktiviert sie explizit bei Discours Agités, kann später aber für andere Projekte aktivieren ohne Code-Change. Gleichzeitig wird der Slug-Typo `discours-agits` → `discours-agites` behoben.

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
2. **API-Update `/api/dashboard/projekte/[id]/`:**
   - PUT akzeptiert optional `show_newsletter_signup: boolean` und `newsletter_signup_intro_i18n: {de?: JournalContent | null, fr?: JournalContent | null}`.
   - Partial-PUT-safe: Felder die nicht im Body stehen, werden NICHT auf `null` gesetzt (CASE WHEN-Pattern, kein COALESCE — siehe patterns/api.md).
   - Zod-/manuelle Validierung der `newsletter_signup_intro_i18n`-Struktur via bestehendem `validateContent()` aus `journal-validation.ts`.
   - Empty-Content (via `isJournalInfoEmpty()`) pro Locale normalisiert auf `null`.
   - POST akzeptiert die gleichen Felder (Defaults: `show_newsletter_signup = false`, `newsletter_signup_intro_i18n = null`).
3. **Public-Read (`getProjekte`, `Projekt` Type):**
   - `Projekt` Type erweitert um `showNewsletterSignup: boolean` und `newsletterSignupIntro: JournalContent | null` (locale-resolved). Intro fällt zurück auf Dict-String (`dict.newsletter.intro`) wenn Row-Value null/empty — in Single-Paragraph wrapped (gleiches Pattern wie `getJournalInfo`).
   - `isFallback` wird **nicht** extra geflaggt (der Intro-Text ist in beiden Locales via Dict vorhanden, echter Cross-Locale-Fallback ist selten praktisch relevant und fügt Komplexität für wenig Gewinn hinzu).
4. **NewsletterSignupForm-Component extrahieren (neu: `src/components/NewsletterSignupForm.tsx`):**
   - Enthält nur das `<form>`-Element + Status-State (idle/submitting/success/error) + Submit-Handler + Honeypot + Consent-Checkbox + DSGVO-Privacy-Text.
   - Prop `dict: Dictionary["newsletter"]` — Labels, Error-Messages, Submit-Button, Success-Copy bleiben Dict-gestrichen (kein Admin-Override).
   - **Kein** Heading und **kein** Intro intern — die rendert der Caller.
5. **Projekt-Public-Rendering (`ProjekteList.tsx`):**
   - Wenn `p.showNewsletterSignup === true` und das Projekt expanded ist: nach dem Content-Block rendert ein `<section id="newsletter-signup">` mit:
     - `<JournalBlockRenderer content={p.newsletterSignupIntro}>` (editbarer Intro-Paragraph)
     - `<NewsletterSignupForm dict={dict.newsletter}>` (Form)
   - Container-ID `newsletter-signup` aktiviert Browser-Hash-Scroll für `#newsletter-signup`-Links.
6. **`/newsletter`-Route Redirect + Nav-Removal:**
   - `src/app/[locale]/newsletter/page.tsx` wird **gelöscht**.
   - Ersetzt durch `src/app/[locale]/newsletter/route.ts` mit GET-Handler: `return NextResponse.redirect(new URL('/<locale>/projekte/discours-agites#newsletter-signup', req.url), 308)`.
   - `src/components/Navigation.tsx`: `newsletter` aus `navItems` + `renderContent`-switch entfernt; `NewsletterContent`-Import + -File gelöscht.
   - `src/i18n/dictionaries.ts`: `nav.newsletter` Dict-Schlüssel **bleibt** (unused — Entfernen wäre Spurious-Change, kein Sprint-Ziel).
   - `src/app/sitemap.ts`: `/<locale>/newsletter` aus Sitemap entfernt.
7. **Dashboard-Editor in Projekt-Edit-Form (`ProjekteSection.tsx`):**
   - Neuer Checkbox-Field "Newsletter-Signup auf Projekt-Seite anzeigen" (binded an `show_newsletter_signup`).
   - Wenn Checkbox true: per-Locale RichTextEditor-Block „Einleitungstext (Newsletter)" im bestehenden Locale-Tab-Container (DE/FR). Gleiches Muster wie Projekt-Description.
   - Wenn Checkbox false: Editor ausgegraut / versteckt — gespeicherter Intro bleibt erhalten (nicht bei Toggle-Off gelöscht).
   - Dirty-Guard: nutzt bestehenden DirtyKey `"projekte"` (kein neuer Key nötig — Projekt-Edit ist bereits tracked).
8. **Tests:**
   - Unit-Test: `getProjekte` liefert `showNewsletterSignup` + `newsletterSignupIntro` mit Dict-Fallback bei null.
   - API-Test: PUT akzeptiert neue Felder, Partial-PUT ohne die Felder ändert sie nicht, Empty-Normalisierung auf `null`.
   - Redirect-Test: GET `/de/newsletter` → 308 mit Location `/de/projekte/discours-agites#newsletter-signup`.
   - Component-Test: `NewsletterSignupForm` mounted + Submit POSTet Payload an `/api/signup/newsletter/`.
   - Dashboard-Component-Test: ProjekteSection Form-Submit mit Checkbox+Intro persistiert (minimum Smoke, nicht umfassend).
9. **Quality Gates:** `pnpm build` ✓, `pnpm test` grün (≥+10 neue Tests, 528 → ≥538), `pnpm audit --prod` 0 HIGH/CRITICAL.
10. **Staging-Smoke:**
   - `/de/projekte/discours-agites/` zeigt Form + Intro unter Projekt-Content.
   - `/de/newsletter` → 308 → `/de/projekte/discours-agites#newsletter-signup`.
   - Panel-3-Nav zeigt nur `Alit` und `Mitgliedschaft` (nicht mehr `Newsletter`).
   - Signup-Form submit schreibt erfolgreich in `newsletter_subscribers`-Tabelle.

### Nice to Have (explicit follow-up, NOT this sprint)

1. **Old-slug-Redirect** (`/projekte/discours-agits` → `/projekte/discours-agites`) — falls Backlinks existieren, derzeit unbekannt. Next.js `redirects()`-config in `next.config.ts` wäre trivial; landet in `memory/todo.md`.
2. **Editable Consent/Privacy-Texts** via Dashboard — DSGVO-Risiko, bewusst out-of-scope.
3. **`nav.newsletter` Dict-Key cleanup** — jetzt unused, future-scope.
4. **Audit-Event `projekt_newsletter_signup_toggle`** — für Change-History im Admin-Panel.
5. **Generischer "Signup-Embed" pro Projekt** — was wenn der Kunde später auf mehreren Projekten Signup will? Die Infrastruktur (Boolean-Flag + JSONB) ist bereits generisch; nur der hashtag auf dem Projekt-Rendering-Case müsste nichts tun (funktioniert out-of-the-box).

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
| `src/app/api/dashboard/projekte/route.ts` | Modify | POST akzeptiert neue Felder |
| `src/app/api/dashboard/projekte/[id]/route.ts` | Modify | PUT akzeptiert Partial-PUT-sichere Updates |
| `src/app/api/dashboard/projekte/route.test.ts` | Modify/Create | Tests für neue Felder (create+update-Pfade) |
| `src/components/NewsletterSignupForm.tsx` | Create | Extrahiertes `<form>` ohne Heading/Intro |
| `src/components/NewsletterSignupForm.test.tsx` | Create | Render + Submit + Honeypot + Success-State |
| `src/components/nav-content/NewsletterContent.tsx` | Delete | Nicht mehr benötigt |
| `src/components/Navigation.tsx` | Modify | `newsletter` entfernt aus `navItems` + `renderContent`-switch, Import weg |
| `src/components/ProjekteList.tsx` | Modify | Render `<section id="newsletter-signup">` mit Intro + Form wenn Flag true |
| `src/app/[locale]/newsletter/page.tsx` | Delete | Ersetzt durch Route-Handler |
| `src/app/[locale]/newsletter/route.ts` | Create | GET → 308 Redirect |
| `src/app/[locale]/newsletter/route.test.ts` | Create | Redirect-Target + Status-Code |
| `src/app/sitemap.ts` | Modify | `/newsletter` aus Sitemap-Einträgen entfernt |
| `src/app/dashboard/components/ProjekteSection.tsx` | Modify | Checkbox + per-Locale RichTextEditor im Form |
| `src/app/dashboard/components/ProjekteSection.test.tsx` | Modify/Create | Test für Checkbox+Intro-Speichern |

### Architecture Decisions

- **Per-Projekt-Felder statt globaler `site_settings`:** Spec sagt "direkt im Projekt machen". Vorteile: natürliche Zuordnung zum Projekt-Editor, erweiterbar ohne Code-Change (Admin kann das Flag auf weitere Projekte setzen, falls später gewünscht). Alternative geprüft: global in `site_settings` (wie journal-info) — abgelehnt, weil Signup konzeptuell an den Projekt-Inhalt koppelt, nicht an die Site.
- **Kein neuer DirtyKey:** Der Projekt-Edit-Flow ist bereits als `"projekte"` Dirty-getracked. Das neue Feld ist Teil des Projekt-Form-State, kein eigener Editor-Block mit Save-Button → kein Extra-Key nötig. Unterschied zu `journal-info` (dort war's ein standalone Editor).
- **Intro-Dict-Fallback ohne `isFallback`-Flag:** Der Intro-Text ist in beiden Locales in der Dict hinterlegt, also gibt es keinen Cross-Locale-Fallback-Case im Public-Read (DE leer → DE-Dict; FR leer → FR-Dict). Das simpelt die Typ- und Rendering-Signaturen gegenüber `getJournalInfo`.
- **Slug-Fix per idempotenter UPDATE WHERE ohne Marker-Table:** DB-Row-Count für die Typo-Match ist 1, kein Cascade nötig (0 Hashtag-Refs verifiziert). Marker-Table für 1 Fix wäre Overkill. WHERE-Clause macht zweiten Run no-op.
- **308 statt 301:** `permanentRedirect` aus `next/navigation` nutzt 308 (methode-preserving). Konsistent mit `[slug]/page.tsx`-Canonical-Redirects. Moderne Browser cachen beide identisch.
- **`NewsletterContent` wird gelöscht, nicht deprecated:** Einziger Consumer ist Navigation.tsx, der auch angepasst wird. Keine externen Call-Sites.
- **Slug-Hardcode `discours-agites` im Redirect-Handler:** Nach Slug-Fix stabil. Falls später der Projekt-Slug wieder geändert werden sollte, müsste dieser Redirect mitgehen — aber der Slug ist laut CLAUDE.md immutable post-create.

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
- **Slug-Fix-Race mit Live-Deploy:** Prod-Migration läuft bei Container-Start; gleichzeitig kann ein User `/de/projekte/discours-agits` öffnen (pre-fix noch existent). Mitigation: UPDATE läuft instant, Gap ist sub-second; auch wenn der User 404 bekommt, ist das ein akzeptabler Transient. Alternative "mit Canonical-Redirect absichern" ist Nice-to-Have.
- **CSP: Neue `<section>` mit Inline-Form** — keine neuen Scripts, kein CSP-Impact.
- **SEO / Sitemap:** `/newsletter` entfällt aus Sitemap. Suchmaschinen folgen 308 → indexieren Projekt-Seite. Link-Equity sollte zum neuen Target transferieren.
- **Mobile Sub-Viewport:** Panel 3 auf Mobile zeigt Projekt-Expansion; Signup-Form muss in dem schmalen Container rendern. Bestehende Form hat `form-row` CSS aus dem NewsletterContent-Use — sollte wiederverwendbar sein. Mitigation: Visual-Check auf Staging im 375px-Viewport.
