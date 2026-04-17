# Spec: T0-Auth-Hardening
<!-- Created: 2026-04-17 -->
<!-- Author: Planner (Claude) -->
<!-- Status: Draft -->

## Summary
Die Auth-Teile der T0-Security-Checkliste, die aus dem Infra-Sprint PR #62 bewusst ausgelagert wurden, zu Ende bringen: bcrypt cost 10→12 mit Rehash-on-Login, Cookie `session` → `__Host-session`, dynamischer Timing-Oracle-Dummy, plus die Audit- und Boot-Observability die der Deploy-Gate braucht. Adressiert die 6 Codex-PR2-Findings aus `tasks/codex-spec-review.md` (commit `efec732`).

## Context

**Stack-Constraint (aus `memory/lessons.md` 2026-04-17 — Shared Staging+Prod DB):**
Staging und Prod teilen sich die Production-DB. Das heißt: ein Staging-Login nach Deploy triggert den Rehash einmal, und Prod sieht danach nur noch gerehashte Hashes. Die klassische Verifikations-Logik "Login auf Staging, dann Login auf Prod, beide emittieren genau ein `password_rehashed`" ist strukturell kaputt. Verifikations-Strategie (Option A, s.u.) baut darauf auf, dass der Rehash SUMMIERT über beide Environments genau einmal passiert.

**Codebase-Shape:**
- `src/lib/auth.ts` (70 Zeilen) — `login(email, pw): Promise<string | null>`, hardcoded `DUMMY_HASH = "$2b$10$..."`, `hashPassword` nutzt hardcoded `10`. JWT via jose HS256, 24h Expiry.
- `src/middleware.ts` (Edge Runtime!) — liest `req.cookies.get("session")`, kein pg/bcrypt Import (jose ist Edge-safe).
- 7 Cookie-Call-Sites mit Name `"session"`: login (write), logout (clear), middleware (read), api-helpers (read), signups-audit (read), account GET + PUT (read ×2).
- `src/lib/audit.ts` — finiter AuditEvent union mit 7 Events. Fire-and-forget DB persist + stdout. `extractAuditEntity` mappt event+details → (entity_type, entity_id) für indexierte Queries.
- `src/instrumentation.ts` — eager env-validation bei Boot. Läuft `ensureSchema`, `seedIfEmpty`, `bootstrapAdmin`. IP_HASH_SALT wirft bei <16 chars; JWT_SECRET/DATABASE_URL warnen.
- Tests: Vitest 4.1, `environment: "node"` global, pro-File `// @vitest-environment jsdom` Pragma für UI. Keine bestehenden bcrypt- oder login-Tests.
- 1-Admin-System (Huy). Keine Multi-User-Koordination nötig für Cookie-Migration.

