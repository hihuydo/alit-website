# Spec: T0-Auth-Hardening Sprint A — bcrypt-Rehash
<!-- Created: 2026-04-17 -->
<!-- Author: Planner (Claude) -->
<!-- Status: Draft v2 (split per Codex-Spec-Review — Cookie-Migration extracted into Sprint B) -->

## Summary
bcrypt cost 10→12 mit dynamischem Timing-Oracle-Dummy, Rehash-on-Login mit Race-Gate, Boot-Observability und Audit-Event-Erweiterung. Server-seitige Auth-Hardening ohne Client-State-Migration. Cookie `session` → `__Host-session` ist auf **Sprint B** verschoben (eigene Spec wenn Sprint A durch ist).

## Context

**Scope-Split-Grund (aus `tasks/codex-spec-review.md` 2026-04-17 — Verdict SPLIT RECOMMENDED):**
Codex identifizierte zwei verschiedene Migrationsklassen: (1) bcrypt/rehash = persistenter DB-state in shared Staging+Prod DB, (2) Cookie-Migration = aktiver Client-state mit asymmetrischem Rollback. In einem Sprint gebundelt erhöht sich der Incident-Blast-Radius. Split in A (server-side only, no client breakage) + B (cookie-migration mit eigener Observability-Phase).

**Stack-Constraint (aus `memory/lessons.md` 2026-04-17 — Shared Staging+Prod DB):**
Staging und Prod teilen sich die Production-DB. Ein Staging-Login nach Deploy triggert den Rehash einmal, Prod sieht danach nur noch gerehashte Hashes. Verifikations-Strategie addressiert das via Pre-Snapshot + Staging-Login-Trigger + Spot-Check.

**Codebase-Shape (relevant für Sprint A):**
- `src/lib/auth.ts` (70 Zeilen) — `login(email, pw): Promise<string | null>`, hardcoded `DUMMY_HASH = "$2b$10$..."`, `hashPassword` nutzt hardcoded `10`. JWT via jose HS256, 24h Expiry.
- `src/lib/audit.ts` — finiter AuditEvent union mit 7 Events. Fire-and-forget DB persist + stdout. **Wichtig:** stdout ist "erste Source-of-Truth", DB-persist ist best-effort (`src/lib/audit.ts:4-7`).
- `src/instrumentation.ts` — eager env-validation bei Boot. Nach `IP_HASH_SALT`-Check, vor Retry-Loop.
- `docker-compose.yml` + `docker-compose.staging.yml` — reichen env-vars nur aus Allowlist durch. Neue Env-Vars müssen parallel in `environment:`-Block gelistet werden (sonst erreichen sie den Container nie — `patterns/deployment-docker.md`).
- Tests: Vitest 4.1, `environment: "node"` global, keine bestehenden bcrypt-Tests.
- 1-Admin-System (Huy).

