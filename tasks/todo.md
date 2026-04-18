# Sprint: Mobile Dashboard Sprint B2c — RichTextEditor Toolbar + MediaPicker
<!-- Spec: tasks/spec.md -->
<!-- Started: 2026-04-18 -->
<!-- Status: Draft — Awaiting User-Approval -->

## Done-Kriterien
> Alle müssen PASS sein bevor der Sprint als fertig gilt.

- [ ] `pnpm build` passes without TypeScript errors
- [ ] `pnpm test` ≥299 passing (291 baseline + ≥8 neue Tests, T1-T8)
- [ ] `pnpm audit --prod` 0 HIGH/CRITICAL

### RichTextEditor

- [ ] `src/app/dashboard/components/RichTextEditor.tsx` Toolbar-Wrapper hat Class-Tokens `overflow-x-auto`, `md:flex-wrap`, `md:overflow-visible`, `[scrollbar-width:none]`, `[&::-webkit-scrollbar]:hidden` (grep-testbar: regex match in File)
- [ ] Button-Base-Class enthält `shrink-0 min-h-11 md:min-h-0` (grep-testbar: string match)
- [ ] Separator-Divs haben `shrink-0` zusätzlich zu `w-px bg-gray-300 mx-0.5 self-stretch`
- [ ] Alle 9 Toolbar-Buttons haben `aria-label` mit folgenden exakten Werten: "Fett" / "Kursiv" / "Überschrift 2" / "Überschrift 3" / "Zitat" / "Link" / "Link entfernen" / "Bild/Video einfügen" / "Bildunterschrift"
- [ ] `title`-Attribute an allen 9 Buttons bleiben erhalten (Desktop-Tooltip)
- [ ] Keine Behavior-Änderung: onClick/onMouseDown-Handler, Link-Input-Overlay, Media-Range-Save, Toolbar-State-Updates (bold/italic/heading2/etc.) unverändert
- [ ] `src/app/dashboard/components/RichTextEditor.test.tsx` angelegt, enthält T1-T4

### MediaPicker

- [ ] `src/app/dashboard/components/MediaPicker.tsx` Library-Grid hat `grid-cols-2 sm:grid-cols-3 md:grid-cols-4` (statt `grid-cols-3 sm:grid-cols-4`)
- [ ] Width-Buttons-Wrapper hat `flex flex-col min-[400px]:flex-row gap-2` (statt `flex gap-2`)
- [ ] Alle 3 Text-Inputs (Library-Caption, Embed-URL, Embed-Caption) haben Class-Tokens `text-base` UND `md:text-sm` (beide müssen da sein)
- [ ] Interactive Buttons (Tab-Buttons, Upload-Label, Width-Buttons, Insert-Button, Embed-Button) haben `min-h-11 md:min-h-0`
- [ ] Grid-Tile-Buttons haben `shrink-0` (nicht nötig für min-h-11 — aspect-square treibt schon die Fläche)
- [ ] Keine Behavior-Änderung: Upload-Flow, Media-Fetch, Select/Insert-Callback, Tab-Switching, Embed-URL-Parsing, Error-Handling unverändert
- [ ] `src/app/dashboard/components/MediaPicker.test.tsx` angelegt, enthält T5-T8

### Manual-Smoke

- [ ] Dev-Server bei 375px Viewport: RichTextEditor-Toolbar horizontal-scrollable, Buttons tappable, keine visual-regression auf Desktop
- [ ] Dev-Server bei 375px Viewport: MediaPicker öffnet mit 2-col Grid, Width-Buttons stacked, Upload+Select+Insert-Flow funktioniert
- [ ] Keine neuen Console-Warnings / Errors beim Öffnen der Editoren (RichTextEditor in Agenda/Journal/Projekte/Alit) und beim Öffnen des MediaPickers
- [ ] Auf realem iOS (wenn möglich) oder DevTools iPhone SE: Caption-Input-Focus triggert kein Auto-Zoom

## Tasks

### Phase 1 — RichTextEditor
- [ ] Toolbar-Wrapper div (Zeile 299) aufbrechen: `flex flex-wrap gap-0.5 border-b bg-gray-50 px-1.5 py-1` → `flex gap-0.5 border-b bg-gray-50 px-1.5 py-1 overflow-x-auto md:flex-wrap md:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`
- [ ] Button-Base-Class `btn` const (Zeile 292-293) erweitern: `"px-2 py-1 text-xs rounded hover:bg-gray-200 transition-colors disabled:opacity-30 shrink-0 min-h-11 md:min-h-0"`
- [ ] 3 Separator-Divs um `shrink-0` erweitern: `<div className="w-px bg-gray-300 mx-0.5 self-stretch shrink-0" />`
- [ ] Alle 9 Buttons um `aria-label`-Attribute erweitern (Werte siehe Done-Kriterien)
- [ ] Build + Test lokal grün

