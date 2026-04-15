# Spec: Dashboard-Tab "Mitgliedschaft & Newsletter" + Public Signup-Flow
<!-- Created: 2026-04-15 -->
<!-- Author: Planner (Claude) -->
<!-- Status: Approved v3 (2026-04-15, post Codex-Review Runde 2) -->
<!-- Implementation complete 2026-04-15 across 4 commits on feat/signups-dashboard -->

## Summary
Die öffentlichen Formulare auf `/mitgliedschaft` und `/newsletter` sind aktuell inert (kein `onSubmit`, kein API-Endpoint, keine DB-Persistenz). Wir verdrahten beide Formulare an zwei neue Public-POST-Endpoints, legen zwei neue DB-Tabellen (`memberships`, `newsletter_subscribers`) in `schema.ts` an und ergänzen im Dashboard einen neuen Tab "Mitgliedschaft & Newsletter" mit zwei Listen + CSV-Export pro Liste. Ein DSGVO-Delete pro Eintrag gehört zum Must-Have (es sind personenbezogene Daten).

## Context
- Formulare existieren client-seitig in `src/components/nav-content/{NewsletterContent,MitgliedschaftContent}.tsx`, aktuell ohne Submit-Logik.
- `Navigation.tsx` rendert beide Components mit bereits verfügbarem `dict` aus `src/i18n/dictionaries.ts`.
- Dashboard ist 6-Tab UI (`src/app/dashboard/page.tsx`), wird durch 7. Tab erweitert. Multi-Fetch-Screen aggregiert Teilfehler gesammelt (`failed.length < N` Pattern in `page.tsx:38-52`).
- Auth-Guard: `requireAuth(req)` aus `src/lib/api-helpers.ts` pro Route (keine Middleware-Schicht).
- Schema-Bootstrap: `instrumentation.ts` ruft `ensureSchema()` (aus `src/lib/schema.ts`) und separat `seedIfEmpty()` (aus `src/lib/seed.ts`) — **Tabellen kommen ausschließlich in `schema.ts`, `seed.ts` bleibt unangetastet**.
- Bestehende Helpers: `checkRateLimit` (`src/lib/rate-limit.ts:16`), `getClientIp` (`src/lib/client-ip.ts:9`), `auditLog` (`src/lib/audit.ts:5`), `DeleteConfirm` (Dashboard-Component).
- Lessons (Auth-Hardening): Rate-Limit keyed by `endpoint+IP`, `X-Real-IP`-only hinter nginx, keine `err.message`-Leaks an Client.

## Approved Decisions (2026-04-15)
1. **Ein Tab, zwei Listen untereinander** (Mitgliedschaften oben, Newsletter unten).
2. **Email-Duplikate:** Newsletter idempotent (200 egal ob neu oder bestehend, Anti-Enumeration-Oracle); Mitgliedschaft 409 mit freundlicher Meldung.
3. **Mitgliedschaft + Newsletter-Opt-In** legt zusätzlichen Newsletter-Eintrag an, aber per `INSERT … ON CONFLICT(email) DO NOTHING` → kein Duplikat.
4. **CSV only** (UTF-8 BOM + `;`-Delimiter), kein `.xlsx`.
5. **Bezahlt-Status** ist Nice-to-Have / v2.
6. **FR-Texte inkl. Field-Labels** via bestehendem Dictionary-System. Keine neuen `locale`-Props auf den Components — `dict` wird aus `Navigation.tsx` durchgereicht.

## Requirements

### Must Have (Sprint Contract)

**DB & Schema**
1. In `src/lib/schema.ts`: `CREATE TABLE IF NOT EXISTS memberships` (id SERIAL PK, vorname, nachname, strasse, nr, plz, stadt, email CITEXT UNIQUE NOT NULL, newsletter_opt_in BOOL NOT NULL DEFAULT false, consent_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), ip_hash TEXT) und `newsletter_subscribers` (id SERIAL PK, vorname, nachname, woher, email CITEXT UNIQUE NOT NULL, **consent_at TIMESTAMPTZ NOT NULL**, created_at, ip_hash, source TEXT NOT NULL CHECK(source IN ('form','membership'))). Indices: `(created_at DESC)` auf beiden Tabellen. CITEXT-Extension: bei fehlendem `CREATE EXTENSION` Fallback auf `TEXT` + App-seitige Lowercase-Normalisierung (siehe Correctness-2). **`seed.ts` wird NICHT angefasst** — keine neuen DDL- oder Seed-Daten für diese Tabellen.

