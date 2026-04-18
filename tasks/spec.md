# Spec: Mobile Dashboard Sprint B2a — Signups Cards + Bulk Sticky-Bar + PaidHistory Stack
<!-- Created: 2026-04-18 -->
<!-- Author: Planner (Claude) -->
<!-- Status: v3 — Codex R2 addressed: R1 8 resolved + 2 partial, plus 4 new v2-cleanup findings (handler-parity as behavior test, shared-height mandatory constant, state-matrix scoped to id-presence, blast-radius claim downgraded). Ready for generator. -->

## Summary

Macht den Signups-Tab (Mitgliedschaft + Newsletter) auf iPhone Portrait bedienbar. Auf `<md` ersetzt ein Card-Layout die 13- bzw. 8-spaltige Tabelle. Bulk-Actions (CSV-Export, Bulk-Delete) wandern in eine Sticky-Bar am unteren Rand wenn Selection > 0. Der PaidHistoryModal stacked seine Row-Felder auf sehr schmalen Viewports (<400px). Desktop bleibt unverändert (Tabellen + Header-Buttons + horizontale Row-Layout).

**Keine Server-/Data-Layer-Änderungen** — pure UI-Sprint. Client-Interaction-State erweitert sich in-place (neuer `memberExpanded`-State, neue a11y-Invarianten, neue Focus-Order auf Cards). Das ist **Logik auf Client-Ebene**, nicht bloßer Render-Refactor.

## Context

