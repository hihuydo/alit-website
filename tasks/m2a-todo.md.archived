# Sprint M2a — Email-Notifications (Transport + Wiring + Audit, kein Editor)
<!-- Spec: tasks/spec.md -->
<!-- Started: 2026-05-01 (planned, awaiting Spec-R2 sign-off) -->
<!-- Cross-ref: portfolio-v1/lib/mail.ts pattern -->

## Done-Kriterien

> Alle 8 müssen PASS sein bevor Sprint als fertig gilt. Verifizierbar einzeln.

### Build & Test Gate
- [ ] **DK-1: TypeScript-Build clean + runtime-pin verifiziert** — `pnpm build` ohne Fehler, `nodemailer` resolves. Static-source-grep-test in `src/lib/mail.test.ts` (oder dedizierter `src/lib/runtime-pins.test.ts`) verwendet `fs.readFileSync` + Regex `/^export\s+const\s+runtime\s*=\s*["']nodejs["'];?\s*$/m` (multiline-Mode, line-anchored, **m**-flag — verhindert false-positive bei Comments/String-Literals) und asserts genau **1 Match pro Datei** für:
  - `src/app/api/signup/mitgliedschaft/route.ts`
  - `src/app/api/signup/newsletter/route.ts`
  - **Anti-comment-test:** Test fügt Comment-line `// const runtime = "edge"` zu Test-Fixture hinzu und asserts 1-Match-only (Regex matched nicht im Kommentar).
  - **Non-goal:** `src/instrumentation.ts` braucht KEIN runtime-export (nutzt `NEXT_RUNTIME` env-check) — Test asserts NICHT auf instrumentation.ts.
- [ ] **DK-2: Tests passing** — `pnpm test` ≥1170 passing (Baseline 1110 + ~55–65 neue, R3 calibration), 0 failing. Neue Test-Files: `src/lib/mail.test.ts`, `src/lib/mail-templates.test.ts`, `src/lib/signup-mail.test.ts`. Modifizierte: `src/app/api/signup/mitgliedschaft/route.test.ts`, `src/app/api/signup/newsletter/route.test.ts`, `src/lib/audit-entity.test.ts`. `pnpm audit --prod` 0 HIGH / 0 CRITICAL.

### Library + ENV (M2a-A)
- [ ] **DK-3: `lib/mail.ts` graceful-degrade + idempotent + isolation** — Test-Suite asserts:
  - Re-import in cleared-env throwt nicht (no module-level fail-fast).
  - `getTransporter()` mit empty `SMTP_HOST` returnt null + console-warn nur 1× über N calls.
  - `getTransporter()` mit gesetzten ENVs baut transporter genau 1× (Singleton).
  - `getTransporter()` mit `SMTP_FROM=foo@gmail.com` (Domain ≠ alit.ch) returnt null + console.error containing "alit.ch", cached.
  - `closeTransporter()` idempotent (zweiter call no-op, `closeMock` called 1×).
  - `installMailShutdownHook()` idempotent (`process.once("SIGTERM",...)` registered nur 1× über N calls).
  - File-content-regex: `lib/mail.ts` source enthält keine `pool`/`db`/`audit`/`fs`/`fetch` imports (Node-isolation für transport-only-Modul).
