# Sprint: Dirty-Polish (AccountSection + Autosave-Flush-on-Stay)
<!-- Spec: tasks/spec.md v3 (post Codex Spec-Review R2) -->
<!-- Started: 2026-04-16 -->
<!-- Revised: 2026-04-16 v3 — Codex R2 findings integrated: null-snapshot fetch-race fix, formRef stale-closure safety, flush-path canonicalized to closeConfirm only, timer-pending-only flush promise, mechanical fetch-order assertion replaces <100ms, logout smoke S3, serializeAccountSnapshot helper promoted to Must-Have. -->
<!-- Revised: 2026-04-16 v2 — Codex R1 findings integrated (Flush-Semantik, Fetch-Race, try/catch, selektiver Flush, mechanische Testbarkeit) -->

## Done-Kriterien
> Alle müssen PASS sein bevor der Sprint als fertig gilt.

### DirtyContext API
- [ ] `DirtyKey` union erweitert zu `"agenda" | "journal" | "projekte" | "alit" | "account"`; Governance-Kommentar: "Neuer Tab = neuer Key + Section-Wiring. Editoren mit Autosave MÜSSEN registerFlushHandler nutzen."
- [ ] `useDirty()` Rückgabewert enthält neu `registerFlushHandler: (key: DirtyKey, fn: () => void) => () => void`.
- [ ] Provider hält Handler-Map `Partial<Record<DirtyKey, () => void>>` (ref-based, single fn pro key, newest-wins).
- [ ] Unregister-Fn ist idempotent: setzt Map-Entry nur auf null wenn stored ref === übergebene fn.

### Flush-Semantik (canonical — nur `closeConfirm`)
- [ ] **Flush läuft NUR in `closeConfirm` (Zurück)**, **NICHT** in `handleDiscard` (Verwerfen).
- [ ] **Selektiver Flush**: Provider ruft nur Handler auf für Keys mit `dirtyRef.current[key] === true`.
- [ ] **try/catch pro Handler**: synchroner Throw → `console.error("flush handler error for key", key, err)`, Modal schließt trotzdem.
- [ ] **Re-entrancy-Guard** via `flushRunningRef`: Doppel-Click auf "Zurück" löst nur einen Flush-Run aus.

### AccountSection (null-Snapshot + formRef + serialize-Helper)
- [ ] `serializeAccountSnapshot(form)` als Modul-Level-Helper in `AccountSection.tsx` oben: `JSON.stringify({ email, currentPassword, newPassword })` in fester Key-Reihenfolge. Nutzung an allen 3 Call-Sites.
- [ ] `AccountSection.tsx` importiert `useDirty`; hält `initialSnapshotRef` **startet mit `null`** + `formRef` (aktualisiert in jedem Render) + `lastReportedRef`.
- [ ] **Fetch-Race Guard**: Fetch-Resolve setzt `email` + `initialSnapshotRef` **nur wenn `formRef.current` pristine** (`email === "" && currentPassword === "" && newPassword === ""`). Bei User-Input während Fetch: Response ignoriert, `initialSnapshotRef` bleibt `null`.
- [ ] `isEdited`-Compute sync-during-render: `initialSnapshotRef.current === null ? false : serializeAccountSnapshot(formRef.current) !== initialSnapshotRef.current`.
- [ ] Snapshot-Reset bei Save-Success: `initialSnapshotRef.current = serializeAccountSnapshot({email: currentEmail, currentPassword: "", newPassword: ""})`.
- [ ] `setDirty("account", isEdited)` via `lastReportedRef`-Guard (nur bei Änderung).
- [ ] useEffect-cleanup ruft `setDirty("account", false)` bei unmount.

### JournalEditor Flush-on-Stay (timer-pending-only)
- [ ] JournalEditor registriert in useEffect `registerFlushHandler("journal", flushFn)` mit unregister in cleanup.
- [ ] `flushFn` **no-op wenn `autoSaveTimer.current === null`** (deckt "kein Timer", "Save in-flight" und "Save done" ab).
- [ ] `flushFn` bei pending Timer: `clearTimeout` + `autoSaveTimer.current = null` + `doAutoSave.current()` synchron.

### Tests (mechanisch, 5 neue Cases)
- [ ] **T1** `DirtyContext.test.tsx`: "Zurück triggert Handler synchron vor Close" — `expect(mockHandler).toHaveBeenCalledTimes(1)` direkt nach click UND `mockHandler.mock.invocationCallOrder[0] < closeSpy.mock.invocationCallOrder[0]`.
- [ ] **T2** "Verwerfen ruft Handler NICHT auf" — `expect(mockHandler).not.toHaveBeenCalled()`.
- [ ] **T3** "Selektiver Flush: Handler für non-dirty key NICHT aufgerufen" — nur `agenda` dirty, `journal`-Handler bleibt ungerufen bei Zurück.
- [ ] **T4** "Throw im Handler blockiert Close nicht" — `expect(screen.queryByRole("dialog")).not.toBeInTheDocument()` nach Zurück trotz Throw.
- [ ] **T5** "Unregister idempotent (newest-wins)" — Handler B ersetzt A, A's Cleanup ist no-op; nach Zurück ruft nur B.
- [ ] Alle 7 bestehenden Sprint-7-Tests bleiben grün.
- [ ] `pnpm test` grün.
- [ ] `pnpm build` grün, kein TS-Error, kein Next-Lint-Error.

