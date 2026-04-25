# Sprint C — Cookie-Migration Phase 2 (Dual-Verify-Removal)

<!-- Created: 2026-04-25 -->
<!-- Author: Planner (Claude) -->

**Trigger:** Flip-Gate erfüllt — letzter prod-`legacy`-Hit war 2026-04-18; seitdem 7 Tage ohne legacy auf prod (`auth_method_daily WHERE env='prod' AND date >= 2026-04-19` zeigt nur `source='primary'`).

## Goal

Den Sprint-B Migration-Scaffold abbauen. `__Host-session` ist seit 2026-04-18 in prod der einzige aktiv genutzte Session-Cookie-Name; alle Legacy-`session`-Cookies sind längst expired (24h JWT-TTL). Code liest, schreibt und cleart aktuell trotzdem noch beide Namen — totes Gewicht das das Auth-Modul schwerer zu lesen macht.

## Scope — Must-Have

### 1. `src/lib/auth-cookie.ts` — Legacy-Pfad eliminieren

- `LEGACY_COOKIE_NAME` Export entfernen (komplett, nicht nur deprecaten — Cleanup-Sprint).
- `verifySessionDualRead` umbenennen zu `verifySession`. Body simplifiziert: nur `SESSION_COOKIE_NAME` lesen, kein Legacy-Fallback.
- `SessionReadResult` Type: `source`-Feld droppen.
- `setSessionCookie` Body: zweiten `res.cookies.set(LEGACY_COOKIE_NAME, "", ...)` Block entfernen.
- `clearSessionCookies` Body: zweiten Legacy-Clear-Block entfernen.
- jsdoc-Header umschreiben — Sprint-B-Migration-Erwähnung raus, Sprint-T1-S-Pflicht-Invariante (Edge-safe + JWT_ALGORITHMS pinned + `__Host-` clear via `.set(...)`) bleibt.

### 2. `src/lib/api-helpers.ts` — Counter weg

