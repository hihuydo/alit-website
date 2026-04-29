# Codex Spec Review — R2 Final — 2026-04-29

## Scope
Spec: `tasks/spec.md`  
Checklist mirror: `tasks/todo.md`  
Codebase cross-check: current S1a helpers in [`src/lib/instagram-post.ts`](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/src/lib/instagram-post.ts:402), [`src/lib/instagram-overrides.ts`](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/src/lib/instagram-overrides.ts:1), [`src/lib/stable-stringify.ts`](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/src/lib/stable-stringify.ts:1), and S2 outline in [`tasks/instagram-layout-overrides-s2-outline.md`](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/tasks/instagram-layout-overrides-s2-outline.md:19)

## Findings

### [Correctness] GET cap fix is still not semantically aligned with the renderer for grid cases
`tasks/spec.md:319-325` says the new `SLIDE_HARD_CAP` trim prevents the editor from showing more groups than export can render. That is only true for text-only items. For image-backed items, the renderer cap is **10 total slides**, and slide 1 is the grid, so the text budget is effectively **9 text slides**, not 10. The current proposal still does `autoGroups.slice(0, SLIDE_HARD_CAP)` and returns text-only slides, so S2 can present 10 editable text groups for a layout that the PNG renderer would truncate to 9 text slides plus the grid (`src/lib/instagram-post.ts:538-568`).

The same section also still relies on `projectAutoBlocksToSlides(...)`, whose `hasGrid` decision is based on raw `item.images.length` (`src/lib/instagram-post.ts:708-717`), while the renderer uses `resolveImages(...)` and only treats the item as grid-backed if the resolved image list is non-empty (`src/lib/instagram-post.ts:415-429`). That means the “intentional divergence” comment now covers block-fragment behavior, but not this separate `hasGrid` mismatch.

Why it matters: the R1 fix does not fully close Correctness #1. In the real UI mental model, “what the editor shows” can still exceed or disagree with “what export renders” for image-backed entries.

Suggested fix:
- Define the GET auto/stale text-slide cap as `hasGrid ? SLIDE_HARD_CAP - 1 : SLIDE_HARD_CAP`.
- Derive `hasGrid` from the same resolved-image logic as the renderer, not from raw `item.images.length`.
- Update the response-contract prose so it explicitly says whether `slides.length` is capped against total-render slides or text-only slides.

### [Architecture] The R1 server-only fix is contradicted later by the CAS documentation
The main spec now correctly marks `computeLayoutVersion` as server-only and moves S2 dirty-detect to browser-safe `stableStringify` snapshot diff (`tasks/spec.md:20`, `tasks/spec.md:30`, `tasks/instagram-layout-overrides-s2-outline.md:23`). That part is good.

But the new CAS-doc section reintroduces the old claim indirectly: `tasks/spec.md:1011-1015` says the Node-only helper is exposed so client code can use the same algorithm “via dynamic-import or parallel-implementation.” That undermines the architecture fix rather than reinforcing it. `stableStringify` already exists as the browser-safe primitive for S2 (`src/lib/stable-stringify.ts:1-20`), so the spec should not leave any ambiguity that S2 might import or mirror `computeLayoutVersion`.

Why it matters: this is exactly the sort of wording drift that causes the next sprint to cargo-cult the wrong dependency boundary.

Suggested fix:
- Delete the client-reuse sentence from the CAS-doc section.
- Replace it with a direct statement: `computeLayoutVersion` is PUT/CAS-only and server-only; S2 dirty-detect uses `stableStringify` snapshot diff.

## Verification Notes

### R1 [Contract] fix verification
This is mostly fixed. `tasks/spec.md:20` now honestly says S1b freezes the S2-facing GET payload instead of pretending this is “just persistence.” The S1c additive follow-up escape hatch is sensible. I would keep it.

### R1 [Correctness #1] fix verification
Partially fixed, not fully fixed. The added cap + warning is directionally right, but the current text overclaims what it solves. The grid-path total-slide cap and `hasGrid` derivation mismatch still leave editor/render drift.

### R1 [Correctness #2] fix verification
Fixed well enough. The new canonical-JSONB invariant in `tasks/spec.md:1022-1028` is clear, concrete, and explicit about what manual smoke must not write. A developer following that section should not accidentally create dangling state.

### R1 [Architecture] fix verification
Partially fixed. The top-level and helper sections were corrected, but the CAS-doc section still leaks the old “shared algo with client” idea back into the spec.

### New issues introduced by R1 fixes
Yes:
- The new GET cap language introduces a fresh contract problem for image-backed entries by capping text groups at 10 instead of total render slides at 10.
- The CAS-doc wording reintroduces the client-reuse implication that R1 was supposed to remove.

## Verdict
NEEDS WORK

## Final Blocker Check
If this shipped as-is, the realistic worst-case production failure mode is not data corruption; it is **saved layouts that the editor presents as valid but the export renderer cannot faithfully realize**. Concretely: an admin on an image-backed item can see or save 10 text groups in the modal, but the PNG path only has room for 9 text slides plus the grid, so the tail of the layout gets silently dropped or regrouped at render time. That is a user-facing contract break between S1b and S2, and it is exactly the interface this sprint is supposed to freeze.
