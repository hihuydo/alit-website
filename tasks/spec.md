# Spec: JWT_SECRET Fail-Mode-Normalisierung (Tier-1 Auth-Hardening)
<!-- Created: 2026-04-18 -->
<!-- Author: Planner (Claude) -->
<!-- Status: Draft -->

## Summary

Schließe die Fail-Mode-Lücke in `src/instrumentation.ts`: aktuell warnt `console.warn` nur bei fehlendem `JWT_SECRET` und lässt den Container trotzdem booten. Konsequenz: Login schlägt beim ersten Request mit kryptischem Fehler fehl. Fix: fail-fast am Boot via `throw` + min-length-32-Check — analog zu `IP_HASH_SALT`-Pattern im selben File. Tier-1 Auth-Hardening, Codex Sprint-B R2 #5.

## Context

**Aktueller Zustand (2026-04-18, post-B2c):**

- `src/instrumentation.ts:29-31` — JWT_SECRET check ist `console.warn + continue` (silent-degrade).
- `src/instrumentation.ts:33-40` — IP_HASH_SALT check ist `throw new Error` + min-length-16 (Reference-Pattern, funktioniert bereits in Prod).
- `src/lib/auth.ts:84-86` — `getJwtSecret()` throws bei missing Secret (Node-Path) — korrekt.
- `src/lib/auth-cookie.ts:25-27` — `getJwtSecret()` returns `null` fail-closed (Edge-Path) — korrekt.

Nach dem Fix: Container ohne (oder mit zu kurzem) JWT_SECRET bootet gar nicht mehr → keine silent-degrade-Route mehr, Fehler wird sofort sichtbar statt erst beim ersten Login.

**Relevante Patterns:**
- `patterns/nextjs.md` — eager env-validation für Salts/Secrets/Keys (crash-at-boot statt silent-degrade)
- `patterns/auth-hardening.md` — Tier-1 security hardening

## Requirements

### Must Have (Sprint Contract)

1. **Extrahierter pure Helper** `assertMinLengthEnv(name, value, minLength, purpose)` in neuer Datei `src/lib/env-guards.ts`:
   - Signature: `export function assertMinLengthEnv(name: string, value: string | undefined, minLength: number, purpose: string): asserts value is string`
   - Wirft `Error` mit konsistenter Message bei:
     - `value` undefined / empty / whitespace-only
     - `value.trim().length < minLength`
   - Error-Message enthält `name`, `minLength` und `purpose` — für diagnostische Klarheit
   - Bei valid-input: no return (assertion-Style, narrowt `value` auf `string` via `asserts value is string`)

2. **instrumentation.ts**: JWT_SECRET warn-only raus, Helper-Aufruf rein
   - Vor dem IP_HASH_SALT-Check eingefügt (analog dazu)
   - Call: `assertMinLengthEnv("JWT_SECRET", process.env.JWT_SECRET, 32, "JWT sign/verify")`
   - `console.warn`-Zeile + `if (!process.env.JWT_SECRET)`-Block komplett entfernt
   - Container-Bootverhalten: wenn JWT_SECRET fehlt oder <32 chars → `throw` vor DB-Bootstrap, Container startet nicht

3. **Tests** in neuer Datei `src/lib/env-guards.test.ts`:
   - **T1** — `assertMinLengthEnv("X", undefined, 32, "purpose")` wirft Error mit "X" + "32" + "purpose" in der Message
   - **T2** — `assertMinLengthEnv("X", "", 32, "purpose")` wirft Error (empty-string)
   - **T3** — `assertMinLengthEnv("X", "   ", 32, "purpose")` wirft Error (whitespace-only via trim)
   - **T4** — `assertMinLengthEnv("X", "a".repeat(31), 32, "purpose")` wirft Error (zu kurz)
   - **T5** — `assertMinLengthEnv("X", "a".repeat(32), 32, "purpose")` wirft NICHT (boundary-case)
   - **T6** — `assertMinLengthEnv("X", "a".repeat(100), 32, "purpose")` wirft NICHT (über minimum)

