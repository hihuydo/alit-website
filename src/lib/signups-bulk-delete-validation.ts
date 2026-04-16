import { SIGNUPS_BULK_DELETE_MAX } from "./signups-limits";

export const SIGNUPS_TABLE: Record<string, "memberships" | "newsletter_subscribers"> = {
  memberships: "memberships",
  newsletter: "newsletter_subscribers",
};

export type BulkDeletePayload = {
  type: keyof typeof SIGNUPS_TABLE;
  ids: number[];
};

export type BulkDeleteValidation =
  | { valid: true; payload: BulkDeletePayload; table: "memberships" | "newsletter_subscribers" }
  | { valid: false; error: "invalid_input" };

/**
 * Pure validator for the bulk-delete request body. Extracted so the
 * validation contract can be unit-tested without mocking pool / session /
 * auth. Accepts `unknown` because upstream parses JSON; rejects anything
 * that isn't a plain object with a valid `type` allowlist entry and a
 * non-empty array of positive integer ids (capped at SIGNUPS_BULK_DELETE_MAX).
 */
export function validateBulkDeletePayload(body: unknown): BulkDeleteValidation {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { valid: false, error: "invalid_input" };
  }
  const { type, ids } = body as { type?: unknown; ids?: unknown };

  // Own-property check so prototype keys ("toString", "__proto__") never
  // slip through and produce a malformed SQL identifier downstream.
  if (typeof type !== "string" || !Object.hasOwn(SIGNUPS_TABLE, type)) {
    return { valid: false, error: "invalid_input" };
  }
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.length > SIGNUPS_BULK_DELETE_MAX ||
    !ids.every((n) => Number.isInteger(n) && (n as number) > 0)
  ) {
    return { valid: false, error: "invalid_input" };
  }

  return {
    valid: true,
    payload: { type: type as keyof typeof SIGNUPS_TABLE, ids: ids as number[] },
    table: SIGNUPS_TABLE[type],
  };
}
