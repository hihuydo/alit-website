---
name: Lessons alit-website
description: Wiederverwendbare Learnings aus dem alit-website Projekt
type: project
---

## 2026-04-18 — Cross-Browser Scrollbar-Hiding via Tailwind Arbitrary-Values
- Issue: Sprint B2c Toolbar bekam `overflow-x-auto` für Mobile-Horizontal-Scroll. Default-Scrollbar würde visuell unruhig wirken (Mobile Safari zeigt sie momentan, Firefox persistent, Chrome auto). Mobile-Pattern: Scroll-Affordance weg, Scroll bleibt per Touch/Trackpad möglich.
- Fix: Kombi aus zwei Tailwind-Arbitrary-Value-Tokens am selben Element:
  ```tsx
  <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
  ```
  - `[scrollbar-width:none]` → Firefox (CSS-Standard-Property)
  - `[&::-webkit-scrollbar]:hidden` → Chrome, Safari, Edge (Webkit-Pseudo-Element)
  - Nur einer der beiden reicht NICHT — Firefox respektiert `::-webkit-scrollbar` nicht, Webkit-Browser kennen `scrollbar-width` aktuell nicht vollständig.
- Rule: Für versteckte-aber-funktionale Scrollbars in Tailwind v4: **beide** arbitrary-value-Tokens an dasselbe Element. Keine globale globals.css-Utility-Class nötig — Tailwind-Arbitrary-Values sind dafür genau das richtige Werkzeug und bleiben lokal lesbar. Cross-Browser-Test: Firefox + Chrome + Mobile Safari — alle drei müssen scrollbar-frei sein.

## 2026-04-18 — JSDOM Selection-Setup für contentEditable selection-gated Handlers
- Issue: Sprint B2c Test T4 für RichTextEditor Link-Button — `fireEvent.mouseDown(linkBtn)` triggerte den Handler, aber das Link-Overlay erschien nie. `openLinkInput` guardet mit `if (!sel || sel.rangeCount === 0 || !selectionInEditor()) return;`. In JSDOM ist `window.getSelection()` zwar vorhanden, aber keine Range ist initial im contentEditable-Element gesetzt → Handler early-returnt stillschweigend. Test schlug ohne klare Fehlermeldung fehl ("expected null to be truthy").
- Fix: Vor dem Button-Klick manuell Range + Selection im contentEditable aufsetzen:
  ```tsx
  const editor = container.querySelector("[contenteditable='true']") as HTMLElement;
  const range = document.createRange();
  range.selectNodeContents(editor);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
  // Jetzt kann der Button geklickt werden und der Handler sieht eine valide Selection
  fireEvent.mouseDown(linkBtn);
  ```
- Rule: **In JSDOM-Tests für contentEditable-Editoren mit selection-gated Handlers** (Link, Bold, Italic, Blockquote): Range/Selection-Setup vor dem Event ist Pflicht. Sonst fall't der Handler in den early-return, Test findet keinen DOM-Output, Fehler ist diagnostisch unklar. `document.createRange()` + `range.selectNodeContents(editor)` + `window.getSelection().addRange(range)` ist das minimal-Setup.

