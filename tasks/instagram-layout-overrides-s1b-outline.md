# Outline: S1b — Layout-Overrides Persistence API (3 Routes + CAS + Audit)
<!-- Created: 2026-04-29 -->
<!-- Status: Outline (volle Spec wird geschrieben wenn S1a merged) -->
<!-- Branch: feat/instagram-layout-overrides-s1b-persistence -->
<!-- Depends on: S1a merged (Schema-Spalte + Resolver + Helpers + Override-Types live) -->
<!-- Source: tasks/instagram-layout-overrides-spec-v3-reference.md + Codex spec-eval findings -->

## Summary

Adds the persistence API layer on top of S1a's foundation:
- 3 REST endpoints under `/api/dashboard/agenda/[id]/instagram-layout` (GET/PUT/DELETE)
- App-side SELECT FOR UPDATE CAS (NICHT md5-in-WHERE — vermeidet Postgres-internal-key-order Drift)
- Audit-Log integration via S0-extended events (`agenda_layout_update`, `agenda_layout_reset`)
- Orphan-key Policy (resolved per Codex finding — siehe Decisions unten)
- Pattern-doc note in `patterns/database-concurrency.md`

## Scope (vorläufig)

- **Routes** unter `/api/dashboard/agenda/[id]/instagram-layout/route.ts`:
  - `GET ?locale=de&images=N` → `{success, mode, contentHash, layoutVersion, imageCount, slides[]}`. Server berechnet `layoutVersion` on-the-fly aus stored `{contentHash, slides}` — **NICHT** als persisted field. Eliminates data-integrity trap (Codex finding).
  - `PUT` body `{locale, imageCount, contentHash, layoutVersion, slides:[{blocks: string[]}]}` → 200/400/404/409/412/422 mit App-side SELECT FOR UPDATE CAS.
  - `DELETE ?locale=de&images=N` → 204 (idempotent für key) ODER 404 (nicht-existente agenda_id, prevents Phantom-Audit).
  - Alle 3: `requireAuth(req)` + check `auth instanceof NextResponse` (CSRF auto via STATE_CHANGING_METHODS).
- **CAS Strategy** (App-side):
  - PUT öffnet Transaction, `SELECT instagram_layout_i18n FROM agenda_items WHERE id = $1 FOR UPDATE`
  - In-app: `currentVersion = currentForKey ? computeLayoutVersion({contentHash, slides}) : null`
  - Compare `currentVersion === body.layoutVersion`; mismatch → ROLLBACK + 412
  - Pattern: `patterns/database-concurrency.md` "Deterministic Lock-Order FOR UPDATE"
  - **`computeLayoutVersion`** lebt in `instagram-post.ts` (S1b adds it; payload-cut `{contentHash, slides}` vermeidet chicken-and-egg)
- **Orphan-Override Policy** (Codex finding addressed):
  - GET mit `imageCount > countAvailableImages(item)` → returns `mode: "stale"` mit empty slides + `warning: "orphan_image_count"` (statt 400 hard-fail). Damit kann S2 UI den Reset-Button anzeigen für Orphans (z.B. nach image-deletion).
  - DELETE bleibt cap-frei (intentional asymmetry, dokumentiert).
  - Alternative: GET 400 + S2 nutzt direct DELETE — wird in voller Spec entschieden.
- **Audit-Log** via S0-extended events: PUT → `auditLog("agenda_layout_update", {agenda_id, locale, image_count, slide_count, actor_email, ip})`. DELETE → `auditLog("agenda_layout_reset", {agenda_id, locale, image_count, actor_email, ip})`.
- **Validation Order** (PUT):
  1. requireAuth + instanceof NextResponse check
  2. `validateId(params.id)` → 400 invalid_id
  3. parseBody + Zod schema (`PutBodySchema` → siehe spec)
  4. `body.slides.length === 0` → 400 empty_layout
  5. `body.slides.length > SLIDE_HARD_CAP` → 400 too_many_slides
  6. `slides.some(s => s.blocks.length === 0)` → 400 empty_slide
  7. `pool.connect()` INSIDE try, `let client: PoolClient | undefined`
  8. `BEGIN` + `SELECT … FOR UPDATE`
  9. row.rowCount === 0 → ROLLBACK + 404 not_found
  10. `isLocaleEmpty` → ROLLBACK + 404 locale_empty
  11. `imageCount > countAvailableImages` → ROLLBACK + 400 image_count_exceeded
  12. `serverHash !== body.contentHash` → ROLLBACK + 409 content_changed
  13. Block coverage validation (8a duplicate, 8b unknown, 8c incomplete) → 422
  14. CAS comparison `currentVersion !== body.layoutVersion` → ROLLBACK + 412
  15. UPDATE + COMMIT + auditLog
  16. catch → `client?.query("ROLLBACK").catch(() => {})` + `internalError(...)`
  17. finally → `client?.release()`
- **DELETE** uses transaction with SELECT FOR UPDATE for atomicity of Phase 1 (key removal) + Phase 2 (NULL-collapse) — Codex finding: separate queries can race with concurrent PUT.
- **PUT body Zod schema**:
  ```ts
  const HASH16 = z.string().regex(/^[0-9a-f]{16}$/);
  // Block-ID validation imported from S1a's isExportBlockId helper.
  const BlockIdSchema = z.string().refine(isExportBlockId, "expected_block_id");
  const PutBodySchema = z.object({
    locale: z.enum(["de", "fr"]),
    imageCount: z.number().int().min(0).max(MAX_BODY_IMAGE_COUNT),
    contentHash: HASH16,
    layoutVersion: z.union([HASH16, z.null()]),
    slides: z.array(z.object({ blocks: z.array(BlockIdSchema) })),
  });
  ```
