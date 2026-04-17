# Spec: Dashboard-i18n für Confirm-Modals (DeleteConfirm + Bulk-Delete + Paid-Untoggle)
<!-- Created: 2026-04-17 -->
<!-- Author: Planner (Claude Opus 4.7) -->
<!-- Status: v1 draft — pre-implementation -->

## Summary

Zieht die hardcoded Strings der drei Dashboard-Confirm-Modals nach `src/app/dashboard/i18n.ts` (neues Modul aus PR #51). Folge-Sprint zu Codex Weekly Review [Suggestion 2]. Kein Behavior-Change, nur String-Extraction gegen künftige Copy-Drift und als Lokalisierungs-Vorbereitung.

## Context

- PR #51 (2026-04-16) führte `dashboardStrings` mit `dirtyConfirm` + `modal.close` ein.
- Drei weitere Confirm-Modals sind seitdem dazugekommen oder blieben hardcoded:
  1. **DeleteConfirm.tsx** (per-Row-Delete, shared): Title "Löschen bestätigen" + Body-Template + 2 Buttons.
  2. **SignupsSection Bulk-Delete-Modal**: Title + pluralisierter Body + 2 Buttons + "Lösche…"-Progress.
  3. **SignupsSection Paid-Untoggle-Modal** (PR #57): Title + Preserve-Hinweis + 2 Buttons + "Entferne…"-Progress.
- Codex Weekly Review 2026-04-16 [Suggestion 2]: "Dashboard-i18n für DeleteConfirm + Bulk-Delete-Modal-Texte — Copy-Changes würden drift erzeugen".

## Requirements

### Must Have (Sprint Contract)

1. **`src/app/dashboard/i18n.ts` erweitert** um drei neue Blöcke:
   ```ts
   deleteConfirm: {
     title: "Löschen bestätigen",
     body: (label: string) => /* "Soll <strong>{label}</strong> wirklich gelöscht werden?" */,
     cancel: "Abbrechen",
     confirm: "Löschen",
   },
   bulkDelete: {
     title: "Mehrere Einträge löschen",
     bodyMemberships: (count: number) => "Sollen {count} Mitgliedschaften wirklich gelöscht werden? …",
     bodyNewsletter: (count: number) => "Sollen {count} Newsletter-Anmeldungen wirklich gelöscht werden? …",
     cancel: "Abbrechen",
     confirm: "Löschen",
     confirming: "Lösche…",
   },
   paidUntoggle: {
     title: "Bezahlt-Status entfernen?",
     body: (name: string) => /* "Bezahlt-Status für <strong>{name}</strong> entfernen?" */,
     preserveHint: "Der Bezahlt-Zeitstempel bleibt erhalten und wird als <em>zuletzt bezahlt</em> geführt. Diese Aktion wird im Verlauf protokolliert.",
     cancel: "Abbrechen",
     confirm: "Status entfernen",
     confirming: "Entferne…",
   },
   ```
   - **Body-Templates mit Markup:** Title/Cancel/Confirm bleiben flat-strings. Bodies die `<strong>` oder `<em>` enthalten werden als **ReactNode-returning Functions** exportiert, nicht als Plain-String-Templates. Grund: kein `dangerouslySetInnerHTML`, keine String-Konkat-Komplexität im Caller, XSS-safe by construction.
   - `deleteConfirm.body: (label: string) => ReactNode` returnt `<>Soll <strong>{label}</strong> wirklich gelöscht werden?</>`.
   - `paidUntoggle.body: (name: string) => ReactNode` returnt analog. `preserveHint` kann als einfacher String bleiben (`<em>` Dramaturgie via Caller-JSX-Template), ODER als ReactNode — je nach cleaneren Caller.
   - `bulkDelete.bodyMemberships` / `bodyNewsletter` sind ReactNode-Functions wegen Plural + `<strong>` für Count.

2. **`DeleteConfirm.tsx`** konsumiert `dashboardStrings.deleteConfirm`:
   - `title={dashboardStrings.deleteConfirm.title}`
   - `<p>{dashboardStrings.deleteConfirm.body(label)}</p>`
   - Buttons nutzen `.cancel` / `.confirm`.

3. **SignupsSection Bulk-Delete-Modal** konsumiert `dashboardStrings.bulkDelete`:
   - `title={dashboardStrings.bulkDelete.title}`
   - Body: `bulkDeleteTarget?.type === "memberships" ? dashboardStrings.bulkDelete.bodyMemberships(count) : dashboardStrings.bulkDelete.bodyNewsletter(count)`.
   - Buttons: `.cancel` / `.confirm` (mit `bulkDeleting ? .confirming : .confirm` toggle).

4. **SignupsSection Paid-Untoggle-Modal** konsumiert `dashboardStrings.paidUntoggle`:
   - `title={dashboardStrings.paidUntoggle.title}`
   - `<p>{dashboardStrings.paidUntoggle.body(fullName)}</p>` + `<p>{...preserveHint}</p>`.
   - Buttons: `.cancel` / `.confirm` (mit `inFlight ? .confirming : .confirm` toggle).

5. **Tests**:
   - Kein neuer Test erforderlich — Strings sind trivial-callable Functions.
   - Bestehende 165 Tests bleiben grün.

6. **`pnpm test` + `pnpm build` grün.**

### Nice to Have (Follow-up → memory/todo.md)

- DE/FR-Struktur einführen (`dashboardStrings.de`, `dashboardStrings.fr`) + Locale-Picker — erst wenn Lokalisierung tatsächlich geplant wird.
- Unit-Test-Suite für i18n-Modul (smoke: alle Keys sind non-empty). Triviale Value — niedrig-Prio.
- Extraktion weiterer hardcoded Strings (SignupsSection Header-Texte, Error-Messages) — separate Rollout falls nötig.

### Out of Scope

- **Section-spezifische Copy** (z.B. AgendaEditor Toolbar-Buttons) — per-Section-Copy bleibt in der Section-Component, wie in `i18n.ts` Kommentar dokumentiert.
- **Error-Messages** wie "Bezahlt-Status konnte nicht gespeichert werden." — bleiben section-local (zu volatil + section-spezifisch).
- **A11y-Text** (aria-labels) — bleiben inline, da sie oft dynamische Werte enthalten ("{name} auswählen") und nicht für Lokalisierung kritisch sind.

## Technical Approach

### Files to Change

| File | Change Type | Description |
|------|-------------|-------------|
| `src/app/dashboard/i18n.ts` | Modify | + `deleteConfirm`, `bulkDelete`, `paidUntoggle` Blöcke. ReactNode-returning Body-Functions importieren React. |
| `src/app/dashboard/components/DeleteConfirm.tsx` | Modify | Strings via `dashboardStrings.deleteConfirm`. |
| `src/app/dashboard/components/SignupsSection.tsx` | Modify | Bulk-Delete-Modal + Paid-Untoggle-Modal: Strings via `dashboardStrings.bulkDelete` / `.paidUntoggle`. |

### Architecture Decisions

- **ReactNode-Functions statt String-Templates**: `body: (label) => <>Soll <strong>{label}</strong>…</>` statt `body: (label) => \`Soll <strong>${label}</strong>…\`` + `dangerouslySetInnerHTML`. Vorteile:
  - XSS-safe by construction (label kann nie HTML einschleusen).
  - Caller bleibt simpel: `{dashboardStrings.deleteConfirm.body(label)}`.
  - TypeScript typed als `(arg) => ReactNode`, klar auffindbar.
- **`as const` bleibt**: Alle string-Keys als Literaltypes. Body-Functions sind als `(...) => ReactNode` typisiert (nicht als const-Literale, weil JSX-Return).
- **Keine DE/FR-Struktur jetzt**: Dashboard bleibt DE-only. Ab dem Moment wo Lokalisierung gewünscht wird, wird `dashboardStrings` zu `dashboardStrings.de` + `fr`, und ein `useDashboardStrings()`-Hook liest aus Locale-Context. Vorbereitung durch centralization reicht.
- **Shared Button-Labels nicht dedupliziert**: `cancel: "Abbrechen"` und `confirm: "Löschen"` tauchen mehrfach auf. Könnte ein gemeinsamer `buttons.cancel`-Key sein. **Decision**: per-Modal-Scope, damit Callsites klar lesen "`dashboardStrings.deleteConfirm.cancel`" statt Cross-Reference raten. Dup-Overhead gering (3× "Abbrechen"), Wartungsvorteil auch: einzelner Modal kann seinen Button rename ohne Breaking anderer.

### Dependencies

- Keine neuen imports/deps.
- React bereits in i18n.ts nötig für `ReactNode`-Typ.

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| Label enthält Sonderzeichen (< > & " ') | ReactNode-Function rendert via JSX → React escaped automatisch. Kein XSS. |
| Empty-Label (deleteConfirm) | `body("")` → `<>Soll <strong></strong> wirklich gelöscht werden?</>` — funktional-valid (leeres bold). Nicht blockierend. |
| Count=0 (bulkDelete) | bulkDelete-Modal öffnet ohnehin nie bei 0 (openBulkDelete guard in SignupsSection). Defensiv: Text mit "0" ist grammatikalisch seltsam aber nicht-crash. |
| Count=1 (bulkDelete) | Plural bleibt ("1 Mitgliedschaften" statt "1 Mitgliedschaft"). Kein Bug — Bulk-Delete wird nie mit nur 1 Row aufgerufen (normale Delete-Route hat eigene DeleteConfirm). Cast als acceptable UX-minor. |

## Risks

- **Minimal**: Pure String-Extraction, keine Logic-Änderung, keine DB-/API-Touches.
- **Regressions-Risiko**: Typo beim Copy-Move, oder Caller vergessen zu wiring. Mitigation: visuelle Inspection + Staging-Smoke.
- **ReactNode-Function vs pure String**: Mischung in `dashboardStrings` ist konsistent mit bestehendem Modul (wo `dirtyConfirm` nur Strings hatte). **Decision**: Body-Functions unterscheiden sich ausreichend durch Signatur `(arg) => ReactNode` vs Plain-String, kein API-Purismus-Problem.

## Verification (Smoke Test Plan)

Nach Deploy:

1. **S1 DeleteConfirm** — Row in Agenda/Projekte/Alit/Journal/Signups-Mitgliedschaften löschen → Modal zeigt "Löschen bestätigen" + "Soll *X* wirklich gelöscht werden?" + "Abbrechen" / "Löschen". Unverändert zu vorher.
2. **S2 Bulk-Delete** — Mehrere Memberships auswählen + "Ausgewählte löschen" → Modal zeigt pluralisierten Text. Switch zu Newsletter + Bulk-Delete → "Newsletter-Anmeldungen". Button-Text wechselt auf "Lösche…" während POST.
3. **S3 Paid-Untoggle** — Paid-Checkbox eines markierten Eintrags klicken → Modal zeigt "Bezahlt-Status entfernen?" + Name + Preserve-Hinweis. Button "Status entfernen" → "Entferne…" während PATCH.
4. **S4 No Drift** — Grep für hardcoded "Löschen bestätigen" / "Mehrere Einträge löschen" / "Bezahlt-Status entfernen" in `src/` → nur `i18n.ts` matched.

## Deploy & Verify

Nach Merge:
1. CI grün (`gh run watch`)
2. `https://alit.hihuydo.com/api/health/` → 200
3. S1-S3 stichprobenartig
4. `docker compose logs --tail=20 alit-web` — keine neuen Errors
