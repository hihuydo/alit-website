# Codex Spec Review R2 — 2026-04-19

## Scope
Spec: tasks/spec.md v3 (T1 Auth-Sprint S — Shared-Admin-Hardening)
Sprint Contract: 17 Done-Kriterien
Basis: R1 Verdict = NEEDS WORK, 7 findings; R2 verifies the fixes

## R1 Findings Verification

### [Contract-1] Decision-B (Login liest tv, Logout bumpt) consistency
RESOLVED.

Die in R1 genannten Hotspots sind jetzt konsistent:
- Summary: Login liest `token_version`, Logout bumpt.
- Must-Have-2/3/7/9/10: kein Login-Bump mehr, Logout-Bump ist der einzige Invalidation-Mechanismus.
- Decision B/C: Login liest nur, Logout invalidiert.
- Test-Block: `auth.test.ts` spricht von "login liest tv", nicht mehr von Login-Bump.

Es gibt noch einzelne Restformulierungen außerhalb dieser R1-Hotspots (`Legacy JWT ... valid bis nächster Login`, `Login mit korrektem Password + tv-Bump-DB-Error`), aber der konkrete R1-Fehler ist in den geforderten Kernstellen behoben.

### [Contract-2] `src/app/api/dashboard/account/route.ts` in Files-to-Change + Phase 2
RESOLVED.

`tasks/spec.md` führt `src/app/api/dashboard/account/route.ts` jetzt explizit in Files-to-Change, und `tasks/todo.md` zieht die Route in Phase 2 inkl. eigenem Test-Task hinein. Die Auth-Boundary ist damit nicht mehr stillschweigend unvollständig.

### [Contract-3] DK-12 weak grep-gate → explicit call-site inventory
RESOLVED.

`tasks/todo.md` enthält jetzt ein explizites per-file Inventory für die 19 non-GET Call-Sites plus Review-Hinweis für Multiline-`fetch`. Das ist deutlich härter und review-tauglicher als der alte reine grep-gate.

### [Correctness-1] CSRF-Error-Contract JSON `{code: csrf_missing|csrf_invalid}` statt plain text
RESOLVED.

Spec und Todo definieren jetzt konsistent 403-JSON mit `{ success, error, code }`, und `dashboardFetch` matcht auf `body.code`. Das passt zu den bestehenden `await res.json()`-Pfaden.

### [Correctness-2] Logout edge cases (no-session, deleted-row, legacy-JWT, layout-mismatch) explizit dokumentiert
PARTIAL.

Die Edge-Cases sind jetzt explizit angesprochen:
- no-session
- legacy JWT ohne `tv`
- TOCTOU dual-tab logout
- layout mismatch mit cookie-clear + redirect

Aber der deleted-row-Pfad ist intern nicht sauber aufgelöst:
- Must-Have-10 sagt: `200 + clear cookies` und "nothing to bump".
- Edge-Cases sagen: `requireAuth` bei deleted admin row → `401 + clear cookies`.
- Risks sagen: Logout kann per upsert sogar eine orphan row erzeugen und trotzdem `200 + clear` liefern.

R1 ist damit verbessert, aber nicht vollständig geschlossen.

### [Security-1] Shared staging/prod DB token_version cross-env state → env-scoped solution
RESOLVED.

v3 führt die env-scoped Lösung sauber ein:
- neue Table `admin_session_version(user_id, env, token_version)`
- Decision I dokumentiert den Shared-DB-Hintergrund
- DK-16 verlangt explizit einen Prod-Sanity-Check nach dem Staging-Smoke

Das adressiert den zentralen Cross-Env-Invalidation-Risk aus R1.

### [Architecture-1] COOP/CORP site-wide scope acknowledged + OG/media compat verification added
RESOLVED.

v3 benennt den Scope jetzt ehrlich als site-wide Change, erklärt die CORP-Implikation für Public/Media-Ressourcen und ergänzt DK-17 als Pflicht-Verifikation für OG/media-Kompatibilität.

## New Findings (if any)

### [Contract] — Must-Have numbering no longer matches the stated 17-DK sprint contract
`tasks/todo.md` definiert 17 Done-Kriterien (`DK-1` bis `DK-17`), aber `tasks/spec.md` listet im Must-Have-Block nur 15 Top-Level-Items: `1..14` und `17`. `DK-15 audit` wurde in Must-Have-13 hineingezogen, `DK-16 staging smoke` ist Must-Have-14, und `17` bleibt separat. Das ist kein reines Nummerierungsdetail: Spec und Todo beschreiben damit nicht mehr denselben Contract.

