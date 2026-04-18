# Sprint: Mobile Dashboard Sprint B2a — Signups Cards + Bulk Sticky-Bar + PaidHistory Stack
<!-- Spec: tasks/spec.md (v3) -->
<!-- Started: 2026-04-18 -->
<!-- Status: Draft v3 — Codex R1 + R2 addressed (14 findings total). Ready for generator. -->

## Done-Kriterien
> Alle müssen PASS sein bevor der Sprint als fertig gilt.

- [ ] `pnpm build` passes without TypeScript errors
- [ ] `pnpm test` passes (248 → ≥262 mit neuen Tests)
- [ ] `pnpm audit --prod` 0 HIGH/CRITICAL
- [ ] DevTools iPhone-SE (375px) zeigt Memberships-Tab als Cards (nicht Tabelle) — visually verified
- [ ] DevTools ≥1024px zeigt Memberships-Tab als Tabelle (unverändert) — visually verified
- [ ] Selection > 0 auf `<md` rendert Sticky-Bar mit Count-Region + CSV-Export-Button + „Ausgewählte löschen"-Button — alle Buttons haben `min-w-11 min-h-11`
- [ ] Sticky-Bar hat `pb-[env(safe-area-inset-bottom)]` im DOM (class-match)
- [ ] Sticky-Bar hat `z-30`, Modal hat `z-50` (class-match via existing Modal.tsx)
- [ ] `BulkFlowSpacer` rendert wenn Selection > 0, `md:hidden`, konsumiert shared `BULK_BAR_HEIGHT`-Konstante (beide Elements haben denselben Height-Klassennamen im DOM — Test-assertion)
- [ ] Memberships-Card Collapse: Button hat `aria-expanded`, `aria-controls="member-details-{id}"`, Details-Container hat matching `id`
- [ ] Sticky-Bar Container hat `role="region"` + `aria-label="Auswahl-Aktionen"`
- [ ] Selection-Count rendert in `role="status"` ODER `aria-live="polite"` Element
- [ ] Newsletter-Card rendert alle 6 Felder stacked (kein Collapse)
- [ ] PaidHistoryModal `<li>` hat exakte Class-String `flex flex-col gap-1 min-[400px]:flex-row min-[400px]:items-baseline min-[400px]:gap-3`
- [ ] PaidHistoryModal Email-Span hat `min-[400px]:max-w-[14rem] min-[400px]:truncate` (und KEIN `max-w-[14rem]` ohne min-400-prefix)
- [ ] Sticky-Bar Behavior-Parity: Test klickt Sticky-„Ausgewählte löschen" → öffnet genau 1 `role="dialog"` mit Bulk-Delete-Text (identisch zu Header-Button-Click). Sticky-„CSV" triggert Download mit demselben Dateinamen-Pattern wie Header-CSV. `bulkDeleting=true` disabled-Attribut auf beiden Surfaces identisch.
- [ ] `memberExpanded` Orphan-Cleanup nach Single-Delete UND Bulk-Delete getestet (id verschwindet aus Set nach reload)
- [ ] `memberExpanded` bleibt nach Sort-Change erhalten (id-based, nicht position-based) — Test
- [ ] `memberExpanded` bleibt nach Sub-Tab-Switch erhalten — Test
- [ ] `memberExpanded` bleibt nach Paid-Toggle (optimistic + server-win) erhalten — Test
- [ ] Neuer `dashboardStrings.signups`-Block existiert mit mindestens: `details`, `detailsExpand`, `detailsCollapse`, `address`, `newsletterOptIn`, `consentAt`, `selectedCount(n)`, `exportCsv`, `deleteSelected`, `regionLabel`
- [ ] Bestehende Flows unverändert: Paid-Toggle Confirm-Modal öffnet, History-Modal öffnet, Single-Delete Confirm-Modal öffnet, Bulk-Delete Modal öffnet, CSV-Export triggert
- [ ] Sonnet pre-push Gate: keine `[Critical]` in `tasks/review.md`
- [ ] Codex PR-Review: keine in-scope Findings mit Sprint-Contract-/Security-Bezug
- [ ] Staging-Deploy grün (CI success + `https://staging.alit.hihuydo.com/dashboard/` Health)
- [ ] Production-Deploy nach Merge grün (CI success + `https://alit.hihuydo.com/dashboard/` + Logs clean)

## Tasks

