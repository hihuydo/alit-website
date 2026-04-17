# Sprint: Dashboard-i18n für Confirm-Modals
<!-- Spec: tasks/spec.md v1 -->
<!-- Started: 2026-04-17 -->

## Done-Kriterien

### i18n-Modul
- [ ] `src/app/dashboard/i18n.ts` um `deleteConfirm` erweitert (title/body-ReactNode/cancel/confirm)
- [ ] `bulkDelete` Block (title/bodyMemberships/bodyNewsletter als ReactNode-Functions/cancel/confirm/confirming)
- [ ] `paidUntoggle` Block (title/body-ReactNode/preserveHint/cancel/confirm/confirming)

### Wiring
- [ ] `DeleteConfirm.tsx` konsumiert `dashboardStrings.deleteConfirm`
- [ ] SignupsSection Bulk-Delete-Modal konsumiert `dashboardStrings.bulkDelete`
- [ ] SignupsSection Paid-Untoggle-Modal konsumiert `dashboardStrings.paidUntoggle`

### Tests
- [ ] Bestehende 165 Tests grün
- [ ] `pnpm test` grün
- [ ] `pnpm build` grün

### Manuelle Smoke-Tests (Staging)
- [ ] **S1 DeleteConfirm** — Row-Delete aus Agenda/Projekte/Alit/Journal/Signups → Text unverändert, Modal erscheint normal
- [ ] **S2 Bulk-Delete** — Memberships + Newsletter, beide Sub-Tabs, Plural-Text korrekt, "Lösche…" während POST
- [ ] **S3 Paid-Untoggle** — Modal-Text + Preserve-Hinweis + "Entferne…" während PATCH
- [ ] **S4 Grep-Clean** — `rg "Löschen bestätigen|Mehrere Einträge löschen|Bezahlt-Status entfernen" src/` matched nur `i18n.ts`

## Phases

### Phase 1 — i18n-Modul erweitern
- [ ] i18n.ts schreiben (3 neue Blöcke)

### Phase 2 — Caller wiring
- [ ] DeleteConfirm.tsx
- [ ] SignupsSection Bulk-Modal
- [ ] SignupsSection Paid-Untoggle-Modal

### Phase 3 — Verify & Ship
- [ ] pnpm test + build
- [ ] Commit → post-commit Sonnet
- [ ] Branch push → pre-push Sonnet
- [ ] PR → Codex Review (max 3 Runden)
- [ ] Staging Smoke S1-S4
- [ ] Merge → Prod-Verify

## Notes

- Pure String-Extraction, kein Behavior-Change, keine DB/API-Touches.
- Per-Modal-Scope für Button-Labels bewusst gewählt (gegen Cross-Reference-Rätseln).
- ReactNode-Body-Functions umgehen `dangerouslySetInnerHTML` — XSS-safe + cleane Caller.
- DE/FR-Struktur nicht jetzt — centralization reicht als Vorbereitung.
- Codex Weekly Review [Suggestion 2] follow-up.
