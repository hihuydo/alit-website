import { describe, expect, it } from "vitest";
import { validateBulkDeletePayload } from "./signups-bulk-delete-validation";
import { SIGNUPS_BULK_DELETE_MAX } from "./signups-limits";

describe("validateBulkDeletePayload", () => {
  it("accepts a well-formed memberships payload", () => {
    const r = validateBulkDeletePayload({ type: "memberships", ids: [1, 2, 3] });
    expect(r.valid).toBe(true);
    if (r.valid) {
      expect(r.table).toBe("memberships");
      expect(r.payload.ids).toEqual([1, 2, 3]);
    }
  });

  it("accepts a well-formed newsletter payload and resolves its table", () => {
    const r = validateBulkDeletePayload({ type: "newsletter", ids: [42] });
    expect(r.valid).toBe(true);
    if (r.valid) {
      expect(r.table).toBe("newsletter_subscribers");
    }
  });

  it("rejects non-object bodies", () => {
    expect(validateBulkDeletePayload(null).valid).toBe(false);
    expect(validateBulkDeletePayload("x").valid).toBe(false);
    expect(validateBulkDeletePayload(42).valid).toBe(false);
    expect(validateBulkDeletePayload([{ type: "memberships", ids: [1] }]).valid).toBe(false);
  });

  it("rejects unknown type strings", () => {
    expect(validateBulkDeletePayload({ type: "admins", ids: [1] }).valid).toBe(false);
    expect(validateBulkDeletePayload({ type: "", ids: [1] }).valid).toBe(false);
  });

  it("rejects prototype-key types (toString, __proto__)", () => {
    // The object-in operator would accept these; Object.hasOwn must not.
    expect(validateBulkDeletePayload({ type: "toString", ids: [1] }).valid).toBe(false);
    expect(validateBulkDeletePayload({ type: "__proto__", ids: [1] }).valid).toBe(false);
    expect(validateBulkDeletePayload({ type: "hasOwnProperty", ids: [1] }).valid).toBe(false);
  });

  it("rejects missing or non-string type", () => {
    expect(validateBulkDeletePayload({ ids: [1] }).valid).toBe(false);
    expect(validateBulkDeletePayload({ type: 42, ids: [1] }).valid).toBe(false);
    expect(validateBulkDeletePayload({ type: null, ids: [1] }).valid).toBe(false);
  });

  it("rejects ids that isn't an array", () => {
    expect(validateBulkDeletePayload({ type: "memberships", ids: "1,2,3" }).valid).toBe(false);
    expect(validateBulkDeletePayload({ type: "memberships", ids: { 0: 1 } }).valid).toBe(false);
    expect(validateBulkDeletePayload({ type: "memberships" }).valid).toBe(false);
  });

  it("rejects an empty ids array", () => {
    expect(validateBulkDeletePayload({ type: "memberships", ids: [] }).valid).toBe(false);
  });

  it("rejects ids over the cap", () => {
    const tooMany = Array.from({ length: SIGNUPS_BULK_DELETE_MAX + 1 }, (_, i) => i + 1);
    expect(validateBulkDeletePayload({ type: "memberships", ids: tooMany }).valid).toBe(false);
    // Exactly at cap is still valid.
    const atCap = Array.from({ length: SIGNUPS_BULK_DELETE_MAX }, (_, i) => i + 1);
    expect(validateBulkDeletePayload({ type: "memberships", ids: atCap }).valid).toBe(true);
  });

  it("rejects non-integer ids", () => {
    expect(validateBulkDeletePayload({ type: "memberships", ids: [1.5] }).valid).toBe(false);
    expect(validateBulkDeletePayload({ type: "memberships", ids: ["1"] }).valid).toBe(false);
    expect(validateBulkDeletePayload({ type: "memberships", ids: [null] }).valid).toBe(false);
    expect(validateBulkDeletePayload({ type: "memberships", ids: [NaN] }).valid).toBe(false);
  });

  it("rejects zero and negative ids", () => {
    expect(validateBulkDeletePayload({ type: "memberships", ids: [0] }).valid).toBe(false);
    expect(validateBulkDeletePayload({ type: "memberships", ids: [-1] }).valid).toBe(false);
    expect(validateBulkDeletePayload({ type: "memberships", ids: [1, 2, 0] }).valid).toBe(false);
  });
});
