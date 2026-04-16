# Spec: Dirty-Editor-Warnung bei Tab-Switch
<!-- Created: 2026-04-16 -->
<!-- Author: Planner (Claude Opus 4.6) -->
<!-- Status: Draft -->

## Summary
Wenn ein Editor im Dashboard (Agenda/Discours/Projekte/Alit) offen ist und der Nutzer einen anderen Top-Tab klickt, den Konto-Button, Abmelden oder die Seite schließt, soll ein Confirm-Modal "Ungesicherte Änderungen verwerfen?" erscheinen. Nur bei Bestätigung verwirft der Switch die Editor-Eingaben; sonst bleibt der Editor offen.

## Context
- `src/app/dashboard/page.tsx` hält `active: Tab` und rendert abhängig davon genau eine `*Section`. Tab-Wechsel ist `setActive(key)`; parallel gibt es `Konto`-Button (→ `setActive("konto")`) und `Abmelden` (Logout-Fetch + Router-Push).
- Jede Editor-Section (`AgendaSection`, `JournalSection`, `ProjekteSection`, `AlitSection`) hält lokal `editing: T | null` + `creating: boolean`; Editor ist sichtbar wenn `creating || !!editing` (`showForm`). Beim Tab-Wechsel unmountet die Section — lokaler Form-State geht verloren, ohne Warnung.
- `JournalSection` hat zusätzlich Auto-Save mit Debounce (3s); innerhalb des Debounce-Fensters gehen getippte Zeichen bei Tab-Switch verloren.
- `MediaSection`, `SignupsSection`, `AccountSection` haben keine Editor-Modi in scope — dort ist Verlust-Risiko niedrig (MediaSection: Rename ist einzelnes Input, SignupsSection: nur Tabellen-Actions mit sofortigem API-Call, AccountSection: Forms mit explizitem Submit, nicht mit Tab-State gekoppelt).
- `src/app/dashboard/components/Modal.tsx` existiert bereits (Backdrop, ESC-Close, Title, Children) — lässt sich für Confirm-Dialog wiederverwenden.
- Referenz-Patterns: `react.md` (Hook-Order, adjust-state-during-render), Lesson 2026-04-14 "Ref-Mutation during render → useEffect".

## Requirements

### Must Have (Sprint Contract)
1. **Zentraler `DirtyContext`** (neues File `src/app/dashboard/DirtyContext.tsx`) mit API:
   - `setDirty(key: DirtyKey, isDirty: boolean): void` — Section meldet ihren Dirty-State.
   - `confirmDiscard(action: () => void): void` — wrapped destructive action; ruft bei sauberem State `action()` sofort, bei dirty zeigt Modal und ruft `action()` nur auf Bestätigung.
   - `DirtyKey = "agenda" | "journal" | "projekte" | "alit"`.
2. **Provider** in `dashboard/page.tsx` um den Top-Header + Tab-Row + Section-Render gewickelt.
3. **Tab-Row-Buttons, Konto-Button, Abmelden-Button** nutzen `confirmDiscard(() => setActive(tab.key))` bzw. `confirmDiscard(handleLogout)`. Reiner Re-Click auf den aktuell aktiven Tab ruft keinen Discard (kein Modal, kein Refetch).
4. **4 Editor-Wirings**: jede der vier Sections meldet bei `showForm === true` via `useEffect`:
   ```ts
   useEffect(() => { setDirty("<key>", showForm); return () => setDirty("<key>", false); }, [showForm, setDirty]);
   ```
   Dirty-Semantik = "Editor ist offen" (simple, deckt alle Edit-Aktionen inkl. Autosave-Debounce-Fenster; Cancel/Speichern schließt Editor und setzt dirty auf false).
5. **beforeunload-Listener** im Provider: wenn irgendein Key dirty ist, `e.preventDefault()` + `e.returnValue = ""` → Browser zeigt native Warnung bei Schließen/Refresh.
6. **Confirm-Modal** (via bestehendem `Modal.tsx`): Titel "Ungesicherte Änderungen verwerfen?", Text "Deine Änderungen am Editor gehen verloren.", zwei Buttons: "Zurück" (sekundär, schließt Modal) und "Verwerfen" (primär, führt action aus + schließt Modal). ESC-Close ist äquivalent zu "Zurück". Backdrop-Click ebenso.
7. **Unit-Tests** (`src/app/dashboard/DirtyContext.test.tsx`) decken:
   - `setDirty(k, true)` → `confirmDiscard` zeigt Modal, action läuft NICHT sofort.
   - `setDirty(k, false)` (oder nie gerufen) → `confirmDiscard` ruft action direkt.
   - "Verwerfen"-Klick → action läuft + Modal geschlossen.
   - "Zurück"-Klick → action läuft NICHT + Modal geschlossen.
   - Mehrere Keys gleichzeitig dirty: clearen eines bleibt dirty solange andere true sind.
