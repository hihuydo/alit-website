# Sprint: Dashboard-Tab "Mitgliedschaft & Newsletter" + Public Signup-Flow
<!-- Spec: tasks/spec.md -->
<!-- Started: 2026-04-15 -->

## Done-Kriterien
> Alle müssen PASS sein bevor der Sprint als fertig gilt.

- [ ] Migration in `schema.ts` + `seed.ts` legt `memberships` und `newsletter_subscribers` idempotent an (mit UNIQUE(email) + Index auf created_at DESC).
- [ ] `curl -X POST /api/signup/newsletter` mit gültigem JSON → 200, Eintrag in DB. Zweiter Call mit gleicher Email → 200, kein Duplikat in DB.
- [ ] `curl -X POST /api/signup/mitgliedschaft` mit gültigem JSON → 200, Eintrag in DB. Zweiter Call mit gleicher Email → 409 `{"error":"already_registered"}`.
- [ ] Mitgliedschaft-Request mit `newsletter_opt_in:true` legt **beide** Einträge an (memberships + newsletter_subscribers source='membership').
- [ ] Honeypot-Feld gesetzt → 200 ohne DB-Insert (verifiziert via `SELECT COUNT(*)` vor/nach).
- [ ] 6. Request innerhalb 15min von derselben IP auf `/api/signup/newsletter` → 429.
- [ ] `IP_HASH_SALT` fehlt in Env → sauberer Startup-Fehler (nicht Silent-Fallback auf leeren Salt).
- [ ] Submit auf `/de/newsletter` UI: Formular wird durch Danke-Text ersetzt bei Success, zeigt Error-Banner bei Fehler, Button disabled während Loading.
- [ ] Submit auf `/de/mitgliedschaft` UI: selbes Verhalten + 409-Duplicate-Meldung inline.
- [ ] Dashboard zeigt neuen Tab "Mitgliedschaft & Newsletter" zwischen "Über Alit" und "Projekte".
- [ ] Tab zeigt beide Listen mit Counter, neueste zuerst, Delete-Button pro Zeile mit Confirm.
- [ ] Delete löscht Eintrag + schreibt Audit-Log, Liste refreshed ohne Page-Reload.
- [ ] "CSV exportieren"-Button lädt `.csv`-Datei: UTF-8-BOM + `;`-Delimiter, in DE-Excel als Tabelle lesbar (manueller Test).
- [ ] CSV-Unit-Tests: Escape `;`, `"`, `\n`, Umlaute — alle grün (`pnpm test`).
- [ ] `pnpm build` passt, kein TS-Error, kein Lint-Error.
- [ ] Bundle-Check: keine server-only-Imports (`pg`, `jsonwebtoken`, `crypto` top-level) im Client-Tree der Form-Components.

## Tasks

### Phase 1 — DB + Backend Public-API
- [ ] `schema.ts`: CREATE TABLE memberships + newsletter_subscribers, UNIQUE(email), INDEX(created_at DESC).
- [ ] `src/lib/ip-hash.ts`: `hashIp()` mit `IP_HASH_SALT`, Startup-Guard.
- [ ] `src/lib/signup-validation.ts`: Guards für Newsletter- und Mitgliedschaft-Payloads (email-Regex, trim, length-caps 200).
- [ ] `src/app/api/signup/newsletter/route.ts`: POST mit Rate-Limit (5/15min), Honeypot, INSERT ON CONFLICT DO NOTHING.
- [ ] `src/app/api/signup/mitgliedschaft/route.ts`: POST mit Rate-Limit (3/15min), Honeypot, Transaction mit optionalem Newsletter-Insert.

### Phase 2 — Public-Forms wiring
- [ ] `NewsletterContent.tsx`: controlled inputs, onSubmit, fetch POST, Success/Error-State, Loading, Honeypot, Locale-Prop → FR-Labels/Placeholders/Texts.
- [ ] `MitgliedschaftContent.tsx`: wie oben + 409-Handling + newsletter_opt_in Checkbox-Wiring + FR-Labels.

### Phase 3 — Dashboard-UI + Admin-API
- [ ] `src/lib/csv.ts` + Tests.
- [ ] `GET /api/dashboard/signups/route.ts`: both lists, authMiddleware.
- [ ] `DELETE /api/dashboard/signups/[type]/[id]/route.ts`: delete + audit-log.
- [ ] `GET /api/dashboard/signups/export/route.ts`: CSV stream, Content-Disposition attachment.
- [ ] `SignupsSection.tsx`: Liste + Delete-Confirm + Export-Buttons.
- [ ] `dashboard/page.tsx`: neuer Tab, Fetch parallelisiert zu bestehenden.

### Phase 4 — Polish + Verifikation
- [ ] Manual Smoke: DE-Seiten durchklicken, FR-Seiten quervergleichen (Formulare funktionieren trotz DE-Labels).
- [ ] CSV in Excel (falls verfügbar) / Numbers öffnen, Umlaute + `;`-im-Feld prüfen.
- [ ] `.env.example` um `IP_HASH_SALT` erweitern; `memory/project.md` um neue Env + neuen Tab ergänzen (im Wrap-up).

## Notes
- Spec liegt in `tasks/spec.md` — Sprint Contract = Must-Have Block. Alles außerhalb ist Follow-up, kein Merge-Blocker.
- **Bevor Phase 1 startet:** auf User-Approval der 6 offenen Fragen aus `tasks/spec.md` warten.
- Patterns-Check: `patterns/api.md` (Partial-PUT, Error-Handling), `patterns/auth.md` (Rate-Limit Key-Gen, Client-IP nur `X-Real-IP`), `patterns/database.md` (check-then-insert race → `ON CONFLICT`), `patterns/nextjs.md` (server-only Env, Module-Split).
- Rate-Limit-Key: `signup:newsletter:${ip}` bzw. `signup:mitgliedschaft:${ip}` — vor `hashIp` (wir limitieren per Plaintext-IP im Memory, hashen nur vor dem DB-Insert).
- Branch: `feat/signups-dashboard` (laut Project-Policy nie auf main direkt).
