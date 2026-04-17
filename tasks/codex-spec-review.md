# Codex Spec Review — 2026-04-17

## Scope
Spec: tasks/spec.md (T0-Auth-Hardening Sprint B — Cookie-Migration)
Sprint Contract: 11 Done-Kriterien
Basis: Sonnet qa-report.md verdict NEEDS WORK (expected for spec-only commit, not a real finding against spec design)

## Findings

### [Contract] — Sprint-Contract-Verletzung oder fehlendes Must-Have
- [Contract] Die Spec behauptet "Dual-Read", spezifiziert aber nur Name-Precedence, nicht Validity-Fallback. Mit dem geplanten API-Shape (`getSessionCookie()` liefert genau einen Token, danach `verifySession(token)`) scheitert der Request, wenn `__Host-session` vorhanden aber ungültig ist, obwohl ein gültiger Legacy-`session`-Cookie daneben liegt. Das ist genau der Migrationsfall, in dem Dual-Read Availability liefern muss. Der Contract braucht ein Must-Have wie: "primary zuerst verifizieren, bei verify-fail Legacy verifizieren", idealerweise als ein gemeinsamer Helper statt getrenntem `getSessionCookie()` + `verifySession()`.
- [Contract] Das Flip-Kriterium ist nicht mechanisch prüfbar definiert. `baseline_primary_daily_avg` ist im Spec nur qualitativ ("~5–20/Tag"), aber nirgends formalisiert, und die Metrik wird zusätzlich durch Self-Traffic des neuen Audit-Endpoints beeinflusst, wenn `requireAuth()` dort ebenfalls zählt. So kann "PASS" nicht eindeutig entschieden werden. Entweder baseline als feste Query/Referenzperiode definieren oder das Kriterium auf klare SQL-bare Bedingungen reduzieren.

### [Correctness] — Technische Korrektheit / Edge Cases / Race Conditions
- [Correctness] Der Counter wird laut Spec in `requireAuth` **und** in `resolveActorEmail` gebumpt. Das doppelt dieselbe authentifizierte Request-Kette auf allen Signups-Delete-/Bulk-Delete-/Paid-Toggle-Pfaden, weil diese Routen zuerst `requireAuth(req)` und danach `resolveActorEmail(req)` ausführen. Ergebnis: `primary`/`legacy`-Counts messen dann nicht "authentifizierte Requests", sondern eine route-abhängige Mischgröße. Der Bump muss genau einmal pro Request passieren.
- [Correctness] Das Datenmodell `auth_method_daily(date TEXT, ...)` passt nicht zur spezifizierten SQL. Sowohl `WHERE date >= current_date - 7` als auch `current_date - $days` setzen semantisch ein `DATE`-Feld voraus. Mit `TEXT` ist das entweder implizit-cast-abhängig oder schlicht falsch spezifiziert. Wenn die Queries Contract-relevant sind, sollte `date` als `DATE` definiert werden; andernfalls müssen alle Queries explizit casten und das Format des Textfelds hart festgelegt werden.

### [Security] — Security / Auth / Data Integrity
- [Security] Die heikelste Auth-Grenze im Migrationsfenster ist nicht vollständig abgesichert: "beide Cookies vorhanden, primary kaputt, legacy noch gültig". Ohne diesen Fallback kann ein fehlerhaft gesetzter `__Host-session`-Cookie eine noch gültige Legacy-Session effektiv maskieren und den Admin aussperren, obwohl der Rollback-/Dual-Read-Mechanismus genau das verhindern soll. Das ist kein UX-Detail, sondern ein Auth-Availability-Risiko im einzigen Admin-Zugangspfad (`middleware.ts` + alle Node-Auth-Helper).

### [Architecture] — Architektur-Smells mit konkretem Risk (kein Nice-to-have)
- [Architecture] Die Scope-Erzählung "7 Call-Sites" unterschätzt den realen Blast Radius. Sobald der Counter in `requireAuth()` landet, ändert Sprint B nicht nur 7 Stellen, sondern faktisch fast alle Dashboard-APIs, die `requireAuth` bereits konsumieren (`media`, `agenda`, `journal`, `projekte`, `signups`, Audit-Routes). Das ist architektonisch okay, aber die Spec benennt die Kopplung nicht und beschreibt die resultierende Metrik daher zu eng.
- [Architecture] `bumpCookieSource()` ist als reines fire-and-forget DB-Write ohne zweiten Sink spezifiziert. Anders als `auditLog()` gibt es keinen stdout-/audit-Fallback. Wenn diese Promise in einer Route nicht mehr flushen kann oder bei DB-Hickups swallowed wird, driftet die Observability genau in dem Mechanismus weg, der später den Flip entscheiden soll. Für einen Gate-Metric-Pfad ist das zu schwach spezifiziert; entweder Durability/Fallback ergänzen oder explizit akzeptieren, dass die Metrik nur best-effort ist und nicht allein den Flip entscheidet.

### [Nice-to-have] — Out-of-Scope, gehört nach memory/todo.md
- [Nice-to-have] Der neue Admin-JSON-Endpoint `/api/dashboard/audit/cookie-usage` wirkt für Sprint B nicht zwingend. Er erweitert die Dashboard-Oberfläche/API-Oberfläche, obwohl der eigentliche Must-Have die Counter-Erfassung und ein belastbares Flip-Gate ist. Für einen Single-Admin-Flow reicht eine dokumentierte SQL-/psql-Abfrage auf `auth_method_daily`; den Endpoint kann man sauber in Sprint C oder einen separaten Observability-Follow-up verschieben.

## Verdict
NEEDS WORK

## Summary
7 findings — 2 Contract, 2 Correctness, 1 Security, 2 Architecture, 1 Nice-to-have.
