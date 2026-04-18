# Codex Spec Review Round 2 — Mobile Dashboard Sprint A
Date: 2026-04-18
Model: gpt-5.4 (OpenAI Codex CLI)

## Basis
Round 1: 9 findings (4 Contract, 2 Correctness, 1 UX, 1 Architecture, 1 Nice-to-have).
Round 2: v2 spec verifiziert gegen R1 + Suche nach neu eingeführten Issues.

## Verification of Round 1 Findings

### C1 [Contract] Dirty-Guard-Ownership
Status: FIXED
Comment: `tasks/spec.md:60-84` und `tasks/todo.md:11-14,45-55,57-68` machen die Ownership jetzt grundsätzlich sauber: `MobileTabMenu` ist dumb, `onSelect` bleibt callback-only, `confirmDiscard` bleibt im Parent. Das ist auch mechanisch besser als v1, weil die Component-Props keinen Dirty-Guard mehr enthalten. Die zusätzliche `setBurgerOpen(false)`-Anweisung in `goToTab` ist redundant, aber sicher: bei `handleBurgerSelect` ist der State schon `false`, React bails out beim zweiten gleichen Set. Kein Race daraus, nur unnötige Doppelung.

### C2 [Contract] A11y Focus-Trap via Modal reuse
Status: PARTIALLY FIXED
Comment: Der richtige Prinzip-Entscheid ist jetzt da: v2 verlangt explizit Modal-Reuse statt eigener Trap-Implementierung (`tasks/spec.md:60-66,165-168`, `tasks/todo.md:11,45-55`). Mechanisch ist es aber noch nicht sauber verankert, weil die Spec/Todo den Primitive mit `<Modal isOpen={isOpen} ...>` aufrufen (`tasks/spec.md:64`, `tasks/todo.md:52`), während der aktuelle Primitive `open`, nicht `isOpen`, erwartet (`src/app/dashboard/components/Modal.tsx:6-10,25`). Ohne Korrektur erzwingt v2 hier einen Type-/Build-Fehler oder einen unnötigen API-Umbau am Modal.

### C3 [Contract] DragHandle-Contract vs. Row-Layout-Impact
Status: PARTIALLY FIXED
Comment: Der Widerspruch aus R1 ist entschärft: v2 behauptet nicht mehr gleichzeitig "44x44" und "keine Layout-Folgen", sondern dokumentiert den Impact und schiebt Row-Redesigns sauber in Sprint B (`tasks/spec.md:90-93,189-191`, `tasks/todo.md:19,93-95`). Was weiter fehlt, ist eine harte Abbruchkante für Sprint A: die Spec sagt nur "truncated etwas früher, nicht broken", aber nicht, was bei sichtbarem Clipping von Actions/Text auf 375px passiert. Mit den aktuellen Row-Strukturen in Agenda/Journal/Projekte/Alit (`src/app/dashboard/components/AgendaSection.tsx:602-626` und analoge Stellen) bleibt das ein manueller Ship-Risk, kein mechanisch abgesicherter Contract.

### C4 [Contract] Mechanischer Test für Burger × Dirty-Integration
Status: STILL OPEN
Comment: R1 wollte genau den riskantesten Flow mechanisch absichern. v2 macht den Parent-Integration-Test aber ausdrücklich optional (`tasks/spec.md:101-110`, speziell `:108`; `tasks/todo.md:21,98-104`). Damit kann Sprint A formal bestanden werden, ohne dass `setBurgerOpen(false) -> goToTab() -> confirmDiscard()` jemals automatisiert geprüft wurde. Das ist nicht nur beschreibend, sondern weiterhin nicht enforced.

### K1 [Correctness] Viewport-Resize-State-Sync
Status: FIXED
Comment: Der fehlende State-Reset aus R1 ist jetzt konkret spezifiziert (`tasks/spec.md:86-88,179-182`, `tasks/todo.md:14,48`). Der vorgeschlagene `matchMedia('(min-width: 768px)')`-Listener ist technisch die richtige Ebene. Der im Prompt genannte Edge-Case "Listener feuert auch wenn schon closed" ist unkritisch: `onOpenChange(false)` auf bereits `false` ist ein no-op. Zusätzlich gibt es hier keinen Portal-Sonderfall; das aktuelle `Modal` rendert inline, nicht in ein Portal (`src/app/dashboard/components/Modal.tsx:87-119`).

