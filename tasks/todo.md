# Sprint: Dirty-Polish (AccountSection + Autosave-Flush-on-Stay)
<!-- Spec: tasks/spec.md v2 (post Codex Spec-Review R1) -->
<!-- Started: 2026-04-16 -->
<!-- Revised: 2026-04-16 — Codex R1 findings integrated (Flush-Semantik, Fetch-Race, try/catch, selektiver Flush, mechanische Testbarkeit) -->

## Done-Kriterien
> Alle müssen PASS sein bevor der Sprint als fertig gilt.

### DirtyContext API
- [ ] `DirtyKey` union erweitert zu `"agenda" | "journal" | "projekte" | "alit" | "account"`; Governance-Kommentar: "Neuer Tab = neuer Key + Section-Wiring. Editoren mit Autosave MÜSSEN registerFlushHandler nutzen."
- [ ] `useDirty()` Rückgabewert enthält neu `registerFlushHandler: (key: DirtyKey, fn: () => void) => () => void`.
- [ ] Provider hält Handler-Map (ref-based, single fn pro key, newest-wins).
- [ ] Unregister-Fn ist idempotent: setzt Map-Entry nur auf null wenn stored ref === übergebene fn.

### Flush-Semantik
- [ ] **Flush läuft NUR bei "Zurück"** (im `closeConfirm`), **NICHT** bei "Verwerfen" (`handleDiscard`).
- [ ] **Selektiver Flush**: Provider ruft nur Handler auf für Keys mit `dirtyRef.current[key] === true`.
- [ ] **try/catch pro Handler**: synchroner Throw → `console.error("flush handler error for key", key, err)`, Modal schließt trotzdem.
- [ ] **Re-entrancy-Guard** via `flushRunningRef`: Doppel-Click auf "Zurück" löst nur einen Flush-Run aus.

### AccountSection
- [ ] `AccountSection.tsx` importiert `useDirty`; hält `initialSnapshotRef` (initial leeres Form) + `lastReportedRef`.
- [ ] **Fetch-Race Guard**: `setEmail(data.data.email)` **nur** wenn `JSON.stringify(currentForm) === initialSnapshotRef.current` (User hat nichts getippt). Bei User-Input während Fetch → Fetch-Response wird ignoriert.
- [ ] Snapshot-Reset bei Save-Success: `initialSnapshotRef.current = JSON.stringify({email: currentEmail, currentPassword: "", newPassword: ""})`.
- [ ] Sync-during-render `isEdited` + `lastReportedRef`-Guard + `setDirty("account", isEdited)`.
- [ ] useEffect-cleanup ruft `setDirty("account", false)` bei unmount.
- [ ] Kommentar am Snapshot-Setup: "Keys in fester Reihenfolge {email, currentPassword, newPassword} — Refactor nur mit Snapshot-Reset parallel."

### JournalEditor Flush-on-Stay
- [ ] JournalEditor registriert in useEffect `registerFlushHandler("journal", flushFn)` mit unregister in cleanup.
- [ ] `flushFn` no-op wenn `autoSaveTimer.current === null`.
- [ ] `flushFn` clearet Timer und ruft `doAutoSave.current()` synchron wenn Timer pending.

### Tests (mechanisch)
- [ ] `DirtyContext.test.tsx`: Testcase "Zurück ruft registered handler synchron" (`expect(fn).toHaveBeenCalledTimes(1)` direkt nach click).
- [ ] Testcase "Verwerfen ruft NICHT Flush-Handler".
- [ ] Testcase "Selektiver Flush: handler für non-dirty key NICHT aufgerufen bei Zurück".
- [ ] Testcase "Throw im Handler blockiert nicht Modal-Close" (`expect(modal).not.toBeVisible()` nach Zurück trotz Throw).
- [ ] Testcase "Unregister idempotent: alter cleanup nach newest-wins-Replace ist no-op".
- [ ] Alle 7 bestehenden Sprint-7-Tests bleiben grün.
- [ ] `pnpm test` grün.
- [ ] `pnpm build` grün, kein TS-Error, kein Next-Lint-Error.

### Manuelle Smoke-Tests (Staging)
- [ ] Konto: E-Mail ändern → Tab-Switch → Modal → Zurück → Input preserved → Verwerfen → Form reset.
- [ ] Journal: Edit → sofort Tab-Switch → Zurück → Network-Tab zeigt POST-Request `<100ms` nach Zurück-Click (NICHT nach 3s).
- [ ] Sprint-7-Regression: Agenda-Edit → Tab-Switch → Modal → Verwerfen weiterhin funktional.
- [ ] Save-Success-während-Modal-Edge: Edit → Tab-Switch 2.5s nach Timer-Start → Modal offen → Autosave committed im Hintergrund → "Zurück" schließt Modal ohne erneuten Save (selektiver Flush no-op).

## Tasks

### Phase 1 — DirtyContext API
- [ ] `DirtyKey` um `"account"` erweitern + Initial-State
- [ ] `registerFlushHandler`-API (ref-based Map, idempotent unregister)
- [ ] `closeConfirm` (Zurück): selektiver Flush + try/catch pro Handler + flushRunningRef-Guard
- [ ] `handleDiscard` (Verwerfen): KEIN Flush

### Phase 2 — AccountSection
- [ ] initialSnapshotRef mit leerem Form (vor Fetch)
- [ ] Fetch-Response mit Guard: ignore wenn currentForm !== initialSnapshot
- [ ] sync-during-render isEdited + setDirty
- [ ] Save-Success: Passwords clear + Snapshot-Reset
- [ ] Unmount-cleanup

### Phase 3 — JournalEditor Flush
- [ ] registerFlushHandler in useEffect + unregister in cleanup
- [ ] flushFn: no-op oder clearTimeout + doAutoSave synchron

### Phase 4 — Tests
- [ ] 5 neue Testcases in DirtyContext.test.tsx (selektiver Flush, Verwerfen-kein-Flush, Throw-safe, Re-entrancy, Unregister-idempotent)
- [ ] `pnpm test` + `pnpm build` grün

### Phase 5 — Verify & Ship
- [ ] Branch push → Sonnet pre-push Review
- [ ] PR öffnen → Codex Review (max 3 Runden)
- [ ] Staging-Deploy verifizieren (CI + Health + Smoke + Logs)
- [ ] Merge → Prod-Deploy verifizieren

## Notes

- Pattern-Repeat aus Sprint 7 (PR #48), keine neue DB-Migration, keine API-Endpoint-Änderungen.
- `registerFlushHandler` ist neue Dirty-Context-API — Governance-Kommentar aktualisieren.
- Codex R1 Findings v1 adressiert: Contract-Widerspruch gefixt, Fetch-Race, try/catch, selektiver Flush, mechanische Testbarkeit, Re-entrancy, Throw-Safety.
- Nice-to-have → memory/todo.md: `useSnapshotDirty` Helper, `serializeAccountSnapshot` Helper, Telemetrie, A11y-Modal-Focus, Server-side Version-Guard.
- MediaSection Rename (native `window.prompt`) und Dashboard-UI-i18n weiterhin Out of Scope.