**Startup / Config**
2. Neue Env-Var `IP_HASH_SALT` wird **eagerly** in `src/instrumentation.ts` validiert (fehlend oder leer → Throw mit klarer Meldung, Container startet nicht). `ip-hash.ts` liest den Salt nur einmal beim Modul-Load, nicht pro Request.

**Public API — Newsletter (`POST /api/signup/newsletter`)**
3. Validiert Felder (Regex/Trim/Length ≤ 200), rate-limited per IP (5 req / 15 min, Key `signup:newsletter:<ip>`).
4. Email wird **vor allen Operationen** mit `email.trim().toLowerCase()` normalisiert (bricht sonst Anti-Enumeration + Unique-Constraint).
5. **INSERT-first, ON CONFLICT(email) DO NOTHING** — **kein Vorab-SELECT**. Rückgabe immer 200 (idempotent, Anti-Enumeration).
6. Source = `'form'`.

**Public API — Mitgliedschaft (`POST /api/signup/mitgliedschaft`)**
7. Validiert, rate-limited (3 req / 15 min, Key `signup:mitgliedschaft:<ip>`), Email normalisiert (→ Kriterium 4).
8. **INSERT-first** in `memberships`. Bei PG-Error `23505` (UNIQUE-Violation) → 409 `{"error":"already_registered"}`. **Kein Vorab-SELECT.**
9. Bei `newsletter_opt_in=true` **und** erfolgreichem Membership-Insert: in **derselben Transaktion** `INSERT INTO newsletter_subscribers … ON CONFLICT(email) DO NOTHING` mit source=`'membership'`. Bei Membership-Konflikt (409) wird der Newsletter-Insert nicht probiert.

**Consent (required im API-Vertrag)**
9a. Beide Public-POST-Endpoints erwarten im Payload einen booleschen `consent: true`. Fehlt das Feld oder ist es `false` → 400 `invalid_input`, **kein DB-Insert**, `consent_at` wird **nur** bei validem Consent gesetzt (`now()` server-seitig, nie aus Client-Payload übernommen). Dies ist unabhängig vom optionalen `newsletter_opt_in`-Flag der Mitgliedschaft (der bezieht sich auf Zusatz-Newsletter-Anmeldung).

**Security / Anti-Abuse**
10. IP wird nur als `sha256(salt + ip)` gespeichert, nie im Klartext. **Rate-Limit-Key, `ip_hash` und Audit im Signup-Flow lesen ausschließlich `X-Real-IP` — kein `X-Forwarded-For`-Fallback**, auch wenn `getClientIp` Fallbacks kennt. Signup-Flow nutzt einen lokalen Helper `signupClientIp(headers)` oder liest den Header direkt; Missing → 400 `invalid_input` (Request bypassed nginx).
11. Errors an den Client generisch (`"invalid_input"` / `"already_registered"` / `"rate_limited"` / `"server_error"`) — keine `err.message`-Leaks.
12. Honeypot-Feld (hidden `<input name="company">`): ausgefüllt → Rate-Limit **zählt trotzdem** (prevents cheap abuse), **kein** DB-Insert, **kein** Audit-Log-Eintrag, Response 200 (attacker sieht nichts).

**Public-Form-Verdrahtung & A11y**
13. `NewsletterContent.tsx` und `MitgliedschaftContent.tsx` erhalten `dict`-Prop aus `Navigation.tsx`. Kein zusätzliches `locale`-Prop.
14. Alle Inputs bekommen explizite `<label>` (visually-hidden oder sichtbar — mindestens programmatisch verknüpft via `htmlFor`/`id`), zusätzlich zur bestehenden Placeholder.
15. Success/Error-Region als `<div role="status" aria-live="polite">` — Screen-Reader kündigen Statuswechsel an.
16. Submit-Handler: POST, Success → Formular durch Danke-Message ersetzt, Error-Banner bei 400/409/429/500, Button disabled + "Wird gesendet…" während Loading, Formular bei 409 bleibt ausgefüllt.

