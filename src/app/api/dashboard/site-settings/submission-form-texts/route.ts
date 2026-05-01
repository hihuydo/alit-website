import { NextRequest, NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { z } from "zod";
import pool from "@/lib/db";
import { requireAuth, parseBody, internalError } from "@/lib/api-helpers";
import { auditLog } from "@/lib/audit";
import { getClientIp } from "@/lib/client-ip";
import { resolveActorEmail } from "@/lib/signups-audit";
import {
  LOCALES,
  MITGLIEDSCHAFT_EDITABLE_KEYS,
  NEWSLETTER_EDITABLE_KEYS,
  SUBMISSION_FORMS,
  type SubmissionForm,
} from "@/lib/submission-form-fields";
import { SUBMISSION_FORM_TEXTS_KEY } from "@/lib/submission-form-texts";

export const runtime = "nodejs";

// Build a per-form Zod schema from the editable-keys arrays so the schema
// stays in sync with the helper module. `.strict()` rejects unknown keys to
// keep admins from polluting the JSONB blob via a malformed client.
function buildFormSchema(keys: readonly string[]) {
  const shape: Record<string, z.ZodOptional<z.ZodString>> = {};
  for (const k of keys) shape[k] = z.string().optional();
  return z.object(shape).strict();
}

const MitgliedschaftSchema = buildFormSchema(MITGLIEDSCHAFT_EDITABLE_KEYS);
const NewsletterSchema = buildFormSchema(NEWSLETTER_EDITABLE_KEYS);

const DataSchema = z
  .object({
    mitgliedschaft: z
      .object({ de: MitgliedschaftSchema, fr: MitgliedschaftSchema })
      .strict(),
    newsletter: z
      .object({ de: NewsletterSchema, fr: NewsletterSchema })
      .strict(),
  })
  .strict();

const PutBodySchema = z
  .object({
    data: DataSchema,
    etag: z.union([z.string(), z.null()]),
  })
  .strict();

type StoredShape = z.infer<typeof DataSchema>;

const EMPTY_SHAPE: StoredShape = {
  mitgliedschaft: { de: {}, fr: {} },
  newsletter: { de: {}, fr: {} },
};

/**
 * Normalize whatever's in the DB row into the canonical 4-leaf shape so the
 * editor (and the GET caller) always sees `{mitgliedschaft:{de,fr}, newsletter:{de,fr}}`
 * even if a stale write only partially populated the JSONB.
 */
function normalizeStored(raw: string | null | undefined): StoredShape {
  if (typeof raw !== "string" || !raw.trim()) return cloneShape(EMPTY_SHAPE);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return cloneShape(EMPTY_SHAPE);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return cloneShape(EMPTY_SHAPE);
  }
  const out: StoredShape = cloneShape(EMPTY_SHAPE);
  const record = parsed as Record<string, unknown>;
  for (const form of SUBMISSION_FORMS) {
    const formNode = record[form];
    if (!formNode || typeof formNode !== "object" || Array.isArray(formNode)) continue;
    const formRecord = formNode as Record<string, unknown>;
    for (const locale of LOCALES) {
      const localeNode = formRecord[locale];
      if (!localeNode || typeof localeNode !== "object" || Array.isArray(localeNode)) continue;
      const editable = form === "mitgliedschaft" ? MITGLIEDSCHAFT_EDITABLE_KEYS : NEWSLETTER_EDITABLE_KEYS;
      const sourceRec = localeNode as Record<string, unknown>;
      const sink: Record<string, string> = {};
      for (const k of editable) {
        const v = sourceRec[k];
        if (typeof v === "string") sink[k] = v;
      }
      (out[form] as Record<string, Record<string, string>>)[locale] = sink;
    }
  }
  return out;
}

function cloneShape(shape: StoredShape): StoredShape {
  return {
    mitgliedschaft: { de: { ...shape.mitgliedschaft.de }, fr: { ...shape.mitgliedschaft.fr } },
    newsletter: { de: { ...shape.newsletter.de }, fr: { ...shape.newsletter.fr } },
  };
}

function diffChangedFields(
  pre: Record<string, string>,
  post: Record<string, string>,
  editableKeys: readonly string[],
): string[] {
  const changed: string[] = [];
  for (const k of editableKeys) {
    // `undefined`-vs-`""` consistency: both treated as "unset". Prevents
    // false-positive audit when pre-state lacked the key but post sends "".
    const a = pre[k] ?? "";
    const b = post[k] ?? "";
    if (a !== b) changed.push(k);
  }
  return changed;
}

