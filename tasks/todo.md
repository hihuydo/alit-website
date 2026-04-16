# Sprint: Dirty-Polish (AccountSection + Autosave-Flush-on-Stay)
<!-- Spec: tasks/spec.md v3.2 (post Codex R3 consistency-cleanup) -->
<!-- Started: 2026-04-16 -->
<!-- Revised: 2026-04-16 v3.2 — Codex R3 consistency: formRef entfernt (nicht mehr Teil des Contracts; userTouchedRef liest Ref, keine Stale-Closure-Gefahr); edge-case "typed+deleted" in vor-Fetch / nach-Fetch gesplittet. -->
<!-- Revised: 2026-04-16 v3.1 — Codex R2 new-findings integrated: userTouchedRef + pristine-snapshot replaces null-snapshot (fixes Correctness-3/4 silent-dirty-suppression), T1-Assertion via modal-present-in-handler-body (no provider-internal spy needed), deploy URL alit.hihuydo.com. -->
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

### AccountSection (pristine-Snapshot + userTouchedRef + serialize-Helper)
- [ ] `serializeAccountSnapshot(form)` als Modul-Level-Helper in `AccountSection.tsx` oben: `JSON.stringify({ email, currentPassword, newPassword })` in fester Key-Reihenfolge. Nutzung an allen 3 Call-Sites (Fetch-Resolve, Save-Reset, Render-Diff).
- [ ] `AccountSection.tsx` importiert `useDirty`; hält `initialSnapshotRef` (**startet mit pristine** `serializeAccountSnapshot({"","",""})`) + `userTouchedRef` (sticky Bool, initial `false`) + `lastReportedRef`.
- [ ] **Alle drei `onChange`-Handler** (`email`, `currentPassword`, `newPassword`) setzen `userTouchedRef.current = true` vor dem State-Update.
- [ ] **Fetch-Race Guard**: Fetch-Resolve setzt `email` + `initialSnapshotRef` **nur wenn `userTouchedRef.current === false`**. Sonst: Response ignoriert, Snapshot unverändert.
- [ ] `isEdited`-Compute sync-during-render: `serializeAccountSnapshot({email, currentPassword, newPassword}) !== initialSnapshotRef.current`. Keine null-Sentinel-Sonderbehandlung.
- [ ] Snapshot-Reset bei Save-Success: `initialSnapshotRef.current = serializeAccountSnapshot({email: currentEmail, currentPassword: "", newPassword: ""})`.
- [ ] `setDirty("account", isEdited)` via `lastReportedRef`-Guard (nur bei Änderung).
- [ ] useEffect-cleanup ruft `setDirty("account", false)` bei unmount.

### JournalEditor Flush-on-Stay (timer-pending-only)
- [ ] JournalEditor registriert in useEffect `registerFlushHandler("journal", flushFn)` mit unregister in cleanup.
- [ ] `flushFn` **no-op wenn `autoSaveTimer.current === null`** (deckt "kein Timer", "Save in-flight" und "Save done" ab).
- [ ] `flushFn` bei pending Timer: `clearTimeout` + `autoSaveTimer.current = null` + `doAutoSave.current()` synchron.

### Tests (mechanisch, 5 neue Cases)
- [ ] **T1** `DirtyContext.test.tsx`: "Zurück triggert Handler synchron, Modal zum Call-Zeitpunkt noch sichtbar" — mockHandler-Body captured `modalPresentAtCall = screen.queryByRole("dialog") !== null`. Nach click synchron: `expect(mockHandler).toHaveBeenCalledTimes(1)` UND `expect(modalPresentAtCall).toBe(true)`. Nach Flush: `expect(screen.queryByRole("dialog")).not.toBeInTheDocument()`.
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
- [ ] `initialSnapshotRef` startet mit pristine `serialize({"","",""})` (keine null-Sentinel)
- [ ] `userTouchedRef` sticky Flag (initial `false`) — flippt in **allen 3 onChange-Handlern** auf `true`
- [ ] Fetch-Response mit Touch-Guard: ignore wenn `userTouchedRef.current === true`; sonst setEmail + Snapshot-Reset
- [ ] sync-during-render `isEdited` via `serialize(current) !== initialSnapshotRef.current` + `setDirty`
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
- **Spec v3.1 Fixes (Codex R2 new-findings):**
  - **Correctness-3 (silent-dirty-suppression)**: null-snapshot würde User-Tippen vor Fetch silent schlucken (kein Modal, kein beforeunload). Ersetzt durch **pristine-snapshot from mount** → diff feuert von Tick 0.
  - **Correctness-4 (pristine-conflation)**: form-equality-Check verwechselt "nie getippt" mit "getippt+gelöscht". Ersetzt durch **`userTouchedRef` sticky** — autoritative Quelle für "hat User interagiert".
  - **Contract-3 (T1 assertion)**: `invocationCallOrder` brauchte provider-internen closeSpy (nicht exponiert). Ersetzt durch "Handler-Body captured `modalPresentAtCall`" → direkt gegen DOM beweisbar.
  - **Ops-1**: Deploy-URLs korrigiert auf `alit.hihuydo.com` (prod) + `staging.alit.hihuydo.com` (staging).
- **Spec v3 Fixes (Codex R2 initial, alle noch intakt):** Contract-1 canonical flush-path + 5 Tests, Contract-2 Fetch-race, Correctness-1b formRef, Correctness-2 timer-pending-only, Architecture-1 logout smoke S3, serializeAccountSnapshot promoted.
- Verbleibende Nice-to-haves in `memory/todo.md`: `useSnapshotDirty` Helper, Telemetrie, A11y-Focus-Trap, StrictMode-Test, Server-side Version-Guard, in-flight Flush-Support.
- MediaSection Rename (native `window.prompt`) und Dashboard-UI-i18n weiterhin Out of Scope.
