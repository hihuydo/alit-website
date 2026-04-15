# Sprint: Dashboard-Tab "Mitgliedschaft & Newsletter" + Public Signup-Flow
<!-- Spec: tasks/spec.md (v2 nach Codex-Review) -->
<!-- Started: 2026-04-15 -->

## Done-Kriterien
> Alle müssen PASS sein bevor der Sprint als fertig gilt.

- [ ] Tabellen `memberships` + `newsletter_subscribers` nur in `schema.ts`, NICHT in `seed.ts` (UNIQUE(email), Index created_at DESC, CITEXT mit TEXT-Fallback).
- [ ] `instrumentation.ts` failt beim Startup, wenn `IP_HASH_SALT` leer/fehlt — Container startet nicht.
- [ ] Beide POST-Endpoints: Payload ohne `consent:true` → 400 `invalid_input`, kein DB-Insert. `newsletter_subscribers.consent_at` ist `NOT NULL` in der Schema-Definition.
- [ ] Signup-Endpoints nutzen nur `X-Real-IP` (kein XFF-Fallback). Request ohne X-Real-IP → 400.
- [ ] `SignupsSection` refetcht beim Mount eigenständig (initial-Prop nur First-Paint-Fallback).
- [ ] CSV-Export: Zelle `=1+1` wird als `'=1+1` exportiert (Formula-Injection-Schutz), Unit-Test grün.
- [ ] `POST /api/signup/newsletter` mit `Test@X.org` → 200, zweiter Call mit `test@x.org` → 200, DB hat 1 Row mit `test@x.org`.
- [ ] `POST /api/signup/mitgliedschaft` mit neuer Email → 200. Zweiter Call (case-variiert) → 409 `{"error":"already_registered"}`. **Kein Vorab-SELECT im Code** — nur INSERT + 23505-Catch.
- [ ] `newsletter_opt_in:true` + Email schon im Newsletter → Membership-Insert ok, Newsletter bleibt bei 1 Row.
- [ ] Honeypot-Feld gesetzt → 200, Rate-Limit-Counter +1, DB-Row-Count unverändert, kein Audit/Log-Eintrag.
- [ ] 6. Request innerhalb 15min von derselben IP → 429 (für beide Endpoints).
- [ ] Form-Submit `/de/newsletter`: Danke-Text bei Success, `role="status" aria-live="polite"`-Region für Status-Announce, Button disabled + "Wird gesendet…".
- [ ] Form `/fr/newsletter`: FR-Labels (Prénom, Nom, D'où, E-mail, "S'inscrire", Consent-Checkbox-Text, Status-Texte).
- [ ] Alle Inputs haben explizite `<label htmlFor>` (kein Placeholder-only).
- [ ] Form-Submit `/de/mitgliedschaft`: wie oben + inline-409-Meldung "Diese E-Mail ist bereits registriert".
- [ ] Dashboard zeigt neuen Tab "Mitgliedschaft & Newsletter" zwischen "Über Alit" und "Projekte".
- [ ] Tab ist 6. Fetch im `Promise.all`, Teilfehler-Aggregation zeigt `"Fehler beim Laden: Anmeldungen"` bei Signups-Fehler, andere Tabs funktionieren.
- [ ] Listen sortiert `created_at DESC, id DESC`, Counter "(N)" im Section-Header, Delete-Button mit `DeleteConfirm`.
- [ ] DELETE auf bereits gelöschte Row → 204, UI refreshed ohne Fehler-Toast.
- [ ] `auditLog` Event-Union enthält `"signup_delete"`, Details enthalten `actor_email`, `type`, `row_id`.
- [ ] `requireAuth` (nicht `authMiddleware`) auf allen 3 `/api/dashboard/signups/*`-Routes.
- [ ] CSV-Export: UTF-8 BOM + `;`, `Content-Disposition: attachment`, Dateiname `<type>-YYYY-MM-DD.csv`, in Excel/Numbers als Tabelle lesbar (manueller Test).
- [ ] `src/lib/csv.test.ts` grün (Escape `;`, `"`, `\n`, Umlaute, leere Liste, BOM).
- [ ] `.env.example` neu angelegt mit `IP_HASH_SALT` + bekannten bestehenden Vars (DATABASE_URL, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD_HASH, SITE_URL).
- [ ] `pnpm build` + `pnpm test` grün.
- [ ] Bundle-Check: keine `pg`/server-only Imports im Client-Tree der Form-Components.

## Tasks

### Phase 1 — DB + Startup
- [ ] `schema.ts`: CREATE TABLE beide Tabellen, Indices, CITEXT-Versuch mit TEXT-Fallback.
- [ ] `instrumentation.ts`: eager `IP_HASH_SALT` validation vor `ensureSchema`.
- [ ] `src/lib/ip-hash.ts` + Tests.
- [ ] `src/lib/signup-validation.ts` mit `normalizeEmail()` + Guards + `consent:true`-Check.
- [ ] `src/lib/signup-client-ip.ts` (X-Real-IP only, kein XFF-Fallback).
- [ ] `src/lib/audit.ts`: Union um `"signup_delete"`, Details-Shape erweitern (backward-compatible).

### Phase 2 — Public-API
- [ ] `POST /api/signup/newsletter/route.ts`: rate-limit, honeypot-counts-rate-limit-silent-insert, normalize, INSERT ON CONFLICT DO NOTHING.
- [ ] `POST /api/signup/mitgliedschaft/route.ts`: rate-limit, honeypot, normalize, Transaction: Membership INSERT → 23505→409, bei Success optional Newsletter ON CONFLICT DO NOTHING.

### Phase 3 — Form-Components
- [ ] `src/i18n/dictionaries.ts`: DE + FR Keys für Labels, Placeholders, Consent-Texte, Success/Error/Loading, Submit-CTA.
- [ ] `Navigation.tsx`: `dict` an beide Form-Components durchreichen.
- [ ] `NewsletterContent.tsx`: `dict`-Prop, explicit `<label>`, `aria-live`-Region, onSubmit POST mit `consent:true`-Feld, Status-Handling, Honeypot-Input.
- [ ] `MitgliedschaftContent.tsx`: wie oben + 409-Handling + `newsletter_opt_in`-Flag, sendet `consent:true` (ist bereits durch Confirm-Checkbox gated).

### Phase 4 — Dashboard + Admin-API
- [ ] `src/lib/csv.ts` + `csv.test.ts` (inkl. Formula-Injection-Guard: `=/+/-/@/\t/\r`-Präfix → `'`-Quote).
- [ ] `GET /api/dashboard/signups/route.ts`: `requireAuth`, beide Listen, sort `created_at DESC, id DESC`.
- [ ] `DELETE /api/dashboard/signups/[type]/[id]/route.ts`: `requireAuth`, type-Allowlist, `validateId`, idempotent 204, auditLog.
- [ ] `GET /api/dashboard/signups/export/route.ts`: `requireAuth`, CSV streaming, filename-stempel.
- [ ] `SignupsSection.tsx`: zwei Listen + Export-Buttons + Delete-Flow + Refetch-on-Mount.
- [ ] `dashboard/page.tsx`: Tab-Union + Tabs-Array + 6. `Promise.all`-Fetch + Teilfehler-Aggregation.

### Phase 5 — Polish + Env + Verifikation
- [ ] `.env.example` neu anlegen.
- [ ] Manual Smoke: DE + FR Forms Submit, Dashboard-Liste, Delete, CSV-Export in Excel/Numbers.
- [ ] `pnpm build` + `pnpm test` grün.
- [ ] `memory/project.md` im Wrap-up um neuen Tab + `IP_HASH_SALT` ergänzen.

## Notes
- Spec v2 liegt in `tasks/spec.md` (Approved nach Codex-Review). Codex-Findings in `tasks/codex-spec-review.md` archiviert.
- Sprint Contract = Must-Have Block in Spec. Alles außerhalb = Follow-up, kein Merge-Blocker.
- Patterns-Check: `patterns/api.md` (Error-Handling, Identifier-Allowlist), `patterns/auth.md` (INSERT-first 23505, Rate-Limit, Client-IP X-Real-IP only), `patterns/database.md` (check-then-insert race).
- Rate-Limit-Keys: `signup:newsletter:<ip>` (5/15min), `signup:mitgliedschaft:<ip>` (3/15min). Memory-Key basiert auf Plaintext-IP, DB-Storage ist gehashte IP.
- Branch: `feat/signups-dashboard` (bereits angelegt).
