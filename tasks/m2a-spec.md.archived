# Sprint M2a — Email-Notifications für Mitgliedschaft + Newsletter (Transport + Wiring + Audit)

<!-- Branch: TBD (e.g. feat/signup-mail-notifications) -->
<!-- Created: 2026-05-01 -->
<!-- Author: Planner (Claude Opus 4.7) -->
<!-- Status: APPROVED for Generator-Phase — addresses 18 findings from R1 (archived) + 7 findings from R2 (archived) + 4 findings from R3 (m2a-qa-r3.md.archived) + 4 findings from User-Review-R4-Round-1 + 2 findings from User-Review-R4-Round-2. All resolved. Convergence: 18→7→4→4→2 across 5 rounds. -->
<!-- R4 User-Review Round-2 (2026-05-01) fixes:
     - #5 Anti-`??` static-grep was too broad — would block legitimate `result.rows[0]?.id ?? null` newsletter-rowCount-check. Scoped to the adminRecipient-declaration-block only via regex slice.
     - #6 Anti-double-escape test used non-existent `formData.firma` field. Replaced with existing `formData.nachname` (Membership) and `formData.woher` (Newsletter) — both valid per MembershipFormData/NewsletterFormData types.
-->
<!-- R4 User-Review (2026-05-01) fixes:
     - #1 Test paths: vitest.config.ts only includes `src/**/*.test.ts(x)` — paths moved from `tests/lib/...` and `tests/api/...` to `src/lib/*.test.ts` (co-located) and `src/app/api/signup/{mitgliedschaft,newsletter}/route.test.ts`. Note: existing signup-route tests do NOT exist; both route.test.ts files are NEW.
     - #2 escapeHtml NOT idempotent: form-table cells now mandated to read RAW formData (not formDataEscaped) and escape exactly 1× via `<td>${escapeHtml(formData.field)}</td>`. Added anti-double-escape test with "AT&T <Niederlassung>" payload.
     - #3 Subject-vs-body assertion split: subject contains raw apostrophe; HTML-body's form-table-cell contains escaped `&#39;`; plaintext body contains raw apostrophe. Split into 4 separate assertions.
     - #4 ?? SMTP_FROM drift: 2 spec.md occurrences replaced with `|| SMTP_FROM` to align with DK-7 single-||-chain mandate.
-->
<!-- R3 (2026-05-01) — User-decision on R2 #5: Option C chosen. member_confirmation defaults updated to non-auto-activation wording ("Nach Eingang Deiner Zahlung bestätigen wir Dir Deine Mitgliedschaft" / "Dès la réception de ton paiement, nous te confirmerons ton adhésion"). -->
<!-- R3 fixes (2026-05-01):
     - #1 phantom auditAdminSkip → replaced with concrete `sendAdminSkipAudit` private helper + `mailTypeFor` pure helper, both inline-defined in spec
     - #2 spec/todo Promise.all alignment → todo.md updated to match spec's outer-try + Promise.all pattern
     - #3 subject HTML-escape → explicit "subjects use formDataRaw, NEVER escaped — RFC 2047 plain-text"
     - #4 test-count + time-estimates → calibrated upward (~55-65 tests, target ≥1170, phases 2h/2h/1.5h/2h/0.5h/1h ≈ 9h)
-->
<!-- R2 changes (2026-05-01):
     - #1 adminRecipient: replaced mixed ||/?? with single ||-chain; expanded DK-7 test cases (empty-literal, whitespace-only)
     - #2 instrumentation.ts: explicit non-goal sentence added (no `runtime` export needed there)
     - #3 escapeHtml call-site: explicit "renderMailFromTemplate does ALL escaping internally"
     - #4 locale: added empty-string test case + documented `fr-CH` region-tagged → defaults to `de`
     - #6 Promise.allSettled: clarified to outer-try/catch + Promise.all + per-arm-try/catch
     - #7 file-content-regex: specified anchored regex with `m`-flag + comment-collision-test
     - #5 LEFT OPEN: contract-language in member_confirmation defaults — user-decision pending
