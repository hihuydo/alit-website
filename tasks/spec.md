# Spec: Dirty-Polish (AccountSection + Autosave-Flush-on-Stay)
<!-- Created: 2026-04-16 -->
<!-- Revised: 2026-04-16 v3 — Codex Spec-Review R2 (fetch-race null-snapshot + formRef, flush-path canonicalization, timer-pending-only promise, mechanical fetch-order assertion, logout smoke, serializeAccountSnapshot promoted) -->
<!-- Revised: 2026-04-16 v2 — Codex Spec-Review R1 (Flush-Semantik-Contract, Account-Fetch-Race, try/catch-per-handler, mechanische Testbarkeit, selektiver Flush) -->
<!-- Author: Planner (Claude Opus 4.7) -->
<!-- Status: Draft v3 (final after Codex R2) -->

## Summary

Zwei kleine Erweiterungen zur DirtyContext-Infrastruktur aus Sprint 7:
1. `AccountSection` (Konto-Tab) meldet Dirty-State wie die anderen vier Editoren — Tab-Wechsel mit ungespeicherten E-Mail-/Passwort-Änderungen triggert Confirm-Modal.
2. Bei "Zurück" im Confirm-Modal flusht der JournalEditor seinen pending 3-Sekunden-Autosave-Timer sofort, statt weiter zu warten. Gilt NUR für `timer pending`-Case; wenn Save bereits in-flight ist, ist Flush no-op.

Keine neue DB-Migration, keine User-facing Breaking Changes, ~5 Files. Pattern-Repeat aus PR #48.

## Context

- PR #48 hat `DirtyContext` etabliert: `setDirty(key, bool)` + `confirmDiscard(action)` + beforeunload-Handler + Modal. Der `confirmDiscard`-Pfad gated **nicht nur Tab-Wechsel**, sondern auch `Konto`-Klick und `Abmelden`-Klick in `dashboard/page.tsx:86-117`. Änderungen am Flush-Kontrollfluss schlagen also auf Session-Actions durch — Smoke-Coverage muss das abdecken.
- Vier Keys sind verdrahtet: `agenda | journal | projekte | alit`. Konto-Tab hat aktuell **keine** Dirty-Guard — E-Mail/Passwort-Eingaben gehen bei Tab-Wechsel verloren.
- JournalEditor hat 3s-debounced Autosave (`autoSaveTimer` ref). Heute: User klickt Top-Tab während Timer läuft → Modal → "Zurück" → Timer läuft weiter 2-3s und speichert dann. UX-Friktion: User erwartet, dass "Zurück" den Save-Status synchron auflöst — solange Timer noch pending ist.

Siehe `patterns/admin-ui.md` (Dirty-Editor-Warnung: diff-vs-initial) und `patterns/react.md` (sync-during-render für State-Signale).

## Requirements

### Must Have (Sprint Contract)

1. **AccountSection meldet `setDirty("account", isEdited)` synchron** via snapshot-diff `{email, currentPassword, newPassword}` gegen Initial-Snapshot. Bei erfolgreichem Save werden Passwort-Felder geleert → Snapshot wird neu gesetzt (dirty=false).

2. **`DirtyKey` um `"account"` erweitert**, Governance-Kommentar im `DirtyContext.tsx` aktualisiert (inkl. neue Regel "Editoren mit Autosave MÜSSEN registerFlushHandler nutzen").

3. **`registerFlushHandler(key, fn): () => void` API in DirtyContext** — Sections registrieren optionale Flush-Handler. Rückgabe ist Unregister-Fn für useEffect-cleanup. Handler-Map ist `Ref<Partial<Record<DirtyKey, () => void>>>` (single fn pro key, newest-wins).

4. **Flush-Semantik (eindeutig, ohne Widersprüche):**
   - **Flush läuft NUR bei "Zurück"** (im `closeConfirm`-Pfad), **NICHT** bei "Verwerfen" (`handleDiscard`). Grund: bei "Verwerfen" unmountet der Editor, AbortController cancelt in-flight autosave — Flush würde Daten committen, die User verwerfen will.
   - **Selektiver Flush:** nur Handler für Keys mit `dirtyRef.current[key] === true` werden aufgerufen. Verhindert Side-Effects für aktuell saubere Sections mit registriertem Handler.
   - **try/catch pro Handler:** synchroner Throw eines Handlers blockiert nicht den Modal-Close. Fehler werden per `console.error("flush handler error for key", key, err)` geloggt, Modal schließt regulär.
   - **Re-entrancy-Guard:** `flushRunningRef` verhindert, dass `closeConfirm` mehrfach synchron (Doppel-Click auf "Zurück") mehrere Flush-Runs auslöst.

