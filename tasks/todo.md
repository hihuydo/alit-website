# Sprint: S1b — Layout-Overrides Persistence API
<!-- Spec: tasks/spec.md (canonical archive: tasks/instagram-layout-overrides-s1b-spec.md) -->
<!-- Started: 2026-04-29 -->
<!-- Branch: feat/instagram-layout-overrides-s1b-persistence -->
<!-- Depends on: PR #131 (S1a Foundation) merged ✓ -->

## Done-Kriterien
> Source-of-Truth: `tasks/spec.md` §Sprint Contract. Diese todo-Datei spiegelt nur die Checklist — keine parallelen DK-Definitionen.

- [ ] DK-1: 3 Routes (GET/PUT/DELETE) in `route.ts` mit allen documented status-codes
- [ ] DK-2: `pnpm exec tsc --noEmit` + `pnpm build` clean
- [ ] DK-3: `pnpm test` grün — neue tests added (~40 cases)
- [ ] DK-4: `pnpm audit --prod` 0 HIGH/CRITICAL
- [ ] DK-5: `computeLayoutVersion(override)` exposed in `instagram-overrides.ts`
- [ ] DK-6: `MAX_BODY_IMAGE_COUNT = 20` exported in `instagram-post.ts`
- [ ] DK-7: Audit-log entries für PUT (`agenda_layout_update`) + DELETE (`agenda_layout_reset`)
- [ ] DK-8: App-side SELECT FOR UPDATE CAS pattern dokumentiert in `patterns/database-concurrency.md`
- [ ] DK-9: Backward-compat — bestehende S1a-routes unverändert
- [ ] DK-10: `scripts/compute-override-hashes.ts` helper für staging-smoke
- [ ] DK-11: Codex PR-Review — in-scope Findings gefixt
- [ ] DK-12: Prod-Merge + post-merge Verifikation

---

## Implementation Order
> Aus tasks/spec.md §Implementation Order

1. `computeLayoutVersion` + Tests (~3) in `instagram-overrides.{ts,test.ts}`
2. `MAX_BODY_IMAGE_COUNT = 20` export in `instagram-post.ts`
3. Routes-File `/api/dashboard/agenda/[id]/instagram-layout/route.ts` — GET + PUT + DELETE
4. Tests für route-file — GET (~11) + PUT (~14) + DELETE (~9) + Integration (~2)
5. `scripts/compute-override-hashes.ts` helper
6. Pattern-doc Update — `patterns/database-concurrency.md`
7. `pnpm tsc --noEmit` + `pnpm build` + `pnpm test` + `pnpm audit --prod` + commit
8. Push → Staging-Deploy + GET smoke
9. Manueller Staging-Smoke (DK-S1Ba..d) gegen disposable test-row, post-cleanup
10. Codex PR-Review
11. Merge + post-merge Verifikation
