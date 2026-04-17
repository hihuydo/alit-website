import { describe, expect, it } from "vitest";
import { extractAuditEntity } from "./audit-entity";

describe("extractAuditEntity", () => {
  it("maps signup_delete for memberships", () => {
    expect(extractAuditEntity("signup_delete", { type: "memberships", row_id: 42 }))
      .toEqual({ entity_type: "memberships", entity_id: 42 });
  });

  it("maps signup_delete for newsletter", () => {
    expect(extractAuditEntity("signup_delete", { type: "newsletter", row_id: 7 }))
      .toEqual({ entity_type: "newsletter", entity_id: 7 });
  });

  it("maps membership_paid_toggle with row_id", () => {
    expect(extractAuditEntity("membership_paid_toggle", { row_id: 12, paid: true }))
      .toEqual({ entity_type: "memberships", entity_id: 12 });
  });

  it("returns admin/null for account_change", () => {
    expect(extractAuditEntity("account_change", { email: "a@b.ch" }))
      .toEqual({ entity_type: "admin", entity_id: null });
  });

  it("returns null/null for login_success", () => {
    expect(extractAuditEntity("login_success", { email: "a@b.ch", ip: "1.2.3.4" }))
      .toEqual({ entity_type: null, entity_id: null });
  });

  it("returns null/null for login_failure", () => {
    expect(extractAuditEntity("login_failure", { email: "a@b.ch", ip: "1.2.3.4", reason: "bad_password" }))
      .toEqual({ entity_type: null, entity_id: null });
  });

  it("returns null/null for logout", () => {
    expect(extractAuditEntity("logout", { email: "a@b.ch", ip: "1.2.3.4" }))
      .toEqual({ entity_type: null, entity_id: null });
  });

  it("returns null/null for rate_limit", () => {
    expect(extractAuditEntity("rate_limit", { ip: "1.2.3.4", reason: "login_attempt" }))
      .toEqual({ entity_type: null, entity_id: null });
  });

  it("returns null/null for unknown event (forward-compat)", () => {
    expect(extractAuditEntity("some_future_event", { foo: "bar" }))
      .toEqual({ entity_type: null, entity_id: null });
  });

  it("defensively handles missing row_id in signup_delete", () => {
    expect(extractAuditEntity("signup_delete", { type: "memberships" }))
      .toEqual({ entity_type: "memberships", entity_id: null });
  });

  it("defensively handles non-string type in signup_delete", () => {
    expect(extractAuditEntity("signup_delete", { type: 42, row_id: 1 }))
      .toEqual({ entity_type: null, entity_id: 1 });
  });

  it("defensively handles non-number row_id in membership_paid_toggle", () => {
    expect(extractAuditEntity("membership_paid_toggle", { row_id: "12", paid: true }))
      .toEqual({ entity_type: "memberships", entity_id: null });
  });

  it("maps password_rehashed to admin with user_id as entity_id", () => {
    expect(extractAuditEntity("password_rehashed", { user_id: 1, old_cost: 10, new_cost: 12, ip: "1.2.3.4" }))
      .toEqual({ entity_type: "admin", entity_id: 1 });
  });

  it("maps rehash_failed to admin with user_id as entity_id", () => {
    expect(extractAuditEntity("rehash_failed", { user_id: 1, ip: "1.2.3.4", reason: "DB outage" }))
      .toEqual({ entity_type: "admin", entity_id: 1 });
  });

  it("defensively handles missing user_id in password_rehashed", () => {
    expect(extractAuditEntity("password_rehashed", { old_cost: 10, new_cost: 12, ip: "1.2.3.4" }))
      .toEqual({ entity_type: "admin", entity_id: null });
  });
});
