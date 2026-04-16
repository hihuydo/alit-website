# Codex Spec Review Round 2 — 2026-04-16

## Scope
Spec: tasks/spec.md v2 (Dirty-Editor-Warnung bei Tab-Switch)
Sprint Contract: 18 Done-Kriterien
Basis: Round-1 findings integrated + Sonnet qa-report.md NEEDS WORK (erwartet)

## Round-1 Findings Verification
1. [PARTIAL] Test-Contract mechanically executable — v2 integriert RTL+jsdom als Must-Have und Tasks; jedoch ist der konkrete Contract in `tasks/todo.md` auf `environmentMatchGlobs` festgelegt, was mit der aktuellen Vitest-Toolchain im Repo voraussichtlich nicht verfügbar ist. Damit ist die Intention integriert, die Ausführungsvorschrift aber nicht stabil.
2. [PARTIAL] Autosave in-flight vs Verwerfen — AbortController/Signal ist in v2 ergänzt, aber die Spezifikation verortet das `AbortError`-Schlucken im `JournalEditor`, während der Fehlerpfad architektonisch im `JournalSection.handleSave(fetch)` entsteht. Ohne Klarstellung bleibt ein Banner-Leak-Risiko.
3. [VERIFIED] Multi-click confirmDiscard — State-Guard ist als Must-Have + Testfall sauber spezifiziert (weitere Calls während offenem Modal = no-op).
4. [VERIFIED] DirtyKey vs Tab drift governance — Governance-Note ist explizit als Must-Have aufgenommen.
5. [VERIFIED] Modal a11y — als explizites Follow-up (out of sprint) klar markiert; damit kein impliziter Scope-Leak mehr im Sprint.
6. [VERIFIED] Lint baseline — gegen `main`-Baseline (9 warnings) operationalisiert.

## NEW Findings (only issues round-1 did not cover)

### [Contract]
1. **Vitest-Config-Anforderung ist derzeit widersprüchlich/fragil formuliert.**
- `spec.md` erlaubt `environment: "jsdom"` **oder** `environmentMatchGlobs`.
- `todo.md` fordert dagegen explizit `environmentMatchGlobs` als Done-Kriterium.
- In der aktuellen Repo-Toolchain (`vitest@4.1.4`) ist `environmentMatchGlobs` nicht als verfügbare Config-Option erkennbar.
- Risiko: Done-Kriterium kann formal nicht erfüllbar sein, obwohl Tests korrekt mit alternativer, unterstützter Konfiguration laufen.
- Fix: Contract auf unterstützte Variante normieren (z. B. global `environment: "jsdom"` + per-file `@vitest-environment node` dort, wo nötig; oder auf Vitest-Projekte splitten).

### [Correctness]
1. **AbortError-Catch liegt im falschen Layer spezifiziert.**
- Aktuelle Architektur: `JournalEditor` ruft `onSave(...)`; der eigentliche `fetch` und dessen `catch` passieren in `JournalSection.handleSave`.
- Wenn `AbortError` nur im Editor „silent“ behandelt wird, kann `JournalSection` trotzdem `setError("Verbindungsfehler")` setzen.
- Fix: Spec/Todo präzisieren, dass `AbortError` im `JournalSection.handleSave` (oder in einem nach oben geworfenen Fehlerpfad) explizit ohne Error-Banner behandelt werden muss.

2. **"Verwerfen garantiert, dass kein in-flight-Autosave mehr in DB landet" ist zu stark.**
- Client-seitiges `abort()` ist nur best-effort: ist der Request serverseitig bereits verarbeitet, kann der Write trotz Abort schon committed sein.
- Risiko: Spezifikationsversprechen ist strenger als technisch garantiert.
- Fix: Wording auf best-effort präzisieren oder mit serverseitigem Discard-Mechanismus absichern (z. B. request version/token validation).

### [Security]
Keine neuen sicherheitskritischen Findings aus v2.

### [Architecture]
Keine neuen Architektur-Blocker über Round-1 hinaus.

### [Nice-to-have]
Keine neuen Nice-to-have Findings.

## Verdict
NEEDS WORK

## Summary
3 new findings: Contract 1, Correctness 2, Security 0, Architecture 0, Nice-to-have 0.
