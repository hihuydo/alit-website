# Sprint S1b — Layout-Overrides Persistence API
<!-- Created: 2026-04-29 -->
<!-- Branch: feat/instagram-layout-overrides-s1b-persistence -->
<!-- Depends on: S1a merged (PR #131) — schema column + resolver + helpers + override types live in prod -->
<!-- Source: tasks/instagram-layout-overrides-s1b-outline.md + S1a learnings + v3-reference §API-Routen -->

## Summary

Adds the persistence API layer on top of S1a's foundation:

- **3 REST endpoints** unter `/api/dashboard/agenda/[id]/instagram-layout/route.ts`:
  - `GET ?locale=de&images=N` — read current layout (auto/manual/stale + computed `layoutVersion`)
  - `PUT` — save manual override with App-side SELECT FOR UPDATE CAS
  - `DELETE ?locale=de&images=N` — reset to auto
- **App-side CAS** via SELECT FOR UPDATE (NICHT md5-in-WHERE — eliminates Postgres-internal-key-order vs app-`stableStringify` divergence trap; pattern siehe `patterns/database-concurrency.md`)
- **Audit-log** via S0-extended events `agenda_layout_update` + `agenda_layout_reset` (already in `AuditEvent` union — verifiziert in `src/lib/audit.ts:24-25`)
- **Orphan-policy** explicit (Codex finding addressed)
- **`layoutVersion` ist computed-not-stored** — server berechnet on-the-fly aus stored `{contentHash, slides}`; Client hat keinen Persisted-Version-Trap; eliminates "stored ≠ recomputed → permanent 412 loop" risk (Codex finding from S0-era spec-eval)

**No new UI surface in S1b** — die Modal-Layout-Tab kommt erst in S2. S1b ist nur API + smoke-tests.

---

## Sprint Contract — Done-Kriterien

1. **DK-1**: 3 Routes (GET/PUT/DELETE) in `src/app/api/dashboard/agenda/[id]/instagram-layout/route.ts` implemented mit allen documented status-codes
2. **DK-2**: `pnpm exec tsc --noEmit` + `pnpm build` clean (DK-2 implies node:crypto bundle separation hält)
3. **DK-3**: `pnpm test` grün — neue tests added (~40 cases per estimate, CI counts)
4. **DK-4**: `pnpm audit --prod` 0 HIGH/CRITICAL
5. **DK-5**: `computeLayoutVersion(override)` neu in `instagram-overrides.ts` als pure helper exposed (S2 modal will brauchen)
6. **DK-6**: `MAX_BODY_IMAGE_COUNT = 20` + `EXPORT_BLOCKS_HARD_CAP = 200` neu als exported consts in `instagram-post.ts` (beide Zod DOS-guards; real business cap via `countAvailableImages` bzw. typische slide-block-Counts)
7. **DK-7**: Audit-log entries für PUT (`agenda_layout_update`) und DELETE (`agenda_layout_reset`) — geschrieben mit `agenda_id`, `locale`, `image_count`, `slide_count` (PUT only), `actor_email`, `ip`
8. **DK-8**: App-side SELECT FOR UPDATE CAS pattern dokumentiert in `patterns/database-concurrency.md` (neuer Abschnitt "JSONB-Override Optimistic Concurrency via App-side CAS")
9. **DK-9**: Backward-compat — bestehende `instagram` metadata + `instagram-slide` PNG routes unverändert (S1a hat sie schon umgestellt; S1b berührt sie nicht)
10. **DK-10**: Helper-script `scripts/compute-override-hashes.ts` für staging-smoke (siehe §Manueller Smoke)
11. **DK-11**: Codex PR-Review — in-scope Findings gefixt
12. **DK-12**: Prod-Merge + post-merge Verifikation (CI grün + `/api/health/` 200 + Container healthy + Logs clean)

---

## Architektur

### Datenfluss

```
Client                                        Server
──────                                        ──────
GET ?locale&images
                  ───────────────────────►   pool.query SELECT (incl. instagram_layout_i18n)
                                              extract override = layout?.[locale]?.[String(imageCount)] ?? null
                                              result = resolveInstagramSlides(item, locale, imageCount, override)
                                              storedOverride = layout?.[locale]?.[String(imageCount)] ?? null
                                              layoutVersion = storedOverride ? computeLayoutVersion(storedOverride) : null
                  ◄─── 200 {success, mode, contentHash, layoutVersion, imageCount, slides:[...]}

PUT body {locale, imageCount, contentHash, layoutVersion, slides}
                  ───────────────────────►   client = pool.connect(); BEGIN;
                                              row = SELECT ... FOR UPDATE WHERE id=$1
                                              storedOverride = row.layout?.[locale]?.[String(imageCount)] ?? null
                                              currentVersion = storedOverride ? computeLayoutVersion(storedOverride) : null
                                              [validation chain — siehe §Validation Order]
                                              if (currentVersion !== body.layoutVersion) → ROLLBACK + 412
                                              UPDATE ... SET instagram_layout_i18n = jsonb_set(...)
                                              COMMIT; auditLog(...)
                                              newVersion = computeLayoutVersion(saved)
                  ◄─── 200 {success: true, layoutVersion: newVersion}

DELETE ?locale&images
                  ───────────────────────►   client = pool.connect(); BEGIN;
                                              row = SELECT ... FOR UPDATE WHERE id=$1
                                              if (rowCount === 0) → ROLLBACK + 404 (Phantom-Audit prevention)
                                              [Phase 1] UPDATE ... SET layout = layout #- ARRAY[locale, imageCountStr]
                                              [Phase 2] UPDATE ... SET layout = NULL  WHERE collapse-condition
                                              COMMIT; auditLog(...)
                  ◄─── 204
```

### `computeLayoutVersion` — neuer pure helper

Lebt in `src/lib/instagram-overrides.ts` (NICHT in `instagram-post.ts` — node:crypto bundle-safety). Exposed export, S2 modal wird ihn brauchen für client-side dirty-detect-baseline.

```ts
// src/lib/instagram-overrides.ts (extends S1a)
import { createHash } from "node:crypto";
import { stableStringify } from "./stable-stringify";
import type { InstagramLayoutOverride } from "./instagram-post";

/** 16-char md5-prefix of the canonicalized override JSONB.
 *  Used for App-side CAS: client passes the version received from GET,
 *  server recomputes from stored row, mismatch → 412.
 *
 *  CHOICE OF ALGO: md5 (not sha256). Rationale: layoutVersion ist NICHT
 *  security-relevant — es ist ein Optimistic-Concurrency-Token, kein
 *  authentication artifact. md5 is faster + 16-char prefix is enough
 *  collision space (2^64) für der single-row-CAS use case. NIE für
 *  authentication, signature verification, oder password hashing nutzen.
 *
 *  PAYLOAD = `{contentHash, slides}` (entspricht `InstagramLayoutOverride`
 *  shape 1:1). Future-shape-additions: wenn `InstagramLayoutOverride` neue
 *  Fields bekommt, gelten sie automatisch via stableStringify(override).
 *  Keine separate payload-Definition — single source-of-truth ist der Type. */
export function computeLayoutVersion(override: InstagramLayoutOverride): string {
  return createHash("md5").update(stableStringify(override)).digest("hex").slice(0, 16);
}
```

### `MAX_BODY_IMAGE_COUNT` — neuer exported const

Lebt in `src/lib/instagram-post.ts` neben `SLIDE_HARD_CAP`. Begründung als Zod DOS-guard (verhindert dass riesige `imageCount`-Werte erst durch alle Validation-Stufen rauschen, bevor `countAvailableImages` clamped). Wert: **`20`**. Real-world Annahme: kein Agenda-Eintrag wird >20 Bilder haben.

```ts
// src/lib/instagram-post.ts
/** Hard cap on the `imageCount` value the API accepts in PUT bodies.
 *  DOS-guard: rejects malicious/malformed values at Zod stage before
 *  pool.connect(). The real per-item business cap is enforced via
 *  `countAvailableImages(item)` after the SELECT — this const just
 *  bounds the input space. */
export const MAX_BODY_IMAGE_COUNT = 20;

/** Hard cap on `slides[i].blocks.length` for PUT bodies. DOS-guard:
 *  ohne diesen cap könnte ein 256KB-body ~10000 block-IDs in einer
 *  einzelnen slide enthalten und dadurch den O(n) coverage-check loop
 *  (Set-construction + iteration) belasten bevor Zod 422 zurückgibt.
 *  200 ist großzügig für realistische single-slide-Layouts (typisch <20).
 *  Wird im Zod schema als `.max(EXPORT_BLOCKS_HARD_CAP)` auf das blocks-
 *  Array gewired. */
export const EXPORT_BLOCKS_HARD_CAP = 200;
```

### Routes-File

```ts
// src/app/api/dashboard/agenda/[id]/instagram-layout/route.ts
import { NextRequest, NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { z } from "zod";
import pool from "@/lib/db";
import { requireAuth, validateId, internalError, parseBody } from "@/lib/api-helpers";
import { auditLog } from "@/lib/audit";
import { getClientIp } from "@/lib/client-ip";
import { resolveActorEmail } from "@/lib/signups-audit";
import {
  countAvailableImages,
  EXPORT_BLOCKS_HARD_CAP,
  flattenContentWithIds,
  isExportBlockId,
  isLocaleEmpty,
  MAX_BODY_IMAGE_COUNT,
  projectAutoBlocksToSlides,
  SLIDE_HARD_CAP,
  type AgendaItemForExport,
  type ExportBlock,
  type InstagramLayoutOverride,
  type InstagramLayoutOverrides,
  type Locale,
} from "@/lib/instagram-post";
import {
  computeLayoutHash,
  computeLayoutVersion,
  resolveInstagramSlides,
} from "@/lib/instagram-overrides";

export const runtime = "nodejs";

function parseLocale(v: string | null): Locale | null {
  return v === "de" || v === "fr" ? v : null;
}

function parseImageCount(v: string | null): number | null {
  if (v === null) return null;
  const n = parseInt(v, 10);
  if (!Number.isFinite(n) || n < 0 || String(n) !== v) return null;
  return n;
}

const HASH16_RE = /^[0-9a-f]{16}$/;
const HASH16 = z.string().regex(HASH16_RE);
const BlockIdSchema = z.string().refine(isExportBlockId, {
  message: "expected_block_id",
});

const PutBodySchema = z.object({
  locale: z.enum(["de", "fr"]),
  imageCount: z.number().int().min(0).max(MAX_BODY_IMAGE_COUNT),
  contentHash: HASH16,
  layoutVersion: z.union([HASH16, z.null()]),
  slides: z.array(
    z.object({
      // R6 [MED-1] DOS-guard: cap blocks.length per-slide. Without this,
      // a 256KB body could carry ~10000 block-IDs in one slide and stress
      // the coverage-check Set construction.
      blocks: z.array(BlockIdSchema).max(EXPORT_BLOCKS_HARD_CAP),
    }),
  ),
});
type PutBody = z.infer<typeof PutBodySchema>;
```

#### GET

```ts
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const numId = validateId(id);
  if (!numId) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
  }
  const url = new URL(req.url);
  const locale = parseLocale(url.searchParams.get("locale"));
  if (!locale) {
    return NextResponse.json({ success: false, error: "Invalid locale" }, { status: 400 });
  }
  const imageCount = parseImageCount(url.searchParams.get("images"));
  if (imageCount === null) {
    return NextResponse.json({ success: false, error: "Invalid images" }, { status: 400 });
  }
  if (imageCount > MAX_BODY_IMAGE_COUNT) {
    return NextResponse.json({ success: false, error: "image_count_too_large" }, { status: 400 });
  }

  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { rows } = await pool.query<
      AgendaItemForExport & { instagram_layout_i18n: InstagramLayoutOverrides | null }
    >(
      `SELECT id, datum, zeit, title_i18n, lead_i18n, ort_i18n, content_i18n,
              hashtags, images, images_grid_columns, instagram_layout_i18n
         FROM agenda_items WHERE id = $1`,
      [numId],
    );
    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: "not_found" }, { status: 404 });
    }
    const item = rows[0];

    if (isLocaleEmpty(item, locale)) {
      return NextResponse.json({ success: false, error: "locale_empty" }, { status: 404 });
    }

    // ORPHAN POLICY (Codex finding): GET surfaces stale instead of 400 hard-fail
    // when imageCount > countAvailableImages(item). Damit kann S2 UI den Reset-
    // Button anzeigen für orphans (z.B. nach image-deletion). DELETE bleibt
    // cap-frei (intentional asymmetry — siehe §Risk Surface).
    const availableImages = countAvailableImages(item);
    const isOrphan = imageCount > availableImages;

    const storedOverride =
      item.instagram_layout_i18n?.[locale]?.[String(imageCount)] ?? null;

    if (isOrphan) {
      // Bypass resolver — auto-path with this imageCount would clamp differently
      // anyway. Surface explicit warning + null contentHash so client knows it's
      // not a recoverable resolve.
      return NextResponse.json({
        success: true,
        mode: "stale",
        contentHash: null,
        layoutVersion: storedOverride ? computeLayoutVersion(storedOverride) : null,
        imageCount,
        availableImages,
        slides: [],
        warnings: ["orphan_image_count"],
      });
    }

    const result = resolveInstagramSlides(item, locale, imageCount, storedOverride);
    const layoutVersion = storedOverride ? computeLayoutVersion(storedOverride) : null;

    // CRITICAL: GET-response slides MÜSSEN block-IDs haben (auch für auto/stale —
    // S2 modal referenziert jeden Block via ID für dirty-detect + reorder).
    //
    // Resolver-Output divergiert nach mode:
    // - mode="manual": result.slides.blocks SIND ExportBlocks (mit `.id` via
    //   flattenContentWithIds → buildManualSlides).
    // - mode="auto"/"stale": result.slides.blocks sind SlideBlocks (KEIN `.id` —
    //   splitAgendaIntoSlides nutzt flattenContent OHNE id).
    //
    // → Für auto/stale müssen wir EXPLIZIT projectAutoBlocksToSlides aufrufen
    //   (S1a exposed das, S1b nutzt es zum ersten Mal in einer Route).
    //   `index` ist der filtered-array-Index (NICHT die ursprüngliche Slide-
    //   Position) — S2 modal nutzt diesen als slide-renderer key.
    let textSlides: Array<{
      index: number;
      blocks: { id: string; text: string; isHeading: boolean }[];
    }>;

    if (result.mode === "manual") {
      textSlides = result.slides
        .filter((s) => s.kind === "text")
        .map((s, i) => ({
          index: i,
          blocks: (s.blocks as ExportBlock[]).map((b) => ({
            id: b.id,
            text: b.text,
            isHeading: b.isHeading,
          })),
        }));
    } else {
      // Auto / stale path: use projectAutoBlocksToSlides for block-ID mapping.
      const exportBlocks = flattenContentWithIds(item.content_i18n?.[locale] ?? null);
      const autoGroups = projectAutoBlocksToSlides(item, locale, imageCount, exportBlocks);
      textSlides = autoGroups.map((group, i) => ({
        index: i,
        blocks: group.map((b) => ({
          id: b.id,
          text: b.text,
          isHeading: b.isHeading,
        })),
      }));
    }

    return NextResponse.json({
      success: true,
      mode: result.mode,
      contentHash: result.contentHash,
      layoutVersion,
      imageCount,
      availableImages,
      slides: textSlides,
      warnings: result.warnings ?? [],
    });
  } catch (err) {
    return internalError("agenda/instagram-layout/GET", err);
  }
}
```

**Response-Shape Contract** (für S2 modal-Implementation — vollständig):

```ts
{
  success: true,
  mode: "auto" | "manual" | "stale",
  contentHash: string | null,        // null only for orphan path (imageCount > availableImages)
  layoutVersion: string | null,      // null when no stored override; 16-char md5-prefix sonst
  imageCount: number,                // echo of request param (post-clamp via Zod)
  availableImages: number,           // countAvailableImages(item) — modal nutzt für UI-hints (e.g. "3 von 5 Bildern verwendet")
  slides: Array<{
    index: number,                   // gefilterter text-only 0-based index (grid NICHT in response)
    blocks: Array<{
      id: string,                    // IMMER non-null, format `block:<sourceId>` (auto via projectAutoBlocksToSlides, manual via flattenContentWithIds)
      text: string,
      isHeading: boolean,
    }>,
  }>,
  warnings: string[],                // IMMER array (auto=[], stale=["layout_stale"|"orphan_image_count"], manual=[]). Defensive `?? []` in implementation.
}
```

Tests müssen alle Top-Level-Felder explizit asserten (auch `availableImages`, sonst werden refactor-omissions silent-survived). Insbesondere:
- `expect(body.availableImages).toBe(N)` für GET 200 auto/manual/stale tests
- `expect(body).toHaveProperty('warnings')` + `expect(body.warnings).toEqual([])` für auto-mode

#### PUT

```ts
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const numId = validateId(id);
  if (!numId) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
  }

  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  // §Validation Order (each fail = early-return BEFORE pool.connect):
  // 1. parseBody
  // 2. Zod schema
  // 3. body.slides.length === 0       → 400 empty_layout
  // 4. body.slides.length > SLIDE_HARD_CAP → 400 too_many_slides
  // 5. body.slides.some(s => s.blocks.length === 0) → 400 empty_slide

  const body = await parseBody<unknown>(req);
  if (!body) {
    return NextResponse.json({ success: false, error: "Invalid body" }, { status: 400 });
  }
  const parsed = PutBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid body", details: parsed.error.format() },
      { status: 400 },
    );
  }
  const validated: PutBody = parsed.data;

  if (validated.slides.length === 0) {
    return NextResponse.json({ success: false, error: "empty_layout" }, { status: 400 });
  }
  if (validated.slides.length > SLIDE_HARD_CAP) {
    return NextResponse.json({ success: false, error: "too_many_slides" }, { status: 400 });
  }
  if (validated.slides.some((s) => s.blocks.length === 0)) {
    return NextResponse.json({ success: false, error: "empty_slide" }, { status: 400 });
  }

  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const { rows } = await client.query<
      AgendaItemForExport & { instagram_layout_i18n: InstagramLayoutOverrides | null }
    >(
      `SELECT id, datum, zeit, title_i18n, lead_i18n, ort_i18n, content_i18n,
              hashtags, images, images_grid_columns, instagram_layout_i18n
         FROM agenda_items WHERE id = $1
         FOR UPDATE`,
      [numId],
    );
    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ success: false, error: "not_found" }, { status: 404 });
    }
    const item = rows[0];

    if (isLocaleEmpty(item, validated.locale)) {
      await client.query("ROLLBACK");
      return NextResponse.json({ success: false, error: "locale_empty" }, { status: 404 });
    }

    if (validated.imageCount > countAvailableImages(item)) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { success: false, error: "image_count_exceeded" },
        { status: 400 },
      );
    }

    // Content-Hash check (409 not 412 — content has changed under us)
    const serverHash = computeLayoutHash({
      item,
      locale: validated.locale,
      imageCount: validated.imageCount,
    });
    if (serverHash !== validated.contentHash) {
      await client.query("ROLLBACK");
      return NextResponse.json({ success: false, error: "content_changed" }, { status: 409 });
    }

    // Block-coverage validation (422)
    const exportBlocks = flattenContentWithIds(
      item.content_i18n?.[validated.locale] ?? null,
    );
    const exportIds = new Set(exportBlocks.map((b) => b.id));
    const requested = validated.slides.flatMap((s) => s.blocks);
    const requestedSet = new Set(requested);

    if (requestedSet.size !== requested.length) {
      await client.query("ROLLBACK");
      return NextResponse.json({ success: false, error: "duplicate_block" }, { status: 422 });
    }
    for (const id of requestedSet) {
      if (!exportIds.has(id)) {
        await client.query("ROLLBACK");
        return NextResponse.json({ success: false, error: "unknown_block" }, { status: 422 });
      }
    }
    for (const id of exportIds) {
      if (!requestedSet.has(id)) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { success: false, error: "incomplete_layout" },
          { status: 422 },
        );
      }
    }

    // App-side CAS (412)
    const storedOverride =
      item.instagram_layout_i18n?.[validated.locale]?.[String(validated.imageCount)] ?? null;
    const currentVersion = storedOverride ? computeLayoutVersion(storedOverride) : null;
    if (currentVersion !== validated.layoutVersion) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { success: false, error: "layout_modified_by_other" },
        { status: 412 },
      );
    }

    // UPDATE — write the new override
    const newOverride: InstagramLayoutOverride = {
      contentHash: serverHash,
      slides: validated.slides.map((s) => ({ blocks: s.blocks })),
    };
    await client.query(
      `UPDATE agenda_items
          SET instagram_layout_i18n = jsonb_set(
            COALESCE(instagram_layout_i18n, '{}'::jsonb),
            ARRAY[$2::text, $3::text],
            $4::jsonb,
            true
          )
        WHERE id = $1`,
      [numId, validated.locale, String(validated.imageCount), JSON.stringify(newOverride)],
    );
    // Pre-COMMIT-actorResolve: resolveActorEmail() vor COMMIT, damit ein
    // throw beim Email-Lookup ROLLBACK auslöst statt commit-then-500-leak.
    // (Würde die Email NACH COMMIT gelesen + werfen, wäre die Row schon
    // geschrieben aber der Client bekäme 500 → Retry triggert 412 obwohl
    // der erste Write erfolgreich war. R2 [FAIL-1].)
    const actorEmail = await resolveActorEmail(auth.userId);
    await client.query("COMMIT");

    const newVersion = computeLayoutVersion(newOverride);
    // Audit + response sind post-COMMIT — beides darf nicht mehr werfen.
    // auditLog ist fire-and-forget (siehe audit.ts:99 — nutzt void persist().catch()).
    auditLog("agenda_layout_update", {
      ip: getClientIp(req.headers),
      actor_email: actorEmail ?? undefined,
      agenda_id: numId,
      locale: validated.locale,
      image_count: validated.imageCount,
      slide_count: validated.slides.length,
    });

    return NextResponse.json({ success: true, layoutVersion: newVersion });
  } catch (err) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // ROLLBACK on already-broken connection is harmless — swallow.
      }
    }
    return internalError("agenda/instagram-layout/PUT", err);
  } finally {
    client?.release();
  }
}
```

#### DELETE

```ts
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const numId = validateId(id);
  if (!numId) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
  }
  const url = new URL(req.url);
  const locale = parseLocale(url.searchParams.get("locale"));
  if (!locale) {
    return NextResponse.json({ success: false, error: "Invalid locale" }, { status: 400 });
  }
  const imageCount = parseImageCount(url.searchParams.get("images"));
  if (imageCount === null) {
    return NextResponse.json({ success: false, error: "Invalid images" }, { status: 400 });
  }
  // Note: kein MAX_BODY_IMAGE_COUNT clamp hier — DELETE für orphan-keys
  // (>availableImages) muss möglich bleiben. Cap-frei intentional.

  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    // SELECT FOR UPDATE auf agenda_items.id — verhindert Race mit concurrent
    // PUT. Kein .layout?.[locale] Check hier: wir wollen DELETE auch dann
    // 204'en wenn nichts zu löschen ist (idempotent), ABER wir brauchen
    // 404 für non-existent agenda_id (Phantom-Audit prevention).
    //
    // ASYMMETRY (intentional, nicht "fixen"): GET + PUT prüfen isLocaleEmpty
    // und returnen 404 "locale_empty". DELETE prüft das BEWUSST NICHT —
    // orphan-cleanup nach locale-emptying muss möglich bleiben (e.g. admin
    // löscht den FR-content; vorher gespeicherte FR-Overrides müssen via
    // DELETE entfernbar sein, sonst dangling JSONB für immer). Auch:
    // imageCount > MAX_BODY_IMAGE_COUNT bleibt cap-frei (siehe oben).
    const sel = await client.query<{ instagram_layout_i18n: InstagramLayoutOverrides | null }>(
      `SELECT instagram_layout_i18n FROM agenda_items WHERE id = $1 FOR UPDATE`,
      [numId],
    );
    if (sel.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ success: false, error: "not_found" }, { status: 404 });
    }

    // Phase 1 — entferne den per-imageCount key
    await client.query(
      `UPDATE agenda_items
          SET instagram_layout_i18n = instagram_layout_i18n #- ARRAY[$2::text, $3::text]
        WHERE id = $1
          AND instagram_layout_i18n IS NOT NULL`,
      [numId, locale, String(imageCount)],
    );

    // Phase 2 — collapse to NULL wenn alle locale-objects leer/null sind
    await client.query(
      `UPDATE agenda_items
          SET instagram_layout_i18n = NULL
        WHERE id = $1
          AND instagram_layout_i18n IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_each(instagram_layout_i18n) AS kv
             WHERE kv.value IS NOT NULL
               AND kv.value <> 'null'::jsonb
               AND kv.value <> '{}'::jsonb
          )`,
      [numId],
    );
    // Pre-COMMIT-actorResolve (R2 [FAIL-1]): siehe PUT-comment oben.
    const actorEmail = await resolveActorEmail(auth.userId);
    await client.query("COMMIT");

    // INTENTIONAL: auditLog fires AUCH wenn der DELETE no-op war (key
    // existierte nicht / alle Phase-1+2-UPDATEs rowCount=0). Begründung:
    // (a) DELETE ist idempotent von Design (siehe ASYMMETRY-comment oben).
    // (b) Audit-trail soll User-Intent abbilden, nicht DB-state-change.
    // (c) Verhindert Maskierung von Burst-DELETE-Patterns (z.B. malicious
    //     "delete-all-overrides" via repeated DELETEs auf gleichen key —
    //     audit-log zeigt das volle Repeat-Pattern, auch wenn DB silently
    //     no-ops). Trade-off: minor audit-row-inflation für legitime UI-
    //     "Reset"-clicks akzeptiert.
    auditLog("agenda_layout_reset", {
      ip: getClientIp(req.headers),
      actor_email: actorEmail ?? undefined,
      agenda_id: numId,
      locale,
      image_count: imageCount,
    });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch {}
    }
    return internalError("agenda/instagram-layout/DELETE", err);
  } finally {
    client?.release();
  }
}
```

