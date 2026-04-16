# Spec: Paid-Toggle Safety (Confirm-on-Untoggle + paid_at-Preserve)
<!-- Created: 2026-04-17 -->
<!-- Author: Planner (Claude Opus 4.7) -->
<!-- Status: v1 draft — pre-implementation -->

## Summary

Zwei komplementäre Safety-Layer für den `paid`-Toggle aus PR #54. Nach PR #56 (Audit-Dashboard-View) ist ein accidental Untoggle zwar nachvollziehbar, aber der Original-Timestamp `paid_at` geht verloren. Dieser Sprint addressiert beides:

- **Option 1 — Confirm-on-Untoggle**: Klickt der Admin auf einen bereits paid=true markierten Eintrag, erscheint ein Confirm-Modal. ON→OFF erfordert bewusste Bestätigung. OFF→ON bleibt ein Klick (keine zusätzliche Reibung beim Markieren).
- **Option 2 — paid_at Preserve**: SQL-Update behält `paid_at` bei ON→OFF (statt NULL zu setzen). Semantik-Shift: `paid_at` = "letzter Bezahlt-Zeitstempel" statt "aktuell-bezahlt-seit". Bei OFF→ON wird `paid_at` neu gestampft (ein neuer Zahlungsvorgang).

Scope ist klein (1 SQL-Change + 1 Modal), aber der Schutz kumuliert: Confirm-Modal verhindert den Fehler, Preserve macht den Fehler (falls er trotzdem durchkommt) trivial rückgängig.

## Context

- PR #54: Paid-Toggle + `paid_at` TIMESTAMPTZ eingeführt. Current SQL: `paid_at = CASE WHEN $1 AND NOT paid THEN NOW() WHEN NOT $1 THEN NULL ELSE paid_at END`.
- PR #56: Audit-Dashboard-View persistiert alle Toggle-Events. Accidental Untoggle ist rekonstruierbar via Verlauf-Modal (zeigt original-Timestamp in `details.paid` + `created_at`).
- Gap: UI lädt `paid_at` aus `memberships`-Tabelle als Single-Source für CSV-Export + Tooltip. Nach Untoggle ist `paid_at` NULL, auch wenn der Audit-Log den originalen Wert noch kennt. Reconstruction ist manuell (admin muss Audit öffnen, Timestamp ablesen, re-togglen → aber das setzt `paid_at` auf aktuelles NOW, nicht auf den Original-Wert).
- User-Feedback: "was wenn der user aus versehen untoggle?" → Option 5 (Audit) geliefert, aber User will jetzt auch die proaktive Schutzschicht drauf.

## Requirements

### Must Have (Sprint Contract)

1. **SQL-Change in `src/app/api/dashboard/signups/memberships/[id]/paid/route.ts`**:
   - Neue Formel: `paid_at = CASE WHEN $1 AND NOT paid THEN NOW() ELSE paid_at END`
   - Entfernt die `WHEN NOT $1 THEN NULL`-Branch.
   - Verhalten:
     - OFF → ON: `paid_at = NOW()` (neues Zahlungsereignis)
     - ON → OFF: `paid_at` preserve (letzter Bezahlt-Zeitstempel bleibt)
     - ON → ON: preserve (no-op, unchanged)
     - OFF → OFF: preserve (bleibt NULL wenn nie gezahlt)
   - Audit-Log bleibt unverändert (event + `details.paid` wie bisher).
   - Code-Kommentar erklärt den Safety-Aspekt + verweist auf Option 2.

