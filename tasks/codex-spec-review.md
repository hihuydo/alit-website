# Codex Spec Review Round 2 — 2026-04-17

## Basis
Round 1: 7 findings (2 Contract, 2 Correctness, 1 Security, 2 Architecture, 1 Nice-to-have).
Round 2: v2 spec verifiziert gegen v1 findings + Suche nach Neu-Issues.

## Verification of Round 1 Findings

### #1 [Contract/Security] Dual-Verify
Status: FIXED
Kommentar: v2 behebt den Kernfehler sauber. `verifySessionDualRead(req)` ist jetzt als Verify-first/Fallback-verify spezifiziert, nicht nur als Name-Precedence (`tasks/spec.md:37-45`), und der kritische Migrationsfall `primary INVALID + legacy valid` ist sowohl im Testplan (`tasks/spec.md:75-86`) als auch in den Edge-Cases (`tasks/spec.md:199-205`) explizit abgedeckt. Das erzwingt die Korrektur in Prinzip und Sprache.

### #2 [Correctness] Single-Bump
Status: PARTIALLY FIXED
Kommentar: Der zentrale Fix ist in der Spec korrekt angelegt: Bump nur in `requireAuth` oder im Account-Inline-Verify, nie in `resolveActorEmail`, nie in middleware (`tasks/spec.md:52-64`, `tasks/spec.md:173-177`). Das adressiert den heutigen Double-Bump-Pfad aus `requireAuth(req)` plus `resolveActorEmail(req)` in den Signups-Routes (`src/lib/api-helpers.ts:5-14`, `src/lib/signups-audit.ts:14-29`, `src/app/api/dashboard/signups/[type]/[id]/route.ts:11-32`, `src/app/api/dashboard/signups/bulk-delete/route.ts:9-33`, `src/app/api/dashboard/signups/memberships/[id]/paid/route.ts:10-46`). Partial bleibt es, weil die v2-Tasks die Folgearbeit nicht vollständig und nicht mechanisch genug festnageln: `tasks/todo.md:63-66` erwähnt nur signups single + bulk, aber nicht den dritten realen `resolveActorEmail`-Call-Site im Paid-Toggle-Route, und die nötige `sub:string -> userId:number`-Konversion bleibt dort bewusst weich formuliert ("parseInt oder ... wie gehabt").

### #3 [Correctness] DATE statt TEXT
Status: FIXED
Kommentar: v2 zieht `auth_method_daily.date` auf `DATE NOT NULL` hoch (`tasks/spec.md:66-73`, `tasks/spec.md:142`), und der Sprint-Contract spiegelt das (`tasks/todo.md:16`, `tasks/todo.md:55`). Das beseitigt den ursprünglichen Cast-/Semantikfehler in den SQL-Beispielen in Prinzip und Contract.

### #4 [Architecture] Blast Radius / requireAuth-Signatur
Status: FIXED
Kommentar: v2 benennt jetzt ausdrücklich, dass die Änderung nicht bei 7 Cookie-Call-Sites stehen bleibt, sondern alle `requireAuth(req)`-Konsumenten im Dashboard trifft (`tasks/spec.md:57-58`, `tasks/spec.md:179-182`, `tasks/spec.md:149`). Das passt zur realen Repo-Lage: `requireAuth(req)` hängt aktuell an praktisch allen Dashboard-API-Routen, ohne exotische Sondermuster oder Double-Calls (`src/app/api/dashboard/**`, siehe `rg`-Treffer). Der Refactor ist daher groß, aber sauber refactorbar.

### #5 [Architecture] Counter-Fallback / Observability-Durability
Status: FIXED
Kommentar: Der zuvor fehlende zweite Sink ist jetzt klar spezifiziert. `bumpCookieSource()` soll DB-write fire-and-forget machen und bei Fehlern zusätzlich ein strukturiertes stdout-Event emittieren (`tasks/spec.md:70-73`, `tasks/spec.md:159-161`). Das ist konsistent mit dem bestehenden `auditLog()`-Pattern (`src/lib/audit.ts:1-61`). Für den Round-1-Punkt reicht das; die verbleibende Log-Flood-Frage ist eine neue Tradeoff-Frage, nicht derselbe Defekt.

### #6 [Contract] Flip-Kriterium mechanisch prüfbar
Status: PARTIALLY FIXED
Kommentar: v2 ist deutlich besser: Das qualitative Baseline-Kriterium ist ersetzt durch eine konkrete SQL-Query plus Entscheidungsregel (`tasks/spec.md:98-112`). Partial bleibt es, weil die Query/Regel noch nicht ganz sauber zusammenpasst: `date >= current_date - 7` beschreibt effektiv ein 8-Tage-Fenster, während Kommentar und Verdict von 7 Tagen/7 Zeilen sprechen, und die "OR: keine legacy-Zeile" Aussage ist nur kommentiert, aber nicht als eigener mechanischer Check formuliert. Das ist kein Round-1-Rückfall, aber das Gate ist noch nicht ganz scharf.

