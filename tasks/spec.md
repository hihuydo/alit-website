# Spec: Dashboard-Tab "Mitgliedschaft & Newsletter" + Public Signup-Flow
<!-- Created: 2026-04-15 -->
<!-- Author: Planner (Claude) -->
<!-- Status: Approved (2026-04-15) -->

## Summary
Die öffentlichen Formulare auf `/mitgliedschaft` und `/newsletter` sind aktuell inert (kein `onSubmit`, kein API-Endpoint, keine DB-Persistenz). Wir verdrahten beide Formulare an zwei neue Public-POST-Endpoints, legen zwei neue DB-Tabellen an (`memberships`, `newsletter_subscribers`) und ergänzen im Dashboard einen neuen Tab "Mitgliedschaft & Newsletter" mit zwei Listen + CSV-Export pro Liste. Ein DSGVO-Delete pro Eintrag gehört zum Must-Have (es sind personenbezogene Daten).

## Context
- Formulare existieren client-seitig in `src/components/nav-content/{NewsletterContent,MitgliedschaftContent}.tsx`, aber ohne Submit-Logik.
- Dashboard ist 6-Tab UI (`src/app/dashboard/page.tsx`), wird durch einen 7. Tab erweitert.
- Stack: Next.js App Router, PostgreSQL, JWT-Auth über `authMiddleware` für `/api/dashboard/*`, bestehende Helpers `checkRateLimit`, `getClientIp`.
- Lessons (Auth-Hardening): Rate-Limit keyed by `endpoint+IP`, `X-Real-IP`-only hinter nginx, keine `err.message`-Leaks an Client.

## Approved Decisions (2026-04-15)
1. **Ein Tab, zwei Listen untereinander** (Mitgliedschaften oben, Newsletter unten) — bestätigt.
2. **Email-Duplikate:** Newsletter **idempotent** (200, kein Duplikat-Row, kein Enumeration-Oracle); Mitgliedschaft **409** mit freundlicher Meldung — bestätigt.
3. **Mitgliedschaft + Newsletter-Opt-In:** zusätzlicher Newsletter-Eintrag wird in derselben Transaktion per `INSERT … ON CONFLICT(email) DO NOTHING` angelegt → **kein Duplikat**, auch wenn die Email schon im Newsletter ist — bestätigt.
4. **CSV only** (UTF-8 BOM + `;`), kein `.xlsx` — bestätigt.
5. **Bezahlt-Status** bleibt Nice-to-Have / v2 — bestätigt.
6. **FR-Texte** für Success/Error **inklusive FR-Field-Labels** — erweitert: auch die bestehenden DE-hardcoded Labels auf `/fr/` übersetzen (Prénom, Nom, Rue, Nº, NPA, Ville, E-Mail, Adresse, "Je confirme…", "S'inscrire" etc.). Dictionary-Einträge unter `src/dictionaries/{de,fr}.ts` (falls schon vorhanden, sonst lokaler `messages`-Hash).

## Requirements

### Must Have (Sprint Contract)

**DB & Backend**
1. Migration: Tabellen `memberships` (vorname, nachname, strasse, nr, plz, stadt, email UNIQUE, newsletter_opt_in BOOL, consent_at TIMESTAMPTZ NOT NULL, created_at, ip_hash TEXT) und `newsletter_subscribers` (vorname, nachname, woher, email UNIQUE, consent_at, created_at, ip_hash, source TEXT — `'form'` | `'membership'`).
2. Public POST `/api/signup/newsletter` → validiert Felder, legt Eintrag an, idempotent bei bestehender Email (returns 200, kein State-Leak); rate-limited per IP (5 req / 15 min).
3. Public POST `/api/signup/mitgliedschaft` → validiert, legt Eintrag in `memberships` an, bei `newsletter_opt_in=true` zusätzlich in `newsletter_subscribers` (source=`'membership'`, idempotent) in **einer Transaktion**; 409 bei Email-Duplikat in `memberships`; rate-limited (3 req / 15 min).
4. IP wird nur als SHA-256-Hash gespeichert (DSGVO-Minimierung), nie im Klartext.
5. Errors an den Client sind generisch (`{"error":"invalid_input"}` / `"already_registered"` / `"rate_limited"` / `"server_error"`) — keine `err.message`-Leaks.

**Public-Form-Verdrahtung**
6. `NewsletterContent.tsx` und `MitgliedschaftContent.tsx` bekommen `onSubmit`-Handler: POST an passenden Endpoint, Success- und Error-State inline angezeigt, Formular wird bei Success ausgeblendet und durch Danke-Nachricht ersetzt.
7. Submit-Button zeigt Loading-State (`disabled`, "Wird gesendet…").
8. Honeypot-Feld (versteckter Input, z.B. `company`) — bei ausgefüllt → silent 200 ohne DB-Insert.