- `bumpCookieSource` Import + Call entfernen.
- `AuthContext` Type: `source`-Feld droppen.
- `verifySessionDualRead` → `verifySession` Import-Update.
- jsdoc Side-Effect-Note („bumps the Sprint-B cookie-source counter…") streichen.

### 3. `src/proxy.ts` — Import + Type-Use

- `verifySessionDualRead` → `verifySession` Import-Update.
- `verifySession` Return-Wert wird nur als truthy-Check benutzt (`if (!session)`) → kein weiterer Code-Change.

### 4. `src/app/dashboard/(authed)/layout.tsx` — Legacy-Cookie-Read raus

- Inline-Dual-Read-Schleife (Zeilen ~46–84) ersetzen mit single-cookie-read. Layout läuft in Node-Runtime mit `cookies()` von `next/headers`; `auth-cookie.ts` exportiert Helper für Edge-Runtime mit `req.cookies` von `NextRequest`. Inline-Simplifikation ist sauber — nur primary `SESSION_COOKIE_NAME` lesen, JWT-verify pipeline beibehalten (mit `tv`-Validation), Legacy-Fallback-Loop entfernen.
- `LEGACY_COOKIE_NAME` Import entfernen.

### 5. `src/lib/cookie-counter.ts` — Modul löschen

- File entfernen (`git rm`). Keine Re-Exports nötig.

### 6. `src/lib/schema.ts` — Comment-Update, Table NICHT droppen

- `auth_method_daily` CREATE TABLE bleibt (idempotent, kein Harm).
- Comment-Block oben aktualisieren: „Sprint B observability — no longer written as of Sprint C (2026-04-25). Historical data retained. Drop in a follow-up sprint via `ALTER TABLE … DROP` once we're sure no analytics consumer reads it."
- **Begründung:** shared-DB-Pattern (siehe PR #106→#108): Code-Pfad zuerst, Schema bleibt. DROP TABLE wäre Phase 2.

### 7. Test-Updates

- `src/lib/auth-cookie.test.ts` — `verifySessionDualRead` → `verifySession` Tests, Legacy-Fallback-Cases entfernen (waren Pflicht in Sprint B, jetzt obsolet).
- 20 Test-Files mit `bumpCookieSource: vi.fn()` Mock — Mock-Zeile entfernen.
- `src/proxy.test.ts` — `verifySessionDualRead` → `verifySession` Mock-Name aktualisieren.
- Layout-Test (falls vorhanden) — analog.

### 8. Comment-Cleanup

Files die das Sprint-B-Pattern erwähnen, Update auf single-cookie-Realität:
- `src/lib/runtime-env.ts`
- `src/lib/csp.ts` (Edge-safe-Module-Liste)
- `src/lib/signups-audit.ts`
- `src/app/api/dashboard/account/route.ts`

## Scope — Nice-to-Have (out of scope)

→ als Follow-up in `memory/todo.md`:
- `auth_method_daily` Table dropping — Phase 2 nach Soak-Period (ein Monat).
- Admin-UI-Endpoint `GET /api/dashboard/audit/cookie-usage` (Sprint B Codex R1 #7) — Counter ist tot, Use-Case obsolet.

## Files Touched

| File | Action |
|---|---|
| `src/lib/auth-cookie.ts` | Modify (~50 LOC delta) |
| `src/lib/api-helpers.ts` | Modify (3 spots) |
| `src/proxy.ts` | Modify (1 import) |
| `src/app/dashboard/(authed)/layout.tsx` | Modify (~10 LOC simplification) |
| `src/lib/schema.ts` | Modify (comment only) |
| `src/lib/cookie-counter.ts` | Delete |
| `src/lib/auth-cookie.test.ts` | Modify |
| `src/lib/runtime-env.ts` | Modify (comment) |
| `src/lib/csp.ts` | Modify (comment) |
| `src/lib/signups-audit.ts` | Modify (comment) |
| `src/app/api/dashboard/account/route.ts` | Modify (comment) |
| `src/proxy.test.ts` | Modify |
| 20× `src/app/api/.../route.test.ts` | Modify (drop `bumpCookieSource` mock line) |

## Done-Kriterien (mechanical, pre-push verifizierbar)

1. `pnpm build` passes — keine TS-Errors, keine "unused import" warnings.
2. `pnpm test` passes — Test-Count ≥ pre-sprint count minus deleted legacy-fallback assertions. Erwartung: 655 → ~648.
3. **Grep-checks (kein Match):**
   - `grep -rn "LEGACY_COOKIE_NAME" src/` → leer
   - `grep -rn "verifySessionDualRead" src/` → leer
   - `grep -rn "bumpCookieSource" src/` → leer
   - `grep -rn "cookie-counter" src/` → leer (außer evt. CHANGELOG-Stil-Comments)
4. `pnpm audit --prod` — 0 HIGH/CRITICAL.
5. Edge-safety self-test in `auth-cookie.test.ts` läuft weiter (regex-grep auf Datei-Inhalt gegen Node-only-Imports).

## PMC (Post-Merge Criteria, manuell auf Staging UND Prod)

1. **CI Deploy grün** auf beiden Branches (Staging-Push + Prod-Merge).
2. **`/api/health/` 200** auf staging + prod nach Deploy.
3. **Login-Flow funktioniert auf Staging:** Browser → `/dashboard/login/` → Email + PW → Redirect → Mutation klicken (Agenda-Title editieren + speichern) → erwartet 200.
4. **Login-Flow funktioniert auf Prod:** identisch.
5. **`docker compose logs --tail=50 alit-web`** clean — keine Errors, keine `[cookie-counter]` Warnungen.
6. **DB-Sanity:** `SELECT date, source, count FROM auth_method_daily WHERE date >= current_date - 1` zeigt **keine neuen Rows** seit dem Deploy. Bestehende Historical-Rows bleiben.

## Pre-Deploy-Audit (Phase 0)

- **Shared-DB-Risk:** prod + staging teilen die DB. Sprint C Code-Deploy schreibt nicht mehr in `auth_method_daily`. Alter prod-Container schreibt noch (vor Merge) — kein Konflikt weil INSERT … ON CONFLICT DO UPDATE idempotent ist. **Risk: gering.**
- **Cookie-Backward-Compat:** ein User mit aktivem Legacy-Cookie aus Sprint-B-Zeit — der Cookie heißt `__Host-session` oder `session`. Letzter legacy-Hit war 2026-04-18 (vor 7 Tagen), 24h-JWT-TTL → alle solchen Cookies seit 6 Tagen expired. **Risk: null.**
- **Pre-Deploy:** aktuelle prod `__Host-session` Cookies bleiben gültig (gleicher Name + JWT_SECRET unverändert). Re-Login nicht erforderlich.

## Risk Matrix

| Risk | Impact | Mitigation |
|---|---|---|
| Active user mit Legacy-Cookie wird ausgeloggt | NULL — alle 24h-JWTs vom 18.04. längst expired | n/a |
| Test-Mock-Drop bricht non-related Tests | Klein — Mock-Zeile ist ungenutzt | Test-Suite pre-push |
| Cookie-Counter-Delete bricht imports | Klein — 7 callsites im selben PR migriert | `pnpm build` pre-push |
| Schema-Comment-Edit triggert Re-Migration | Null — `CREATE TABLE IF NOT EXISTS` idempotent | n/a |
| Performance-Regression durch entfernten Counter | Negativ-Risk — weniger Code = leichter Auth-Path | Beobachten in Logs |

## Codex Spec-Review

Klein-mittel-Sprint, ~13 Files, Cleanup-Charakter, hohe Test-Coverage. **Spec-Review optional** — Sonnet post-commit Evaluator entscheidet automatisch. PR-Review mit Codex Pflicht (autonom).

## Architektur-Decisions

- **Rename `verifySessionDualRead` → `verifySession`** statt Bibehaltung des Misnomer-Namens: Sprint C ist Cleanup-Sprint, Aufräumen ist der Punkt. ~7 Imports zu touchen ist akzeptabel.
- **`auth_method_daily` Table behalten, nicht droppen:** shared-DB Phase-Pattern (PR #106→#108 Stil). Phase 1 = Code-Stop-Writes, Phase 2 (eigener Sprint) = DROP. Defensive gegen Soak-Period-Issues.
- **Layout (`(authed)/layout.tsx`) inline simplifiziert** statt `verifySession()` aus `auth-cookie.ts` aufzurufen: Layout läuft in Node-Runtime mit `cookies()` von `next/headers`, `auth-cookie.ts` ist Edge-safe und nutzt `req.cookies` von `NextRequest`. Gemeinsame Helper-Function würde Edge/Node-Runtime-Abstraktion brauchen — out of scope.
- **`source: "primary" | "legacy"` Type-Drop ist breaking** für interne Callsites (alle 20 Test-Files droppen die Mock-Zeile, alle Code-Callsites sind im selben PR migriert) — kein Public-API-Impact.
