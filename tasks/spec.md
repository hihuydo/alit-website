# Spec: Audit-Dashboard-View (Payment-History + generelle Admin-Aktionen)
<!-- Created: 2026-04-17 -->
<!-- Author: Planner (Claude Opus 4.7) -->
<!-- Status: Draft v1 -->

## Summary

Persistiert `auditLog()`-Events zusätzlich zu stdout in eine neue `audit_events`-DB-Tabelle und baut eine Read-Only-Historie-Ansicht pro Mitgliedschaft ins Dashboard. Primärer Trigger: accidental Untoggle des paid-Status (PR #54) darf kein permanent-verlorenes Bezahl-Datum mehr bedeuten — der Admin kann den tatsächlichen Original-Zeitpunkt im Audit sehen und bei Bedarf `paid_at` via Re-Toggle reconstruieren.

Sekundärer Value: generelle Audit-Trail-Sicht eliminiert die "wer hat was wann gelöscht" - Frage die aktuell nur via `docker logs` beantwortbar ist. Schließt Sprint-6-Follow-up "Audit-Trail-Sicht im Dashboard".

Keine neuen extern-sichtbaren API-Endpoints. Keine Änderung bestehender Audit-Event-Signaturen (backward compat). Bestehende stdout/docker-pickup bleibt — DB ist Sekundär-Sink.

## Context

- Aktuell: `auditLog(event, details)` in `src/lib/audit.ts` schreibt nur `console.log(JSON.stringify(...))`. Docker-Logging-Driver packt Events auf stdout. Keine Query-Möglichkeit aus App-Context.
- Events die bisher bestehen: `login_success`, `login_failure`, `logout`, `rate_limit`, `account_change`, `signup_delete`, `membership_paid_toggle`.
- `membership_paid_toggle` ist der kritische Case — `paid_at`-Semantik ist "aktuell seit", History = "wann wurde gezahlt" lebt implizit im Audit.

## Requirements

### Must Have (Sprint Contract)

1. **Neue Tabelle** `audit_events` (additive migration in `ensureSchema`, idempotent):
   ```sql
   CREATE TABLE IF NOT EXISTS audit_events (
     id           SERIAL PRIMARY KEY,
     event        TEXT NOT NULL,
     actor_email  TEXT,
     entity_type  TEXT,
     entity_id    INTEGER,
     details      JSONB NOT NULL DEFAULT '{}'::jsonb,
     ip_hash      TEXT,
     created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );
   CREATE INDEX IF NOT EXISTS audit_events_entity_idx
     ON audit_events (entity_type, entity_id, created_at DESC);
   CREATE INDEX IF NOT EXISTS audit_events_event_idx
     ON audit_events (event, created_at DESC);
   ```

2. **`auditLog()` erweitert** um DB-Insert, fire-and-forget:
   - Signature bleibt unverändert (sync void return).
   - Stdout-Log bleibt die first-source-of-truth bei DB-Down (unchanged).
   - DB-Insert via `void persistAuditEvent(...).catch((err) => console.error("[audit] DB persist failed", err))` — niemals den caller blocken oder crashen.
   - Entity-extraction aus `details` via `extractAuditEntity(event, details)`-Helper:
     - `signup_delete` → `entity_type = details.type` ("memberships" oder "newsletter"), `entity_id = details.row_id`.
     - `membership_paid_toggle` → `entity_type = "memberships"`, `entity_id = details.row_id`.
     - `account_change` → `entity_type = "admin"`, `entity_id = null` (keine row_id verfügbar).
     - `login_*` / `logout` / `rate_limit` → `entity_type = null`, `entity_id = null`.
   - Entity-extraction als pure Function, unit-testbar.
   - `ip_hash`: wenn `details.ip` gesetzt, gehe durch den bestehenden hash — nope, halt: aktuelle `auditLog`-Details haben `ip: string` (client-IP, NICHT gehashed). DB-Field heißt `ip_hash` aber wir speichern unverschlüsselt? Prüfen — wenn ja, Feld in DB lieber `ip_raw` oder so nennen. **Decision:** DB-Feld heißt `ip` (match stdout), wir lassen den bestehenden Contract in Ruhe. Raw IP ins DB, genau wie ins stdout. Aktueller Zustand bleibt konsistent.

3. **API-Endpoint** `GET /api/dashboard/audit/memberships/[id]`:
   - `requireAuth`-gated.
   - `validateId` für `id`.
   - `SELECT id, event, actor_email, details, ip, created_at FROM audit_events WHERE entity_type = 'memberships' AND entity_id = $1 ORDER BY created_at DESC LIMIT 100`.
   - Response: `{ success: true, data: AuditEvent[] }`.
   - Bei 0 Events: leeres Array, nicht 404.

4. **SignupsSection UI — Verlauf-Button + Modal:**
   - In der Memberships-Tabelle neue Column mit kleinem "Verlauf"-Icon-Button pro Row (clock-icon oder "⏱" / "🕐"; a11y-label "Verlauf für {Name}").
   - Klick → Modal mit Title "Verlauf: {Vorname} {Nachname}".
   - Modal fetcht `/api/dashboard/audit/memberships/:id` on-open, zeigt Events als vertikale Liste:
     - Format: `{formatDate(created_at)} · {actor_email || "—"} · {human-readable description}`
     - Description-Mapping (in Component):
       - `membership_paid_toggle` mit `details.paid === true` → "**Bezahlt** markiert"
       - `membership_paid_toggle` mit `details.paid === false` → "Bezahlt-Status **entfernt**"
       - `signup_delete` mit `details.type === "memberships"` → "Eintrag gelöscht" (Row existiert nicht mehr → wird eh nicht abgerufen, aber defensive mapping)
       - Andere events: fallback-Format `{event}: {JSON.stringify(details)}` (defensive)
   - Empty state: "Noch keine Aktionen protokolliert." (kann aktuell vorkommen weil Audit-History erst ab diesem Deploy startet — **explizit in Modal erwähnen** via Hint: "Protokoll-Start: {deploy-date}" wenn Liste empty).
   - Loading state: "Lädt..." während Fetch.
   - Error state: "Verlauf konnte nicht geladen werden." bei Fetch-Fail.
   - Modal nutzt bestehendes `Modal.tsx` + A11y-Pass aus PR #51.

5. **Tests (Vitest, pure logic):**
   - `extractAuditEntity`-Helper: eigene Datei `src/lib/audit-entity.ts` + `.test.ts`, decken alle 7 bestehenden Event-Types + unknown-event Fall ab.
   - Mindestens 8 Testcases.

6. **`pnpm test` + `pnpm build` grün, keine Regressionen (bestehende 153 Tests bleiben grün).**

### Nice to Have (Follow-up → memory/todo.md)

- Generisches Audit-Dashboard-Page (/dashboard/audit) mit Filter nach event / actor / entity_type / date-range — für projekt-übergreifende Audit-Durchsicht.
- Newsletter-Row Verlauf-Button (gleicher Pattern wie Memberships).
- Audit-Event Retention-Policy (cleanup alter Events > N Monate).
- Backfill aus stdout-Docker-Logs (wahrscheinlich nie nötig — fresh-start ist akzeptabel).
- WebSocket / SSE für Live-Audit-Updates (keine Real-time-Anforderung aktuell).

### Out of Scope

- **Bulk-Untoggle Protection** (Sprint-6-Follow-up, separate UX-Entscheidung) — Option 1 + 2 aus Diskussion. Nach diesem Sprint ist Bulk-Unoggle erholbar via History, deshalb nicht mehr dringend. Admin-Prompt before-untoggle als Nice-to-have Follow-up.
- **User-facing Audit** (auf Website für Anmelde-Historie etc.) — Admin-only.
- **Real-time** Updates — Modal fetcht on-open, reload = manueller Modal-Reopen.
- **Export als CSV** — eigener Follow-up wenn gebraucht.

## Technical Approach

### Files to Change

| File | Change Type | Description |
|------|-------------|-------------|
| `src/lib/schema.ts` | Modify | `CREATE TABLE IF NOT EXISTS audit_events` + 2 Indices (entity + event). Idempotent. |
| `src/lib/audit.ts` | Modify | Extend `auditLog()` um fire-and-forget DB-Insert via `persistAuditEvent` helper. Stdout-Log bleibt. |
| `src/lib/audit-entity.ts` | New | Pure function `extractAuditEntity(event, details)` → `{ entity_type: string\|null, entity_id: number\|null }`. Unit-testable. |
| `src/lib/audit-entity.test.ts` | New | 8+ Testcases. |
| `src/app/api/dashboard/audit/memberships/[id]/route.ts` | New | GET endpoint mit requireAuth + validateId. |
| `src/app/dashboard/components/PaidHistoryModal.tsx` | New | Standalone Modal, fetcht + rendert Events. Reused bestehendes `Modal.tsx` + dashboardStrings via i18n-Modul wenn sinnvoll. |
| `src/app/dashboard/components/SignupsSection.tsx` | Modify | Neue Spalte "Verlauf" mit Icon-Button + State für `historyTarget: MembershipRow \| null`. |

### Architecture Decisions

- **Fire-and-forget DB-Insert**: Audit bleibt informational. DB-Fail darf niemals den caller (signup-delete, paid-toggle, login) blocken oder crashen. Catch + `console.error` → stdout-log fängt es weiterhin ab. Audit ist immer mindestens so vollständig wie stdout — DB ist best-effort persistent-store.
- **Entity-extraction als separates Module**: separatation-of-concerns + trivially unit-testable. `auditLog` importiert + nutzt. Mapping-Regeln leben zentral, nicht inline in `auditLog`.
- **Pro-Row-Historie in Modal (nicht inline/aufklappbar)**: skaliert besser bei >5 Events pro Row, hält die Tabelle slim, nutzt das bestehende Modal-A11y-Pattern. Inline-Aufklappen wäre UX-lärmig.
- **Stdout bleibt first-source-of-truth**: bei DB-migration/restore/outage dürfen wir keine audit-events verlieren. Stdout → Docker-Log-Driver ist bereits eingerichtet. DB ist der zweite, query-fähige Store.
- **Keine Real-time-Updates**: Modal fetcht on-open. Beim Schließen + Öffnen passiert ein frischer Fetch. Reicht für Audit-Review-Use-Case.
- **LIMIT 100 pro Row**: realistischer cap, keine pagination-Anforderung in diesem Scope. Row mit >100 Events ist entweder massenhaft toggled (unwahrscheinlich) oder Bug-Indikator (Audit-Loop). Erste 100 sind die jüngsten.
- **Bestehende Events werden NICHT nachträglich persistiert**: History startet frisch ab diesem Deploy. Modal-Hint erklärt das bei empty state.

### Dependencies

- Intern: `Modal.tsx` (A11y-Pass PR #51), `requireAuth`, `validateId`, `pool`, bestehende `auditLog` Callers.
- Extern: keine neuen. Keine NEW Env-Vars. Keine Migrations-Manuelle-Schritte (idempotent).

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| DB-Insert fail (PG down, schema-mismatch) | `console.error("[audit] DB persist failed", err)` → stdout-log ist weiterhin da. Caller-Action committet normally. |
| unknown event passed to `auditLog` | `extractAuditEntity` returnt `{entity_type: null, entity_id: null}`. Insert geht trotzdem durch (event-Column erhält den String). Stdout-Log bleibt. |
| Modal geöffnet für Row ohne History | Empty list + Hint "Protokoll-Start ab {deploy-date}. Ältere Aktionen wurden nicht protokolliert." |
| Modal geöffnet für non-existing membership ID | API returnt empty array (WHERE entity_type AND entity_id matched nichts). UI zeigt empty-state hint. Kein 404. |
| Row wird gelöscht während History-Modal offen | User sieht noch die cached events. Kein Refetch. Row wird aus Parent-Table bei reload entfernt. Bei Modal-Reopen: empty state (mit delete-event NICHT sichtbar weil signup_delete speichert `entity_id = row_id` → er bleibt findbar für diese ID — BUT: UX-Konfusion weil "Eintrag gelöscht"-Event zeigt obwohl Zeile weg. Akzeptable edge case) |
| Concurrent paid-toggle Events in same tick | Audit-events reihen sich via sequential INSERTs auf. Jede hat distinctes `created_at` via PG NOW(). Bei exakt-gleichem Timestamp: id-order als tiebreak (SERIAL is monotone). |
| Event mit actor_email = null | "—" angezeigt. Kommt vor wenn session nicht-resolvable (edge case bei logout). |
| Event mit 1000-Zeichen-details | LIMIT 100 events heißt selten >100kB pro Modal-Response. Details-Column ist JSONB, kein size-limit im app-code. |
| iPhone-Viewport (Modal schmal) | Events sind single-column list mit word-wrap. Funktioniert. |

## Risks

- **Audit-DB-Failure masks action**: Wenn DB-Insert fehlgeschlägt aber action committet wurde (signup gelöscht, paid toggled), bleibt DB-audit unvollständig. Mitigation: stdout-log bleibt. Beim next DB-Recovery muss Admin stdout-logs konsultieren wenn history-gap auffällt. Dokumentiert. Nicht ship-blocker.
- **Audit-Table-Wachstum unbounded**: Für low-volume Signup-Site (< 100 Toggles / Tag) unproblematisch. Retention-Policy als Follow-up.
- **Privacy**: `actor_email` ist klar-text, `ip` ebenfalls (matched stdout). Keine zusätzliche DSGVO-Exposure gegenüber status quo. `ip` kann bei Bedarf später auf ip_hash migriert werden (eigener Sprint).
- **Migration-Konflikt**: additive, idempotent — kein Roll-back-Risk. Ältere Container-Versionen (ohne audit_events-Tabelle) crashen nicht, weil nur caller der DB-Table ist `audit.ts` selbst, und der ist graceful-degrade.

## Verification (Smoke Test Plan)

Nach Staging-Deploy:

1. **S1 Paid-Toggle History**: Mitglied bezahlt-toggled → Verlauf-Button klicken → Modal zeigt "{datetime} · {admin-email} · **Bezahlt** markiert". Toggle zurück auf unpaid → Verlauf neu öffnen → zweiter Eintrag "{datetime} · {admin-email} · Bezahlt-Status **entfernt**" oben.
2. **S2 Empty-State Hint**: Mitglied das noch nie toggled wurde → Verlauf → Modal zeigt "Noch keine Aktionen protokolliert." + Hint.
3. **S3 Docker-Log + DB-Parity**: `docker logs alit-web | grep membership_paid_toggle` UND gleichzeitig `SELECT COUNT(*) FROM audit_events WHERE event = 'membership_paid_toggle'` → Zahlen match (± race, aber asymptotisch gleich).
4. **S4 DB-Fail-Safe**: Psyql manuell stoppen → Membership-Paid-Toggle → Action committet trotzdem (UI zeigt success) → Logs zeigen "[audit] DB persist failed" stderr → DB restarten → next toggle wird normal in DB geschrieben.
5. **S5 Signup-Delete History**: Mitglied löschen (per-row-Delete Button) → vor delete: Verlauf-Modal zeigt signup_delete-Event NICHT (Row existiert noch). Nach delete: Row weg aus Dashboard, aber `SELECT * FROM audit_events WHERE event='signup_delete' AND entity_id=XX` zeigt event (mit actor + timestamp).
6. **S6 A11y**: Modal-Focus-Trap funktioniert (Tab cycelt innerhalb Modal), Escape schließt, aria-labelledby auf Title gesetzt (Carry-over aus PR #51 Modal).

## Deploy & Verify

Nach Merge:
1. CI grün (`gh run watch`)
2. `https://alit.hihuydo.com/api/health/` → 200
3. Staging + Prod: S1-S6 durchgehen
4. `docker compose logs --tail=30 alit-web` — keine neuen Fehler, vielleicht einige "[audit] DB persist" messages bei initial-deploy (Table noch nicht da → next restart ok)
5. Idempotenz-Check: `ensureSchema` ran again, no duplicate-index errors.