### Phase 1 — Spec-Review
- [x] Spec v1 geschrieben
- [x] `codex-spec-evaluieren` R1 — 10 findings, NEEDS WORK
- [x] Spec v2 — alle 10 R1-findings addressed
- [x] `codex-spec-evaluieren` R2 — 8 R1 resolved + 2 partial + 4 neue v2-cleanup findings
- [x] Spec v3 — 4 R2-findings addressed (behavior-parity-test, shared-height-const, state-matrix-scoped, inline-subcomponents-readability)
- [ ] User-Approval für v3 → Phase 2 darf starten (max 2 Codex-Spec-Runden erreicht, keine R3)

### Phase 2 — Implementation
- [ ] Feature-Branch anlegen: `feature/mobile-dashboard-sprint-b2a`
- [ ] `src/app/dashboard/i18n.tsx`: neuer `dashboardStrings.signups`-Block
- [ ] `SignupsSection.tsx`: Modul-Konstante `BULK_BAR_HEIGHT = "h-20"` am Top der Datei
- [ ] `SignupsSection.tsx`: existing table `hidden md:block` wrappen
- [ ] Neue inline Subcomponents: `MembershipCard`, `NewsletterCard`, `MobileBulkBar` (konsumiert `BULK_BAR_HEIGHT`), `BulkFlowSpacer` (konsumiert `BULK_BAR_HEIGHT`) — alle präsentational, Callbacks vom Parent
- [ ] Mobile Memberships-Section (`md:hidden` root) mit Card-Map
- [ ] `memberExpanded: Set<number>` state + toggle-handler, Orphan-Cleanup in `reload()`
- [ ] Mobile Newsletter-Section (`md:hidden` root) mit Card-Map
- [ ] `MobileBulkBar` + `BulkFlowSpacer` conditional auf `selectedCount > 0`
- [ ] A11y-Props: `aria-expanded` + `aria-controls` + `id` für Collapse, `role="region"` + `aria-label` + `aria-live="polite"` für Sticky-Bar
- [ ] Z-Index setzen: Sticky-Bar `z-30`
- [ ] `PaidHistoryModal.tsx`: `<li>` Class-String + Email-Span Class-String
- [ ] 44×44 Touch-Targets auf allen Card-Actions (Checkbox, Delete, History, Paid-Toggle, Details-Toggle, Sticky-Bar-Buttons)

### Phase 3 — Tests
- [ ] `SignupsSection.test.tsx` create: Dual-DOM-Präsenz, Sticky-Bar-Visibility, Handler-Parität (spy auf `handleBulkDelete`/`exportMembers`), Touch-Target-Classes, `aria-expanded`-Transition, Live-Region-Content, memberExpanded-Preserve bei Sort + Tab-Switch, Orphan-Cleanup nach Delete
- [ ] `PaidHistoryModal.test.tsx` create: Row-Class-String + Email-Span-Class-String

### Phase 4 — Verifikation + Merge
- [ ] `pnpm build` + `pnpm test` + `pnpm audit --prod` lokal grün
- [ ] Dev-Server, alle Flows in DevTools iPhone-SE klicken (Memberships + Newsletter + Bulk + History + Collapse + Selection-Live-Region)
- [ ] Dev-Server ≥1024px: Desktop-Tabelle unverändert
- [ ] VoiceOver-Spot-Check (Collapse-Toggle + Selection-Count-Announcement)
- [ ] Push → Staging-Deploy verifizieren (CI + curl + logs)
- [ ] PR eröffnen, Codex-Review (max 3 Runden)
- [ ] Merge → Production verifizieren

## Notes

- B2b (RichTextEditor + MediaSection + MediaPicker) ist separater Sprint NACH B2a-Merge
- ListRow-Primitive wird in B2a NICHT benutzt (andere Shape als Drag-Rows)
- 4 neue Subcomponents (MembershipCard, NewsletterCard, MobileBulkBar, BulkFlowSpacer) bleiben **inline in SignupsSection.tsx** — nicht in eigene Files extrahieren (aktueller Scope). Follow-up-Extraktion ist Nice-to-Have 5.
- Pattern-Referenzen:
  - `patterns/nextjs.md` — CSS-Dual-DOM (SR-safe nur bei echtem `display:none`)
  - `patterns/tailwind.md` — Safe-area-inset auf Sticky-Bar + Spacer, NICHT auf body
  - `patterns/admin-ui.md` — Orphan-Cleanup für Local State (analog `pendingUntoggle`)
  - `patterns/react.md` — Close-Menu-before-Action gilt analog für Sticky-Bar wenn Menu-Modals folgen
- Lessons aus B1 relevant:
  - Touch-Target-Klassen: `min-w-11 min-h-11` (44px = 2.75rem)
  - Screen-Reader-Safety: echte `hidden` / `md:hidden` Wrapper, keine visually-hidden-Tricks
