# Codex Spec Review Round 2 — 2026-04-15

## Scope
Spec: tasks/spec.md v2 (Spec: Dashboard-Tab "Mitgliedschaft & Newsletter" + Public Signup-Flow)
Sprint Contract: 21 Done-Kriterien
Basis: round-1 findings integrated + Sonnet qa-report.md verdict

## Round-1 Findings Verification
1. [VERIFIED] `seed.ts`-Drift behoben. v2 legt die neuen Tabellen explizit nur in `src/lib/schema.ts` an und verbietet Änderungen an `seed.ts`.
2. [VERIFIED] Startup-Fail für `IP_HASH_SALT` ist jetzt explizit in `src/instrumentation.ts` verankert, nicht mehr nur implizit über einen Lazy-Import.
3. [VERIFIED] Membership-Duplicate-Flow ist jetzt INSERT-first mit explizitem `23505 -> 409`, kein check-then-insert mehr.
4. [VERIFIED] E-Mail-Normalisierung ist jetzt als Must-Have vor allen Operationen festgeschrieben.
5. [VERIFIED] Delete-Semantik ist jetzt idempotent als `204 No Content` definiert.
6. [VERIFIED] Deterministische Sortierung `created_at DESC, id DESC` ist für Listen und Export explizit gefordert.
7. [VERIFIED] Auth-Guard-Naming ist korrigiert: v2 referenziert `requireAuth(req)`, nicht mehr eine nicht vorhandene Middleware.
8. [VERIFIED] Audit-Log-Vertrag wurde erweitert: Event-Union enthält `signup_delete`, Details-Shape wurde ergänzt.
9. [VERIFIED] Honeypot-Verhalten ist jetzt vollständig beschrieben: zählt ins Rate-Limit, kein DB-Insert, kein Audit-Log, Response 200.
10. [VERIFIED] i18n-Kopplung ist bereinigt: `dict` wird aus `Navigation.tsx` durchgereicht, kein neues `locale`-Prop.
11. [VERIFIED] A11y-Anforderungen sind ergänzt: explizite Labels und `aria-live`/`role="status"` sind Must-Have.
12. [VERIFIED] Dashboard-Fehleraggregation für den zusätzlichen Fetch ist jetzt explizit auf das bestehende Teilfehler-Pattern ausgerichtet.

## NEW Findings (only issues round-1 did not cover)
### [Contract]
1. Der Contract verlangt `consent_at`, beschreibt aber keinen expliziten Consent-Input im API-Vertrag. Für beide Public-POST-Endpunkte fehlt die Regel, dass ein required Consent-Boolean im Payload vorhanden und `true` sein muss; sonst kann ein direkter API-Client personenbezogene Daten ohne nachweisbare Einwilligung anlegen und der Server würde `consent_at` trotzdem setzen. Besonders beim Newsletter ist `consent_at` in der Tabellenbeschreibung nicht einmal als `NOT NULL` festgezogen. Das sollte als harter Contract ergänzt werden: `consent`/`privacy_consent` required, bei `false` oder fehlend -> 400 `invalid_input`, `consent_at=now()` nur bei validem Consent, Newsletter-`consent_at` ebenfalls `NOT NULL`.

### [Correctness]
Keine neuen Correctness-Findings.

### [Security]
1. Die Spec verlässt sich auf den bestehenden Helper `getClientIp`, aber der aktuelle Helper fällt noch auf `X-Forwarded-For` zurück (`src/lib/client-ip.ts`), während Projekt-Pattern und Spec-Kontext klar `X-Real-IP only hinter nginx` verlangen. Wenn v2 nur "bestehenden Helper verwenden" meint, erbt der Signup-Flow genau den Proxy-Trust-Drift, den die Patterns verbieten. Die Spec sollte daher explizit festlegen: für Rate-Limit, `ip_hash` und Audit im Signup-Flow nur `X-Real-IP`, kein XFF-Fallback.
2. CSV-Export berücksichtigt nur Delimiter-/Quote-Escaping, nicht Spreadsheet-Formula-Injection. Die Exportdaten kommen aus öffentlichen Formularen und sind damit attacker-controlled. Werte, die mit `=`, `+`, `-` oder `@` beginnen, werden in Excel/Numbers als Formel interpretiert. v2 braucht hier einen zusätzlichen Security-Contract für `src/lib/csv.ts`: solche Zellen vor dem Export neutralisieren, z.B. durch Präfix `'`.

### [Architecture]
1. `SignupsSection` übernimmt laut Spec nur `initial`-Daten aus `dashboard/page.tsx`, aber v2 schreibt das im Dashboard etablierte "Section refetch on mount"-Pattern nicht fest. Die bestehenden Sections reloaden beim Mount explizit, weil der Parent seine Initialdaten nur einmal lädt und Tab-Wechsel sonst stale State zeigen (`AgendaSection`, `JournalSection`, `AlitSection`). Ohne diese Vorgabe bekommt der neue Tab eine inkonsistente Daten-Frische gegenüber dem restlichen Dashboard. Das sollte im Spec ergänzt werden: `initial` nur First-Paint-Fallback, `SignupsSection` macht beim Mount ein eigenes `reload()`.

### [Nice-to-have]
Keine.

## Verdict
NEEDS WORK

## Summary
4 new findings — 1 Contract, 0 Correctness, 2 Security, 1 Architecture, 0 Nice-to-have.