### K2 [Correctness] Keine stacked modals
Status: FIXED
Comment: v2 dreht die Reihenfolge jetzt explizit richtig: Burger schließen, dann erst `goToTab`, damit das Dirty-Modal alleiniger Dialog bleibt (`tasks/spec.md:72-84,175-177`, `tasks/todo.md:13,61-68`). Das passt auch zum aktuellen Dirty-Confirm, das selbst bereits ein `Modal` ist (`src/app/dashboard/DirtyContext.tsx:138-161`). Die vom Prompt angesprochene Doppel-`setBurgerOpen(false)` bleibt redundant-but-safe, nicht racy.

### U1 [UX] Tablet-Tab-Labels 768–1023
Status: FIXED
Comment: v2 definiert jetzt endlich eine konkrete Tablet-Strategie statt "später feinjustieren": `text-xs md:text-sm lg:text-base`, `min-w-0`, `truncate`, `title` (`tasks/spec.md:68-71,184-187`, `tasks/todo.md:16,78-89`). Wichtig mechanisch: bei `md` greift bereits `text-sm`, also 14px ab 768px; der im Prompt genannte 12px-Fall trifft auf den Tab-Bar-Code nicht zu. Ob die Labels optisch gut genug sind, ist weiter UX-Geschmackssache, aber die R1-Lücke "unter-spezifiziert" ist geschlossen.

### A1 [Architecture] MobileTabMenu nicht inline in page.tsx
Status: FIXED
Comment: v2 verlangt die separate Datei ausdrücklich (`tasks/spec.md:60-66,152-158,165-168`, `tasks/todo.md:11,45-55,57-60`). Damit ist die Architekturrichtung aus R1 nicht nur beschrieben, sondern über File-Plan und Done-Kriterien mechanisch festgelegt.

### N1 [Nice-to-have] globals.css-Auto-Zoom-Regel bereits vorhanden
Status: FIXED
Comment: v2 hat die Korrektur übernommen und stuft `text-base` zutreffend als lokale Klarheit statt Sprint-kritische Auto-Zoom-Rettung ein (`tasks/spec.md:39,95-99,193-195`). Das deckt sich mit `src/app/globals.css:691-697`.

## New Findings (only NEW issues introduced by v2 or missed in v1)

### [Contract] Modal-API-Drift in v2 bricht die Reuse-Strategie mechanisch
`tasks/spec.md:62-64` und `tasks/todo.md:12,47,52` definieren `MobileTabMenu` mit `isOpen` und zeigen den Modal-Aufruf als `<Modal isOpen={isOpen} ...>`. Der aktuelle Primitive akzeptiert aber `open`, nicht `isOpen` (`src/app/dashboard/components/Modal.tsx:6-10,25`), und alle existierenden Call-Sites nutzen `open` (`src/app/dashboard/DirtyContext.tsx:155`, `src/app/dashboard/components/SignupsSection.tsx:646,680`, `src/app/dashboard/components/DeleteConfirm.tsx:16`). Das ist kein kosmetischer Drift, sondern ein mechanischer Spezifikationsfehler: entweder scheitert die Implementierung direkt, oder der Sprint zieht einen unnötigen API-Rename durch einen breit genutzten Primitive. Fix in v2: Prop-Namen überall auf `open` korrigieren und `MobileTabMenuProps` nicht auf die Modal-API spiegeln.

### [Correctness] Safe-area-top wird im Login doppelt appliziert
v2 fordert gleichzeitig `paddingTop: env(safe-area-inset-top)` auf dem Dashboard-`body` (`tasks/spec.md:51-52`, `tasks/todo.md:10,37-38`) und zusätzlich auf dem Login-Outer-Container (`tasks/spec.md:95-99`, `tasks/todo.md:20,39-42`). Im aktuellen Segment liegt `/dashboard/login/` bereits unter `src/app/dashboard/layout.tsx`, also unter genau diesem `body` (`src/app/dashboard/layout.tsx:20-27`). Das führt auf Notch-Geräten zu doppeltem Top-Offset für den Login-Screen. Fix in v2: Safe-area-top entweder nur auf Segment-`body` oder nur auf Login-Container, nicht auf beiden.

## Verdict
NEEDS WORK

## Summary
- Round 1: 6 fixed / 2 partial / 1 open
- New findings: 2
- Recommendation: v2 vor Implementierung noch einmal patchen. Pflichtfixes sind
  `Modal isOpen` -> `open`,
  Login-safe-area-Doppelpadding entfernen,
  Parent-Integration-Test für Burger × Dirty von optional auf required ziehen.