### Phase 2 — RichTextEditor Tests
- [ ] `RichTextEditor.test.tsx` anlegen mit `// @vitest-environment jsdom` Pragma
- [ ] T1 — render + expect 9 buttons mit exakten aria-labels
- [ ] T2 — className-match auf Toolbar-Wrapper für die 5 Tokens
- [ ] T3 — className-match auf repräsentativen Toolbar-Button für die 3 Tokens
- [ ] T4 — onChange-callback Test: render RichTextEditor mit onChange-Spy, simulateer Bold-Button-Click (oder H2-Click), asserted dass onChange gefeuert ODER interner State-Update stattfand (z.B. Link-Overlay erscheint nach Link-Button-Click)

### Phase 3 — MediaPicker
- [ ] Library-Grid-Wrapper (Zeile 213): `grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[40vh] overflow-y-auto` → `grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-[40vh] overflow-y-auto`
- [ ] Width-Buttons-Wrapper (Zeile 260): `flex gap-2` → `flex flex-col min-[400px]:flex-row gap-2`
- [ ] `width === "full"/"half"` Buttons (Zeile 261-274): class erweitern um `min-h-11 md:min-h-0`
- [ ] Tab-Buttons (tabBtn helper, Zeile 166-176): class erweitern um `min-h-11 md:min-h-0`
- [ ] Upload-Label (Zeile 188): class erweitern um `min-h-11 md:min-h-0 inline-flex items-center` (Label braucht explizite min-h)
- [ ] Insert-Button (Zeile 284): `px-4 py-2 bg-black text-white rounded text-sm hover:bg-gray-800` → `px-4 py-2 bg-black text-white rounded text-sm hover:bg-gray-800 min-h-11 md:min-h-0`
- [ ] Embed-Button (Zeile 315): analog min-h-11 md:min-h-0
- [ ] 3 Text-Inputs (Zeile 278, 299, 308): `text-sm` → `text-base md:text-sm`
- [ ] Build + Test lokal grün

### Phase 4 — MediaPicker Tests
- [ ] `MediaPicker.test.tsx` anlegen mit `// @vitest-environment jsdom` Pragma
- [ ] Setup-Helper: `vi.stubGlobal("fetch", ...)` für `/api/dashboard/media/` mock mit 1-2 items (image + video)
- [ ] T5 — open=true, `await findByRole(...)` auf Library-Grid, className-match für 3 col-tokens
- [ ] T6 — select Tile (via user-event click) → Width-Buttons-Wrapper rendered, className-match
- [ ] T7 — 3 Inputs per Placeholder finden (`Bildunterschrift`, `https://www.youtube.com`, `Bildunterschrift` für Embed), className-match für `text-base` und `md:text-sm`
- [ ] T8 — select Tile → Caption tippen → Insert-Button click → onSelect-Spy-Assertion (payload shape) + onClose-Spy-Assertion

### Phase 5 — Manual Smoke + Wrap
- [ ] `pnpm dev` starten, bei 375px (DevTools) RichTextEditor via Agenda-Tab öffnen, Toolbar horizontal-scrollen, Buttons tappen, Bold-Selection → Link-Overlay öffnen
- [ ] MediaPicker via Medien-Button im Editor öffnen, Tile auswählen, Caption tippen (keine Zoom-Animation), Insert klicken
- [ ] MediaPicker → Tab "Video einbetten", URL pasten, Embed-Button klicken
- [ ] Auf Desktop (≥1024px) dieselben Flows — keine visuelle Regression (Toolbar bleibt kompakt flex-wrap, Inputs klein)
- [ ] Git-Commit + Push → pre-push Sonnet-Gate abwarten → bei clean: PR erstellen → Codex-PR-Review autonom starten

## Notes

- Kein Codex-Spec-Review nötig (Small Scope, klare Patterns, keine Architektur-Entscheidungen).
- Tests folgen dem Class-Invariante-Pattern aus B2a (className.match-Regex), keine Viewport-Mocks.
- Fetch-Mock-Pattern aus SignupsSection.test.tsx adoptieren: `vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ success: true, data: [...] }) }))`.
- Behavior-Parity-Tests (T4, T8) sind die wichtigsten — Class-only-Tests würden Handler-Regressionen nicht fangen.
- Wrap-up: nach Merge `memory/todo.md` updaten (Sprint B2c completed), `memory/project.md` Last-updated bumpen. Pattern-Check likely `no new patterns` — alles ist Standard-Tailwind-Anwendung. Ausnahme: wenn während Impl neue Lessons auftauchen, dann patterns/tailwind.md oder patterns/react.md erweitern.
