# Sprint: S1a — Layout-Overrides Foundation
<!-- Spec: tasks/spec.md (canonical archive: tasks/instagram-layout-overrides-s1a-spec.md) -->
<!-- Started: 2026-04-29 -->
<!-- Branch: feat/instagram-layout-overrides-s1a-foundation -->
<!-- Depends on: PR #130 (S0 Block-ID Stabilität) merged ✓ -->

## Done-Kriterien
> Source-of-Truth: `tasks/spec.md` §Sprint Contract. Diese todo-Datei spiegelt nur die Checklist — keine parallelen DK-Definitionen.

- [ ] DK-1: DB-Migration `instagram_layout_i18n JSONB NULL` via `ensureSchema()` `ADD COLUMN IF NOT EXISTS`
- [ ] DK-2: `pnpm build` + `pnpm exec tsc --noEmit` clean
- [ ] DK-3: `pnpm test` grün (CI-output erfasst Zahlen, kein hardcoded baseline)
- [ ] DK-4: `pnpm audit --prod` 0 HIGH/CRITICAL
- [ ] DK-5: 6 Public Helpers exposed in `instagram-post.ts` + `stable-stringify.ts` (siehe spec.md)
- [ ] DK-6: 4 Override-types `export`-ed (S1b kann sie importieren)
- [ ] DK-7: Bestehende Routen (instagram metadata + instagram-slide PNG) auf Resolver umgestellt
- [ ] DK-8: Backward-compat — `splitAgendaIntoSlides` Pure-Output bit-identisch für no-override (alle bestehenden Tests grün)
- [ ] DK-9: `image_partial` Regression-Guard — PR #129's 2 Tests bleiben grün, post-resolver DB-check verbatim erhalten
- [ ] DK-10: Stale-Code-Grep `splitAgendaIntoSlides\(` direkter Aufruf → 0 hits in `src/app/api/dashboard/agenda` (excluding tests/comments)
- [ ] DK-11: Block-ID centralization via `flattenContentWithIds` + `isExportBlockId` (single source-of-truth, kein zweites regex)
- [ ] DK-12: Codex PR-Review — in-scope Findings gefixt
- [ ] DK-13: Prod-Merge + post-merge Verifikation (CI grün + `/api/health/` 200 + Container healthy + Logs clean)

---

## Implementation Order
> Aus tasks/spec.md §Implementation Order

1. Schema-Migration (`ensureSchema()` ADD COLUMN)
2. `stable-stringify.ts` neue Datei + Tests
3. `flattenContentWithIds` + `isExportBlockId` + Tests
4. `computeLayoutHash` + DE-fallback helpers + Tests
5. `buildSlideMeta` Extraktion + verify backward-compat
6. `projectAutoBlocksToSlides` + Tests
7. `buildManualSlides` (file-private) — getestet via resolver
8. `resolveInstagramSlides` + Tests
9. Bestehende Routen auf Resolver umstellen — Snapshot-Tests anpassen für `layoutMode`
10. DK-10 Stale-Code-Grep verify
11. `pnpm tsc --noEmit` + `pnpm test` + commit
12. Push → Staging-Deploy
13. Codex PR-Review
14. Merge + post-merge Verifikation