8. **TypeScript + Lint clean** (`pnpm tsc --noEmit`, `pnpm lint` keine neuen Errors/Warnings).

### Nice to Have (explicit follow-up, NOT this sprint)
1. **Granulares "diff-vs-initial" Dirty-Signal** — statt "Editor offen" nur dann dirty wenn Form-Values vom Initial-State abweichen. Weniger False-Positives (User öffnet → sofort schließt → kein Prompt). Follow-up in memory/todo.md.
2. **Auto-flush-Autosave-Debounce bei confirmDiscard** — vor dem Modal ein synchroner Flush der pending autosave-Changes, damit bei "Zurück" (User bleibt) die letzten 3s getippten Zeichen nicht schon im Debounce-Timer stecken. Aktuelles Scope: User sieht Editor noch offen und kann selbst speichern.
3. **AccountSection dirty-tracking** — Konto-Form hat eigenen Submit-Loop, Tab-Switch unmountet. Im todo-Eintrag nicht erwähnt, daher explizit out-of-scope.
4. **MediaSection Rename-Input dirty-tracking** — einzelnes Input, User-Verlust-Risiko minimal.
5. **Modal-Component API um `variant`/`actions` erweitern** — aktuell nur `title`+`children`; Confirm-Dialog rendert Buttons selbst in children. Generalisierung lohnt erst mit 2. Use-Case.

### Out of Scope
- Dirty-State innerhalb MediaPicker / HashtagEditor / Sub-Modals der Sections.
- Logout bei expired Session (kein dirty-check — server-driven).
- Dirty-State über Browser-Tabs hinweg (localStorage sync).
- Keyboard-Shortcuts zum Speichern/Verwerfen.
- Nav außerhalb des Dashboards (kein `next/link`-Intercept) — Dashboard ist einzelne Route.

## Technical Approach

### Files to Change
| File | Change Type | Description |
|------|-------------|-------------|
| `src/app/dashboard/DirtyContext.tsx` | Create | Provider + hook + Confirm-Dialog-Wiring, beforeunload-Listener, TypeScript types für `DirtyKey` |
| `src/app/dashboard/DirtyContext.test.tsx` | Create | Vitest + @testing-library/react: Provider-Tests für setDirty/confirmDiscard/Modal-Flow |
| `src/app/dashboard/page.tsx` | Modify | `<DirtyProvider>` wrappen, Tab-Buttons + Konto + Abmelden onClick durch `confirmDiscard` |
| `src/app/dashboard/components/AgendaSection.tsx` | Modify | `useEffect`-Wiring: `setDirty("agenda", showForm)` |
| `src/app/dashboard/components/JournalSection.tsx` | Modify | `useEffect`-Wiring: `setDirty("journal", showForm)` |
| `src/app/dashboard/components/ProjekteSection.tsx` | Modify | `useEffect`-Wiring: `setDirty("projekte", showForm)` |
| `src/app/dashboard/components/AlitSection.tsx` | Modify | `useEffect`-Wiring: `setDirty("alit", showForm)` |

Erwartete Diff-Größe: ~150 Zeilen neu (Context + Tests) + ~30 Zeilen touched (page.tsx + 4 Sections × je 3-5 Zeilen).

### Architecture Decisions