-->
<!-- Split: Original M2-monolithic spec (transport + dashboard editor) was SPLIT_RECOMMENDED by spec-evaluator. M2a = transport + wiring (this spec). M2b = dashboard editor (deferred to follow-up sprint, outline at bottom). -->
<!-- Cross-ref: portfolio-v1/lib/mail.ts (battle-tested via 9 Codex-Runden, prod-deployed Sprint C1 2026-04-20). -->
<!-- User-Direktive 2026-05-01 (Mid-Spec): "User meldet sich an für Membership und wir melden uns bei ihnen mit den Bankdaten für die Überweisung — daher sollten Bankdaten NICHT im automatisierten Mail sein." → Default-Templates verwenden neutrale Sprache („Anmeldung erhalten, alit meldet sich mit Bankdaten"), kein `[ZAHLUNGSDETAILS]`-Platzhalter. -->

## Summary

Nach erfolgreicher Mitgliedschafts- oder Newsletter-Anmeldung versendet das System
zwei Emails: (1) Bestätigung an User, (2) Notify an `info@alit.ch`. Versand via
Mailu/SMTP (`nodemailer`) mit graceful-degrade — bei leerem `SMTP_HOST` (Phase 1,
vor DNS-Setup für alit.ch) loggt das System `mail_accepted: null`, das Signup
bleibt 200 OK, kein User-sichtbarer Effekt.

Mail-Texte sind in **Phase 1 hartkodierte Constants** in `mail-templates.ts`.
Editierbarkeit via Dashboard ist explizit out-of-scope für M2a — folgt in Sprint
M2b nachdem M2a auf prod-stable ist. M2a-User-Wert: sobald User Phase 2 ENVs
befüllt + Mailu für alit.ch eingerichtet, gehen Mails automatisch raus.

## Context

### Aktueller Stand (Stand 2026-05-01)
- Beide Signup-POST-Routen (`/api/signup/mitgliedschaft`, `/api/signup/newsletter`)
  schreiben in DB, antworten `{ ok: true }`, **versenden keine Email**.
- Kein `nodemailer` o.ä. in `package.json`. Kein SMTP-related ENV.
- `info@alit.ch` Postfach: User wird Domain alit.ch auf seinem bestehenden Mailu-Server
  (mail.hihuydo.com, hd-server) aufsetzen. DKIM/SPF/DMARC-Records folgen.
- Existing `audit.ts::auditLog()` schreibt zu stdout (canonical) UND fire-and-forget zu
  `audit_events` Table. `extractAuditEntity()` mapped Event auf entity_type/id.

### Cross-Project-Pattern: portfolio-v1/lib/mail.ts (battle-tested)
- Lazy transporter-Singleton via `getTransporter()`.
- `ALLOWED_SENDER_DOMAIN` const → `resolveSenderAddress()` checkt SMTP_FROM-Domain
  und throws bei Mismatch (SPF/DMARC-Alignment-Guard).
- `closeTransporter()` + `installMailShutdownHook()` (idempotent, SIGTERM-once).
- `sendContactMail()` returns Discriminated Union
  `{ accepted: true, messageId } | { accepted: false, reason: "not-configured" | "send-failed" }`.
- Test-Pattern via `vi.hoisted` + `vi.mock("nodemailer", () => ({ default: { createTransport } }))`
  mit `__resetMailModuleForTests()` zwischen Tests (module-level state cleanup).

## Requirements

### Must Have (Sprint Contract)

#### M2a-A: Mail-Library + ENV-Surface

1. Neue `src/lib/mail.ts` (Node-only, **explicit `runtime = "nodejs"` in jeder importierenden Route — siehe Finding #4**) adaptiert aus `portfolio-v1/lib/mail.ts` mit:
   - `ALLOWED_SENDER_DOMAIN = "alit.ch"`
   - Lazy `getTransporter()`, Singleton, `transporterInitialized`-Flag
   - `__resetMailModuleForTests()` exportiert
   - `closeTransporter()` idempotent (zweiter Call no-op)
   - `installMailShutdownHook()` idempotent (`SIGTERM` registered nur 1×)
   - `MailSendResult = { accepted: true; messageId: string } | { accepted: false; reason: "not-configured" | "send-failed" }`
   - Generische send-Funktion `sendMail(input: { to, from?, replyTo?, subject, html, text }): Promise<MailSendResult>`
   - **`getTransporter()` returnt `null` und console-warnt 1× bei missing `SMTP_HOST`** (NICHT throw — graceful-degrade ist Hauptpattern).
   - **Verifikations-Test** dass das Modul keine module-level fail-fast-Logik hat (Re-import in cleared-env darf nicht throwen).
   - **Verifikations-Test** dass das Modul keine DB/audit/fs/net imports zieht (file-content-regex über source).

2. ENV-Schema in `.env.example` + `docker-compose.yml` + `docker-compose.staging.yml`:
   ```
   # Mailu/SMTP — Phase 2 (leer lassen für Phase 1 graceful-degrade)
   SMTP_HOST=          # z.B. mail.hihuydo.com
   SMTP_PORT=465       # SMTPS
   SMTP_SECURE=true
   SMTP_USER=          # z.B. info@alit.ch
   SMTP_PASS=          # Mailu mailbox password
   SMTP_FROM=          # MUSS auf alit.ch enden (SPF/DMARC alignment)
   MEMBERSHIP_NOTIFY_RECIPIENT=info@alit.ch
   ```
   In docker-compose `environment:` Block via `${VAR}` durchgereicht (Pattern aus IP_HASH_SALT).

3. `src/instrumentation.ts` ruft am Ende von `register()` (nach erfolgreichem
   bootstrap) `installMailShutdownHook()` auf — dynamic-import um Edge-Bundle nicht zu
   poisonen. **Try/catch um sowohl Import als auch Funktions-Aufruf** (Finding #16): bei
   Fehler warn-and-continue, damit fehlgeschlagener Hook-Install nicht den Bootstrap killt.

4. **`runtime = "nodejs"` Pin (Finding #4):** Explicit `export const runtime = "nodejs"` in:
   - `src/app/api/signup/mitgliedschaft/route.ts` (NEW — currently implicit)
   - `src/app/api/signup/newsletter/route.ts` (NEW — currently implicit)
   - `src/lib/signup-mail.ts` ist Node-only via Convention (kein route, aber hat Node-only deps)

   **Non-goal (R2 Finding #2):** `src/instrumentation.ts` braucht KEIN `export const runtime = "nodejs"` — die Datei ist keine Route und nutzt stattdessen `if (process.env.NEXT_RUNTIME !== "nodejs") return;` als Runtime-Gate (existing Zeile 24). Die `runtime`-Const ist Route-only.

   Static-source-grep-Test in `src/lib/mail.test.ts` (oder dedizierter test) asserts beide signup-routes enthalten `runtime = "nodejs"` als top-level Statement. **Regex-Spezifikation (R2 Finding #7):** Test verwendet `fs.readFileSync` + `/^export\s+const\s+runtime\s*=\s*["']nodejs["'];?\s*$/m` (multiline-Mode, line-anchored — verhindert false-positive bei Comments oder String-Literals). Test asserts genau **1 Match pro Datei**.

#### M2a-B: Mail-Templates + Variable-Interpolation (hardcoded, NO editor)

5. Neue `src/lib/mail-templates.ts` (pure, no I/O, no DB) mit:
   - `MAIL_TYPES = ["member_confirmation_user", "member_notify_admin", "newsletter_confirmation_user", "newsletter_notify_admin"] as const`
   - `MailTemplate` type `{ subject: string; intro: string }` (plain text, kein HTML).
   - `DEFAULT_TEMPLATES: Record<MailType, Record<Locale, MailTemplate>>` — 8 hand-crafted Default-Texte (siehe **§Default-Templates Content** unten — explizit in Spec festgelegt um Finding #8 zu lösen).
   - `interpolate(template: string, vars: Record<string, string>): string` — strict allow-list für `{{...}}` Mustache-Syntax:
     - Erlaubte Placeholder: `{{vorname}}`, `{{nachname}}`, `{{email}}`. **`[ZAHLUNGSDETAILS]` entfällt komplett** (User-Direktive: keine Bankdaten im Auto-Mail).
     - Unbekannte `{{xyz}}` Placeholder → bleiben **literal** im Output (NICHT throwen, NICHT silent-strippen — sichtbarer „typo signal").
     - HTML-Escaping ist **NICHT** in dieser Funktion — User-Input wird vor Interpolation HTML-escaped (siehe §escapeHtml).
   - `escapeHtml(s: string): string` — pure helper (`&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`, `"` → `&quot;`, `'` → `&#39;`).
   - `renderMailFromTemplate(input: { kind: MailType, locale: Locale, template: MailTemplate, formData: MembershipFormData | NewsletterFormData }): { subject: string, html: string, text: string }`:
     - **Escape-Pflicht (R2 Finding #3 + R3 Finding #3 — explicit):** `renderMailFromTemplate` macht ALLES Escaping intern. Caller (signup-mail.ts) übergibt **rohe** `formData`, NIEMALS pre-escaped. Innerhalb der Render-Funktion:
       - **`subject` (R3 Finding #3 — NIEMALS HTML-escaped):** `subject = interpolate(template.subject, formDataRaw)` für BEIDE outputs (Plaintext + HTML). Subjects sind RFC 2047 MIME-Header, gerendert als Plain-Text von jedem Mail-Client. HTML-escaping würde z.B. `"Anna O'Brien"` als `"Anna O&#39;Brien"` im Inbox-Subject anzeigen.
       - Plain-Text-Output: `interpolate(template.intro, formDataRaw)` — **kein escape** (Plaintext non-executing). Auto-Form-Tabelle bei Admin-Notify in Plaintext-Variante: `Vorname:\t${formData.vorname}\n` etc., **kein escape**.
       - HTML-Output (NUR der Body, NICHT subject):
         - intro = `interpolate(template.intro, formDataEscaped)` mit `formDataEscaped = mapValues(formData, escapeHtml)`, dann `\n → <br/>` für Zeilenumbruch in HTML.
         - **Form-Table-cells (Admin-Notify only) — escape genau 1× aus rohem formData (R3-User-Review #2):** Jede `<td>${escapeHtml(formData.field)}</td>` direkt aus **roher** `formData` gewrappt, NICHT aus `formDataEscaped`. **`escapeHtml` ist NICHT idempotent** — `<` → `&lt;`, dann `&lt;` → `&amp;lt;`. Das wäre ein echter Bug für jede Form-Daten mit `&` oder `<` (z.B. Firma "AT&T"). Concrete: form-table renderer empfängt nur die rohe `formData`, nicht die `formDataEscaped`-Variante.
     - HTML-Output Scaffold: `<!doctype html><html><body><div style="font:15px sans-serif; max-width:560px; margin:auto"><p>{intro mit \n→<br/>}</p>{form-table}<hr/><p style="font-size:12px; color:#666">alit — netzwerk für literatur*en</p></div></body></html>`.
     - **Form-Table-Schema bei Admin-Notify** (Mitgliedschaft):
       | Feld | Wert |
       |---|---|
       | Vorname | {{vorname}} |
       | Nachname | {{nachname}} |
       | Strasse | {{strasse}} {{nr}} |
       | PLZ Stadt | {{plz}} {{stadt}} |
       | Email | {{email}} |
     - **Form-Table-Schema bei Admin-Notify** (Newsletter):
       | Feld | Wert |
       |---|---|
       | Vorname | {{vorname}} |
       | Nachname | {{nachname}} |
       | Wie/Woher | {{woher}} |
       | Email | {{email}} |
     - User-Confirmation-Mails haben **keine** Form-Table (User kennt seine eigenen Daten).
   - **Default-Templates Content (Finding #8 inline-resolved):**

     **`member_confirmation_user.de`** (R2 Finding #5 resolution: Option C — non-auto-activation, separate confirmation post-payment):
     - `subject`: `"Anmeldung bei alit erhalten"`
     - `intro`:
       ```
       Liebe/r {{vorname}},

       wir haben Deine Anmeldung als Mitglied erhalten. In Kürze melden wir uns persönlich mit den Bankdaten für die Mitgliedsbeitragsüberweisung. Nach Eingang Deiner Zahlung bestätigen wir Dir Deine Mitgliedschaft im Netzwerk für Literatur*en.

       Bei Fragen erreichst Du uns unter info@alit.ch.

       Herzlich
       alit
       ```

     **`member_confirmation_user.fr`:**
     - `subject`: `"Demande d'adhésion reçue par alit"`
     - `intro`:
       ```
       Cher·ère {{vorname}},

       nous avons bien reçu ta demande d'adhésion. Nous te contacterons sous peu personnellement avec les coordonnées bancaires pour le virement de la cotisation. Dès la réception de ton paiement, nous te confirmerons ton adhésion au réseau pour les littératures.

       Pour toute question : info@alit.ch.

       Cordialement
       alit
       ```

     **`member_notify_admin.de`:**
     - `subject`: `"Neue Mitgliedschafts-Anmeldung: {{vorname}} {{nachname}}"`
     - `intro`:
       ```
       Eine neue Anmeldung für eine Mitgliedschaft ist eingegangen.
       ```
       (Form-Table folgt automatisch, siehe Schema oben.)

     **`member_notify_admin.fr`:**
     - `subject`: `"Nouvelle demande d'adhésion : {{vorname}} {{nachname}}"`
     - `intro`:
       ```
       Une nouvelle demande d'adhésion a été reçue.
       ```

     **`newsletter_confirmation_user.de`:**
     - `subject`: `"Newsletter-Anmeldung bei alit"`
     - `intro`:
       ```
       Liebe/r {{vorname}},

       Du bist nun für den alit-Newsletter angemeldet. Wir freuen uns, Dich gelegentlich mit Neuigkeiten aus dem Netzwerk für Literatur*en zu versorgen.

       Falls Du Dich nicht bewusst angemeldet hast, antworte einfach auf diese Mail — wir nehmen Dich raus.

       Herzlich
       alit
       ```

     **`newsletter_confirmation_user.fr`:**
     - `subject`: `"Inscription à la newsletter alit"`
     - `intro`:
       ```
       Cher·ère {{vorname}},

       tu es maintenant inscrit·e à la newsletter d'alit. Nous nous réjouissons de te tenir informé·e des nouvelles du réseau pour les littératures.

       Si tu ne t'es pas inscrit·e volontairement, réponds simplement à ce mail — nous te retirerons de la liste.

       Cordialement
       alit
       ```

     **`newsletter_notify_admin.de`:**
     - `subject`: `"Neue Newsletter-Anmeldung: {{vorname}} {{nachname}}"`
     - `intro`:
       ```
       Eine neue Newsletter-Anmeldung ist eingegangen.
       ```

     **`newsletter_notify_admin.fr`:**
     - `subject`: `"Nouvelle inscription newsletter : {{vorname}} {{nachname}}"`
     - `intro`:
       ```
       Une nouvelle inscription à la newsletter a été reçue.
       ```

   - Tests: `src/lib/mail-templates.test.ts`:
     - `interpolate("Hallo {{vorname}}", { vorname: "Anna" })` → `"Hallo Anna"`
     - `interpolate("Hallo {{voname}}", {})` → `"Hallo {{voname}}"` (literal-bleiben)
     - `escapeHtml("<script>alert(1)</script>")` → `"&lt;script&gt;alert(1)&lt;/script&gt;"`
     - `renderMailFromTemplate` für alle 8 (MailType × Locale) Default-Templates: structural assertions („subject contains 'Mitgliedschaft'", „html starts with '<!doctype html>'", „html ends with '</html>'", „html contains escaped vorname when formData.vorname includes <script>"). **NICHT vitest-snapshot files** (Finding #10) — strukturelle assertions sind robuster gegen whitespace/lineending-drift und vermeiden snapshot-convention-novelty.
     - XSS-roundtrip: `formData.vorname = "<script>alert(1)</script>"` rendered HTML enthält `&lt;script&gt;` (escaped). Plaintext-output enthält rohes `<script>` (Plaintext non-executing — by design).

#### M2a-C: `signup-mail.ts` Helper (Finding #1 — explicit placement)

6. Neue `src/lib/signup-mail.ts` (Node-only — siehe Finding #4 für `runtime`-Implications):
   - **Imports**: `mail.ts` (transport), `mail-templates.ts` (render), `audit.ts` (emit). KEINE DB-imports — `DEFAULT_TEMPLATES` als statische Quelle in M2a, kein `getSubmissionMailTexts` (das gibt's erst in M2b).
   - **Verifikations-Test** dass `signup-mail.ts` source genau diese 3 Module importiert + nothing-else (file-content-regex test).
   - Exposes ONE function:
     ```ts
     export async function sendSignupMails(input: {
       signupKind: "membership" | "newsletter";
       locale: "de" | "fr";
       formData: MembershipFormData | NewsletterFormData;
       userEmail: string;
       adminRecipient: string | null; // resolved by caller from MEMBERSHIP_NOTIFY_RECIPIENT || SMTP_FROM (single ||-chain — siehe DK-7)
       rowId: number;
     }): Promise<void>
     ```
   - **Sendet 2 Mails parallel (R2 Finding #6 — explicit pattern; R3 Finding #1 — inline-skip statt phantom helper):**
     ```ts
     export async function sendSignupMails(input: SendSignupMailsInput): Promise<void> {
       try {
         await Promise.all([
           sendOne("user", input.userEmail, input),
           input.adminRecipient
             ? sendOne("admin", input.adminRecipient, input)
             : sendAdminSkipAudit(input),  // private helper — skip but emit audit
         ]);
       } catch {
         // outer net — defense-in-depth gegen unerwartete throws
         // (z.B. audit-call schema-mismatch). Caller's `void sendSignupMails(...)`
         // soll NIEMALS unhandled-rejection sehen.
       }
     }

     async function sendOne(
       recipientKind: "user" | "admin",
       to: string,
       input: SendSignupMailsInput,
     ): Promise<void> {
       const mailType = mailTypeFor(input.signupKind, recipientKind); // pure helper
       const template = DEFAULT_TEMPLATES[mailType][input.locale];
       const rendered = renderMailFromTemplate({
         kind: mailType,
         locale: input.locale,
         template,
         formData: input.formData,
       });
       try {
         const result = await mailMod.sendMail({
           to,
           from: process.env.SMTP_FROM,
           replyTo: recipientKind === "admin" ? input.userEmail : undefined,
           subject: rendered.subject,
           html: rendered.html,
           text: rendered.text,
         });
         auditLog("signup_mail_sent", {
           ip: "",
           signup_kind: input.signupKind,
           row_id: input.rowId,
           mail_type: mailType,
           mail_recipient_kind: recipientKind,
           mail_accepted: result.accepted
             ? true
             : (result.reason === "not-configured" ? null : false),
           mail_error_reason: result.accepted ? undefined : result.reason,
         });
       } catch (err) {
         auditLog("signup_mail_sent", {
           ip: "",
           signup_kind: input.signupKind,
           row_id: input.rowId,
           mail_type: mailType,
           mail_recipient_kind: recipientKind,
           mail_accepted: false,
           mail_error_reason: err instanceof Error ? err.message : String(err),
         });
       }
     }

     // Private helper — emits the admin-skip audit-row when adminRecipient is null,
     // returns Promise<void> so it slots into Promise.all next to sendOne.
     async function sendAdminSkipAudit(input: SendSignupMailsInput): Promise<void> {
       const mailType = mailTypeFor(input.signupKind, "admin");
       try {
         auditLog("signup_mail_sent", {
           ip: "",
           signup_kind: input.signupKind,
           row_id: input.rowId,
           mail_type: mailType,
           mail_recipient_kind: "admin",
           mail_accepted: null,
           mail_error_reason: "no_recipient_configured",
         });
       } catch {
         // audit-throw ist defense-in-depth-territory — outer try/catch in sendSignupMails fängt's auf.
       }
     }
     ```
     User-confirmation an `userEmail`; Admin-notify an `adminRecipient` (skipped wenn null via inlined `sendAdminSkipAudit` private helper). `mailTypeFor(signupKind, recipientKind)` ist ein pure helper im selben Modul: `(membership, user) → "member_confirmation_user"`, `(membership, admin) → "member_notify_admin"`, etc.
   - Pro Mail: `auditLog` wird **inside** der `.then`-chain nach `sendMail()` resolution gerufen, MIT echten `mail_accepted`-Wert aus `MailSendResult` (Finding #2).
     ```ts
     // Korrekte Reihenfolge — MUSS so implementiert werden:
     const result = await mailMod.sendMail({ to, subject, html, text, ... });
     auditLog("signup_mail_sent", {
       ip: "",
       signup_kind: signupKind,
       row_id: rowId,
       mail_type: kind,
       mail_recipient_kind: "user", // bzw. "admin"
       mail_accepted: result.accepted ? true : (result.reason === "not-configured" ? null : false),
       mail_error_reason: result.accepted ? undefined : result.reason,
     });
     ```
   - **Auf KEINEN Fall** auditLog-call BEFORE sendMail-Resolution (Finding #2 explicit anti-pattern): das würde alle audit-rows mit `mail_accepted: null` schreiben unabhängig vom realen Outcome.
   - **Admin-self-spam Defense (Finding #3):** Wenn `adminRecipient === null` (= MEMBERSHIP_NOTIFY_RECIPIENT empty AND SMTP_FROM empty), wird admin-notify komplett geskippt — KEIN nodemailer-Call mit `to: ""`. Audit für admin-notify-attempt fired mit `mail_accepted: null, mail_error_reason: "no_recipient_configured"`. Fallback-Resolution via `|| SMTP_FROM` (single `||`-chain — siehe DK-7) passiert in der Caller-Route, nicht hier.
   - **Self-spam UX-edge** (Finding #3 expansion): wenn `userEmail === adminRecipient` (z.B. admin signup-tested mit `info@alit.ch`), gehen 2 Mails an dasselbe Postfach. Akzeptiert — das ist ein internal-test-szenario, kein public-user-bug. Spec-acknowledged, kein dedup.
   - **Errors innerhalb `sendSignupMails` werden NICHT propagiert** — die Funktion swallowt alle exceptions intern (try/catch um jeden sendMail-call) und return resolved Promise<void>. Caller fired sie als `void sendSignupMails(...)` ohne `.catch()` weil die Funktion garantiert nichts wirft.
   - Tests in `src/lib/signup-mail.test.ts`: Mock mail.ts + audit.ts. Verify call-order, count, audit-events shape, admin-notify-skip bei null-recipient, error-swallow.

#### M2a-D: Wiring in Signup-Routen (post-COMMIT, fire-and-forget)

7. `src/app/api/signup/mitgliedschaft/route.ts`:
   - Add `export const runtime = "nodejs"` at top (Finding #4).
   - **Pre-COMMIT:** Existing logic + `RETURNING id` an memberships-INSERT — `membershipRowId` für audit-`row_id`.
   - **Locale-Parsing (Finding #13 fully-specified):** Inline at top of POST handler:
     ```ts
     const rawLocale = typeof body.locale === "string" ? body.locale.trim().toLowerCase() : "";
     const locale: "de" | "fr" = rawLocale === "fr" ? "fr" : "de";
     ```
     ANY non-`"fr"` value (including `null`, `undefined`, malformed, other locale codes, uppercase, whitespace-only, empty-string `""`) defaults to `"de"`. KEIN 400-bei-bad-locale — silent default (consistent mit M1's anti-friction-Pattern).

     **Region-Tagged-Locale-Codes (R2 Finding #4):** `body.locale = "fr-CH"` (Swiss-French Browser-default) wird mit dieser Regel zu `"de"` (`"fr-ch" !== "fr"`). Das ist akzeptiert für M2a — eine prefix-match-Erweiterung (`rawLocale.startsWith("fr")`) ist M2b-Item falls echter UX-Bedarf entsteht. Begründung: aktuelle alit-Frontend-Forms senden `"de"` oder `"fr"` literal aus dem Dictionary-System, nicht den Browser-Locale.
   - **POST-COMMIT (nach `client.release()`):** Single fire-and-forget call. **adminRecipient-Resolution (R2 Finding #1 — single `||`-chain, KEIN gemischter `||`/`??`):**
     ```ts
     const adminRecipient =
       (process.env.MEMBERSHIP_NOTIFY_RECIPIENT?.trim()
         || process.env.SMTP_FROM?.trim()
         || null);
     void sendSignupMails({
       signupKind: "membership",
       locale,
       formData: payload,
       userEmail: payload.email,
       adminRecipient,
       rowId: membershipRowId,
     });
     return NextResponse.json({ ok: true });
     ```
     Begründung: `||` coerced empty-string + whitespace-only-via-trim + `undefined` alle zu falsy → fällt durch zur nächsten Option. Reine `||`-Kette ist semantisch eindeutig (kein operator-precedence-trap). **NICHT `??` verwenden** — `??` würde leere Strings durchlassen (`"" ?? "fallback" === ""`), was zu `to: ""` in nodemailer-Call führt.
   - **Bei 23505 (`already_registered`):** ROLLBACK, return 409, **KEIN sendSignupMails-Call** (User ist bereits Member, keine doppelte Welcome-Mail nötig).

8. `src/app/api/signup/newsletter/route.ts`:
   - Add `export const runtime = "nodejs"` at top (Finding #4).
   - Locale-Parsing analog DK-7.
   - INSERT mit `RETURNING id` (NULL bei conflict via `ON CONFLICT DO NOTHING`).
   - **Conditional mail-send (Finding-#7-relevant):**
     ```ts
     const newSubscriberId = result.rows[0]?.id ?? null;
     if (newSubscriberId !== null) {
       const adminRecipient = ... // same as DK-7
       void sendSignupMails({
         signupKind: "newsletter",
         locale,
         formData: payload,
         userEmail: payload.email,
         adminRecipient,
         rowId: newSubscriberId,
       });
     }
     return NextResponse.json({ ok: true });
     ```
   - **rowCount=0 (existing email): KEINE Mails versendet, KEINE audit-emission** (Anti-Enum: Bot der Mail-Empfang als Oracle nutzt sieht „erst-signup → Mail kommt; zweit-signup → keine Mail" → email-existence-leak. Konsistente Anti-Enum-Behavior).

9. **Locale wird durch beide Signup-Routen propagiert (Finding #13 explicit):**
   - Validation kann am Body-Parse-Layer happen (vor `validateMembership`/`validateNewsletter`) ODER inline in der Route. **Spec mandates: inline in der Route**, weil:
     - `MembershipPayload`/`NewsletterPayload` Type bleibt unverändert (kein Type-Surface-Change in `signup-validation.ts`).
     - Locale ist nur für den Mail-Send relevant, nicht für Validation/DB-Insert.
     - Reduziert Test-Surface in `src/lib/signup-validation.test.ts`.
   - Test-Cases (in route-tests, 10 cases — aligned mit todo.md DK-7):
     - `body.locale = "de"` → `de`-defaults
     - `body.locale = "fr"` → `fr`-defaults
     - `body.locale = "FR"` → `fr`-defaults (case-insensitive)
     - `body.locale = "  fr  "` → `fr`-defaults (trim-aware)
     - `body.locale` missing/undefined → `de`
     - `body.locale = null` → `de`
     - `body.locale = ""` (empty-string) → `de`
     - `body.locale = "en"` → `de`
     - `body.locale = 42` (number) → `de`
     - `body.locale = "fr-CH"` (region-tagged → `de` in M2a; M2b kann prefix-match einbauen)

#### M2a-E: Audit-Schema-Erweiterung

10. `src/lib/audit.ts` AuditEvent extension:
    - Add `signup_mail_sent` to `AuditEvent` union (NICHT `submission_mail_texts_update` — das ist M2b).
    - Extend `AuditDetails` with:
      ```ts
      mail_type?: "member_confirmation_user" | "member_notify_admin" | "newsletter_confirmation_user" | "newsletter_notify_admin";
      mail_accepted?: boolean | null;
      mail_recipient_kind?: "user" | "admin";
      mail_error_reason?: string;
      signup_kind?: "membership" | "newsletter";
      // row_id existiert bereits (used by signup_delete) — wird wiederverwendet
      ```

11. `src/lib/audit-entity.ts::extractAuditEntity`:
    - Add branch for `signup_mail_sent` (Finding #12 explicit-table):

      | `details.signup_kind` | `entity_type`            | `entity_id`         |
      |-----------------------|--------------------------|---------------------|
      | `"membership"`        | `"memberships"`          | `details.row_id`    |
      | `"newsletter"`        | `"newsletter_subscribers"` | `details.row_id` |
      | (other / undefined)   | `null`                   | `null`              |

    - **Anti-typo guard:** Strict equality (`signup_kind === "membership"`), NICHT case-insensitive (`signup_kind?.toLowerCase()`). Test asserts `signup_kind: "MEMBERSHIP"` returns `entity_type: null` (no silent case-folding).

### Nice to Have (explicit follow-up, NOT this sprint)

> Diese Items wandern beim Wrap-Up nach `memory/todo.md`. Im Codex-PR-Review NICHT als Blocker werten.

1. **M2b — Dashboard-Editor für Mail-Texte** (separater Sprint nach M2a-merge + Phase-2-Smoke).
2. Markdown-Support in `intro`-Texten. (Wenn jemals gewünscht.)
3. Mail-History-Tab im Dashboard (zeigt audit_events `signup_mail_sent` Stream mit Filter-UI). Daten existieren in DB ab Phase 1, UI ist Phase-3.
4. Bounce-Handling: Mailu/Postfix sendet Bounces an Mailbox. Kein DLQ-Loop.
5. Click-Tracking, Open-Pixel, Unsubscribe-Tokens für Newsletter.
6. Double-Opt-In für Newsletter (DSGVO-mehrwert; siehe Risk #6).
7. Ratelimit per email-recipient (Spam-bombing-Schutz). Aktuell: rate-limit per IP ist die Defense.
8. Cron-watcher für hohe `mail_accepted: false` Volumes mit Slack/Discord/Email-Alert.

### Out of Scope

- DNS-Records für alit.ch (User-Aufgabe auf hd-server: MX, SPF `v=spf1 mx -all`, DMARC, DKIM-TXT). Nicht im Repo.
- DKIM-Key-Generation in Mailu UI (User-Aufgabe).
- Reale Smoke-Tests gegen Live-Mailu (Phase 2, nach DNS-Setup).
- DSGVO Double-Opt-In Flow.
- Migration der existing memberships/newsletter_subscribers rows zu „auch-mail-empfangen" (rückwirkend Mails versenden — explizit NICHT, sonst Spam-Welle).
- Email-Templates für Logout, Password-Reset, Account-Updates (admin-flow).
- Dashboard-Editor (gehört in M2b).
- DB-Storage in `site_settings.submission_mail_texts_i18n` (gehört in M2b — M2a hat hartkodierte Defaults).

## Technical Approach

### Files to Change

| File | Change Type | Description |
|------|-------------|-------------|
| `package.json` + `pnpm-lock.yaml` | Modify | `nodemailer` als prod dep + `@types/nodemailer` als dev dep |
| `.env.example` | Modify | 7 neue ENV-Vars (SMTP_*, MEMBERSHIP_NOTIFY_RECIPIENT) |
| `docker-compose.yml` | Modify | `environment:` block extend um `${SMTP_*}` + `${MEMBERSHIP_NOTIFY_RECIPIENT}` |
| `docker-compose.staging.yml` | Modify | Wie prod-compose |
| `src/lib/mail.ts` | Create | nodemailer transporter + sendMail + close + shutdown-hook |
| `src/lib/mail-templates.ts` | Create | DEFAULT_TEMPLATES + interpolate + escapeHtml + render-fn |
| `src/lib/signup-mail.ts` | Create | sendSignupMails helper (combines mail+templates+audit) |
| `src/lib/audit.ts` | Modify | AuditEvent + AuditDetails types extend |
| `src/lib/audit-entity.ts` | Modify | extractAuditEntity neue branch für signup_mail_sent |
| `src/instrumentation.ts` | Modify | Dynamic-import + try/catch um installMailShutdownHook |
| `src/app/api/signup/mitgliedschaft/route.ts` | Modify | runtime-pin, RETURNING id, post-COMMIT void sendSignupMails |
| `src/app/api/signup/newsletter/route.ts` | Modify | runtime-pin, RETURNING id, conditional sendSignupMails |
| `src/lib/mail.test.ts` | Create | nodemailer-mock pattern + runtime-grep-test |
| `src/lib/mail-templates.test.ts` | Create | interpolate + escapeHtml + render structural-assertions × 8 |
| `src/lib/signup-mail.test.ts` | Create | sendSignupMails call-order, count, audit-shape, error-swallow |
| `src/app/api/signup/mitgliedschaft/route.test.ts` | Create | Mail-Send-Pfade verifizieren, runtime-pin assert (Datei existiert noch nicht) |
| `src/app/api/signup/newsletter/route.test.ts` | Create | rowCount=0-Branch verifizieren, runtime-pin assert (Datei existiert noch nicht) |
| `src/lib/audit-entity.test.ts` | Modify | signup_mail_sent mappings inkl. typo-guard (existing file) |

**11 files modified/created + 6 test files. ~55–65 new/modified test cases (R3 calibration). Baseline 1110 → target ≥1170.**

### Architecture Decisions

#### Decision A: Plaintext-Templates (kein Markdown, kein RichText) — auch in M2a hartkodiert
- **Gewählt:** Plain-Text-Strings + Mustache-Interpolation + festes HTML-Scaffold. Kein Markdown-Parser, kein Rich-Text-Editor (das wäre M2b auch nicht).
- **Begründung:** Mail-HTML hat eigene Quirks (Outlook/Gmail-Inline-Styles, kein flexbox, kein modern-CSS). Festes minimal-Scaffold ist robust. Plain-Text-Stand ist 99% der echten Nutzung.

#### Decision B: `signup-mail.ts` als zentraler Helper (Finding #1 → explicit)
- **Gewählt:** Eigenes Module `src/lib/signup-mail.ts` zwischen `mail.ts` (transport) und den Routes.
- **Alternative 1 (in mail.ts):** Würde mail.ts mit DB+audit-deps belasten → mail.ts könnte nicht mehr Edge-bundle-safe sein. Verworfen.
- **Alternative 2 (co-located in routes):** ~80 Lines duplication zwischen mitgliedschaft/route.ts und newsletter/route.ts. Verworfen.
- **Begründung:** Klare Boundary: `signup-mail.ts` ist der einzige consumer von `mail.ts` + `mail-templates.ts` + `audit.ts` für signup-flow. Routes wissen davon nichts außer der einen Funktion.

#### Decision C: Audit-call INSIDE sendMail-resolution (Finding #2 → explicit)
- **Gewählt:** `auditLog(...)` wird in der `.then`-chain NACH `sendMail()` aufgerufen, mit `mail_accepted` aus dem aufgelösten `MailSendResult`.
- **Alternative (audit-vor-send):** Würde alle audit-rows mit `mail_accepted: null` schreiben unabhängig vom Outcome → Observability collapsed.
- **Begründung:** Ohne diese Order wäre der ganze audit-stream wertlos. Test in DK-3 sichert das ab.

#### Decision D: Strict-allow-list für Placeholder, unbekannte bleiben literal
- **Gewählt:** Explicit allow-list `{{vorname}}`, `{{nachname}}`, `{{email}}`. Unknown wie `{{voname}}` (typo) bleiben **literal** im Output.
- **Begründung:** Literal-bleiben ist sichtbares Typo-Signal. Da M2a keine Editor-UI hat, ist der Trade-off weniger relevant — die Defaults sind code-reviewed, kein Admin-input. Aber die `interpolate`-Function muss sich für M2b auf den selben Contract committen.

#### Decision E: NUR User-confirmation + Admin-notify bei Mitgliedschaft, KEINE doppelten Newsletter-Mails
- **Gewählt:** Bei Mitgliedschaft-Signup wird der User auto-zu `newsletter_subscribers` hinzugefügt (`source='membership'`, existing M0-Pattern), aber **es geht KEINE separate `newsletter_confirmation_user`-Mail raus**, und KEINE separate `newsletter_notify_admin`-Mail. Mitgliedschafts-Confirmation an User reicht; Admin-Notify-Doppelung wäre Rauschen.
- **Begründung:** Mail-Spam für User ist UX-Schaden. Customer-Decision (PR #100) war explizit: „Mitgliedschaft impliziert Newsletter, kein separater Opt-In nötig" — das overlap ist UX-Feature, kein Bug.

#### Decision F: Newsletter rowCount=0 (idempotent ON CONFLICT) → KEINE Mail
- **Gewählt:** Bei `INSERT ... ON CONFLICT DO NOTHING` mit `RETURNING id` NULL (Email bereits abonniert) wird **keine** Mail versendet. UI-Antwort identisch (200 OK).
- **Begründung:** Anti-Enumeration-Konsistenz. Mail-Verhalten muss spiegelnd zur 200-OK-Convention sein, sonst hat ein Bot via Mail-Empfang ein email-existence-Oracle.

#### Decision G: `signup_mail_sent` als generisches Event mit `signup_kind` Diskriminator (Finding #12 explicit)
- **Gewählt:** Ein audit-event-name + `signup_kind: "membership"|"newsletter"` Diskriminator. extractAuditEntity hat strikte equality-mapping, KEIN case-folding, KEIN normalize. Unbekannter signup_kind → entity_type null.
- **Begründung:** Single-event-with-discriminator pattern bewährt aus M1's `signup_delete`. Strikte equality verhindert silent-failures bei Generator-typos.

#### Decision H: Defaults statisch in `mail-templates.ts`, kein DB-Storage in M2a (Split-decision)
- **Gewählt:** `DEFAULT_TEMPLATES` als TypeScript-const im Source. Editierbar = Code-Edit + Deploy.
- **Alternative (DB-Storage):** Jeder Mail-Versand Liest aus `site_settings`. M2b-scope.
- **Begründung:** SPLIT_RECOMMENDED Spec-Eval R1. M2a delivers user-visible value (mails go out) ohne den editor-complexity-overhead. M2b (editor) builds on M2a's stable baseline.

### Dependencies

- Externe Lib: `nodemailer` ^8.x (latest stable per 2026-05-01; API-kompatibel mit 7.x für `createTransport`/`sendMail`/`close`). `@types/nodemailer` als dev-dep. **Audit-Risk:** `pnpm audit --prod` muss nach install grün bleiben (Baseline: 1 moderate postcss-transitive via next, NICHT durch nodemailer eingeführt).
- ENV-Surface: 7 neue Vars. NICHT eager-checked in instrumentation (graceful-degrade ist Hauptpattern).
- Keine DB-Schema-Changes. Keine neuen Tables. Keine neuen `site_settings`-Keys (das ist M2b).

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| `SMTP_HOST` leer (Phase 1) | `getTransporter()` returns null, console-warn 1×, `sendMail` returnt `{accepted: false, reason: "not-configured"}`. Audit pro Mail-Versuch (NICHT dedupliziert): `mail_accepted: null`, `mail_error_reason: "not-configured"`. Signup 200 OK. |
| `SMTP_FROM` Domain ≠ alit.ch | `resolveSenderAddress()` throwt, transporter init catched + console.error 1×, transporter cached null. Subsequent sendMail returnen `{accepted: false, reason: "send-failed"}`. Phase 2 Smoke catched das. |
| SMTP send timeout | nodemailer wirft → catch in `sendMail` → return `{accepted: false, reason: "send-failed"}` → audit `mail_accepted: false`, `mail_error_reason: "send-failed"`. |
| Email-Addresse mit `<script>`-Inhalt im `vorname` | HTML-render-Path escapet via `escapeHtml()` vor Interpolation. Plaintext-Path benutzt es raw. |
| Newsletter-Signup mit `email` der bereits abonniert ist | rowCount=0 (RETURNING id NULL) detected → KEINE Mail, KEIN audit. UI 200 OK identisch. |
| Mitgliedschafts-Signup mit `email` die bereits Member ist | INSERT throws 23505 → ROLLBACK → 409 `already_registered`. **KEINE Mail**. (Different from Newsletter weil Mitgliedschaft hat User-Feedback-Branch, kein Anti-Enum.) |
| `MEMBERSHIP_NOTIFY_RECIPIENT` leer AND `SMTP_FROM` leer | Caller-Route resolvet `adminRecipient = null`. `sendSignupMails` skippt admin-notify, audit fired mit `mail_accepted: null`, `mail_error_reason: "no_recipient_configured"`. User-confirmation Versuch passiert normal. |
| `MEMBERSHIP_NOTIFY_RECIPIENT` leer, `SMTP_FROM` gesetzt | Fallback: admin-notify geht an SMTP_FROM (= info@alit.ch in Phase 2 setup). |
| `userEmail === adminRecipient` (Admin signup-tested mit own mailbox) | 2 Mails an dasselbe Postfach. Akzeptiert — interner Test-Fall, kein Public-User-Bug. |
| 5 signups in Folge mit leerem SMTP_HOST | 1 console.warn (deduplicated via `missingConfigWarned`-flag). 10 audit-rows (5 user × 5 admin) — audit ist NICHT deduplicated, nur Console-Warn (Finding #7). |
| SIGTERM während Bootstrap, vor `installMailShutdownHook()` | shutdown-hook nicht installiert. Process exits ohne mail-transporter-close. Akzeptiert (Production-startup ist single-shot, kein HMR-Issue). |
| `body.locale` mit unerwartetem Wert (null, `"en"`, number, whitespace) | Silent-default to `"de"`. Test-cases siehe DK-13. |
| Admin Mailu auf alit.ch hat DKIM nicht gesetzt (Phase 2 misconfig) | Mails gehen raus (success: true) aber landen im Spam. **Manueller Smoke-Test in Phase-2-Checklist deckt das ab** (DK-8). |
| `runtime = "nodejs"` not pinned auf signup-route | static-grep-test in `src/lib/mail.test.ts` failed → CI-block. |

## Risks

1. **Nodemailer-Version-Drift**: Major-Bump kann API-Brüche bringen. Mitigation: pnpm-lock-pin auf konkrete Minor.
2. **Mailu-DKIM-not-set bei Phase-2-Cutover**: User pusht ENVs, vergisst DKIM in Mailu. Mails landen im Spam. Mitigation: **Phase-2-Smoke-Plan dokumentiert in `tasks/m2a-phase2-checklist.md`** mit `dig TXT alit._domainkey.alit.ch` Check + Test-Send an Gmail/Outlook + Inbox-vs-Spam-Verify.
3. **Mail-Send-Loop bei DLQ**: audit_log ist fire-and-forget mit `.catch()`. Kein Loop möglich. Verifiziert via Test in DK-5.
4. **DSGVO Double-Opt-In** (Out-of-Scope): Single-Opt-In ist in DE/CH **rechtlich prekär** für Newsletter. Mitgliedschaft ist OK (Opt-In-Vertrag). Newsletter alleine ist riskanter. **User-Decision-Territorium für M3** — nicht Code.
5. **Cron-Visibility-Gap audit_events**: Kein Cron-Watcher schickt Alerts wenn `mail_accepted: false` häuft. Manueller Watch via Dashboard-Audit-Log. Mitigation: M3-Item.
6. **Default-Templates legal-vetting** (Finding #14 — partly resolved by user-direktive): Default-Templates verwenden NEUTRALE Sprache (keine Bankdaten, keine Vertrags-Versprechen). Operator (alit) übernimmt Verantwortung für die Default-Texte sobald Phase 2 live ist. M2b-Editor erlaubt später Anpassung — dann liegt full responsibility beim Operator.
7. **`runtime = "nodejs"` Pin-Drift**: Future Refactoring könnte den Pin entfernen, Edge-bundle-attempt nodemailer → silent staging-build-fail. Mitigation: static-source-grep-test in DK-1 fängt Drift.
8. **SIGTERM-listener-leak in Tests** (Finding #16): `__resetMailModuleForTests` resettet nicht den `process.once("SIGTERM", ...)` listener. Mitigation: Test-Strategy explicit in `mail.test.ts` header-comment: „dispatching SIGTERM in tests = NOT done; we only assert the flag was set". Plus `process.removeAllListeners("SIGTERM")` in afterEach falls drift entstehen sollte.

## Done-Definition (Phase 1, Sprint Contract)

> Siehe `tasks/todo.md` für die granulare Aufgaben-Liste mit DK-Nummerierung (8 DKs).
> Übersicht hier:

- **Build**: `pnpm build` clean, keine TypeScript-Fehler. Inkl. `nodemailer`-Import-Resolution.
- **Tests**: `pnpm test` ≥1170 passing (Baseline 1110 + ~55–65 neue, R3 calibration), 0 failing.
- **Audit**: `pnpm audit --prod` 0 HIGH / 0 CRITICAL nach `nodemailer` install.
- **Phase-1-Verhalten verifiziert**: Mit leerem `SMTP_HOST` (default in `.env.example`) läuft jeder Signup als 200 OK + DB-row + 2 audit_events rows mit `mail_accepted = null, mail_error_reason = "not-configured"`. Console-warn 1× pro Boot-lifetime.
- **Phase-2-Pfad dokumentiert**: `tasks/m2a-phase2-checklist.md` mit DNS-Records (MX/SPF/DMARC/DKIM-TXT für alit.ch), Mailu-Setup-Schritte, ENV-Befüllung, `docker compose up -d` (NICHT restart), Smoke-Test mit echtem Test-Send + `dig`-Verify + Inbox-vs-Spam-Check, Rollback-Plan.
- **Anti-Enum verifiziert**: Newsletter-Signup mit existing email → DB rowCount=0 → kein Mail-Versand → kein audit-emission → UI 200 OK identisch zu first-time. Test asserts auf 0 sendMail-calls AND 0 audit-emissions.
- **runtime-Pin verifiziert**: static-source-grep-test in tests asserts beide signup-routes haben `export const runtime = "nodejs"` als top-level Statement.
- **Audit-Order verifiziert**: Test mockt `mailMod.sendMail` returnt `{accepted: true, messageId: "<id>"}` → audit_log MUSS mit `mail_accepted: true` aufgerufen werden. Andere mock returnt `{accepted: false, reason: "send-failed"}` → audit_log mit `mail_accepted: false, mail_error_reason: "send-failed"`. Mock-call-order-Assertion: sendMail vor auditLog.
- **Code-Quality-Gate**: Sonnet pre-push Review-Gate clean, Codex-PR-Review clean (max 2 Runden — wenn R2 noch [Critical] mit Sprint-Contract-Bezug → Sprint war zu groß geschnitten, splitten. Aber durch initial-split sollte das nicht passieren).

---

## M2b Follow-up Scope (NEXT sprint after M2a merge + Phase-2 smoke)

Sprint M2b wird sich um folgende Themen kümmern, **nicht in M2a**:

1. **Dashboard-Editor** `SubmissionMailTextsEditor.tsx` — analog zu M1's `SubmissionTextsEditor`, mit:
   - 4 Mailtypen × 2 Locales × 2 Felder (subject + intro) Tab-Hierarchie
   - Two-state model (`displayState` / `payloadState`)
   - DirtyContext-Integration mit eigener key `"submission-mail-texts"`
   - Variable-Helper-Buttons (`{{vorname}}`, `{{nachname}}`, `{{email}}`)
   - Live-Preview-Panel mit `<iframe sandbox="" srcdoc={renderedHtml}>` (debounced 200ms gegen Re-Render-Flood)
2. **DB-Storage** `site_settings.submission_mail_texts_i18n`:
   - Mirror von M1's `submission_form_texts_i18n`
   - Microsecond-precision etag (`to_char(... 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`)
   - `pg_advisory_xact_lock(hashtext($key)::bigint)` direkt nach BEGIN
   - Pure helpers `mergeMailWithDefaults` + `stripMailDictEqual` mit M1's trim-aware semantic
3. **GET/PUT-Route** `src/app/api/dashboard/site-settings/submission-mail-texts/route.ts` — mirror M1
4. **`submission_mail_texts_update` audit-event** + `submission-mail-texts` DirtyContext-key + `editorIsDirty` OR-Logic in SignupsSection (DK extends M2a)
5. **`getSubmissionMailTexts(locale)` DB-loader** der `signup-mail.ts` ersetzt die statische `DEFAULT_TEMPLATES` lookup durch DB-merged-with-defaults (M2a's `signup-mail.ts` muss minimal-modifiziert werden, ein Liner)
6. **Edge Case (Finding #19):** Admin-mid-edit race — Snapshot-isolation acceptable, eventual-consistency. Edge-case-row in M2b spec.
7. **Decision für M2b:** entweder textarea+helper-buttons oder existing RichTextEditor — wahrscheinlich textarea wegen Mail-HTML-Constraints. Spec-Round in M2b entscheidet.