- **Helpers used** (must be imported): `requireAuth`, `validateId`, `internalError`, `parseBody` from `@/lib/api-helpers`; `getClientIp` from `@/lib/client-ip`; `resolveActorEmail` from `@/lib/signups-audit`; `pool` from `@/lib/db`; `auditLog` from `@/lib/audit`; `import type { PoolClient } from "pg"`. From `@/lib/instagram-post`: `resolveInstagramSlides`, `flattenContentWithIds`, `computeLayoutHash`, `computeLayoutVersion`, `isExportBlockId`, `MAX_BODY_IMAGE_COUNT`, `SLIDE_HARD_CAP`, `isLocaleEmpty`, `countAvailableImages`, override types.
- **`MAX_BODY_IMAGE_COUNT`**: new exported const in `instagram-post.ts`, `= 20` (DOS-guard for Zod layer; per-item cap via `countAvailableImages` is the real business constraint).

## Tests (vorläufig ~40)

- API: ~34 (GET 11 + PUT 14 + DELETE 9 — siehe S1-monolithic spec für detail-bullets, all carry over)
- existing-route updates: bereits in S1a abgedeckt
- new test-file: `src/app/api/dashboard/agenda/[id]/instagram-layout/route.test.ts`
- pure: `computeLayoutVersion` (~2 cases) als einziger neuer pure helper

## Manueller Smoke (Staging) — REVISED per Codex security finding

**Pre-smoke prep (MANDATORY, NOT optional)**:
- `pg_dump` der `agenda_items` table BEFORE smoke: `pg_dump --table agenda_items --data-only --schema=public alit > /tmp/agenda_pre_smoke_<date>.sql`
- Identify a **disposable test-row** (e.g. create one specifically for smoke via dashboard UI, mark with title "S1B-SMOKE-DELETE-ME-<date>"). NIEMALS gegen produktive Einträge psql-UPDATEen.

**Smoke cases**:
- **DK-S1Ba**: psql `INSERT` einer override-row gegen disposable test-row mit korrekt computed contentHash+layoutVersion → `GET /instagram` returns `layoutMode: "manual"`.
  - **Helper**: `pnpm exec tsx scripts/compute-override-hashes.ts <agenda_id> <locale> <imageCount> <slides-json>` — neues script unter `scripts/`, nutzt project's source files via tsx (NICHT `node -e import('./instagram-post.js')` — das funktioniert nicht in TS-only repo).
- **DK-S1Bb**: Body-Edit nach manueller Override → `GET /instagram` returns `layoutMode: "stale"` + warning.
- **DK-S1Bc**: `DELETE /instagram-layout?locale=de&images=0` → 204, JSONB-key entfernt, locale-collapse zu NULL.
- **DK-S1Bd**: PUT-CAS Race via 2 parallel `psql` Sessions auf disposable test-row → 412 "layout_modified_by_other".
- **Post-smoke cleanup**: DELETE des disposable test-rows; verify pg_dump backup is intact (kann zur Not restored werden).

## Risk Highlights

- **CAS via app-side SELECT FOR UPDATE** — pattern: `patterns/database-concurrency.md` Deterministic-Lock-Order. Note in pattern-doc adden für JSONB-overrides specifically.
- **Bestehende `splitAgendaIntoSlides` Pure-Output bit-identisch** für no-override Pfad — bereits S1a-DK, hier verifiziert via existing-route tests
- **HTTP-Response der Metadata-Route bekommt `layoutMode` Field** — bereits S1a, S1b berührt das nicht
- **Orphan policy decision** (GET surfaces stale vs hard-fail) muss in voller Spec final entschieden werden — Sonnet+Codex spec-eval finalisiert es
- **`layoutVersion` als computed-not-stored**: `InstagramLayoutOverride` JSONB-shape enthält das Field NICHT (S1a entfernte es). PUT body sendet client's recall vom letzten GET; server's CAS recomputed aus stored `{contentHash, slides}` und vergleicht. Damit gibt's keine Drift-Möglichkeit zwischen stored-vs-recompute.

## Out of Scope (kommt in S2)

- Modal Layout-Tab UI mit dirty-detect, in-Modal-Confirm, refetchKey re-trigger, dashboardFetch, error-states
- User-facing manueller smoke aus Admin-Perspektive (DK-X1..X5 in S2 outline)

## Notes

- Volle Detail-Spec wird via Planner geschrieben sobald S1a merged ist
- Source-Material:
  - `tasks/instagram-layout-overrides-spec-v3-reference.md` (besonders §API-Routen, §CAS-SQL, §Modal Layout-Mode dort für context)
  - `tasks/codex-spec-review.md` (Codex R1 SPLIT recommendation + 9 findings — alle relevant für S1b)
  - Sonnet-rounds R1-R7 fixes aus `feat/instagram-layout-overrides-backend` branch (in git history) — viele apply auch zu S1b
- **Decisions to finalize in S1b spec writing**:
  - Orphan policy: GET surfaces stale vs 400 hard-fail (Codex finding #M4)
  - Empty-slide validation: Step #3b (already decided in monolithic-S1) carries over
  - DELETE 404 vs idempotent-204 für non-existent agenda_id (decided: 404 prevents phantom audit)
  - `MAX_BODY_IMAGE_COUNT` value (decided: 20; explicit accept-limitation note for orphans > 20)