5. **JournalEditor `flushFn`-Kontrakt (präzise, timer-pending-only):**
   - `flushFn` ist **no-op** wenn `autoSaveTimer.current === null` (kein Timer pending — inkl. "Save bereits in-flight" und "Save bereits committed" — das existierende `handleSave` läuft unabhängig weiter / ist fertig).
   - `flushFn` bei pending Timer: `clearTimeout(autoSaveTimer.current)`, `autoSaveTimer.current = null`, `doAutoSave.current()` synchron aufrufen (startet Request sofort, Response resolvt async wie gewohnt).
   - **Garantie nur für timer-pending:** Wenn `handleSave` schon fliegt (Timer ist bereits gefeuert), kann Flush nichts synchron auflösen. User sieht Save-Indicator wie bisher. Dokumentiert als akzeptiertes Edge-Case (Risks-Section).

6. **AccountSection Fetch-Race Handling (null-snapshot + formRef):**
   - `initialSnapshotRef` startet mit `null` (= "noch nie initialisiert"). Solange `null`, ist `isEdited` immer `false` → kein Modal-Trigger beim ersten Render.
   - `formRef` (`useRef<{email, currentPassword, newPassword}>`) wird in jedem Render aktualisiert (`formRef.current = { email, currentPassword, newPassword }`). Stellt sicher, dass der Fetch-Callback die **aktuelle** Form-State liest, nicht die closure vom Mount-Tick.
   - Fetch-Response Handling: wenn `formRef.current.email === "" && currentPassword === "" && newPassword === ""` (User hat seit Mount nichts getippt) → `setEmail(fetched)` + `initialSnapshotRef.current = serializeAccountSnapshot({email: fetched, currentPassword: "", newPassword: ""})`. Sonst: Fetch-Response wird **ignoriert** (User-Input gewinnt, kein Snapshot-Reset).
   - `isEdited`-Compute synchron im Render-Body: `initialSnapshotRef.current === null ? false : serializeAccountSnapshot(formRef.current) !== initialSnapshotRef.current`.
   - Save-Success: `initialSnapshotRef.current = serializeAccountSnapshot({email: currentEmail, currentPassword: "", newPassword: ""})` (Passwords sind geleert).

7. **`serializeAccountSnapshot(form)` Helper (Must-Have):**
   - Inline in `AccountSection.tsx` oben als Modul-Level-Fn definiert: `const serializeAccountSnapshot = (f) => JSON.stringify({ email: f.email, currentPassword: f.currentPassword, newPassword: f.newPassword });`.
   - Festgelegte Key-Reihenfolge, nicht abhängig von Object-Insertion-Order-Heuristik. Wird an allen 3 Call-Sites genutzt (Fetch-Resolve, Save-Success-Reset, Diff-Compute im Render).

8. **Edge-Case "Save-Success während Modal offen":**
   - Wenn Autosave erfolgreich committed während Modal offen ist (z.B. in-flight 3s-Timer-Save aus vorherigem Tick), setzt `setDirty("journal", false)` nur den internen Ref. **Modal bleibt offen** (kein Auto-Close), User entscheidet via Button. Bei "Zurück": selektiver Flush ist no-op (`dirtyRef.journal === false`). Bei "Verwerfen": `actionRef` läuft wie gewohnt — verwirft UI-Editor-State.