---

## Tests

> Test-File: `src/app/api/dashboard/agenda/[id]/instagram-layout/route.test.ts`. Pure-helper test (`computeLayoutVersion`) lebt in `src/lib/instagram-overrides.test.ts` (extends).

### Test-Infrastructure (R5 [HIGH-1] + [HIGH-2] — verbatim aus S1a-pattern)

**WICHTIG**: NICHT `vi.mock` at file-top nutzen. S1a-pattern ist `vi.doMock` inside `beforeEach` + `vi.resetModules()` + dynamic-import (`await import("./route")`). Single source-of-truth: `src/app/api/dashboard/journal/reorder/route.test.ts:44-66`.

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SignJWT } from "jose";

const JWT_SECRET = "test-secret-at-least-32-chars-long-instagram-layout-XX";

async function makeToken(sub: string, tv: number): Promise<string> {
  return new SignJWT({ sub, tv })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(new TextEncoder().encode(JWT_SECRET));
}

async function buildCsrf(userId: number, tv: number): Promise<string> {
  const { buildCsrfToken } = await import("@/lib/csrf");
  return buildCsrfToken(JWT_SECRET, userId, tv);
}

function fakeReq(opts: {
  url?: string;
  method?: string;
  sessionCookie?: string;
  csrfCookie?: string;
  csrfHeader?: string;
  body?: unknown;
}): import("next/server").NextRequest {
  const cookies = new Map<string, { value: string }>();
  if (opts.sessionCookie) {
    cookies.set("__Host-session", { value: opts.sessionCookie });
    cookies.set("session", { value: opts.sessionCookie });
  }
  if (opts.csrfCookie) cookies.set("__Host-csrf", { value: opts.csrfCookie });
  const bodyText = opts.body === undefined ? "" : JSON.stringify(opts.body);
  const headers = new Map<string, string>();
  if (opts.csrfHeader) headers.set("x-csrf-token", opts.csrfHeader);
  if (opts.body !== undefined) headers.set("content-length", String(bodyText.length));
  return {
    method: opts.method ?? "GET",
    url: opts.url ?? "http://localhost/api/dashboard/agenda/1/instagram-layout?locale=de&images=0",
    headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
    cookies: { get: (name: string) => cookies.get(name) },
    text: async () => bodyText,
  } as unknown as import("next/server").NextRequest;
}

