# Sprint: Leisten-Labels Editor — Sprint 3
<!-- Spec: tasks/spec.md -->
<!-- Started: 2026-04-27 -->
<!-- Branch: feat/leiste-labels-editor -->

## Done-Kriterien
> Alle müssen PASS sein bevor der Sprint als fertig gilt.

- [ ] DK-1: `pnpm build` grün, `pnpm exec tsc --noEmit` clean.
- [ ] DK-2: `pnpm test` grün, **+19 neue Tests** (3+5+6+5).
- [ ] DK-3: `pnpm audit --prod` 0 HIGH/CRITICAL.
- [ ] DK-4: Dashboard hat neuen Tab „Beschriftung" — sichtbar + clickable + rendert `LeisteLabelsSection`.
- [ ] DK-5: Save-Button im Editor sendet PUT mit allen 12 Feldern, response 200.
- [ ] DK-6: Public-Site (lokaler Dev): Header rendert custom-text wenn DB-row existiert.
- [ ] DK-7: Empty-per-Field → fallback auf `dictionaries.ts` default (= aktuelles Verhalten bleibt für leere Felder).
- [ ] DK-8: **Lokal-Smoke**: Editor → 1 Feld ändern → Save → Hard-Refresh → Header zeigt neuen Text.
- [ ] DK-9: **Lokal-Smoke**: Feld leeren → Save → Hard-Refresh → Header zeigt dict-default zurück.
- [ ] DK-10: **Lokal-Smoke**: Logout → Public-Site rendert weiterhin custom labels (kein auth-leak).
- [ ] DK-11: **Staging-Deploy** Logs clean.
- [ ] DK-12: **Prod-Render-Smoke nach Staging-Deploy**: alle 3 Leisten zeigen erwarteten Text (DevTools).

## Tasks

### Phase 1 — Shared Types + Read Helper
- [ ] `src/lib/leiste-labels-shared.ts` (Create): `LeisteLabels`, `LeisteLabelsI18n`, `LEISTE_LABELS_KEY`, `DEFAULT_LEISTE_LABELS_DE`/`_FR` (mirror dict), `isLeisteLabelsEmpty()`. Edge-safe, no Node imports.
- [ ] `src/lib/leiste-labels-shared.test.ts` (Create): 3 Tests für `isLeisteLabelsEmpty`.
- [ ] `src/lib/queries.ts` extend: `getLeisteLabels(locale)` Funktion ~30 Zeilen analog `getJournalInfo`. Per-field fallback to dict default. Defensive try/catch invalid-JSON.
- [ ] `queries.test.ts` (or new): 5 Tests (DB happy + DB no-row + invalid-JSON + per-field-empty + null-locale).

### Phase 2 — API Route
- [ ] `src/app/api/dashboard/site-settings/leiste-labels/route.ts` (Create): GET + PUT, mirror `journal-info/route.ts` exact pattern. Body validation: 12 strings, length ≤200, trim. UPSERT site_settings. `revalidatePath('/de', 'layout')` + `revalidatePath('/fr', 'layout')`.
- [ ] `route.test.ts` (Create): 6 Tests (GET 200 row, GET 200 fallback, PUT 200 happy, PUT 400 invalid, PUT 401 no-auth, PUT 403 no-csrf).

### Phase 3 — Dashboard Component + Tab Integration
- [ ] `src/app/dashboard/components/LeisteLabelsSection.tsx` (Create) ~180 Zeilen: "use client", 12 controlled inputs DE/FR side-by-side, Save/Reset, dirty-tracking, `useDirty()`-integration, dashboardFetch PUT, single-flight Lock during pending, success-toast.
- [ ] `LeisteLabelsSection.test.tsx` (Create): 5 Tests (renders initial, edit-update-state, dirty-state-enables-save, save-calls-fetch, reset-rollback).
- [ ] `src/app/dashboard/i18n.tsx` extend: `leiste`-Namespace (siehe Spec #9, 11 keys).
- [ ] `src/app/dashboard/(authed)/page.tsx` extend: TABS-Array `+ {key:"leiste", label:"Beschriftung"}`. data-state-shape extend mit `leiste: LeisteLabelsI18n`. Initial-fetch parallel. Render-branch `{active === "leiste" && data && <LeisteLabelsSection initial={data.leiste} />}`.

### Phase 4 — Public Layout Integration + Verify
- [ ] `src/app/[locale]/layout.tsx` extend: `await getLeisteLabels(locale)` (parallel zu dict-build), merge in dict.leiste vor Pass an Wrapper.
- [ ] `pnpm build` + `pnpm test` + `pnpm exec tsc --noEmit` grün.
- [ ] `pnpm audit --prod` 0 HIGH/CRITICAL.

## Phase-Checkpoints
> Nach jeder Phase: build+test+tsc grün, eigener Commit.

## Notes
- **Mirror PR #99 pattern** — JournalInfoEditor war erfolgreich; Sprint 3 ist exact dasselbe Spielfeld minus RTE-Komplexität.
- **Kein DDL** — site_settings ist key/value generic.
- **Per-field-fallback**, nicht per-locale — User editiert nur was er will, Rest fällt auf dict-default zurück.
- **revalidatePath layout-level** — alle Routen unter /[locale] re-render. Editorial-Tool, 1 Sekunde Cache-Drift OK.