### #7 [Nice-to-have] Admin-Endpoint aus Sprint B
Status: FIXED
Kommentar: Der Endpoint ist klar aus Sprint B entfernt und als Sprint-C-/Follow-up-Thema markiert (`tasks/spec.md:114-120`, `tasks/spec.md:122-130`, `tasks/todo.md:93`). Das behebt die Scope-Aufblähung sauber.

## New Findings (only NEW issues introduced by v2 or missed in v1)

### [Contract] Legacy-Cookie-Persistenz nach Re-Login ist widersprüchlich spezifiziert
`setSessionCookie()` schreibt laut v2 nur den neuen Primary-Cookie (`tasks/spec.md:46`, `tasks/spec.md:146`), und `clearSessionCookies()` wird nur für Logout gefordert (`tasks/spec.md:47`, `tasks/spec.md:147`). Trotzdem verlangt der Staging-Check "nach Re-Login, kein `session`-Cookie" (`tasks/spec.md:96`, `tasks/todo.md:21`). Das folgt aus der beschriebenen Implementierung gerade nicht: Ein bereits vorhandener Legacy-`session`-Cookie bleibt bis Expiry oder Logout bestehen. Die Spec muss entweder Login auch Legacy clearen lassen, oder die Verifikation so formulieren, dass beide Cookies parallel existieren dürfen und nur `primary` gewinnen muss.

### [Correctness] `sub:string -> userId:number` ist nicht hart contractisiert
Die neue `resolveActorEmail(userId: number)`-Signatur ist richtig (`tasks/spec.md:53`, `tasks/spec.md:145`), aber die Umsetzungsvorschrift bleibt weich: `tasks/todo.md:65` erlaubt "parseInt oder die route-interne userId-Resolution wie gehabt". Das reicht nicht. Der JWT-Claim ist standardmäßig `string` (`src/lib/auth.ts:160`, `src/lib/auth.ts:169-177`), und die drei realen Call-Sites (`src/app/api/dashboard/signups/[type]/[id]/route.ts:12-32`, `src/app/api/dashboard/signups/bulk-delete/route.ts:10-33`, `src/app/api/dashboard/signups/memberships/[id]/paid/route.ts:11-46`) brauchen dieselbe, validierte Konversion. Ohne harte Vorgabe droht stilles `NaN`/loose-cast-Verhalten oder route-spezifische Abweichung.

### [Correctness] Flip-Query hat ein 8-Tage-Fenster, obwohl der Contract 7 Tage sagt
Die v2-Query nutzt `date >= current_date - 7` (`tasks/spec.md:107-108`). Das liefert inklusive heute bis zu 8 Kalendertage, nicht 7. Gleichzeitig verlangen Kommentar und Verdict "7 Zeilen" bzw. "7 Tage" (`tasks/spec.md:100-112`, `tasks/todo.md:19`). Für ein Deploy-Gate ist diese Art Off-by-one nicht kosmetisch; sie macht das PASS/FAIL-Kriterium unscharf.

### [Architecture] Task-Plan verfehlt einen realen `resolveActorEmail`-Call-Site
Die Spec-Prosa sagt allgemein, dass bestehende `resolveActorEmail`-Call-Sites die User-ID aus `requireAuth` bekommen (`tasks/spec.md:58`), aber der konkrete Task-Plan nennt nur signups single + bulk (`tasks/todo.md:65`). Im Repo gibt es noch einen dritten produktiven Call-Site in `src/app/api/dashboard/signups/memberships/[id]/paid/route.ts:46`. Das ist genau die Art Folgeimplikation, die beim Single-Bump-Fix nicht offen bleiben darf, weil sie sonst entweder den Build oder die Metrik-Disziplin wieder aufweicht.

### [Security] JWT-Secret-Fail-Mode driftet weiter zwischen Node- und Edge-Pfad
v2 akzeptiert in `auth-cookie.ts` ausdrücklich `JWT_SECRET missing -> null` (`tasks/spec.md:45`, `tasks/todo.md:31-42`), während das bestehende Node-Auth-Modul bei fehlendem Secret weiter wirft (`src/lib/auth.ts:83-86`), und `instrumentation.ts` warnt bei fehlendem Secret sogar nur statt fail-fast zu sein (`src/instrumentation.ts:24-31`). Mit der neuen Duplizierung von `getJwtSecret()` vergrößert v2 diesen Drift noch, ohne ihn zu normalisieren oder die im Projektkontext dokumentierte Mindestlänge von 32 Zeichen zu sichern (`CLAUDE.md`, `memory/project.md`). Das ist kein Blocker für den Cookie-Migrationsmechanismus selbst, aber ein neuer Security-/Contract-Schuldenpunkt der v2-Änderung.

## Verdict
NEEDS WORK

## Summary
- Round 1 findings: 5 fixed / 2 partial / 0 open
- New findings: 5
- Recommendation: v2 ist nah dran, aber vor Freigabe sollten die neuen Contract-Lücken geschlossen werden: Login-vs-Legacy-Cookie-Verhalten, harte `sub -> number`-Regel inkl. aller 3 `resolveActorEmail`-Call-Sites, die 7-Tage-Query präzise machen, und den JWT_SECRET-Fail-Mode zwischen Edge/Node nicht weiter auseinanderlaufen lassen.