describe("/api/dashboard/agenda/[id]/instagram-layout", () => {
  // Shared mock-state (reset in beforeEach)
  const mockQuery = vi.fn();
  const mockConnect = vi.fn();
  const mockClient = { query: vi.fn(), release: vi.fn() };
  const mockResolveActorEmail = vi.fn();
  const mockAuditLog = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", JWT_SECRET);
    mockQuery.mockReset();
    mockConnect.mockReset();
    mockClient.query.mockReset();
    mockClient.release.mockReset();
    mockResolveActorEmail.mockReset().mockResolvedValue("admin@example.com");  // happy default
    mockAuditLog.mockReset();
    mockConnect.mockResolvedValue(mockClient);

    vi.doMock("@/lib/db", () => ({
      default: { query: mockQuery, connect: mockConnect },
    }));
    vi.doMock("@/lib/signups-audit", () => ({
      resolveActorEmail: mockResolveActorEmail,
    }));
    vi.doMock("@/lib/audit", () => ({
      auditLog: mockAuditLog,
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  // ... per-route describe-blocks unten ...
});
```

**Per-test query-chain pattern** (Beispiel happy-path PUT):

```ts
it("PUT 200 happy path + audit", async () => {
  const item = baseItem();
  const ch = computeLayoutHash({ item, locale: "de", imageCount: 0 });
  const blocks = flattenContentWithIds(item.content_i18n!.de!);
  const slides = [{ blocks: blocks.map((b) => b.id) }];

  mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });  // requireAuth tv-check
  mockClient.query
    .mockResolvedValueOnce({ rows: [] })                              // BEGIN
    .mockResolvedValueOnce({ rows: [{ ...item, instagram_layout_i18n: null }] })  // SELECT FOR UPDATE
    .mockResolvedValueOnce({ rowCount: 1, rows: [] })                 // UPDATE
    .mockResolvedValueOnce({ rows: [] });                             // COMMIT

  const csrf = await buildCsrf(1, 1);
  const { PUT } = await import("./route");
  const res = await PUT(
    fakeReq({
      method: "PUT",
      sessionCookie: await makeToken("1", 1),
      csrfCookie: csrf, csrfHeader: csrf,
      body: { locale: "de", imageCount: 0, contentHash: ch, layoutVersion: null, slides },
    }),
    { params: Promise.resolve({ id: "1" }) },
  );
  expect(res.status).toBe(200);
  expect(mockAuditLog).toHaveBeenCalledWith("agenda_layout_update", expect.objectContaining({
    agenda_id: 1, locale: "de", image_count: 0, slide_count: 1,
  }));
});
```

**Note**: Wenn ich vorher `makeMockClient` oder `vi.mocked(pool.connect)` ohne `vi.doMock` referenziere — das war R3/R4-spec-text-bug. Korrekt ist die obige `mockClient.query.mockResolvedValueOnce(...)`-chain inside the test.

### Pure (~3)

#### `computeLayoutVersion` in `instagram-overrides.test.ts`
- Deterministic: same override → same 16-char md5-prefix
- Different overrides (different `contentHash` OR different `slides`) → different version
- Robust gegen JSON-key-order: `{contentHash:'a', slides:[...]}` und `{slides:[...], contentHash:'a'}` produzieren gleichen Hash (via `stableStringify`)

### GET (~13)

> Test-fixture: identisches Pattern wie S1a routes — pool.query mock returns AgendaItemForExport row mit instagram_layout_i18n field. ContentHash IMMER inline berechnet via `computeLayoutHash({item, locale, imageCount})`, NIE hardcoded (S1a-Lessons). **layoutVersion-assertions analog**: `expectedLayoutVersion = computeLayoutVersion(storedOverride)` inline berechnen — NIE hardcoded string. Pattern:
> ```ts
> const ch = computeLayoutHash({ item, locale: "de", imageCount: 0 });
> const storedOverride: InstagramLayoutOverride = { contentHash: ch, slides: [{ blocks: [...] }] };
> const expectedVersion = computeLayoutVersion(storedOverride);
> // ... mock pool.query to return row with this storedOverride ...
> expect(body.layoutVersion).toBe(expectedVersion);
> ```
> Sonst bricht der Test bei jeder Override-Shape-Änderung statt sich automatisch anzupassen.

- 400 bei invalid id (`abc`, `0`, negative)
- 400 bei missing/invalid locale
- 400 bei missing/invalid `images` param (non-numeric)
- 400 bei `images > MAX_BODY_IMAGE_COUNT`
- 401 ohne Auth
- 404 wenn agenda_id nicht existiert
- 404 mit `error: "locale_empty"` wenn isLocaleEmpty(item, locale)
- 200 mit `mode: "auto"` + `layoutVersion: null` wenn override absent.
  **Block-ID assertion**: `expect(body.slides[0].blocks[0].id).toMatch(/^block:/)` — verifiziert dass GET im auto-pfad `projectAutoBlocksToSlides`-blocks nutzt (nicht `splitAgendaIntoSlides`-output mit fehlenden IDs). Sonst würde der wrong-impl trivially-pass.
  **Warnings shape**: `expect(body.warnings).toEqual([])` — verifiziert dass auto-mode IMMER ein Array zurückgibt (nicht `undefined`).
- 200 mit `mode: "manual"` + `layoutVersion: <16-char>` wenn override present + matched (use computed contentHash inline). Auch hier `body.slides[*].blocks[*].id` non-null assertion.
- 200 mit `mode: "stale"` + `warnings` enthält `"layout_stale"` wenn override.contentHash mutated (use computed `ch + "x"` per S1a WARN-3 lessons). Block-ID assertion auch hier (stale-pfad nutzt `projectAutoBlocksToSlides`, NICHT die manual-blocks).
  **Warnings-assertion** (R4 [MED-2] — `toContain` statt `toEqual`, weil resolver appendet `"layout_stale"` AUF `autoResult.warnings`; bei langen content-fixtures kann auch `"too_long"` drin sein): `expect(body.warnings).toContain("layout_stale")`. Fixture: short single-block content damit auto-path keine `too_long` produziert (sonst `["too_long", "layout_stale"]` möglich, was unerwartet wäre).
- 200 mit `mode: "stale"` + `warnings: ["orphan_image_count"]` + `slides: []` wenn imageCount > availableImages (orphan)
- 200 response shape: `expect(body.slides[0]).toHaveProperty('index')` + `index === 0` für erste slide (verifiziert filtered-text-only-Indexing).
- **200 mit title-only locale** (`title_i18n.de = "T"`, `content_i18n.de = []`): `mode: "auto"` + `slides: []` + `warnings: []`. Verhindert dass jemand `slides=[]` als "inkomplett" interpretiert und einen 404 hinzufügt — `isLocaleEmpty` returns false bei nicht-leerem title, und das ist intentional (admin kann auf empty-content layouts speichern, wenn er später content nachträgt).

### PUT (~19)

- 400 bei invalid id
- 400 bei body Zod fail (missing fields, wrong types, hash regex mismatch)
- 400 bei `slides[i].blocks.length > EXPORT_BLOCKS_HARD_CAP (200)` — DOS-guard, Zod failure
- 400 bei `slides.length === 0` → `empty_layout`
- 400 bei `slides.length > SLIDE_HARD_CAP (10)` → `too_many_slides`
- 400 bei `slides[i].blocks.length === 0` → `empty_slide`
- 400 bei `imageCount > availableImages` → `image_count_exceeded`
- 401 ohne Auth
- 403 ohne CSRF (`csrf_missing`)
- 404 wenn agenda_id nicht existiert
- 404 mit `error: "locale_empty"`
- 409 mit altem contentHash → `content_changed`
- 412 mit altem layoutVersion → `layout_modified_by_other`
- 422 mit duplicate block-id → `duplicate_block`
- 422 mit unknown block-id → `unknown_block`
- 422 mit incomplete coverage (current block fehlt im override) → `incomplete_layout`
- **200 happy path**: writes UPDATE + jsonb_set, returns new layoutVersion, **AND** `auditLog("agenda_layout_update", ...)` called with korrektem agenda_id/locale/image_count/slide_count
- **500 bei DB-error mid-transaction → ROLLBACK + internalError**. Mock `client.query("BEGIN")` (NICHT `pool.connect`!) to throw — sonst ist `client` undefined und `client?.release()` no-op (assertion `mockClient.release.toHaveBeenCalled()` würde nie fire-en). Mit BEGIN-throw ist client defined → catch ROLLBACK-attempt + finally release. Asserts: `mockClient.query` mit `"ROLLBACK"` aufgerufen + `mockClient.release` aufgerufen + status 500.
- **PUT pre-COMMIT actorResolve invariant (R2 [FAIL-1] regression-guard)** — `mockResolveActorEmail.mockRejectedValueOnce(new Error("downstream"))` per-test (default ist `mockResolvedValue("admin@example.com")` aus beforeEach). Mock-chain: `mockQuery` → token_version, `mockClient.query` chain durchläuft BEGIN+SELECT+UPDATE, dann throws beim resolveActorEmail-Aufruf. Asserts: (a) status 500, (b) `mockClient.query.mock.calls.map(c => c[0])` enthält `"ROLLBACK"`, (c) enthält NICHT `"COMMIT"`, (d) `mockClient.release()` aufgerufen. Verhindert future-refactor `resolveActorEmail` POST-COMMIT zu verschieben — würde diesen test brechen.

### DELETE (~10)

- 400 bei invalid id, locale, images
- 401 ohne Auth
- 403 ohne CSRF
- 404 wenn agenda_id nicht existiert (Phantom-Audit prevention — auditLog NICHT aufgerufen)
- **204 wenn locale hat keinen Content (`isLocaleEmpty=true`)** — DELETE prüft das BEWUSST NICHT (orphan-cleanup nach locale-emptying muss möglich sein, siehe Code-Comment in DELETE). Test fixiert die intentional-asymmetry zu GET/PUT, verhindert dass jemand "for consistency" einen 404-check ergänzt.
- 204 happy path: jsonb_set entfernt key, **AND** auditLog("agenda_layout_reset", ...) called
- 204 wenn override für key nicht existiert (idempotent). **MUSS auditLog assertion enthalten** (R5 [MED-2]): `expect(mockAuditLog).toHaveBeenCalledWith("agenda_layout_reset", ...)` — fixiert das intentional-no-op-audit-Verhalten (siehe DELETE-Code-Comment), verhindert future-refactor zu `if (rowsAffected > 0) auditLog(...)`-style guard.
- 204 + Phase-2-collapse: wenn nach Phase-1 kein anderer locale/imageCount-key mehr drin ist → `instagram_layout_i18n` wird auf NULL gesetzt.
  **Assertion** (R4 [MED-1] — SQL-string-match, nicht mock-call-count):
  ```ts
  const sqlCalls = mockClient.query.mock.calls.map((c) => c[0] as string);
  // Phase 1 — key removal:
  expect(sqlCalls.some((s) => s.includes("#- ARRAY") && s.includes("instagram_layout_i18n"))).toBe(true);
  // Phase 2 — NULL collapse:
  expect(sqlCalls.some((s) => s.includes("instagram_layout_i18n = NULL") && s.includes("jsonb_each"))).toBe(true);
  ```
  Mock-call-count alleine würde Refactors (z.B. Phase-2 entfernt) silently survive.
- 204 wenn imageCount > MAX_BODY_IMAGE_COUNT (cap-frei intentional, orphan-cleanup)
- 500 bei DB-error → ROLLBACK + internalError

### Integration (~2)

- PUT happy path → DELETE → GET ergibt mode="auto" (full lifecycle).
  **Mock-Setup-Pattern** (R4 [HIGH-1] — PUT/DELETE nutzen `pool.connect()`, GET nutzt `pool.query()` direkt — KEIN single state-machine möglich. Pattern via vi.doMock-Setup aus §Test-Infrastructure):
  ```ts
  // Step 1: PUT — mockClient.query chain für Transaction
  mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });           // requireAuth
  mockClient.query
    .mockResolvedValueOnce({ rows: [] })                                       // BEGIN
    .mockResolvedValueOnce({ rows: [{ ...item, instagram_layout_i18n: null }] }) // SELECT FOR UPDATE
    .mockResolvedValueOnce({ rowCount: 1, rows: [] })                          // UPDATE
    .mockResolvedValueOnce({ rows: [] });                                      // COMMIT
  const putRes = await PUT(req1, ctx);
  expect(putRes.status).toBe(200);

  // Step 2: DELETE — Reset mocks (mockClient is shared across .connect()-calls
  // in beforeEach), neue chain für Phase 1 + Phase 2.
  mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });           // requireAuth
  mockClient.query.mockReset();
  mockClient.query
    .mockResolvedValueOnce({ rows: [] })                                       // BEGIN
    .mockResolvedValueOnce({ rows: [{ instagram_layout_i18n: { de: { "0": persistedOverride } } }] })  // SELECT FOR UPDATE
    .mockResolvedValueOnce({ rowCount: 1, rows: [] })                          // UPDATE Phase 1 (#- ARRAY)
    .mockResolvedValueOnce({ rowCount: 1, rows: [] })                          // UPDATE Phase 2 (NULL collapse)
    .mockResolvedValueOnce({ rows: [] });                                      // COMMIT
  const delRes = await DELETE(req2, ctx);
  expect(delRes.status).toBe(204);

  // Step 3: GET — direct mockQuery (kein .connect, kein transaction)
  mockQuery
    .mockResolvedValueOnce({ rows: [{ token_version: 1 }] })                   // requireAuth
    .mockResolvedValueOnce({ rows: [{ ...item, instagram_layout_i18n: null }] }); // SELECT
  const getRes = await GET(req3, ctx);
  const body = await getRes.json();
  expect(body.mode).toBe("auto");
  expect(body.layoutVersion).toBe(null);
  ```
- 2 sequential PUTs auf gleichen agenda_id mit gleichem layoutVersion: erste UPDATE landed (200), zweite muss 412 "layout_modified_by_other" zurückgeben.
  **Mock-Setup-Pattern** (R3 [FAIL-2] — sequential mock-state-flip, NICHT Promise.all wegen microtask-interleaving):
  ```ts
  // Step 1: PUT-A — SELECT returns null override → CAS pass → 200
  mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
  mockClient.query
    .mockResolvedValueOnce({ rows: [] })                                       // BEGIN
    .mockResolvedValueOnce({ rows: [{ ...item, instagram_layout_i18n: null }] })
    .mockResolvedValueOnce({ rowCount: 1, rows: [] })                          // UPDATE
    .mockResolvedValueOnce({ rows: [] });                                      // COMMIT
  const res1 = await PUT(req, ctx);
  expect(res1.status).toBe(200);

  // Step 2: PUT-B — same body, but SELECT now returns persisted override.
  // currentVersion ≠ null, body.layoutVersion=null → mismatch → ROLLBACK + 412.
  mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
  mockClient.query.mockReset();
  mockClient.query
    .mockResolvedValueOnce({ rows: [] })                                       // BEGIN
    .mockResolvedValueOnce({ rows: [{ ...item, instagram_layout_i18n: { de: { "0": persistedOverride } } }] })
    .mockResolvedValueOnce({ rows: [] });                                      // ROLLBACK
  const res2 = await PUT(req, ctx);
  expect(res2.status).toBe(412);
  expect(await res2.json()).toMatchObject({ error: "layout_modified_by_other" });
  ```
  Test fixiert die CAS-Logik direkt OHNE microtask-ordering dependency. Real concurrency wird im staging-smoke (DK-S1Bd) verifiziert.

---

## CAS-Pattern Documentation

Neuer Abschnitt in `patterns/database-concurrency.md` — Single-source-of-truth für JSONB-Override-CAS.

```md
## JSONB-Override Optimistic Concurrency via App-side CAS

