# Spec: Dirty-Polish (AccountSection + Autosave-Flush-on-Stay)
<!-- Created: 2026-04-16 -->
<!-- Revised: 2026-04-16 v2 — Codex Spec-Review R1 (Flush-Semantik-Contract, Account-Fetch-Race, try/catch-per-handler, mechanische Testbarkeit, selektiver Flush) -->
<!-- Author: Planner (Claude Opus 4.6) -->
<!-- Status: Draft v2 -->

## Summary

Zwei kleine Erweiterungen zur DirtyContext-Infrastruktur aus Sprint 7:
1. `AccountSection` (Konto-Tab) meldet Dirty-State wie die anderen vier Editoren — Tab-Wechsel mit ungespeicherten E-Mail-/Passwort-Änderungen triggert Confirm-Modal.
2. Bei "Zurück" im Confirm-Modal flusht der JournalEditor seinen pending 3-Sekunden-Autosave-Timer sofort, statt weiter zu warten.

Keine neue DB-Migration, keine User-facing Breaking Changes, ~5 Files. Pattern-Repeat aus PR #48.

## Context

- PR #48 hat `DirtyContext` etabliert: `setDirty(key, bool)` + `confirmDiscard(action)` + beforeunload-Handler + Modal.
- Vier Keys sind verdrahtet: `agenda | journal | projekte | alit`. Konto-Tab hat aktuell **keine** Dirty-Guard — E-Mail/Passwort-Eingaben gehen bei Tab-Wechsel verloren.
- JournalEditor hat 3s-debounced Autosave (`autoSaveTimer` ref). Heute: User klickt Top-Tab während Timer läuft → Modal → "Zurück" → Timer läuft weiter 2-3s und speichert dann. UX-Friktion: User erwartet, dass "Zurück" den Save-Status synchron auflöst.

Siehe `patterns/admin-ui.md` (Dirty-Editor-Warnung: diff-vs-initial) und `patterns/react.md` (sync-during-render für State-Signale).

## Requirements

### Must Have (Sprint Contract)

1. **AccountSection meldet `setDirty("account", isEdited)` synchron** via snapshot-diff `{email, currentPassword, newPassword}` gegen Initial-Snapshot (gesetzt nach Fetch). Bei erfolgreichem Save werden Passwort-Felder geleert → Snapshot wird neu gesetzt (dirty=false).

2. **`DirtyKey` um `"account"` erweitert**, Governance-Kommentar im `DirtyContext.tsx` aktualisiert (inkl. neue Regel "Editoren mit Autosave MÜSSEN registerFlushHandler nutzen").

3. **`registerFlushHandler(key, fn): () => void` API in DirtyContext** — Sections registrieren optionale Flush-Handler. Rückgabe ist Unregister-Fn für useEffect-cleanup.

4. **Flush-Semantik (eindeutig, ohne Widersprüche):**
   - **Flush läuft NUR bei "Zurück"** (im `closeConfirm`-Pfad), **NICHT** bei "Verwerfen" (`handleDiscard`). Grund: bei "Verwerfen" unmountet der Editor, AbortController cancelt in-flight autosave — Flush würde Daten committen, die User verwerfen will.
   - **Selektiver Flush:** nur Handler für Keys mit `dirtyRef.current[key] === true` werden aufgerufen. Verhindert Side-Effects für aktuell saubere Sections mit registriertem Handler.
   - **try/catch pro Handler:** synchroner Throw eines Handlers blockiert nicht den Modal-Close. Fehler werden per `console.error("flush handler error for key", key, err)` geloggt, Modal schließt regulär.
   - **Re-entrancy-Guard:** `flushRunningRef` verhindert, dass `closeConfirm` mehrfach synchron (Doppel-Click auf "Zurück") mehrere Flush-Runs auslöst.

5. **JournalEditor registriert Flush-Handler** der pending `autoSaveTimer` clearet und `doAutoSave.current()` synchron ausführt, wenn `autoSaveTimer.current !== null` (Timer pending → Autosave überfällig). No-op wenn kein Timer pending.

6. **AccountSection Fetch-Race Handling:**
   - Initial-Snapshot wird beim ersten Render auf **leeres Form** gesetzt (`{email: "", currentPassword: "", newPassword: ""}`), NICHT erst nach Fetch.
   - Fetch-Response setzt `email` via `setEmail(data.data.email)` **nur wenn `currentForm === initialSnapshot`** (User hat nichts getippt). Bei User-Input während Fetch-Flight: Fetch-Response wird ignoriert (keine Overwrite). Alternative: Fetch-Response wird immer committed aber Snapshot wird nachgezogen — führt zu falschem `dirty=false`. Daher: "ignore fetch if user already typed".
   - Nach erfolgreicher Save-Success: Snapshot wird neu gesetzt auf `{email: currentEmail, currentPassword: "", newPassword: ""}`.