**Warum "Editor offen" = dirty, nicht "Form-diff gegen Initial":**
- Simpler zu implementieren (ein useEffect pro Section).
- Deckt alle Edit-Szenarien inkl. RichText-contentEditable (wo diff gegen Initial HTML-Normalization erfordert).
- Deckt Autosave-Debounce-Fenster (nicht-gespeicherte Tipps in den letzten 3s).
- False-Positive "geöffnet, sofort verworfen" ist eine Nutzer-Friktion, aber kein Daten-Verlust — akzeptabler Trade-off.
- Abweichung per Follow-up-Item (siehe Nice to Have #1) dokumentiert.

**Warum Tab-Button wrapping statt Middleware/Router-Intercept:**
- Dashboard ist single-page; kein `next/link`-Nav innerhalb. Alle destructive actions gehen durch explicit click handlers.
- Kein `router.beforeUnload`-Hook in App Router (Next 15/16) für client-side nav. Custom-Intercept wäre hack; explicit handler wrapping ist sauber.
- `beforeunload`-Listener deckt Browser-Close/Refresh (die eine Route außerhalb der Dashboard-Control sind).

**Warum zentraler Provider statt per-Section-Guard:**
- Mehrere destructive triggers (Tab-Buttons, Konto, Abmelden) brauchen denselben Check — duplizieren wäre Bug-prone.
- Future-proof: neue Tabs erben den Guard durch `confirmDiscard`-Usage, nicht durch neues Boilerplate.
- `isAnyDirty()` trivial aus Map ableitbar; Sections müssen nichts voneinander wissen.

**Warum useRef für action-Callback in confirmDiscard, nicht useState:**
- `action: () => void` ist eine Closure, kein Render-Input. `useState` auf Funktionen ist tricky (Setter als `(prev) => newFn` erforderlich). `useRef` + setOpen-Trigger ist lint-clean (siehe `lessons.md` 2026-04-14: Ref-Mutation gehört in Handler, nicht Render-Body — hier wird im Handler mutiert, also fine).

### Dependencies
- Keine neuen Packages. `@testing-library/react` ist bereits im Projekt (prüfen mit `grep "@testing-library/react" package.json`; falls nicht: Option A — hinzufügen als dev-dep; Option B — Tests als pure hook-tests ohne DOM-Rendering).
- Keine neuen env-Vars, keine Migrationen.

## Edge Cases
| Case | Expected Behavior |
|------|-------------------|
| Editor offen, User klickt denselben aktiven Tab | Kein Modal, kein setActive-Call (Button wrapper prüft `tab.key === active` und returniert früh ohne confirmDiscard) |
| Editor offen, Save erfolgreich → `setEditing(null)` | Sofort: `showForm = false` → useEffect cleanup → `setDirty(key, false)`. Nächster Tab-Klick ohne Prompt. |
| Editor offen, Cancel-Button | Gleiches Verhalten wie Save-Success (schließt Editor, clean). |
| JournalSection Autosave läuft im Hintergrund, User klickt Tab | Modal zeigt. Bei "Verwerfen": aktuelle pending autosave wird via section-unmount abgebrochen (in-flight fetch landet im void — kein Schaden, autosave ist idempotent). Follow-up #2 für sauberen Flush. |
| User öffnet Editor, tippt nichts, klickt Tab | Modal zeigt trotzdem (Nice-to-Have #1 löst das später). "Verwerfen" → Switch. User-Friktion, aber kein Datenverlust. |
| User ist dirty, Logout-Button | `confirmDiscard(handleLogout)` → Modal → "Verwerfen" → Logout-Fetch → Redirect. |
| User ist dirty, schließt Browser-Tab | `beforeunload` feuert → nativer Browser-Prompt. Safari zeigt keinen Text (wie in allen modernen Browsern Spec-konform), nur generic warning. |
| Mehrere Sections rendern? | Nein, nur eine aktiv. Trotzdem map-based dirty-state für Future-Proofing und Testbarkeit. |
| `React.StrictMode` doppelt-mounted in Dev | useEffect cleanup/setup läuft 2x, aber final-state bleibt konsistent (setDirty idempotent). |
| Session expired während Editor offen, API returnt 401 | Außerhalb scope — aktuelles Save-Flow zeigt Error-Banner, Editor bleibt offen. Kein confirmDiscard-Trigger. |

## Risks
- **RTL nicht installiert**: unit-tests für Context-Provider brauchen `@testing-library/react`. Check nach Spec-Approval; wenn fehlt, entweder als dev-dep hinzufügen ODER Tests als reine Hook-Logik-Tests ohne JSX-Render (niedrigere Coverage, aber schneller). Entscheidung beim Generator-Start.
- **Next.js App Router + React 19 Context-Serialization**: DirtyContext muss in einem Client Component leben (`"use client"` auf DirtyContext.tsx UND page.tsx — page.tsx hat bereits `"use client"`, gut). Server Component-Leak-Risiko = 0.
- **beforeunload + RSC-Navigation**: `beforeunload` feuert nur bei tatsächlichem Unload (close/refresh/external link). In-App Tab-Wechsel triggert es nicht — das ist by design, deshalb brauchen wir das explicit `confirmDiscard` zusätzlich.
- **Autosave + unmount Race**: bei Modal "Verwerfen" unmountet Section, pending autosave-Timer wird via section-cleanup gecleared. Aktuelle JournalSection-Implementierung clearte bereits Timer im cleanup — sanity-check beim Implementieren.