**When**: PUT-routes auf JSONB-Spalten wo client einen "version-token" mitsendet
um CAS zu machen — typisches Beispiel: per-locale × per-imageCount layout-overrides.

**Anti-Pattern (gefährlich)**: md5-in-WHERE-clause CAS:
```sql
UPDATE x SET layout = $new WHERE id = $1 AND md5(layout::text) = $clientHash
```
Postgres `jsonb::text` serialisiert mit Postgres-internal-key-order
(implementation-defined, kann zwischen Versionen drift). App-side
`stableStringify` sortiert Keys alphabetisch. Beide produzieren
**unterschiedliche** strings → md5 differs → CAS würde **immer** 412 zurückgeben.

**Pattern (korrekt)**: App-side SELECT FOR UPDATE + compare:
```ts
const client = await pool.connect();
try {
  await client.query("BEGIN");
  const sel = await client.query<...>(
    "SELECT layout FROM x WHERE id=$1 FOR UPDATE",
    [id],
  );
  // ... validate row exists ...
  const stored = sel.rows[0].layout?.[key] ?? null;
  const currentVersion = stored ? computeLayoutVersion(stored) : null;
  if (currentVersion !== body.layoutVersion) {
    await client.query("ROLLBACK");
    return 412;
  }
  await client.query("UPDATE x SET layout = ... WHERE id=$1", [id]);
  await client.query("COMMIT");
} catch (err) {
  if (client) {
    try { await client.query("ROLLBACK"); } catch {}
  }
  throw err;
} finally {
  client?.release();
}
```

