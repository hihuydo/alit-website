# DB Review — feat/sprint-m3-supporter-logos
Reviewed: 2026-05-02

## Scope of DB changes

| File | Change |
|---|---|
| `src/lib/schema.ts` | `ALTER TABLE agenda_items ADD COLUMN IF NOT EXISTS supporter_logos JSONB NOT NULL DEFAULT '[]'::jsonb` |
| `src/lib/queries.ts` | SELECT adds `COALESCE(supporter_logos, '[]'::jsonb)` + safe mapping |
| `src/lib/supporter-logos.ts` | New: `validateSupporterLogos()` (with media existence check) + `loadSupporterSlideLogos()` |
| `src/lib/media-usage.ts` | SELECT adds `COALESCE(supporter_logos, '[]'::jsonb)::text` for ref-scan |
| `src/app/api/dashboard/agenda/route.ts` | POST includes `supporter_logos` in explicit column list |
| `src/app/api/dashboard/agenda/[id]/route.ts` | PUT uses `"supporter_logos" in body` partial-PUT guard |
| Instagram routes | SELECT adds `COALESCE(supporter_logos, '[]'::jsonb)` |

---

## Migration safety

**`ALTER TABLE agenda_items ADD COLUMN IF NOT EXISTS supporter_logos JSONB NOT NULL DEFAULT '[]'::jsonb`**

- `IF NOT EXISTS` guard → idempotent across re-runs. ✓
- `NOT NULL DEFAULT '[]'::jsonb` → PostgreSQL 11+ writes the default into the
  catalog; no table-rewrite, no insert failures on existing rows. ✓
- Column is additive on a content table (`agenda_items`), not a user/session/auth
  table → no env-scoped-DDL concern. ✓
- Shared staging+prod DB impact: when staging deploys first, old prod code's
  `INSERT INTO agenda_items (...) VALUES (...) RETURNING *` won't list
  `supporter_logos` in the column list → column gets DEFAULT `'[]'` automatically;
  no insert failure. `RETURNING *` gains an extra field that old prod code ignores. ✓

## SQL correctness

**Partial-PUT (PUT route)**
`"supporter_logos" in body` guard correctly distinguishes "key absent → skip SET-clause"
from "key present with `[]` → clear array". Consistent with the existing `images`
pattern. ✓

**ON CONFLICT / NULL-clobber**
No `ON CONFLICT DO UPDATE` involving `supporter_logos`. ✓

**Parameterised queries**
All queries use `$N` placeholders. No raw string interpolation. ✓

**COALESCE ordering**
`COALESCE(supporter_logos, '[]'::jsonb)` — column first, fallback second.
Correct: returns existing value when non-NULL, fallback only when NULL. ✓
(Column is also NOT NULL DEFAULT '[]' so COALESCE is belt-and-suspenders, not
load-bearing, but not harmful.)

**`ANY($1)` with dynamically-built array in `validateSupporterLogos`**
The `raw.length === 0` early-return fires before the query, so `publicIds` is
always non-empty when `pool.query(…, [publicIds])` is called. No empty-array
edge case. ✓

**SELECT DISTINCT / unnest**
No `SELECT DISTINCT` on unnest in the changed code. ✓

**Sort tiebreakers**
No new ORDER BY clauses introduced. Existing ORDER BY in `getAgendaItems` is
unchanged and already has the `id DESC` tiebreaker. ✓

## Schema hygiene

- No new tables → no missing `created_at`/`updated_at` concern.
- No new index needed: `supporter_logos` is accessed exclusively via
  `WHERE id = $1` (primary key lookup) or full-table scan for ref-scan. ✓
- No `listen_addresses` changes. ✓

## One-time data migrations

None. The migration is pure DDL (`ALTER TABLE ADD COLUMN`) with a
`DEFAULT '[]'` that back-fills existing rows declaratively.
Per `patterns/database.md` §One-time Data-Migrations: DDL is
sprachlich-idempotent — no `schema_migrations` marker needed. ✓

---

No database issues found.

---

**CLEAN**