**Dashboard**
9. Neuer Tab "Mitgliedschaft & Newsletter" (key `signups`) zwischen "Über Alit" und "Projekte".
10. Tab zeigt zwei Listen: **Mitgliedschaften** (oben) und **Newsletter-Abonnent:innen** (unten). Pro Eintrag: Name, Email, Adresse/Woher, created_at (formatiert DE), Source (nur Newsletter), Delete-Button mit Confirm.
11. Listen sortiert neueste zuerst. Counter "(N)" im Sektion-Header.
12. GET `/api/dashboard/signups` → gibt `{memberships, newsletter}` als JSON zurück. Protected via `authMiddleware`.
13. DELETE `/api/dashboard/signups/:type/:id` (type ∈ `memberships|newsletter`) → löscht Eintrag. DSGVO-Erfordernis. Audit-Log-Eintrag.
14. GET `/api/dashboard/signups/export?type=memberships|newsletter` → liefert `text/csv; charset=utf-8` mit UTF-8 BOM und `;`-Delimiter. `Content-Disposition: attachment; filename="mitgliedschaften-YYYY-MM-DD.csv"`. Protected via `authMiddleware`.
15. Dashboard-UI hat zwei "CSV exportieren"-Buttons (einen pro Liste), die den Export-Endpoint in neuem Tab öffnen bzw. als Download triggern.

**Qualität**
16. `pnpm build` passt ohne TS-/Lint-Errors.
17. Seed (`src/lib/seed.ts`) legt die neuen Tabellen idempotent an (CREATE TABLE IF NOT EXISTS).
18. Keine `NEXT_PUBLIC_*`-Env für die API-Pfade (relative Pfade), keine server-only-Leaks im Client-Bundle.

### Nice to Have (Follow-ups, NICHT diesen Sprint)
1. `.xlsx`-Export via `exceljs` (nur falls CSV in Excel-Locale wider Erwarten Probleme macht).
2. Status-Feld auf Mitgliedschaft: `paid` Bool + Toggle + `paid_at` Timestamp. Export-CSV inkl. Status.
3. Admin-Notizen pro Eintrag (`notes` TEXT).
4. Email-Bestätigung (Double-Opt-In) via Magic-Link (erfordert SMTP-Konfiguration).
5. Filter/Suche in Dashboard-Liste (nach Name/Email).
6. Bulk-Delete in Dashboard.
7. Audit-Trail-Sicht im Dashboard (welcher Admin hat wann gelöscht).

### Out of Scope
- Newsletter-Versand (Mailer-Integration, MJML, Unsubscribe-Links) — pure Signup-Liste, keine Outbound-Mail.
- Zahlungsintegration CHF 50.– — bleibt manuell per Banküberweisung.
- OAuth/Member-Area auf der Website — keine Login-Funktion für Mitglieder.

## Technical Approach

### Files to Change
| File | Change | Description |
|------|--------|-------------|
| `src/lib/schema.ts` | Modify | CREATE TABLE memberships + newsletter_subscribers, Indices auf email + created_at |
| `src/lib/seed.ts` | Modify | Tabellen idempotent anlegen (keine Seed-Daten für diese Tabellen) |
| `src/lib/signup-validation.ts` | Create | Zod-freier Validator (ist im Repo unüblich) — plain TS Guards für beide Payload-Typen, Email-Regex, Trim, Length-Caps |
| `src/lib/ip-hash.ts` | Create | `hashIp(ip: string): string` via `crypto.createHash('sha256')` + Salt aus `IP_HASH_SALT` env |
| `src/app/api/signup/newsletter/route.ts` | Create | POST, rate-limit, validate, INSERT ON CONFLICT DO NOTHING, 200/400/429 |
| `src/app/api/signup/mitgliedschaft/route.ts` | Create | POST, rate-limit, validate, INSERT in Transaction (+ optional newsletter), 200/400/409/429 |
| `src/app/api/dashboard/signups/route.ts` | Create | GET beide Listen, authMiddleware |
| `src/app/api/dashboard/signups/[type]/[id]/route.ts` | Create | DELETE, authMiddleware, audit |
| `src/app/api/dashboard/signups/export/route.ts` | Create | GET CSV, authMiddleware, UTF-8 BOM + `;` |
| `src/app/dashboard/components/SignupsSection.tsx` | Create | Liste + Delete + Export-Buttons |
| `src/app/dashboard/page.tsx` | Modify | Neuer Tab + Fetch |
| `src/components/nav-content/NewsletterContent.tsx` | Modify | `onSubmit`-Handler, Success/Error-State, Loading, Honeypot |
| `src/components/nav-content/MitgliedschaftContent.tsx` | Modify | wie oben |
| `src/lib/csv.ts` | Create | `toCsv(rows, headers)` mit `;`-Escape, Quote-Escape (`"` → `""`), UTF-8 BOM |
| `src/lib/csv.test.ts` | Create | Unit-Tests: Escape von `;`, `"`, `\n`, leere Zellen, Umlaute |
| `.env.example` | Modify | `IP_HASH_SALT=change-me` |
| `src/components/nav-content/NewsletterContent.tsx` (i18n) | Modify | Locale-Prop + FR-Labels/Placeholders |
| `src/components/nav-content/MitgliedschaftContent.tsx` (i18n) | Modify | Locale-Prop + FR-Labels/Placeholders |

