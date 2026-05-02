import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireAuth, parseBody, internalError, validateId } from "@/lib/api-helpers";
import { hasLocale, type TranslatableField } from "@/lib/i18n-field";
import { validateSlug } from "@/lib/slug-validation";
import { SLUG_WRITE_LOCK_ID } from "@/lib/projekt-slug-lock";
import { auditLog } from "@/lib/audit";
import { resolveActorEmail } from "@/lib/signups-audit";
import { getClientIp } from "@/lib/client-ip";
import type { JournalContent } from "@/lib/journal-types";

type I18nString = TranslatableField<string>;
type I18nContent = TranslatableField<JournalContent>;

function validateI18nString(field: unknown, max: number): field is I18nString {
  if (field === undefined) return true;
  if (field === null) return false;
  if (typeof field !== "object") return false;
  const f = field as Record<string, unknown>;
  for (const key of Object.keys(f)) {
    if (key !== "de" && key !== "fr") return false;
    const v = f[key];
    if (v === null || v === undefined) continue;
    if (typeof v !== "string") return false;
    if (v.length > max) return false;
  }
  return true;
}

function validateI18nContent(field: unknown): field is I18nContent {
  if (field === undefined) return true;
  if (field === null) return false;
  if (typeof field !== "object") return false;
  const f = field as Record<string, unknown>;
  for (const key of Object.keys(f)) {
    if (key !== "de" && key !== "fr") return false;
    const v = f[key];
    if (v === null || v === undefined) continue;
    if (!Array.isArray(v)) return false;
  }
  return true;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const numId = validateId(id);
  if (!numId) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
  }
  try {
    const { rows } = await pool.query("SELECT * FROM projekte WHERE id = $1", [numId]);
    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      data: {
        ...rows[0],
        completion: { de: hasLocale(rows[0].content_i18n, "de"), fr: hasLocale(rows[0].content_i18n, "fr") },
      },
    });
  } catch (err) {
    return internalError("projekte/[id]/GET", err);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const numId = validateId(id);
  if (!numId) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
  }

  const body = await parseBody<{
    slug_de?: string;
    slug_fr?: string | null;
    title_i18n?: I18nString;
    kategorie_i18n?: I18nString;
    content_i18n?: I18nContent;
    archived?: boolean;
    sort_order?: number;
    show_newsletter_signup?: boolean;
  }>(req);

  if (!body) {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  // slug_de is IMMUTABLE after create (Sprint-5 invariant §1). It's the
  // stable internal ID that hashtag references in agenda/journal rely on.
  // Any PUT carrying slug_de is rejected — no silent drop, no partial apply.
  if ("slug_de" in body) {
    return NextResponse.json({ success: false, error: "slug_de is immutable after create" }, { status: 400 });
  }

  const { slug_fr, title_i18n, kategorie_i18n, content_i18n, archived, sort_order, show_newsletter_signup } = body;

  if (show_newsletter_signup !== undefined && typeof show_newsletter_signup !== "boolean") {
    return NextResponse.json({ success: false, error: "show_newsletter_signup must be boolean" }, { status: 400 });
  }

  // slug_fr partial-PUT semantics (spec §11):
  //   undefined  (key absent) → skip, preserve DB value
  //   null                    → clear the column
  //   string                  → must pass validateSlug
  const slugFrSent = "slug_fr" in body;
  let slugFrNormalized: string | null = null;
  if (slugFrSent && slug_fr !== null && slug_fr !== undefined) {
    if (!validateSlug(slug_fr)) {
      return NextResponse.json({ success: false, error: "slug_fr must be null or a valid slug (lowercase ASCII + hyphen, 1-100 chars)" }, { status: 400 });
    }
    slugFrNormalized = slug_fr;
  }
  if (!validateI18nString(title_i18n, 300)) {
    return NextResponse.json({ success: false, error: "Invalid title_i18n" }, { status: 400 });
  }
  if (!validateI18nString(kategorie_i18n, 200)) {
    return NextResponse.json({ success: false, error: "Invalid kategorie_i18n" }, { status: 400 });
  }
  if (!validateI18nContent(content_i18n)) {
    return NextResponse.json({ success: false, error: "Invalid content_i18n" }, { status: 400 });
  }

  // Build dynamic SET clauses. undefined = skip (preserve DB value),
  // value = SET value. For i18n fields we also mirror to legacy columns.
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (slugFrSent) {
    // slug_fr: null → SET NULL (clear), string → SET string. Already
    // validated above. `undefined` never reaches here.
    setClauses.push(`slug_fr = $${paramIndex++}`);
    values.push(slugFrNormalized);
  }
  if (title_i18n !== undefined) {
    setClauses.push(`title_i18n = $${paramIndex++}`);
    values.push(JSON.stringify(title_i18n));
  }
  if (kategorie_i18n !== undefined) {
    setClauses.push(`kategorie_i18n = $${paramIndex++}`);
    values.push(JSON.stringify(kategorie_i18n));
  }
  if (content_i18n !== undefined) {
    setClauses.push(`content_i18n = $${paramIndex++}`);
    values.push(JSON.stringify(content_i18n));
  }
  if (archived !== undefined) { setClauses.push(`archived = $${paramIndex++}`); values.push(archived); }
  if (sort_order !== undefined) { setClauses.push(`sort_order = $${paramIndex++}`); values.push(sort_order); }
  if (show_newsletter_signup !== undefined) {
    setClauses.push(`show_newsletter_signup = $${paramIndex++}`);
    values.push(show_newsletter_signup);
  }

  if (setClauses.length === 0) {
    return NextResponse.json({ success: false, error: "No fields to update" }, { status: 400 });
  }

  setClauses.push("updated_at = NOW()");
  values.push(numId);

  // When slug_fr is being set (string, not null), serialize pre-SELECT +
  // UPDATE under the same advisory lock as POST, so a concurrent POST
  // cannot race a new slug_de past our pre-check. For clear-only PUTs
  // (slug_fr = null) and non-slug PUTs, the lock is still cheap and
  // keeps the reasoning uniform.
  const client = await pool.connect();
  let oldSlugFr: string | null = null;
  let oldShowNewsletterSignup: boolean | null = null;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [SLUG_WRITE_LOCK_ID]);

    // Snapshot current state for audit-logging. Always-snapshot newsletter
    // fields when they're sent so the audit only fires when a value actually
    // changed (no-op PUTs produce no audit noise). slug_fr uses the same
    // pattern (SEO-critical mutation — Sprint 5 follow-up).
    const needsNewsletterSnap = show_newsletter_signup !== undefined;
    if (slugFrSent || needsNewsletterSnap) {
      const { rows: snap } = await client.query<{
        slug_fr: string | null;
        slug_de: string;
        show_newsletter_signup: boolean;
      }>(
        `SELECT slug_fr, slug_de, show_newsletter_signup FROM projekte WHERE id = $1`,
        [numId],
      );
      if (snap.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
      }
      oldSlugFr = snap[0].slug_fr;
      oldShowNewsletterSignup = snap[0].show_newsletter_signup;

      // Cross-column uniqueness for slug_fr on set (string, not null).
      // Excludes own row. Also enforces intra-row distinctness against
      // this projekt's own slug_de.
      if (slugFrNormalized !== null) {
        if (snap[0].slug_de === slugFrNormalized) {
          await client.query("ROLLBACK");
          return NextResponse.json({ success: false, error: "slug_fr must differ from slug_de of the same projekt" }, { status: 400 });
        }
        const collision = await client.query(
          `SELECT id FROM projekte
            WHERE id <> $1
              AND (slug_de = $2 OR slug_fr = $2)
            LIMIT 1`,
          [numId, slugFrNormalized],
        );
        if (collision.rowCount && collision.rowCount > 0) {
          await client.query("ROLLBACK");
          return NextResponse.json({ success: false, error: `slug_fr "${slugFrNormalized}" already used by another projekt` }, { status: 409 });
        }
      }
    }

    const { rows, rowCount } = await client.query(
      `UPDATE projekte SET ${setClauses.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
      values,
    );
    if (!rowCount) {
      await client.query("ROLLBACK");
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    await client.query("COMMIT");

    // Audit-log slug_fr mutations (SEO-critical, Sprint 5 follow-up).
    // Only emit if slug_fr was actually sent AND the value actually changed.
    // actor_email lookup is best-effort — failure must never block the
    // response; `auditLog` itself does stdout-first + fire-and-forget DB.
    if (slugFrSent && slugFrNormalized !== oldSlugFr) {
      const actorEmail = await resolveActorEmail(auth.userId);
      auditLog("slug_fr_change", {
        ip: getClientIp(req.headers),
        actor_email: actorEmail,
        projekt_id: numId,
        old_slug_fr: oldSlugFr,
        new_slug_fr: slugFrNormalized,
      });
    }

    // Audit-log newsletter-signup toggle. Public lead-capture surface
    // mutation. Only emits when the boolean actually changed, no-op PUTs
    // stay silent. Intro-text audit was dropped along with the per-projekt
    // intro field (intro now lives in dict.newsletter.intro via the
    // Submission-Texts editor, which has its own audit event).
    const showChanged =
      show_newsletter_signup !== undefined &&
      oldShowNewsletterSignup !== null &&
      show_newsletter_signup !== oldShowNewsletterSignup;
    if (showChanged) {
      const actorEmail = await resolveActorEmail(auth.userId);
      auditLog("projekt_newsletter_signup_update", {
        ip: getClientIp(req.headers),
        actor_email: actorEmail,
        projekt_id: numId,
        show_newsletter_signup_changed: showChanged,
        show_newsletter_signup_new: show_newsletter_signup,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        ...rows[0],
        completion: { de: hasLocale(rows[0].content_i18n, "de"), fr: hasLocale(rows[0].content_i18n, "fr") },
      },
    });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch { /* ignore */ }
    if (typeof err === "object" && err !== null && "code" in err && err.code === "23505") {
      return NextResponse.json({ success: false, error: "Slug already exists" }, { status: 409 });
    }
    return internalError("projekte/PUT", err);
  } finally {
    client.release();
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const numId = validateId(id);
  if (!numId) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
  }

  try {
    const { rowCount } = await pool.query("DELETE FROM projekte WHERE id = $1", [numId]);

    if (!rowCount) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return internalError("projekte/DELETE", err);
  }
}