- [ ] **DK-4: ENV-Surface in 3 Files präsent** — `.env.example` enthält alle 7 Vars als kommentierter Block (inkl. „Phase 2 — leer lassen für Phase 1 graceful-degrade"). `docker-compose.yml` UND `docker-compose.staging.yml` haben `${SMTP_HOST}`, `${SMTP_PORT}`, `${SMTP_SECURE}`, `${SMTP_USER}`, `${SMTP_PASS}`, `${SMTP_FROM}`, `${MEMBERSHIP_NOTIFY_RECIPIENT}` im `environment:`-Block des `web`/`alit-web`/`alit-staging` services. Static grep-test in setup-tests asserts alle 7 keys in beiden compose-files. `instrumentation.ts` ruft `installMailShutdownHook()` post-bootstrap via dynamic-import-and-try/catch (failed-install darf bootstrap nicht killen).

### Templates + Interpolation (M2a-B, hardcoded — no editor)
- [ ] **DK-5: Templates pure + interpolate strict + escapeHtml + 8 default-renders structural** — Test-Suite asserts:
  - File-content-regex: `mail-templates.ts` source enthält keine I/O-imports (pure-module-test).
  - `interpolate("Hallo {{vorname}}", { vorname: "Anna" }) === "Hallo Anna"`.
  - `interpolate("Hallo {{voname}}", {}) === "Hallo {{voname}}"` (literal-bleiben, Decision-D).
  - `escapeHtml("<script>")` → `"&lt;script&gt;"`. Plus `&`, `>`, `"`, `'` correctly escaped.
  - `renderMailFromTemplate({...})` für alle 8 Default-Templates (4 MailTypes × 2 Locales) liefert structurally-valid output: `subject` non-empty, `html` startet `"<!doctype html>"` und endet `"</html>"`, `text` non-empty, `html` enthält scaffold-fragment `"alit — netzwerk für literatur*en"`.
  - XSS-roundtrip: `formData.vorname = "<script>alert(1)</script>"` rendered HTML enthält `&lt;script&gt;alert(1)&lt;/script&gt;` (escaped), Plaintext enthält rohes `<script>` (Plaintext non-executing).
  - **Subject-no-escape vs body-escape (R3 Finding #3 + R3-User-Review #3 — explicit split):** Test mit `formData.vorname = "Anna"`, `formData.nachname = "O'Brien"`, `member_notify_admin.de`:
    - `result.subject` enthält `"Neue Mitgliedschafts-Anmeldung: Anna O'Brien"` literal (Subject ist single string, RFC 2047 plain-text).
    - `result.text` body enthält `O'Brien` literal raw (Plaintext non-executing).
    - `result.html` body — Form-Table-cell `<td>O&#39;Brien</td>` (apostrophe escaped, weil escapeHtml `'` → `&#39;` mappt). NICHT raw `O'Brien` im HTML-Body.
    - Asserts: `subject.includes("O'Brien")` AND `text.includes("O'Brien")` AND `html.includes("O&#39;Brien")` AND `!html.includes("O'Brien")` (kein raw apostrophe im HTML-Body).
  - **Form-table escape — exactly-once (R3-User-Review #2):** admin-notify mit `formData.nachname = "Müller<img src=x onerror=alert(1)>"` → HTML form-table cell enthält `&lt;img src=x onerror=alert(1)&gt;` (escaped exactly 1×); text form-table enthält rohen Wert.
  - **Anti-double-escape test (R4-User-Review-2 #2 — uses existing field):** Membership-admin-notify mit `formData.nachname = "AT&T <Niederlassung>"` (enthält `&` UND `<` — Felder existieren laut MembershipFormData) → HTML form-table-cell für „Nachname" enthält **`AT&amp;T &lt;Niederlassung&gt;`** (single-escape), NICHT `AT&amp;amp;T &amp;lt;Niederlassung&amp;gt;` (double-escape). Plus newsletter-admin-notify mit `formData.woher = "AT&T <Newsletter>"` als zweiter case. Verifies form-table renderer reads raw formData, not formDataEscaped.
  - Member-notify-Mitgliedschaft Form-Table contains all 5 Felder (Vorname, Nachname, Strasse+Nr, PLZ+Stadt, Email).
  - Newsletter-notify Form-Table contains all 4 Felder (Vorname, Nachname, Wie/Woher, Email).
  - User-confirmation Form-Table is absent (Mail enthält NICHT die HTML-Table-Struktur).

### Helper + Wiring (M2a-C, M2a-D)
- [ ] **DK-6: `signup-mail.ts` audit-after-send-resolution + admin-recipient-null-skip + error-swallow** — Test-Suite asserts:
  - `sendSignupMails({...})` mock mailMod.sendMail returnt `{accepted: true, messageId: "<id>"}` → `auditLog` called mit `mail_accepted: true, mail_error_reason: undefined`.
  - mailMod.sendMail returnt `{accepted: false, reason: "send-failed"}` → `auditLog` called mit `mail_accepted: false, mail_error_reason: "send-failed"`.
  - mailMod.sendMail returnt `{accepted: false, reason: "not-configured"}` → `auditLog` called mit `mail_accepted: null, mail_error_reason: "not-configured"`.
  - mailMod.sendMail throwt unexpected → `auditLog` called mit `mail_accepted: false, mail_error_reason: <err.message string>`. `sendSignupMails` resolves OK (kein throw nach außen).
  - Mock-call-order-Assertion: sendMail-call vor entsprechendem auditLog-call (BEIDE pro Mail).
  - `adminRecipient: null` → admin-notify sendMail wird **0×** called, aber 1 audit-row mit `mail_recipient_kind: "admin", mail_accepted: null, mail_error_reason: "no_recipient_configured"`. User-notify läuft normal.
  - **R2 Finding #6 — outer-rejection-defense:** Mock `auditLog` to throw synchronously → `sendSignupMails` resolves OK ohne unhandled-rejection (outer try/catch catches). Test triggert via `vi.fn().mockImplementation(() => { throw new Error("audit-fail") })`.
  - Source-content-test (R2 Finding #7 — anchored regex): Test verwendet `fs.readFileSync` + extrahiert top-level imports via `/^import\s+.+\s+from\s+["']\.\/(mail|mail-templates|audit)["'];?\s*$/gm` (multiline). Asserts genau diese 3 import-Patterns vorhanden, KEINE anderen `^import\s+.+\s+from\s+["']\..+["']` Lines (= keine zusätzlichen relativen imports).
- [ ] **DK-7: Mitgliedschaft + Newsletter signup-routes Mail-Send-Behavior** — Test-Suite asserts:
  - **Mitgliedschaft happy-path**: Mock pool.connect+queries: BEGIN → INSERT memberships RETURNING id=42 → INSERT newsletter_subscribers ON CONFLICT DO NOTHING → COMMIT. `sendSignupMails` mock called **after `client.release()`** (call-order assertion zwischen `client.query("COMMIT")`, `client.release()`, und `sendSignupMails`). Args: `{signupKind: "membership", locale: "de", formData: <payload>, userEmail: <payload.email>, adminRecipient: <resolved>, rowId: 42}`. Response 200 OK.
  - **Mitgliedschaft 23505 (already_registered)**: INSERT throws → ROLLBACK → 409. `sendSignupMails` called **0×**.
  - **Newsletter happy-path (rowCount=1)**: INSERT returnt `RETURNING id=99`. `sendSignupMails` called 1× mit `{signupKind: "newsletter", rowId: 99, ...}`. Response 200 OK.
  - **Newsletter ON CONFLICT (rowCount=0)**: INSERT returnt empty rows. `sendSignupMails` called **0×**. Response 200 OK identisch (Anti-Enum).
  - **Locale-fallback (R2 Finding #4 expanded)**: 10 cases tested (DE explicit, FR explicit, FR uppercase `"FR"`, FR with whitespace `"  fr  "`, missing/undefined (collapses runtime-side), null, empty-string `""`, `"en"` (other locale), number 42, region-tagged `"fr-CH"`) — alle non-`"fr"` defaulten zu `"de"`, alle `"fr"`-flavors landen als `"fr"`.
  - **adminRecipient-Resolution (R2 Finding #1 expanded)**: 5 cases tested:
    - `MEMBERSHIP_NOTIFY_RECIPIENT="info@alit.ch"`, `SMTP_FROM=""` → adminRecipient `"info@alit.ch"`
    - `MEMBERSHIP_NOTIFY_RECIPIENT=""` (empty literal), `SMTP_FROM="info@alit.ch"` → adminRecipient `"info@alit.ch"` (fallback fires)
    - `MEMBERSHIP_NOTIFY_RECIPIENT="   "` (whitespace-only), `SMTP_FROM="info@alit.ch"` → adminRecipient `"info@alit.ch"` (trim then fallback)
    - `MEMBERSHIP_NOTIFY_RECIPIENT` unset, `SMTP_FROM` unset → adminRecipient null
    - **Static-source-grep-test (scoped to adminRecipient-Block, NICHT global):** Test schneidet aus dem Route-Source-File nur den `const adminRecipient = ... ;` block (z.B. via Regex `/const\s+adminRecipient\s*=\s*[\s\S]*?;/`) und asserts dass dieser Slice **kein `??`** enthält. Globaler anti-`??`-Grep wäre falsch, weil `result.rows[0]?.id ?? null` (legitimer newsletter-rowCount-check, spec.md M2a-D Punkt 8) ein echter use-case ist.

### Audit + Phase-2-Doc (M2a-E + M2a-F)
- [ ] **DK-8: Audit-Schema + Phase-2-Checklist + Manual Smoke** — Test-Suite asserts:
  - `extractAuditEntity("signup_mail_sent", { signup_kind: "membership", row_id: 42 })` → `{ entity_type: "memberships", entity_id: 42 }`.
  - `extractAuditEntity("signup_mail_sent", { signup_kind: "newsletter", row_id: 99 })` → `{ entity_type: "newsletter_subscribers", entity_id: 99 }`.
  - `extractAuditEntity("signup_mail_sent", { signup_kind: "MEMBERSHIP", row_id: 42 })` → `{ entity_type: null, entity_id: null }` (anti-typo, no case-folding).
  - `extractAuditEntity("signup_mail_sent", { signup_kind: undefined })` → `{ entity_type: null, entity_id: null }`.
  - All previous extractAuditEntity-mappings still pass (no regression).
  - Plus manuelle Verifikation via `pnpm dev`: Mitgliedschaft-Signup mit Test-Daten + leerem SMTP_HOST → console.log zeigt 2× `auditLog signup_mail_sent mail_accepted=null`. Newsletter mit neuer Email → analog 2 audit-rows. Newsletter mit existing email → 0 sendMail-calls + 0 audit-emissions in console. **Plus** `tasks/m2a-phase2-checklist.md` existiert mit Inhalt: (a) DNS-Records (MX, SPF, DMARC, DKIM-TXT für alit.ch), (b) Mailu-Setup-Schritte (alit.ch hinzufügen, DKIM-Key generieren, mailbox info@alit.ch erstellen), (c) ENV-Befüllung (welche 7 Vars), (d) `docker compose up -d` (NICHT restart wegen ENV-Cache), (e) Smoke-Test (echter Test-Send + `dig TXT alit._domainkey.alit.ch` + Inbox-vs-Spam an Gmail+Outlook), (f) Rollback-Plan (ENV leeren + redeploy).

## Tasks (Implementation-Plan für Generator)

### Phase A: Library + ENV (~2h, R3 calibration)
- [ ] `pnpm add nodemailer` + `pnpm add -D @types/nodemailer`. Verify `pnpm audit --prod` clean.
- [ ] Create `src/lib/mail.ts` adapted from `~/Dropbox/HIHUYDO/01 Projekte/00 Vibe Coding/portfolio-v1/lib/mail.ts`:
  - `ALLOWED_SENDER_DOMAIN = "alit.ch"`
  - Generic `sendMail(input)` instead of `sendContactMail`/`sendPasswordResetMail` — alit's mail kinds are domain-shaped via signup-mail.ts.
  - Keep `__resetMailModuleForTests`, `closeTransporter`, `installMailShutdownHook`.
  - **NICHT** `sendContactMail`/`sendPasswordResetMail` aus portfolio übernehmen — alit braucht beide nicht.
- [ ] Add 7 ENV vars to `.env.example` with comment block "Mailu/SMTP — Phase 2 (leer lassen für Phase 1 graceful-degrade)".
- [ ] Add 7 `${VAR}` lines to `docker-compose.yml` and `docker-compose.staging.yml` `environment:` block of the alit service.
- [ ] Modify `src/instrumentation.ts`: post-bootstrap dynamic-import + double-try/catch um `installMailShutdownHook()` (Finding #16).
- [ ] Tests: `src/lib/mail.test.ts` — adapt portfolio-v1's `tests/mail.test.ts` (vi.hoisted pattern), drop sendContactMail/sendPasswordResetMail-specific tests, replace with generic `sendMail` tests + plus `runtime`-pin static-grep-test (DK-1) plus mail.ts source-purity test (DK-3 file-content-regex).

### Phase B: Templates (~2h, R3 calibration)
- [ ] Create `src/lib/mail-templates.ts`:
  - `MAIL_TYPES` const + type
  - `MailTemplate` type `{ subject: string; intro: string }`
  - `DEFAULT_TEMPLATES: Record<MailType, Record<Locale, MailTemplate>>` — 8 hand-crafted defaults aus Spec §Default-Templates Content (de+fr × 4 mailtypen). Texte sind **ipsis verbis** wie in Spec — kein „creative reword" erlaubt.
  - `escapeHtml(s: string): string`
  - `interpolate(template: string, vars: Record<string, string>): string`
  - `renderMailFromTemplate({kind, locale, template, formData}): {subject, html, text}` — Plain-Text + HTML-Scaffold + Form-Table-Branch
- [ ] Tests: `src/lib/mail-templates.test.ts` — interpolate(known/unknown), escapeHtml(charset), render structural-assertions × 8 (DK-5). Keine vitest-snapshots — strukturelle assertions (Finding #10).

### Phase C: Helper (~1.5h, R3 calibration)
- [ ] Create `src/lib/signup-mail.ts`:
  - Single function `sendSignupMails(input)` (signature aus Spec DK-6).
  - **Internal (R3 Finding #2 — alignment mit spec.md):** Outer `try { await Promise.all([sendOne(user), sendOne(admin) | sendAdminSkipAudit(input)]) } catch { /* swallow */ }`. Per-arm `sendOne` mit eigener try/catch um sendMail+auditLog. **NICHT `Promise.allSettled`** — `Promise.all` + outer try/catch ist die spec'd Pattern; `Promise.allSettled` würde die outer-defense semantisch verschieben.
  - Pure helper `mailTypeFor(signupKind, recipientKind)` für die 4 MailType-Kombinationen.
  - Private helper `sendAdminSkipAudit(input)` für null-recipient-Branch — emittiert audit `mail_accepted: null, mail_error_reason: "no_recipient_configured"`, returnt `Promise<void>`.
  - admin-recipient-null-skip Logic via Ternary in `Promise.all` arm.
  - error-swallow per-mail-attempt.
  - 3 imports total: `./mail`, `./mail-templates`, `./audit`.
- [ ] Tests: `src/lib/signup-mail.test.ts` (DK-6) — mock `mail` und `audit`, verify call-order, count, audit-shape, error-swallow, admin-null-skip.

### Phase D: Signup-Wiring (~2h, R3 calibration)
- [ ] Modify `src/app/api/signup/mitgliedschaft/route.ts`:
  - Add `export const runtime = "nodejs"` at top.
  - Add `RETURNING id` to memberships INSERT.
  - Capture `membershipRowId` after COMMIT.
  - Compute `locale` via inline-Logic aus DK-7.
  - Compute `adminRecipient` aus ENV-Resolution-Logic.
  - Post-`client.release()`: `void sendSignupMails({...})` fire-and-forget.
- [ ] Modify `src/app/api/signup/newsletter/route.ts`:
  - Add `export const runtime = "nodejs"` at top.
  - Add `RETURNING id` to subscribers INSERT.
  - Compute `locale` analog.
  - Compute `adminRecipient` analog.
  - Conditional: `if (newSubscriberId !== null) void sendSignupMails({...})`.
- [ ] Modify tests: `src/app/api/signup/mitgliedschaft/route.test.ts`, `src/app/api/signup/newsletter/route.test.ts`. Mock `signup-mail.ts` at module level via `vi.hoisted` + `vi.mock`. Verify call-shape, count, locale-resolution.

### Phase E: Audit-Extension + Tests (30min)
- [ ] Extend `src/lib/audit.ts`:
  - Add `signup_mail_sent` to `AuditEvent` union (NICHT `submission_mail_texts_update` — das ist M2b).
  - Extend `AuditDetails` with: `mail_type`, `mail_accepted`, `mail_recipient_kind`, `mail_error_reason`, `signup_kind`. (`row_id` exists already.)
- [ ] Extend `src/lib/audit-entity.ts::extractAuditEntity`:
  - Add branch for `signup_mail_sent` mit explicit-discriminator-table aus Spec.
  - Strict equality (`signup_kind === "membership"`) — kein case-folding.
- [ ] Extend `src/lib/audit-entity.test.ts` mit anti-typo-guard cases (DK-8).

### Phase F: Smoke + Phase-2-Doc + PR (1h)
- [ ] Manual smoke walkthrough as per DK-8 (with `pnpm dev`). Update `memory/lessons.md` with anything surprising encountered.
- [ ] Create `tasks/m2a-phase2-checklist.md` mit Inhalt aus DK-8 (a-f).
- [ ] Pre-push: review `tasks/review.md` from Sonnet-Gate, fix any [Critical] findings.
- [ ] Open PR with conventional title `feat(mails): Sprint M2a — signup mail-notifications transport + wiring (Phase 1, graceful-degrade, hardcoded defaults)`.
- [ ] Trigger Codex PR-Review. Triage findings against Sprint Contract: in-scope→fix, out-of-scope→`memory/todo.md`. Max 2 Codex-Runden.

## Notes

- **Cross-Project-Pattern:** Vor Phase A `tasks/spec.md` Section "Cross-Project-Pattern" + portfolio-v1's `lib/mail.ts` re-lesen.
- **`patterns/database-concurrency.md` §HTTP-Side-Effects-after-COMMIT** ist die autoritative Begründung für post-COMMIT mail-send.
- **`patterns/auth.md` §requireAuthAndCsrf** — relevant für M2b (Mail-Texte-PUT). M2a hat keine neuen authed-routes außer den signup-routes (die sind public).
- **`patterns/testing.md` §nodemailer-Mock-via-vi-hoisted** ist die autoritative Test-Pattern.
- **Decision-Logs A-H** in `tasks/spec.md::Architecture Decisions` sind die Begründungs-Anker.
- **Sprint M2b** wird `tasks/spec.md` ersetzen nach M2a-merge — Editor + DB-Storage + GET/PUT-route. Phase-2-Smoke-Period zwischen M2a und M2b ist **erwünscht** (nicht-blocking aber valuable für DKIM-debugging).