// Etag is rendered server-side via to_char with microsecond precision so
// two commits within the same JS-Date-millisecond produce distinct etags
// (PG TIMESTAMPTZ has microsecond precision; JS Date.toISOString() truncates
// to ms — that round-trip lost the lower 3 digits, allowing a stale-client
// PUT to slip past the etag compare under back-to-back saves). Codex R2 [P2].
const ETAG_SQL_FRAGMENT =
  `to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { rows } = await pool.query<{ value: string | null; etag: string | null }>(
      `SELECT value, ${ETAG_SQL_FRAGMENT} AS etag FROM site_settings WHERE key = $1`,
      [SUBMISSION_FORM_TEXTS_KEY],
    );
    if (rows.length === 0) {
      return NextResponse.json({ success: true, data: cloneShape(EMPTY_SHAPE), etag: null });
    }
    const data = normalizeStored(rows[0].value);
    return NextResponse.json({ success: true, data, etag: rows[0].etag });
  } catch (err) {
    return internalError("site-settings/submission-form-texts/GET", err);
  }
}

export async function PUT(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const body = await parseBody<unknown>(req);
  if (!body) {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }
  const parsed = PutBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }
  const { data: incoming, etag: clientEtag } = parsed.data;

  let client: PoolClient | undefined;
  let preState: StoredShape;
  let postState: StoredShape;
  let newEtag: string;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    // Serialize concurrent writers on this settings key. SELECT FOR UPDATE
    // alone only locks EXISTING rows — when the row is absent (first save),
    // two transactions both see 0 rows + clientEtag null + pass the etag
    // compare, then race into ON CONFLICT DO UPDATE, with the second write
    // silently overwriting the first. The advisory lock fixes this by
    // serializing on the key regardless of row existence (Codex R2 [P1],
    // pattern: patterns/database-concurrency.md §pg_advisory_xact_lock).
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1)::bigint)",
      [SUBMISSION_FORM_TEXTS_KEY],
    );
    const { rows } = await client.query<{ value: string | null; etag: string | null }>(
      `SELECT value, ${ETAG_SQL_FRAGMENT} AS etag FROM site_settings WHERE key = $1 FOR UPDATE`,
      [SUBMISSION_FORM_TEXTS_KEY],
    );
    const dbEtag = rows.length > 0 ? rows[0].etag : null;
    if (dbEtag !== clientEtag) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { success: false, error: "stale_etag", code: "stale_etag" },
        { status: 409 },
      );
    }
    preState = rows.length === 0 ? cloneShape(EMPTY_SHAPE) : normalizeStored(rows[0].value);
    // Re-normalize incoming so partial leaf-objects coerce to the canonical
    // shape (and any string-coercion edges are uniform with pre-state).
    postState = normalizeStored(JSON.stringify(incoming));
    const upsert = await client.query<{ etag: string }>(
      `INSERT INTO site_settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_at = NOW()
       RETURNING ${ETAG_SQL_FRAGMENT} AS etag`,
      [SUBMISSION_FORM_TEXTS_KEY, JSON.stringify(postState)],
    );
    await client.query("COMMIT");
    newEtag = upsert.rows[0].etag;
  } catch (err) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // ROLLBACK on a broken connection is fine to swallow — release() handles cleanup.
      }
    }
    return internalError("site-settings/submission-form-texts/PUT", err);
  } finally {
    client?.release();
  }

  // Audit emit AFTER commit — fire-and-forget so a stdout/DB persist failure
  // does not roll back the user-visible save.
  const ip = getClientIp(req.headers);
  const actorEmail = await resolveActorEmail(auth.userId);
  for (const form of SUBMISSION_FORMS) {
    const editable = form === "mitgliedschaft" ? MITGLIEDSCHAFT_EDITABLE_KEYS : NEWSLETTER_EDITABLE_KEYS;
    for (const locale of LOCALES) {
      const pre = (preState[form] as Record<string, Record<string, string>>)[locale];
      const post = (postState[form] as Record<string, Record<string, string>>)[locale];
      const changed = diffChangedFields(pre, post, editable);
      if (changed.length === 0) continue;
      auditLog("submission_form_texts_update", {
        ip,
        actor_email: actorEmail ?? undefined,
        form: form as SubmissionForm,
        locale,
        changed_fields: changed,
      });
    }
  }

  return NextResponse.json({ success: true, data: postState, etag: newEtag });
}
