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
import { validateContent } from "@/lib/journal-validation";
import { isJournalInfoEmpty } from "@/lib/journal-info-shared";

// newsletter_signup_intro_i18n is a full-object write (see route.ts POST
// for rationale). Validator returns normalized value with empty-paragraphs
// collapsed to null, or a 400-worthy error string.
type NewsletterIntroI18n = { de: JournalContent | null; fr: JournalContent | null };

function validateNewsletterIntro(field: unknown): { ok: true; value: NewsletterIntroI18n | null } | { ok: false; error: string } {
  if (field === null) return { ok: true, value: null };
  if (typeof field !== "object" || Array.isArray(field)) {
    return { ok: false, error: "newsletter_signup_intro_i18n must be null or an object" };
  }
  const f = field as Record<string, unknown>;
  if (!("de" in f) || !("fr" in f)) {
    return { ok: false, error: "newsletter_signup_intro_i18n must contain both 'de' and 'fr' keys" };
  }
  for (const loc of ["de", "fr"] as const) {
    const v = f[loc];
    if (v === null) continue;
    if (!Array.isArray(v)) return { ok: false, error: `newsletter_signup_intro_i18n.${loc} must be null or an array` };
    const err = validateContent(v);
    if (err) return { ok: false, error: `newsletter_signup_intro_i18n.${loc}: ${err}` };
  }
  const normalized: NewsletterIntroI18n = {
    de: Array.isArray(f.de) && !isJournalInfoEmpty(f.de as JournalContent) ? (f.de as JournalContent) : null,
    fr: Array.isArray(f.fr) && !isJournalInfoEmpty(f.fr as JournalContent) ? (f.fr as JournalContent) : null,
  };
  // Empty-both collapses to column-null so the dict fallback engages without a
  // stored-empty-object lying in the JSONB.
  if (normalized.de === null && normalized.fr === null) {
    return { ok: true, value: null };
  }
  return { ok: true, value: normalized };
}

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
    newsletter_signup_intro_i18n?: unknown;
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

  const { slug_fr, title_i18n, kategorie_i18n, content_i18n, archived, sort_order, show_newsletter_signup, newsletter_signup_intro_i18n } = body;

  // Validate and normalize newsletter intro up-front — before collecting
  // SET clauses, so an invalid body never mutates the DB. undefined = skip
  // (preserve DB value). null/object = replace as a full-object write.
  let introSent = false;
  let introValueForDb: string | null = null;
  if ("newsletter_signup_intro_i18n" in body) {
    introSent = true;
    const check = validateNewsletterIntro(newsletter_signup_intro_i18n);
    if (!check.ok) {
      return NextResponse.json({ success: false, error: check.error }, { status: 400 });
    }
    introValueForDb = check.value === null ? null : JSON.stringify(check.value);
  }
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
  if (introSent) {
    setClauses.push(`newsletter_signup_intro_i18n = $${paramIndex++}`);
    values.push(introValueForDb);
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
  let oldIntroDeJson: string | null = null;
  let oldIntroFrJson: string | null = null;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [SLUG_WRITE_LOCK_ID]);

    // Snapshot current state for audit-logging. Always-snapshot newsletter
    // fields when they're sent so the audit only fires when a value actually
    // changed (no-op PUTs produce no audit noise). slug_fr uses the same
    // pattern (SEO-critical mutation — Sprint 5 follow-up).
    const needsNewsletterSnap = show_newsletter_signup !== undefined || introSent;
    if (slugFrSent || needsNewsletterSnap) {
      const { rows: snap } = await client.query<{
        slug_fr: string | null;
        slug_de: string;
        show_newsletter_signup: boolean;
        newsletter_signup_intro_i18n: { de?: JournalContent | null; fr?: JournalContent | null } | null;
      }>(
        `SELECT slug_fr, slug_de, show_newsletter_signup, newsletter_signup_intro_i18n FROM projekte WHERE id = $1`,
        [numId],
      );
      if (snap.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
      }
      oldSlugFr = snap[0].slug_fr;
      oldShowNewsletterSignup = snap[0].show_newsletter_signup;
      const snapIntro = snap[0].newsletter_signup_intro_i18n;
      oldIntroDeJson = snapIntro?.de != null ? JSON.stringify(snapIntro.de) : null;
      oldIntroFrJson = snapIntro?.fr != null ? JSON.stringify(snapIntro.fr) : null;

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

    // Audit-log newsletter-signup toggle / intro-text changes. Public
    // lead-capture surface mutation — promoted from Nice-to-Have by Codex
    // spec-review R1. Only emits when a value actually changed, no-op PUTs
    // stay silent. Change-detection: boolean direct compare, intro via
    // stringified JSON compare per locale (covers both null→content and
    // content→null transitions).
    const newIntroDeJson = rows[0].newsletter_signup_intro_i18n?.de != null
      ? JSON.stringify(rows[0].newsletter_signup_intro_i18n.de)
      : null;
    const newIntroFrJson = rows[0].newsletter_signup_intro_i18n?.fr != null
      ? JSON.stringify(rows[0].newsletter_signup_intro_i18n.fr)
      : null;
    const showChanged =
      show_newsletter_signup !== undefined &&
      oldShowNewsletterSignup !== null &&
      show_newsletter_signup !== oldShowNewsletterSignup;
    const introDeChanged = introSent && newIntroDeJson !== oldIntroDeJson;
    const introFrChanged = introSent && newIntroFrJson !== oldIntroFrJson;
    if (showChanged || introDeChanged || introFrChanged) {
      const actorEmail = await resolveActorEmail(auth.userId);
      auditLog("projekt_newsletter_signup_update", {
        ip: getClientIp(req.headers),
        actor_email: actorEmail,
        projekt_id: numId,
        show_newsletter_signup_changed: showChanged,
        intro_de_changed: introDeChanged,
        intro_fr_changed: introFrChanged,
        show_newsletter_signup_new: showChanged ? show_newsletter_signup : undefined,
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
