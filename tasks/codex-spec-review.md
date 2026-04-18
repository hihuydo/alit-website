# Codex Spec Review — Mobile Dashboard Sprint A
Date: 2026-04-18
Model: gpt-5.4 (OpenAI Codex CLI)

## Scope
Spec: tasks/spec.md (Mobile Dashboard Sprint A — Foundations)
Focus: UI/responsive correctness, not security/architecture.

## Findings

### [Contract] — Sprint-Contract-Verletzung oder fehlendes Must-Have
- [Contract] `tasks/todo.md:39-47` is internally inconsistent about who owns the dirty-guard. The task says `MobileTabMenu` should take `onSwitch(tab)`, then says the menu should call `confirmDiscard(() => { setActive(tab); setOpen(false); })`, and then says integration should pass `onSwitch={goToTab}` even though `goToTab` already does `confirmDiscard(() => setActive(key))` in [src/app/dashboard/page.tsx](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/src/app/dashboard/page.tsx:86). That leaves two bad implementation paths: double-confirm or bypass-by-restructure. Suggested fix: pick one owner for the discard gate now. Either parent owns the full tab-switch flow and the menu is dumb, or the menu owns it and `goToTab` stops wrapping `confirmDiscard`.
- [Contract] The must-have A11y requirement says the burger panel needs a focus trap (`tasks/spec.md:48`), but the implementation tasks in `tasks/todo.md:39-46` only mention ESC and backdrop close. There is no task for initial focus, Tab-loop, or focus return, even though the existing modal primitive already does all three in [Modal.tsx](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/src/app/dashboard/components/Modal.tsx:40). Suggested fix: either explicitly build the burger sheet on top of `Modal`/the same trap pattern, or add concrete task items for initial focus, Tab wrapping, and focus return.
- [Contract] The DragHandle contract says the 44px mobile target must not break current row layouts (`tasks/spec.md:57-60`), but the spec/todo do not add any compensating row behavior for the affected lists. In the current rows, only the text column is shrinkable while badges and action buttons stay `shrink-0`; see [AgendaSection](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/src/app/dashboard/components/AgendaSection.tsx:603), with the same pattern in Journal/Projekte/Alit. Suggested fix: define the mobile fallback now for these rows when the handle expands, for example action-group wrap/stack on `<md`, or a row layout that keeps the content readable at 375px.
- [Contract] The riskiest new interaction, “burger tab switch still respects dirty editor,” is only assigned to visual smoke (`tasks/spec.md:91`, `tasks/todo.md:53-61`) even though this project already documents effect-lagged dirty races as a real regression class. Suggested fix: add at least one isolated unit test around the burger menu + mocked `useDirty()`/`DirtyProvider` path so the sprint contract is mechanically verifiable before Playwright exists.

### [Correctness] — Technical correctness, edge cases, state-races
- [Correctness] The resize strategy in `tasks/spec.md:158` is not sufficient. `md:hidden` only hides mounted UI; it does not reset `isOpen`. If the panel stays mounted with `isOpen=true`, any burger-specific key handlers/focus logic remain live while hidden, and resizing back below 768 can resurrect the open panel unexpectedly. Suggested fix: add a breakpoint transition effect (`matchMedia`/resize) that calls `setOpen(false)` when crossing to `>=768`, instead of relying on CSS visibility alone.
- [Correctness] The edge-case decision to keep the burger panel open while the dirty-confirm modal is shown (`tasks/spec.md:157`) conflicts with the same spec’s requirement that the burger panel itself should behave like a trapped, modal-like surface (`tasks/spec.md:48`). The existing dirty confirm is a real `aria-modal` dialog in [DirtyContext](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/src/app/dashboard/DirtyContext.tsx:155). Two simultaneously active trapped layers is not a stable focus model. Suggested fix: do not keep the burger sheet active under the dirty modal; close or suspend it before opening the confirm, and if needed reopen it explicitly after “Zurück”.

### [UX] — User-visible correctness issues (not style)
- [UX] The tablet decision for 768–1023 is still under-specified. The spec acknowledges the line is “gerade so” wide and suggests iterative tuning later (`tasks/spec.md:129-131`), but the current tab row already uses fixed horizontal padding and no truncation/wrapping in [page.tsx](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/src/app/dashboard/page.tsx:135). With `Mitgliedschaft & Newsletter` in the set, 768px portrait is exactly where awkward wrapping/overflow is likely. Suggested fix: define the tablet response now, e.g. `text-xs md:text-sm`, `min-w-0`, `truncate`, and `title`/tooltip on long labels, instead of leaving it to post-implementation tweaking.

### [Architecture] — smells with concrete risk (not style preferences)
- [Architecture] The “inline sub-component ≤80 LOC” decision for `MobileTabMenu` is optimistic once the real behavior is included: breakpoint-close logic, initial focus, focus trap, focus return, ESC handling, and dirty-confirm coordination. That combination is closer to a primitive than a tiny render helper, and keeping it inline in `page.tsx` will make the required unit tests harder to write. Suggested fix: allow a dedicated `MobileTabMenu.tsx` now if the menu ends up owning dialog-like behavior.

### [Nice-to-have] — Out-of-Scope, belongs in memory/todo.md
- [Nice-to-have] The login-input auto-zoom rationale should note that the project already enforces `font-size: max(16px, 1rem)` for `input/select/textarea` on mobile in [globals.css](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/src/app/globals.css:692). Explicit `text-base` in the dashboard login can still be kept for local clarity, but the current spec overstates the risk that a smaller root font alone would drop these inputs below 16px.

## Verdict
NEEDS WORK

## Summary
9 findings — 4 Contract, 2 Correctness, 1 UX, 1 Architecture, 1 Nice-to-have.