4. **Verifikation**:
   - `pnpm build` passes ohne TypeScript-Fehler
   - `pnpm test` ≥310 passing (304 baseline + mindestens 6 neue Tests)
   - `pnpm audit --prod` 0 HIGH/CRITICAL
   - **Staging-Deploy**: Container bootet (weil JWT_SECRET im staging .env ist und ≥32 chars)
   - **Defensiv-Check**: wenn lokal `pnpm build && JWT_SECRET='' node .next/standalone/server.js` ausführbar (oder `node -e "require('./src/instrumentation').register()"` mit gepatchtem env), dann Error-Trace mit `JWT_SECRET` + `32` + `sign/verify` erwartbar — nicht im Sprint Contract verlangt, aber Implementations-Sanity.

> **Wichtig:** Nur Must-Have-Items sind Teil des Sprint Contracts. Im Review hart durchgesetzt — alles außerhalb ist kein Merge-Blocker.

### Nice to Have (explicit follow-up, NOT this sprint)

1. **IP_HASH_SALT refactor** auf `assertMinLengthEnv("IP_HASH_SALT", ..., 16, "DSGVO IP-hashing")` — stilistisch konsistent, aber pure-Refactor ohne Behavior-Change. Landet als Follow-up in `memory/todo.md`.
2. **DATABASE_URL fail-fast** — aktuell `console.warn + return` (lässt bootstrap skippen). Edge-case für test-envs, aber in prod/staging könnte es via gleichem Helper (min-length irgendwas, purpose "DB connection") geforced werden. Nicht trivial weil manche test-configs ohne DATABASE_URL laufen — eigener Sprint.
3. **auth.ts `getJwtSecret()` null-return-Variante** für Konsistenz mit auth-cookie.ts — aktuell throw-at-access (Node-Path). Semantisch OK, aber stilistisch divergent. Explizit als Out-of-Scope im Codex R2 #5 geflaggt.

### Out of Scope

