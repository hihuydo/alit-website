# Sprint: Audit-Dashboard-View
<!-- Spec: tasks/spec.md v1 -->
<!-- Started: 2026-04-17 -->

## Done-Kriterien

### Schema + Migration
- [ ] `audit_events` Tabelle mit id / event / actor_email / entity_type / entity_id / details / ip / created_at
- [ ] Index (entity_type, entity_id, created_at DESC)
- [ ] Index (event, created_at DESC)
- [ ] Idempotent via `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS`

### Entity-Extraction Helper
- [ ] `src/lib/audit-entity.ts` mit pure `extractAuditEntity(event, details)` → `{ entity_type, entity_id }`
- [ ] Mapping für alle 7 bestehenden Events (signup_delete, membership_paid_toggle, account_change, login_*, logout, rate_limit)
- [ ] Unknown-event fallback → `{entity_type: null, entity_id: null}`

### `auditLog()` Extension
- [ ] Stdout-Log bleibt unverändert (first-source-of-truth)
- [ ] DB-Insert via fire-and-forget (`void persistAuditEvent(...).catch(err => console.error(...))`)
- [ ] Caller-Signature unverändert (sync void return)
- [ ] DB-Fail blockiert oder crasht niemals den caller

### API
- [ ] `GET /api/dashboard/audit/memberships/[id]` mit requireAuth
- [ ] validateId für id-Param
- [ ] SELECT ... WHERE entity_type='memberships' AND entity_id=$1 ORDER BY created_at DESC LIMIT 100
- [ ] Empty array bei 0 Events (nicht 404)

### UI: PaidHistoryModal
- [ ] Neue Component `PaidHistoryModal.tsx`
- [ ] On-open Fetch gegen Audit-API
- [ ] Event-Description-Mapping (paid=true → "Bezahlt markiert", paid=false → "Bezahlt-Status entfernt", signup_delete → "Eintrag gelöscht", fallback: JSON)
- [ ] Loading / Error / Empty states
- [ ] Nutzt bestehendes `Modal.tsx` (A11y-Pass aus PR #51)

### SignupsSection
- [ ] Neue Column "Verlauf" in Memberships-Tabelle
- [ ] Icon-Button (⏱ oder ähnlich) pro Row mit aria-label
- [ ] Klick setzt `historyTarget: MembershipRow | null`
- [ ] PaidHistoryModal rendert bei `historyTarget !== null`

### Tests
- [ ] `src/lib/audit-entity.test.ts` — 8+ Cases (jedes Event-Type + unknown)
- [ ] Bestehende 153 Tests grün
- [ ] `pnpm test` grün
- [ ] `pnpm build` grün

### Manuelle Smoke-Tests (Staging)
- [ ] **S1 Paid-Toggle History** — Toggle on + off → zwei Events in Modal (DESC sortiert, newest oben)
- [ ] **S2 Empty-State** — Verlauf für nie-toggled-Mitglied → "Noch keine Aktionen protokolliert."
- [ ] **S3 Stdout + DB Parität** — paar Toggles, dann `docker logs | grep paid_toggle | wc -l` vs `SELECT COUNT(*) FROM audit_events WHERE event='membership_paid_toggle'` → matchen
- [ ] **S4 DB-Fail-Safe** — DB-Connection temporär brechen (oder test-simulieren) → Toggle committet trotzdem, UI zeigt success, stderr hat "[audit] DB persist failed"
- [ ] **S5 A11y** — Modal-Focus-Trap, Escape, aria-labelledby intakt (aus Modal.tsx)

## Phases

### Phase 1 — Schema + Helper
- [ ] audit_events Tabelle in schema.ts
- [ ] audit-entity.ts + Tests

### Phase 2 — auditLog() Extension
- [ ] persistAuditEvent Helper
- [ ] Fire-and-forget Integration
- [ ] Bestehende callers verifizieren

### Phase 3 — API
- [ ] GET Route /api/dashboard/audit/memberships/[id]

### Phase 4 — UI
- [ ] PaidHistoryModal Component
- [ ] SignupsSection Verlauf-Column + State

### Phase 5 — Verify & Ship
- [ ] pnpm test + build
- [ ] Branch push → Sonnet pre-push
- [ ] PR → Codex Review (max 3 Runden)
- [ ] Staging-Deploy + Smoke S1-S5
- [ ] Merge → Prod-Verify

## Notes

- Sprint-6-Follow-up "Audit-Trail-Sicht im Dashboard" wird mit diesem Sprint geschlossen.
- Option 1+2 (Confirm-on-Untoggle + paid_at-Preserve) werden NICHT in diesem Sprint gemacht — Audit-View macht accidental-untoggle trivial recoverable. Als Nice-to-have in `memory/todo.md` (falls User es trotzdem will).
- Paid_at-Semantik bleibt "aktuell seit" (ungestresst diesem Sprint). "Wann wurde gezahlt" lebt im Audit-Log.
- Race-Lesson aus PR #54/55 NICHT relevant: diese Feature ist **read-only UI**, keine optimistic-updates, keine concurrent row-edit.