**Dashboard**
17. Neuer Tab key `signups`, Label "Mitgliedschaft & Newsletter", zwischen `alit` und `projekte` im Tabs-Array.
18. Fetch in `dashboard/page.tsx`: als **6. `Promise.all`-Call** (`/api/dashboard/signups/`), identisches `.catch(() => ({success:false}))`-Pattern, Teilfehler-Aggregation erweitert um `"Anmeldungen"`-Label (konsistent zu bestehendem Fehler-Banner).
19. `SignupsSection`-Component zeigt beide Listen (Counter im Section-Header, neueste zuerst deterministisch via DB-ORDER `created_at DESC, id DESC`), Delete-Button pro Zeile mit bestehendem `DeleteConfirm`. **Refetch-on-Mount**: `initial`-Prop wird als First-Paint-Fallback genutzt, die Section lädt beim Mount per `fetch('/api/dashboard/signups/')` eigene frische Daten (konsistent zum Pattern in `AgendaSection`, `JournalSection`, `AlitSection` — verhindert stale State bei Tab-Wechsel).
20. Pro Eintrag gerendert: Name, Email, Adresse/Woher, Datum (DE-formatiert), Source (nur Newsletter), opt-in-Flag (Mitgliedschaft).

**Admin API**
21. `GET /api/dashboard/signups/route.ts` — guarded via `requireAuth`, gibt `{success, data: {memberships, newsletter}}` zurück, sort `created_at DESC, id DESC`.
22. `DELETE /api/dashboard/signups/[type]/[id]/route.ts` — guarded, `type ∈ {memberships, newsletter}` (Identifier-Allowlist), `id` via `validateId`. Idempotent: existiert Row nicht mehr → **204 No Content** (kein 404, UI bleibt konsistent). Bei Löschung: `auditLog` mit erweitertem Schema (siehe Security-Kriterium 23). UI refreshed die Liste ohne Hard-Error bei 204.
23. `auditLog`-Event-Union wird erweitert um `"signup_delete"`. Details-Shape erweitert um `{ actor_email?: string, type?: 'memberships'|'newsletter', row_id?: number }` (Admin-Identität + Kontext, für Forensik). Bestehende Call-Sites unverändert (alle Felder optional).
24. `GET /api/dashboard/signups/export/route.ts?type=memberships|newsletter` — guarded, `text/csv; charset=utf-8` mit UTF-8 BOM + `;`-Delimiter, `Content-Disposition: attachment; filename="<type>-YYYY-MM-DD.csv"`, sort `created_at DESC, id DESC`.

**Qualität**
25. `src/lib/csv.ts` + `src/lib/csv.test.ts` (Escape `;`, `"`, `\n`, Umlaute, leere Zellen, BOM-Präfix, **Formula-Injection-Schutz**: Zellen, die mit `=`, `+`, `-`, `@`, TAB oder CR beginnen, werden mit `'`-Präfix neutralisiert — attacker-controlled Public-Form-Daten dürfen in Excel/Numbers nicht als Formel interpretiert werden).
26. `pnpm build` passt ohne TS-/Lint-Errors. `pnpm test` grün.
27. Keine server-only-Imports (`pg`, `crypto/randomBytes` top-level) im Client-Bundle der Form-Components.
28. `.env.example` **anlegen** (existiert nicht) mit dokumentierten Env-Vars inkl. `IP_HASH_SALT`.

### Nice to Have (Follow-ups, NICHT diesen Sprint)
1. `.xlsx`-Export via `exceljs`.
2. Status-Feld `paid` + Toggle + `paid_at` auf Mitgliedschaft.
3. Admin-Notizen pro Eintrag.
4. Double-Opt-In für Newsletter.
5. Filter/Suche und Bulk-Delete im Dashboard.
6. Audit-Trail-Sicht im Dashboard.
7. Pagination / Row-Limit für Listen und Export (bei >10k Einträgen relevant).
8. FR-Copy-Politur der langen erklärenden Form-Texte (nur Kern-Labels + CTA + Status-Texte sind Must-Have).

### Out of Scope
- Newsletter-Versand (SMTP, MJML, Unsubscribe-Links).
- Zahlungsintegration CHF 50.–.
- Member-Login-Area auf der Website.