## 2026-04-18 — `sameSite: "strict"` Session-Cookie bricht iOS Safari Pull-to-Refresh
- Issue: Nach Sprint B Cookie-Migration (PR #71) sessions auf `__Host-session` mit `sameSite: "strict"`. User berichtet auf iPhone Safari: nach Login triggert Pull-to-Refresh 100% reproduzierbar einen Logout + Redirect zu `/dashboard/login/`. Desktop Hard-Reload unaffected. Nur Staging getestet — Pattern gilt identisch für Prod.
- Root cause: iOS Safari sendet `SameSite=Strict` Cookies inkonsistent mit beim Pull-to-Refresh-Reload wenn die Response `Cache-Control: no-store` trägt (was `force-dynamic` auf Dashboard-Routes ohnehin setzt). Cookie-Absent → `verifySessionDualRead(req)` returnt null → middleware.ts redirected zu login.
- Fix: `sameSite: "strict"` → `sameSite: "lax"` in `setSessionCookie` + `clearSessionCookies` (`auth-cookie.ts`). Lax blockt immer noch Cross-Site-POST (Kern-CSRF-Vektor), erlaubt aber Cookies auf same-site Navigation/Refresh. Separater Hotfix-PR #76 vom main, parallel zu B2a.
- Rule: **Für Session-Cookies immer `sameSite: "lax"`** (browser-default), nicht `"strict"`. Strict verursacht iOS Safari Reload-Quirks ohne echten Zusatzschutz. Wenn dedizierter CSRF-Schutz nötig: separater CSRF-Token auf State-Changing-Endpoints. Verify-Test: iPhone Safari tatsächlich testen — Desktop Hard-Reload ist kein Proxy, DevTools-Responsive-Mode auch nicht (iOS Safari-Quirks sind engine-specific).

## 2026-04-18 — Touch-Tablet Hover-Hole: `@media (hover: hover)` als Must-Gate
- Issue: MediaSection Grid-View zeigte Actions (Copy/Download/Rename/Delete) als `opacity-0 group-hover:opacity-100` Cluster — funktioniert auf Desktop, aber auf iPad Portrait (`≥768px`, coarse-pointer, kein hover) sind Actions **unreachable**: hover fired nicht, Cluster bleibt invisible. Codex R1 flagged während Sprint B2b Spec-Review.
- Fix: `@custom-variant hoverable (@media (hover: hover) and (pointer: fine))` (existed bereits in `globals.css:5`). Desktop-hover-cluster wrapped in `hidden md:hoverable:flex` — nur wenn md+ UND hover-capable sichtbar. Mobile-"…"-ActionsMenuButton komplementär gegated mit `md:hoverable:hidden` — hidden nur wenn md+ UND hover-capable. Drei Szenarien:
  - `<md` (any): "…" visible, cluster hidden ✓
  - `≥md + hoverable` (Desktop+Mouse): "…" hidden, cluster visible ✓
  - `≥md + !hoverable` (iPad): "…" visible, cluster hidden ✓ (Kern-Fix)
- Rule: **Jeden hover-reveal-Cluster mit touch-tablet-compatible fallback bauen.** Kombiniere `md:` (viewport) + `hoverable:` (pointer-capability) um Desktop-only-Behavior präzise zu gaten. Coarse-pointer ≥768px (iPad, Surface) ist ein wachsendes device-segment — ohne pointer-gate silent-broken. Siehe `patterns/tailwind.md` hover-affordances.

## 2026-04-18 — Close-menu-before-action invariant ist nicht order-testbar in React, aber via follow-up-modal-scenario
- Issue: Sprint B1 Spec verlangte "setMenuOpen(false); action.onClick();" mit spy-backed call-order-Test (Codex R1 #3). Initialer Test-Ansatz: DOM-Query im onClick ("ist dialog noch da?") → schlug fehl weil React state-updates asynchron committed werden — der Close-effect rendert erst NACH dem synchronen Handler, also sieht der onClick immer noch die offene Dialog-DOM. False negative.
- Fix: Statt Order-Check über DOM-Inspection den **observable invariant** testen: wenn die action.onClick einen follow-up Modal öffnet (z.B. DeleteConfirm), hat das Test-Assert nach React-Commit exakt EINEN dialog im DOM. Das beweist dass die Kette geschlossen-hat-dann-neu-geöffnet abgelaufen ist — kein Stacking möglich. Zusätzlich ein einfacherer Post-Click-Test: dialog ist nach action-click aus dem DOM verschwunden + action.onClick wurde aufgerufen.
- Rule: Bei "close-before-X" Invarianten in React-Handlers: statt synchronen Order-Spys **Outcome-Tests**. Test-Setup: ein Harness der das follow-up-Verhalten spiegelt (zweiter Modal auf useState-Trigger), assert dass nach fireEvent.click + React-commit genau ein aria-modal existiert. Gleichzeitig vermeiden: "DOM-Inspection im Handler-Callback" — React hat den Unmount noch nicht flushed.

## 2026-04-18 — Shared Primitive Trigger-Class: Append-not-Replace Contract
- Issue: Sprint B2b extrahierte `RowActionsMenu` aus ListRow in shared `ActionsMenuButton`. Caller-Varianten haben unterschiedliche Visibility-Anforderungen (ListRow: `md:hidden`, MediaSection-Grid-Tile: `md:hoverable:hidden absolute top-1 right-1`). Erste Draft-API hatte `triggerClassName`-Prop ohne klare Semantik — Codex R2 flagged: "replaces or appends base classes?" ungeklärt. Wenn base enthält `md:hidden` und Caller will ein anderes Gate — Konflikt.
- Fix: Explicit contract in `ActionsMenuButton.tsx`:
  1. Export `ACTIONS_MENU_TRIGGER_BASE_CLASS` als const mit Touch-Target + visual-Affordance, **aber KEINE Visibility-Token** (keine `hidden`/`md:hidden`/`hoverable:` in base).
  2. `triggerClassName` wird **appended** mit Space — nicht replaced. `${BASE_CLASS} ${triggerClassName}`.trim().
  3. Caller steuert Visibility via triggerClassName.
  - Test asserted dass base-Tokens + caller-Tokens beide im DOM-className vorhanden sind (append-guarantee).
- Rule: **Shared-Primitive mit Variable-Visibility-Requirements: base-Classes dürfen keine Visibility-Token enthalten.** Base deckt nur Touch-Target + semantic-affordance. Visibility ist caller-owned. Append-nicht-replace API-Contract explicit dokumentieren, Test verifiziert beide Sets im DOM.

## 2026-04-18 — Modal.focus-return vs input.autoFocus Race (Rename-Handoff-Contract)
- Issue: MediaSection Mobile-Menu-Flow: User klickt "…" → Modal öffnet. User klickt "Umbenennen" → close-before-action schließt Modal → `startRename(item)` setzt state → re-render mountet `<input autoFocus>`. Modal's focus-return logic (`Modal.tsx:40-83`) schickt parallel focus zurück zum "…"-Trigger. Race-Fenster zwischen autoFocus commit-phase und focus-return handler-phase. Codex R1 flagged als mögliche UX-Regression — keyboard würde sich auf iOS nicht öffnen wenn Trigger-Button gewinnt.
- Fix: In der tatsächlichen React-Reihenfolge gewinnt autoFocus (commit-phase nach focus-return-handler). Aber explicit Test-Gate: `document.activeElement === rename-input` nach Menu-Click. Falls zukünftig broken: Fallback wäre `useLayoutEffect` + `inputRef.current?.focus()` nach renameState-change. Test ist das Kriterium.
- Rule: **Wenn Modal-close-before-action eine follow-up-UI mit eigenem focus-Anspruch triggert (inline-editor, second-modal, search-input): explicit document.activeElement-Test im handoff**. Autofocus allein ist Race-Terrain. Einfacher Contract-Test im Component-Test-File deckt Regression zukünftiger Refactorings.

## 2026-04-18 — SPLIT_RECOMMENDED ernst nehmen: Codex-Signal zum Zurück-zum-Planner
- Issue: Sprint B2b initial als ein großer Sprint geplant (RichTextEditor + MediaSection + MediaPicker = ~9 Files). Codex Spec-Review R1 Verdict: `SPLIT RECOMMENDED` mit Begründung: nur ActionsMenuButton blockt MediaSection-Work; RichTextEditor + MediaPicker sind unabhängig + low-risk visual-polish. MediaSection hat echte Correctness-Risiken (touch-tablet-hole, rename-focus-race) die einen fokussierten Codex-PR-Review verdienen.
- Fix: Sprint re-scoped zu B2b = MediaSection + ActionsMenuButton + RowAction-type-move. RichTextEditor + MediaPicker verschoben zu B2c (future separater Sprint). User-Approval dafür vorher geholt (fachliche Entscheidung, nicht autonom).
- Rule: **`SPLIT RECOMMENDED` aus Codex Spec-Review ist nicht ein Finding zum Argumentieren — es ist das explizite Signal "zurück zum Planner, scope kleiner".** User fragen für scope-Entscheidung (eine der erlaubten Opus-Fragen per CLAUDE.md "Wann Opus DOCH fragt"). Zurückweisen nur mit hartem Gegenargument (z.B. "Scope kann nicht gesplittet werden weil atomic change"). Im Zweifel splitten — kleine PRs sind immer besser-reviewbar als große.

## 2026-04-18 — Git-Rebase mitten stehen-geblieben: reflog statt blind re-try
- Issue: B2b-Setup: nach Hotfix-Merge #76 (sameSite fix auf main), wollte ich B2a-Branch auf neuen main rebasen um Hotfix zu integrieren. `git rebase main` returnte schnell mit 4 commits statt 7. 3 Commits (CSV-Fix + v3-impl-complete-bump + 4-test-additions) waren "verschwunden". Code-diff zeigt missing 195 LOC on SignupsSection.test.tsx + 56 LOC auf SignupsSection.tsx.
- Fix: `git reflog` zeigte `rebase (start)` + nur 4 `rebase (pick)`-Einträge. Rebase war tatsächlich mitten stehen-geblieben (vermutlich interactive-mode nach 4 commits, obwohl nicht explicit `-i` angegeben). `git status` bestätigte "interactive rebase in progress". Lösung: `git rebase --abort` + dann `git merge main --no-ff` als cleaner integration. Merge-commit preservet 7 B2a-commits unverändert, zieht Hotfix rein, keine Rewriting-published-history-Probleme.
- Rule: Bei `git rebase main` nach unerwartet wenigen commits im log: **`git reflog` + `git status` checken ob rebase noch in-progress ist**, nicht blind `git cherry-pick` die missing commits (das stackt sie on-top statt sie richtig einzusortieren und hinterlässt Rebase-state). Für Feature-Branches die schon auf GitHub gepusht sind: **`git merge main` statt rebase** — vermeidet force-push, preserves commit-history für Codex-Review-continuity.

## 2026-04-18 — ListRow-Primitive API braucht explizite Drag-Props, nicht containerProps-Blob
- Issue: Sprint B1 Spec v1 hatte als Mitigation für drag-drop-Integration "`containerProps?: HTMLAttributes<HTMLDivElement>` als Prop-Forwarding". Codex R1 #1 identifizierte das als zu lax — jede Section könnte ihre eigenen Random-Props reinschmuggeln, und der todo.md-Text sagte fälschlich "drag-drop-Handler hängen am DragHandle-Element selbst" (Tatsache: HTML5 drag handlers sitzen am Row-CONTAINER, DragHandle ist purely presentational span).
- Fix: ListRow exportiert **explizite Drag-Props** — `draggable?`, `onDragStart/Enter/Over/End?: DragEventHandler<HTMLDivElement>`, `rowId?: string` (rendered als `data-row-id`). Typed. Kein generic-blob. Sections übergeben genau die handlers die bisher am inline-div hingen. DragHandle bleibt unverändert presentational.
- Rule: Wenn ein Primitive einen Browser-Standard-API-Set forwarded (drag-drop, input-events etc.): **explizite Props pro Handler statt Generic-Attributes-Blob**. Vorteile: TypeScript catched tippos, Leser sehen sofort was supported ist, keine "versehentlichen" Props aus rest-spread. Für project-specific data-attrs separate `dataAttrs?: Record<"data-${string}", string>` Prop.

## 2026-04-18 — Spec-Drift-Detection: Kontext-Claims gegen Code verifizieren
- Issue: Sprint B1 Spec v1 sagte mehrfach "Row-Edit triggert confirmDiscard wie bisher" — eine Behauptung über existing-behavior. Codex R1 #2 verifizierte das gegen den Code und fand: NICHT wahr. `confirmDiscard` (aus DirtyContext) wird aktuell nur von page.tsx `goToTab` + `handleLogout` gerufen. Section-Row-Edit-Handlers sind plain setters (`setEditing(item)` etc.) ohne Dirty-Guard-Wrapping. Die Spec verlangte also vom Generator, Verhalten zu "erhalten" das nie existiert hat.
- Fix: Claim aus Spec gestrichen. Stattdessen explizit dokumentiert: "Row-Edit-Handlers sind plain setters, keine Dirty-Guard-Integration, ListRow bleibt purer View-Layer". Zukünftige Sprints können explizit entscheiden Dirty-Guard auf Row-Actions auszudehnen — aber als neue Requirement, nicht als implizites "bestehendes Verhalten".
- Rule: Jeder Spec-Claim über "existing behavior" muss vor Commit gegen den Code verifiziert werden. Besonders gefährlich: "behavior bleibt wie bisher" ohne Code-Reference. Codex-Spec-Review für Medium/Large Specs fängt das routinemäßig, aber die eigene Spec-Review-Diszipin auch: jedes "wie bisher" = grep-check-Gelegenheit.

## 2026-04-18 — CSS-Dual-DOM > useMediaQuery für SSR-safe responsive render
- Issue: Zwei Ansätze für responsive Component-Render: (a) `useMediaQuery`-Hook + conditional render — nur eine Version im DOM; (b) CSS-Dual-DOM — beide Versionen im DOM, Tailwind `hidden md:flex` / `md:hidden` gated sichtbarkeit. In Sprint B1 initial (a) erwogen, dann (b) pinned.
- Fix: (b) gewählt für ListRow, weil: (1) SSR-hydration-safe — window.matchMedia nicht verfügbar auf Server, Hook-basierte Conditional-Renders brauchen extra `useEffect` für client-only + initial `null` state, produziert Layout-Flash, (2) Tests können strukturell verifizieren (class-presence) statt viewport-mock, (3) DOM-Kosten vernachlässigbar bei <100 Rows. Nachteil: beide Versionen hängen am DOM, aber hidden-Mobile-Buttons sind <10 pro Row.
- Rule: Für simple responsive Layout-Switches in Next.js / SSR-Apps **CSS-Dual-DOM first**. `useMediaQuery` nur wenn das Rendering substantial cost hat (heavy subtree) oder state-in-branch nicht dupliziert werden kann. Tests verifizieren `className.match(/hidden|md:hidden|md:flex/)` — nicht viewport-visual-rendering (JSDOM wendet Tailwind nicht an, matchMedia-Mocks sind Performance-Theatre).

## 2026-04-18 — iOS safe-area-inset auf dem Body bricht `min-h-screen` children
- Issue: Sprint A initial hatte `paddingTop: env(safe-area-inset-top)` + `paddingBottom: env(safe-area-inset-bottom)` auf dem Dashboard-`body`. Codex R2 #2: auf notched iPhones wird total page height dadurch `100vh + ~47px + ~34px`, nicht `100vh`. Login-Page (`min-h-screen flex items-center justify-center`) wurde dadurch taller als viewport → vertical scroll + off-center content.
- Fix: body-Padding komplett weg. Safe-area-Handling auf **spezifische Container** verschoben, die content-size-aware sind:
  - Dashboard-Header: `paddingTop: calc(0.75rem + env(safe-area-inset-top))`
  - Login outer div (selbst schon `min-h-screen flex-center`): `paddingTop/Bottom: env(safe-area-inset-*)` — innen-padding shrinkt den flex-center-Bereich, verändert aber nicht die Gesamt-Höhe des Containers
- Rule: **Nie safe-area-inset auf globalen Body/Root-Container wenn irgendwo darunter `min-h-screen` rendert.** Inner-container approach: Padding auf den Container der den flex-center / sticky-header / etc. hält. Das `min-h-screen`-Element bleibt dann exakt 100vh, Content innen wird durch padding aus safe-area-Zonen rausgedrückt — gewünschtes Verhalten, kein Overflow.

## 2026-04-18 — Next.js `/dashboard/` default-cached als static prerender mit `s-maxage=1y`
- Issue: Nach Sprint B (Cookie-Migration) prüfte User die Response-Headers auf `https://alit.hihuydo.com/dashboard/` und fand `x-nextjs-cache: HIT`, `x-nextjs-prerender: 1`, `cache-control: s-maxage=31536000`. Next.js hatte das client-side `/dashboard/` als statische HTML prerenderd weil keine Server-Data-Fetching stattfindet. Nicht kritisch weil middleware.ts VOR jedem Request Cookie checkt und redirected — aber eine statische Dashboard-Shell sollte nicht 1 Jahr in shared caches sitzen.
- Fix: `export const dynamic = "force-dynamic"` in `src/app/dashboard/layout.tsx`. Propagiert auf alle `/dashboard/*` Routes inkl. `/dashboard/login/`. Build-Output ändert sich: `/dashboard` und `/dashboard/login` von `○` (static) auf `ƒ` (dynamic). Response-Headers danach: `cache-control: private, no-cache, no-store, max-age=0, must-revalidate`, keine `x-nextjs-cache`/`x-nextjs-prerender`.
- Rule: **Auth-gated Next.js App-Router Routes** sollten `export const dynamic = "force-dynamic"` in ihrem layout.tsx haben, auch wenn middleware.ts sowieso gated. Begründung: (1) keine cacheable Shell die von shared caches ausgeliefert werden könnte wenn Cache-Configs sich ändern, (2) explicit vs implicit — Reviewer sieht sofort dass die Route nicht cached ist, (3) kein "warum wird das prerender obwohl es Auth hat?"-Rätsel beim nächsten Netzwerk-Tab-Check.

## 2026-04-18 — Dual-Verify (nicht nur Dual-Read) für Cookie-Migration
- Issue: Sprint B Spec v1 beschrieb Cookie-Migration als "Dual-Read" (`getSessionCookie()` liest primary, fallback legacy, returnt einen Token; Caller ruft danach `verifySession(token)`). Codex Runde 1 [Contract/Security]: Wenn `__Host-session` zwar vorhanden ist aber ungültig (corrupt, wrong-secret nach Rotation, expired), kommt der Legacy-Cookie NIE zum Verify-Check. Admin mit beschädigtem primary + gültigem legacy würde ausgesperrt — exactly das Szenario das Dual-Read verhindern soll.
- Fix: v3 `verifySessionDualRead(req)` verifiziert primary first (verify + userId-validate), bei JEDEM Fail-Schritt (missing cookie / verify-throw / non-numeric sub) Fallback auf Legacy mit gleicher Pipeline. Single-test `primary INVALID + valid legacy → source:'legacy'` als Kern-Coverage.
- Rule: Bei Cookie-/Credential-Migrations reicht Name-Precedence nicht. **Dual-Verify** = beide Paths komplett durchlaufen (parse + verify + validate), erster valider Path gewinnt. Bei jedem "Dual-Read-Pattern"-Vorschlag fragen: *Was passiert wenn primary präsent aber kaputt ist?* Wenn die Antwort "wir sehen legacy nicht mehr" — dann ist es Dual-Read, nicht Dual-Verify, und muss umgebaut werden.

## 2026-04-18 — Edge-safe Leaf Module per regex-file-content-test erzwingen
- Issue: `src/middleware.ts` läuft in Next.js Edge Runtime. `auth-cookie.ts` als shared helper soll sowohl von middleware.ts (Edge) als auch von Node-helpers (requireAuth, account-handlers) benutzt werden. Ein späterer PR könnte unbewusst `pg` oder `bcryptjs` importieren → middleware-Bundle bricht im Build. Keine ESLint-Rule erkennt das.
- Fix: Unit-Test in `auth-cookie.test.ts` liest den eigenen source via `readFileSync(path.resolve(__dirname, "auth-cookie.ts"))` und asserted per regex `/from\s+["'](pg|bcryptjs|\.\/db|\.\/audit|\.\/auth)["']/` → 0 Matches. CI-Gate gegen Regression.
- Rule: Jedes Modul das in Edge Runtime läuft (middleware.ts, Edge route handlers) UND von Node-code konsumiert wird, hat einen solchen self-grep-Test. Forbidden-list mindestens: `pg`, `bcryptjs`, project-local `./db`, `./audit`, `./auth`. Der Test legt keine Build-Zeit-Abhängigkeit an, weil er nur den File-String liest. Pattern: File-Content-Grep > Build-Pipeline-Check, weil der Test schon bei `vitest` anschlägt, nicht erst bei `pnpm build`.

## 2026-04-18 — setSessionCookie cleart Legacy atomar (Cookie-Koexistenz-Falle)
- Issue: Sprint B Spec v2 hatte `setSessionCookie` nur als Write für neuen Primary-Cookie definiert. Codex Runde 2 [Contract]: Nach Re-Login bleiben beide Cookies (`__Host-session` + `session`) nebeneinander bis Legacy expires/Logout. Die `auth_method_daily`-Metrik würde Legacy ewig als "co-existing" sehen, obwohl nur Primary gelesen wird. Zusätzlich DevTools-Verifikation unklar ("kein `session` nach Re-Login" vs "beide vorhanden, primary wins").
- Fix: `setSessionCookie(res, token)` schreibt IMMER primary UND ruft `res.cookies.set(LEGACY_COOKIE_NAME, "", { maxAge: 0, path: "/" })` atomar mit — aber NUR wenn Namen unterschiedlich sind (dev-mode: beide `session`, sonst würde der gerade gesetzte Cookie sofort gecleart). Invariante nach Login: genau ein Cookie im Browser.
- Rule: Bei Cookie-Rename-Migrationen cleart der write-helper den Legacy-Cookie atomar mit, nicht als separater Call. Verhindert Cookie-Koexistenz-Noise und macht DevTools-Verifikation binär ("ein Cookie → korrekt" vs "zwei → Bug"). Prüfung: im Name-Identitäts-Edge-Case (dev) darf kein zweiter Set-Call ausgelöst werden.

## 2026-04-18 — Observability-Counter Single-Bump durch Signatur-Refactor
- Issue: Sprint B Spec v1 wollte `bumpCookieSource` in `requireAuth` UND in `resolveActorEmail` aufrufen. Codex Runde 1 [Correctness]: Signups-Routes (bulk-delete, paid-toggle, single-delete) rufen beide helper in Sequenz → Counter misst `authenticated requests × affected-helpers`, nicht `authenticated requests`. Trend-to-zero-Metrik wird unbrauchbar.
- Fix: `requireAuth` Signatur-Change zu `Promise<NextResponse | { userId, source }>`. Bumpt Counter intern genau einmal. `resolveActorEmail` Refactor zu `(userId: number)` — zero Cookie-Read, zero Verify, zero Bump. Call-Sites reichen `auth.userId` aus dem requireAuth-Return weiter. TypeScript-guided Big-Bang-Refactor durch ~20 Dashboard-Routes.
- Rule: Observability-Counter gehören an den Choke-Point der Auth-Verifikation, nicht in alle konsumierenden helpers. Wenn ein Request mehrere auth-tangential helpers durchläuft (requireAuth + resolveActorEmail + etc.), genau einer davon ist die "auth-entry" und bumpt; alle anderen bekommen die already-verified userId/payload als Parameter. Signatur-Change statt defensive "haben wir schon gebumpt?"-Flag — Big-Bang-Refactor ist sauberer als silent-state.

## 2026-04-18 — sub:string → userId:number zentral validieren, nicht per Caller
- Issue: JWT-Standard `sub` ist string ("1", "2"). Admin-IDs sind SERIAL integers. Spec v2 hatte `resolveActorEmail(userId: number)` als Signatur, aber die Konversion `payload.sub → userId:number` blieb weich formuliert ("parseInt oder route-interne Resolution"). Codex Runde 2 [Correctness]: `parseInt("abc")` = NaN, `parseInt("1xxx")` = 1 (permissive-Trap aus patterns/typescript.md). Drei verschiedene Call-Sites mit drei potentiellen Abweichungen.
- Fix: Validation + Konversion zentralisiert in `verifySessionDualRead` via `validateSub(sub)` helper: regex `/^[0-9]+$/` + `parseInt(sub, 10)` + `Number.isSafeInteger + >0` check. Return-Shape `{ userId: number, source }` — garantiert validated-int. Kein Caller macht mehr parseInt. Bei non-numeric sub fällt Dual-Verify zu Legacy zurück (separater Test-Fall).
- Rule: Wenn ein untrusted-string-Feld (JWT claim, URL param, query param) in eine DB-Query landen wird, regex-pre-validate + parseInt ZENTRAL im Auth/Parse-Layer, nicht im Caller. Caller bekommt validated-int Type. Mit regex `/^[0-9]+$/` + `Number.isSafeInteger`: fängt NaN, float, leading-zero-tricks, "1abc"-permissive-Trap. Pattern-Linkage: typescript.md parseInt-permissive-Trap.

## 2026-04-18 — BCRYPT_ROUNDS in vitest env fein ausbalancieren (nicht MIN setzen)
- Issue: Sonnet pre-push Gate flaggte flaky test `auth.test.ts:154` (race-condition: 150ms Timer vs bcrypt.hash at cost 12 = ~400ms). Empfehlung: `env: { BCRYPT_ROUNDS: '4' }` in vitest.config.ts. Setze BCRYPT_ROUNDS=4 → 3 Tests failen: `adjustDummyHashForLegacyRounds` (BCRYPT_ROUNDS_MIN=4, lower=initialCost-1=3 unter MIN → no-op), UND zwei rehash-Tests (legacy hash ist hardcoded auf cost 4, `shouldRehash(4, 4)` false → Rehash-Branch feuert nie).
- Fix: BCRYPT_ROUNDS=5 statt 4. Gibt ein Cost-Delta gegenüber legacy-4-hashes (Rehash-Branch feuert), bleibt über BCRYPT_ROUNDS_MIN-1 (adjustDummy-Test geht), und 5 ist fast genauso schnell wie 4 (~10ms pro hash). Sweet spot. Im vitest.config.ts-Kommentar dokumentieren WARUM es 5 ist, nicht 4.
- Rule: Bei Test-Env-Config für performance-sensitive Crypto: (a) tests die Race-Windows nutzen brauchen niedrigen Cost, (b) tests die Cost-Migration-Scenarios spielen brauchen target > legacy, (c) tests die defensive-guards gegen untere Schwellen testen brauchen Cost > MIN. Die Schnittmenge ist typisch 1-2 values über MIN. Pattern: statt blind MIN zu setzen, Test-Suite einmal durchgrepen auf Cost-Annahmen (`hashSync(..., N)`, `expect(...).toBe(N)`).

## 2026-04-17 — docker compose restart liest .env nicht neu, braucht `up -d`
- Issue: T0-Auth-Sprint Ops-Cleanup: server `.env` für Staging + Prod auf `ADMIN_EMAIL=info@alit.ch` + cost-12-Hash geändert. `docker compose -f ... restart alit-staging` ausgeführt. Nächster Boot: bootstrap-Log zeigte wieder `DUMMY_HASH cost lowered to 10 to match residual legacy hashes`, und `huy@hihuydo.com` stand wieder als id=251 in `admin_users`. Compose hatte den env noch aus dem letzten `up -d`-Call gecached.
- Fix: `docker compose up -d <service>` (statt `restart`) RECREATE'd den Container und liest `.env` frisch. Nach dem korrekten Call: bootstrap clean, nur info@alit.ch in DB, DUMMY-Adjust dormant (kein legacy hash mehr).
- Rule: Bei jeder `.env`-Änderung auf dem Server: **`docker compose up -d <service>`**, nie nur `restart`. Verifikation nach dem Call: `docker exec <service> printenv <NEW_VAR>` MUSS den neuen Wert zeigen. Bei alit-website: ran wir hatten initial `restart` probiert → nächster Boot hatte alte env → Fehler wiederholte sich → Diagnose via `printenv` im Container hätte es sofort gezeigt.

## 2026-04-17 — bootstrapAdmin-Resurrection: DB-DELETE ohne .env-Update ist ephemeral
- Issue: Huy wollte `huy@hihuydo.com` (dormant zweiter Admin) aus `admin_users` entfernen. Initial via `DELETE FROM admin_users WHERE email=...`. Nach Container-Restart kam die Row wieder, mit neuer id (4 → 250 → 251). bootstrapAdmin() macht `INSERT ... ON CONFLICT (email) DO NOTHING` aus `ADMIN_EMAIL` + `ADMIN_PASSWORD_HASH` in `.env`. DB-DELETE war daher ephemeral — `.env` war autoritativ.
- Fix: Zuerst `.env` umstellen auf neuen aktiven Admin (`ADMIN_EMAIL=info@alit.ch` + dessen cost-12 Hash aus der DB extrahiert). Dann DB-DELETE. Dann `docker compose up -d`. Ab dann: Bootstrap ist no-op weil info@alit.ch schon existiert, huy@hihuydo.com wird nicht mehr re-inserted.
- Rule: Bei Bootstrap-seeded-Identität (Admin, User, Config-Row etc.) ist `.env` die Source of Truth, nicht die DB. DELETE-only ist transient. Cleanup-Order: (1) `.env` auf neuen gewünschten Identity-State, (2) DB-DELETE der alten Row, (3) Container-Recreate mit `up -d`. Reihenfolge umgedreht = DB-State springt nach jedem Boot zurück. Vorher: `grep -E "^ADMIN_(EMAIL|PASSWORD_HASH)" /opt/apps/<project>/.env` prüfen welcher Bootstrap-Wert aktiv ist.

## 2026-04-17 — Mixed-Cost bcrypt Timing-Leak: DUMMY tracked observed-min-cost bei Bootstrap
- Issue: Codex PR #69 R1 [P2] — nach bcrypt-Cost-Bump 10→12 generiert `bcrypt.hashSync("dummy-pw", BCRYPT_ROUNDS=12)` einen cost-12-DUMMY. Compare-Timing: unknown-email (DUMMY cost 12) = ~400ms, known-email mit legacy-cost-10 hash = ~100ms, known-email mit gerehashter cost-12 hash = ~400ms. Während Mixed-Cost-Phase: legacy-User DIFFER in Timing von unknown-User → email-existence leak.
- Fix: DUMMY als mutable `let dummyHash` exposed. `adjustDummyHashForLegacyRounds(observedMinCost)` pure setter in `auth.ts`. In `instrumentation.ts` NACH `bootstrapAdmin()`: `SELECT MIN(CAST(substring(password FROM 5 FOR 2) AS int)) AS min_cost FROM admin_users WHERE password LIKE '$2_$__$%'`. Wenn observedMin < BCRYPT_ROUNDS, `adjustDummyHashForLegacyRounds(observedMin)` → DUMMY regeneriert bei lower cost. Unknown-user-timing matcht damit slowest-path known-user (der legacy cost). 3 Unit-Tests für defensive no-op-Cases (invalid input, cost >= target, cost < MIN).
- Rule: Für Rehash-on-Login-Migrationen muss DUMMY_HASH observed-min-cost der User-Hashes tracken, nicht statisch BCRYPT_ROUNDS. Pattern: (1) DUMMY initial at module-load mit BCRYPT_ROUNDS (safe fallback), (2) post-bootstrap adjust via DB-query, (3) `login()` liest mutable dummy. Setter ist defensive (kein no-op bei invalid input). Residual leak für cost-C > observedMin users bleibt — das ist "rehashed-exists vs unknown", weniger schadhaft als "exists vs unknown". Vollständig schließt man's nur durch forced-reset-all-users.

## 2026-04-17 — Sprint-Split: DB-state Migration vs Client-state Migration
- Issue: T0-Auth-Hardening Spec v1 bündelte bcrypt-rehash (DB-state Write auf `admin_users.password`) + Cookie-Migration (`session` → `__Host-session`, Client-state Breakage aller Sessions). Codex-Spec-Review Runde 1 Verdict: **SPLIT RECOMMENDED**. Begründung: beide Migrationen haben unterschiedliche Blast-Radien und Rollback-Pfade. DB-state in shared Staging+Prod DB wird beim Staging-Login bereits migriert; Client-state wird beim Deploy invalidiert und braucht Dual-Read-Observability-Phase.
- Fix: Split in zwei Sprints. Sprint A (bcrypt/rehash/audit/boot/compose) — server-side only, keine Client-State-Änderung. Sprint B (cookie migration mit Dual-Read + Observability-Counter nach `patterns/auth.md:85-101`). Sprint A PR #69 merged 2026-04-17, Sprint B queued als eigener Planner-Run.
- Rule: Wenn eine Spec zwei Migrationsklassen mit unterschiedlichen Rollback-Pfaden vermengt (DB-state vs Client-state, Schema-state vs Secret-state, Server-fix vs Protocol-bump), Codex-Spec-Review mit `model=gpt-5.4` fängt das als SPLIT RECOMMENDED. Ernst nehmen — bundled Deploys amplifizieren Incident-Impact. Jede Klasse braucht: eigene Verifikations-Strategie, eigenen Deploy-Zyklus, eigenen Rollback-Pfad. Max 3 Codex-PR-Runden gilt nur innerhalb eines Sprints; Split-Trigger ist Spec-Review-Ebene, früher.

## 2026-04-17 — Hook-Path Ownership: shared Vibe-Hooks vs. husky — nicht mixen
- Issue: T0-Security-Sprint führte `husky` als devDep ein für gitleaks pre-commit. `pnpm prepare` setzt `core.hooksPath = .husky/_` (husky-Standard). Dadurch wurden die shared Vibe-Coding post-commit + pre-push hooks (`~/Dropbox/.../00 Vibe Coding/hooks/`) unsichtbar. Spec-Commit `2626a97` triggerte Sonnet-Evaluator NICHT mehr, Push-Gate wäre auch umgangen worden. Erste Fix-Attempt: `.husky/post-commit` + `.husky/pre-push` chainen zu Vibe-Hooks via `exec` — hat funktioniert, aber sobald gitleaks in den shared Vibe-Hooks pre-commit migriert wurde, wurde husky redundant und wieder entfernt.
- Fix: **Shared Vibe-Hooks sind jetzt Single Source of Truth für alle Git-Hooks** (inkl. gitleaks pre-commit). Husky wurde komplett entfernt: `pnpm remove husky`, `.husky/` gelöscht, `prepare`-script raus. Reihenfolge beim Switch ist kritisch: **ERST `bash .../hooks/install-hooks.sh`** (setzt hooksPath auf Vibe-shared), **DANN `pnpm remove husky`** — sonst Kurz-Gap ohne Hook-Path.
- Rule: `core.hooksPath` gehört **einem** System. In Vibe-Projekten = shared Vibe-Hooks. Wenn ein npm-Tool ein eigenes Hook-System mitbringt (husky, simple-git-hooks, lefthook): **nicht einführen** — stattdessen das äquivalente Feature in `~/Dropbox/.../00 Vibe Coding/hooks/<hook>` ergänzen (wird dann für alle Vibe-Projekte automatisch aktiv). Test nach Änderung: `git config core.hooksPath` → muss auf Vibe-shared zeigen, nicht `.husky/_`.

## 2026-04-17 — nginx Dotfile-Block Regex: `(/|$)` statt `$`
- Issue: T0-Spec v1 hatte `location ~ /\.(env|git|ht|DS_Store|svn)$` für Dotfile-Blocking. Codex-Spec-Review CR1: Das `$` ankert am URI-Ende, matched `/.git` und `/.env` aber NICHT `/.git/HEAD` (weiterer Pfad nach dem Punkt-Match). Konkrete Falsch-Spezifikation — Secret-Exposure-Risiko bei Standard-Scan-URLs.
- Fix: Regex auf `/\.(env|git|ht|DS_Store|svn)(/|$)` geändert. Matched `/.git` (URI-Ende), `/.git/HEAD` (Slash nach Punkt-Match), `/.env`, `/.env/anything`. `/.well-known/` wird NICHT gematched (weil `well-known` nicht in der Alternation). Verifiziert auf Staging + Prod: beide URLs → 404.
- Rule: Bei jedem neuen nginx regex `location ~` die Edge-Cases per Hand durchgehen: URI genau auf Pattern endet, URI hat Sub-Path, URI hat Präfix. Wenn sowohl `/foo` UND `/foo/…` blocken soll: `(/|$)` am Ende. Nur `$` = strict-end-anchor, matched keine Unterpfade. Pre-Deploy: `curl -sI .../.git/HEAD` + `.../.env` UND `.../.env/anything` ausführen als Akzeptanzkriterium — nicht nur die prefix-URL.

## 2026-04-17 — Repo nginx-Config vs. certbot-managed Server-Config: Style-Match vor Deploy
- Issue: T0-Sprint plante greenfield-Style nginx-Config (`nginx/alit.conf`): explizit `ssl_protocols TLSv1.2 TLSv1.3`, `ssl_ciphers HIGH:!aNULL:!MD5`, separate `location /_next/static/` + `location /fonts/` Blöcke mit repeated add_header, HTTP:80-Redirect via `location /`. Lebender Prod-Server war certbot-managed: `include /etc/letsencrypt/options-ssl-nginx.conf`, single `location /`, HTTP-Redirect via `if ($host = …) { return 301 …; }`. Blind cp hätte certbot-Auto-Renewal evtl. gebrochen + "managed by Certbot"-Kommentare gelöscht.
- Fix: Vor dem Deploy per SSH die Live-Config gelesen, den Style erkannt, Repo-Config rewritten um ihn zu matchen. Additiv nur: `client_max_body_size 55m`, Dotfile-Block, Security-Header im server-Block. Kein Child-`location` hat eigene add_header → Inheritance funktioniert → keine Header-Duplication nötig (Repo-Config wurde dadurch 61 Zeilen einfacher als die ursprüngliche greenfield-Version).
- Rule: Bei nginx-Repo-Config für bestehenden Server IMMER Server-Style first lesen (`ssh … cat /etc/nginx/sites-available/<name>`). Wenn certbot-managed: `include options-ssl-nginx.conf` behalten, Redirect-Style behalten, neue Directives additiv ergänzen — NICHT den gesamten Config-Block überschreiben. Als Side-Check: `grep -c "managed by Certbot"` im Live-File → erwartete Zahl. Drift pro Environment-Pfad (`/etc/nginx/sites-available/<name>` vs. Repo) beim Diff-Step vor cp prüfen, nicht nach.

## 2026-04-17 — Legacy-Column-Audit: grep by column-name, nicht by entity-name
- Issue: Cleanup-Sprint Planning v1 hatte Audit-Agent die "Routes + Types" der 4 Entities durchsucht → 8 POST/PUT-Handler identifiziert. Codex-Spec-Review fand **7 weitere versteckte Consumer** die der Audit verpasst hatte: `src/lib/agenda-hashtags.ts` (SELECT slug), `src/lib/media-usage.ts` (3× SELECT title/titel/content::text), `src/app/api/dashboard/journal/migrate/route.ts` (legacy-migrate-endpoint), `getProjekte()` (paragraphs im SELECT), `ProjekteList.tsx` (paragraphs-Render-Fallback), `journal-types.ts` (legacy fields), `JournalEditor.tsx:73-84` (expliziter legacy fallback). Nach DROP wären alle 7 Pfade 500er.
- Fix: Audit-Strategie revidiert. Vor Schema-DROP immer cross-Codebase grep nach exakten Column-Namen (`titel`, `paragraphs`, `slug`, `lines`, `beschrieb`, `kategorie`, etc.) — nicht nach Entity-Namen oder Route-Paths. Shared-libs + Render-Fallbacks + Editor-Seed-Logik + Validator-Code sind häufige Blind-Spots.
- Rule: Bei Schema-Migrations ALWAYS column-name-grep, nicht entity-grep. Speziell diese Kategorien prüfen: (1) shared validator libs (agenda-hashtags, slug-validation etc.), (2) media/usage-scan libs, (3) render-fallbacks `||`/`??` auf legacy-field, (4) editor-seed-logic mit "legacy pre-migration shouldn't occur but defensive" kommentierten Fallbacks, (5) dashboard-GET `SELECT *` + unbekannt-was-konsumiert-wird. Codex-Spec-Review mit model=gpt-5.4 fängt diese Kategorie zuverlässig.

## 2026-04-17 — SPLIT-Sprint bei App-Code vs DB-DDL Migrationen
- Issue: Cleanup-Sprint v1 plante App-Cleanup + DB-DROP-COLUMN in einem PR. Codex-Spec-Review Verdict: `SPLIT RECOMMENDED`. Begründung: App-Code-Rollback = git revert; DB-Rollback braucht pg_restore. Beide in einem PR mischt zwei Recovery-Pfade, macht Incident-Response unklar.
- Fix: Split in 2 PRs: PR 1 (Prep/Soak) = App-Code i18n-only-konvergieren, Columns bleiben. PR 2 (Drop) = reine DDL-Migration. Dazwischen 1-2 Deploy-Zyklen Soak mit Log-Observation, um versteckte Legacy-Reads in Prod zu fangen bevor Columns weg sind.
- Rule: Bei jeder irreversiblen DB-Migration diese Split-Logik anwenden. Separater PR für App-Cleanup vs DB-Schema-Change, Soak-Zyklus dazwischen. Mostly-seed-Recovery macht Rollback trivial, ändert aber nichts an der Rule — Mischung bleibt riskant bei echten Datensätzen. Codex verdict ernst nehmen, nicht weiterschieben.

## 2026-04-17 — DROP NOT NULL als Zwischenschritt vor DROP COLUMN
- Issue: PR 1 (Cleanup-Prep) entfernt Dual-Write aus allen 8 POST/PUT-Handlern. Problem: `agenda_items.titel NOT NULL`, `agenda_items.ort NOT NULL`, `projekte.slug NOT NULL`, `projekte.titel NOT NULL`, `projekte.kategorie NOT NULL`. Ohne Dual-Write würden INSERTs an NOT NULL constraint scheitern → 500 bei jedem Create.
- Fix: `ALTER TABLE … ALTER COLUMN … DROP NOT NULL;` idempotent in `ensureSchema()` hinzufügen (PG: no-op wenn schon nullable). Columns bleiben mit NULL-Werten für neue rows. PR 2 droppt die Columns dann komplett.
- Rule: Schema-Cleanup in 3 Schritten (nicht 2): (1) App-Code aus Dual-Write raus, (2) DROP NOT NULL idempotent (erlaubt NULL für neue rows während alte rows Werte behalten), (3) DROP COLUMN. Ohne Schritt 2 brechen INSERTs zwischen PR-Merge und DROP. Schritt 2 kann in PR 1 (App-Cleanup) mit-committed werden — ist reversible Schema-Relaxation, kein Risiko.

## 2026-04-17 — Preflight-Check auf Legacy-Column muss mit weg wenn write-less
- Issue: PR 1 entfernte Dual-Write auf `projekte.slug`. Aber `ensureSchema()` hatte einen Preflight-Check `SELECT count(*) FROM projekte WHERE slug IS NULL OR slug = ''` + Error-Throw wenn > 0. Nach Dual-Write-Removal haben neue rows `slug = NULL` → nächster Boot throws fatal schema error → Deploy-Outage. Codex R1 [P1] gefangen.
- Fix: Preflight-Check entfernen gleichzeitig mit Dual-Write-Removal. Oder umschreiben auf die neue canonical-ID (slug_de statt slug).
- Rule: Jeder Preflight-Check / Boot-Assertion auf einem Column muss mit-aktualisiert werden wenn der Column write-less wird. Grep nach `SELECT … FROM <table> WHERE <col>` in schema.ts / instrumentation.ts vor Dual-Write-Removal. Pattern: Assertion-Code lebt oft separat vom Write-Code — leicht übersehen.

## 2026-04-17 — Shared Staging+Prod DB: DDL-Migration triggert beim Staging-Push
- Issue: Staging- und Prod-Container teilen sich die gleiche DB (beides `host.docker.internal:5432/alit` in docker-compose). Das bedeutet: wenn Staging eine neue Schema-Migration ausführt (via `ensureSchema()` at boot), passiert sie effektiv auf der Prod-DB. Beispiel PR #61: Staging-Deploy bei 12:16 UTC droppte bereits die 16 Legacy-Columns, bevor der PR überhaupt auf main gemerged war.
- Fix: Bewusstsein + aktive Vorsicht. Bei DDL-Änderungen: (1) Backup VOR Staging-Push, nicht erst vor Prod-Merge. (2) Prod-App muss bereits i18n-ready sein bevor Staging-Push (um DROP-Migration triggern kann). (3) Sanity-Preflight-Query vor Staging-Push ausführen, nicht nach Prod-Merge.
- Rule: Bei shared DB + automatischem Staging-Deploy: Staging-Push IST das DB-Deploy. Merge auf main ist nur noch App-Code-Deploy, DDL ist schon passiert. Nicht-triviale Schema-Änderungen → Backup-Runbook auf Staging-Push-Gate statt Merge-Gate. Alternativ: separate Staging-DB einführen (größerer Infra-Sprint).

## 2026-04-17 — Optimistic-UI muss Server-CASE-Semantic mirror-en
- Issue: PR #57 änderte SQL von `paid_at = … WHEN NOT $1 THEN NULL ELSE paid_at END` auf `… ELSE paid_at END` (untoggle preserved paid_at). Die Optimistic-UI-Update-Zeile in `executePaidPatch` las noch `paid_at: nextPaid ? NOW : null`. Hätte einen 1-Tick-Flash "paid_at=null" gezeigt bevor Server-Wins den preservierten Wert zurückbringt — in der Tooltip-Logik (`!paid && paid_at`) wäre der "Zuletzt bezahlt"-Hinweis für einen Frame verschwunden.
- Fix: Optimistic-Update auf `paid_at: nextPaid ? NOW : m.paid_at` — mirror der neuen Server-Preserve-Logic.
- Rule: Bei jeder Server-Semantic-Änderung (SQL CASE, trigger, CHECK-constraint etc.) den zugehörigen Optimistic-UI-Code auf gleichen Schritt anheben. Server-wins fixt es beim Response, aber für 1 Tick lebt die alte Semantic im Optimistic-Pfad — visible flicker, subtile A11y-/UX-Regressionen. Checklist-Item: "bei SQL-Change → Optimistic-Update gleich anfassen".

## 2026-04-17 — Asymmetrischer Confirm: nur auf dem destruktiven Pfad
- Issue: Confirm-on-Untoggle (PR #57) war die Schutzschicht für versehentlichen paid→unpaid-Flip. Frage beim Design: soll der OFF→ON-Toggle auch einen Confirm bekommen (Symmetrie)?
- Fix: Nein. OFF→ON bleibt 1-Klick (Happy-Path). Nur ON→OFF öffnet Modal. Begründung: "als bezahlt markieren" ist trivial-reversibel (einfach re-untoggle), "unmarkieren" wirkte bis PR #57 wie Datenverlust (paid_at→NULL). Der Friction-Cost des Modals zahlt sich nur bei der echten Data-Loss-Wahrnehmung aus.
- Rule: Bei Confirm-Modals für Toggle-Actions immer asymmetrisch designen — Confirm auf dem Pfad mit perceived-higher-cost, Happy-Path bleibt reibungsfrei. Symmetrische Confirms auf allen Toggles erzeugen Modal-Fatigue ohne proportionalen Schutz. Gilt auch für andere binäre State-Flips: publish/unpublish, enable/disable, approve/revoke — immer nur den destruktiven/schwerer-reversiblen Pfad gaten.

## Next.js / Routing
- `trailingSlash: true` → API-Routes bekommen 308 Redirect ohne Trailing Slash. Monitoring-URLs immer mit `/` am Ende konfigurieren.
- "Cannot read properties of undefined" + "Failed to find Server Action" bei laufender App = stale Build, kein Code-Bug. `docker compose up --build -d` fixt es.
- Client Components dürfen NICHT `async function` sein. Beim Refactor von async server function → client component die `async` weg, sonst kompiliert es nicht.
- Hooks wie `useState`/`useEffect` müssen VOR jeder Berechnung stehen, die ihre Werte liest. TDZ-Bug bei `secondary === "3"` direkt nach der Title-Computation, weil `secondary` erst weiter unten deklariert war.

## CSS / Tailwind v4
- **Box-sizing border-box quirk**: Ein Element mit `flex-basis: 0%` und `border-right: 3px` rendert trotzdem 3px breit (die Border kollabiert nicht in die 0 Breite). Mit `opacity: 0` wird das zu einem transparenten Strip, durch den der Body-Background scheint. Fix: `border-width: 0` im hidden state explizit setzen.
- **Turbopack CSS Dedup faltet Compound-Selectors**: `.panel.panel-hidden { border-width: 0 }` wird bei der Kompilierung in den `.panel-hidden { ... }` Block einkassiert und verliert die Specificity-Erhöhung von (0,2,0) zurück auf (0,1,0). Workaround: Selectors über mehrere distinkte Compound-Klassen schreiben (`.panel-1.panel-hidden, .panel-2.panel-hidden, .panel-3.panel-hidden { ... }`) — die kann der Optimizer nicht zusammenfassen.
- **Hot-Reload-Falle bei Edit-Tool**: Manchmal pickt Turbopack Schreibvorgänge vom Edit-Tool nicht als Change-Event auf. `touch` reicht auch nicht. Echter Content-Edit (auch nur ein Kommentar) triggert den Recompile. Bei "CSS-Änderung wirkt nicht": erst über `curl _next/static/chunks/<hash>.css` prüfen, was wirklich serviert wird, bevor man an Specificity oder Source-Order zweifelt.
- Inline `style={{ background: ... }}` schlägt jede CSS-Klasse, auch `:hover` mit höherer Specificity ist nichts gegen Inline. Für hover-fähigen Background besser via Klasse mit arbitrary value (`bg-[var(--color-meta)]`) lösen.

## React / Forms
- **Checkboxen brauchen `onChange`, nicht `onClick`** — sonst fängt man nur Mausklicks ab und verpasst die Tastatur-Aktivierung via Space. Gilt analog für andere native form controls.
- **Form-Validation ohne Submit-Roundtrip**: `formRef.current.checkValidity()` gegen `required` Attributes ist die billigste Variante, um den Form-State punktuell zu prüfen (z.B. beim Klick auf eine Bestätigungs-Checkbox). Kein State-Mirroring jeder einzelnen Input nötig.
- HTML5 `<form>` ohne `onSubmit` Handler macht beim Submit ein GET-Reload mit den Form-Daten in der URL. Bis der Backend-Endpoint da ist immer `e.preventDefault()` setzen oder `<form>` durch `<div>` ersetzen.

## Fonts
- Vor Production-Deploy **immer von TTF auf woff2 (+ woff Fallback) umstellen** — TTF ist 2-3x größer und wird unkomprimiert geladen. Multi-Cut-Familien: Light/Regular/ExtraBold + jeweilige Italics als separate `@font-face` Blöcke mit gleicher `font-family`, unterschieden durch `font-weight` + `font-style`.
- Wenn nur Regular geladen ist und CSS `font-weight: 700` setzt, synthesisiert der Browser ein "fake bold" — sieht oft hässlich aus. Entweder echten Bold-Cut laden oder Weight auf Regular setzen.

## Design / Naming
- Bei generischen Naming-Konventionen (panel-1, panel-2, panel-3 statt panel-verein, panel-journal, panel-stiftung): Beim Refactor ALLE Stellen anfassen — CSS-Klassen, TS-Types, State-Werte, data-attributes. Sonst entstehen Magic Strings, die später schwer zu finden sind.
- Magic-String-Filter (`if (item.key === "agenda") return null`) bei der zweiten Wiederholung in einen typed Flag (`hideFromMenu?: boolean`) refactoren. Spart das nächste Mal die Suche nach allen Stellen, wo gefiltert wird.

## 2026-04-10 — Rich-Text Editor Round-Trip
- Issue: contentEditable + HTML round-trip verliert Metadata (quote.attribution, image.width, spacer.size)
- Fix: Metadata als data-Attribute auf HTML-Elementen kodieren (data-attribution, data-width, data-size)
- Rule: Jedes Block-Feld das über HTML transportiert wird braucht ein data-Attribut + Sanitizer-Allowlist-Eintrag

## 2026-04-10 — Auto-Save schließt Editor
- Issue: handleSave nach Auto-Save rief setEditing(null) auf → Editor unmounted
- Fix: Auto-Save übergibt { autoSave: true }, Parent überspringt setEditing(null) und reload()
- Rule: Bei Auto-Save nie den Editor-State zurücksetzen — nur bei manuellem Speichern

## 2026-04-11 — Media in PostgreSQL bytea
- Issue: Docker-Container hat keine Volumes → Filesystem-Uploads gehen bei Rebuild verloren
- Fix: Bilder/Videos als bytea in PostgreSQL speichern, Auslieferung via API-Route
- Rule: Bei kleinen CMS ohne Volume-Management ist DB-Storage für Medien pragmatisch. Trade-off: Full blob für jeden Range-Request.

## 2026-04-11 — UUID statt Sequential IDs für öffentliche URLs
- Issue: /api/media/1/, /api/media/2/ erlaubt Enumeration aller Uploads
- Fix: public_id UUID-Spalte, öffentliche URLs über UUID statt numeric ID
- Rule: Öffentlich zugängliche Ressourcen nie über vorhersagbare IDs exponieren

## 2026-04-16 — Sprint 8 Dirty-Polish: null-snapshot unterdrückt echten Dirty-State
- Issue: Bei AccountSection mit async Fetch-Initial-Data: Erste Spec-Version (v3) nutzte `initialSnapshotRef = null` als Sentinel "noch nie initialisiert" und gated `isEdited` darauf. Problem: Tippt der User **vor** Fetch-Resolve, bleibt der Snapshot `null` (Fetch wird ignoriert via Touch-Guard), `isEdited` konstant `false` — Tab-Switch/Logout würde die Eingabe silent discarden.
- Fix (v3.1): `initialSnapshotRef` startet mit serialisiertem **pristine form** `{"","",""}` + separater `userTouchedRef` (sticky Bool, flippt in jedem `onChange`, nie zurück). Diff-Logik ohne Sonderfall: `isEdited = serialize(form) !== initialSnapshotRef.current`.
- Rule: Für fetch-race-Guards bei Initial-Data-Fetch **niemals form-equality** als Touch-Signal — verwechselt "nie getippt" mit "getippt+gelöscht". Sticky-Ref ist die autoritative Quelle. null-Sentinel-Ansätze bei dirty-tracking sind ein Anti-Pattern wenn der Sentinel mit "isClean" überladen ist (semantic confusion).

## 2026-04-16 — Sprint 8: formRef überflüssig wenn userTouchedRef + sync-during-render vorhanden
- Issue: In Spec v3 wurde `formRef` (in jedem Render aktualisiert) als Stale-Closure-Schutz für den Fetch-Callback eingeführt. In v3.1 mit `userTouchedRef` ist das obsolet: Der Fetch-Callback liest **nur** den Ref (kein State), kein Closure-Capture-Problem.
- Fix: `formRef` aus Must-Have gestrichen. `isEdited` wird sync-during-render aus dem aktuellen React-State berechnet (Render läuft immer mit frischem State, keine Closure).
- Rule: Bei Ref-basierten Guards kein paralleles formRef-Mirror anlegen — das ist Over-Engineering, wenn man nur innerhalb eines Render-Passes oder in einem async-Callback einen einzelnen Boolean-Ref liest.

## 2026-04-16 — codex CLI `codex exec` hängt bei offenem stdin
- Issue: `codex exec 'prompt text'` hängt forever bei "Reading additional input from stdin..." — selbst wenn der Prompt als Positional-Arg übergeben wurde. Hintergrund-Task produziert 0 Byte Output. `codex exec --help` dokumentiert: "If stdin is piped and a prompt is also provided, stdin is appended as a `<stdin>` block". Harness-Shells lassen stdin offen → codex wartet.
- Fix: Entweder Prompt via `<<'EOF' ... EOF` HEREDOC oder (einfacher) `< /dev/null` ans Ende der Command-Line hängen.
- Rule: Für non-interactive `codex exec` Calls aus Scripts/Harness **immer `< /dev/null`** um stdin explizit zu schließen. Gilt auch für andere Tools die sowohl Arg-basiert als auch stdin lesen können (`claude`, `gemini`, etc.).

## 2026-04-16 — Sprint 8: Sonnet post-commit evaluator verwechselt pre-impl mit spec-quality
- Issue: Der `post-commit` Hook triggert Sonnet-evaluieren bei jedem `tasks/spec.md`-Commit. Bei einem Spec-Commit **vor** Implementation (was der Loop-Normalfall ist: Plan → Commit → Evaluate → Implement) reportet Sonnet konsequent NEEDS WORK weil 0/N Must-Have-Items im Code sind. Das blockt dann später den `pre-push` Gate (der qa-report.md auf NEEDS WORK prüft).
- Fix: Nach Implementation spec.md mit einem trivialen "Status: implemented" Bump erneut committen → triggert post-commit-Evaluator neu, jetzt gegen den Code → APPROVED, qa-report.md clean.
- Rule: Der Sonnet-Evaluator bewertet "Spec erfüllt?" nicht "Spec gut geschrieben?". Pre-impl Spec-Commits werden deshalb immer NEEDS WORK sein. Workaround: impl → trivial spec-bump (Status-Line) → commit. Alternativ langfristig: Hook so ergänzen dass er "spec changed but no code-files touched" als Plan-Phase erkennt und milder evaluiert.

## 2026-04-16 — Sprint 8: chirurgische Spec-Patches erzeugen eigene Edge-Case-Widersprüche
- Issue: Beim Patchen einer Spec von v3→v3.1 (Codex R2 Findings) wurde Must-Have #6 auf `userTouchedRef` umgestellt, aber die Edge-Case-Tabelle wurde nicht gleichzeitig neu durchgedacht. Folge: "User tippt+löscht, vor oder nach Fetch" wurde pauschal als "isEdited=false" festgeschrieben — stimmt aber nur vor Fetch (pristine-snapshot), nach Fetch ist der Snapshot auf fetched-email gesetzt und eine leere Form ist korrekt dirty. Codex R3 hat das gefunden.
- Fix (v3.2): Edge-Case-Zeile in zwei Zeilen gesplittet (vor-Fetch / nach-Fetch) mit expliziten expected-behavior-Diff.
- Rule: Bei Spec-Patches immer **die gesamte Edge-Case-Tabelle gegen die neue Core-Logik re-validieren**, nicht nur die direkt adressierte Zeile. Ein Must-Have-Change ist implizit ein Transform aller abgeleiteten Assertions. Drei-Dokument-Konsistenz (Must-Have / Architecture / Edge-Cases / File-Table) prüfen vor Re-Commit.

## 2026-04-11 — nginx client_max_body_size
- Issue: Upload scheitert mit "Verbindungsfehler" — Request kommt gar nicht beim Container an
- Fix: `client_max_body_size 55m;` im nginx Server-Block
- Rule: Bei File-Upload-Features immer nginx body size limit prüfen — Default ist 1 MB

## 2026-04-11 — contentEditable collapsiert leere Paragraphen
- Issue: Leere <p><br></p> am Textanfang werden vom Browser collapsiert/entfernt
- Fix: data-block="spacer" Attribut auf leere Paragraphen setzen
- Rule: Browser-eigenes contentEditable-Verhalten ist unzuverlässig für leere Elemente — immer explizit markieren

## 2026-04-12 — Staging-Environment aufgesetzt
- Issue: Kein Preview vor Merge — ambitious UI-Änderungen mussten lokal oder direkt in Prod getestet werden.
- Fix: Zweiter Docker-Container `alit-staging` auf Port 3102, separater Git-Checkout `/opt/apps/alit-website-staging`, nginx vhost `staging.alit.hihuydo.com` mit Let's-Encrypt, GitHub Action `deploy-staging.yml` baut bei Push auf jedem Non-Main Branch.
- Rule: Nicht-Main Push → Staging, Main-Merge → Production. Workflow: Branch → Staging testen → PR → Codex Review → Merge.

## 2026-04-12 — Accordion mit grid-template-rows statt max-height
- Issue: `max-h-[4000px]` als Cap clippt langen Content, besonders auf Mobile/small viewports mit größeren Schriften.
- Fix: Grid-Pattern `grid-rows-[0fr]` ↔ `grid-rows-[1fr]` mit `transition-[grid-template-rows]` + inner wrapper `overflow-hidden`. Content kann beliebig hoch werden.
- Rule: Für Accordions mit variablem Content immer grid-template-rows Pattern nutzen, nie fixen max-h Cap.

## 2026-04-12 — Safe-area-inset dynamisch platzieren
- Issue: iPhone Home-Indicator braucht `env(safe-area-inset-bottom)`, aber auf welchem Element? Hängt vom Layout-State ab.
- Fix: Standard auf `.leiste-3` (wenn Panel 1/2 primary, Leiste 3 am Boden). Bei `[data-primary="3"]` wird Inset auf Panel 3's inner scroll container verschoben (Panel 3 ist dann am Boden).
- Rule: Safe-Area-Inset gehört auf das ELEMENT, das im aktuellen State am unteren Rand sitzt — nicht statisch auf ein element. Dynamisch via data-attribute switchen.

## 2026-04-12 — Hover-Affordanzen nur für pointer-fine
- Issue: `.leiste:hover { background: #fff }` triggerte auf Touch-Geräten, wenn der Finger beim Scrollen über die Leiste streifte → weißes Flackern.
- Fix: `@media (hover: hover) and (pointer: fine) { ... }` um alle Hover-Regeln, die sichtbare State-Änderungen produzieren.
- Rule: CSS `:hover` Regeln grundsätzlich in `@media (hover: hover) and (pointer: fine)` wrappen — nur pointing devices haben echten Hover.

## 2026-04-12 — iOS auto-zoom on input focus
- Issue: iOS Safari zoomt auf inputs fokussiert mit font-size < 16px rein. Viewport-Meta allein reicht nicht.
- Fix: `input, select, textarea { font-size: max(16px, 1rem) }` im mobile media query.
- Rule: Form-Input Font immer ≥ 16px auf Mobile, sonst zoomt iOS beim Fokus rein.

## 2026-04-12 — React adjust state during render pattern
- Issue: `useEffect` mit `setState` auf navActive-Transition löste `react-hooks/set-state-in-effect` Lint-Error aus.
- Fix: `const [prevX, setPrevX] = useState(x); if (x !== prevX) { setPrevX(x); setY(...); }` — React re-rendert ohne Intermediate Paint.
- Rule: Wenn State sich auf Prop/Derived-Value Änderung anpassen muss, NICHT useEffect + setState. Verwendet das "adjust state during render" Pattern aus React Docs.

## 2026-04-12 — overflow-lock nur für spezifischen Layout scopen
- Issue: Mobile media query `html, body { overflow: hidden }` für Accordion-Pin brach das Dashboard auf Mobile (scrollte nicht mehr).
- Fix: `html:has(.wrapper-root), body:has(.wrapper-root) { ... }` — nur öffentliche Seiten locken das Scroll, Dashboard unberührt.
- Rule: Globale html/body overflow-Overrides IMMER mit `:has()` auf den spezifischen Layout-Container scopen.

## 2026-04-12 — Fluid Typography clamp() Grenzen
- Issue: Fixe px-Schriften (26.667px Body) auf 320px-Phones zu groß, auf 1920px+ zu klein.
- Fix: `clamp(17px, 1rem + 0.9vw, 26.667px)` für body. Mobile-Min 17px lesbar, Desktop-Max wie bisher.
- Rule: Alle Text-Tokens (body, title, leiste, journal, meta) + Spacing-Tokens als `clamp(min, preferred, max)` — nie fixe px für responsive Sites.

## 2026-04-12 — viewport-fit=cover braucht top safe-area
- Issue: `viewportFit: "cover"` lässt iOS Content unter die Notch/Status-Bar extenden. Mobile-Top-Bar saß halb verdeckt.
- Fix: `padding-top: env(safe-area-inset-top)` + entsprechend `height: calc(var(--leiste-mobile-height) + env(safe-area-inset-top))` auf dem top-most Element.
- Rule: Bei `viewport-fit=cover` IMMER auch `env(safe-area-inset-top)` auf top-most UI einsetzen, sonst versteckt sich das Element unter der Notch.

## 2026-04-14 — Sort-Order DESC + inverted Reorder
- Issue: "neueste oben" ohne Datenmigration. Sort_order war ASC-encoded (0 = oben).
- Fix: `ORDER BY sort_order DESC` in Reads + Reorder-Endpoint schreibt `sort_order = (length - 1 - index)` statt `= index`. Insert mit `MAX+1` landet automatisch oben.
- Rule: Bei Flip der Sort-Richtung muss Read, Insert und Reorder konsistent umgedreht werden — ASC/DESC allein in Read reicht nicht, sonst wird Drag & Drop invers.

## 2026-04-14 — Client Component + pg-Import via Shared-Split
- Issue: Client Component importierte Konstante aus einer Datei, die auch `pool from './db'` importierte → `pg` landete im Client-Bundle, Build failt mit `Can't resolve 'dns'/'fs'/'net'/'tls'`.
- Fix: Shared-Konstanten (Typen, Allowlist-Arrays) in eigene `*-shared.ts` auslagern ohne Server-Imports. Server-Module (Validator mit DB-Lookup) importieren die Shared-Konstanten weiter.
- Rule: Jeder Module der `pool`/`pg`/Node-native Deps importiert, darf NIE Konstanten exportieren, die eine Client Component importiert. Bei Mischbetrieb: Split in `<name>-shared.ts` (pure types/consts) + `<name>.ts` (server-only Logic).

## 2026-04-14 — CASE WHEN für nullable partial updates
- Issue: `lead` kann gezielt auf NULL gesetzt werden. `COALESCE($7, lead)` würde "null = keep current" interpretieren — kein Weg mehr, ein Lead zu leeren.
- Fix: Zweites Bool-Parameter: `lead = CASE WHEN $6::boolean THEN $7 ELSE lead END` mit `$6 = field !== undefined`. Send `null` als Wert wenn gelöscht werden soll.
- Rule: Bei nullable Feldern in partial PUTs: `CASE WHEN sent-flag THEN value ELSE col END`. NIE `COALESCE($x, col)` für nullable Fields, das verhindert explizites Löschen.

## 2026-04-14 — Section refetch on mount vs stale initial prop
- Issue: Dashboard-Parent fetcht `initial` einmalig beim Mount und reicht als Prop durch. Section re-mountet beim Tab-Wechsel mit OLD initial → frisch gespeicherte Felder "verschwanden".
- Fix: Jede Section macht `useEffect(() => { reload() }, [reload])` beim Mount. `initial` dient nur als First-Paint-Fallback und wird sofort überschrieben.
- Rule: Wenn Parent State einmal fetcht und Children unmounten/remounten (conditional render), MUSS die Child einen eigenen Mount-Fetch haben. Sonst zeigt sie stale Daten trotz korrektem DB-State.

## 2026-04-14 — Client-side Image-Orientation + CLS-Fix
- Issue: Server-seitige Bild-Analyse (sharp etc.) wollte ich vermeiden. Ohne `width`/`height` am `<img>` → CLS beim Laden.
- Fix: `new Image()` + `naturalWidth`/`naturalHeight` beim Upload im Browser auslesen. Orientation ableiten + width/height in DB speichern. Auf der Website `<img width={w} height={h}>` setzen → Browser reserviert den Platz.
- Rule: Orientation/Dimensions sind client-side gratis via Image Probe. Lieber bei Upload erfassen als später server-side zu analysieren.

## 2026-04-14 — link-dotted mit currentColor
- Issue: `.link-dotted { color: #000; border-bottom-color: var(--color-border) }` brach auf dark backgrounds (Panel 2 ist schwarz).
- Fix: `color: inherit; border-bottom: 2px dotted currentColor` — passt sich an Parent-Text-Color an.
- Rule: Utility-Link-Klassen, die auf verschiedenen Backgrounds leben, sollten `currentColor` statt hardcoded Farben nutzen.

## 2026-04-14 — Media-Usage-Scan muss alle Tabellen mit Media-Refs decken
- Issue: Media-GET scannte nur `journal_entries.content/images`. Nach Hinzufügen von Agenda-Images (JSONB mit public_ids) + Agenda-Content (Rich-Text-Figuren) wurde Media als "unused" angezeigt obwohl in Agenda-Einträgen referenziert → Admin konnte es löschen → broken images.
- Fix: Parallel `SELECT` auf journal_entries UND agenda_items in der Media-GET. Rich-Text über `/api/media/<uuid>/`-Path-Match, Bild-Attachments über `public_id`-Substring-Match in stringified JSON.
- Rule: Bei jedem neuen Feature das Media referenziert: Media-Usage-Check erweitern. Sonst Datenverlust durch "false unused"-Deletes.

## 2026-04-14 — Autosave mit optionalen Feldern gegen Datenverlust
- Issue: 3s-Autosave filterte incomplete Hashtag-Rows raus und sendete "keine Hashtags" → DB-Wert wurde während User-Edit gelöscht.
- Fix: Autosave erkennt incomplete drafts und LÄSST das Feld im Payload komplett weg (`{ ...payload, hashtags: undefined }`). JSON.stringify dropt undefined. Server-PUT skippt die SET-Clause bei undefined → DB-Wert bleibt erhalten.
- Rule: Bei Autosave mit Draft-Validation NIE "filtered empty" senden — ausschließen heißt Feld weglassen, nicht leeres Array senden.

## 2026-04-14 — Ref-Mutation during render → use Effect
- Issue: `doAutoSave.current = handleAutoSave` im Render-Body triggerte `react-hooks/refs` in strict-Lint-Configs.
- Fix: `useEffect(() => { doAutoSave.current = handleAutoSave; })` ohne deps — läuft nach jedem Render, hat denselben Effekt, ist lint-clean.
- Rule: Ref-Mutationen gehören in useEffect, nie in den Render-Body — auch wenn "es funktioniert".

## 2026-04-14 — HTML-Attribute brauchen "-Escaping
- Issue: `<iframe src="${result.src}">` interpoliert User-Input direkt. Ein `"` in YouTube/Vimeo Query-Param zerschießt den Tag + potentielles XSS-Vehicle.
- Fix: esc-Helper um `.replace(/"/g, "&quot;")` erweitern und auch auf `src`/`data-mime`/`data-width` anwenden, nicht nur auf sichtbaren Text.
- Rule: Jede String-Interpolation in HTML-Attribute (auch vermeintlich "safe" wie URLs): escape `"`. Tag-Text braucht `< > &`, Attribut-Wert braucht zusätzlich `"`.

## 2026-04-14 — scrollIntoView block: "nearest" statt "start"
- Issue: `block: "start"` scrollt auch wenn Element schon im Viewport → Jitter bei Re-Click.
- Fix: `block: "nearest"` — scrollt nur wenn nötig.
- Rule: Bei Route-Change-getriggerte scrollIntoView lieber "nearest", verhindert unnötige Sprünge wenn User die Position manuell angepasst hat.

## 2026-04-14 — Section-Rendering auf Content keyen, nicht auf Position
- Issue: Intro-Block einer strukturierten Content-Liste sollte ohne Wrapper rendern. Erster Spec-Vorschlag: "erster Eintrag nach sort_order ist die Intro". Sobald Admin reordert, rendert plötzlich eine andere Sektion wrapperlos.
- Fix: Rendering-Regel an inhaltliches Feld hängen, z.B. `title === null` → kein Wrapper, sonst `<h3>` + `.content-section`. Position-unabhängig.
- Rule: Wenn eine Sonderbehandlung für "ersten" Eintrag o.ä. gewünscht ist, diese nicht an `sort_order === 0` hängen. Admin-Reorder bricht das Invariant sonst still. Besser ein Content-Flag (nullable title, explicit `is_intro` column, etc.) — reorder-safe by design.

## 2026-04-14 — sort_order-Namespace muss per-locale sein
- Issue: `alit_sections` hat `locale` + `sort_order`. Reorder, POST-MAX-Lookup und GET scopten anfangs nicht nach locale → DE-Reorder würde FR-Reihenfolge verändern, FR-INSERT übernimmt DE's max. Codex fand 3 Varianten der gleichen Klasse.
- Fix: Jeder Read/Write mit `sort_order` muss WHERE locale einschließen: `ORDER BY sort_order WHERE locale = $1`, `MAX(sort_order) WHERE locale = $3`, `UPDATE ... WHERE id = $n AND locale = $m`. Reorder-Payload trägt `locale`. PUT akzeptiert kein `locale` (sonst orphan + ordinal-collision).
- Rule: Sobald eine Tabelle locale + sort_order hat, ist locale Teil des `sort_order`-Namespace. Jeder Touchpoint (SELECT/INSERT-MAX/UPDATE/reorder) muss scopen. PUT darf locale nicht mutieren.

## 2026-04-14 — Dashboard GET muss single-locale filtern, nicht nur die UI
- Issue: Admin-UI ist single-locale (DE). GET-Endpoint returnte alle Rows inkl. FR. Reorder-Client schickte `locale: "de"` hardcoded → sobald eine FR-Row in der Liste auftaucht, bricht Drag-Drop mit `rowCount !== 1`.
- Fix: Filter serverseitig an der Quelle. `GET /api/dashboard/alit?locale=de` (default). Dashboard-UI ist dann end-to-end single-locale — kein Mixed-Row-Unfall möglich.
- Rule: Wenn UI einen Scope annimmt (hier: locale), muss auch der Backend-GET diesen Scope durchsetzen. Client-seitige Filter allein reichen nicht, weil Tests/API-Clients die Annahme bypassen können.

## 2026-04-14 — Rich-Text HTML-Converter muss ALLE Mark/Block-Attribute round-trippen
- Issue: `journal-html-converter.ts` emittierte `<a>` ohne `download`-Attribut (obwohl `mark.download` im Schema), und spacer ohne `data-size`. Round-trip (Edit → Save) stripte silently. Aufgefallen weil seeded Alit-Content Download-Link + Small-Spacer hatte.
- Fix: Schema-Feld → HTML-Attribut emittieren (`download=""`, `data-size="s|m|l"`) UND beim Parsen zurücklesen (`hasAttribute("download")`, `parseSpacerSize(data-size)`). RichTextEditor-Sanitizer-Allowlist um die Attribute erweitern.
- Rule: Jedes Feld im Rich-Text-Schema braucht drei Punkte in Sync: (1) typed in journal-types.ts, (2) validiert in journal-validation.ts, (3) lossless round-trip in journal-html-converter.ts (emit + parse) + RichTextEditor-sanitizer-allowlist. Sonst editiert der Admin Content und verliert Attribute ohne Fehlermeldung.

## 2026-04-14 — Immutable Cache vs. mutable Response-Header
- Issue: `/api/media/[id]` servte `Cache-Control: public, max-age=31536000, immutable` auf JEDE Response. Rename-Feature änderte `media.filename`, der im `Content-Disposition`-Header eingebettet ist — Browser/CDN cachten den alten Namen bis zu einem Jahr.
- Fix: Cache-Policy nach Response-Shape splitten. Wenn `Content-Disposition` gesetzt wird (PDF/ZIP, oder `?download=1`): `public, max-age=300, must-revalidate`. Sonst (image/video ohne Disposition, bytes content-addressed by public_id): weiter `immutable`.
- Rule: `immutable` nur für Responses wo sowohl Body als auch Headers am public-key ewig stabil sind. Sobald ein Header mutable DB-Feld referenziert (filename, acl, etc.): kurze max-age + must-revalidate.

## 2026-04-14 — Rename muss Datei-Extension preservieren (+ Mime-Fallback)
- Issue: Rename-Endpoint überschrieb `media.filename` verbatim. Admin tippt "privacy-policy" als neuen Namen für `policy.pdf` → Content-Disposition download speichert extensionless → OS kann Datei nicht öffnen. Zweiter Bug: Upload ohne Suffix (z.B. "my-document" als PDF) hatte gar keine Extension zum Preservieren.
- Fix: `applyRename(original, mimeType, userInput)`: sanitize userInput, hänge Extension von Original an (oder fallback via `extensionFromMime(mime)` → .pdf/.zip). Wenn User eine andere Extension tippt, verwerfen und authoritative anhängen.
- Rule: Sobald ein Datei-Attribut (filename) sowohl im HTTP-Header (Content-Disposition) als auch im Admin-Flow editierbar ist, muss die Rename-Logik die file-type-bedeutsamen Teile (Extension, mime alignment) erzwingen. Plain "overwrite whatever admin typed" bricht Downstream-Consumer (Browser-Save, OS-Open).

## 2026-04-14 — Media-Registry muss jede Tabelle scannen die Media-URLs einbetten kann
- Issue: Nach Phase 2 (Alit-Sektionen mit Rich-Text) konnte Admin einen Media-Link in eine Alit-Sektion setzen. Die Registry scannte aber nur `journal_entries` + `agenda_items` → Medium zeigte "unused", Admin löschte → Alit-Sektion hatte dann einen toten Link.
- Fix: Neue MediaRefSource für `alit_sections` im Registry (`src/lib/media-usage.ts`). Pattern ist bewährt (gleiche Klasse wie der Agenda-Fix aus letzter Woche).
- Rule: Jedes neue Feature, das Rich-Text oder einen Medien-bezogenen JSON-Blob speichert, erweitert die Media-Usage-Registry. Als Checkliste in der Spec fest verankern. Sonst Datenloss-Bug bei nächstem Admin-Delete.

## 2026-04-14 — File-Picker `accept` muss MIME-Aliase + Extensions decken
- Issue: `accept="application/zip"` filterte auf manchen Browsern .zip-Dateien raus, weil der Browser sie als `application/x-zip-compressed` (legacy Windows MIME) taggt. Backend akzeptierte beide, aber der Admin konnte die Datei erst gar nicht auswählen.
- Fix: `accept="application/zip,application/x-zip-compressed,.zip,.pdf"` — MIME-Aliase UND Extension-Patterns zusammen. Extension-Match greift wenn der MIME-Match fehlschlägt.
- Rule: Bei File-Input `accept` immer sowohl alle bekannten MIME-Varianten als auch die Extension(s) angeben. Browser + OS machen das MIME-Mapping unvorhersehbar — Extensions sind die robuste Fallback-Ebene.

## 2026-04-15 — JSONB-per-field i18n statt Row-per-Locale
- Issue: Row-per-Locale (aktuelles `alit_sections`-Pattern mit `locale` + `sort_order`) bekam sehr schnell Probleme: `sort_order`-Namespace musste per-locale gescoped werden, Codex fand 3 Varianten der gleichen Klasse. Verbundene Metadaten (bei Agenda: datum/ort/images/hashtags) müssten pro Locale dupliziert und manuell synchron gehalten werden.
- Fix: JSONB-per-field. Eine Zeile pro logischer Entität, übersetzbare Felder als `{de, fr}`-JSONB-Spalte (`title_i18n`, `content_i18n`). `sort_order` bleibt single. Helper `t(field, locale, fallback='de')` resolved mit DE-Fallback.
- Rule: Für Entities mit 1-5 übersetzbaren Feldern (Title, Content, Lead) + geteilten Metadaten (Datum, Images, Slugs, FK-Referenzen) ist JSONB-per-field das richtige Modell. Row-per-Locale nur für fundamental getrennte Datensätze (z.B. Produkt-Varianten). Separate Translations-Tabelle (`i18n_alit_sections`) nur bei >10 übersetzbaren Feldern oder wenn Übersetzungs-Workflow (Status pro Übersetzung, Audit, verschiedene Übersetzer) relevant wird.

## 2026-04-15 — Multi-Locale Form: beide Editoren parallel mounted statt Remount
- Issue: Spec-Vorschlag Runde 1 war "beim Tab-Wechsel DE-Content flushen → Editor remounten mit FR-Content". Problem: RichTextEditor debounced intern `onChange`. Wenn User tippt und direkt auf FR-Tab klickt, geht das letzte Wort verloren (noch nicht geflusht → Remount → weg).
- Fix: Zwei Editor-Instanzen parallel im DOM, inaktive via `hidden`-Attribut ausgeblendet. Form-State hält beide Locales parallel (`form.html: {de, fr}`). Kein Remount bei Tab-Wechsel → React reconciled nur die Visibility, interne Editor-States bleiben stabil.
- Rule: Bei jedem Multi-Tab-Form mit asynchron-updatenden Inputs (debounced, async-validated, contentEditable) alle Instanzen mounted halten + per CSS/`hidden` umschalten. Remount = Daten-Loss-Risiko. Gilt analog für Drag-Drop-Listen (Remount verliert Drag-State), Video-Player (Remount verliert Playback-Position), etc.

## 2026-04-15 — Backfill verliert Shape-Metadaten, wenn Quelle + Ziel verschiedene Struktur haben
- Issue: Sprint-4-Schema-Migration backfillte `content_i18n.de` aus legacy `lines` (string[]) via `contentBlocksFromParagraphs`. Die Funktion kennt aber die begleitenden `images[]` mit `afterLine`-Platzierungen nicht — nach Rollout priorisiert der Reader `content_i18n`, alte Journal-Einträge hätten ihre inline-Bilder silent verloren. Codex-Finding P1 Sprint 4.
- Fix: Image-aware Helper `migrateLinesToContent(lines, images)` verwenden, der die Original-Migration-Logik (lines + images → blocks) bereits implementiert. Gilt für Schema-Migration UND Seed.
- Rule: Wenn ein Backfill von Legacy-Shape nach neuer Shape läuft, immer die **vollständige** Quell-Struktur betrachten — nicht nur das offensichtliche Feld. "Lines werden zu Content-Blöcken" vergisst die begleitenden Image-Positionen. Vor jedem Backfill: grep nach allen Consumer-Code-Stellen die Quell-Felder gemeinsam lesen — wenn mehrere Felder zusammen interpretiert werden, muss der Backfill das auch tun.

## 2026-04-15 — DE-Locale-Isolation darf nicht title-mithorchen
- Issue: DE-Filter in `getJournalEntries` skipte Entry nur wenn **Title UND Content** beide leer waren. Entries mit DE-Title aber FR-only-Content tauchten auf `/de/` als title-only "leere" Items auf (weil Content fehlte, Title-Rendering aber triggerte). Codex-Finding P2 Sprint 4.
- Fix: Filter basiert nur auf `hasLocale(content_i18n, "de")`. Content ist der Sprachträger; ein DE-Title ohne DE-Content ist semantisch "nur Tag", nicht "lesbarer Eintrag".
- Rule: Bei locale-Isolation-Filtern auf ein **primäres Feld** filtern (i.d.R. content, nicht title). Sekundäre Felder (title, footer, kategorie) sind i.d.R. nur Labels und deren Vorhandensein reicht nicht als "Entry hat Inhalt in dieser Locale". Gilt analog zu Completion-Flags: content-basiert, nicht title-basiert.

## 2026-04-15 — Schema-Migration Precondition-Abort mit Re-Run-Safety
- Issue: i18n-Backfill auf `alit_sections` musste nur DE-Rows migrieren (Precondition: `count(locale='fr') = 0`). Naive Lösung: throw bei FR-Rows. Problem: falls Migration bereits erfolgreich lief und später FR-Rows manuell hinzugefügt wurden, würde der nächste Boot crashen — obwohl alles korrekt migriert ist.
- Fix: Zwei-Stufen-Check. (1) FR-Rows vorhanden? → (2) Wurden JSONB-Spalten bereits befüllt (`content_i18n <> '{}' OR title_i18n <> '{}'`)? Wenn ja → idempotent skip (Backfill lief in einem früheren Boot). Wenn nein → throw mit klarer Fehlermeldung.
- Rule: Jede Schema-Migration mit Precondition-Check muss auch einen "bereits erfolgreich gelaufen"-Pfad haben. Throw-on-precondition-fail ohne Idempotenz-Check = Container-Bootstrap-Tod (siehe `instrumentation.ts`-Pattern in nextjs.md). Regel: `if (precondition_violated && !already_migrated) throw; else skip;`.

## 2026-04-15 — Dual-Write Legacy-Fallback leakt cross-locale auf Reader-Seite
- Issue: Sprint-2 Reader `getProjekte(locale)` fiel bei leerem `t(title_i18n, locale)` zurück auf legacy `r.titel` als Kompatibilitäts-Safety. Problem: dual-write writer (`pickLegacy(title_i18n)`) schreibt `de ?? fr` in `titel` — bei FR-only-Rows landet also FR-Text in der legacy-Spalte. DE-Reader liest dann FR-Text. Codex-Finding.
- Fix: Reader nutzt ausschließlich `*_i18n`-Spalten als Source-of-Truth. Legacy-Spalten sind **write-only** in der Dual-Write-Phase, werden nur für Rollback-Safety geschrieben, nicht gelesen. Zusätzlich: für DE-Locale wird der Entry geskipt wenn DE-Content fehlt (kein FR→DE Reverse-Fallback).
- Rule: Dual-Write-Phase klar trennen: Legacy-Spalten werden **geschrieben** für Rollback-Safety, der Reader liest sie aber NIEMALS. Sonst leakt die Writer-Heuristik (z.B. "nimm DE wenn leer dann FR") zurück in den Read-Pfad und bricht locale-isolation.

## 2026-04-15 — Null-Payload in Partial-PUT umgeht Validator wenn null == undefined behandelt wird
- Issue: `validateI18nString(field)` returnte `true` sowohl für `undefined` (skip-Intent) als auch für `null` (explicit-clear-Intent). PUT-Handler unterschied nur `undefined` als Skip → `null` fiel in den update-Pfad, dann Crash in `pickLegacy(null)` (field.de auf null → TypeError). 500 statt 400.
- Fix: Validator rejected `null` explizit (`field === null → return false`). `undefined` bleibt Skip-Signal. Wer clearen will, muss `{}` senden.
- Rule: Bei partial-PUT mit nullable JSONB-Feldern: `undefined = skip`, `null = invalid`, `{} = cleared`. Niemals `undefined || null` im Validator zusammenwerfen — das eröffnet einen Crash-Pfad beim ersten nachfolgenden Handler, der `field.x` zugreift.

## 2026-04-15 — `lang`-Attribut per Feld, nicht per Card
- Issue: `isFallback` war ein card-level Flag, UI setzte `lang="de"` auf die gesamte Projekt-Card. Bei gemischten Translations (FR-Titel vorhanden, FR-Content leer → DE-Fallback auf Content) wurde der FR-Titel als Deutsch vorgelesen. Screen-Reader-Misspronunciation.
- Fix: Per-Feld-Flags (`titleIsFallback`, `kategorieIsFallback`, `contentIsFallback`). `lang="de"` landet nur auf dem konkreten Feld-Wrapper (`<h2>`, `<span>`, Content-Div) das tatsächlich DE-Content enthält. Parent-lang (`<html lang="fr">`) erbt für alle anderen Felder.
- Rule: Bei teilübersetzbaren Entities ist ein einzelnes `isFallback`-Flag zu grob. Jedes übersetzbare Feld braucht sein eigenes Fallback-Flag, und `lang` gehört auf den konkreten Text-Wrapper (h2, span, p), nicht auf die Entity-Card. Gilt auch für Agenda (Titel/Lead/Content) und Journal (Title/Lines/Content).

## 2026-04-15 — Cross-Column-Uniqueness serialisieren via pg_advisory_xact_lock
- Issue: Zwei Slug-Spalten (`slug_de`, `slug_fr`), beide UNIQUE pro Spalte. Per-column-UNIQUE catcht NICHT den Cross-Column-Fall (A.slug_de kollidiert mit B.slug_fr). App-level pre-SELECT + 23505-catch hat Race-Window — zwei concurrent POST können beide pre-SELECT passieren, dann colliden die resulting Slugs im Resolver. Codex fand das als P1 Sprint 5.
- Fix: Transaktion mit `SELECT pg_advisory_xact_lock($NAMESPACE_ID)` wrappen (BEGIN → lock → pre-SELECT → INSERT/UPDATE → COMMIT). Lock ist transaction-scoped, löst sich bei COMMIT/ROLLBACK automatisch. Alle concurrent Slug-Writer serialisieren auf derselben Integer-ID (z.B. `0x70726f6a656b74` = "projekt" ASCII).
- Rule: Wann immer ein Schema Cross-Column-Uniqueness braucht (Slug-in-mehreren-Spalten, Email-Alias + Email-Primary, etc.) und PG keine clean EXCLUDE-Constraint bietet: Pre-SELECT + INSERT/UPDATE in eine Transaktion mit `pg_advisory_xact_lock` wrappen. App-level-only-Check reicht NICHT — Race-Window ist ein echter Bug.

## 2026-04-15 — SEO-Visibility mirrors Reader-Filter exakt
- Issue: `getProjekteForSitemap()` (locale-neutrale SEO-Quelle) hatte eigenen Visibility-Begriff `has_de_content` (nur `content_i18n`). `getProjekte(locale)` (UI-Reader) filtert aber per `title_i18n OR content_i18n`. Folge: title-only Projekt auf Panel 3 sichtbar, aber aus Sitemap + hreflang-alternates silent gedroppt. Inconsistency zwischen "ist gerendert" vs "ist indexiert". Codex Sprint 5 Runde 2 P2.
- Fix: Visibility-Flag in getProjekteForSitemap auf breitere Semantik: `has_de = hasLocale(title_i18n, "de") || hasLocale(content_i18n, "de")`. Query zieht `title_i18n` mit. Comment verweist explizit auf getProjekte's Filter, damit beide nicht auseinanderlaufen.
- Rule: Sobald UI-Reader und SEO-Emitter beide eine „locale-Visibility"-Entscheidung treffen, MÜSSEN die Kriterien identisch sein — sonst entstehen leise Divergenzen (gerenderte Seite ohne Sitemap-Eintrag, Sitemap-Eintrag ohne gerenderte Seite). Besser: ein zentrale Helper-Funktion, die beide teilen. Alternativ: Code-Kommentar mit expliziter Quervergleich-Referenz, damit Refactorings in einem Reader den anderen zwingen mitzuziehen.

## 2026-04-15 — hreflang-Alternates nur für erreichbare Locales
- Issue: `generateMetadata` emittierte `languages.de` + `x-default` unconditionally. FR-only-Projekt (`has_de=false`) exponiert so einen toten `/de/projekte/<slug>`-Alternate — die Route returnt notFound, aber das hreflang-Cluster zeigt Google auf die 404. Codex Sprint 5 Runde 3 P2.
- Fix: `deVisible` / `frVisible` aus `has_de` / `has_fr` + `slug_fr` ableiten. `languages.de` nur bei `deVisible`, `languages.fr` nur bei `frVisible`, `x-default` → DE wenn reachable, sonst FR. Canonical ebenfalls gated: requested locale wenn visible, sonst Fallback auf die andere.
- Rule: hreflang-Alternates NIEMALS auf URLs zeigen lassen, die als 404 routen. Jedes `languages[locale]`-Entry braucht eine Visibility-Gate. `x-default` ist der preferred-locale-Fallback — auch der muss live sein.

## 2026-04-15 — metadataBase für absolute alternates — pro Environment
- Issue: Next.js `generateMetadata` emittiert relative `alternates.languages`-URLs ohne `metadataBase`. Google Search Console lehnt relative hreflangs ab. Zusätzlich: Staging und Prod müssen eigene Base-URL haben, sonst leakt Prod-Host in Staging-Canonicals.
- Fix: `src/lib/site-url.ts` kapselt `process.env.SITE_URL ?? 'https://alit.hihuydo.com'` (Default=Prod). `metadataBase: getSiteUrl()` in root `layout.tsx`. Container-env in `docker-compose.yml` (prod) und `docker-compose.staging.yml` hart gesetzt — NICHT in gemeinsamer `.env` (Staging-`.env` ist Symlink auf Prod-`.env`, würde collidieren).
- Rule: Bei Domain-Kopplung (metadataBase, canonical, sitemap, OG-URL): IMMER Env-gesteuert, never hardcoded. Bei geteiltem `.env` zwischen Envs: Docker-Compose `environment:`-Block ist der clean override-Mechanismus. Kein `NEXT_PUBLIC_SITE_URL` — SEO-URLs sind server-only.

## 2026-04-16 — Compose env-allowlist trap (eager-checked env nie im Container)
- Issue: Phase-1 fügt eager `IP_HASH_SALT`-Check in `src/instrumentation.ts` ein. `.env.example` dokumentiert den Var. Container startet trotzdem mit `Error: IP_HASH_SALT must be set` und crasht im Healthcheck-Loop. `IP_HASH_SALT` war auf dem Server in `.env` korrekt gesetzt.
- Fix: `docker-compose.yml` und `docker-compose.staging.yml` interpolieren env-Vars über expliziten Allowlist (`- DATABASE_URL=${DATABASE_URL}`-Stil, NICHT `env_file:`). Neue Var muss als `- IP_HASH_SALT=${IP_HASH_SALT}` ins `environment:`-Block, sonst bleibt sie auf Host-Side stehen und erreicht den Container nie.
- Rule: Wenn das Compose-Setup eine explizite env-Allowlist nutzt, ist `.env`-Update + Code-Check NICHT genug — der `environment:`-Block beider Compose-Files muss synchron erweitert werden. Sanity-Check: `docker exec <container> env | grep <VAR>` zeigt sofort, ob die Variable im Container ankommt. Eager-Startup-Checks werden zur Diagnose-Goldgrube, weil sie genau diesen Fall sofort sichtbar machen.

## 2026-04-16 — Honeypot-Field-Name und Browser-Autofill-Kollision
- Issue: Honeypot-Field hieß `name="company"`. Browser/Profile-Autofill (Firefox/Chrome füllen Organization-Field aus dem User-Profil) trägt da automatisch einen Wert ein. Server interpretiert ausgefüllten Honeypot als Bot-Submission → silent 200 OK ohne DB-Insert. Echte User bekommen positives Feedback, ihre Anmeldung verschwindet. Codex PR #44 [P2].
- Fix: Project-prefixed nicht-semantischer Name (`alit_hp_field`). `autoComplete="off"` + `tabIndex={-1}` + `aria-hidden`-Wrapper bleiben.
- Rule: Honeypot-Feldnamen NIEMALS aus dem Standard-Autofill-Vokabular wählen (`company`, `organization`, `phone`, `address`, `url`, `website`, `address-line-*`, `email`, `name`). Project-prefix + non-semantic Name + `autoComplete="off"` ist die Mindest-Defense. Ohne diese Sorgfalt ist der Honeypot eine User-Daten-verlust-Falle, nicht ein Bot-Filter.

## 2026-04-16 — CSV Formula-Injection-Schutz für public-form-Daten
- Issue: CSV-Export von `memberships`/`newsletter_subscribers` enthält public-form-Daten. Wenn ein Angreifer als Vorname `=HYPERLINK("https://evil.tld","Klick")` einträgt, interpretiert Excel/Numbers das beim Öffnen als Formel — Phishing-Vektor gegen den Admin, der die CSV öffnet. Codex Spec-Review Runde 2 [Security].
- Fix: `src/lib/csv.ts` neutralisiert Zellen, die mit `=`, `+`, `-`, `@`, TAB oder CR beginnen, durch `'`-Präfix vor dem Quote-Escape. Unit-Test deckt sowohl reine Formula-Trigger als auch Kombination mit Quote-Wrapping (`=HYPERLINK("a;b")` → `"'=HYPERLINK(""a;b"")"`).
- Rule: Jeder CSV-Export aus public-form-Quellen MUSS Formula-Injection-Guard. Klar zu trennen vom Quote-Escape (Delimiter/Newline). Die `'`-Prefix-Strategie ist OWASP-Standard, hält Excel-Auto-Open + Numbers + LibreOffice gleich gut ab.

## 2026-04-16 — INSERT-first vs check-then-INSERT für Uniqueness
- Issue: Spec v1 beschrieb Mitgliedschafts-Duplicate-Check als "wenn Membership-Email schon existiert → 409, Newsletter-Insert nicht probieren". Klingt nach pre-SELECT vor INSERT. Pattern-Verstoß gegen `patterns/auth.md` "Check-then-Insert Races" — race-window zwischen SELECT und INSERT erlaubt Duplicate-Inserts unter Concurrency. Codex Spec Runde 1 [Correctness].
- Fix: INSERT-first ohne pre-SELECT, `UNIQUE(email)` Constraint feuert PG-Error `23505`. Code mappt `err.code === "23505"` auf 409 `already_registered`. Newsletter-Insert in derselben Transaktion mit `ON CONFLICT(email) DO NOTHING` (idempotent, anti-enumeration).
- Rule: Uniqueness gehört in den DB-Constraint, nie in App-Code-Pre-Check. Die SQL-Error-Code-Liste (`23505` für UNIQUE-Violation, `23503` für FK-Violation, `23514` für CHECK) ist die kanonische Quelle für 409/422. App-Layer-Pre-SELECT garantiert nichts unter Concurrency und kostet nur eine Roundtrip.

## 2026-04-16 — Newsletter idempotent vs Mitgliedschaft 409 (Anti-Enumeration vs UX)
- Issue: Beide Public-Signup-Endpoints behandeln Email-Duplikate. Die richtige Antwort hängt vom Use-Case ab — eine Konvention reicht nicht.
- Fix: Newsletter → idempotent 200 mit `ON CONFLICT DO NOTHING` (Bot kann nicht herausfinden, welche Mails schon abonniert sind = Anti-Enumeration-Oracle). Mitgliedschaft → INSERT-first, 409 `already_registered` (User-Feedback ist mehr wert als Anti-Enum bei einer Vereins-Site mit ~20 Mitgliedern; "Sie sind bereits Mitglied" ist UX-relevant).
- Rule: Bei Public-Endpoints, die personenbezogene Identifier annehmen, das Trade-off explizit machen: hohe Spam-/Enum-Gefahr → idempotent 200 ohne Existenz-Signal. Niedrige Enum-Gefahr + UX-Notwendigkeit → 409 mit klarer Meldung. Pro Endpoint dokumentieren, NIE als globale Default-Konvention.

## 2026-04-16 — Eager-env-Check vor lazy-Use in Server-Routen
- Issue: `IP_HASH_SALT` wurde in `src/lib/ip-hash.ts` über `process.env.IP_HASH_SALT ?? ""` gelesen — lazy beim ersten Request. Bei fehlendem Salt wären unsalted Hashes in die DB geleakt, oder der Throw-Pfad wäre erst beim ersten Signup gefired (nicht beim Boot). Sonst wäre der Failure Mode "Container ist gesund, Health 200, aber jeder Signup 500" — schwer zu debuggen.
- Fix: Eager Check in `src/instrumentation.ts` vor `ensureSchema()`: throw wenn `salt.trim().length < 16`. Container startet nicht ohne validen Salt, Healthcheck wird nie grün. Defense-in-Depth in `ip-hash.ts` (zusätzlicher Throw bei leerem Salt) für Test-Env-Schutz.
- Rule: Environment-Variablen mit Security-Bedeutung (Salts, Secrets, API-Keys) werden eager im `register()`-Pfad validiert, nicht lazy in der Funktion, die sie nutzt. Crash-bei-Boot ist immer besser als silent-degrade-bei-Request.

## 2026-04-16 — Spec-only Commit triggert Sonnet-Evaluator → Done-Criteria-FAIL by design
- Issue: `tasks/spec.md` zu committen triggert über `post-commit`-Hook den Sonnet-Spec-Evaluator. Der prüft Done-Criteria HART gegen den Codebase-Zustand. Bei spec-only-Commit (Implementation noch nicht da) sind alle implementierungs-pflichtigen Criteria FAIL. `qa-report.md` enthält dann `NEEDS WORK`, was den `pre-push`-Hook blockiert — auch wenn die Spec selbst inhaltlich approved ist.
- Fix: Nach Implementation `tasks/spec.md` mit einem trivialen Status-Update (z.B. `<!-- Implementation complete YYYY-MM-DD -->`) erneut committen → post-commit-Hook re-evaluiert gegen den jetzt-implementierten Code → qa-report.md wird APPROVED.
- Rule: Wenn `qa-report.md` von einem spec-only-Commit hängenbleibt: nicht `SKIP_HOOKS=1` umgehen. Stattdessen spec.md trivial touchen + re-committen. Das nutzt den vorgesehenen Loop, dokumentiert "Implementation done" im Spec-File und liefert eine echte qa-report-Aktualisierung statt einer Bypass-Lücke.

## 2026-04-16 — Tab-Background-Blending bei Section-Bg = Page-Bg
- Issue: Tabellen-Header `bg-gray-50` auf Dashboard-Body `bg-gray-50` → Header verschwindet komplett, Tabelle wirkt "rahmenlos auf grau".
- Fix: Tables explicit auf `bg-white` (das Card/Tabelle vom Page-Bg löst), Header darin auf `bg-gray-100` (kontrastiert sichtbar zur Table-bg).
- Rule: Wenn Page-Bg nicht-weiß ist (typisch `bg-gray-50` für Admin-Dashboards), MUSS jede Card/Tabelle eigenes `bg-white` setzen. Innere Header/Akzent-Bg dann eine Stufe dunkler (`bg-gray-100`). Tailwinds Default-Zebra-Stripe `bg-gray-50` als Hover-State `hover:bg-gray-50/60` (semi-transparent) damit der Page-Bg nicht durchscheint.

## 2026-04-16 — Dirty-Signal: diff-vs-initial schlägt "Editor offen"
- Issue: Sprint 7 Dirty-Editor-Warnung Must-Have war initial "Editor offen = dirty". Manueller Smoke-Test auf Staging: User öffnet Editor, tippt nichts, klickt Tab → Modal erscheint trotzdem. False-Positive-Friktion. Planner hatte das als Nice-to-Have #1 markiert, aber bei echter User-Erfahrung sofort Must-Have.
- Fix: Snapshot-basierter Diff per Section. `initialFormRef = useRef<string>("")`, `openCreate`/`openEdit` setzen Ref via `JSON.stringify(nextForm)` direkt nach `setForm`. `isEdited = showForm && JSON.stringify(form) !== initialFormRef.current`. Agenda/Projekte/Alit pattern. Journal analog mit hasEditsRef via markDirty (form lives inside Editor-Component). Bonus: Revert-to-Original wird als "sauber" erkannt (Snapshot-Diff, nicht Touched-Flag).
- Rule: Bei jedem "Dirty-Guard"-Feature ist "Editor offen" zu grob. User-Erwartung: Modal nur bei echten Edits. Snapshot-Diff per Section ist robust, deckt auch Revert-to-Original ab und ist simpler als wrapping jedes einzelnen onChange-Setters. Gilt für alle Modal-Confirm-Flows mit "unsaved changes"-Semantik.

## 2026-04-16 — useEffect-hop Dirty-Propagation ist racy bei User-Events
- Issue: Codex PR-Review flaggte [P1] für Dirty-Signal via useEffect. Flow war: onChange → setState → re-render → useEffect → setDirty(key). Problem: zwischen setState (keypress event) und useEffect-Flush kann ein Klick-Event feuern. `confirmDiscard` liest dann noch den alten cleanen State → navigiert weg ohne Modal → Data-Loss. React flushed passive Effekte zwar vor dem nächsten Frame, aber React 18+ Scheduler kann Task-Scheduling gegen User-Input interleaven.
- Fix: Sync-during-render pattern. `setDirty` mutiert nur einen Ref in DirtyContext (kein Re-Render-Trigger), daher safe im Render-Body. Mit `lastReportedRef` guard: `if (isEdited !== lastReportedRef.current) { lastReportedRef.current = isEdited; setDirty(key, isEdited); }`. Dirty-State ist garantiert aktuell BEVOR der nächste Event-Handler läuft. useEffect nur noch für unmount-Cleanup (`return () => setDirty(key, false)`). Für Editor-in-Child-Component (JournalEditor): hasEditsRef + onDirtyChangeRef, markDirty ruft Callback synchron.
- Rule: Wenn die "Wahrhaftigkeit" eines State-Signals DIREKT einen User-Event-Handler beeinflusst (Click-Guard, Keyboard-Shortcut-Guard), reicht useEffect nicht — die Propagation muss synchron sein. Options: (1) Sync-during-render auf ref-Mutation (kein Re-Render-Trigger), (2) Ref + sync callback aus onChange-Handler. NIEMALS useState → useEffect → callback-chain für event-gate Signale. Codex hat das 2× hintereinander gefunden (Journal 2-hop, dann Agenda/Projekte/Alit 1-hop nach Journal-Fix), also konsequent alle Sections sync machen.

## 2026-04-16 — AbortError silent-catch am fetch-Layer, nicht am Controller-Owner
- Issue: Sprint 7 initial war AbortController im JournalEditor (hält Ref, abortet on unmount). AbortError-Catch war auch dort geplant. Codex Spec-Review R2 [Correctness]: der eigentliche `fetch` sitzt in `JournalSection.handleSave`. Wenn dort nicht gecatched wird, setzt der generic `catch` weiterhin `setError("Verbindungsfehler")` — obwohl Editor den Abort als "nicht-Fehler" meint.
- Fix: Silent-Catch muss an der Stelle stehen, wo der `fetch` lebt. `JournalSection.handleSave` bekommt: `catch (err) { if (err instanceof DOMException && err.name === "AbortError") return; setError("Verbindungsfehler"); }`. JournalEditor hält Controller-Ref + ruft nur `.abort()`.
- Rule: Bei AbortController-Workflows: Owner (Component-mit-Ref) und Fehlerpfad (catch mit AbortError-Check) können unterschiedliche Layer sein. Der Silent-Catch MUSS am Layer mit dem `fetch`-try/catch sein, sonst fires der generic error handler trotz Abort. Zweiter wichtiger Punkt: "client abort cancels in-flight fetches" ist best-effort — wenn Server bereits committed hat, ist der Write nicht rückholbar. Spec-Wording entsprechend weich formulieren.

## 2026-04-16 — vitest 4.x: environmentMatchGlobs entfernt, per-file Pragma nutzen
- Issue: Sprint 7 sollte erstmals Component-Tests mit jsdom neben bestehenden Node-Tests haben. Planner-Vorschlag R1: `environmentMatchGlobs` in vitest.config. Codex R2 [Contract]: in vitest@4.1.4 ist diese Config-Option nicht mehr erkennbar (wurde in 4.x entfernt zugunsten von `test.projects`).
- Fix: Globale `environment: "node"` in vitest.config bleibt, `include` um `*.test.tsx` erweitern. jsdom per-file via Pragma-Kommentar: `// @vitest-environment jsdom` als erste Zeile der DirtyContext.test.tsx. Pragma ist stable seit vitest 0.x.
- Rule: Bei vitest-Config-Optionen für Environment-Switching immer Pragma-Kommentar bevorzugen — versionsstabil, weniger Config-Risiko. Bei vitest 4.x keine `environmentMatchGlobs` mehr (breaking change aus 3.x). `test.projects` ist die offizielle moderne Alternative für echte Split-Setups.

## 2026-04-16 — Next-Lint rejects `{ current: T }` mutations in test harnesses
- Issue: Test-Helper `Probe` mutierte `harness.current = useDirty()` im Render-Body. Next-Lint meldet `error: This value cannot be modified` (React 19's RefObject ist readonly-typed, Next-Lint feuert für ähnlich geformte Objekte).
- Fix: `renderHook` aus `@testing-library/react` statt selbst gebautem Probe-Pattern. `const { result } = renderHook(() => useDirty(), { wrapper: DirtyProvider })`. Dann `result.current.setDirty(...)` — `result` ist nicht React-Ref-typed.
- Rule: Für Hook-Tests in React 19 / Next: immer `renderHook` nutzen, kein eigenes Probe-Component mit `{ current: T }`-Slot. Name "current" + object-mutation in render triggert Lint-Rules. Wenn ein echtes Probe nötig ist (weil renderHook nicht reicht), Slot-Property anders benennen (`{ value: T }`) UND Mutation im useEffect statt im Render.

## 2026-04-16 — Codex CLI: model-Flag via `-c model=...`, nicht `--model`
- Issue: Skill-Docs sagten `codex exec --model gpt-5.4` bzw `codex review --model gpt-5.3-codex`. Beide Flags sind in OpenAI Codex CLI v0.118.0 NICHT valid — `--model` gibt `unexpected argument` Error. Zusätzlich: `gpt-5.4` scheint nicht zu existieren (Codex Spec-Evaluator hing 25+ Min ohne Output).
- Fix: `-c model=<name>` als TOML-Config-Override (siehe `codex --help`). Model: `gpt-5.3-codex` funktioniert zuverlässig für sowohl PR-Review als auch Spec-Review. Bei `codex exec`: Alternative `-m <model>` als Shortcut.
- Rule: Codex-CLI-Model-Override IMMER via `-c model=...` (universell) oder `-m ...` (nur bei `exec`). NICHT `--model`. Wenn Codex-Review/Exec länger als 5 Min ohne Output bleibt: Wahrscheinlich Model-Name-Problem, Prozess killen + mit bekanntem Model (gpt-5.3-codex) neu starten.

## 2026-04-16 — robots.ts + force-dynamic aus gleichem Grund wie sitemap
- Issue: Sprint 7 robots.ts sollte Staging via hostname-prefix unterscheiden (Staging → Disallow: /). Ohne `force-dynamic` inlined Next den Build-Zeit-Default von `getSiteUrl()` statisch, Staging-Branch feuert nie.
- Fix: `export const dynamic = "force-dynamic"` auf `src/app/robots.ts`. Identische Logik wie `sitemap.ts` (beide lesen runtime SITE_URL).
- Rule: Jede Next.js App-Router Metadata-Route (`robots.ts`, `sitemap.ts`, `manifest.ts`), die `process.env.*` liest, braucht `force-dynamic`. Sonst wird der Fallback-Default in den statischen Output eingebrannt. Deployment-Override via Docker-Compose `environment:`-Block funktioniert nur mit runtime-evaluation.

## 2026-04-15 — Immutable Public-ID als stabile Hashtag-Referenz
- Issue: Hashtag-References (`agenda_items.hashtags[].projekt_slug`, `journal_entries.hashtags[].projekt_slug`) zeigen auf ein Projekt. Wenn Projekte slug_de + slug_fr bekommen, gibt es zwei Möglichkeiten: (a) Hashtag-Shape migrieren zu `{de, fr}`, oder (b) Hashtag behält single string, der Rendering-Code löst Locale-URL auf. Migrations-Aufwand unterscheidet sich massiv.
- Fix: Option (b) — `projekt_slug` bleibt single string und speichert die stabile `slug_de`. `slug_de` ist by-contract **immutable nach Create** (PUT body rejected mit 400). Rendering-Zeit: `buildProjektSlugMap(projekte)` keyed by slug_de; AgendaItem/JournalSidebar macht `map[h.projekt_slug]?.urlSlug` → Link. Map-miss = `<span>` ohne Link (locale-hidden Projekt — keine 404-Links).
- Rule: Wenn ein Attribut sowohl als **öffentliche URL** als auch als **interne Referenz** funktioniert, trenne die Rollen: eine spalte als "immutable stable ID" (für References), separate optionale Locale-Varianten für URLs (via urlSlug-Derivation). Eine Rename-Feature gehört in einen separaten Sprint mit History-Table + Resolver-Rebinding, nicht "beim bauen mitmachen".
