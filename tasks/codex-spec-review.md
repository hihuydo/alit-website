# Codex Spec Review — 2026-04-17

## Scope
Spec: `tasks/spec.md` (T0-Auth-Hardening)
Sprint Contract: 30 Done-Kriterien from `tasks/todo.md`
Basis: Sonnet `qa-report.md` = NEEDS WORK (expected pre-impl state)

## Findings

### [Contract] — Sprint-Contract-Verletzung oder fehlendes Must-Have

- `BCRYPT_ROUNDS`-Wiring ist falsch eingestuft. Die Spec macht `BCRYPT_ROUNDS` zur Must-Have-Laufzeitkonfiguration und nennt `<12` explizit den Emergency-Rollback-Pfad (`tasks/spec.md:29-32`, `tasks/spec.md:70-71`), schiebt das Docker-Compose-Durchreichen aber in Nice-to-have (`tasks/spec.md:90-91`) und behauptet gleichzeitig "`BCRYPT_ROUNDS` env-var optional" (`tasks/spec.md:145`). In der realen Deploy-Config werden nur allowlistete Variablen in den Container gereicht; `BCRYPT_ROUNDS` fehlt in Prod und Staging komplett (`docker-compose.yml:8-15`, `docker-compose.staging.yml:8-15`). Damit ist der behauptete Rollback-Pfad nicht deploybar. Suggested fix: Compose-Wiring in Must-Have ziehen oder den Env-Override/rollback scope aus diesem Sprint streichen.

- Der Sprint-Contract ist nicht sauber generator-verifizierbar. Harte Done-Kriterien hängen an manuellen Browser-/DevTools-Schritten wie Cookie-Name/Attribute im Browser, Browser-Login-Smokes und Dev-Login-Smoke (`tasks/todo.md:29`, `tasks/todo.md:39`, `tasks/todo.md:84`, `tasks/todo.md:91`, `tasks/todo.md:105`). Das passt nicht zum beschriebenen Generator/Evaluator-Loop. Suggested fix: diese Punkte entweder in eine manuelle Release-Checklist verschieben oder ihnen je einen maschinell prüfbaren Nachweis hinzufügen.

### [Correctness] — Technische Korrektheit / Edge Cases / Race Conditions

- Der `rehash_failed`-Deploy-Gate ist als Spec formuliert, aber in der aktuellen Architektur nicht verlässlich. Die Spec verlangt `SELECT COUNT(*) ... WHERE event='rehash_failed' = 0` als harte Verifikation (`tasks/spec.md:84`, `tasks/todo.md:32`, `tasks/todo.md:42`). Gleichzeitig ist `audit.ts` explizit so gebaut, dass stdout die kanonische Quelle ist und die DB-Persistenz nur best-effort läuft (`src/lib/audit.ts:4-7`, `src/lib/audit.ts:66-69`). Genau der Failure-Mode, den die Spec selbst nennt (`DB-Outage` / Pool-Exhaustion, `tasks/spec.md:161`, `tasks/spec.md:177`), kann also den DB-Count sauber auf 0 lassen, obwohl `rehash_failed` real passiert ist. Suggested fix: DB-Count nur zusätzlich nutzen; der Gate muss auch strukturierte Logs prüfen.

- Der Prod-Cookie-Check ist technisch falsch beschrieben. Die Spec erwartet nach `curl -I -b session-cookie https://alit.hihuydo.com/dashboard/` einen `Set-Cookie: __Host-session`-Header (`tasks/spec.md:83`). Im aktuellen Code setzen nur Login und Logout Cookies (`src/app/api/auth/login/route.ts:57-64`, `src/app/api/auth/logout/route.ts:9-16`). Middleware und geschützte GET-Routen lesen Cookies nur (`src/middleware.ts:24-29`, `src/app/api/dashboard/account/route.ts:11-19`), sie refreshen oder migrieren nichts. Ein erfolgreicher Dashboard-GET ist daher kein valider Nachweis für `Set-Cookie`. Suggested fix: Cookie-Name/Attribute am Login-Response verifizieren, nicht an einem beliebigen Folge-GET.

- Die Boot-Observability driftet von der Runtime-Konfiguration. Die Spec will `parseBcryptRounds()` als zentrale Normalisierung in `auth.ts` (`tasks/spec.md:29-31`, `tasks/spec.md:116`) und prüft in `instrumentation.ts` gleichzeitig separat per `parseInt(process.env.BCRYPT_ROUNDS ?? "12", 10) < 12` (`tasks/spec.md:70-71`). Bei `notanumber`, Leerstring oder künftiger Clamp-Änderung warnen Boot und Runtime dann über unterschiedliche effektive Werte. Suggested fix: denselben Parser aus einem kleinen Shared-Leaf-Modul in Auth und Instrumentation verwenden.