## Technical Approach

### Files to Change
| File | Change | Description |
|------|--------|-------------|
| `src/lib/schema.ts` | Modify | CREATE TABLE memberships + newsletter_subscribers + Indices, CITEXT-Fallback |
| `src/instrumentation.ts` | Modify | Eager validate `IP_HASH_SALT` vor `ensureSchema` |
| `src/lib/ip-hash.ts` | Create | `hashIp()` per SHA-256 mit Salt (lazy Const aus env, Read beim Module-Load) |
| `src/lib/signup-validation.ts` | Create | Plain-TS Guards für beide Payload-Typen + `normalizeEmail()` |
| `src/lib/audit.ts` | Modify | Event-Union + `"signup_delete"`, Details-Shape erweitern (alle neu optional) |
| `src/app/api/signup/newsletter/route.ts` | Create | POST, rate-limit, honeypot, normalize, INSERT ON CONFLICT |
| `src/app/api/signup/mitgliedschaft/route.ts` | Create | POST, rate-limit, honeypot, normalize, INSERT-first mit 23505 → 409, optional Newsletter-Insert in Transaction |
| `src/app/api/dashboard/signups/route.ts` | Create | GET both lists, `requireAuth` |
| `src/app/api/dashboard/signups/[type]/[id]/route.ts` | Create | DELETE idempotent 204, type-Allowlist, audit |
| `src/app/api/dashboard/signups/export/route.ts` | Create | GET CSV, `requireAuth` |
| `src/app/dashboard/components/SignupsSection.tsx` | Create | Liste + Delete + Export |
| `src/app/dashboard/page.tsx` | Modify | Tab + 6. Fetch parallelisiert, Teilfehler-Aggregation konsistent |
| `src/components/Navigation.tsx` | Modify | `dict`/`messages` an Form-Components durchreichen |
| `src/components/nav-content/NewsletterContent.tsx` | Modify | `dict`-Prop, `<label>` + `aria-live`, onSubmit, Honeypot |
| `src/components/nav-content/MitgliedschaftContent.tsx` | Modify | wie oben + 409-Handling + opt-in-Checkbox |
| `src/i18n/dictionaries.ts` | Modify | `de`/`fr` um Form-Labels/Placeholders/Status-Texte erweitern |
| `src/lib/csv.ts` + `src/lib/csv.test.ts` | Create | Escape `;` `"` `\n`, UTF-8 BOM |
| `.env.example` | Create | Dokumentierte Env-Vars inkl. `IP_HASH_SALT` |

### Architecture Decisions
- **Tabellen nur in `schema.ts`:** respektiert bestehendes Bootstrap-Split (`ensureSchema` vs `seedIfEmpty`).
- **INSERT-first, kein check-then-insert:** DB ist Source-of-Truth für Uniqueness. Siehe `patterns/auth.md` "Check-then-Insert Races" + `patterns/database.md`.
- **Zwei Tabellen statt eine `signups`-Tabelle mit type-Spalte:** unterschiedliche Shapes, saubere Constraints.
- **CSV statt xlsx:** DE-Excel öffnet UTF-8+BOM+`;` nativ. `.xlsx` in Nice-to-Have.
- **IP-Hash mit Salt:** DSGVO-konform.
- **Honeypot statt reCAPTCHA:** keine 3rd-Party, kein DSGVO-Transfer.
- **`dict` durchreichen statt `locale`-Prop:** Dict-System ist bereits auf `Navigation`-Ebene geladen — doppeltes Locale-Prop wäre unnötige Coupling-Fläche.
- **Delete idempotent 204:** Admin-UX bleibt konsistent, kein 404-Fehler-Flash bei konkurrierenden Deletes.
- **CITEXT mit TEXT-Fallback:** bevorzugt CITEXT für native case-insensitive Uniqueness; Fallback sichert Funktion auch ohne Extension (App-Layer-Lowercase reicht, da wir vor Insert ohnehin normalisieren).

### Dependencies
- Env-Var `IP_HASH_SALT` (dokumentiert in `.env.example`, gesetzt in Docker-Compose Prod + Staging vor Deploy).
- Keine neuen npm-Packages.

