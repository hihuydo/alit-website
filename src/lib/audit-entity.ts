/**
 * Map an audit event + its free-form details into (entity_type, entity_id)
 * so the `audit_events` DB row can be indexed + queried for per-row history
 * (e.g. "show all events for memberships.id = 42").
 *
 * Pure function, no I/O — unit-tested in ./audit-entity.test.ts.
 * Keep the mapping rules here so audit.ts stays a thin wrapper.
 */
export function extractAuditEntity(
  event: string,
  details: Record<string, unknown>,
): { entity_type: string | null; entity_id: number | null } {
  // signup_delete carries { type: "memberships" | "newsletter", row_id: number }
  if (event === "signup_delete") {
    const type = typeof details.type === "string" ? details.type : null;
    const rowId = typeof details.row_id === "number" ? details.row_id : null;
    return { entity_type: type, entity_id: rowId };
  }

  // membership_paid_toggle carries { row_id, paid } — entity is always memberships.
  if (event === "membership_paid_toggle") {
    const rowId = typeof details.row_id === "number" ? details.row_id : null;
    return { entity_type: "memberships", entity_id: rowId };
  }

  // Admin account changes (email/password) — actor is the admin itself.
  // We don't carry a stable row_id in the existing auditLog() call sites,
  // so entity_id stays null; the event is still grouped under "admin".
  if (event === "account_change") {
    return { entity_type: "admin", entity_id: null };
  }

  // Rehash-on-login events target a specific admin row. user_id is carried
  // in details so the audit row can be indexed by the admin's id for
  // deploy-gate queries ("rehash_failed since deploy_time").
  if (event === "password_rehashed" || event === "rehash_failed") {
    const userId = typeof details.user_id === "number" ? details.user_id : null;
    return { entity_type: "admin", entity_id: userId };
  }

  // slug_fr changes are SEO-sensitive — grouped under the projekte entity
  // so the audit page can show a per-projekt slug-history timeline.
  if (event === "slug_fr_change") {
    const projektId =
      typeof details.projekt_id === "number" ? details.projekt_id : null;
    return { entity_type: "projekte", entity_id: projektId };
  }

  // Newsletter-signup toggle / intro-text change on a projekt — public
  // lead-capture mutation, grouped under projekte for timeline queries.
  if (event === "projekt_newsletter_signup_update") {
    const projektId =
      typeof details.projekt_id === "number" ? details.projekt_id : null;
    return { entity_type: "projekte", entity_id: projektId };
  }

  // Instagram-export clicks target a specific agenda row — grouped under the
  // agenda_items entity so the audit page can show per-entry export history.
  // agenda_layout_update / agenda_layout_reset (Layout-Overrides Sprint S1)
  // share the same entity-mapping shape: details.agenda_id is the row id.
  if (
    event === "agenda_instagram_export" ||
    event === "agenda_layout_update" ||
    event === "agenda_layout_reset"
  ) {
    const agendaId =
      typeof details.agenda_id === "number" ? details.agenda_id : null;
    return { entity_type: "agenda_items", entity_id: agendaId };
  }

  // Submission-form-texts (Sprint M1): site-wide setting, no row-id. Group
  // under site_settings entity so the audit page can show a per-form/locale
  // change history filtered by entity_type + details.form.
  if (event === "submission_form_texts_update") {
    return { entity_type: "site_settings", entity_id: null };
  }

  // Auth + rate-limit events are session-scoped, not row-scoped.
  if (
    event === "login_success" ||
    event === "login_failure" ||
    event === "logout" ||
    event === "rate_limit"
  ) {
    return { entity_type: null, entity_id: null };
  }

  // Unknown event — still persist it (event column keeps the literal),
  // but without entity metadata. Fallback for forward-compat.
  return { entity_type: null, entity_id: null };
}