Suggested fix: Must-Have-Liste in `tasks/spec.md` wieder 1:1 auf `DK-1..DK-17` bringen oder im Scope/Header explizit sagen, dass Spec-Items und DKs nicht 1:1 nummeriert sind. In der aktuellen Form ist der Sprint-Contract formal inkonsistent.

### [Contract] — Ownership of `bumpTokenVersionForLogout` is inconsistent between spec and todo
v3 führt `src/lib/session-version.ts` neu ein, aber die Zuständigkeit ist nicht sauber harmonisiert:
- Files-to-Change in `tasks/spec.md` legt `bumpTokenVersionForLogout(...)` in `src/lib/auth.ts`.
- Gleichzeitig beschreibt `tasks/spec.md` `src/lib/session-version.ts` als Reader-only helper.
- `tasks/todo.md` legt dagegen **beide** helper (`getTokenVersion` und `bumpTokenVersionForLogout`) in `src/lib/session-version.ts` inkl. `session-version.test.ts`.

Das ist ein echter Contract-Drift, weil Phase 1/2, Test-Scope und Implementierungsort auseinanderlaufen. Gerade bei der neuen Helper-Aufteilung sollte das Spec einen einzigen Owner definieren.

Suggested fix: Eine Quelle wählen. Sauberster Schnitt wäre: `session-version.ts` owns read + bump, `auth.ts` konsumiert nur den Reader für Login.

### [Correctness] — deleted-admin-row / orphan-row path is still internally contradictory
v3 wollte den Logout-Randfall explizit dokumentieren, erzeugt jetzt aber drei verschiedene Verhaltensmodelle:
- Must-Have-10: deleted admin row => `200 + clear`, "nothing to bump"
- Edge-Cases: deleted admin row => `requireAuth` sees 0 rows => `401 + clear`
- Risks: deleted admin row => upsert can create orphan row => `200 + clear`

Dazu kommt die konkrete upsert-Form in Must-Have-3: bei fehlender `admin_session_version`-row insertet sie blind `token_version=1`; es gibt keinen Guard, der "deleted admin row" von "first logout after migration" trennt. Ohne zusätzliche admin-existence-Abfrage ist "nothing to bump" technisch gerade nicht durch das beschriebene SQL abgesichert.

Suggested fix: Den deleted-row-Fall einmal verbindlich entscheiden:
- entweder `logout` prüft Admin-Existenz explizit und schreibt dann **nie** in `admin_session_version`, oder
- orphan-row creation wird bewusst akzeptiert und Must-Have/Edge-Cases werden darauf harmonisiert.

### [Security] — Keine neuen Security-Findings über R1 hinaus
Keine zusätzlichen Security-Lücken gefunden, sobald die env-scoped `admin_session_version`-Lösung tatsächlich wie beschrieben umgesetzt wird.

### [Architecture] — Keine neuen Architecture-Findings über R1 hinaus
Keine zusätzlichen Architektur-Funde. Edge/Node-Split, env-scope und site-wide COOP/CORP sind in v3 grundsätzlich nachvollziehbar beschrieben.

### [Nice-to-have] — Some v1/v2 wording drift remains in non-contract sections
Ein paar Reststellen sind noch semantisch veraltet, aber eher Dokumentationshygiene als Merge-Blocker:
- `Legacy JWT ... valid bis nächster Login` sollte `... bis nächster Logout` heißen.
- `Login mit korrektem Password + tv-Bump-DB-Error` beschreibt einen Login-Bump, den v3 sonst gerade entfernt hat.
- Die Performance-Zeile nennt noch `SELECT token_version FROM admin_users`, obwohl v3 auf `admin_session_version` umgestellt hat.

Suggested fix: Diese Reste im Edge-Cases/Risks-Teil bereinigen, damit keine alten Implementierungsmodelle wieder hineinsickern.

## Verdict
NEEDS WORK

## Summary
5 R1-RESOLVED, 1 R1-PARTIAL, 0 R1-NOT-RESOLVED. New findings: 4 — 2 Contract, 1 Correctness, 0 Security, 0 Architecture, 1 Nice-to-have.