### Manuelle Smoke-Tests (Staging)
- [ ] **S1 Konto-Dirty**: Konto → E-Mail ändern → Tab-Switch → Modal → Zurück → Input preserved → Verwerfen → Form reset.
- [ ] **S2 Journal Flush**: Journal edit → sofort Tab-Switch → Zurück → Network-Tab zeigt POST-Request **synchron im Zurück-Klick-Tick** (nicht erst nach 3s).
- [ ] **S3 Shared Gate Abmelden**: Journal edit → Abmelden-Klick → Modal → Zurück → Session + Input intakt → erneut Abmelden → Verwerfen → Logout executes.
- [ ] **S4 Sprint-7-Regression**: Agenda-Edit → Tab-Switch → Modal → Verwerfen weiterhin funktional.
- [ ] **S5 Save-Success-während-Modal**: Journal-Edit → Tab-Switch 2.5s nach Timer-Start → Modal offen → Autosave committed im Hintergrund → Zurück schließt Modal ohne erneuten POST-Request (Flush no-op).

## Tasks

### Phase 1 — DirtyContext API
- [ ] `DirtyKey` um `"account"` erweitern + Initial-State
- [ ] `registerFlushHandler`-API (ref-based Map, idempotent unregister)
- [ ] `closeConfirm` (Zurück): selektiver Flush + try/catch pro Handler + flushRunningRef-Guard
- [ ] `handleDiscard` (Verwerfen): KEIN Flush (explizit, Kommentar)

### Phase 2 — AccountSection
- [ ] `serializeAccountSnapshot(form)` Modul-Level-Helper
- [ ] `initialSnapshotRef` startet mit `null` (Sentinel für "noch nie initialisiert")
- [ ] `formRef` aktualisiert in jedem Render (Stale-Closure-Safety für Fetch-Callback)
- [ ] Fetch-Response mit Pristine-Guard: ignore wenn `formRef.current` nicht pristine
- [ ] sync-during-render `isEdited` (respektiert null-Snapshot) + `setDirty`
- [ ] Save-Success: Passwords clear + Snapshot-Reset via Helper
- [ ] Unmount-cleanup `setDirty("account", false)`

### Phase 3 — JournalEditor Flush
- [ ] `registerFlushHandler("journal", flushFn)` in useEffect + unregister in cleanup
- [ ] `flushFn`: no-op wenn `autoSaveTimer.current === null`, sonst `clearTimeout` + `doAutoSave()` synchron

### Phase 4 — Tests
- [ ] 5 neue Testcases T1–T5 in `DirtyContext.test.tsx`
- [ ] `pnpm test` + `pnpm build` grün

### Phase 5 — Verify & Ship
- [ ] Branch push → Sonnet pre-push Review
- [ ] PR öffnen → Codex Review (max 3 Runden)
- [ ] Staging-Deploy verifizieren (CI + Health + Smoke S1–S5 + Logs)
- [ ] Merge → Prod-Deploy verifizieren

## Notes

- Pattern-Repeat aus Sprint 7 (PR #48), keine neue DB-Migration, keine API-Endpoint-Änderungen.
- **Spec v3 Fixes (Codex R2):**
  - **Correctness-1**: `initialSnapshotRef = null` Sentinel statt "leer-Form" — verhindert sofortiges `isEdited=true` nach Fetch.
  - **Correctness-1b**: `formRef` aktualisiert in jedem Render — Fetch-Callback liest live state, nicht Mount-Closure.
  - **Correctness-2**: Flush-Promise explizit auf `timer pending` scoped; in-flight Save bleibt Best-Effort.
  - **Contract-1**: File-Tabelle + Test-Count canonical (5 Tests T1–T5, Flush nur in `closeConfirm`).
  - **Contract-3**: `<100ms` gestrichen; mechanischer `invocationCallOrder`-Check (T1) + "synchron im User-Gesture-Tick" (S2).
  - **Architecture-1**: Smoke S3 für `confirmDiscard` shared Gate (Abmelden-Path) ergänzt.
  - **Nice-to-have → Must-Have**: `serializeAccountSnapshot` Helper promoted.
- Verbleibende Nice-to-haves in `memory/todo.md`: `useSnapshotDirty` Helper, Telemetrie, A11y-Focus-Trap, StrictMode-Test, Server-side Version-Guard, in-flight Flush-Support.
- MediaSection Rename (native `window.prompt`) und Dashboard-UI-i18n weiterhin Out of Scope.
