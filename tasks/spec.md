# Spec: Dirty-Editor-Warnung bei Tab-Switch
<!-- Created: 2026-04-16 -->
<!-- Revised: 2026-04-16 v2 — Codex R1 findings integrated (AbortController, RTL+jsdom, state-guard, governance) -->
<!-- Revised: 2026-04-16 v3 — Codex R2 precisions (per-file jsdom pragma, AbortError in handleSave layer, best-effort wording) -->
<!-- Author: Planner (Claude Opus 4.6) -->
<!-- Status: Approved v3 -->
<!-- Implementation complete 2026-04-16 on feature/dirty-editor-warning -->

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
7. **`confirmDiscard` State-Guard**: Solange das Confirm-Modal offen ist (genau eine pending action), werden weitere `confirmDiscard`-Aufrufe ignoriert (no-op). Verhindert Race wenn User hektisch mehrere Tabs klickt oder gleichzeitig auf Tab + Abmelden.
8. **Autosave-In-Flight-Abort** (nur JournalSection betroffen, dort der einzige Autosave-Flow):
   - `JournalSection.handleSave(payload, opts)` akzeptiert optional `signal: AbortSignal` in `opts` und reicht ihn an `fetch(url, { ..., signal })` durch.
   - **Der `AbortError`-Catch lebt in `JournalSection.handleSave`**, nicht im `JournalEditor`. Dort wo der `fetch` sitzt, sitzt auch der try/catch — sonst setzt der bestehende generische `catch` weiterhin `setError("Verbindungsfehler")` trotz Abort. Lösung: `catch (err) { if (err instanceof DOMException && err.name === "AbortError") return; setError("Verbindungsfehler"); }`.
   - `JournalEditor` hält einen `AbortController`-Ref pro pending Autosave-Request und ruft bei Cleanup (unmount via "Verwerfen" → Section unmountet) `controller.abort()`. Der Ref wird bei jedem neuen `handleAutoSave`-Call neu gesetzt (vorheriger Controller wird vorher abort-et).
   - **Ziel**: "Verwerfen" kippt in der Regel den pending Autosave-Request, bevor er den Server-Commit erreicht. **Best-effort**: ist der Request serverseitig bereits committet, bleibt der Write bestehen (client-abort kann nur in-flight-Requests stoppen, nicht bereits persistierte Schreibungen). Ein server-side Version-Guard wäre der saubere Vollschutz — out of scope (siehe Nice-to-Have #8).
9. **Test-Infrastruktur**: `@testing-library/react` + `jsdom` als dev-dependencies hinzufügen; `vitest.config.ts` erweitern:
   - `include` um `src/**/*.test.tsx` ergänzen.
   - **Globale `environment: "node"` bleibt**, per-file `// @vitest-environment jsdom` Pragma-Kommentar in `DirtyContext.test.tsx` (supported seit Vitest 0.x, keine Versionsrisiken wie bei `environmentMatchGlobs`, das in Vitest 4.x entfernt wurde).
   - Pure Logik-Tests (bestehende `*.test.ts`) bleiben unverändert in node-env.
10. **Unit-Tests** (`src/app/dashboard/DirtyContext.test.tsx`) decken:
    - `setDirty(k, true)` → `confirmDiscard` zeigt Modal, action läuft NICHT sofort.
    - `setDirty(k, false)` (oder nie gerufen) → `confirmDiscard` ruft action direkt.
    - "Verwerfen"-Klick → action läuft + Modal geschlossen.
    - "Zurück"-Klick → action läuft NICHT + Modal geschlossen.
    - Mehrere Keys gleichzeitig dirty: clearen eines bleibt dirty solange andere true sind.
    - State-Guard: während Modal offen, zweites `confirmDiscard(actionB)` → actionB wird nicht ausgeführt, auch nicht nach "Verwerfen" für actionA.
11. **Governance-Note im Code-Kommentar von `DirtyContext.tsx`**: "Neuer Editor-Tab im Dashboard = neuer `DirtyKey` in der Union + entsprechendes `useDirty`-Wiring in der Section. Ohne dieses verliert der neue Editor seinen Verlustschutz stillschweigend."
12. **TypeScript + Lint clean**: `pnpm tsc --noEmit` = 0 errors. `pnpm lint` darf keine neuen Warnings **gegenüber `main`-Baseline** einführen (aktuelle Baseline: 9 warnings, alle pre-existing).

### Nice to Have (explicit follow-up, NOT this sprint)
1. **Granulares "diff-vs-initial" Dirty-Signal** — statt "Editor offen" nur dann dirty wenn Form-Values vom Initial-State abweichen. Weniger False-Positives (User öffnet → sofort schließt → kein Prompt). Follow-up in memory/todo.md.
2. **Auto-flush-Autosave-Debounce bei confirmDiscard** (Pre-Prompt Save) — vor dem Modal ein synchroner Flush der pending autosave-Changes, damit bei "Zurück" (User bleibt) die letzten 3s getippten Zeichen garantiert persistiert sind. Aktueller Must-Have (Item #8) löst nur den "Verwerfen"-Pfad sauber (abort); der "Zurück"-Pfad behält den laufenden Debounce-Timer, User muss ggf. noch tippen damit Save feuert.
3. **AccountSection dirty-tracking** — Konto-Form hat eigenen Submit-Loop, Tab-Switch unmountet. Im todo-Eintrag nicht erwähnt, daher explizit out-of-scope.
4. **MediaSection Rename-Input dirty-tracking** — einzelnes Input, User-Verlust-Risiko minimal.
5. **Modal-Component API um `variant`/`actions` erweitern** — aktuell nur `title`+`children`; Confirm-Dialog rendert Buttons selbst in children. Generalisierung lohnt erst mit 2. Use-Case.
6. **Modal-A11y-Pass** — `role="dialog"`, `aria-modal="true"`, Focus-Trap innerhalb Modal, Focus-Return auf öffnenden Button nach Schließen. Betrifft `Modal.tsx` bestandsweit (nicht nur Confirm-Dialog) → eigener Dashboard-A11y-Sprint.
7. **Dashboard-UI-i18n für Modal-Texte** — "Ungesicherte Änderungen verwerfen?" / "Zurück" / "Verwerfen" landen aktuell hardcoded in DirtyContext. Bei einer späteren Dashboard-Lokalisierung (derzeit deutsch-only) wandern sie ins Dictionary.
8. **Server-side Version-Guard / Idempotency-Token für Autosave** — aktueller AbortController ist best-effort. Ein Version-Token (optimistic locking) oder Idempotency-Header würde server-side discarden, auch wenn Client-Abort zu spät kam. Größerer Aufwand (API-Erweiterung auf journal-PUT-Handler), eigener Sprint.

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
| `package.json` | Modify | Add dev-deps: `@testing-library/react`, `jsdom` |
| `vitest.config.ts` | Modify | `include` + `*.test.tsx`; globale environment bleibt `node`, jsdom per-file via Pragma-Kommentar |
| `src/app/dashboard/DirtyContext.tsx` | Create | Provider + hook + Confirm-Dialog-Wiring, beforeunload-Listener, TypeScript types für `DirtyKey`, State-Guard. Governance-Kommentar für DirtyKey-Erweiterung |
| `src/app/dashboard/DirtyContext.test.tsx` | Create | Vitest + @testing-library/react: Provider-Tests für setDirty/confirmDiscard/Modal-Flow/State-Guard |
| `src/app/dashboard/page.tsx` | Modify | `<DirtyProvider>` wrappen, Tab-Buttons + Konto + Abmelden onClick durch `confirmDiscard` |
| `src/app/dashboard/components/AgendaSection.tsx` | Modify | `useEffect`-Wiring: `setDirty("agenda", showForm)` |
| `src/app/dashboard/components/JournalSection.tsx` | Modify | `useEffect`-Wiring; `handleSave(opts)` nimmt `signal` und reicht an `fetch` durch; `catch` erkennt `AbortError` und returnt silent (kein Fehler-Banner) |
| `src/app/dashboard/components/ProjekteSection.tsx` | Modify | `useEffect`-Wiring: `setDirty("projekte", showForm)` |
| `src/app/dashboard/components/AlitSection.tsx` | Modify | `useEffect`-Wiring: `setDirty("alit", showForm)` |
| `src/app/dashboard/components/JournalEditor.tsx` | Modify | `AbortController`-Ref wird bei jedem handleAutoSave neu gesetzt (vorheriger abortet), Cleanup bei unmount ruft `.abort()` |

Erwartete Diff-Größe: ~200 Zeilen neu (Context + Tests) + ~40 Zeilen touched (page.tsx + 4 Sections + JournalEditor + vitest.config).

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
- **Neue dev-dependencies**: `@testing-library/react` + `jsdom` (für Provider-Component-Tests inkl. Modal-Flow). Codex-Review Finding #1 war klar: ohne diese ist der Test-Contract nicht erfüllbar. Entscheidung: Option A — Infra anziehen. Future-Proof für weitere Dashboard-Component-Tests.
- Keine neuen runtime dependencies, env-Vars oder Migrationen.

## Edge Cases
| Case | Expected Behavior |
|------|-------------------|
| Editor offen, User klickt denselben aktiven Tab | Kein Modal, kein setActive-Call (Button wrapper prüft `tab.key === active` und returniert früh ohne confirmDiscard) |
| Editor offen, Save erfolgreich → `setEditing(null)` | Sofort: `showForm = false` → useEffect cleanup → `setDirty(key, false)`. Nächster Tab-Klick ohne Prompt. |
| Editor offen, Cancel-Button | Gleiches Verhalten wie Save-Success (schließt Editor, clean). |
| JournalSection Autosave in-flight (fetch bereits gestartet), User klickt Tab + "Verwerfen" | Section unmountet → `controller.abort()` cleart den pending fetch. **Best-effort**: wenn Server den Request noch nicht prozessiert hat (Normalfall bei <100ms bis first byte), kommt der DB-Write nicht an. Hat der Server bereits committet (z.B. network-lag zwischen commit und response), bleibt der Write bestehen — aus Client-Sicht nicht mehr korrigierbar. |
| JournalSection Autosave-Debounce läuft (3s Timer noch nicht gefeuert), User klickt Tab + "Zurück" | Modal schließt, Editor bleibt offen, Debounce-Timer tickt normal weiter → Autosave feuert wie geplant. Kein Flush. Follow-up #2 für pre-prompt Flush. |
| User öffnet Editor, tippt nichts, klickt Tab | Modal zeigt trotzdem (Nice-to-Have #1 löst das später). "Verwerfen" → Switch. User-Friktion, aber kein Datenverlust. |
| User ist dirty, Logout-Button | `confirmDiscard(handleLogout)` → Modal → "Verwerfen" → Logout-Fetch → Redirect. |
| User ist dirty, schließt Browser-Tab | `beforeunload` feuert → nativer Browser-Prompt. Safari zeigt keinen Text (wie in allen modernen Browsern Spec-konform), nur generic warning. |
| Mehrere Sections rendern? | Nein, nur eine aktiv. Trotzdem map-based dirty-state für Future-Proofing und Testbarkeit. |
| `React.StrictMode` doppelt-mounted in Dev | useEffect cleanup/setup läuft 2x, aber final-state bleibt konsistent (setDirty idempotent). AbortController wird zweimal neu erzeugt — kein pending request in Dev, daher harmlos. |
| Session expired während Editor offen, API returnt 401 | Außerhalb scope — aktuelles Save-Flow zeigt Error-Banner, Editor bleibt offen. Kein confirmDiscard-Trigger. |
| User in dirty editor, klickt hektisch Tab1 + Tab2 + Abmelden in Folge | Erster Klick öffnet Modal für action "→Tab1". Zweiter + dritter Klick werden von State-Guard (`isConfirming === true`) ignoriert. User muss modal explizit entscheiden — kein Action-Overwrite. |

## Risks
- **RTL-Infra neu**: `@testing-library/react` + `jsdom` werden erstmals im Projekt eingeführt. Vitest-Config muss so konfiguriert sein, dass pure Node-Tests (`*.test.ts`) unverändert laufen. Lösung: globale `environment: "node"` bleibt, `// @vitest-environment jsdom` Pragma-Kommentar per-File auf `DirtyContext.test.tsx`. Sanity-Check: bestehende Tests (`sitemap.test.ts`, `robots.test.ts`, alle `src/lib/**/*.test.ts`) müssen nach Config-Change grün bleiben.
- **AbortError-Leak**: `AbortError` muss im `JournalSection.handleSave`-catch (dort, wo `fetch` sitzt) explizit geschluckt werden. Check via `err instanceof DOMException && err.name === "AbortError"`. Sonst landet es im generic "Verbindungsfehler"-Banner. JournalEditor (Controller-Owner) sieht den Fehler nicht, daher muss der Silent-Catch wirklich im Section-Layer sein.
- **Next.js App Router + React 19 Context-Serialization**: DirtyContext muss in einem Client Component leben (`"use client"` auf DirtyContext.tsx UND page.tsx — page.tsx hat bereits `"use client"`, gut). Server Component-Leak-Risiko = 0.
- **beforeunload + RSC-Navigation**: `beforeunload` feuert nur bei tatsächlichem Unload (close/refresh/external link). In-App Tab-Wechsel triggert es nicht — das ist by design, deshalb brauchen wir das explicit `confirmDiscard` zusätzlich.
- **DirtyKey vs Tab drift**: Wenn in Zukunft ein neuer Editor-Tab hinzukommt, dessen Section aber nicht `setDirty` ruft, verliert der neue Editor stillschweigend den Verlustschutz. Mitigation: Governance-Kommentar in DirtyContext.tsx (Must-Have #11) + explizite Must-Have-Liste aller gewirten Sections (Must-Have #4).