9. **Mechanisch testbare Done-Kriterien (alle 5 als Vitest-Cases in `DirtyContext.test.tsx`, ersetzen vages "<500ms"/"<100ms"):**
   - **T1 "Zurück triggert registrierten Handler synchron vor Close":** Mount `DirtyProvider` + Probe-Component, registriert `mockHandler` für `"journal"`, markiert dirty, triggert `confirmDiscard`, klickt "Zurück". Assertion: `expect(mockHandler).toHaveBeenCalledTimes(1)` direkt nach click (ohne `await`), UND `mockHandler.mock.invocationCallOrder[0] < closeCallbackMock.mock.invocationCallOrder[0]` (Handler fires before close).
   - **T2 "Verwerfen ruft Handler NICHT auf":** Setup wie T1, klickt stattdessen "Verwerfen". Assertion: `expect(mockHandler).not.toHaveBeenCalled()`.
   - **T3 "Selektiver Flush: Handler für non-dirty key nicht aufgerufen":** Registriert Handler für `"journal"`, markiert NUR `"agenda"` dirty, triggert confirmDiscard → "Zurück". Assertion: `expect(journalHandler).not.toHaveBeenCalled()`.
   - **T4 "Throw im Handler blockiert Modal-Close nicht":** Handler wirft synchron, User klickt "Zurück". Assertion: `expect(screen.queryByRole("dialog")).not.toBeInTheDocument()` nach click; `console.error` wurde mit Key + Error aufgerufen.
   - **T5 "Unregister idempotent (newest-wins):** Handler A registriert, dann Handler B (ersetzt A), A's cleanup läuft nach B's Registration. Assertion: nach "Zurück" → `B.toHaveBeenCalledTimes(1)`, `A.not.toHaveBeenCalled()`.

10. **Alle bestehenden 7 Sprint-7-Tests bleiben grün** (keine Regression auf agenda/journal/projekte/alit-Paths).

11. **Manuelle Smoke-Tests (Staging):**
    - **S1 Konto-Dirty**: Konto-E-Mail ändern → Tab-Switch → Modal → "Zurück" → Input preserved → "Verwerfen" → Form reset.
    - **S2 Journal-Flush**: Journal edit → sofort (innerhalb 3s) Tab-Switch → Modal → "Zurück" → Network-Tab zeigt POST-Request **synchron zum Zurück-Click** (im selben User-Gesture-Tick, nicht erst nach 3s).
    - **S3 Shared Gate — Abmelden**: Journal edit → Sidebar "Abmelden" klicken → Modal erscheint → "Zurück" → Input preserved, Session intakt → dann "Abmelden" → Modal → "Verwerfen" → Logout executes. Deckt die zweite Call-Site von `confirmDiscard` in `dashboard/page.tsx` ab.
    - **S4 Sprint-7-Regression**: Agenda-Edit → Tab-Switch → Modal → "Verwerfen" weiterhin funktional.
    - **S5 Save-Success-während-Modal-Edge**: Journal-Edit → Tab-Switch 2.5s nach Timer-Start → Modal offen → Autosave committed im Hintergrund (Save-Indicator wechselt auf "gespeichert") → "Zurück" schließt Modal ohne erneuten Save (selektiver Flush no-op).

> **Wichtig:** Nur Must-Have ist Sprint Contract. Nice-to-Have wandert nach `memory/todo.md`.

### Nice to Have (Follow-up → memory/todo.md)

- Flush-Handler für Agenda/Projekte/Alit auch für ungesaveten Draft (aktuell haben die keine Autosave → irrelevant).
- Unified `useSnapshotDirty` Helper (aktuell snapshot-diff inline in jeder Section — 5× dasselbe Pattern, Duplikation akzeptabel, Refactor bei 7+ Sections sinnvoll).
- Telemetrie für `flush_invoked` / `flush_failed` Events (Projekt hat aktuell keine formelle Observability-Pipeline, kein Sprint-Blocker).
- Focus-Management Confirm-Modal (Focus-Trap, Focus-Return) — gehört in A11y-Sprint.
- StrictMode double-register test — Codex-Finding v1, niedrige Priorität weil Provider-Handler-Map via `useEffect`-cleanup + Ref-Identity-Check robust ist.
- Server-side Version-Guard / Idempotency-Token für Flush-Save-Races (derzeit best-effort client-abort — Vollschutz erfordert API-Change, eigener Sprint).
- Flush-Handler für in-flight Saves (aktuell timer-pending-only — Support für AbortController + Retry wäre API-Change).

### Out of Scope