- Kein Refactor von IP_HASH_SALT (Nice-to-Have oben).
- Kein Touching von auth.ts / auth-cookie.ts — Node-Path throw vs Edge-Path null-return bleibt wie dokumentiert (spec.md Architecture Decision #9 aus Sprint B).
- Keine Env-Var-Umbenennung, keine Secret-Rotation.
- Kein Change an docker-compose.yml — JWT_SECRET steht dort schon korrekt propagiert.

## Technical Approach

### Files to Change

| File | Change Type | Description |
|------|-------------|-------------|
| `src/lib/env-guards.ts` | Create | Pure helper `assertMinLengthEnv(name, value, minLength, purpose)` mit assertion-return-type. |
| `src/lib/env-guards.test.ts` | Create | 6 Tests (T1-T6). |
| `src/instrumentation.ts` | Modify | warn-only-Block raus, `assertMinLengthEnv("JWT_SECRET", ...)` vor IP_HASH_SALT-Check. |

### Architecture Decisions

- **Pure-helper extrahieren** statt inline-throw in instrumentation.ts — macht den Check testbar ohne das ganze register()-Setup (DB-imports, env-mocks, async-side-effects) mitzumocken. Alternative (inline + vitest-setup mit mock für alle imports) verworfen: zu viel Test-Infra für einen 3-Zeilen-Check.

- **Helper bleibt generic** (`assertMinLengthEnv`) statt JWT-spezifisch (`assertJwtSecret`) — so können IP_HASH_SALT, potenzielle zukünftige Secrets etc. denselben Helper nutzen. Kosten: 2 mehr Argumente (name + purpose) statt hardcoded — trivial.

- **`asserts value is string` return-type** — TypeScript narrowt `value` nach dem Call auf `string`. Convenience für Caller (kein `!` oder ` ?? ""` nötig nach dem Assert).

- **`.trim()` vor length-check** — schützt gegen whitespace-only-Secrets (ein häufiger `.env`-Edge-Case wenn Secrets via CI/CD injected werden und accidentally `\n` anhängen).

- **Min-length 32** — Industry-Standard für HS256 JWT (≥ 256 bits entropy). Konsistent zum jose-Library Recommendations.

- **Helper placement**: `src/lib/` — kein separater `env/` subfolder, weil nur eine Funktion. Wenn später mehr Env-Utilities dazukommen, kann der File zu `env-guards.ts` mit mehreren exported functions wachsen.

### Dependencies

- **Keine neuen Deps.**
- **Keine Env-Vars-Änderungen** — `.env` + `.env.example` bleiben unverändert (JWT_SECRET existiert bereits und ist lange genug auf staging + prod).
- **Keine Migrations, keine API-Änderungen.**

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| `JWT_SECRET` nicht gesetzt | Container throws `Error("[instrumentation] FATAL: JWT_SECRET must be set and at least 32 chars — required for JWT sign/verify")` vor DB-bootstrap, startet nicht |
| `JWT_SECRET=""` (leer) | Same wie nicht gesetzt |
| `JWT_SECRET="   "` (nur whitespace) | Same wie nicht gesetzt — trim schlägt durch |
| `JWT_SECRET="a".repeat(31)` | throws — "at least 32 chars" erfüllt nicht |
| `JWT_SECRET="a".repeat(32)` | OK (boundary case) |
| `JWT_SECRET` valide + DB down | JWT-check passiert VOR IP_HASH_SALT-check + DB-bootstrap → JWT-check passt, IP_HASH_SALT-check passt, DB-retry-Loop kümmert sich um DB |
| Edge runtime (middleware.ts) | instrumentation.ts läuft nur in `NEXT_RUNTIME === "nodejs"` — Edge-Code bleibt unverändert (`auth-cookie.ts::getJwtSecret` returns null fail-closed) |

## Risks

- **Prod-Breakage bei Deploy wenn staging .env JWT_SECRET versehentlich kürzer als 32 chars**: aktuell läuft Staging mit silently-degraded JWT. Post-Deploy würde der Container nicht mehr booten. **Mitigation:** Pre-Deploy-Check — `ssh hd-server 'wc -c < /opt/apps/alit-website-staging/.env.JWT_SECRET_LINE'` ODER kurz `printenv JWT_SECRET | wc -c` im aktuellen Staging-Container. Wenn ≥32: deploy safe. Wenn <32: secret rotaten (neuer openssl rand) BEVOR der Fix deployed wird. Als Pre-Deploy-Audit-Schritt in Manual-Smoke.
- **CI bricht wenn Vitest-env kein JWT_SECRET hat**: Tests importieren `auth.ts` das auf JWT_SECRET zugreift. **Mitigation:** Vitest-config hat bereits JWT_SECRET gesetzt (für die 304 existierenden Tests). Pre-check: `grep JWT_SECRET vitest.config.ts` — falls nicht gesetzt, dem vitest-config hinzufügen.

## Pre-Deploy-Audit (Phase 0, vor Implementation)

**MUSS vor Phase 1 durchgeführt werden:**

1. `ssh hd-server 'docker exec alit-web printenv JWT_SECRET | wc -c'` → Zahl ≥ 33 (32 chars + newline). Wenn <33 chars: **STOPP, Secret rotieren**.
2. `ssh hd-server 'docker exec alit-staging printenv JWT_SECRET | wc -c'` → Zahl ≥ 33. Wenn <33: **STOPP, Secret rotieren**.
3. `grep JWT_SECRET vitest.config.ts` (lokal) → muss gesetzt sein mit ≥32 chars, sonst Vitest-Tests scheitern nach dem Fix.

Wenn alle 3 Checks grün sind: Phase 1 darf starten.