## Edge Cases
| Case | Expected Behavior |
|------|-------------------|
| Newsletter `Test@X.org` → dann `test@x.org` | Beide normalisieren auf `test@x.org` → ein Row, idempotent |
| Mitgliedschaft mit existierender Email (case-variiert) | 409 `already_registered` (nach Normalisierung) |
| Mitgliedschaft + `newsletter_opt_in=true`, Email schon im Newsletter | Membership-Insert erfolgt, Newsletter-Insert ON CONFLICT DO NOTHING (kein Duplikat, keine Transaction-Rollback) |
| Membership-Insert failed (23505) | Transaktion abbrechen, Newsletter-Insert nicht probiert, 409 |
| Rate-Limit überschritten | 429 `rate_limited` |
| Honeypot ausgefüllt | 200 silent, Rate-Limit zählt hoch, kein DB-Insert, kein Log |
| Missing required / invalid email / überlange Felder | 400 `invalid_input` |
| CSV `;` oder `"` im Namen | korrekt escaped (Quote-Wrapping + Doppel-Quote-Escape) |
| CSV leere Liste | Datei mit nur Header-Zeile + BOM |
| Delete auf bereits gelöschte Row | 204, UI refreshed (keine Error-UX) |
| Delete mit ungültigem type | 400 `invalid_input` (Allowlist) |
| Dashboard-GET ohne JWT | 401 via `requireAuth` |
| Dashboard: 1 von 6 Fetches fehlschlägt | bestehendes Teilfehler-Banner zeigt `"Fehler beim Laden: Anmeldungen"`, andere Tabs funktionieren |
| Startup ohne `IP_HASH_SALT` | `instrumentation.ts` wirft, Container startet nicht |

## Risks
- **DSGVO:** PII (Name, Adresse, Email). Mitigation: IP-Hash, Delete-Button, `consent_at`, Datenschutz-Link bereits vorhanden.
- **Spam-Bots:** Honeypot + Rate-Limit (counts auch Honeypot-Hits) + Email-Unique.
- **Enumeration-Oracle Newsletter:** mitigiert durch idempotentes 200.
- **CSV-Performance bei Wachstum:** <10k unproblematisch, Pagination als Nice-to-Have.
- **i18n-Lücke FR-Copy:** Kern-Labels sind Must-Have, stilistische Politur als Nice-to-Have.

## Codex-Review-Iteration Runde 2 (2026-04-15)
Round-2-Review verifizierte alle 12 Round-1-Findings als VERIFIED und fand 4 neue Findings — alle 4 eingearbeitet:
- Contract-R2-1 (Consent als required API-Vertrag): Kriterium 9a + `newsletter.consent_at NOT NULL`.
- Security-R2-1 (X-Real-IP only, kein XFF-Fallback): Kriterium 10.
- Security-R2-2 (CSV Formula-Injection): Kriterium 25.
- Architecture-R2-1 (Refetch-on-Mount pattern): Kriterium 19.

## Codex-Review-Iteration Runde 1 (2026-04-15)
Codex-Deep-Review (`tasks/codex-spec-review.md`) fand 13 Findings; alle 12 Contract/Correctness/Security/Architecture wurden in diese v2 eingearbeitet:
- Contract-1 (seed.ts): bereinigt → Tabellen nur in `schema.ts`.
- Contract-2 (IP_HASH_SALT eager check): in `instrumentation.ts`.
- Correctness-1 (Insert-first, 23505): im Contract explizit.
- Correctness-2 (Email-Normalisierung): neues Must-Have 4+7.
- Correctness-3 (Delete-Idempotenz 204): im Contract 22.
- Correctness-4 (Deterministic Sort): `created_at DESC, id DESC` explizit.
- Security-1 (`requireAuth` statt `authMiddleware`): Naming korrigiert.
- Security-2 (Audit-Payload erweitert): Kriterium 23.
- Security-3 (Honeypot + Rate-Limit + No-Log): Kriterium 12.
- Architecture-1 (dict durchreichen): Kriterium 13.
- Architecture-2 (a11y labels + aria-live): Kriterien 14–15.
- Architecture-3 (Fehleraggregation konsistent): Kriterium 18.
- Nice-to-have-1 (FR-Copy-Politur): parkiert.
