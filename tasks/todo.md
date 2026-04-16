# Sprint: Paid-Toggle Safety (Confirm-on-Untoggle + paid_at-Preserve)
<!-- Spec: tasks/spec.md v1 -->
<!-- Started: 2026-04-17 -->

## Done-Kriterien

### SQL (Option 2 — paid_at Preserve)
- [ ] `src/app/api/dashboard/signups/memberships/[id]/paid/route.ts`: CASE-Branch `WHEN NOT $1 THEN NULL` entfernt
- [ ] Neue CASE-Formel: `paid_at = CASE WHEN $1 AND NOT paid THEN NOW() ELSE paid_at END`
- [ ] Comment aktualisiert (Preserve-Semantik + Verweis auf Confirm-Modal)

### UI (Option 1 — Confirm-on-Untoggle)
- [ ] `SignupsSection.tsx`: neue State `pendingUntoggle: MembershipRow | null`
- [ ] `togglePaid(row)` splittet: paid=true → openUntoggleConfirm, paid=false → direct
- [ ] `confirmUntoggle()` führt die PATCH-Logik aus (existing optimistic flow)
- [ ] Modal: Title "Bezahlt-Status entfernen?", Body mit Name + Preserve-Hinweis
- [ ] Buttons "Abbrechen" / "Status entfernen" (rot)
- [ ] `disableClose={patchInFlight}` während Request
- [ ] Orphan-cleanup in `reload()`: `pendingUntoggle` droppen wenn Row nicht mehr existiert
- [ ] Tooltip-Update: `paid=false && paid_at` → "Zuletzt bezahlt: {datetime}"

### Tests
- [ ] Bestehende 165 Tests grün
- [ ] `pnpm test` grün
- [ ] `pnpm build` grün

### Manuelle Smoke-Tests (Staging)
- [ ] **S1 OFF→ON** — unbezahlten Eintrag klicken → direkt toggled, kein Modal, Tooltip "Seit X"
- [ ] **S2 ON→OFF** — Modal erscheint, Abbrechen no-op, Bestätigen → paid=false, Tooltip "Zuletzt bezahlt: X"
- [ ] **S3 Re-Toggle** — nach Preserve: OFF→ON neu → Tooltip "Seit {NEW}"  (nicht preservierter Wert)
- [ ] **S4 DB-Preserve** — nach ON→OFF: `SELECT paid, paid_at FROM memberships` → paid=false, paid_at gesetzt
- [ ] **S5 A11y** — Tab im Modal, Escape schließt, aria-labelledby
- [ ] **S6 Concurrent** — Row A Modal + Row B direct-Toggle parallel

## Phases

### Phase 1 — SQL + Route-Comment
- [ ] Route-File ändern
- [ ] Build + Test

### Phase 2 — Modal + State in SignupsSection
- [ ] pendingUntoggle State
- [ ] togglePaid-Split
- [ ] confirmUntoggle Function
- [ ] Modal-Render
- [ ] Tooltip-Logic
- [ ] Orphan-Cleanup in reload()

### Phase 3 — Verify & Ship
- [ ] pnpm test + build
- [ ] Commit → post-commit Sonnet
- [ ] Branch push → pre-push Sonnet
- [ ] PR → Codex Review (max 3 Runden)
- [ ] Staging Smoke S1-S6
- [ ] Merge → Prod-Verify

## Notes

- Option 1 + 2 sind komplementär: Modal ist der UX-Gate vor dem Fehler, Preserve ist der Safety-Net danach. Beide in einem kleinen Sprint umsetzbar.
- Kein neuer Pure-Logic-Helper — zu lokal. Smoke-Tests decken Behavior.
- Race-Lesson aus PR #54/55 teilweise relevant: bei `confirmUntoggle` nutzen wir die bestehende `togglePaid`-Logic (mit single-flight + optimistic). Kein Neuerfinden der Toggle-Logic.
- User wünscht Option 1+2 als follow-up zu PR #56 (merged). Keine Rückwirkung auf PR #56.
