# Codex Spec Review — 2026-04-17

## Scope
Spec: `tasks/spec.md` v1 (Cleanup-Sprint)
Sprint Contract: 16 DB columns drop + 8 route cleanups + seed + types
Basis: Sonnet `qa-report.md` = NEEDS WORK (expected pre-impl, ignore)

## Findings

### [Contract]
- The spec under-scopes immediate post-drop breakage. It only tracks 8 POST/PUT routes plus seed/types, but current code still reads legacy columns in non-writer paths: hashtag validation (`src/lib/agenda-hashtags.ts:36-39`, `:76-80`), media usage scan (`src/lib/media-usage.ts:56-61`, `:75-80`, `:97-102`), and the legacy journal migrate route (`src/app/api/dashboard/journal/migrate/route.ts:11-42`). After P4 those paths 500 unless included in scope.
- The spec’s “reader already i18n-only” claim is false for `projekte`. `tasks/spec.md:24-29` says `getProjekte()` no longer touches `paragraphs`, but current reader still selects it (`src/lib/queries.ts:185-216`) and the public renderer still falls back to `p.paragraphs` when `content_i18n` is empty (`src/components/ProjekteList.tsx:99-107`). That makes P4 unsafe unless this path is fixed first.
- Phase 5 is also under-scoped for dashboard/editor fallbacks. The shared journal dashboard type still carries `title`, `lines`, `content`, `footer` (`src/lib/journal-types.ts:25-40`), and the editor still explicitly falls back to them (`src/app/dashboard/components/JournalEditor.tsx:73-84`). The contract treats this as “type cleanup”, but there is still behavior coupled to legacy fields.

### [Correctness]
- The rollback section is not operationally real for the documented Docker setup. Backup uses `docker exec` (`tasks/spec.md:210-214`), but rollback restore switches to bare `pg_restore -d alit ...` on the host (`tasks/spec.md:233-238`). That assumes host-level DB access/tools and omits app stop order, `--clean`, and restore verification. For an irreversible migration, this is not good enough.
- The pre-deploy backfill check is too weak. The spec/todo only gates on empty `title_i18n` (`tasks/spec.md:181-184`, `:225-227`; `tasks/todo.md:63-65`). That misses the fields that actually matter for rendering after drop: `content_i18n` for journal/alit/projekte, `ort_i18n` for agenda, and the `paragraphs` fallback still live in projects. A row can pass the proposed check and still render blank or break behavior after P4.
- The concurrent-boot edge-case analysis is incomplete. `tasks/spec.md:166-177` treats `DROP COLUMN IF EXISTS` as effectively harmless under parallel boots, but the migration is executed from `instrumentation.ts` on every app boot (`src/instrumentation.ts:47-55`). In a rolling deploy / mixed-version window, a new version can drop columns while an old version is still serving and still writing legacy fields. That is the real race, not “second DROP sees no-op”.

### [Security]
- No direct app-security blocker stood out in the spec itself, but the migration has no audit trail. `ensureSchema()` currently performs schema mutation silently at boot (`src/instrumentation.ts:47-57`, `src/lib/schema.ts:37-503`), and the spec does not require a migration log entry in stdout, `audit_events`, or a dedicated schema journal. For an irreversible prod drop, that operational blind spot is unnecessary.

### [Architecture]
- `DROP COLUMN` inside `ensureSchema()` is the wrong scaling pattern here. This app runs schema bootstrap on every boot (`src/instrumentation.ts:47-55`), and the spec explicitly keeps the drop there (`tasks/spec.md:56-95`, `:148-154`). That means repeated DDL on startup, mixed-version exposure during deploys, and lock-taking in the request-serving app process. For a destructive migration, use a one-time migration step/script, not “ensureSchema keeps trying forever”.
- The spec is internally inconsistent on transactionality. Requirement 4 says “in einer Transaction committen” (`tasks/spec.md:94`), but the Architecture section says “keine Transaction wegen DDL-Komplexität” (`tasks/spec.md:150`). Current `ensureSchema()` is many independent `pool.query()` calls (`src/lib/schema.ts:37-503`), so partial application is absolutely possible. For this change that is not an acceptable ambiguity.
- P4 should not ship in the same PR/deploy step as P1-P3. The safe order is: first remove all app/runtime dependencies on legacy columns, deploy and soak that version, then run the destructive schema drop separately. Keeping “prep” and “drop” in one PR defeats the point of proving the app no longer depends on the old columns.

### [Nice-to-have]
- The schema-idempotency test should use a real PostgreSQL instance, not a mock. The spec allows “pg-mock oder realer Test-DB” (`tasks/spec.md:106`), but the behaviors being trusted here are real DDL semantics: `ALTER TABLE`, `DROP COLUMN IF EXISTS`, unique indexes, and repeated bootstrap. A mock will not prove the migration. There are currently no schema/bootstrap tests at all in the repo.
- Staging smoke scope is too narrow. It covers the 4 core entities, but not the Media tab or hashtag-backed agenda/journal saves (`tasks/spec.md:191-199`). Given the current hidden dependencies in `media-usage.ts` and `agenda-hashtags.ts`, those need to be in the ship checklist before any drop.

## Verdict
SPLIT RECOMMENDED

## Summary
The migration goal is valid, but the current spec assumes the cleanup surface is limited to 8 write routes plus seed/types. The live codebase contradicts that: legacy columns are still used in project rendering, hashtag validation, media usage scans, and the journal migration endpoint. The rollback plan is also not production-realistic enough for Docker, and the boot-time `ensureSchema()` drop pattern is the wrong place for an irreversible DDL change.

Concrete split:
- PR 1 “prep/soak”: P1-P3, plus all hidden legacy consumers (`agenda-hashtags.ts`, `media-usage.ts`, `journal/migrate/route.ts`, `getProjekte()`/`ProjekteList`, remaining dashboard/editor fallbacks), plus a real-Postgres migration/idempotency test.
- PR 2 “drop”: explicit one-time migration step for the 16 column drops, revised rollback runbook, stronger preflight queries for all required `*_i18n` fields, and dedicated staging/prod verification after PR 1 has soaked without legacy access.