7. **Edge-Case "Save-Success während Modal offen":**
   - Wenn Autosave erfolgreich committed während Modal offen ist (z.B. in-flight 3s-Timer-Save aus vorherigem Tick), setzt `setDirty("journal", false)` nur den internen Ref. **Modal bleibt offen** (kein Auto-Close), User entscheidet via Button. Bei "Zurück": selektiver Flush ist no-op (nichts mehr dirty). Bei "Verwerfen": `actionRef` läuft wie gewohnt — verwirft UI-Editor-State (Editor unmountet).
   - Rationale: Modal auto-close wäre UX-irritierend (User sieht Modal erscheinen und verschwinden). User-Decision explizit erhalten.

8. **Mechanisch testbare Done-Kriterien (ersetzt vages "<500ms"):**
   - Vitest: `registerFlushHandler` returnt Unregister-fn. Handler wird bei simuliertem "Zurück" synchron (`expect(fn).toHaveBeenCalledTimes(1)` direkt nach `fireEvent.click("Zurück")`) aufgerufen, bevor Modal-close.
   - Vitest: Handler wird **nicht** aufgerufen bei "Verwerfen" (`expect(fn).not.toHaveBeenCalled()` nach click).
   - Vitest: Handler für non-dirty key wird **nicht** aufgerufen, auch bei "Zurück" (selektiver Flush).
   - Vitest: Synchroner Throw im Handler blockiert nicht den Close — `expect(modal).not.toBeInTheDocument()` nach "Zurück" trotz Throw.

9. **Alle bestehenden 7 Sprint-7-Tests bleiben grün** (keine Regression auf agenda/journal/projekte/alit-Paths).

10. **Manuelle Smoke-Tests (Staging):** (a) Konto-E-Mail ändern → Tab-Switch → Modal → Zurück → Input preserved; (b) Journal edit → sofort Tab-Switch → Zurück → Autosave-Status wechselt **im selben Klick-Tick** auf "gespeichert" (verifiziert via Network-Tab: POST-Request fires in <100ms nach Zurück-Click, NICHT nach 3s).

> **Wichtig:** Nur Must-Have ist Sprint Contract. Nice-to-Have wandert nach `memory/todo.md`.

### Nice to Have (Follow-up → memory/todo.md)

- Flush-Handler für Agenda/Projekte/Alit auch für ungesaveten Draft (aktuell haben die keine Autosave → irrelevant).
- Unified `useSnapshotDirty` Helper (aktuell snapshot-diff inline in jeder Section — 5× dasselbe Pattern, Duplikation akzeptabel, Refactor bei 7+ Sections sinnvoll).
- Stabile `serializeAccountSnapshot(form)` Helper statt `JSON.stringify` (ES2015 Object-Insertion-Order ist zwar deterministisch, aber Helper macht Refactor-Safety explizit).
- Telemetrie für `flush_invoked` / `flush_failed` Events (Projekt hat aktuell keine formelle Observability-Pipeline, kein Sprint-Blocker).
- Focus-Management Confirm-Modal (Focus-Trap, Focus-Return) — gehört in A11y-Sprint.
- StrictMode double-register test — Codex-Finding, niedrige Priorität weil Provider-Handler-Map via `useEffect`-cleanup robust ist.

### Out of Scope

- **MediaSection Rename-Input dirty-tracking** — nutzt `window.prompt()` (native), kein inline-State zum Tracken. Kommt wenn Inline-Input-Umbau passiert (eigener Medium-Sprint).
- **Dashboard-UI-i18n für Modal-Texte** — Dashboard ist DE-only, i18n-Sprint muss erst geplant werden.
- **A11y-Pass für Modal** (role=dialog, focus-trap) — eigener Dashboard-A11y-Sprint.
- **Server-side Version-Guard / Idempotency-Token** — API-Änderung, eigener Sprint.

## Technical Approach

### Files to Change

