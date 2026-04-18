# Spec: Mobile Dashboard Sprint B2c — RichTextEditor Toolbar + MediaPicker
<!-- Created: 2026-04-18 -->
<!-- Author: Planner (Claude) -->
<!-- Status: Draft -->

## Summary

Letzter Polish-Sprint der Mobile-Dashboard-Serie. Zwei isolierte, low-risk visual-polish-Aufgaben: (a) RichTextEditor-Toolbar wird touch-tauglich (44×44 Buttons + Horizontal-Scroll bei Overflow + aria-labels), (b) MediaPicker wird touch-tauglich (Mobile-Grid, 44×44 Buttons, iOS-Auto-Zoom-Prevention auf Inputs, Width-Buttons stacken auf <400px). Kein neues Primitive, kein shared-Refactor, keine neuen Components.

## Context

**Aktueller Zustand (2026-04-18):**

- `src/app/dashboard/components/RichTextEditor.tsx:292-352` — Toolbar-Wrapper `flex flex-wrap gap-0.5 border-b bg-gray-50 px-1.5 py-1`, 9 Buttons (B/I/H2/H3/"/Link/Unlink/Medien/BU) + 3 Separator-Divs. Button-Base `px-2 py-1 text-xs rounded hover:bg-gray-200` ergibt ~28-32px Höhe — unter dem 44px Touch-Target-Standard. Alle Buttons haben `title` (Desktop-Tooltip) aber **keine `aria-label`** — icon-only Buttons ("B", "I", "H2", "H3", "\"\"", "Link", "Unlink", "Medien", "BU") sind für Screen-Reader nicht benannt.
- `src/app/dashboard/components/MediaPicker.tsx:68-327` — Modal-hosted (nutzt `<Modal>`-Primitive aus PR #51 A11y-Pass), 2 Tabs (Library + Embed). Library-Grid `grid-cols-3 sm:grid-cols-4 gap-2 max-h-[40vh]` — auf 320px Viewport viel zu eng (3 Cols = ~100px pro Tile inkl. Gap). Width-Buttons "Volle/Halbe Breite" sitzen in `flex gap-2` — stacken nicht, werden auf <400px gequetscht. Alle Text-Inputs haben `text-sm` (14px) — triggert iOS Safari Auto-Zoom bei Focus. Alle Buttons `px-3 py-1.5 text-sm` bzw `px-4 py-2 text-sm` — unter 44px Touch-Target.
- Dashboard ist seit B2a (PR #75) + B2b (PR #77) CSS-Dual-DOM-basiert für responsive Layouts. Tailwind v4 mit `@custom-variant hoverable` in `globals.css:5`.
- Test-Files für RichTextEditor + MediaPicker existieren **nicht** — werden in diesem Sprint neu angelegt.
- Tests: 291 passing (post-B2b), Vitest 4.1 mit `// @vitest-environment jsdom` Pragma, `@testing-library/react`.

**Relevante Patterns:**
- `patterns/tailwind.md` — iOS Safari Auto-Zoom-Prevention: `input, select, textarea { font-size: max(16px, 1rem) }` auf Mobile. Tailwind-Äquivalent: `text-base md:text-sm`.
- `patterns/tailwind.md` — Fluid Typography via `clamp()`, Touch-Target 44×44 auf Mobile.
- B2a-Lesson (PaidHistoryModal): `flex flex-col min-[400px]:flex-row` Stacking-Pattern für schmale Modals.
- B2a-Lesson (Class-Invariante statt Viewport-Mock): Tests assertieren `element.className.match(/token/)` — keine `matchMedia`-Mocks, keine JSDOM-viewport-Manipulation.

## Requirements

### Must Have (Sprint Contract)

1. **RichTextEditor Toolbar — Touch + A11y:**
   - Wrapper umgeschrieben zu `flex gap-0.5 border-b bg-gray-50 px-1.5 py-1 overflow-x-auto md:flex-wrap md:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`. Horizontal-Scroll auf Mobile bei Overflow, Wrap auf Desktop wie bisher, Scrollbar visuell versteckt (Overflow bleibt scrollbar per Touch/Trackpad).
   - Button-Base-Class erweitert um `shrink-0 min-h-11 md:min-h-0` — Mobile 44px Höhe + verhindert shrink in Scroll-Container, Desktop bleibt kompakt.
   - Separator-Divs `<div className="w-px bg-gray-300 mx-0.5 self-stretch shrink-0" />` — `shrink-0` damit sie im Scroll-Container nicht zusammenfallen.
   - Alle 9 Toolbar-Buttons bekommen `aria-label` (gleicher deutscher Wortlaut wie aktuelles `title`, `title`-Attribut bleibt erhalten für Desktop-Tooltip):
     - B → `aria-label="Fett"`
     - I → `aria-label="Kursiv"`
     - H2 → `aria-label="Überschrift 2"`
     - H3 → `aria-label="Überschrift 3"`
     - "" (Blockquote) → `aria-label="Zitat"`
     - Link → `aria-label="Link"`
     - Unlink → `aria-label="Link entfernen"`
     - Medien → `aria-label="Bild/Video einfügen"`
     - BU → `aria-label="Bildunterschrift"`
   - Keine Verhaltens-Änderung an den `onClick`/`onMouseDown`-Handlern, an Cursor/Selection-Logic, an Link-Input-Overlay oder an Media-Range-Save.

2. **MediaPicker — Mobile-first Grid + Inputs + Buttons:**
   - Library-Grid-Wrapper umgeschrieben zu `grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-[40vh] overflow-y-auto`.
   - Width-Buttons ("Volle Breite" / "Halbe Breite") Wrapper `flex flex-col min-[400px]:flex-row gap-2` — auf <400px stacked full-width, ab 400px nebeneinander.
   - Alle interactive Buttons (Tab-Buttons, Upload-Label, Grid-Tiles, Width-Buttons, Insert-Button, Embed-Button) bekommen `min-h-11 md:min-h-0 shrink-0` wo sinnvoll.
   - Alle 3 Text-Inputs (Library-Caption line 278, Embed-URL line 299, Embed-Caption line 308) bekommen `text-base md:text-sm` — Mobile 16px (iOS no-zoom), Desktop 14px (kompakt).
   - Keine Verhaltens-Änderung an Upload-Flow, Media-Fetch, Select/Insert-Logic, Tab-Switching, Embed-URL-Parsing, Error-Handling.

3. **Tests:**
   - `src/app/dashboard/components/RichTextEditor.test.tsx` neu angelegt mit mindestens:
     - **T1** — 9 Toolbar-Buttons existieren mit korrekten `aria-label`-Werten (exakte String-Assertion).
     - **T2** — Toolbar-Wrapper-Element hat Class-Tokens `overflow-x-auto`, `md:flex-wrap`, `[&::-webkit-scrollbar]:hidden` (className.match-Regex).
     - **T3** — Toolbar-Button (min. 1 repräsentativer) hat Class-Tokens `min-h-11`, `md:min-h-0`, `shrink-0`.
     - **T4** — onClick/onMouseDown-Handler feuern beim Klick (Behavior-Parity: Bold-Button-Click triggert sanitized HTML-Änderung oder ruft `onChange`-Prop; Link-Button-Click öffnet Link-Overlay).
   - `src/app/dashboard/components/MediaPicker.test.tsx` neu angelegt mit mindestens:
     - **T5** — Library-Grid-Element hat `grid-cols-2 sm:grid-cols-3 md:grid-cols-4` (via fetch-mock zum Render-Path).
     - **T6** — Width-Buttons-Wrapper hat `flex-col min-[400px]:flex-row` (Tile-Selection triggert Render).
     - **T7** — 3 Text-Inputs haben `text-base md:text-sm` (Library-Caption, Embed-URL, Embed-Caption).
     - **T8** — Insert-Flow funktioniert (select Tile → caption eingeben → Insert-Button klicken → `onSelect` callback mit korrektem Payload; `onClose` aufgerufen).

4. **Build + Test + Manual-Smoke:**
   - `pnpm build` passes ohne TypeScript-Fehler.
   - `pnpm test` passes, neue Test-Count ≥ 299 (vorher 291 + mindestens 8 neue Tests).
   - Manual-Smoke: Dev-Server (`pnpm dev`) im Browser bei 375px (iPhone SE) — RichTextEditor-Toolbar horizontal-scrollable, alle Buttons tappable (Daumen-Test). MediaPicker öffnet, Library-Grid 2-col, Inputs triggern keinen Zoom auf realem iOS (visuell prüfen oder DevTools Mobile Responsive Mode als Proxy).

> **Wichtig:** Nur Must-Have-Items sind Teil des Sprint Contracts. Im Review gegen PR-Findings hart durchgesetzt — alles außerhalb ist kein Merge-Blocker.

### Nice to Have (explicit follow-up, NOT this sprint)

1. **Toolbar-Icons als echte SVG** statt Text-Glyphen — aria-label wird wichtiger, aber das ist ein größerer visueller Refactor (Icon-Set wählen, Tree-Shaking, Dark-Mode-Readiness). Eigener Sprint.
2. **Dirty-Tracking für MediaPicker Caption-Input** — wenn User Caption tippt und Modal via ESC schließt, geht das verloren. Niedrige Prio, Pattern dafür existiert (B2a-dirty-editor), aber MediaPicker ist einmaliger Insert-Flow, nicht persistent.
3. **Toolbar Scroll-Fade-Indicator** — `::before`/`::after` Gradient-Overlay der "mehr rechts" signalisiert. Visual-nice-to-have, aber Toolbar-Scroll ist bei 9 Buttons auf 320px visuell offensichtlich.
4. **Embed-URL-Validator sofort (onBlur)** statt erst bei Submit — reines UX-Polish.

> **Regel:** Nice-to-Have wird im aktuellen Sprint NICHT gebaut. Beim Wrap-Up wandern diese Items nach `memory/todo.md`.

### Out of Scope

- Kein Re-Design der Toolbar (Icon-Set-Austausch, neue Buttons, Layout-Swap) — nur Touch-Polish.
- Keine neue MediaPicker-Tabs, keine neuen Media-Types, keine Bulk-Upload-Funktionalität.
- Kein RichTextEditor contentEditable-Refactor.
- Kein B1/B2a/B2b-Primitive-Refactor (ListRow, ActionsMenuButton, SignupsSection bleiben unberührt).
- Keine i18n-Änderung — Dashboard bleibt DE-only.

## Technical Approach

### Files to Change

| File | Change Type | Description |
|------|-------------|-------------|
| `src/app/dashboard/components/RichTextEditor.tsx` | Modify | Toolbar-Wrapper + Button-Base-Class + Separator `shrink-0` + 9 `aria-label`-Attributes. Lines 292-352. |
| `src/app/dashboard/components/MediaPicker.tsx` | Modify | Library-Grid-Cols + Width-Buttons-Stack + Button-Heights + Input-Font-Sizes. Lines 68-327. |
| `src/app/dashboard/components/RichTextEditor.test.tsx` | Create | 4+ Tests (T1-T4). |
| `src/app/dashboard/components/MediaPicker.test.tsx` | Create | 4+ Tests (T5-T8). |

### Architecture Decisions

- **`md:min-h-0` statt 44px überall** — Mobile bekommt 44px Touch-Target, Desktop bleibt beim kompakten Layout. Alternative (44px auch auf Desktop) verworfen: 9 Toolbar-Buttons × 44px = 396px toolbar-width allein, plus Separator und Padding = ~430px — auf Desktop visuell aufgebläht und gegen den bisherigen kompakten Look. Desktop-User haben Maus-Präzision, brauchen keine 44px-Fläche.

- **`text-base md:text-sm` statt `text-base` überall** — Mobile bekommt 16px (iOS Safari Auto-Zoom-Prevention), Desktop bleibt bei 14px (kompakter Input-Look, konsistent zu übrigen Dashboard-Forms). Alternative (text-base überall) verworfen: inkonsistent mit restlichen Dashboard-Form-Sizes auf Desktop, kein funktionaler Vorteil über 768px.

- **Scrollbar-Hiding via Arbitrary-Property-Tokens** (`[scrollbar-width:none] [&::-webkit-scrollbar]:hidden`) — cross-browser, reiner CSS-Fix, kein zusätzlicher `globals.css`-Eintrag. Alternative (globals.css-Utility-Class) verworfen: nur an einer Stelle benötigt, Tailwind-Arbitrary-Values sind dafür genau das richtige Werkzeug und bleiben lokal-lesbar.

- **`aria-label` in Deutsch** (matched das bestehende `title`) — Dashboard ist Admin-only DE. Keine i18n-Prop-Drilling nötig, Dashboard-Strings-Module (`dashboardStrings`) nur für dynamische/komplexe Strings — Toolbar-Labels sind statisch. Konsistent zu ListRow-"…"-Button (aria-label="Aktionen") und Modal-Close-Button (aria-label="Schließen").

- **Separater Test-File pro Component** statt kombiniertem — bessere Isolation, kleinere Fetch-Mocks pro File, weniger Setup-Noise. Pattern-konsistent zu allen bestehenden Component-Tests.

- **Behavior-Parity-Tests** (T4, T8) zusätzlich zu Class-Invariante-Tests (T2, T3, T5-T7) — verhindert silent Refactor-Regressionen. Lessons aus B1/B2a: Class-Änderungen können Event-Handler-Bindings brechen, reine Class-Tests fangen das nicht.

### Dependencies

- **Keine neuen Deps.** Nutzt existierendes `@testing-library/react` + `vitest` + `jsdom`-Pragma.
- **Keine Env-Vars, keine Migrations, keine API-Änderungen.**
- **Internal:** `Modal`-Primitive bleibt unberührt. `RichTextEditor` wird von 4 Section-Editors konsumiert (Agenda/Journal/Projekte/Alit) — alle erwarten dieselbe public Props-API → keine Call-Site-Änderungen. `MediaPicker` wird von allen 4 Section-Editors konsumiert → ebenfalls keine Call-Site-Änderungen.

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| Viewport 320px (schmalstes Mobile) | Toolbar horizontal-scrollbar, alle 9 Buttons erreichbar per swipe. MediaPicker 2-col Grid. Width-Buttons stacked. |
| Viewport 400px | Width-Buttons wechseln auf flex-row (min-[400px]:flex-row-Grenze). |
| Viewport 768px+ | Toolbar flex-wraps wie bisher (md:flex-wrap + md:overflow-visible), Buttons bleiben kompakt (md:min-h-0), MediaPicker 3-col (sm → md-col-count progression). |
| iOS Safari Input-Focus | Kein Auto-Zoom auf Caption/Embed-URL/Embed-Caption (font-size=16px). |
| Modal-Open bei extrem kleinem Viewport (320px × 568px) | MediaPicker-Modal scrollt intern, Library-Grid max-h-[40vh] bleibt, Width-Buttons stacked — kein horizontal-overflow des Modal-Containers. |
| Screen-Reader (VoiceOver) über Toolbar | Liest aria-label aller 9 Buttons, unabhängig davon dass Glyphen `<strong>B</strong>`, `<em>I</em>`, `<span>BU</span>` sind. |
| Tastatur-Nav durch Toolbar im horizontal-scroll-Mode | Tab-Fokus scrollt den Container automatisch (Browser-default `scroll-margin` / `scrollIntoView`-Behavior). Keine Sonder-Logic nötig. |

## Risks

- **Refactor-Regression in Toolbar-Handlers**: `openLinkInput` nutzt `onMouseDown` + `e.preventDefault()` um Selection nicht zu verlieren. Kleines Risiko dass Class-Änderungen (layout, overflow) den Selection-Restore-Pfad brechen. **Mitigation:** T4 testet Link-Overlay-Open + Behavior-Parity. Manual-smoke (Toolbar → Bold-Selection → Link klicken → URL eingeben → Enter → Text wird Link).
- **Horizontal-scroll scrollt bei Touch den Seiteninhalt (momentum-scroll-leak)**: manche iOS-Safari-Versionen propagieren horizontalen Swipe auf body. **Mitigation:** `overflow-x-auto` ist der Standard-Fix, propagation-leak wäre ein separater Browser-Bug. Falls auftritt: `overscroll-behavior-x: contain` als Arbitrary-Value.
- **Test-Flake bei async MediaPicker-Fetch**: MediaPicker lädt Library via `fetch("/api/dashboard/media/")` in `useEffect`. Tests müssen `fetch` mocken + `waitFor` nutzen. **Mitigation:** Pattern bekannt aus SignupsSection.test.tsx (PR #75) — `vi.stubGlobal("fetch", ...)` + `await findByRole(...)`.
- **`text-base` auf Desktop**: wenn jemand das `md:text-sm` aus Versehen weglässt, wirkt Desktop-Inputs plötzlich größer und inkonsistent. **Mitigation:** T7 prüft beide Tokens gemeinsam — "text-base" ALLEIN reicht nicht, `md:text-sm` muss auch da sein.
