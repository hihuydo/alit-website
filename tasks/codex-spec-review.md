# Codex Spec Review — 2026-04-17

## Scope
Spec: tasks/spec.md (T0-Security-Hardening Sprint)
Sprint Contract: 21 Done-Kriterien across 2 PRs
Basis: Sonnet qa-report.md = NEEDS WORK (pre-impl false-positive, expected)

## Findings

### [Contract] — Sprint-Contract-Verletzung oder fehlendes Must-Have

- Der Contract ist intern inkonsistent: `tasks/spec.md` sagt "21 Done-Kriterien", `tasks/todo.md` enthält unter `## Done-Kriterien` aber 27 Checkboxen (15 in PR 1, 12 in PR 2). Solange diese Zahl nicht stimmt, ist unklar, was exakt als Sprint-Abnahme gilt.

- PR 2 verlangt Staging- und Prod-Nachweise wie `exakt 1 password_rehashed` bzw. `0 rehash_failed`, ignoriert aber `memory/lessons.md`: Staging und Prod teilen dieselbe DB. Damit ist die Contract-Idee "PR 2 erst auf Staging verifizieren, dann sauber auf Prod" nicht isolierbar. Ein Staging-Login kann den einzigen Admin-Hash bereits in der gemeinsamen `admin_users`-Zeile auf Cost 12 heben und Audit-Events für Prod vorwegnehmen.

- PR 1 fordert nginx-Header-Verifikation auf Staging und Prod, aber im Repo existiert nur `nginx/alit.conf` für `alit.hihuydo.com`. Ein staging-spezifisches nginx-File oder ein gemeinsames Include ist nicht Teil des File-Plans. Damit fehlt im Contract ein Must-Have-Änderungsort für `staging.alit.hihuydo.com`; die Done-Kriterien setzen eine Konfigurationsquelle voraus, die der Spec nicht modelliert.

### [Correctness] — Technische Korrektheit / Edge Cases / Race Conditions

- Der vorgeschlagene Dotfile-Block `location ~ /\.(env|git|ht|DS_Store|svn)$` erfüllt die eigene Akzeptanz `/.git/HEAD -> 404` nicht. Das `$` matched nur einen Pfad, der genau auf `/.git` endet. `/.git/HEAD` läuft daran vorbei. Das ist kein Review-Nit, sondern eine konkrete Falsch-Spezifikation.

- Die Rehash-Race-Beschreibung ist unvollständig. `UPDATE ... WHERE id = $1 AND password = $2` verhindert zwar Lost-Update, aber zwei parallele Logins hashen mit unterschiedlichen Salts. Ergebnis: erster UPDATE gewinnt, zweiter wird `rowCount=0`. Die Spec definiert nicht, was dann audit-logisch passiert. Ohne explizite `rowCount === 1`-Gate kann der zweite Pfad fälschlich ebenfalls `password_rehashed` emitten; mit aktuellem Staging-Kriterium `exakt 1` wird der Test flaky.

- Die technische Aufteilung `login()` gibt aktuell nur ein JWT zurück (`src/lib/auth.ts`), der geplante Route-Hook in `src/app/api/auth/login/route.ts` braucht aber für `rehashPasswordIfStale(...)` mindestens `userId`, `currentHash` und das Klartext-Passwort. Die Spec nennt keinen Return-Type-Change für `login()` und keinen alternativen Datenpfad. So wie beschrieben passt der Hook nicht sauber auf die bestehende Architektur.

### [Security] — Security / Auth / Data Integrity

- Die nginx-Rollout-Reihenfolge ist für ein T0-Thema zu locker. `deploy.yml` macht beim Merge sofort Container-Deploy, die Spec sagt aber nginx-Änderung erst danach manuell per SSH + Reload. Das bedeutet einen realen Zeitraum, in dem neuer App-Code live ist, aber die geforderten T0-Header/Dotfile-Block noch nicht. Wenn das akzeptabel sein soll, muss die Spec das explizit als temporäres Residual-Risk freigeben; sauberer wäre: Merge/Prod-Abnahme blockieren, bis nginx synchronisiert ist.

- Die Spec übernimmt für `DUMMY_HASH` einen neu hardcodierten Cost-12-String, obwohl `patterns/auth.md` ausdrücklich ein dynamisches Dummy aus der aktiven Round-Konfiguration verlangt. Mit `BCRYPT_ROUNDS=4` im Test-Env oder einem Emergency-Rollback `<12` driftet der Dummy wieder vom echten Compare-Kostenprofil weg. Das ist ein Pattern-Verstoß und macht den Cost-Override inkonsistent.

### [Architecture] — Architektur-Smells mit konkretem Risk

- Die geplanten Audit-Events `password_rehashed` und `rehash_failed` sind im aktuellen Audit-Layer nicht vorgesehen (`src/lib/audit.ts` kennt sie nicht). Die Files-to-change-Liste für PR 2 vergisst diesen Kopplungspunkt. Ohne explizite Erweiterung von Audit-Typen und ggf. Tests ist der Auth-Plan nicht vollständig implementierbar.

- Die Cookie-Helper-Extraktion ist grundsätzlich passend, aber die Spec sollte explizit festhalten, dass `src/lib/auth-cookie.ts` ein Edge-sicheres Leaf-Modul bleiben muss: keine Node-Imports, keine DB/Auth-Abhängigkeiten, nur pure Konstanten/Helpers. `src/middleware.ts` läuft im Edge-Runtime; ein später "praktischer" Import aus `auth.ts` würde den Middleware-Build brechen. Diese Architekturgrenze ist im Plan derzeit nur implizit.

### [Nice-to-have] — Out-of-Scope, gehört nach memory/todo.md

- `SSL-Labs A oder A+` als hartes Done-Kriterium ist für diesen Sprint zu extern und nicht mechanisch kontrollierbar. Das ist sinnvoll als Ops-Nachkontrolle, aber kein guter Repo-Contract-Blocker; Scanner-Ergebnisse schwanken und prüfen mehr als die hier geplanten Änderungen.

## Verdict
NEEDS WORK

## Summary
11 findings — 3 Contract, 3 Correctness, 2 Security, 2 Architecture, 1 Nice-to-have.