| File | Change Type | Description |
|------|-------------|-------------|
| `src/app/dashboard/DirtyContext.tsx` | Modify | `DirtyKey` += `"account"`; neues `registerFlushHandler`-API im Context-Value; Handler-Ref-Set; Call before close in `handleDiscard`+`closeConfirm`. |
| `src/app/dashboard/components/AccountSection.tsx` | Modify | `useDirty()`-Hook, `initialSnapshotRef`, sync-during-render `isEdited`-Compute + `lastReportedRef`-Guard, Snapshot-Reset nach successful save, `setDirty("account", false)` im unmount-cleanup. |
| `src/app/dashboard/components/JournalEditor.tsx` | Modify | `useDirty()` → `registerFlushHandler("journal", flushFn)` in `useEffect` mit cleanup; flushFn cleart timer und ruft `doAutoSave.current()` synchron wenn pending. |
| `src/app/dashboard/DirtyContext.test.tsx` | Modify | 3 neue Testcases (siehe Must-Have #6). |
| `memory/todo.md` | Modify | PR #50 von Offen → Erledigt nach Merge; MediaSection-Rename als "n/a (native prompt)" markieren. |

### Architecture Decisions

- **`registerFlushHandler` statt `confirmDiscard(action, {onStay})`** — generisches Handler-Set erlaubt beliebig vielen Sections zu registrieren (auch wenn aktuell nur Journal autosavet). Skaliert für zukünftige Autosave-Editoren ohne Signatur-Änderung.

- **Flush läuft NUR bei "Zurück"**, nicht bei "Verwerfen": bei "Verwerfen" unmountet der Editor sowieso (Tab-Wechsel rendert andere Section), und `useEffect`-cleanup abortet den AutoSaveController (Sprint 7 Line 186-195). Flush bei "Verwerfen" würde Daten committen, die User verwerfen will — data-integrity-bug.

- **Selektiver Flush pro dirty key:** Provider filtert Handler-Map auf `dirtyRef.current[key] === true` vor Aufruf. Verhindert, dass ein registrierter Handler für eine aktuell saubere Section unerwartet feuert (z.B. Editor offen, nichts getippt, Handler registriert, anderer Tab ist dirty). Kostet 1 if-Check, eliminiert ganze Klasse Side-Effect-Bugs.

- **Re-entrancy-Guard via `flushRunningRef`:** Falls `closeConfirm` mehrfach synchron aufgerufen wird (Doppel-Click auf "Zurück" bevor erster Render durch ist), wird zweiter Call ignoriert. Verhindert mehrfache Autosave-Requests.

- **try/catch pro Flush-Handler:** Handler-Throw wird per `console.error` geloggt, Modal schließt trotzdem. Verhindert "Modal hängt"-Szenario bei versehentlichem Throw in Handler-Logik.

- **AccountSection Fetch-Race:** Konservative Strategie — Fetch-Response überschreibt `email`-State **nur wenn User noch nichts getippt hat** (currentForm === initialSnapshot). Bei User-Input während Fetch-Flight: Fetch-Response wird ignoriert (kein Overwrite, kein Snapshot-Reset). Rationale: False-dirty-reset wäre silent data-loss (User-Input verschwindet); ignorierter Fetch ist maximal ein False-clean-State bis nächstem Reload (User sieht nur eigene Eingabe, kein Bug).

- **Handler-Set per Key, nicht pro Caller** — `registerFlushHandler(key, fn)` ersetzt jeden früheren Handler für denselben Key (neueste Mount gewinnt). Unregister-Return ist Idempotent: setzt Map-Entry nur dann auf null, wenn Ref === current fn (verhindert, dass alter Unmount-Cleanup neuen Handler abräumt).

- **Snapshot-Diff für AccountSection via `JSON.stringify`** — identischer Pattern wie Agenda/Projekte/Alit in Sprint 7. ES2015 Object-Insertion-Order deterministisch, Payload klein (~3 Strings). Kommentar im Code: "Keys in fester Reihenfolge {email, currentPassword, newPassword} — Refactor nur mit Snapshot-Reset gleichzeitig." Stabiler Serializer-Helper ist Nice-to-have.

- **lastReportedRef-Guard** — identisch zu Sprint 7, verhindert redundante `setDirty`-Calls in jedem Render.

### Dependencies

- **Intern:** DirtyContext Sprint 7 (PR #48), Modal-Component, useDirty-Hook, JournalEditor autosave-debounce.
- **Extern:** Keine neuen. Keine API-Endpoint-Änderungen, keine Migration, keine Env-Vars.

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| **Account-Fetch in-flight, User tippt E-Mail bevor Fetch resolvt** | Fetch-Response wird ignoriert (User-Form bleibt unverändert). Erst nach Reload wird DB-E-Mail wieder sichtbar. Kein silent overwrite |
| Account-Fetch zurück, User hat nichts getippt | `email`-State wird gesetzt, initialSnapshot bleibt leer → `isEdited = false` → kein Modal bei Tab-Switch |
| Account-Fetch zurück, User tippt E-Mail-Änderung, Tab-Switch | Modal → "Zurück" bleibt, "Verwerfen" navigiert weg |
| Account-Fetch zurück, User tippt nur `currentPassword` (required für Save), keine anderen Änderungen | `isEdited = true` — akzeptiertes false-positive (current_password gezielt getippt, User ist bewusst am Form) |
| Account-Save erfolgreich | Passwords geleert + Snapshot neu gesetzt auf aktuelle E-Mail + leere Passwords → `isEdited = false` |
| Account-Save fehlgeschlagen (Error) | Dirty bleibt erhalten, User kann retry oder verwerfen |
| JournalEditor autoSaveTimer NICHT pending, "Zurück" geklickt | Flush-Handler no-op (`autoSaveTimer.current === null`) |
| JournalEditor autoSaveTimer pending, "Zurück" | Flush clearet Timer + ruft `doAutoSave()` synchron → Autosave fires im selben Tick |
| **"Zurück" Doppel-Click im selben Tick** | `flushRunningRef`-Guard — zweiter `closeConfirm` no-op bis erster fertig |
| **Flush-Handler wirft Error** | `console.error` Log, Modal schließt trotzdem (try/catch im Provider) |
| **Handler registriert aber dirty=false** | Selektiver Flush: Handler wird NICHT aufgerufen (Provider filtert auf `dirtyRef[key]===true`) |
| **Save-Success während Modal offen** (z.B. in-flight 3s-Timer-Save committed während User nachdenkt) | `setDirty("journal", false)` setzt nur Ref; Modal bleibt offen, User-Decision via Button. "Zurück" → selektiver Flush no-op (nicht mehr dirty). "Verwerfen" → action läuft regulär |
| **Handler throw blockiert Modal** | Verhindert durch try/catch pro Handler. Unabhängig von Handler-Erfolg: Modal schließt |
| Zwei Sections registrieren für denselben Key (z.B. JournalEditor remountet innerhalb Journal-Tab) | Newest-wins: neue Registration überschreibt alte. Alte cleanup ruft unregister → no-op wenn Ref !== current (idempotent) |
| **React StrictMode Doppel-Register/Unregister** | useEffect-cleanup ist idempotent (Ref-Check). Kein Handler-Leak |

## Risks

- **Flush bei "Zurück" triggert Save-Request während User eigentlich nur pausieren wollte** — Akzeptabel, weil pending 3s-Autosave sowieso committed hätte. Wir verkürzen nur das Warten.
- **Code-Duplizierung im Snapshot-Pattern** — 5 Sections (Agenda, Projekte, Alit, Journal via Editor, Account) haben fast identisches `initialFormRef + lastReportedRef + isEdited`-Setup. Follow-up zu shared `useSnapshotDirty` Helper in `memory/todo.md`.
- **AccountSection false-positive "currentPassword != ''"** — dokumentiert oben als akzeptabel. Fix bei Bedarf: `{email-changed, OR new-password-set}`-Diff statt Snapshot.
- **Best-effort "Verwerfen während Flush läuft":** User klickt "Zurück" → Flush startet Save → Modal schließt → User klickt danach schnell erneut Tab-Wechsel → Modal → "Verwerfen". In diesem Race-Window kann der erste Flush-Save bereits committet sein. Client-abort ist best-effort. Vollschutz erfordert Server-side Version-Guard (in Nice-to-have / Follow-up `memory/todo.md`).
- **JSON.stringify Key-Ordering:** ES2015+ spezifiziert Insertion-Order-Stabilität für String-Keys. Bei Refactor der Form-State-Reihenfolge muss Snapshot-Reset parallel passieren, sonst one-off false-positive dirty. Mitigation: Kommentar direkt am Snapshot-Setup in AccountSection.

## Verification (Smoke Test Plan)

Nach Staging-Deploy manuell:

1. **Konto-Dirty**: Dashboard → Konto → E-Mail ändern → Tab "Über Alit" klicken → Modal erscheint mit "Ungesicherte Änderungen verwerfen?" → "Zurück" → zurück auf Konto, E-Mail-Input unverändert → "Verwerfen" → Über Alit gerendert, Konto-Form reset
2. **Journal Flush**: Dashboard → Discours Agités → Eintrag editieren → 1 Zeichen tippen → sofort (innerhalb 3s) Tab "Agenda" klicken → Modal erscheint → "Zurück" → Autosave-Status wechselt binnen Sekundenbruchteil von "…" auf "gespeichert" (nicht erst nach 3s) → neuer Tab aufmachen + schließen verifiziert, dass Änderung wirklich committed
3. **Regression Sprint 7**: Agenda-Editor öffnen, Titel tippen, Tab-Switch → Modal wie gewohnt → "Verwerfen" funktioniert weiterhin

## Deploy & Verify

Nach Merge in main:
1. CI-Run grün (`gh run watch`)
2. `alit.ch` + `alit.ch/dashboard/` → 200
3. Smoke-Test aus oben (Konto + Journal)
4. Logs: `docker compose logs --tail=50 alit-app` → keine neuen Errors
