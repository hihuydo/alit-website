# Codex Spec Review — Sprint M4a — 2026-05-03 (gpt-5.5)

## Scope
Spec: tasks/spec.md (M4a — Instagram Slide-1 Cover-Centering + Image-Grid-Cap)
Sprint Contract: ~25 Done-Kriterien
Basis: 3 Sonnet rounds (R1-R3) all addressed; pre-existing M4 had separate Codex SPLIT-recommendation that produced this M4a (Cover-Layout only) split

## Findings
### [Correctness]
[high] — The cap is specified for `instagram-layout/route.ts` and `instagram/route.ts`, but not for the actual PNG render route `instagram-slide/[slideIdx]/route.tsx`, which still does `Math.min(requestedImages, countAvailableImages(item))` and reads `instagram_layout_i18n[locale][String(imageCount)]` directly. That means preview/download can still render `>4` images and can still resolve legacy `"5"`/`"10"` override keys, while metadata/layout endpoints report the new capped world. This breaks route-to-route consistency and makes the new cap only partially real. Suggested fix: add `instagram-slide/[slideIdx]/route.tsx` to the spec/files-to-change/tests, or better, centralize the clamp in a shared helper used by all three routes. References: [tasks/spec.md](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/tasks/spec.md:514), [tasks/spec.md](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/tasks/spec.md:587), [tasks/spec.md](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/tasks/spec.md:753), [route.tsx](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/src/app/api/dashboard/agenda/[id]/instagram-slide/[slideIdx]/route.tsx:110)

### [Architecture]
[medium] — The spec re-expands scope into `LayoutEditor` with a new empty-state/early-return branch, but the current component does not actually access `textSlides[0]` or otherwise require non-empty slides. Adding an early return here is speculative and risks suppressing existing stale/orphan/reset/save UI paths instead of fixing a real bug. This cuts against the stated M4a split goal of keeping the sprint local and low-risk. Suggested fix: remove the `LayoutEditor` empty-slide requirement from M4a unless a concrete failing access site is identified first; if there is a real crash, name the exact access and patch only that. References: [tasks/spec.md](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/tasks/spec.md:12), [tasks/spec.md](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/tasks/spec.md:756), [LayoutEditor.tsx](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/src/app/dashboard/components/LayoutEditor.tsx:396)

### [Contract]
[medium] — The cap-error contract is internally inconsistent. The sprint contract says `PUT imageCount > MAX_GRID_IMAGES -> 422 image_count_exceeds_grid_cap`, but the spec later says the real tested path is `400` from Zod and that the `422` branch is effectively unreachable and will not be tested. That makes DK-A7 non-mechanical and creates room for PR churn over which status code is “correct.” Suggested fix: pick one contract. Pragmatically, either keep only the Zod `400` path and delete the dead post-Zod `422`, or widen the schema so the explicit `422` path is reachable and test it. References: [tasks/todo.md](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/tasks/todo.md:40), [tasks/spec.md](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/tasks/spec.md:608), [tasks/spec.md](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/tasks/spec.md:635)

### [Architecture]
[medium] — The spec treats legacy `instagram_layout_i18n[locale][imageCount>4]` rows as “harmlose JSONB-Orphans,” but that is an admin-data compatibility break, not just dead bytes. Those rows represent persisted manual layout work in the old namespace; after the cap they become unreachable from normal UI flows, and the spec provides neither migration nor operator-visible cleanup/reporting path. Given this repo’s shared-DB/staging reality, that deserves an explicit compatibility decision, not a quiet shrug. Suggested fix: add one of: a one-time migration/report for `>4` keys, a read-only warning surfaced in the layout GET response when legacy keys exist, or an explicit operator cleanup step in the sprint contract. References: [tasks/spec.md](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/tasks/spec.md:21), [tasks/spec.md](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/tasks/spec.md:601), [tasks/spec.md](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/tasks/spec.md:762), [tasks/spec.md](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/tasks/spec.md:794)

## Verdict
NEEDS WORK

## Summary
4 findings — 1 High / 3 Medium
