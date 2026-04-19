# Codex Spec Review — 2026-04-19

## Scope
Spec: tasks/spec.md v2 (T1 Auth-Sprint S — Shared-Admin-Hardening)
Sprint Contract: 16 Done-Kriterien
Basis: Sonnet qa-report NEEDS WORK (structural — pre-impl commit, not real feedback)

## Findings

### [Contract] — Sprint-Contract-Verletzung oder fehlendes Must-Have
[Contract] — Decision B ist im Spec nicht konsistent durchgezogen. `tasks/spec.md` Summary sagt weiter "ein Login/Logout bumpt", Must-Have 7 sagt "Login bumpt, Logout bumpt", Decision C spricht von `tokenVersion (gerade gebumpt)`, und der Test-Block nennt weiter `auth.test.ts (login bumpt tv)`. Das widerspricht v2 ("Login liest nur, bump nur bei Logout") und macht Fehlimplementierung wahrscheinlich. Suggested fix: alle verbliebenen v1-Formulierungen auf "Login liest tv, Logout bumpt" harmonisieren, inkl. Summary, CSRF-Abschnitt, Decisions und Testbeschreibungen.

[Contract] — Die Auth-Boundary ist unvollständig spezifiziert. Der Contract fokussiert `requireAuth`, aber die aktuelle Codebase hat mit `src/app/api/dashboard/account/route.ts` einen Dashboard-Route-Handler, der `verifySessionDualRead` + `bumpCookieSource` inline nutzt und weder in `tasks/spec.md` Files-to-Change noch in `tasks/todo.md` Phase 2 auftaucht. Damit wäre DK-5/DK-9 formal "erfüllt", während ein echter Dashboard-Mutationspfad ohne tv-check/CSRF weiterlebt. Suggested fix: Contract explizit auf **alle** auth-geschützten Dashboard- und Auth-Mutationspfade erweitern und `account/route.ts` in Phase 2 aufnehmen oder auf shared helper konvergieren.

[Contract] — DK-12 ist nicht mechanisch hart genug testbar. Der `grep`-Gate in `tasks/todo.md` beweist weder "nur Mutations" noch "alle Call-Sites migriert", weil Multiline-`fetch`, Helper-Wrapping und GET-vs-Mutation nicht sauber unterschieden werden. Das ist als Sprint-Contract zu weich. Suggested fix: entweder explizite Datei-/Call-Site-Liste als verbindliches Inventory mit Review-Check, oder ein kleiner lint/test-Guard, der non-GET `fetch` unter `src/app/dashboard/` verbietet.

### [Correctness] — Technische Korrektheit / Edge Cases / Race Conditions
[Correctness] — Die CSRF-Error-Contract kollidiert mit der aktuellen Dashboard-Client-Form. Der Spec fordert exact-match plain-text bodies `"CSRF token missing"` / `"Invalid CSRF token"`, die bestehende UI liest aber an vielen Mutationsstellen `await res.json()` und erwartet `{ success, error }`. Wenn `dashboardFetch` nach dem Retry weiter einen 403 bubbelt, schlagen bestehende Error-Pfade fehl oder zeigen generische Netzwerkfehler. Suggested fix: entweder JSON-Fehlerhülle mit stabilem machine-code (`code: "csrf_missing" | "csrf_invalid"`) spezifizieren oder `dashboardFetch` muss den plain-text 403 intern in ein kompatibles Response/Error-Objekt übersetzen.

[Correctness] — Logout-/Mismatch-Semantik ist an den Rändern unterdefiniert. Der Spec definiert den happy path für atomisches Logout, aber nicht sauber, was bei `POST /api/auth/logout` ohne Session, mit deleted admin row, mit legacy JWT (`tv=0`) oder bei Layout-mismatch auf Dokument-Requests passieren soll. Aktuell würde ein stale-but-signature-valid Cookie weiter durch `proxy.ts` kommen und nur im Layout redirecten, ohne Cookie-Clear. Suggested fix: idempotente Logout-Semantik explizit festlegen (`200 + clear` vs `401 + clear`) und für Document-Request-mismatch einen klaren Clear/Redirect-Pfad oder bewusst dokumentiertes Verhalten ergänzen.

### [Security] — Security / Auth / Data Integrity
[Security] — Die größte versteckte Lücke ist die Shared-DB-Kopplung zwischen Staging und Prod. Seit 2026-04-18 sind `JWT_SECRET`s getrennt, `admin_users` ist aber shared. Damit wird `token_version` zum cross-environment state: ein Logout oder Smoke-Test auf Staging bump't dieselbe DB-Row, die Prod später prüft. Das bricht die "kein Mass-Logout bei Deploy"-Annahme aus Decision D und macht DK-16 Staging-Smoke potenziell zu einem Prod-Session-Invalidator. Suggested fix: diesen Sprint nicht mit einer globalen `admin_users.token_version` shippen, solange Auth-State env-übergreifend geteilt ist. Entweder separate Staging-DB vorziehen, env-scoped Session-Versionen modellieren, oder die Deploy-/Smoke-Reihenfolge plus Recovery-Plan explizit neu designen.

### [Architecture] — Architektur-Smells mit konkretem Risk (kein Nice-to-have)
[Architecture] — COOP/CORP ist im Problem-Statement Dashboard-Hardening, im Lösungsdesign aber nginx-global für die komplette Site. `Cross-Origin-Resource-Policy: same-origin` auf allen Antworten verändert auch das Verhalten von Public-Ressourcen und Media-URLs außerhalb des Dashboard-Scopes. Das ist kein reines Header-Tuning mehr, sondern ein site-weites Response-Policy-Change. Suggested fix: entweder Scope ehrlich auf "site-wide isolation hardening" erweitern und Public/Media-Kompatibilität als Muss verifizieren, oder die Header gezielt dort setzen, wo nur das Dashboard betroffen ist.

### [Nice-to-have] — Out-of-Scope, gehört nach memory/todo.md
[Nice-to-have] — Keine zusätzlichen Nice-to-have-Funde. Der bestehende Follow-up-Block in `tasks/spec.md` ist korrekt geparkt und sollte nicht zurück in den Sprint gezogen werden.

## Verdict
NEEDS WORK

## Summary
7 findings — 3 Contract, 2 Correctness, 1 Security, 1 Architecture, 0 Nice-to-have.
