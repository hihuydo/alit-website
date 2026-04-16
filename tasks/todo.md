# Sprint: Dirty-Editor-Warnung bei Tab-Switch
<!-- Spec: tasks/spec.md -->
<!-- Started: 2026-04-16 -->

## Done-Kriterien
> Alle müssen PASS sein bevor der Sprint als fertig gilt.

- [ ] `src/app/dashboard/DirtyContext.tsx` existiert und exportiert: `DirtyProvider`, `useDirty()` (mit `setDirty(key, bool)` + `confirmDiscard(action)`).
- [ ] `DirtyKey` als union type `"agenda" | "journal" | "projekte" | "alit"` exportiert.
- [ ] `DirtyProvider` registriert `window.addEventListener("beforeunload", ...)` (mount) und entfernt ihn bei unmount.
- [ ] `src/app/dashboard/page.tsx` wrapping: Tab-Row, Konto-Button, Abmelden-Button gehen durch `confirmDiscard`. Re-Klick auf aktuellen Tab = No-Op (kein Modal).
- [ ] In jeder der 4 Editor-Sections (`AgendaSection`, `JournalSection`, `ProjekteSection`, `AlitSection`): `useEffect(() => { setDirty("<key>", showForm); return () => setDirty("<key>", false); }, [showForm, setDirty])`.
- [ ] Confirm-Modal nutzt bestehendes `Modal.tsx` (keine neue Abstraktion), zeigt Titel "Ungesicherte Änderungen verwerfen?" + zwei Buttons "Zurück" + "Verwerfen".
- [ ] `src/app/dashboard/DirtyContext.test.tsx` hat mindestens 5 grüne Tests (siehe spec.md Req #7).
- [ ] `pnpm tsc --noEmit` → 0 errors.
- [ ] `pnpm lint` → keine neuen warnings gegenüber main.
- [ ] Manueller Smoke-Test auf Staging: Editor öffnen, Tab-Klick → Modal; "Zurück" → bleibt; "Verwerfen" → switcht; Editor zu → Tab-Klick ohne Modal.
- [ ] Deploy-Verifikation nach Merge: CI grün, /api/health/, /de/, /dashboard/ alle 200, Logs clean.

## Tasks

### 1. Context + Tests
- [ ] Dependency-Check: `@testing-library/react` in `package.json`? Bei Bedarf als dev-dep nachziehen.
- [ ] `DirtyContext.tsx` schreiben: Context, Provider, Hook, Confirm-Modal inline gerendert, beforeunload.
- [ ] `DirtyContext.test.tsx`: 5+ Tests für setDirty-Map, confirmDiscard-clean, confirmDiscard-dirty + Verwerfen, confirmDiscard-dirty + Zurück, multi-key-Verhalten.

### 2. page.tsx Wiring
- [ ] `<DirtyProvider>` um Header + Tab-Row + Section-Render.
- [ ] Tab-Button onClick → `confirmDiscard(() => setActive(tab.key))`, mit Early-Return wenn `tab.key === active`.
- [ ] Konto-Button onClick → `confirmDiscard(() => setActive("konto"))`, gleiches Early-Return.
- [ ] Abmelden-Button onClick → `confirmDiscard(handleLogout)`.

### 3. 4 Section-Wirings
- [ ] `AgendaSection.tsx`: `useDirty()` + `useEffect` mit `showForm`.
- [ ] `JournalSection.tsx`: dito (inkl. mental check: autosave + unmount Race harmlos).
- [ ] `ProjekteSection.tsx`: dito.
- [ ] `AlitSection.tsx`: dito.

### 4. Verifikation
- [ ] `pnpm vitest run` komplette Suite grün (inkl. bestehende Tests).
- [ ] `pnpm tsc --noEmit` clean.
- [ ] `pnpm lint` clean.
- [ ] Dev-Server lokal + manueller Smoke-Test der 4 Dirty-Szenarien.
- [ ] Feature-Branch + Push → Staging-Deploy verifizieren (Schritte 1+2+3 der Deploy-Verifikation aus CLAUDE.md).

## Notes
- `memory/lessons.md` 2026-04-14 Auto-Save Lesson beachten: Cleanup von pending autosave-Timers bei JournalSection-unmount MUSS schon da sein (nicht Teil dieses Sprints, aber Mental-Check beim Implementieren).
- `memory/lessons.md` 2026-04-14 Ref-Mutation Lesson: action-Callback in `useRef` darf im Handler mutiert werden, nicht im Render-Body.
- Bestehendes `Modal.tsx` reicht — keine neue Modal-Abstraktion.
- Kein `@testing-library/react` installiert? Fallback: Context-Logik als pure JS-Tests ohne DOM-Render, Modal-Flow via Manual-Test statt Automated.