**Sprint-Reihe:** Sprint A (PR #73) brachte Foundations (Modal, Burger, Drag-Handle 44×44). Sprint B1 (PR #74) brachte ListRow-Primitive + 4 Row-Refactors auf Agenda/Journal/Projekte/Alit. **B2a ist der „Data-Tables"-Part des verbleibenden Scopes.** B2b (Editor-Toolbar + MediaSection + MediaPicker) folgt separat.

**User-Signal:** Während B1-Smoke-Test (2026-04-18): „die tabellen sehen nicht gut aus auf mobile" — Signups-Tab ist der kritische Fall (13 Columns memberships → `overflow-x-auto` mit horizontalem Scroll).

**Relevante bestehende Bausteine:**
- `SignupsSection.tsx` (712 Zeilen) — State, Sort, Selection, Sub-Tab-Toggle, Bulk-Actions bereits gebaut; nur Rendering ist Desktop-only
- `Modal.tsx` — Sprint-A-ready (mobile-first, 44×44 close, safe-area max-h, z-50)
- `PaidHistoryModal.tsx` — Trigger via „🕐"-Button in Memberships-Row; `<ul>/<li>` mit `max-w-[14rem]` auf Email
- `dashboardStrings` in `src/app/dashboard/i18n.tsx` — zentral, Blöcke `dirtyConfirm/modal/deleteConfirm/bulkDelete/paidUntoggle` bestehen
- Pattern `CSS-Dual-DOM > useMediaQuery` (siehe `patterns/nextjs.md`) — auf B1-ListRow angewendet, hier wiederverwenden

**Scope-Size:** Medium (3 Files + 4 neue kleine Subcomponents + Tests). `ListRow`-Primitive wird NICHT benutzt (Signups-Rows sind Cards mit Collapse + Paid-Toggle + History + Checkbox, nicht Drag-Rows mit Action-Cluster).

## Requirements

### Must Have (Sprint Contract)

1. **Memberships-Card auf `<md`** — Hybrid-Layout:
   - Immer sichtbar: Checkbox (44×44), Name (Vorname + Nachname), Email, Datum (formatted), „🕐"-Button (44×44), „×"-Delete-Button (44×44), „Bezahlt"-Checkbox (44×44 mit tooltip `paid_at`)
   - Collapsible „Details"-Toggle öffnet: Adresse (Strasse Nr / PLZ Stadt), Newsletter-Opt-In (✓/–), `consent_at` formatted
   - Desktop `≥md`: Tabelle unverändert
2. **Newsletter-Card auf `<md`** — Stacked Label-Value:
   - Alle Felder als Label + Value-Pairs vertikal: Checkbox + Name (zusammen in einer Zeile), Email, Woher, Quelle (form/membership), Datum, „×"-Delete
   - Kein Collapse nötig (nur 6 Felder)
   - Desktop `≥md`: Tabelle unverändert
3. **Bulk Sticky-Bar auf `<md`** — wenn `selected.size > 0`:
   - Fixed `bottom-0 left-0 right-0` mit Selection-Count + CSV-Export-Button + „Ausgewählte löschen"-Button (rot)
   - Buttons 44×44, `pb-[env(safe-area-inset-bottom)]` damit Home-Indicator nicht übergeht
   - **Handler-Parität zu Desktop — Behavior-Parity-Test (Pflicht):** Sticky-Bar und Header-Buttons rufen dieselben internen Funktionen. Der Test prüft **beobachtbares Verhalten** (nicht Spy auf function-local closures): (a) Click auf Sticky-„Ausgewählte löschen" öffnet exakt 1 `role="dialog"` mit dem Bulk-Delete-Confirm-Text; (b) Click auf Sticky-„CSV" triggert einen Download-Link mit dem Dateinamen-Pattern (gleicher `mitgliedschaften-{date}.csv` / `newsletter-{date}.csv` wie Header-Button); (c) Disabled-State bei `bulkDeleting === true` identisch auf beiden Surfaces (attribute-match im DOM). Keine mobile-only Mutation-Logic.
   - Desktop `≥md`: Buttons bleiben im Sub-Tab-Header (current state)
4. **PaidHistoryModal Row-Layout** — class-string-Invariante:
   - `<li>` bekommt exakt: `flex flex-col gap-1 min-[400px]:flex-row min-[400px]:items-baseline min-[400px]:gap-3`
   - Email-Span: `<400px` kein `max-w-[14rem]` (wrap erlaubt); `min-[400px]:max-w-[14rem] min-[400px]:truncate` für horizontale Variante
   - (Test-Strategie: Class-String im DOM prüfen — kein Viewport-Mock nötig)
5. **Sub-Tab-Toggle auf `<md`** bleibt sichtbar — keine Überlappung mit Sticky-Bar (Sticky-Bar hat eigenen Flow-Spacer — siehe Architecture Decision 5)
6. **44×44 Touch-Targets** auf allen neuen Interaktionen (Checkbox, Delete, History, Paid-Toggle, Details-Collapse-Toggle, Sticky-Bar-Buttons)
7. **A11y — Collapse-Toggle** (**neu in v2**):
   - Collapse-Button hat `aria-expanded={isExpanded}` und `aria-controls="member-details-{id}"`
   - Details-Container hat `id="member-details-{id}"`
   - Test: assert `aria-expanded` und `aria-controls` via `getByRole("button", { name: /details/i })`
8. **A11y — Selection-Count-Announcement** (**neu in v2**):
   - Sticky-Bar hat `role="region"` + `aria-label="Auswahl-Aktionen"` auf dem Container
   - Selection-Count wird in einer `aria-live="polite"` Region rendern („N ausgewählt")
   - Test: `role="status"` oder `aria-live="polite"` Element mit Count-Content vorhanden
9. **Test-Grün** — `pnpm test` mit neuen Tests: Dual-DOM-Präsenz (Tabelle + Cards gleichzeitig im DOM), Sticky-Bar-Visibility-on-Selection, Handler-Parität (Sticky-Bar-Button triggert selbe Funktion wie Header-Button), PaidHistoryModal Class-String-Invariante, aria-expanded-Transition, Live-Region-Content.

### Nice to Have (Follow-up nach B2a, NICHT dieser Sprint)

1. Stärkere destructive-Variant-Styling im Sticky-Bar (separator vor danger-actions, bg-red-50 hover)
2. Card-Swipe-Actions (Swipe-Left → Delete) — iOS-Pattern, später
3. Tablet-spezifische Zwischen-Variante (Zwei-Spalten-Cards auf ≥640 <md)
4. Sticky-Bar enter/exit-Animation (slide-up/fade)
5. Extraktion der 4 neuen Subcomponents in eigenes Modul-Verzeichnis (aktuell: zusammen in `SignupsSection.tsx`)

### Out of Scope

- RichTextEditor-Toolbar-Responsive-Umbau (B2b)
- MediaSection List-View 5-Button-Cluster (B2b)
- MediaPicker Grid-Columns + Width-Buttons-Stack (B2b)
- Server-Side Änderungen an `/api/dashboard/signups/**` (pure UI-Sprint)
- Sprint C Cookie-Flip
- JWT_SECRET-Fail-Mode-Normalisierung

## Technical Approach

### Files to Change

| File | Change Type | Description |
|------|-------------|-------------|
| `src/app/dashboard/components/SignupsSection.tsx` | Modify | CSS-Dual-DOM: existierende Tabelle `hidden md:block` wrappen; neue Mobile-Section mit 4 inline Subcomponents `md:hidden`. Sticky-Bar conditional render + Flow-Spacer. Neuer State `memberExpanded`. State+Logic bleibt im Parent, Subcomponents rein präsentational. |
| `src/app/dashboard/components/PaidHistoryModal.tsx` | Modify | `<li>` Class-String auf `flex flex-col gap-1 min-[400px]:flex-row min-[400px]:items-baseline min-[400px]:gap-3`. Email-Span: `min-[400px]:max-w-[14rem] min-[400px]:truncate`. |
| `src/app/dashboard/i18n.tsx` | Modify | Neuer `signups`-Block mit Mobile-Card-Labels: `details`, `detailsExpand`, `detailsCollapse`, `address`, `newsletterOptIn` (ja/nein), `consentAt`, `source`, `woher`, `selectedCount(n)`, `exportCsv`, `deleteSelected`, `regionLabel`. |
| `src/app/dashboard/components/SignupsSection.test.tsx` | Create | Structural tests — siehe Section „Tests". |
| `src/app/dashboard/components/PaidHistoryModal.test.tsx` | Create (existiert nicht) | Class-String-Invariante für Row + Email-span. |

### Subcomponents (inline in `SignupsSection.tsx`, rein präsentational)

1. **`MembershipCard`** — Props: `row`, `isSelected`, `onToggleSelect`, `isExpanded`, `onToggleExpand`, `isPaidToggling`, `onTogglePaid`, `onOpenHistory`, `onRequestDelete`. Rendert Card-Layout mit Core + Collapse-Region.
2. **`NewsletterCard`** — Props: `row`, `isSelected`, `onToggleSelect`, `onRequestDelete`. Stacked Label-Value.
3. **`MobileBulkBar`** — Props: `count`, `onExport`, `onBulkDelete`, `bulkDeleting`. Fixed-positioned, `md:hidden`, `pb-[env(safe-area-inset-bottom)]`, `role="region"` + `aria-label`. Selection-Count in `aria-live="polite"` Region. Höhe via shared const (siehe unten).
4. **`BulkFlowSpacer`** — Props: `visible`. Renders `<div>` als flow-Element mit **derselben shared Höhen-Klasse** wie die Sticky-Bar, `pb-[env(safe-area-inset-bottom)]`, `md:hidden`. Sorgt dafür dass die letzte Card scrollbar bleibt ohne durch die Sticky-Bar verdeckt zu werden.

**Shared Height Constant (mandatory):** Am Top der SignupsSection-Datei als Modul-Konstante:
```ts
const BULK_BAR_HEIGHT = "h-20"; // 80px — 44px tap-target + 36px padding
```
Beide `MobileBulkBar` und `BulkFlowSpacer` **müssen diese Konstante konsumieren** — keine literals, keine `h-24` / `h-16` etc. Test asserted dass Sticky-Bar-Root-Element und Spacer-Element beide denselben Klassennamen tragen (extrahiert aus der Konstante).

### Architecture Decisions

1. **CSS-Dual-DOM statt `useMediaQuery`** — analog B1-ListRow. Wrapper sind **strikt** `hidden md:block` (Tabelle) / `md:hidden` (Mobile-Section). **Verboten:** `visually-hidden`, off-canvas-Transform, `opacity: 0`, `visibility: hidden` — sonst doppel-announce im Screen-Reader. Review-Pflicht: jeder Dual-DOM-Wrapper muss genau eine der beiden Klassen haben.
2. **Kein `ListRow`-Reuse** — ListRow-Primitive ist für Drag-Rows mit Action-Cluster („…"-Menu) gedacht. Signups-Cards haben Checkbox + Collapse + Paid-Toggle + History + Delete als inline Row-Actions. Eigene Subcomponents.
3. **Subcomponents als Readability-Refactor** — SignupsSection.tsx ist bereits 712 Zeilen. Die 4 inline-Subcomponents (MembershipCard, NewsletterCard, MobileBulkBar, BulkFlowSpacer) sind **präsentational** (keine Hooks außer event-handler wiring). State+Logic bleibt im Parent. **Primär-Ziel:** Presentational/Logic-Separation im selben File → das JSX der Mobile-Section wird lesbar, nicht Blast-Radius-Reduktion. Tests mounten weiterhin `<SignupsSection>` als Ganzes (inline-subcomponents sind nicht direkt addressierbar). Echte Extraktion in eigene Files ist Nice-to-Have 5 (bei realem Bedarf nach targetablen Unit-Tests).
4. **Collapse-State-Matrix** — **Scope: id-presence-changing paths**. Andere `memberships`-Mutationen (initial-mount via `reload()`, paid-toggle optimistic + server-win via `setData(...)` in `executePaidPatch`) bleiben irrelevant, weil Card-ids stabil bleiben und kein Prune nötig ist.
   | Event | Effect on `memberExpanded` |
   |---|---|
   | Toggle-Button click | Flip id in Set (immutable update) |
   | Sort-Change (date asc/desc) | **Preserve** — Expansion ist per-id, nicht per-index |
   | Sub-Tab switch (Memberships ↔ Newsletter) | **Preserve** — State ist memberships-only, Newsletter-Tab ignoriert ihn |
   | Paid-Toggle (optimistic + server-win) | **Preserve** — ids stabil, keine Mutation der Card-Identity |
   | Initial Mount / Refetch (`reload()` ohne Delete) | Orphan-cleanup — prune ids die nicht mehr in `data.memberships` sind |
   | Single-Delete success (`handleDelete` → `reload()`) | Orphan-cleanup in `reload()` |
   | Bulk-Delete success (`handleBulkDelete` → `reload()`) | Orphan-cleanup in `reload()` |
   | Component unmount | React dropt State (kein persist) |
5. **Sticky-Bar Spacer + Safe-Area** — statt `pb-24 md:pb-0` auf der Liste ein explizites `<BulkFlowSpacer />`-Element direkt **nach** der Card-Liste rendern, conditional auf `selected.size > 0`. Spacer und Sticky-Bar teilen die **shared `BULK_BAR_HEIGHT`-Konstante** (siehe oben, Subcomponents-Section), beide bekommen zusätzlich `pb-[env(safe-area-inset-bottom)]`. Das garantiert dass auch iOS Rubber-Band-Overscroll die letzte Card nicht unter die Bar schiebt. **Safe-Area ausschließlich auf Spacer + Sticky-Bar** (INNEN), nicht auf body — per `patterns/tailwind.md` (Sprint-A Codex R2 Trap).
6. **Z-Index-Contract** — Sticky-Bar: `z-30`. Modal (`src/app/dashboard/components/Modal.tsx`): `z-50` (existing). Invariante: `sticky < modal` auf allen Viewports. Outcome-Test: wenn Bulk-Delete-Confirm offen ist, rendert genau 1 `role="dialog"` + Sticky-Bar ist im DOM aber overdeckt (manueller visual-check genügt; class-test prüft `z-30` vs `z-50`).
7. **PaidHistoryModal-Breakpoint `min-[400px]`** (Tailwind arbitrary media-query). Class-String-Invariante im DOM, nicht Viewport-Mock.
8. **Neuer `dashboardStrings.signups`-Block** — Mobile-Card-Labels nicht hardcoden. Pflegt die Doku-Drift-Freiheit des Projektes (DE-only heute, i18n-ready via Block-Duplikation morgen). Zwei String-Types: plain strings und count-functions für Pluralisierung (`selectedCount(n)`).

### Dependencies

- Extern: keine neuen deps. `min-[400px]` und `z-30`/`z-50` sind Tailwind v4 defaults.
- Intern: B1-Modal + B1-Safe-Area-Learnings. Kein B2b-Prereq.

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| Selection > 0, dann Sub-Tab-Wechsel (Memberships ↔ Newsletter) | Sticky-Bar re-rendert mit der anderen Selection. Wenn neue Tab-Selection = 0 → Sticky-Bar + Spacer weg. `memberExpanded` bleibt (noch sichtbar wenn zurück zu Memberships). |
| Sort-Change bei expandierter Card | Card bleibt expanded (id-based state, position-unabhängig). |
| Collapse aktiv auf Card, dann DELETE dieser Card | `reload()` prunt id aus `memberExpanded`. |
| Bulk-Delete mit gemischter expanded/collapsed Selection | `handleBulkDelete` ruft `reload()` → `memberExpanded` wird auf existierende ids reduziert. Selection wird leer. |
| Desktop-Viewport (md+) | Sticky-Bar `md:hidden` = display:none. Cards `md:hidden` = display:none. Tabelle `hidden md:block` = visible. Unverändert. |
| Safe-area-inset-bottom = 0 (non-notch Mobile) | `env(safe-area-inset-bottom)` evaluiert zu 0. Sticky-Bar + Spacer kollabieren auf reine Bar-Höhe. OK. |
| PaidHistory mit 0 Events | Empty-State bleibt (unverändert). Stack-Layout irrelevant. |
| PaidHistory Email sehr lang (>40 chars) auf `<400px` | Keine `max-w` → Email wrapped. Akzeptabel. |
| Bulk-Delete pending (bulkDeleting=true) + Sticky-Bar offen | Sticky-Bar-Button zeigt „Lösche…" + disabled (handler-parität zu Header). |
| pendingUntoggle-Confirm-Modal offen + Sticky-Bar sichtbar | Modal (`z-50`) overdeckt Sticky (`z-30`). Sticky bleibt im DOM aber nicht interagierbar (Modal-Backdrop fängt clicks). |
| Screen-Reader Navigation | Tabelle + Mobile-Section haben beide `hidden`-Varianten am Root-Wrapper — je nach Viewport ist nur eine `display:none` (SR ignoriert). Keine Doppel-Announce. Sticky-Bar `aria-live="polite"` kündigt Selection-Count-Änderungen an. Collapse-Toggle sagt `aria-expanded` an. |
| Rapid Click auf Collapse-Toggle | `setMemberExpanded` mit functional update (Set-immutable-toggle) — idempotent, keine Race. |
| Rollback | Pure UI, keine DB-Writes. Git-revert des Merge-Commits ist safe und vollständig. |

## Risks

- **Risk:** `BulkFlowSpacer` Höhe driftet von Sticky-Bar-Höhe → Last-Card-Overlap oder Extra-Gap.
  **Mitigation:** **Mandatory** shared `BULK_BAR_HEIGHT` Konstante am Top der Datei (siehe Architecture Decision 5 / Subcomponents). Beide Elemente konsumieren exakt diese Konstante — keine literals erlaubt. Unit-Test asserted dass Sticky-Bar-DOM und Spacer-DOM beide den-Klassennamen aus der Konstante tragen.
- **Risk:** Orphan-Cleanup-Matrix für `memberExpanded` wird nicht in jedem Path durchgezogen (z.B. wenn künftig Direct-Mutation statt `reload()` eingeführt wird).
  **Mitigation:** Cleanup in `reload()` zentralisiert. Jeder Mutation-Path muss `reload()` aufrufen ODER `memberExpanded` explizit prunen. Kommentar im State-Deklarator.
- **Risk:** Dual-DOM-SR-Safety driftet bei späteren Refactorings (jemand setzt `visually-hidden` statt `hidden`).
  **Mitigation:** Architecture Decision 1 explizit. Code-Kommentar am Wrapper.
- **Risk:** Handler-Parität zwischen Sticky-Bar und Header-Button driftet durch getrennte Implementierungen.
  **Mitigation:** `MobileBulkBar` bekommt Callbacks vom Parent, triggert dieselben Funktionen wie die Header-Buttons. Keine mobile-only Funktion.
- **Risk:** Neuer `dashboardStrings.signups`-Block erzeugt Merge-Konflikt mit parallel-laufenden Änderungen.
  **Mitigation:** Block wird am Ende des Objekts angehängt (stabile Insertion-Order).
- **Risk:** `aria-live` region schreibt bei jedem Re-Render → Screen-Reader-Spam.
  **Mitigation:** Live-Region-Content ist der reine Count-Text (`N ausgewählt`). Re-Render bei unverändertem Count produziert identischen Text → Screen-Reader deduplizieren.

## Verifikations-Strategie (nach Implementation)

1. `pnpm test` grün (248 → ≥262 mit neuen Tests)
2. `pnpm build` ohne TS-Errors
3. `pnpm audit --prod` 0 HIGH/CRITICAL
4. Dev-Server + DevTools iPhone SE (375px):
   - Memberships-Tab: Cards sichtbar, Collapse-Toggle funktioniert (aria-expanded beobachtbar in DevTools), Paid-Toggle triggert Confirm, History-Button öffnet Modal, Delete + Confirm funktionieren
   - Newsletter-Tab: Cards sichtbar, Delete funktioniert
   - Selection > 0 auf Memberships: Sticky-Bar unten, Count angezeigt, Spacer hält letzte Card frei vom Bar-Bereich
   - Tab-Switch zu Newsletter mit leerer Newsletter-Selection: Sticky-Bar verschwindet
   - Bulk-Delete aus Sticky-Bar: dasselbe Confirm-Modal, erfolg, Sticky-Bar weg
5. Dev-Server ≥1024px: Tabellen unverändert, Header-Buttons wie vorher
6. Screen-Reader (VoiceOver macOS oder Chrome Lighthouse a11y check): Collapse-Toggle sagt „Details, collapsed" / „Details, expanded". Selection-Count-Change wird polite announced.
7. iPhone SE Staging-Device (echt): Home-Indicator frei, Sticky-Bar ergonomisch erreichbar, Rubber-Band-Overscroll verdeckt keine Cards.