- **MediaSection Rename-Input dirty-tracking** — nutzt `window.prompt()` (native), kein inline-State zum Tracken. Kommt wenn Inline-Input-Umbau passiert (eigener Medium-Sprint).
- **Dashboard-UI-i18n für Modal-Texte** — Dashboard ist DE-only, i18n-Sprint muss erst geplant werden.
- **A11y-Pass für Modal** (role=dialog, focus-trap) — eigener Dashboard-A11y-Sprint.

## Technical Approach

### Files to Change

| File | Change Type | Description |
|------|-------------|-------------|
| `src/app/dashboard/DirtyContext.tsx` | Modify | `DirtyKey` += `"account"`; neues `registerFlushHandler`-API im Context-Value; Handler-Ref-Map (`Partial<Record<DirtyKey, () => void>>`); Call handlers **nur in `closeConfirm`** (Zurück) mit selektivem Filter auf `dirtyRef[key]===true`, try/catch pro Handler, `flushRunningRef`-Re-entrancy-Guard; Governance-Kommentar erweitert. |
| `src/app/dashboard/components/AccountSection.tsx` | Modify | `useDirty()`-Hook; `serializeAccountSnapshot`-Modul-Level-Helper; `initialSnapshotRef` startet mit `null`; `formRef` aktualisiert in jedem Render; Fetch-Race-Guard via `formRef.current === pristine`; sync-during-render `isEdited`-Compute via `serializeAccountSnapshot(formRef.current) !== initialSnapshotRef.current` + `lastReportedRef`-Guard; Snapshot-Reset bei Save-Success; `setDirty("account", false)` im unmount-cleanup. |
| `src/app/dashboard/components/JournalEditor.tsx` | Modify | `useDirty()` → `registerFlushHandler("journal", flushFn)` in `useEffect` mit cleanup; `flushFn` = no-op wenn `autoSaveTimer.current === null` else `clearTimeout` + `doAutoSave.current()`. |
| `src/app/dashboard/DirtyContext.test.tsx` | Modify | **5 neue Testcases** T1–T5 (Must-Have #9). |
| `memory/todo.md` | Modify | PR #50 von Offen → Erledigt nach Merge; MediaSection-Rename als "n/a (native prompt)" markieren; Nice-to-haves ergänzen. |

### Architecture Decisions

- **`registerFlushHandler` statt `confirmDiscard(action, {onStay})`** — generisches Handler-Set erlaubt beliebig vielen Sections zu registrieren. Skaliert für zukünftige Autosave-Editoren ohne Signatur-Änderung.

- **Flush läuft NUR in `closeConfirm` (Zurück)**, nicht in `handleDiscard` (Verwerfen): Bei "Verwerfen" unmountet der Editor sowieso und `useEffect`-cleanup abortet den AutoSaveController — Flush würde Daten committen, die User verwerfen will.

- **Selektiver Flush pro dirty key:** Provider filtert Handler-Map auf `dirtyRef.current[key] === true` vor Aufruf. Eliminiert Side-Effects bei aktuell sauberen Sections mit registriertem Handler.

- **Re-entrancy-Guard via `flushRunningRef`:** Verhindert mehrfache Autosave-Requests bei Doppel-Click auf "Zurück" vor dem nächsten Render.

- **try/catch pro Flush-Handler:** Handler-Throw wird per `console.error(key, err)` geloggt, Modal schließt trotzdem. Verhindert "Modal hängt"-Szenario.

- **AccountSection null-Snapshot + formRef (Stale-Closure-Safety):**
  - `initialSnapshotRef.current === null` bedeutet "noch nie initialisiert" → `isEdited = false` garantiert. Ohne dieses Null-Sentinel wäre die Form **sofort nach dem Mount dirty**: leerer Snapshot `{"","",""}` vs. gefetchte `email` = Diff.
  - `formRef` wird in jedem Render aktualisiert → Fetch-Callback liest live Form-State, nicht Mount-Closure. Ohne `formRef` würde der Callback immer die Pristine-State "sehen" (weil `useEffect([])` nur 1× mit Initial-Closure läuft) und jede Tippeingabe mit DB-Value überschreiben.
  - `formRef.current.X === ""` als Pristine-Check: einfaches String-Compare genügt, weil Snapshot erst nach Fetch-Success gesetzt wird und Form-State nur über `onChange`-Handler wächst.

- **`serializeAccountSnapshot` Helper (Must-Have, nicht Nice-to-have):** Codex-R2-Finding — mit drei Call-Sites (Fetch-Resolve, Save-Reset, Render-Diff) ist Drift zwischen Serializer-Logik ein reales Risk. Inline-Helper auf Modul-Ebene macht Key-Reihenfolge explizit und Refactor-Safe.

- **Journal `flushFn` timer-pending-only:** Bewusste Einschränkung. Wenn `handleSave` bereits in-flight ist, kann Flush nichts synchron auflösen (die Promise läuft schon). Dokumentiert als akzeptiertes Edge-Case. Full-Solution erfordert Server-side Idempotency + Client-Retry → eigener Sprint.

- **Handler-Set per Key, nicht pro Caller** — newest-wins. Unregister-Return ist idempotent: setzt Map-Entry nur dann auf null, wenn Ref === current fn (verhindert, dass alter Unmount-Cleanup neuen Handler abräumt).

- **lastReportedRef-Guard in AccountSection** — identisch zu Sprint 7, verhindert redundante `setDirty`-Calls in jedem Render.

### Dependencies

- **Intern:** DirtyContext Sprint 7 (PR #48), Modal-Component, useDirty-Hook, JournalEditor autosave-debounce.
- **Extern:** Keine neuen. Keine API-Endpoint-Änderungen, keine Migration, keine Env-Vars.

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| **Initial-Render vor Fetch-Resolve** | `initialSnapshotRef === null` → `isEdited = false` → kein Modal |
| **Account-Fetch resolvt, User hat nichts getippt** | `formRef.current` ist pristine → `setEmail(fetched)` + `initialSnapshotRef` wird gesetzt auf serialized pristine-mit-email → `isEdited = false` |
| **Account-Fetch in-flight, User tippt E-Mail bevor Fetch resolvt** | `formRef.current.email !== ""` → Fetch-Response wird ignoriert (User-Form bleibt), `initialSnapshotRef` bleibt `null` → `isEdited = false` (bis User die Eingabe wieder leert ODER Save erfolgreich → dann Snapshot = aktueller Form-State). Kein silent-overwrite. Trade-off: Server-E-Mail wird diesem User erst bei Reload sichtbar |
| Account-Fetch zurück, User tippt E-Mail-Änderung danach, Tab-Switch | Modal → "Zurück" bleibt, "Verwerfen" navigiert weg |
| Account: User tippt nur `currentPassword` (required für Save), keine anderen Änderungen | `isEdited = true` — akzeptiertes false-positive (User ist bewusst am Form) |
| Account-Save erfolgreich | Passwords geleert + `initialSnapshotRef` neu gesetzt via `serializeAccountSnapshot({email: currentEmail, cp:"", np:""})` → `isEdited = false` |
| Account-Save fehlgeschlagen | Dirty bleibt erhalten, User kann retry oder verwerfen |
| **JournalEditor autoSaveTimer NICHT pending, "Zurück"** | `flushFn` no-op (`autoSaveTimer.current === null`). Gilt auch für "Save bereits in-flight" (Timer wurde schon gefeuert) und "Save bereits committed" |
| **JournalEditor autoSaveTimer pending, "Zurück"** | `clearTimeout` + `doAutoSave()` synchron → POST fires im selben User-Gesture-Tick |
| **JournalEditor handleSave already in-flight, "Zurück"** | `flushFn` no-op (Timer ist `null`). In-flight POST resolvt wie gewohnt, Save-Indicator updated async. Modal schließt sofort. Dokumentiertes Best-Effort-Verhalten |
| **"Zurück" Doppel-Click im selben Tick** | `flushRunningRef`-Guard — zweiter `closeConfirm` no-op bis erster fertig |
| **Flush-Handler wirft Error** | `console.error("flush handler error for key", key, err)`, Modal schließt trotzdem (try/catch im Provider) |
| **Handler registriert aber dirty=false** | Selektiver Flush: Handler wird NICHT aufgerufen (Provider filtert auf `dirtyRef[key]===true`) |
| **Save-Success während Modal offen** | `setDirty("journal", false)` setzt nur Ref; Modal bleibt offen, User-Decision via Button. "Zurück" → Flush no-op (dirty=false). "Verwerfen" → action läuft regulär |
| **Abmelden-Klick mit dirty-form** | `confirmDiscard` in `dashboard/page.tsx:86` triggert Modal → "Zurück" preserved state + session → "Verwerfen" executed Logout. Selektiver Flush respektiert dirty-flags auch auf diesem Pfad. Siehe Smoke S3 |
| **Konto-Tab-Klick mit anderem dirty Editor** | Analog zu Tab-Switch — Modal, "Zurück"/"Verwerfen" |
| Zwei Sections registrieren für denselben Key (z.B. JournalEditor remountet innerhalb Journal-Tab) | Newest-wins: neue Registration überschreibt alte. Alte cleanup ruft unregister → no-op wenn Ref !== current (idempotent) |
| **React StrictMode Doppel-Register/Unregister** | useEffect-cleanup ist idempotent (Ref-Identity-Check). Kein Handler-Leak |

## Risks

- **Flush-Promise gilt nur für `timer pending`** — Wenn Save bereits in-flight ist, kann "Zurück" nichts synchron tun. Dokumentiert als akzeptiertes Best-Effort-Verhalten. User sieht Save-Indicator-Transition async. Full-Fix = Server-side Version-Guard (Out-of-Scope).
- **Code-Duplizierung im Snapshot-Pattern** — 5 Sections haben fast identisches `initialFormRef + lastReportedRef + isEdited`-Setup. Follow-up zu shared `useSnapshotDirty` Helper in `memory/todo.md`.
- **AccountSection false-positive "currentPassword != ''"** — dokumentiert als akzeptabel.
- **Best-effort "Verwerfen während Flush läuft":** User klickt "Zurück" → Flush startet Save → Modal schließt → User klickt danach schnell erneut Tab-Wechsel → Modal → "Verwerfen". Im Race-Window kann der erste Flush-Save bereits committet sein. Client-abort ist best-effort. Vollschutz erfordert Server-side Version-Guard (Nice-to-have).
- **JSON.stringify Key-Ordering:** Durch `serializeAccountSnapshot`-Helper explizit stabilisiert (Keys werden im Helper-Body in fester Reihenfolge geschrieben). Refactor-Safe auch bei Form-Field-Reordering.
- **Fetch-Race "User-Input während Fetch → Server-E-Mail bleibt unsichtbar":** Akzeptiert. Alternative (Snapshot-Reset auf Fetch-Value trotz User-Input) wäre silent user-data loss. Next Reload zeigt Server-State regulär.

## Verification (Smoke Test Plan)

Nach Staging-Deploy manuell:

1. **S1 Konto-Dirty**: Dashboard → Konto → E-Mail ändern → Tab "Über Alit" klicken → Modal erscheint → "Zurück" → zurück auf Konto, E-Mail-Input unverändert → "Verwerfen" → Über Alit gerendert, Konto-Form reset.
2. **S2 Journal Flush**: Dashboard → Discours Agités → Eintrag editieren → 1 Zeichen tippen → sofort (innerhalb 3s) Tab "Agenda" klicken → Modal → "Zurück" → Network-Tab zeigt POST-Request **synchron zum Zurück-Click** (gleicher User-Gesture-Tick, nicht 3s später).
3. **S3 Shared Gate — Abmelden**: Journal edit → Sidebar "Abmelden" klicken → Modal → "Zurück" → Input preserved, Session intakt → dann erneut "Abmelden" → Modal → "Verwerfen" → Logout executes, Redirect zu Login.
4. **S4 Regression Sprint 7**: Agenda-Editor öffnen, Titel tippen, Tab-Switch → Modal → "Verwerfen" funktioniert weiterhin.
5. **S5 Save-Success-während-Modal**: Journal-Edit → 2.5s warten → Tab-Switch → Modal offen → Autosave committed im Hintergrund (Indicator wechselt auf "gespeichert") → "Zurück" schließt Modal ohne erneuten POST-Request.

## Deploy & Verify

Nach Merge in main:
1. CI-Run grün (`gh run watch`)
2. `alit.ch` + `alit.ch/dashboard/` → 200
3. Smoke-Test aus oben (S1–S5)
4. Logs: `docker compose logs --tail=50 alit-app` → keine neuen Errors