**T0-Infra-Sprint (PR #62) ist live:** HSTS, Dotfile-Block, `X-Frame:DENY`, Permissions-Policy, Next.js 16.2.4, nginx-Hardening, client-ip XFF-Fallback raus, Dependabot, SHA-pinned Actions, gitleaks pre-commit.

## Requirements

### Must Have (Sprint Contract)

1. **Shared BCRYPT_ROUNDS Parser via Edge-safe Leaf-Modul**
   - `src/lib/bcrypt-rounds.ts` NEU — pure, keine pg/bcrypt Imports (könnte prinzipiell auch im Edge-Runtime laufen, Future-Proofing). Exportiert:
     - `BCRYPT_ROUNDS_DEFAULT = 12`, `BCRYPT_ROUNDS_MIN = 4`, `BCRYPT_ROUNDS_MAX = 15`
     - `parseBcryptRounds(input: string | undefined): { rounds: number, warning: string | null }`
       - `undefined`/empty → `{ rounds: 12, warning: null }`
       - Non-integer → `{ rounds: 12, warning: "..." }`
       - `<4` → `{ rounds: 4, warning: "clamped" }`
       - `>15` → `{ rounds: 15, warning: "clamped, DoS-prevention" }`
       - Otherwise → `{ rounds: n, warning: null }`
   - **Addressiert Codex-Finding [Correctness] Parser-Drift.**

2. **bcrypt cost 12 in `src/lib/auth.ts`**
   - Import aus `./bcrypt-rounds`: `BCRYPT_ROUNDS` konstant computed at module-load via `parseBcryptRounds(process.env.BCRYPT_ROUNDS)`. Warning → `console.warn("[auth] ...")`.
   - `hashPassword(plain)` nutzt `BCRYPT_ROUNDS` (nicht hardcoded 10).
   - `DUMMY_HASH` dynamisch via `bcrypt.hashSync("dummy-password-for-timing-oracle-protection", BCRYPT_ROUNDS)` bei Modul-Load. **Side-effect: +~250ms Modul-Import-Zeit in Prod.** Acceptable bei Cold-Boot.

3. **Rehash-on-Login inline in `login()`**
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
   - `WHERE id=$1 AND password=$3` ist das Race-Gate. `rowCount === 1` gatet den Audit.
   - **Signature Change:** `login(email, password, ip)` — Call-Site in `src/app/api/auth/login/route.ts` reicht `getClientIp(req.headers)` durch.
   - `parseCost(hash: string): number | null` pure helper, exported für Unit-Tests.

4. **`audit.ts` Event-Map erweitern**
   - `AuditEvent` union bekommt `"password_rehashed" | "rehash_failed"`.
   - `AuditDetails` bekommt optionale Felder: `user_id?: number`, `old_cost?: number`, `new_cost?: number`.
   - `src/lib/audit-entity.ts`: mapping für beide Events → `{ entity_type: "admin", entity_id: details.user_id ?? null }`.
   - Tests in `src/lib/audit-entity.test.ts` erweitern um 2 Cases.

5. **`instrumentation.ts` Boot-Warning für `BCRYPT_ROUNDS<12`**
   - Import `parseBcryptRounds` aus `./lib/bcrypt-rounds`. Nach `IP_HASH_SALT`-Check, vor Retry-Loop:
     ```ts
     const { rounds, warning } = parseBcryptRounds(process.env.BCRYPT_ROUNDS);
     if (warning) console.warn(`[instrumentation] ${warning}`);
     if (process.env.NODE_ENV !== "test" && rounds < 12) {
       console.warn(`[instrumentation] BCRYPT_ROUNDS=${rounds} is below OWASP 2026 Tier-0 minimum (12). Only acceptable in test env or emergency rollback.`);
     }
     ```
   - **Nicht crashen** — Emergency-Rollback-Pfad muss deploybar bleiben.

6. **`BCRYPT_ROUNDS` env-var in Docker-Compose durchgereicht** (Must-Have, nicht Nice-to-have)
   - `docker-compose.yml` + `docker-compose.staging.yml`: `environment:`-Block bekommt zusätzliche Zeile `BCRYPT_ROUNDS: ${BCRYPT_ROUNDS:-12}` (default 12 wenn unset in host-env).
   - **Addressiert Codex-Finding [Contract] 1.** Ohne diesen Schritt ist Env-Override (Emergency-Rollback) nicht deploybar.
   - `.env.example` (falls existiert, sonst erstellen — prüfen im Repo) bekommt `# BCRYPT_ROUNDS=12  # optional override, 4-15` Doc-Zeile.

7. **Tests**
   - `src/lib/bcrypt-rounds.test.ts` NEU — 5 Tests: default (undefined), valid number, non-integer → warn+default, clamp low, clamp high.
   - `src/lib/auth.test.ts` NEU — 2 Tests für `parseCost` (`parseCost("$2b$10$...")===10`, malformed → `null`).
   - `src/lib/audit-entity.test.ts` erweitert — 2 neue Cases für `password_rehashed` + `rehash_failed`.
   - **Keine Integration-Tests für Rehash** (kein Testcontainer-Setup). Staging-Smoke deckt Integration.
   - `pnpm build` + `pnpm test` green (existing 168 + 9 neue = 177+).

8. **Verifikations-Runbook mit DUAL-Gate (DB-Count + stdout-Logs)**
   - **Pre-Staging-Push**: SSH-Snapshot `SELECT substr(password,1,7) AS prefix, email FROM admin_users;` → erwartet `$2a$10$` / `$2b$10$`.
   - **Post-Staging-Login**: 
     - Hash-Spot-Check: `SELECT substr(password,1,7), email FROM admin_users;` → erwartet `$2a$12$` / `$2b$12$`.
     - Audit-DB-Check: `SELECT event, details->>'old_cost' AS oc, details->>'new_cost' AS nc FROM audit_events WHERE event='password_rehashed' ORDER BY id DESC LIMIT 1;` → 1 Row mit `oc=10, nc=12`.
     - **Audit-Log-Check** (parallel): `ssh hd-server 'docker logs alit-staging --since="10m" | grep "password_rehashed\|rehash_failed"'` → zeigt `password_rehashed`-Line mit gleichen Details.
   - **rehash_failed DUAL-Gate** (Codex [Correctness] 1 Fix):
     - DB: `SELECT COUNT(*) FROM audit_events WHERE event='rehash_failed' AND created_at > '<deploy-timestamp>';` MUSS 0 sein.
     - Logs: `ssh hd-server 'docker logs alit-staging --since="10m" | grep rehash_failed'` MUSS leer sein. Wenn Log-Line existiert aber DB-Count=0 → audit-DB-persist war down, der rehash-failure ist echt. Beide Gates müssen grün sein.
   - **Post-Prod-Merge**: gleicher Hash-Spot-Check → bleibt `$2a$12$`/`$2b$12$` (no-op — DB schon migriert durch Staging-Login). Login-Response-Header-Check: `curl -s -D - -X POST https://alit.hihuydo.com/api/auth/login -d '{...valid-creds...}' | grep -i set-cookie` zeigt `session=...` (wird in Sprint B auf `__Host-session` migriert, NICHT in Sprint A).

> **Wichtig:** Nur Must-Have-Items sind Teil des Sprint Contracts. Diese werden im Review hart durchgesetzt.

### Nice to Have (explicit follow-up, NOT this sprint)

1. Admin-Dashboard-UI für `password_rehashed` / `rehash_failed` Events — bestehende `audit_events`-Tabelle hat nur Memberships-UI. Eigener kleiner Sprint wenn nötig.
2. Rate-Limit-Observability für rehash-UPDATE-Storms — aktuell low-risk bei 1-Admin.
3. `parseCost` auch in instrumentation.ts nutzen für präventiven Warn bei Legacy-Hashes in DB — interessant, aber Rehash-on-Login löst es bereits.

> Beim Wrap-Up wandern diese Items nach `memory/todo.md`.

### Out of Scope (Sprint A)

- **Cookie-Migration `session` → `__Host-session`** — Sprint B mit eigener Observability-Phase + Dual-Read-Fallback + `sameSite`-Re-Evaluation. Codex [Architecture] + [Security] Findings.
- **`sameSite: "strict" → "lax"`** — aktueller `strict` bleibt. Codex [Security] 2: keine dokumentierte Produktanforderung.
- **Session-Rotation bei Privilege-Change** (Tier-1, 1-Admin-System braucht's nicht)
- **Logout-Invalidierung auf allen Devices** (Tier-1, braucht `tokens_invalidated_at` Schema)
- **CSP Report-Only → strict** (Tier-1, eigener Sprint)
- **2FA für Admin** (Tier-1, eigener Sprint)
- **Password Reset Flow** (1-Admin, manueller DB-Update reicht)
- **DB-Backfill-Rehash ohne Login-Trigger** (1-Admin-System)
- **Separate Staging-DB** (großer Infra-Sprint)

## Technical Approach

### Files to Change

| File | Change Type | Description |
|------|-------------|-------------|
| `src/lib/bcrypt-rounds.ts` | **Create** | Edge-safe Leaf-Modul. `BCRYPT_ROUNDS_DEFAULT`, `parseBcryptRounds()`. KEINE pg/bcrypt/audit Imports. |
| `src/lib/bcrypt-rounds.test.ts` | **Create** | 5 Tests: default/valid/non-integer/clamp-low/clamp-high. |
| `src/lib/auth.ts` | Modify | Import `parseBcryptRounds` aus shared leaf. `BCRYPT_ROUNDS` const. `parseCost` pure helper (exported). Dynamischer `DUMMY_HASH`. `hashPassword` nutzt Konstante. `login(email, password, ip)` 3-arg + inline rehash-on-login. |
| `src/lib/auth.test.ts` | **Create** | 2 Tests für `parseCost`. |
| `src/lib/audit.ts` | Modify | `AuditEvent` union += 2 Events; `AuditDetails` += `user_id?`, `old_cost?`, `new_cost?`. |
| `src/lib/audit-entity.ts` | Modify | 2 neue Event-Cases → `{ entity_type: "admin", entity_id: user_id ?? null }`. |
| `src/lib/audit-entity.test.ts` | Modify | 2 neue Test-Cases. |
| `src/app/api/auth/login/route.ts` | Modify | `login(email, password, ip)` mit IP-Parameter. Cookie-Setting bleibt unverändert (`session` Name, `strict`). |
| `src/instrumentation.ts` | Modify | Import `parseBcryptRounds`. Boot-Warning nach IP_HASH_SALT-Check, vor Retry-Loop. |
| `docker-compose.yml` | Modify | `environment:`-Block += `BCRYPT_ROUNDS: ${BCRYPT_ROUNDS:-12}`. |
| `docker-compose.staging.yml` | Modify | gleich. |
| `.env.example` | Modify (oder Create) | Dokumentations-Zeile. Prüfen ob existiert. |

**Total: 3 Create + 9 Modify = 12 Files.**

### Architecture Decisions

- **Shared Leaf-Modul `bcrypt-rounds.ts` statt Duplikation.** Codex-Finding [Correctness] 3: Parser-Drift zwischen auth.ts und instrumentation.ts. Ein gemeinsamer Helper ist minimal, aber eliminiert Drift-Risiko.
- **Inline Rehash in `login()` statt externe Helper.** `login()` hat bereits alle Inputs (user.id, user.password, plaintext, ip). Pure Helpers (`parseCost`, `parseBcryptRounds`) werden für Unit-Tests exportiert.
- **Race-Gate via `WHERE id=$1 AND password=$old_hash`.** Zweiter paralleler Login sieht den bereits aktualisierten Hash → `rowCount=0` → kein Double-Audit.
- **BCRYPT_ROUNDS Compose-Wiring als Must-Have** (nicht Nice-to-Have). Codex-Finding [Contract] 1: Ohne Compose-Wiring ist Emergency-Rollback-Pfad nicht deploybar.
- **DUAL-Gate für rehash_failed Verifikation.** Codex [Correctness] 1: audit.ts ist stdout-first, DB-best-effort. Gate muss beide Seiten prüfen.
- **Cookie-Migration NICHT in Sprint A.** Codex [Architecture] + [Security] Findings rechtfertigen Split.
- **Shared Staging+Prod DB Verifikation via Snapshot+Rehash+Spot-Check.** Rehash-Event einmal insgesamt (über beide Environments). Prod wird zur no-op-Verifikation.

### Dependencies

**External:**
- Keine neuen npm-Packages. `bcryptjs` + `jose` + `pg` bleiben.
- `BCRYPT_ROUNDS` env-var optional, default 12.

**Internal:**
- `src/lib/audit.ts` ist Source-of-Truth für Event-Union.
- `src/lib/bcrypt-rounds.ts` muss Edge-safe bleiben — keine pg/bcrypt Imports, nur pure Logic. Ermöglicht Import aus instrumentation.ts (Node-runtime) UND perspektivisch aus Edge-Code.

**Verifikations-Dependencies (manuell):**
- SSH-Zugang zu hd-server, `docker compose exec postgres psql` für Hash-Spot-Checks, `docker logs alit-staging/alit-web` für stdout-Gates.
- Staging-Login-Credentials identisch zu Prod (shared DB).

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| **Parallele Logins gleicher User** | Beide erfolgreich. Fire-and-forget Rehash: erster UPDATE `rowCount=1` → Audit. Zweiter `rowCount=0` → kein Double-Audit. |
| **Rehash bcrypt.hash throws** | `.catch`: `console.error` + Audit `rehash_failed` (try/catch um Audit). Login-Response schon an Client gesendet. |
| **Rehash UPDATE DB-Outage** | `.catch` → `rehash_failed` stdout + Audit-DB (best-effort, könnte selbst scheitern). DUAL-Gate fängt beide Pfade ab. |
| **BCRYPT_ROUNDS=4 in Test-Env** | Instrumentation-Warning nicht geloggt (NODE_ENV=test). `hashPassword` + DUMMY_HASH nutzen cost 4. Tests schneller. |
| **BCRYPT_ROUNDS=invalid** | `parseBcryptRounds` → default 12 + warning. Auth UND instrumentation loggen dieselbe Warnung (shared parser). |
| **BCRYPT_ROUNDS=20** | Clamp auf 15 + warning (DoS-prevention). |
| **BCRYPT_ROUNDS=3** | Clamp auf 4 + warning. |
| **Admin loggt sich mit Cost-12-Hash ein** (post-first-login) | `parseCost === BCRYPT_ROUNDS` → Rehash-Branch geskipped. Standard-Pfad. |
| **Admin hat Cost-11 nach Emergency-Rollback+Re-Upgrade** | `parseCost(11) < 12` → Rehash-Branch feuert. User migriert. |
| **Login mit malformed hash** | `parseCost` → `null` → Rehash-Branch geskipped. Login ok. |
| **Shared DB: Staging-Login vor Prod-Deploy** | Rehash passiert auf Staging. Prod-Code sieht `$2a$12$`. Keine 2. Audit. Genau 1 Event insgesamt. |
| **Concurrent login + account/PUT password-change** | Login SELECTed old_hash → forking rehash-fire-and-forget. account/PUT UPDATEd password auf user-chosen new hash. Rehash-UPDATE (WHERE password=$old_hash) findet neuen Hash, `rowCount=0`, kein Audit. Safe — user-chosen hash überschreibt nicht ungewollt. |

## Risks

- **Risiko 1: BCRYPT_ROUNDS=12 verdoppelt Login-Latenz (~200→400ms per bcrypt.compare).** Mitigation: Rehash fire-and-forget, Dummy-Hash gleiche Cost → Timing-Oracle dicht. DUMMY_HASH einmalig bei Boot.
- **Risiko 2: bcrypt.hashSync bei Modul-Load blockt Node-Event-Loop ~250ms.** Mitigation: Nur einmal bei Cold-Boot. Akzeptabel (nicht User-facing). **Edge-Runtime:** auth.ts wird NICHT von middleware.ts importiert (middleware nutzt jose direkt), daher kein Edge-Bundle-Block.
- **Risiko 3: Rehash-Fire-and-forget UPDATE DB-Pool-Exhaustion.** Mitigation: `pg`-Pool `max=10`. 1-Admin-System → unkritisch.
- **Risiko 4: SharedDB-Verifikation fühlt sich schwach an.** Mitigation: Snapshot vor Push + DUAL-Gate nach Login. DB-Count UND stdout-Logs beide grün.
- **Risiko 5: Codex findet weitere Race-Conditions im Rehash-Flow.** Mitigation: Medium-Scope, WHERE-Gate pattern-belegt. Bei Runde 3 `[Critical]` → Sprint-Split-Signal (unwahrscheinlich, da bereits gesplittet).
- **Risiko 6: BCRYPT_ROUNDS in host-env-files (`.env` auf server) fehlt nach Docker-Compose-Wiring.** Mitigation: `${BCRYPT_ROUNDS:-12}` Default-Syntax fängt absent-case ab. `.env.example` dokumentiert das Override.

## Sprint B Pointer (nicht diesen Sprint)

Nach Sprint A Merge + Deploy-Verify wird Sprint B separat geplant. Scope-Draft für Planner-Anruf:
- Neues Edge-safe Leaf-Modul `src/lib/auth-cookie.ts`: `SESSION_COOKIE_NAME = "__Host-session"` (prod) / `"session"` (dev).
- **Dual-Read-Phase** (30 Tage): `getSessionCookie(req)` liest `__Host-session` → fallback `session`. Write immer `__Host-session`. Logout clear beide Namen.
- **Observability-Counter** (patterns/auth.md:85-101): `auth_method_daily` table oder in-memory counter. Admin-Endpoint `GET /api/dashboard/audit/cookie-usage` → Legacy-cookie reads trending zu 0.
- **Flip-Kriterium**: `legacy_session_count == 0 seit 7 consecutive days UND cookie_session_count >= baseline`.
- **Nach Flip**: Dual-Read entfernen, nur `__Host-session` lesen.
- 7 Call-Sites umstellen: middleware, api-helpers, signups-audit, login (write), logout (clear both), account GET+PUT (read).
- `sameSite` bleibt `"strict"` (keine dokumentierte Produktanforderung für `"lax"`).

Dokumentiert in `memory/todo.md` als nächster Sprint nach Sprint A.