**T0-Infra-Sprint (PR #62) ist live:** HSTS, Dotfile-Block, `X-Frame:DENY`, Permissions-Policy, Next.js 16.2.4 CVE-Patch, nginx-Hardening, client-ip XFF-Fallback raus, Dependabot, SHA-pinned Actions. HTTPS ist hart erzwungen → `__Host-` Cookie-Prefix in Prod funktioniert.

## Requirements

### Must Have (Sprint Contract)

1. **bcrypt cost 12 via `BCRYPT_ROUNDS` env**
   - `src/lib/auth.ts`: Modul-konstante `const BCRYPT_ROUNDS = parseBcryptRounds(process.env.BCRYPT_ROUNDS)` mit Default 12, Range-Check (≥4, ≤15 für Sanity), NaN-Fallback auf 12 + console.warn.
   - `hashPassword(plain)` nutzt `BCRYPT_ROUNDS` statt `10`.
   - `DUMMY_HASH` dynamisch via `bcrypt.hashSync("dummy-password-for-timing-oracle-protection", BCRYPT_ROUNDS)` beim Modul-Load.

2. **Rehash-on-Login inline in `login()`**
   - Nach erfolgreichem `verifyPassword` + VOR JWT-Sign: wenn `parseCost(user.password) < BCRYPT_ROUNDS`, fire-and-forget Block:
     ```ts
     bcrypt.hash(password, BCRYPT_ROUNDS)
       .then(async (newHash) => {
         const { rowCount } = await pool.query(
           "UPDATE admin_users SET password = $1 WHERE id = $2 AND password = $3",
           [newHash, user.id, user.password]
         );
         if (rowCount === 1) {
           auditLog("password_rehashed", { user_id: user.id, old_cost, new_cost, ip });
         }
       })
       .catch((err) => {
         console.error("[login] rehash_failed:", err);
         try { auditLog("rehash_failed", { user_id: user.id, ip, reason: String(err) }); } catch {}
       });
     ```
   - `WHERE id=$1 AND password=$3` ist das Race-Gate: bei parallelen Logins gewinnt der erste UPDATE, der zweite sieht den neuen Hash als `password`-Mismatch → `rowCount=0` → kein Audit.
   - **Signature Change:** `login()` bekommt zusätzlichen `ip: string` Parameter, da der Rehash-Audit den IP-Klienten-Kontext braucht. Call-Site in `src/app/api/auth/login/route.ts` reicht `getClientIp(req.headers)` durch.

3. **`session` → `__Host-session` Cookie-Migration**
   - Neues Edge-safe Leaf-Modul `src/lib/auth-cookie.ts` mit **NULL** runtime-dependent Imports (keine pg, keine bcrypt). Exportiert:
     - `SESSION_COOKIE_NAME: string` — env-derived: Prod=`__Host-session`, andere=`session`.
     - `sessionCookieOptions(maxAge: number): CookieOptions` — {httpOnly: true, secure: NODE_ENV==="production", sameSite: "lax", path: "/", maxAge}.
     - `SESSION_MAX_AGE_SECONDS = 60 * 60 * 24`.
   - **`sameSite` von "strict" auf "lax"** gewechselt: `strict` blockt Cross-Site-Navigation zu `/dashboard/` (z.B. Link aus E-Mail). Für Admin-Dashboard ohne Form-POST-from-elsewhere ist `lax` der sensible Default.
   - Alle 7 Call-Sites ersetzen `"session"` string durch `SESSION_COOKIE_NAME` import.
   - Login write und logout clear nutzen `sessionCookieOptions(SESSION_MAX_AGE_SECONDS)` bzw. `sessionCookieOptions(0)`.

4. **`audit.ts` Event-Map erweitern**
   - `AuditEvent` union bekommt `"password_rehashed" | "rehash_failed"`.
   - `AuditDetails` bekommt optionale Felder: `user_id?: number`, `old_cost?: number`, `new_cost?: number`.
   - `src/lib/audit-entity.ts`: mapping für beide Events → `{ entity_type: "admin", entity_id: details.user_id ?? null }`.
   - Tests in `src/lib/audit-entity.test.ts` erweitern um 2 Cases (`password_rehashed`, `rehash_failed`).

5. **`instrumentation.ts` Boot-Warning für `BCRYPT_ROUNDS<12`**
   - Nach `IP_HASH_SALT`-Check, VOR Retry-Loop: wenn `NODE_ENV !== "test"` UND `parseInt(process.env.BCRYPT_ROUNDS ?? "12", 10) < 12` → `console.warn("[instrumentation] BCRYPT_ROUNDS=<N> is below OWASP 2026 Tier-0 minimum (12). Only acceptable in test env or emergency rollback.")`. **Nicht crashen** — das ist der Emergency-Rollback-Pfad.

6. **Tests**
   - `src/lib/auth-cookie.test.ts` NEU — 3 Tests: prod→`__Host-session` + secure=true, dev→`session` + secure=false, maxAge passthrough.
   - `src/lib/auth.test.ts` NEU — 4 Tests für pure Helpers (exportiert aus auth.ts): `parseCost("$2b$10$...")===10`, `parseCost` auf malformed → `null`, `parseBcryptRounds(undefined)===12`, `parseBcryptRounds("4")===4`, `parseBcryptRounds("notanumber")===12`.
   - `src/lib/audit-entity.test.ts` erweitert — 2 neue Cases für `password_rehashed` + `rehash_failed`.
   - **Keine Integration-Tests für rehash-on-login** (patterns/auth.md line 59 sagt: structural-latency-proof via temp-DB — in alit-website ohne Testcontainers nicht praktikabel). Staging-Smoke deckt den Integration-Pfad.
   - `pnpm build` passt, `pnpm test` grün (existing 168 + 9 neue = 177+ Tests).

7. **Verifikations-Runbook dokumentiert in `tasks/todo.md`**
   - Pre-Staging-Push: SSH-Snapshot `SELECT substr(password,1,7) AS prefix, email FROM admin_users` → erwartet `$2a$10$` oder `$2b$10$`.
   - Post-Staging-Login: gleicher SSH-SELECT → erwartet `$2a$12$` oder `$2b$12$`. Plus `SELECT * FROM audit_events WHERE event='password_rehashed' ORDER BY id DESC LIMIT 1` → erwartet 1 neues Event seit Deploy-Zeit.
   - Post-Prod-Merge: gleicher SELECT → erwartet immer noch `$2a$12$`/`$2b$12$` (no-op, weil schon gerehashed). Cookie-Prefix-Check `curl -I -b session-cookie https://alit.hihuydo.com/dashboard/` → Response zeigt `__Host-session` als Set-Cookie.
   - `SELECT COUNT(*) FROM audit_events WHERE event='rehash_failed' AND created_at > '<deploy-timestamp>'` MUSS 0 sein.

> **Wichtig:** Nur Must-Have-Items sind Teil des Sprint Contracts. Diese werden im Review gegen PR-Findings hart durchgesetzt — alles außerhalb ist kein Merge-Blocker.

### Nice to Have (explicit follow-up, NOT this sprint)

1. `BCRYPT_ROUNDS` env-var in `docker-compose.yml` + `docker-compose.staging.yml` `environment:`-Block durchreichen — nur nötig wenn Emergency-Rollback je gefragt ist. Aktuell: Default 12 reicht.
2. Dual-Clear in Logout (sowohl `__Host-session` als auch legacy `session` auf maxAge=0 setzen) — überflüssig, da legacy-Cookie nach max 24h durch eigenes maxAge abläuft und middleware es ignoriert.
3. BCRYPT_ROUNDS als optional-Override in Vitest-Setup (via `vi.stubEnv`) wenn wir je doch bcrypt-Integration-Tests wollen.
4. Admin-Dashboard-Sichtbarkeit für `password_rehashed` / `rehash_failed` Events — prinzipiell nützlich als Audit-Trail, aber die bestehende `audit_events`-Tabelle + kein Dashboard-UI für Admin-Events (nur Memberships) → eigener kleiner Sprint wenn nötig.

> **Regel:** Nice-to-Have wird im aktuellen Sprint NICHT gebaut. Beim Wrap-Up wandern diese Items nach `memory/todo.md`.

### Out of Scope

- **Session-Rotation bei Privilege-Change** (Tier-1, braucht Role-Escalation-Trigger, alit hat nur einen Admin-Role)
- **Logout-Invalidierung auf allen Devices** (Tier-1, braucht `tokens_invalidated_at` Schema + `iat`-Check in verify)
- **CSP Report-Only → strict** (Tier-1, braucht Nonce-Middleware + Edge-Runtime-Compat, eigener Sprint)
- **2FA für Admin** (Tier-1, eigener Sprint)
- **Password Reset Flow** (Tier-1/2, alit hat nur 1 Admin, manuelles `UPDATE admin_users SET password = ...` reicht)
- **DB-Backfill-Rehash existierender Legacy-Hashes ohne Login-Trigger** (1-Admin-System, Rehash-on-Login deckt alle aktiven User)
- **Separate Staging-DB als Infra-Prerequisite** (großer Infra-Sprint, shared-DB-Verifikations-Strategie reicht für Auth-Sprint)
- **Cookie Dual-Read** für Migration (1-Admin-System, Forced Re-Login ist akzeptabel)

## Technical Approach

### Files to Change

| File | Change Type | Description |
|------|-------------|-------------|
| `src/lib/auth-cookie.ts` | **Create** | Edge-safe Leaf-Modul. `SESSION_COOKIE_NAME`, `sessionCookieOptions()`, `SESSION_MAX_AGE_SECONDS`. KEINE pg/bcrypt-Imports. |
| `src/lib/auth-cookie.test.ts` | **Create** | 3 Tests: prod→`__Host-session`, dev→`session`, maxAge passthrough. Nutzt `vi.stubEnv`. |
| `src/lib/auth.ts` | Modify | `BCRYPT_ROUNDS` env-konstant, `parseBcryptRounds()` pure helper (exported), `parseCost()` pure helper (exported), dynamischer `DUMMY_HASH`, `hashPassword(plain)` nutzt Konstante, `login(email, password, ip)` signature-Change + inline rehash-on-login. |
| `src/lib/auth.test.ts` | **Create** | 4 Tests für `parseCost` + `parseBcryptRounds`. |
| `src/lib/audit.ts` | Modify | `AuditEvent` union += 2 Events; `AuditDetails` optional fields `user_id`, `old_cost`, `new_cost`. |
| `src/lib/audit-entity.ts` | Modify | 2 neue Event-Cases → `{ entity_type: "admin", entity_id: user_id ?? null }`. |
| `src/lib/audit-entity.test.ts` | Modify | 2 neue Test-Cases. |
| `src/middleware.ts` | Modify | `req.cookies.get("session")` → `req.cookies.get(SESSION_COOKIE_NAME)` via import aus `auth-cookie.ts`. |
| `src/lib/api-helpers.ts` | Modify | Gleich: `requireAuth` nutzt `SESSION_COOKIE_NAME`. |
| `src/lib/signups-audit.ts` | Modify | Gleich: `resolveActorEmail` nutzt `SESSION_COOKIE_NAME`. |
| `src/app/api/auth/login/route.ts` | Modify | `res.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions(SESSION_MAX_AGE_SECONDS))`. `login(email, password, ip)` mit IP-Parameter. |
| `src/app/api/auth/logout/route.ts` | Modify | `res.cookies.set(SESSION_COOKIE_NAME, "", sessionCookieOptions(0))`. |
| `src/app/api/dashboard/account/route.ts` | Modify | GET + PUT nutzen `req.cookies.get(SESSION_COOKIE_NAME)`. |
| `src/instrumentation.ts` | Modify | `BCRYPT_ROUNDS<12` Boot-Warning nach `IP_HASH_SALT`-Check, vor Retry-Loop. |

**Total: 4 Create + 10 Modify = 14 Files.**

### Architecture Decisions

- **Inline rehash in `login()` statt externe Helper-Funktion.** Grund: `login()` hat bereits alle Inputs (user.id, user.password, plaintext). Ein separater `rehashIfNeeded(user, pw, ip)`-Helper würde denselben Scope haben und nur mehr Boilerplate bedeuten. Die pure Helpers (`parseCost`, `parseBcryptRounds`) werden trotzdem exportiert für unit-tests.
- **Rehash-Race-Gate via `WHERE id=$1 AND password=$old_hash`.** Zweiter paralleler Login sieht den bereits aktualisierten Hash → `rowCount=0` → kein Double-Audit. Alternative (mutex oder `SELECT ... FOR UPDATE`) wäre Overkill für 1-Admin-System.
- **`SESSION_COOKIE_NAME` env-derived, nicht run-time-erzwungen.** Prod=NODE_ENV==="production"→`__Host-session`, alles andere→`session` (dev/test ohne HTTPS). Alternative (immer `__Host-session`, dev akzeptiert ohne secure) ist nicht möglich — Browser validiert `__Host-`-Prefix gegen Secure-Flag.
- **`sameSite: "lax"` statt "strict".** Admin-Dashboard wird ausschließlich via direkte URL oder Link aus Admin-E-Mails aufgerufen. `strict` blockt den E-Mail-Link-Flow (redirect nach Login verliert Session). `lax` ist sicher gegen CSRF-POST-from-elsewhere (kein Cross-Site-POST erlaubt), erlaubt aber GET-Navigation. CSRF für Mutations wird durch POST-Only + SameSite=Lax + HttpOnly + Secure abgedeckt.
- **BCRYPT_ROUNDS als env-driven Konstante auf Modul-Load, nicht pro Call.** Config freezt beim ersten Import. Ermöglicht Test-Override via `vi.stubEnv("BCRYPT_ROUNDS", "4")` VOR dem Import (dynamic import in Tests nötig falls relevant — aktuell nicht).
- **Shared Staging+Prod DB Verifikation via Option A (Snapshot+Rehash+Spot-Check).** Alternative (separate Staging-DB) wäre Infra-Sprint. Option A funktioniert weil Rehash-Event einmal insgesamt (über beide Environments) emittiert wird — Prod wird zur no-op-Verifikation (cookie-prefix-roundtrip ist das Prod-Artefakt).
- **Cookie-Migration via Forced Re-Login, kein Dual-Read.** Begründung: 1-Admin-System, Dual-Read erfordert temporäre Code-Komplexität (beide Namen lesen, nur neuen schreiben, nach N Tagen legacy entfernen) ohne Gegenwert. Huy loggt sich 1× neu ein nach Deploy. Alter Cookie expired binnen 24h via `maxAge`.

### Dependencies

**External:**
- Keine neuen npm-Packages. `bcryptjs` + `jose` + `pg` bleiben.
- `BCRYPT_ROUNDS` env-var optional (kein Default-Setup nötig).

**Internal:**
- `src/lib/audit.ts` ist Source-of-Truth für Event-Union. Koppelt an `audit-entity.ts` (entity-mapping) und `login()` (caller).
- `src/lib/auth-cookie.ts` muss Edge-safe bleiben — keine pg/bcrypt Imports. Middleware läuft Edge-Runtime.

**Verifikations-Dependencies (manuell, nicht Code):**
- SSH-Zugang zu hd-server (`ssh hd-server`), Postgres-CLI für `SELECT substr(password,1,7)` Spot-Checks, `curl` für Cookie-Roundtrip.
- Staging-Login-Credentials sind identisch zu Prod (shared DB, 1 Admin).

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| **Parallele Logins gleicher User** (2 Browser-Tabs) | Beide Logins erfolgreich. Fire-and-forget Rehash: erster UPDATE `rowCount=1` → Audit `password_rehashed`. Zweiter UPDATE `rowCount=0` (WHERE-Gate matched nicht mehr) → kein Double-Audit. |
| **Rehash bcrypt.hash throws** | Fire-and-forget `.catch`: `console.error` + Audit `rehash_failed` (try/catch um Audit). Login-Response bereits an Client gesendet — kein User-Impact. |
| **Rehash UPDATE DB-Outage** | Gleich: `.catch` → `rehash_failed` Audit. `audit_events`-Insert hat eigenen inner try/catch (aktuell in `audit.ts` `persistAuditEvent`). |
| **Dev-Umgebung (HTTP localhost)** | `NODE_ENV !== "production"` → Cookie-Name=`session`, `secure: false`. Login funktioniert auf http://localhost:3000. |
| **BCRYPT_ROUNDS=4 in Test-Env** | Instrumentation-Warning NICHT geloggt (`NODE_ENV === "test"`). `hashPassword` + DUMMY_HASH nutzen cost 4. Tests laufen schneller. |
| **BCRYPT_ROUNDS=invalid** | `parseBcryptRounds` fällt zurück auf 12 + console.warn. |
| **BCRYPT_ROUNDS=20** (zu hoch) | Range-Check clampt auf 15 (Sanity-Max) + console.warn. Bcrypt-Hash bei cost 20 dauert ~1 Minute → DoS-Vektor bei Login-Flood. |
| **Browser schickt orphan `session`-Cookie nach Deploy** | Middleware liest `__Host-session` → nicht gefunden → redirect auf `/dashboard/login/`. Alter Cookie wird nicht referenziert; Browser löscht ihn nach `maxAge` (≤24h). |
| **Admin loggt sich mit Cost-12-Hash ein** (post-first-login) | `parseCost === 12 === BCRYPT_ROUNDS` → keine Rehash-Branch → keine UPDATE-Query. Standard-Login-Pfad. |
| **Admin hat Cost-11-Hash nach Emergency-Rollback+Re-Upgrade** | `parseCost(11) < 12` → Rehash-Branch feuert. User migriert zurück auf 12. |
| **Login mit hash.split('$')[2] = malformed** | `parseCost` returns null → Rehash-Branch geskipped (Number.isFinite null = false). Login erfolgreich. Kein Audit. Follow-Up manuell. |
| **Shared DB: Staging-User re-logged-in bevor Prod-Deploy** | Rehash schon passiert. Prod-Deploy → Prod-Login sieht `$2a$12$` → keine Rehash-Branch → kein 2. Audit. Genau 1 Event insgesamt. |

## Risks

- **Risiko 1: Cookie-Migration bricht existierende Session-Cookies sofort beim Deploy.** Mitigation: 1-Admin-System, Forced Re-Login, maxAge 24h. Dokumentiert in `tasks/todo.md` Runbook.
- **Risiko 2: BCRYPT_ROUNDS=12 verdoppelt Login-Latenz (~200→400ms per bcrypt.compare).** Mitigation: Rehash ist fire-and-forget (nicht auf Response-Path); Dummy-Hash nutzt gleiche Cost → Timing-Oracle bleibt dicht. DUMMY_HASH einmalig bei Boot via `hashSync` (Boot-Zeit +~250ms akzeptabel).
- **Risiko 3: `__Host-` Cookie-Prefix wird von Browser verworfen wenn nginx nicht HTTPS-only enforced.** Mitigation: HSTS ist live (PR #62). HTTP→HTTPS-Redirect aktiv. Verifiziert via `curl -I http://alit.hihuydo.com/dashboard/login/` → 301 auf https.
- **Risiko 4: Rehash-Fire-and-forget UPDATE rennet in DB-Pool-Exhaustion bei Login-Storm.** Mitigation: `pg`-Pool hat `max=10` Default. Rehash-UPDATE ist einzelne Query ~10ms, selbst 100 Logins/sec wäre 1s-Last. Für 1-Admin-System unkritisch.
- **Risiko 5: SharedDB-Verifikation fühlt sich schwach an.** Mitigation: Snapshot vor Push + Spot-Check nach Login ist verifizierbar + reproduzierbar. Separate Staging-DB ist als Out-of-Scope dokumentiert; wenn in Zukunft relevant, wird's eigener Infra-Sprint.
- **Risiko 6: Codex findet weitere Race-Conditions im Rehash-Flow.** Mitigation: Sprint ist Medium-Scope, Codex-Rounds sind erlaubt. WHERE-Gate ist pattern-belegt (patterns/auth.md). Bei `[Critical]` in Runde 1 fixen; bei Runde 3 noch `[Critical]` → Sprint-Split-Signal.
