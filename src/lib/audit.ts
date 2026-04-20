/**
 * Structured audit log for auth + dashboard events.
 *
 * Writes to stdout (picked up by Docker logging driver) AND persists
 * to the `audit_events` table via fire-and-forget. Stdout is the first
 * source of truth — a DB failure (outage, schema mismatch) must never
 * block the caller. Dashboard queries read from the DB copy.
 */
import pool from "./db";
import { extractAuditEntity } from "./audit-entity";

type AuditEvent =
  | "login_success"
  | "login_failure"
  | "logout"
  | "rate_limit"
  | "account_change"
  | "signup_delete"
  | "membership_paid_toggle"
  | "password_rehashed"
  | "rehash_failed"
  | "slug_fr_change"
  | "agenda_instagram_export"
  | "projekt_newsletter_signup_update";

type AuditDetails = {
  ip: string;
  email?: string;
  reason?: string;
  actor_email?: string;
  type?: "memberships" | "newsletter";
  row_id?: number;
  paid?: boolean;
  user_id?: number;
  old_cost?: number;
  new_cost?: number;
  // slug_fr_change (SEO-critical mutation — Sprint 5 follow-up):
  // projekt_id identifies the mutated row; old/new carry null for clear/unset.
  projekt_id?: number;
  old_slug_fr?: string | null;
  new_slug_fr?: string | null;
  // agenda_instagram_export: type-level optional (shared AuditDetails across
  // events) but logically required — route parses + 400-gates params.id before
  // calling auditLog, so agenda_id is guaranteed a positive integer at call-site.
  agenda_id?: number;
  locale?: "de" | "fr";
  scale?: "s" | "m" | "l";
  slide_count?: number;
  // projekt_newsletter_signup_update: public lead-capture surface mutation —
  // flags which of the two fields actually changed so the audit page can
  // render a readable change-log without carrying full JSONB diffs.
  show_newsletter_signup_changed?: boolean;
  intro_de_changed?: boolean;
  intro_fr_changed?: boolean;
  show_newsletter_signup_new?: boolean;
};

async function persistAuditEvent(
  event: AuditEvent,
  details: AuditDetails,
  timestamp: string,
) {
  const { entity_type, entity_id } = extractAuditEntity(
    event,
    details as unknown as Record<string, unknown>,
  );
  await pool.query(
    `INSERT INTO audit_events
       (event, actor_email, entity_type, entity_id, details, ip, created_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
    [
      event,
      details.actor_email ?? details.email ?? null,
      entity_type,
      entity_id,
      JSON.stringify(details),
      details.ip ?? null,
      timestamp,
    ],
  );
}

export function auditLog(event: AuditEvent, details: AuditDetails) {
  const timestamp = new Date().toISOString();
  console.log(
    JSON.stringify({
      type: "audit",
      event,
      ...details,
      timestamp,
    }),
  );
  // Fire-and-forget DB persist. stdout remains canonical on DB outage.
  void persistAuditEvent(event, details, timestamp).catch((err) => {
    console.error("[audit] DB persist failed", { event, err: String(err) });
  });
}
