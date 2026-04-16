# Sprint: Dirty-Editor-Warnung bei Tab-Switch
<!-- Spec: tasks/spec.md v3 (post Codex Spec-Review R2) -->
<!-- Started: 2026-04-16 -->
<!-- Revised: 2026-04-16 — Codex R1 findings integrated (RTL+jsdom, AbortController, State-Guard, Governance) -->
<!-- Revised: 2026-04-16 — Codex R2 precisions (per-file jsdom pragma, AbortError in handleSave layer, best-effort wording) -->

## Done-Kriterien
> Alle müssen PASS sein bevor der Sprint als fertig gilt.

### Context + Provider
- [ ] `src/app/dashboard/DirtyContext.tsx` existiert und exportiert: `DirtyProvider`, `useDirty()` (mit `setDirty(key, bool)` + `confirmDiscard(action)`).
- [ ] `DirtyKey` als union type `"agenda" | "journal" | "projekte" | "alit"` exportiert.
- [ ] `DirtyProvider` registriert `window.addEventListener("beforeunload", ...)` (mount) und entfernt ihn bei unmount.
- [ ] `confirmDiscard` State-Guard: während Modal offen, weitere Aufrufe werden ignoriert (kein Overwrite der pending action).
- [ ] Governance-Kommentar in `DirtyContext.tsx`: "Neuer Editor-Tab = neuer DirtyKey + Section-Wiring, sonst verliert Editor Verlustschutz."

### page.tsx Wiring
- [ ] `src/app/dashboard/page.tsx` wrapping: Tab-Row, Konto-Button, Abmelden-Button gehen durch `confirmDiscard`. Re-Klick auf aktuellen Tab = No-Op (kein Modal, kein Refetch).

### Section-Wirings + Autosave-Abort
- [ ] In jeder der 4 Editor-Sections (`AgendaSection`, `JournalSection`, `ProjekteSection`, `AlitSection`): `useEffect(() => { setDirty("<key>", showForm); return () => setDirty("<key>", false); }, [showForm, setDirty])`.
- [ ] `JournalSection.handleSave` akzeptiert optional `signal: AbortSignal` in `opts` und reicht an `fetch(url, { signal })` durch.
- [ ] `JournalSection.handleSave`-catch erkennt `AbortError` (`err instanceof DOMException && err.name === "AbortError"`) und returnt silent, ohne `setError`-Banner.
- [ ] `JournalEditor` hält `AbortController`-Ref für pending autosave: wird bei jedem handleAutoSave neu gesetzt (vorheriger abortet), Cleanup bei unmount ruft `.abort()`.

### Confirm-Modal
- [ ] Confirm-Modal nutzt bestehendes `Modal.tsx` (keine neue Abstraktion), zeigt Titel "Ungesicherte Änderungen verwerfen?" + zwei Buttons "Zurück" + "Verwerfen".

### Test-Infra
- [ ] `@testing-library/react` + `jsdom` als dev-dependencies in `package.json`.
- [ ] `vitest.config.ts` erweitert: `include` enthält `*.test.tsx`; globale environment bleibt `node`, jsdom-Tests nutzen per-file `// @vitest-environment jsdom` Pragma-Kommentar.
- [ ] Bestehende Tests (`robots.test.ts`, `sitemap.test.ts`, `src/lib/**/*.test.ts`) bleiben grün (Regression-Check).
- [ ] `src/app/dashboard/DirtyContext.test.tsx` hat mindestens 6 grüne Tests (setDirty-map, confirmDiscard-clean, Verwerfen, Zurück, multi-key, State-Guard).

### Quality Gates
- [ ] `pnpm tsc --noEmit` → 0 errors.
- [ ] `pnpm lint` → keine neuen warnings gegenüber `main`-Baseline (aktuell 9).
- [ ] Manueller Smoke-Test auf Staging: Editor öffnen, Tab-Klick → Modal; "Zurück" → bleibt; "Verwerfen" → switcht; Editor zu → Tab-Klick ohne Modal; hektisches Tab-Spam mit offenem Modal → ignoriert.
- [ ] Deploy-Verifikation nach Merge: CI grün, /api/health/, /de/, /dashboard/ alle 200, Logs clean.

