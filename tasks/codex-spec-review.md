# Codex Spec Review — 2026-04-15

## Scope
Spec: tasks/spec.md (Dashboard-Tab "Mitgliedschaft & Newsletter" + Public Signup-Flow)
Sprint Contract: 16 Done-Kriterien
Basis: Sonnet qa-report.md APPROVED

## Findings

### [Contract] — Sprint-Contract-Verletzung oder fehlendes Must-Have

1. `seed.ts` ist im Contract falsch als Tabellen-Migrations-Ort verankert. Die Must-Haves verlangen Tabellenanlage in `schema.ts` **und** `seed.ts` (`tasks/spec.md:55`, `tasks/todo.md:8`, `tasks/todo.md:28`), aber die aktuelle Architektur trennt Schema-Bootstrap und Seed klar: `instrumentation.ts` ruft `ensureSchema()` und danach `seedIfEmpty()` separat auf (`src/instrumentation.ts:40-46`), und `seed.ts` seeded nur Initialdaten (`src/lib/seed.ts:8-111`). Wenn der Generator dem Contract folgt, entsteht doppelte DDL-Verantwortung oder ein Anti-Pattern, das direkt gegen das bestehende Bootstrap-Modell läuft. Das gehört im Spec bereinigt auf: Tabellen nur in `schema.ts`, `seed.ts` unverändert oder höchstens bewusst ohne neue Inserts.

2. Das Done-Kriterium "`IP_HASH_SALT` fehlt in Env → sauberer Startup-Fehler" ist mit dem beschriebenen Plan nicht mechanisch gesichert. Der Spec schlägt nur ein neues `src/lib/ip-hash.ts` vor (`tasks/spec.md:80`, `tasks/todo.md:14`, `tasks/todo.md:29`), aber der aktuelle Startup-Pfad failt nur für Code, der während `register()` importiert/ausgeführt wird (`src/instrumentation.ts:21-49`). Wenn `ip-hash.ts` erst in den Signup-Routen verwendet wird, kommt der Fehler lazy beim ersten Request, nicht beim Startup. Das ist eine echte Contract-Lücke.

### [Correctness] — Technische Korrektheit / Edge Cases / Race Conditions

1. Die Duplicate-Strategie für Mitgliedschaften ist im Edge-Case-Text racy beschrieben. Der Spec sagt bei `newsletter_opt_in=true` und vorhandener Newsletter-Mail werde zuerst die Mitgliedschaft geprüft, dann der Newsletter-Insert gar nicht probiert (`tasks/spec.md:114`). Das klingt nach App-Level-Check vor Insert. Genau das ist laut Projekt-Patterns gefährlich; die korrekte Source of Truth ist die DB-Constraint plus explizites `23505`-Handling (`../patterns/auth.md`, Abschnitt "Check-then-Insert Races"; `../patterns/database.md`). Der Spec muss ausdrücklich verlangen: Membership-Insert ohne Vorab-SELECT versuchen, `UNIQUE(email)`-Verletzung als 409 mappen, optionalen Newsletter-Insert nur nach erfolgreichem Membership-Insert ausführen.

2. E-Mail-Normalisierung fehlt vollständig, obwohl die Contract-Semantik davon abhängt. Newsletter soll idempotent sein und Membership bei Duplicate 409 liefern (`tasks/spec.md:17-18`, `tasks/spec.md:34-35`), aber ohne `trim().toLowerCase()` vor Insert können `Test@Example.org` und `test@example.org` als zwei verschiedene Rows landen. Das ist kein UX-Detail, sondern bricht Datenintegrität und den Anti-Enumeration-Vertrag. Das Projekt hat bereits ein Normalisierungs-Pattern im Auth-Flow (`src/lib/auth.ts:5`, `src/lib/auth.ts:22`).

3. Der Delete-Flow spezifiziert keinen Umgang mit konkurrierenden oder wiederholten Deletes. `DELETE /api/dashboard/signups/:type/:id` ist Must-Have (`tasks/spec.md:49`), aber es fehlt die Semantik für "Row zwischen Listen-Load und Confirm schon gelöscht". Ohne Vorgabe drohen inkonsistente UX-Pfade: 500, stilles Success oder stale Refresh. Für DSGVO-relevante Löschungen sollte der Contract festlegen: `404 not_found` oder idempotentes `204`, plus UI-Refresh ohne Hard-Error.

4. Der Export- und Listen-Pfad definiert keine Pagination- oder Größen-Grenze, obwohl beide PII aggregieren. Für den aktuellen Datenumfang ist das wahrscheinlich noch tragbar, aber der Must-Have-Contract verlangt einen ungebremsten GET, der komplette PII-Listen als JSON und CSV zurückgibt (`tasks/spec.md:48-50`). Das ist funktional okay für klein, aber als Spec fehlt mindestens der Hinweis, dass beide Queries newest-first bleiben und bei leerer Liste/hoher Row-Zahl deterministisch bleiben müssen. Sonst ist die Reversibility bei späterem Wachstum schlechter als nötig.

