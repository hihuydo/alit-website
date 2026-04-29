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
  resolveImages,
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
  // INTENTIONAL: NO .min(1) on slides. Zod-level empty-array would fire
  // BEFORE the route can return the specific {error: "empty_layout"} body.
  // Empty-slides validation happens in the route handler. Same for .max() —
  // SLIDE_HARD_CAP wird im Handler gechecked damit der error-key
  // {error: "too_many_slides"} explizit ist.
  slides: z.array(
    z.object({
      // INTENTIONAL: NO .min(1) on blocks-array (siehe oben — empty-slide
      // gibt im handler `{error: "empty_slide"}` zurück, nicht generic Zod).
      // DOS-guard: cap blocks.length per-slide. Without this, a 256KB body
      // could carry ~10000 block-IDs in one slide and stress the coverage-
      // check Set construction.
      blocks: z.array(BlockIdSchema).max(EXPORT_BLOCKS_HARD_CAP),
    }),
  ),
});
type PutBody = z.infer<typeof PutBodySchema>;

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
    return NextResponse.json(
      { success: false, error: "image_count_too_large" },
      { status: 400 },
    );
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

    const availableImages = countAvailableImages(item);
    const isOrphan = imageCount > availableImages;

    const storedOverride =
      item.instagram_layout_i18n?.[locale]?.[String(imageCount)] ?? null;

    if (isOrphan) {
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

    let textSlides: Array<{
      index: number;
      blocks: { id: string; text: string; isHeading: boolean }[];
    }>;
    let tooManyBlocksForLayout = false;

    if (result.mode === "manual" && storedOverride) {
      // Manual: rekonstruiere aus storedOverride.slides — NICHT result.slides.
      // buildManualSlides nutzt splitOversizedBlock, das whole-blocks in
      // mehrere fragments mit derselben id splitten würde. Für S2 modal
      // (whole-block reorder/dirty-detect) muss 1 saved block = 1 returned
      // block sein.
      const exportBlocks = flattenContentWithIds(item.content_i18n?.[locale] ?? null);
      const blockMap = new Map<string, ExportBlock>(exportBlocks.map((b) => [b.id, b]));
      textSlides = storedOverride.slides.map((s, i) => ({
        index: i,
        blocks: s.blocks
          .map((bid) => blockMap.get(bid))
          .filter((b): b is ExportBlock => b !== undefined)
          .map((b) => ({ id: b.id, text: b.text, isHeading: b.isHeading })),
      }));
    } else {
      // Auto/stale: projectAutoBlocksToSlides arbeitet auf ExportBlock-Ebene
      // (whole blocks, IDs erhalten). hasGrid via resolver-output (das via
      // splitAgendaIntoSlides → resolveImages geht), nicht raw item.images.
      // Editor-cap = SLIDE_HARD_CAP-1 wenn grid-backed (renderer reserviert
      // 1 slot für grid), sonst SLIDE_HARD_CAP.
      const hasGridSlide = result.slides.some((s) => s.kind === "grid");
      const editorCap = hasGridSlide ? SLIDE_HARD_CAP - 1 : SLIDE_HARD_CAP;
      const exportBlocks = flattenContentWithIds(item.content_i18n?.[locale] ?? null);
      const autoGroups = projectAutoBlocksToSlides(item, locale, imageCount, exportBlocks);
      tooManyBlocksForLayout = autoGroups.length > editorCap;
      const cappedGroups = autoGroups.slice(0, editorCap);
      textSlides = cappedGroups.map((group, i) => ({
        index: i,
        blocks: group.map((b) => ({ id: b.id, text: b.text, isHeading: b.isHeading })),
      }));
    }

    const responseWarnings = [...(result.warnings ?? [])];
    if (tooManyBlocksForLayout) responseWarnings.push("too_many_blocks_for_layout");

    return NextResponse.json({
      success: true,
      mode: result.mode,
      contentHash: result.contentHash,
      layoutVersion,
      imageCount,
      availableImages,
      slides: textSlides,
      warnings: responseWarnings,
    });
  } catch (err) {
    return internalError("agenda/instagram-layout/GET", err);
  }
}

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

    // Grid-aware text-slide cap. Pre-pool Zod checked .max(SLIDE_HARD_CAP)=10,
    // but for grid-backed items (resolveImages > 0 AND imageCount >= 1) the
    // renderer reserves 1 slot for grid → text-cap is SLIDE_HARD_CAP-1 = 9.
    const wouldHaveGrid = resolveImages(item, validated.imageCount).length > 0;
    const maxTextSlides = wouldHaveGrid ? SLIDE_HARD_CAP - 1 : SLIDE_HARD_CAP;
    if (validated.slides.length > maxTextSlides) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { success: false, error: "too_many_slides_for_grid" },
        { status: 400 },
      );
    }

    const serverHash = computeLayoutHash({
      item,
      locale: validated.locale,
      imageCount: validated.imageCount,
    });
    if (serverHash !== validated.contentHash) {
      await client.query("ROLLBACK");
      return NextResponse.json({ success: false, error: "content_changed" }, { status: 409 });
    }

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
    for (const bid of requestedSet) {
      if (!exportIds.has(bid)) {
        await client.query("ROLLBACK");
        return NextResponse.json({ success: false, error: "unknown_block" }, { status: 422 });
      }
    }
    for (const eid of exportIds) {
      if (!requestedSet.has(eid)) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { success: false, error: "incomplete_layout" },
          { status: 422 },
        );
      }
    }

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
    // Pre-COMMIT actorResolve: ein throw beim Email-Lookup muss ROLLBACK
    // auslösen statt commit-then-500-leak (sonst: Row geschrieben, Client
    // bekommt 500, Retry triggert 412 obwohl der erste Write erfolgreich war).
    const actorEmail = await resolveActorEmail(auth.userId);
    await client.query("COMMIT");

    const newVersion = computeLayoutVersion(newOverride);
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

    // ASYMMETRY (intentional): GET + PUT prüfen isLocaleEmpty und returnen
    // 404 "locale_empty". DELETE prüft das BEWUSST NICHT — orphan-cleanup
    // nach locale-emptying muss möglich bleiben (admin löscht den FR-content,
    // vorher gespeicherte FR-Overrides müssen entfernbar sein).
    const sel = await client.query<{
      instagram_layout_i18n: InstagramLayoutOverrides | null;
    }>(
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

    // Phase 2 — collapse to NULL nur wenn alle locale-objects leer/null sind
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
    // Pre-COMMIT actorResolve (siehe PUT-comment).
    const actorEmail = await resolveActorEmail(auth.userId);
    await client.query("COMMIT");

    // INTENTIONAL: auditLog fires AUCH wenn der DELETE no-op war (Phase-1
    // rowCount=0). DELETE ist idempotent von Design; audit-trail soll User-
    // Intent abbilden, nicht DB-state-change. Verhindert auch Maskierung
    // von Burst-DELETE-Patterns (malicious "delete-all-overrides" via
    // repeated DELETEs auf gleichen key — audit-log zeigt das volle
    // Repeat-Pattern, auch wenn DB silently no-ops).
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
      } catch {
        // swallow — see PUT
      }
    }
    return internalError("agenda/instagram-layout/DELETE", err);
  } finally {
    client?.release();
  }
}