**Why FOR UPDATE**: serialisiert concurrent PUTs auf der gleichen row. Ohne
LOCK könnten 2 PUTs beide das SELECT vor dem ersten UPDATE machen, beide
würden CAS bestehen, und der zweite würde den ersten überschreiben (lost-update).

**`computeLayoutVersion`-Konsistenz**: muss exclusively über `stableStringify`
laufen (nie `JSON.stringify` direkt — key-order non-deterministic). Pure helper
in einem Node-only file (node:crypto), exposed via `export` so Client-Code
(modal dirty-detect) den gleichen Algo nutzen kann via dynamic-import oder
parallel-implementation.
```

---

## Manueller Smoke (Staging)

**Pre-smoke prep (MANDATORY)**:
- `pg_dump` der `agenda_items` table BEFORE smoke:
  ```bash
  ssh hd-server 'PGPASSWORD=... pg_dump --table agenda_items --data-only --schema=public alit > /tmp/agenda_pre_s1b_smoke_2026-04-29.sql'
  ```
- Identifiziere/erstelle einen **disposable test-row** in der DB:
  ```sql
  INSERT INTO agenda_items (datum, zeit, title_i18n, lead_i18n, ort_i18n, content_i18n)
  VALUES ('2099-12-31', '23:59',
    '{"de":"S1B-SMOKE-DELETE-ME-2026-04-29","fr":""}'::jsonb,
    '{"de":"Smoke","fr":null}'::jsonb,
    '{"de":"Lab","fr":null}'::jsonb,
    '{"de":[{"id":"sb1","type":"paragraph","content":[{"text":"Block A"}]},{"id":"sb2","type":"paragraph","content":[{"text":"Block B"}]}],"fr":[]}'::jsonb)
  RETURNING id;
  ```
  NIEMALS gegen produktive Einträge psql-UPDATEen.

**Helper-Script** (`scripts/compute-override-hashes.ts` — DK-10):
```ts
// scripts/compute-override-hashes.ts
// Usage: pnpm exec tsx scripts/compute-override-hashes.ts <agenda_id> <locale> <imageCount>
// Reads the agenda row from DB, prints contentHash + suggested layoutVersion
// for the auto-mode override (so you can craft a manual override SQL with
// matching hashes for staging-smoke).
import "dotenv/config";
import pool from "../src/lib/db";
import { computeLayoutHash, computeLayoutVersion } from "../src/lib/instagram-overrides";
import { flattenContentWithIds, type AgendaItemForExport } from "../src/lib/instagram-post";