### [Security] — Security / Auth / Data Integrity

1. Der Spec referenziert `authMiddleware` als bestehendes Dashboard-Schutzmuster (`tasks/spec.md:12`, `tasks/spec.md:48`, `tasks/spec.md:50`), im Code existiert aber aktuell `requireAuth(req)` pro Route (`src/lib/api-helpers.ts:4-15`, `src/app/api/dashboard/alit/route.ts:14-18`). Das ist mehr als Naming-Drift: Wer den Spec wortwörtlich umsetzt, sucht eine Middleware-Schicht, die es nicht gibt, statt dem bestehenden Route-Guard-Pattern zu folgen. Der Spec sollte auf `requireAuth` oder allgemeiner "bestehenden Dashboard-Auth-Guard" geändert werden.

2. Das aktuelle Audit-Modell reicht für Admin-Deletes nicht sauber aus. Der Spec verlangt Audit-Logs für Löschungen (`tasks/spec.md:49`), aber `auditLog()` kann heute nur `{ ip, email?, reason? }` loggen (`src/lib/audit.ts:5-17`). Für `signup_delete` fehlen mindestens `type`, `id` und idealerweise die Admin-Identität. Sonst ist der Log-Eintrag für spätere Forensik schwach und die Reversibility bei Fehlbedienung gering. Das ist ein Architektur- und Sicherheitsproblem, kein Nice-to-have.

3. Die Form-Spec behandelt DSGVO-Minimierung nur für IP-Hash, nicht für Response- und Log-Verhalten im Honeypot-Pfad. Zwar steht "silent 200 ohne DB-Insert" drin (`tasks/spec.md:42`, `tasks/spec.md:116`), aber nicht, ob dieser Pfad Rate-Limit zählen soll und ob intern überhaupt geloggt werden darf. Wenn Honeypot-Hits nicht limitiert werden, kann derselbe Angreifer billig Spam-Requests feuern; wenn sie voll geloggt werden, sammelt man wieder unnötig PII/Attacker-Daten. Das gehört explizit in den Contract.

### [Architecture] — Architektur-Smells mit konkretem Risk

1. Der Spec koppelt Form-i18n an neue `Locale-Props` für `NewsletterContent` und `MitgliedschaftContent` (`tasks/spec.md:93-94`), aber die Komponenten werden heute parameterlos aus `Navigation.tsx` gerendert (`src/components/Navigation.tsx:67-77`). Gleichzeitig existiert schon ein Dictionary-System, das in dieser Komponente verfügbar ist (`src/components/Navigation.tsx:62`, `src/i18n/dictionaries.ts:3-56`). Ein zusätzlicher Locale-Prop ist unnötige Coupling-Fläche. Sauberer ist: `dict` oder ein kleines `messages`-Objekt aus `Navigation` durchreichen, nicht Locale doppelt im Tree verteilen.

2. Die Spec bleibt bei Placeholder-getriebenen Formularen und erwähnt nur FR-Labels/Texte, nicht echte zugängliche Labels oder Live-Regionen (`tasks/spec.md:21`, `tasks/spec.md:40-42`). Die bestehenden Forms haben faktisch nur Placeholder und Checkbox-Text (`src/components/nav-content/NewsletterContent.tsx:21-56`, `src/components/nav-content/MitgliedschaftContent.tsx:21-61`). Wenn die Success/Error-States jetzt eingeführt werden, ohne `aria-live` und ohne explizite Labels, wird ein bestehendes A11y-Defizit in neue Flows festgeschrieben. Das sollte als Cross-Cutting Must-Have ergänzt werden, nicht später.

3. Der Dashboard-Tab erweitert einen bereits clientseitig aggregierten Multi-Fetch-Screen (`src/app/dashboard/page.tsx:30-60`). Der Spec sagt nur "Fetch parallelisiert zu bestehenden" (`tasks/todo.md:44`), aber nicht, wie Fehleraggregation für einen sechsten API-Call weitergeführt wird. Der aktuelle Screen zeigt Teilfehler gesammelt an. Ohne explizite Vorgabe landet `signups` leicht in einem Sonderpfad mit anderer Fehler-UX oder blockiert den gesamten Dashboard-Load. Das ist ein kleiner, aber realer Architektur-Fit-Gap.

### [Nice-to-have] — Out-of-Scope, gehört nach memory/todo.md

1. "FR-Field-Labels" sind Must-Have und richtig. Ein vollständiger sprachlicher Feinschliff aller langen erklärenden Form-Texte auf FR ist dagegen kein Merge-Blocker, solange die Kern-Labels, Checkbox-Texte, Success/Error-Meldungen und CTA korrekt übersetzt sind. Wenn Zeitdruck entsteht, sollte stilistische Copy-Politur nach `memory/todo.md`, nicht den Sprint blockieren.

## Verdict
NEEDS WORK

## Summary
13 findings — 2 Contract, 4 Correctness, 3 Security, 3 Architecture, 1 Nice-to-have.