### Architecture Decisions
- **Zwei Tabellen statt einer `signups` mit type-Spalte:** unterschiedliche Shapes (Adresse vs. "woher"), sauberere Uniqueness-Constraints pro Flow. Trade-off: leichte Duplikation in Dashboard-Query (2 SELECT statt 1) — akzeptabel.
- **CSV statt xlsx:** DE-Excel öffnet UTF-8-BOM + `;` direkt als Tabelle. xlsx wäre Extra-Dep (`exceljs` ~1 MB) ohne echten Mehrwert. Als Nice-to-Have parkiert.
- **IP-Hash mit Salt:** DSGVO-konform (kein Rückschluss auf Person, dient nur Abuse-Detection). Salt aus Env, nicht committed.
- **Rate-Limit strenger als bei Login (5/15min):** Signup ist ein Ziel für Spam-Bots; auf einem ruhigen Verein-Portal sind 5 echte Newsletter-Anmeldungen pro IP/15min reichlich.
- **Honeypot statt reCAPTCHA:** keine 3rd-Party-Abhängigkeit, kein DSGVO-Transfer, reicht für Low-Volume-Site.
- **Idempotenz via `INSERT … ON CONFLICT (email) DO NOTHING`:** stabile Public-API, verhindert Enumeration-Oracle (Response sieht gleich aus egal ob Email neu oder existierend).
- **Separate Route pro Signup-Type:** klarer Rate-Limit-Key, klare OpenAPI-Shape, einfachere Tests — statt `?type=newsletter` Query-Param.

### Dependencies
- Env-Var `IP_HASH_SALT` (ich dokumentiere in `.env.example`, deployment-Doc-Update in `memory/project.md` als Abschluss-Schritt).
- Keine neuen npm-Packages.

## Edge Cases
| Case | Expected Behavior |
|------|-------------------|
| Newsletter-Signup mit bereits existierender Email | 200 OK, kein neuer DB-Row, kein Error an Client (Anti-Enumeration) |
| Mitgliedschaft mit existierender Email | 409 `{error:"already_registered"}` — Client zeigt "Diese E-Mail ist bereits registriert. Bitte melde dich bei uns, falls du deine Daten ändern möchtest." |
| Mitgliedschaft mit `newsletter_opt_in=true` + Email schon in `newsletter_subscribers` | Mitgliedschaft-Insert failed (siehe oben), Newsletter-Insert wird nicht probiert (Transaktion rollt nicht nötig — Mitgliedschaft-Check passiert zuerst) |
| Rate-Limit überschritten | 429 `{error:"rate_limited"}`, UI zeigt "Zu viele Versuche. Bitte später erneut." |
| Honeypot ausgefüllt | 200 silent, **kein** DB-Insert, **kein** Log-Leak an Attacker |
| Missing required field | 400 `{error:"invalid_input"}`, UI zeigt bestehende "Bitte alle Felder ausfüllen." |
| Ungültige Email-Format | 400 `{error:"invalid_input"}` |
| Überlange Felder (>200 chars) | 400 |
| CSV-Export mit `;` in Namen (z.B. "Meier; Peter") | korrekt escaped `"Meier; Peter"` |
| CSV-Export leere Liste | Datei mit nur Header-Zeile |
| Delete-Button ohne Confirm | nicht möglich — Delete-Flow nutzt bestehenden `DeleteConfirm`-Component |
| DB-Insert-Fehler (z.B. Connection lost) | 500 `{error:"server_error"}`, UI zeigt generisches "Etwas ist schiefgelaufen." |
| Signup-API ohne Rate-Limit-Header | ok — Middleware-Standard-Pattern, keine Header-Requirement |
| Dashboard-GET ohne JWT | 401 — `authMiddleware` greift standardmäßig |

## Risks
- **DSGVO:** personenbezogene Daten (Name, Adresse, Email). Mitigation: IP-Hash statt Klartext, Delete-Button im Dashboard, `consent_at`-Timestamp pro Eintrag, Datenschutz-Link auf beiden Forms bereits vorhanden (gemäß bestehender `memory/todo.md` — Datenschutz-PDF ist verlinkt).
- **Spam-Bots füllen DB:** Honeypot + Rate-Limit + Email-Unique-Index. Wenn trotzdem Probleme: hCaptcha als Follow-up.
- **Performance CSV-Export bei großem Datensatz:** bei <10k Einträgen unproblematisch. Bei Wachstum Streaming-CSV nachrüsten (Follow-up).
- **Enumeration-Oracle auf Newsletter-Endpoint:** mitigiert durch "200 OK idempotent" statt "409 email exists" (siehe oben). Mitgliedschaft bewusst mit 409, da dort UX-Nutzen (User soll wissen, dass er schon Mitglied ist).
- **i18n-Lücke:** Forms sind auf `/fr/` aktuell deutsch. Nicht Regression dieses Sprints, aber als Follow-up im Nice-to-Have.
