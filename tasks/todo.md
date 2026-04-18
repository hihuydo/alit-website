# Sprint: JWT_SECRET Fail-Mode-Normalisierung
<!-- Spec: tasks/spec.md -->
<!-- Started: 2026-04-18 -->
<!-- Status: impl-complete — All automated Done-Kriterien PASS. Manual Deploy-Verifikation pending. -->

## Done-Kriterien
> Alle müssen PASS sein bevor der Sprint als fertig gilt.

- [x] `pnpm build` passes without TypeScript errors
- [x] `pnpm test` 310 passing (304 baseline + 6 neue)
- [x] `pnpm audit --prod` 0 HIGH/CRITICAL

### Code

- [x] `src/lib/env-guards.ts` existiert mit exported `assertMinLengthEnv(name, value, minLength, purpose)` (assertion-return-type `asserts value is string`)
- [x] Helper wirft Error mit `name` + `minLength` + `purpose` in der Message
- [x] Helper `.trim()`t den Input vor length-check (T3 verifiziert mit whitespace-only + `\n\t` chars)
- [x] `src/instrumentation.ts` ruft `assertMinLengthEnv("JWT_SECRET", process.env.JWT_SECRET, 32, "JWT sign/verify")` auf — VOR dem IP_HASH_SALT-Check platziert
- [x] Alter `console.warn`-Block (Zeile 29-31) komplett entfernt
- [x] IP_HASH_SALT-Check unverändert (out-of-scope)
- [x] `src/lib/env-guards.test.ts` existiert mit 6 Tests (T1-T6)
- [x] Static-import statt dynamic (dynamic `await import()` bricht TS für `asserts` return-types)

### Pre-Deploy-Audit (Phase 0)

- [x] SSH-Check prod: `docker exec alit-web printenv JWT_SECRET | wc -c` → 65 (64 chars + newline) ✅
- [x] SSH-Check staging: `docker exec alit-staging printenv JWT_SECRET | wc -c` → 65 ✅
- [x] vitest.config.ts: JWT_SECRET nicht in env-block, aber instrumentation.ts wird von keinem Test importiert (via grep verifiziert) → safe

### Deploy-Verifikation

- [ ] Staging-Push nach Code-Commit → CI grün
- [ ] `curl -sI https://staging.alit.hihuydo.com/api/health/` → 200
- [ ] `ssh hd-server 'docker compose logs --tail=30 alit-staging'` → "Bootstrap complete", keine neuen Errors
- [ ] Post-Merge: `curl -sI https://alit.hihuydo.com/api/health/` → 200, Prod-Container-Logs clean

## Tasks

### Phase 0 — Pre-Deploy-Audit
- [ ] SSH prod + staging → JWT_SECRET char-count ≥ 32 in beiden Containern
- [ ] Lokal vitest.config.ts check
- [ ] Falls eines <32: Secret rotieren (openssl rand -base64 48) + .env update + `docker compose up -d` + sanity-check — dann erst Phase 1

### Phase 1 — Helper
- [ ] `src/lib/env-guards.ts` anlegen mit `assertMinLengthEnv`
- [ ] JSDoc + TypeScript assertion-return-type
- [ ] Build grün

### Phase 2 — Tests
- [ ] `src/lib/env-guards.test.ts` anlegen mit T1-T6
- [ ] Lokal `pnpm test -- --run src/lib/env-guards.test.ts` → 6/6 grün

### Phase 3 — Integration
- [ ] `src/instrumentation.ts`: warn-only-Block raus, Helper-Call rein (vor IP_HASH_SALT-Check)
- [ ] Full-test-suite `pnpm test` → ≥310 grün
- [ ] `pnpm build` grün

### Phase 4 — Deploy + Verify
- [ ] Git-Commit + Push → pre-push Sonnet-Gate abwarten
- [ ] Staging-Deploy → CI grün + Container-Logs clean
- [ ] PR erstellen → Codex-Review autonom
- [ ] Merge → Prod-Deploy-Verifikation (Health 200, Logs clean)

## Notes

- Kein Codex-Spec-Review (Small Scope, klares Pattern, keine Architektur-Entscheidungen).
- Pre-Deploy-Audit ist kritisch: wenn JWT_SECRET auf prod <32 ist (möglich wenn Secret vor einiger Zeit mit openssl rand -hex 16 statt -hex 32 generiert wurde), würde der Fix den Container unbootable machen. Deshalb Phase 0.
- vitest.config.ts sollte bereits JWT_SECRET haben — prüfen.
- Pattern für Fail-Fast-Env-Guards lebt in `patterns/nextjs.md` (eager env-validation).
- Wrap-up: falls `assertMinLengthEnv` ein wiederverwendbares Pattern wird, nach cross-project-Projekten umziehen (0 VC patterns/auth-hardening.md oder patterns/nextjs.md).