### [Security] — Security / Auth / Data Integrity

- Die Cookie-Migration verletzt das dokumentierte Fallback-Removal-Pattern. `patterns/auth.md:85-101` fordert vor Entfernen eines Legacy-Fallbacks eine Observability-Phase mit konkretem Flip-Kriterium. Die Spec macht stattdessen einen harten Cutover ohne Dual-Read (`tasks/spec.md:106`, `tasks/spec.md:139`). Da der aktuelle Code überall genau einen Cookie-Namen liest (`src/middleware.ts:24`, `src/lib/api-helpers.ts:6`, `src/lib/signups-audit.ts:18`, `src/app/api/dashboard/account/route.ts:11`, `src/app/api/dashboard/account/route.ts:33`), ist das ein sofortiger Auth-Migrations-Flip ohne Messphase. Rollback ist ebenso asymmetrisch: sobald ein User `__Host-session` hat, strandet ein Revert auf `session` ihn wieder. Suggested fix: temporäres Dual-Read + Dual-Clear oder explizite Observability-/Rollback-Phase vor Entfernen des Legacy-Namens.

- `sameSite: "strict" → "lax"` ist im aktuellen Sprint ein Security-Relaxation-Change ohne belegten Produktzwang. Die Spec macht daraus Must-Have (`tasks/spec.md:58-60`, `tasks/spec.md:136`), obwohl der aktuelle Code bewusst `strict` setzt (`src/app/api/auth/login/route.ts:58-63`, `src/app/api/auth/logout/route.ts:10-15`) und die Projekt-Doku keinen externen Admin-Einstieg beschreibt, der diesen Relax zwingend braucht (`memory/project.md:54-59`). Für T0-Auth-Hardening ist das Scope-Erweiterung mit CSRF-/Session-Surface-Änderung. Suggested fix: `sameSite` in diesem Sprint unverändert lassen und nur ändern, wenn ein reproduzierter Navigations-Bug vorliegt.

### [Architecture] — Architektur-Smells mit konkretem Risk (kein Nice-to-have)

- Die Spec bündelt zwei verschiedene Migrationsklassen in einen Sprint: bcrypt-cost/rehash verändert persistenten DB-State in einer zwischen Staging und Prod geteilten DB (`tasks/spec.md:11-12`), die Cookie-Umstellung verändert aktiven Client-State und hat einen anderen Rollback-Pfad (`tasks/spec.md:55-62`, `tasks/spec.md:174`). Diese Kombination erhöht den Incident-Blast-Radius unnötig: ein Staging-Login migriert bereits den Prod-Hash, während die Cookie-Änderung gleichzeitig alle aktiven Sessions umstellt. Suggested fix: als zwei Rollouts behandeln oder besser splitten: (A) bcrypt/rehash/audit/boot warning, (B) Cookie-Migration mit eigener Observability- und Rollback-Strategie.

### [Nice-to-have] — Out-of-Scope, gehört nach memory/todo.md

- Das `sameSite: "lax"`-Thema gehört, falls überhaupt, in ein separates kleineres Auth-UX-Follow-up und nicht in denselben Must-Have-Block wie Cost-Bump, Timing-Oracle-Dummy und Rehash-on-Login (`tasks/spec.md:55-60`). Es ist weder nötig für `__Host-session` noch für `BCRYPT_ROUNDS`, erweitert aber die Auth-Policy-Diskussion deutlich. Suggested fix: aus dem Sprint-Contract nehmen und nur mit echter Repro wieder aufnehmen.

## Verdict
SPLIT RECOMMENDED

Split-Vorschlag:
1. Sprint A: `BCRYPT_ROUNDS`, dynamischer `DUMMY_HASH`, inline rehash-on-login, Audit-Event-Erweiterung, Boot-Warning, Compose-Wiring für `BCRYPT_ROUNDS`, verifizierbare Staging/Prod-Checks.
2. Sprint B: Cookie-Migration mit temporärem Dual-Read/Dual-Clear oder expliziter Observability-Phase; `sameSite` nur dann mitziehen, wenn dafür ein belegter Produktbedarf existiert.

## Summary
8 findings — 2 Contract, 3 Correctness, 2 Security, 1 Architecture, 1 Nice-to-have.
