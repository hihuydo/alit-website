# Codex Spec Review — 2026-04-16

## Scope
Spec: `tasks/spec.md` (Dirty-Editor-Warnung bei Tab-Switch)  
Sprint Contract: 10 Done-Kriterien + 4 Tasks-Gruppen  
Basis: Sonnet NEEDS WORK (expected for spec-only commit)

## Findings

### [Contract]
1. **Test-Contract ist in aktueller Toolchain nicht mechanisch erfüllbar.**
   - Spec fordert `DirtyContext.test.tsx` mit RTL-Modal-Flow.
   - Aktuell: `vitest.config.ts` läuft nur `src/**/*.test.ts` und `environment: "node"`; `@testing-library/react` fehlt in `package.json`.
   - Folge: Done-Kriterium #7 kann "formal erfüllt" wirken, aber real nicht in CI laufen.
   - Fix im Spec/Contract: entweder (A) explizit `@testing-library/react` + `jsdom` + `include` für `*.test.tsx` als Must-Have aufnehmen, oder (B) Testoberfläche auf pure Logik-Tests ohne DOM ändern.

2. **Done-Kriterium "pnpm lint keine neuen warnings" ist nicht sauber operationalisiert.**
   - Projekt hat bereits bekannte Warnings.
   - Ohne baseline-diff im Contract bleibt unklar, wie "neu" gemessen wird.
   - Fix: konkretisieren wie in `tasks/todo.md` (keine neuen Warnings gegenüber `main`) und optional Command/Check dokumentieren.

### [Correctness]
1. **Autosave-In-Flight vs. "Verwerfen" ist inkonsistent spezifiziert.**
   - Spec argumentiert: bei Verwerfen werde pending Autosave beim Unmount harmlos.
   - Tatsächlich in aktueller Architektur: nur Timer wird gecleart; laufende `fetch`-Requests werden nicht abgebrochen.
   - Risiko: User klickt "Verwerfen", Tab wechselt, aber ein bereits gestarteter Autosave schreibt dennoch Änderungen in die DB.
   - Das verletzt die Nutzererwartung von "verwerfen".
   - Fix im Spec: explizite Semantik entscheiden und absichern:
     - Option A: "Verwerfen" darf laufende Autosaves nicht persistieren (AbortController/Version-Guard).
     - Option B: "Verwerfen" bedeutet nur UI-Wechsel; laufende Autosave kann noch persistieren (dann klare UX-/Copy-Anpassung).

2. **Unklarer Umgang mit mehrfachen `confirmDiscard`-Aufrufen während offenem Modal.**
   - Nicht definiert, ob letzte Aktion gewinnt, erste Aktion gelockt bleibt, oder weitere Klicks ignoriert werden.
   - Fix: im Spec festlegen (empfohlen: solange Modal offen, weitere destructive Klicks ignorieren).

### [Security]
1. **Keine neue sicherheitskritische Lücke im Spec-Kern identifiziert.**
   - Feature ist primär UX/State-Guard.
   - Kein zusätzlicher Auth-/Data-Exposure-Pfad.

### [Architecture]
1. **Hidden coupling zwischen `DirtyKey` und Dashboard-Tabs.**
   - `DirtyKey` ist fixe Union (`agenda|journal|projekte|alit`), `Tab` lebt separat in `page.tsx`.
   - Drift-Risiko bei zukünftigen Tab-/Editor-Erweiterungen (neuer Editor-Tab ohne Dirty-Integration).
   - Fix: Spec ergänzt Governance-Regel: neuer Editor-Tab darf nur mit neuem `DirtyKey` + Wiring eingeführt werden (Review-Checkliste).

2. **Scope ist grundsätzlich sprint-tauglich, aber knapp wegen Infrastruktur-Anpassung.**
   - Kern-Implementierung (Context + Wiring) ist klein.
   - Test-Infrastruktur-Delta (RTL/jsdom) ist der eigentliche Scope-Treiber.
   - Empfehlung: **kein funktionales Split**, aber Contract vor Generator-Start präzisieren.

3. **A11y-Anforderungen für Modal sind unterdefiniert.**
   - Spec nennt ESC/Backdrop, aber nicht Fokusführung (`role="dialog"`, `aria-modal`, initial focus, focus return).
   - Bei Confirm-Dialog relevant für Keyboard-User.
   - Fix: als Must-Have oder explizit als Follow-up markieren.

### [Nice-to-have]
1. **i18n ist hier vertretbar out-of-scope**, da Dashboard aktuell deutschsprachig ist; dennoch sollte die Spec kurz notieren, dass Modal-Texte bei späterer Dashboard-Lokalisierung in Dictionary wandern.

2. **"Editor offen = dirty"** ist pragmatisch korrekt für Datenverlustschutz, aber erzeugt bewusst False-Positives. Als Follow-up ist das bereits sauber dokumentiert.

## Verdict
NEEDS WORK

## Summary
Die Spec ist strukturell kohärent und in sinnvoller Sprint-Größe, hat aber zwei blocker-nahe Lücken vor Implementierung:  
1) Autosave-Discard-Semantik ist im In-Flight-Fall derzeit widersprüchlich zur UX-Behauptung.  
2) Test-Done-Kriterium ist mit aktueller Vitest-Konfiguration/Dependencies nicht verifizierbar.  

Mit diesen Präzisierungen bleibt der Sprint **nicht split-bedürftig**, aber erst dann sauber kontraktfähig.