2. **Confirm-Modal in `src/app/dashboard/components/SignupsSection.tsx`**:
   - Neue State: `pendingUntoggle: MembershipRow | null`.
   - Handler-Änderung: `togglePaid(row)` check ab — wenn `row.paid === true`, `setPendingUntoggle(row)` statt direkt-PATCH. Sonst (OFF→ON) direkt PATCH wie bisher.
   - Neue Function `confirmUntoggle()`: execute PATCH (same logic wie bisheriger togglePaid für ON→OFF), dann `setPendingUntoggle(null)`.
   - Modal rendert via existierendem `Modal.tsx` (A11y-Pass aus PR #51).
   - Modal-Title: "Bezahlt-Status entfernen?"
   - Modal-Body (erwähnt Preserve-Semantik explizit):
     - Zeile 1: "Bezahlt-Status für **{Vorname} {Nachname}** entfernen?"
     - Zeile 2: "Der Bezahlt-Zeitstempel bleibt erhalten und wird als **zuletzt bezahlt** geführt."
     - Zeile 3 (optional): "Diese Aktion wird im Verlauf protokolliert."
   - Buttons: "Abbrechen" (close, no-op) / "Status entfernen" (execute).
   - `disableClose` während PATCH in flight (gleiche UX wie Bulk-Delete Modal).
   - Kein modaler Trigger auf OFF→ON (kein Confirm für "markieren" — Happy Path bleibt 1-Klick).

3. **UI-Display preservierter paid_at**:
   - Tooltip (`title`-attribut) der Checkbox:
     - `paid === true && paid_at`: `Seit ${formatDate(paid_at)}` (unchanged)
     - `paid === false && paid_at`: `Zuletzt bezahlt: ${formatDate(paid_at)}` (neu — zeigt preservierten Wert)
     - `paid === false && !paid_at`: `Als bezahlt markieren` (unchanged)
   - Keine zusätzliche visuelle Spalte/Badge — Tooltip reicht. Pro-Komplexität zu hoch.

4. **CSV-Export bleibt kompatibel**:
   - Column "Bezahlt am" = `paid_at` (ISO-string oder leer).
   - Durch Preserve ist Column jetzt auch bei paid=nein befüllt wenn ever-paid. Kombination "Bezahlt=nein, Bezahlt am=2026-01-15" ist valid und informativ. Kein Header-Rename nötig.

5. **Tests**:
   - Kein neuer Pure-Logic-Helper erforderlich — die zwei Änderungen sind lokalisiert (SQL + React state).
   - Bestehende Tests müssen grün bleiben.
   - Manueller Smoke-Test-Plan (S1-S4) statt zusätzlicher Integration-Tests — die Logik ist trivial und UI-seitig (Modal-Interaktion).

6. **`pnpm test` + `pnpm build` grün (bestehende 165 Tests)**.

### Nice to Have (Follow-up → memory/todo.md)

- **"Zuletzt bezahlt"-Badge** visuell in der Tabelle (Inline-Text statt nur Tooltip) — braucht Design-Entscheidung zu Column-Layout. Tooltip ist ausreichend als MVP.
- **Bulk-Untoggle Confirm** — wenn später Bulk-Paid-Action kommt, dieselbe Safety-Pattern.
- **Confirm-Opt-Out Setting** — "never ask again" Admin-Preference. Aktuell keine Admin-Preference-Storage, würde Scope sprengen.
- **paid_at-Edit UI** — direkt editierbarer Timestamp (z.B. wenn Original-Zahldatum korrigiert werden muss). Separate Feature.

### Out of Scope

- Änderung der Audit-Log-Semantik — `details.paid` bleibt der primäre Signal.
- Migration existierender Daten — `paid_at` ist ein neues Feld, keine legacy-rows.
- UI-Änderung der Verlauf-Modal (PaidHistoryModal) — bleibt bei on-open fetch.

## Technical Approach

### Files to Change

| File | Change Type | Description |
|------|-------------|-------------|
| `src/app/api/dashboard/signups/memberships/[id]/paid/route.ts` | Modify | SQL CASE-Branch `WHEN NOT $1 THEN NULL` entfernen. Comment updaten. |
| `src/app/dashboard/components/SignupsSection.tsx` | Modify | `pendingUntoggle` State, `togglePaid` splitten (OFF→ON direct, ON→OFF prompts), `confirmUntoggle` executor, neue Modal-Instanz. Tooltip-Update für `paid=false && paid_at`. |

### Architecture Decisions

- **Confirm nur für ON→OFF, nicht OFF→ON**: Das kritische Risiko ist der accidental Untoggle (Datenverlust-Empfinden). ON-markieren ist trivial reversibel und soll Friktion-frei bleiben. Asymmetrische UX ist hier korrekt.
- **Preserve als Default (kein Opt-In)**: Die Preserve-Semantik verursacht keine Regressionen — der einzige User der `paid_at==NULL` liest ist die UI (Tooltip) und der CSV-Export, beide bleiben semantisch valide mit befülltem `paid_at`.
- **Modal reuse statt neuem Component**: `Modal.tsx` aus PR #51 hat Focus-Trap, Escape-Handling, aria-labelledby. Keine Duplikation nötig.
- **Keine neue Column in `memberships`**: `paid_at` wird überladen (von "aktuell seit" auf "zuletzt bezahlt"). Alternative wäre `last_paid_at` + `current_paid_since`, aber das doppelt die Schema-Komplexität ohne Gain — die Kombination aus `paid: boolean` + `paid_at: TIMESTAMPTZ` trägt bereits beide Infos.
- **No optimistic-ui-Änderung für ON→OFF**: Die bisherige Logik (optimistic state → server-wins → reload on error) bleibt 1:1 für den Untoggle-Pfad. Der Confirm-Modal schaltet die Action nur vor — er ändert den Execution-Pfad nicht.

### Dependencies

- Intern: Modal.tsx, bestehende `togglePaid`-Logic, `paid_at`-Spalte.
- Extern: keine.
- Keine DB-Migration — nur Query-Change.

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| User klickt "Abbrechen" im Modal | Modal schließt, keine PATCH-Call, `paid`-State unverändert. Checkbox bleibt checked (visuell nie verändert, weil optimistic-update erst im confirmUntoggle). |
| User klickt Checkbox bei `paid=true`, Modal offen, klickt erneut Checkbox | Kein Effekt — der erste Klick öffnete Modal, zweiter Klick während Modal-offen macht nichts Neues (Modal ist modal). |
| Escape während Modal + PATCH in flight | `disableClose` verhindert Close (wie Bulk-Delete-Modal). User muss warten bis PATCH resolved. |
| Escape während Modal, kein PATCH in flight | Modal schließt, keine Aktion. |
| Zwei PATCHes in flight auf verschiedene Rows (Row A im Modal → OK, Row B direkt-Toggle) | Beide unabhängig via `paidToggling` Set. `pendingUntoggle` ist pro-Session ein Modal für eine Row — kein Queueing nötig. Modal-offen für Row A blockiert nicht Toggle auf Row B. |
| OFF→ON→OFF rapid fire | OFF→ON direct PATCH (no modal, `paid_at=NOW`). Dann ON→OFF → Modal erscheint → Admin bestätigt → PATCH (`paid=false, paid_at` preserved = der NOW-Wert aus erstem Toggle). Audit-Log hat beide Events. |
| OFF→ON→OFF→ON (accidental untoggle + re-toggle) | Erstes ON: `paid_at=T1`. OFF: `paid_at=T1` preserved (Option 2!). Zweites ON: Check `$1 AND NOT paid` triggert → `paid_at=T2` (neues Timestamp). Alte T1 ist nur noch im Audit-Log. Akzeptabel — die typische Recovery-Story: admin sieht preservierten T1 im Tooltip, bestätigt keine Korrektur ist nötig. Wenn doch re-togglet, ist T2 der neue "Zahlungs-Zeitpunkt". |
| Membership-Delete während Confirm-Modal offen | Reload leert `data.memberships`. `pendingUntoggle` hält aber stale reference. Cleanup-Hook: in `reload()` prüfen ob `pendingUntoggle` noch in memberships-Liste — wenn nicht, `setPendingUntoggle(null)`. Pattern aus PR #55 (MediaSection orphan-cleanup). |
| DB-Insert für audit_events fehlt (z.B. DB down) nach confirmed-untoggle | PATCH committet (main query), audit fire-and-forget catch logs error. UI zeigt success. Bestehende Behavior, unverändert. |
| CSV-Export nach preserve-Untoggle | Row zeigt `paid=nein, paid_at=2026-03-15` — technisch korrekt, dokumentiert durch Spec. |

## Risks

- **Semantik-Shift bei `paid_at`**: Wird von "aktuell-bezahlt-seit" zu "zuletzt bezahlt" überladen. Niedrig-Risk weil nur internes Field, kein API-Consumer extern. Dokumentiert in Code-Kommentar + Spec.
- **User-confusion bei Tooltip "Zuletzt bezahlt"**: Neue Information im Tooltip kann überraschen. Mitigation: der Text ist selbst-erklärend + Audit-Log ist der Source-of-Truth bei Unklarheit.
- **Modal-Fatigue**: Confirm bei jedem Untoggle könnte admin-annoy sein. Mitigation: Untoggle ist seltene Action (nur bei Korrektur). Bei >10 Untoggles/Monat: Feedback einholen, evtl. Opt-Out-Setting als Follow-up.
- **Race: Confirm-Modal + concurrent paid-Änderung durch anderen Admin**: Modal zeigt stale-state (paid=true), zweiter Admin macht PATCH auf false, erster Admin bestätigt → PATCH false-auf-false → SQL ist no-op (`ELSE paid_at` branch), keine Änderung, Response ok. Akzeptable Edge Case, keine Aktion nötig.

## Verification (Smoke Test Plan)

Nach Staging-Deploy:

1. **S1 OFF→ON bleibt 1-Klick**: Unbezahlten Eintrag klicken → direkt toggled, kein Modal. Tooltip nach Toggle: "Seit {datetime}".
2. **S2 ON→OFF triggert Modal**: Bezahlten Eintrag klicken → Modal erscheint mit Name + Preserve-Hinweis. Abbrechen → keine Änderung. Erneut klicken → Modal → Bestätigen → Row wird grau (paid=false). Tooltip zeigt jetzt "Zuletzt bezahlt: {datetime}" (preservierter Wert).
3. **S3 Re-Toggle nach preservierter paid_at**: Untoggled Eintrag mit preserviertem `paid_at=T1` → Klick → direct toggle (OFF→ON) → Tooltip zeigt "Seit {NEW datetime}" (T2, nicht T1). Audit-Log hat beide Events mit T1 + T2 als `created_at`.
4. **S4 Preserve via DB-Query**: Zwei Toggles (OFF→ON mit T1, ON→OFF) via UI durchführen. Dann `SELECT paid, paid_at FROM memberships WHERE id=X` → `paid=false, paid_at=T1`. Bestätigt Preserve-Logik.
5. **S5 Modal A11y**: Tab-Navigation bleibt im Modal, Escape schließt (wenn kein PATCH läuft), aria-labelledby auf Title-Heading.
6. **S6 Concurrent Toggles**: Row A untoggle-Modal öffnen → gleichzeitig Row B direkt-Toggle → beide unabhängig funktional, keine State-Kollision.

## Deploy & Verify

Nach Merge:
1. CI grün (`gh run watch`)
2. `https://alit.hihuydo.com/api/health/` → 200
3. Staging + Prod: S1-S6 durchgehen
4. `docker compose logs --tail=30 alit-web` — keine neuen Errors
5. DB-Sanity: `SELECT id, paid, paid_at FROM memberships WHERE paid = false AND paid_at IS NOT NULL LIMIT 5;` — nach erstem Untoggle-on-paid-row sollten Einträge auftauchen. Vor Deploy: keine (weil NULL immer gesetzt wurde). Nach Deploy + erstem Untoggle: mindestens einer.
