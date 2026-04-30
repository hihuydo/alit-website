# Codex Spec Review — 2026-04-30

## Scope
Spec: tasks/spec.md (S2c Auto-Layout Single Source of Truth)
Sprint Contract: 9 Done-Kriterien (DK-1 through DK-9)
Basis: Sonnet R12 NEEDS WORK (HIGH + MEDIUM are false positives, LOW is theoretical)

## Findings

### [Contract] — Sprint-Contract-Verletzung oder fehlendes Must-Have
[Contract] — `tasks/todo.md` driftet in mehreren DKs vom eigentlichen Spec weg. DK-1 in `tasks/todo.md` beschreibt `packAutoSlides` als "Phase-aware Budgets per slide-position", während `tasks/spec.md` DK-1 explizit das Gegenteil festlegt: phase-agnostisch, kein `phase`-Parameter, nur `firstSlideBudget`/`normalBudget`. DK-5 in `tasks/todo.md` verliert den Must-have-Teil aus dem Spec, dass `splitBlockToBudget` generifiziert werden muss. DK-6 in `tasks/todo.md` klingt wie eine vollständige Matrix-Garantie, obwohl das Spec selbst `too_long`-Cases und empty-body/grid-alone-Asymmetrien aus der Assertion ausnimmt. Affected: `tasks/todo.md` DK-1, DK-5, DK-6 vs. `tasks/spec.md` DK-1, DK-5, DK-6. Suggested fix: `tasks/todo.md` wortgleich an das Spec angleichen; die Ausnahmen für DK-6 explizit in den Contract ziehen statt nur in den Test-Kommentar.

[Contract] — Die Done-Definition ist nicht vollständig an die Projektkonventionen gebunden. In `CLAUDE.md` ist `pnpm build`, `pnpm test` und `pnpm audit --prod` vor Abschluss Pflicht. In `tasks/todo.md` fehlen `pnpm build` und `pnpm audit --prod` als explizite Gates; für einen Refactor in `src/lib/instagram-post.ts` ist `build` relevant, weil die S2c-Änderung neue Exports, Generics und Route-Consumer betrifft. Suggested fix: Done-Definition um `pnpm build` und `pnpm audit --prod` ergänzen, damit der Contract mit den repo-weiten Regeln übereinstimmt.

### [Correctness] — Technische Korrektheit / Edge Cases / Race Conditions
[Correctness] — Das Spec pinnt die user-visible Semantik von `too_long`/raw slide count nicht sauber fest, obwohl diese heute API- und UI-Verhalten steuert. Aktuell hängen `InstagramExportModal.tsx`, `/api/dashboard/agenda/[id]/instagram/route.ts`, `/api/dashboard/agenda/[id]/instagram-slide/[slideIdx]/route.tsx` und der Layout-Editor an Warning-Semantik und Cap-Verhalten. Whole-block packing kann die Anzahl der Text-Slides gegenüber dem alten cross-slide splitting verändern; damit ändern sich potentiell Download-Disablement, `slide_not_found` vs. `too_long` (404 vs. 422) und `too_many_blocks_for_layout`. DK-6 beweist nur Boundary-Gleichheit zwischen Editor und Renderer, nicht die Stabilität dieser externen Contracts. Suggested fix: explizites Must-have ergänzen, ob `too_long`/hard-cap-Semantik unverändert bleiben muss oder bewusst geändert werden darf; zusätzlich Route-/resolver-level Regressionstests für Warning-Propagation und 404/422-Verhalten auf oversized Fixtures aufnehmen.

### [Security] — Security / Auth / Data Integrity
Keine blockierende Security-/Auth-Lücke gefunden. S2c ändert keine Auth-Grenzen, kein DB-Schema und keine Persistenzformate.

### [Architecture] — Architektur-Smells mit konkretem Risk (kein Nice-to-have)
[Architecture] — Das Spec führt eine neue versteckte Kopplung ein, indem der Renderer von `flattenContent(...)` auf `flattenContentWithIds(...)` umgestellt wird und id-lose Blöcke nur noch per `console.warn` gedroppt werden. Heute ist der Renderer textbasiert und ID-agnostisch; S2c macht ihn implizit abhängig von einer Editor-/content-shape-Invariante. Das ist mehr als ein interner Refactor: es ändert die Datenverträglichkeit des Exportpfads. Der Hinweis "bounded zur prod-Reality vom S1b-Release" reduziert das Risiko, eliminiert es aber nicht; ein einzelner Legacy-Block würde nach dem Merge im Export verschwinden statt wie bisher gerendert zu werden. Suggested fix: entweder Boundary-Berechnung renderer-seitig auf synthetischen IDs/Schatten-Objekten aufbauen und `flattenContent` tolerant lassen, oder die ID-Invariante als explizite Precondition mit verifizierbarem Gate formulieren. Reines Logging reicht hier nicht als Migrationsstrategie.

### [Nice-to-have] — Out-of-Scope, gehört nach memory/todo.md
[Nice-to-have] — Wenn der defensive `[s2c] dropped blocks without id`-Logpoint bleibt, sollte er an das bestehende Projektmuster für strukturierte Telemetrie aus `memory/lessons.md` angepasst werden (`JSON.stringify({ type, ... })`) statt als freier `console.warn`-String mit Objekt. Nützlich für spätere Logsuche, aber kein Sprint-Blocker.

## Verdict
NEEDS WORK

## Summary
4 findings — 2 Contract, 1 Correctness, 0 Security, 1 Architecture, 1 Nice-to-have.