async function main() {
  const [, , idArg, localeArg, imageCountArg] = process.argv;
  const id = parseInt(idArg, 10);
  const locale = localeArg as "de" | "fr";
  const imageCount = parseInt(imageCountArg, 10);
  if (!id || !["de", "fr"].includes(locale) || !Number.isFinite(imageCount)) {
    console.error("usage: compute-override-hashes.ts <id> <de|fr> <imageCount>");
    process.exit(1);
  }
  const { rows } = await pool.query<AgendaItemForExport>(
    `SELECT id, datum, zeit, title_i18n, lead_i18n, ort_i18n, content_i18n,
            hashtags, images, images_grid_columns
       FROM agenda_items WHERE id=$1`,
    [id],
  );
  if (rows.length === 0) throw new Error(`agenda ${id} not found`);
  const item = rows[0];
  const ch = computeLayoutHash({ item, locale, imageCount });
  const blocks = flattenContentWithIds(item.content_i18n?.[locale] ?? null);
  const sampleOverride = { contentHash: ch, slides: [{ blocks: blocks.map((b) => b.id) }] };
  console.log(JSON.stringify({
    contentHash: ch,
    blockIds: blocks.map((b) => b.id),
    layoutVersion: computeLayoutVersion(sampleOverride),  // R3 [WARN-2] — DK-S1Bd needs this
    sampleOverride,
  }, null, 2));
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
```

**Smoke cases** (gegen disposable test-row):

- **DK-S1Ba**: `pnpm exec tsx scripts/compute-override-hashes.ts <id> de 0` ausführen → JSON-Output mit `contentHash` und `sampleOverride`. Insert override via psql:
  ```sql
  UPDATE agenda_items SET instagram_layout_i18n = jsonb_build_object(
    'de', jsonb_build_object('0', $sampleOverride::jsonb)
  ) WHERE id = $TEST_ID;
  ```
  Dann `curl -b "$SESSION_COOKIE" "$STAGING/api/dashboard/agenda/$TEST_ID/instagram-layout?locale=de&images=0"` → expected: `{"success":true,"mode":"manual","layoutVersion":"<16-char>",...}`.
- **DK-S1Bb**: Body-Edit nach manueller Override (psql `UPDATE agenda_items SET content_i18n = ... WHERE id=$TEST_ID`) → erneuter GET → expected: `{"mode":"stale","warnings":["layout_stale"]}`.
- **DK-S1Bc**: `curl -X DELETE -H "X-CSRF-Token: ..." "$STAGING/api/dashboard/agenda/$TEST_ID/instagram-layout?locale=de&images=0"` → 204. Verify via psql: `instagram_layout_i18n` ist NULL (Phase-2-collapse).
- **DK-S1Bd**: 2 parallele psql-Sessions starten Transaction + SELECT FOR UPDATE auf gleicher row. Trigger 2 parallel PUTs (curl &) mit identischem layoutVersion → erste PUT bekommt 200, zweite 412 `layout_modified_by_other`.

**Post-smoke cleanup**:
- DELETE des disposable test-rows: `DELETE FROM agenda_items WHERE title_i18n->>'de' LIKE 'S1B-SMOKE-DELETE-ME-%';`
- Verify pg_dump backup intakt (`ls -la /tmp/agenda_pre_s1b_smoke_*.sql`)

---

## Risk Surface

| Risiko | Mitigation |
|---|---|
| **md5-in-WHERE-CAS divergence** | Vermieden durch App-side SELECT FOR UPDATE + compare. Pattern-doc in `patterns/database-concurrency.md`. |
| **Lost-update via concurrent PUT** | SELECT FOR UPDATE serialisiert per-row. Test deckt parallel-PUT case ab. |
| **Phantom-Audit bei DELETE non-existent** | DELETE returnt 404 (NICHT idempotent-204) für nicht-existente agenda_id. auditLog wird NICHT für 404 aufgerufen. |
| **Orphan-Override (imageCount > available)** | GET surfaces `mode:"stale", warnings:["orphan_image_count"], slides:[]`. DELETE bleibt cap-frei (intentional asymmetry — orphan-cleanup muss möglich sein). |
| **DOS via MAX_BODY_IMAGE_COUNT** | Zod limit = 20, exposed const. Pre-pool.connect rejection. |
| **DOS via per-slide block-array** | Zod `.max(EXPORT_BLOCKS_HARD_CAP=200)` on each `slides[i].blocks`. Ohne cap könnte 256KB body ~10k IDs in einer slide carry → O(n) coverage-loop stress. |
| **Missing prod-deps** (`zod`, `tsx`, `dotenv`) | Implementation Order Step 0 installiert sie BEVOR irgendwas anderes implementiert wird. tsc würde sonst auf line 1 der route.ts failen, smoke-script würde nicht laufen. |
| **Backward-compat S1a routes** | Bestehende `instagram` metadata + `instagram-slide` PNG routes unverändert. S1b berührt sie NICHT (nur neuer route-file dazu). |
| **Audit-Detail-shape** | `auditLog` signature bereits in `src/lib/audit.ts` für `agenda_layout_update`/`reset` events declared (S0-extended). Alle Felder (`agenda_id`, `locale`, `image_count`, `slide_count`, `actor_email`, `ip`) sind in `AuditDetails` type. |
| **Stale staging-deploy DDL** | Schema-Spalte already live (S1a deploy). S1b adds keine neuen DB-Änderungen. |
| **`computeLayoutVersion` md5 vs sha256** | md5 intentional: not security-relevant, just optimistic-concurrency token. Inline-comment dokumentiert das. |
| **`projectAutoBlocksToSlides` GET-Pfad** | S1a hat es exposed aber NICHT konsumiert. S1b GET nutzt es zum ersten Mal — verifiziert dass die Funktion korrekt arbeitet (S1a-Tests decken bereits die Hauptfälle ab). |

**Blast Radius**: MEDIUM. Neue API-Route + audit-events + pattern-doc. Keine Schema-Änderungen, keine UI, keine bestehenden Routes verändert.

---

## Implementation Order

0. **Dependencies** (R6 [HIGH-1] + [HIGH-2]):
   - `pnpm add zod` — Routes-File braucht zod für Body-Validation. NICHT installiert in package.json.
   - `pnpm add -D tsx dotenv` — Smoke-Helper-Script braucht beide. NICHT installiert.
   - `mkdir scripts` — Verzeichnis existiert nicht. (Für DK-10.)
1. **`computeLayoutVersion` + Tests** (~3) in `src/lib/instagram-overrides.ts`/`.test.ts`
2. **`MAX_BODY_IMAGE_COUNT = 20` + `EXPORT_BLOCKS_HARD_CAP = 200`** exports in `src/lib/instagram-post.ts` (siehe Risk Surface — DOS-guard auf per-slide blocks-array).
3. **Routes-File** `/api/dashboard/agenda/[id]/instagram-layout/route.ts` — GET + PUT + DELETE
4. **Tests** für route-file — GET (~13) + PUT (~19) + DELETE (~10) + Integration (~2) = **~44** (plus Pure ~3 = ~47 gesamt)
5. **`scripts/compute-override-hashes.ts`** helper für staging-smoke
6. **Pattern-doc Update** — `patterns/database-concurrency.md` neuer Abschnitt
7. **`pnpm exec tsc --noEmit` + `pnpm build` + `pnpm test` + `pnpm audit --prod`** + commit
8. **Push → Staging-Deploy** (curl `/api/dashboard/agenda/[id]/instagram-layout?locale=de&images=0` als smoke)
9. **Manueller Staging-Smoke** (DK-S1Ba..d) gegen disposable test-row, post-smoke cleanup
10. **Codex PR-Review** (max 3 Runden — erwartet 1)
11. **Merge nach grünem Codex + post-merge Verifikation**

---

## Out of Scope (kommt in S2)

- Modal Layout-Tab UI mit dirty-detect, in-Modal-Confirm, refetchKey re-trigger, dashboardFetch, error-states
- User-facing manueller smoke aus Admin-Perspektive
- Drag-and-drop block reordering (Variante v3)
- Per-block-Visualisierung im Layout-Editor mit live-Preview-PNG-Cards
- Override-Audit-Log-Viewer (Audit-Entries werden geschrieben, kein UI-Reader im Sprint)

---

## Notes

- Source-Material:
  - `tasks/instagram-layout-overrides-s1b-outline.md` — Decisions + scope
  - `tasks/instagram-layout-overrides-spec-v3-reference.md` §API-Routen, §CAS-SQL, §Modal Layout-Mode (für context)
  - `tasks/instagram-layout-overrides-s1a-spec.md` — siblings + lessons (test-fixture patterns für hash-inline-computation, bundle-safety self-grep)
  - S1a PR #131 merged commit `745e623` — alle imports verfügbar
- Convergence-target: 1-2 Sonnet-Runden + 1 Codex-Spec-Eval. Erwartung: kleinerer Sprint als S1a (kein bundle-safety-split-decision, schon-bewährter Code-Stil aus S1a).
- AuditEvent enum + AuditDetails type bereits vorbereitet — kein audit.ts-Edit nötig.