## Tasks

### 1. Test-Infra setup (vorziehen, damit Tests von Anfang an laufen)
- [ ] `pnpm add -D @testing-library/react jsdom`
- [ ] `vitest.config.ts` erweitern: `include: [..., "src/**/*.test.tsx"]`. Globale environment = node bleibt.
- [ ] Smoke-Test: `pnpm vitest run` — alle bestehenden Tests weiter grün.

### 2. DirtyContext + Tests
- [ ] `DirtyContext.tsx`: Context, Provider, Hook, Confirm-Modal inline gerendert, beforeunload-Listener, State-Guard, Governance-Kommentar.
- [ ] `DirtyContext.test.tsx`: 6+ Tests (siehe Done-Kriterien).

### 3. page.tsx Wiring
- [ ] `<DirtyProvider>` um Header + Tab-Row + Section-Render.
- [ ] Tab-Button onClick → `confirmDiscard(() => setActive(tab.key))`, mit Early-Return wenn `tab.key === active`.
- [ ] Konto-Button onClick → `confirmDiscard(() => setActive("konto"))`, gleiches Early-Return.
- [ ] Abmelden-Button onClick → `confirmDiscard(handleLogout)`.

### 4. 4 Section-Wirings
- [ ] `AgendaSection.tsx`: `useDirty()` + `useEffect` mit `showForm`.
- [ ] `JournalSection.tsx`: `useEffect` mit `showForm` + `handleSave(opts)` nimmt `signal` und reicht an `fetch` durch; catch erkennt AbortError und returnt silent.
- [ ] `JournalEditor.tsx`: AbortController-Ref für autosave (bei jedem handleAutoSave-Call: vorherigen abort-en, neuen erzeugen, signal an onSave weitergeben); Cleanup bei unmount ruft `.abort()`.
- [ ] **Erste jsdom-Test-Datei** erhält `// @vitest-environment jsdom`-Pragma als erste Zeile.
- [ ] `ProjekteSection.tsx`: `useDirty()` + `useEffect`.
- [ ] `AlitSection.tsx`: `useDirty()` + `useEffect`.

### 5. Verifikation
- [ ] `pnpm vitest run` komplette Suite grün (inkl. neue jsdom-Tests).
- [ ] `pnpm tsc --noEmit` clean.
- [ ] `pnpm lint` clean (kein new warning gegenüber main).
- [ ] Dev-Server lokal + manueller Smoke-Test der 5 Dirty-Szenarien (inkl. hektisches Tab-Spam).
- [ ] Feature-Branch + Push → Staging-Deploy verifizieren (Schritte 1+2+3 der Deploy-Verifikation aus CLAUDE.md).

## Notes
- Codex Spec-Review v1 (2026-04-16) Findings vollständig integriert: AbortController (Correctness #1), State-Guard (Correctness #2), RTL+jsdom (Contract #1), Governance-Kommentar (Architecture #1), Lint-Baseline (Contract #2).
- Modal-a11y (Focus-Trap, role=dialog, aria-modal, focus-return) als Follow-up in `memory/todo.md` → separater Dashboard-A11y-Sprint.
- `memory/lessons.md` 2026-04-14 Auto-Save Lesson beachten: autosave-Timer-Cleanup bei JournalEditor-unmount existiert bereits; AbortController ergänzt das um den in-flight fetch-Pfad.
- `memory/lessons.md` 2026-04-14 Ref-Mutation Lesson: AbortController-Ref + action-Callback-Ref dürfen im Handler mutiert werden, nicht im Render-Body.
- Bestehendes `Modal.tsx` reicht — keine neue Modal-Abstraktion.
