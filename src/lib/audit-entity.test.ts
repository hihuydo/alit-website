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

  it("maps slug_fr_change to projekte with projekt_id as entity_id", () => {
    expect(
      extractAuditEntity("slug_fr_change", {
        projekt_id: 42,
        old_slug_fr: null,
        new_slug_fr: "mon-projet",
        ip: "1.2.3.4",
      }),
    ).toEqual({ entity_type: "projekte", entity_id: 42 });
  });

  it("defensively handles missing projekt_id in slug_fr_change", () => {
    expect(
      extractAuditEntity("slug_fr_change", { ip: "1.2.3.4" }),
    ).toEqual({ entity_type: "projekte", entity_id: null });
  });

  it("defensively handles non-number projekt_id in slug_fr_change", () => {
    expect(
      extractAuditEntity("slug_fr_change", { projekt_id: "42", ip: "1.2.3.4" }),
    ).toEqual({ entity_type: "projekte", entity_id: null });
  });

  it("maps projekt_newsletter_signup_update to projekte with projekt_id", () => {
    expect(
      extractAuditEntity("projekt_newsletter_signup_update", {
        projekt_id: 10,
        show_newsletter_signup_changed: true,
        show_newsletter_signup_new: true,
      }),
    ).toEqual({ entity_type: "projekte", entity_id: 10 });
  });

  it("defensively handles missing projekt_id in projekt_newsletter_signup_update", () => {
    expect(
      extractAuditEntity("projekt_newsletter_signup_update", { ip: "1.2.3.4" }),
    ).toEqual({ entity_type: "projekte", entity_id: null });
  });

  it("maps agenda_instagram_export to agenda_items with agenda_id as entity_id", () => {
    expect(
      extractAuditEntity("agenda_instagram_export", {
        agenda_id: 17,
        locale: "de",
        scale: "m",
        slide_count: 3,
        ip: "1.2.3.4",
      }),
    ).toEqual({ entity_type: "agenda_items", entity_id: 17 });
  });

  it("defensively handles missing agenda_id in agenda_instagram_export", () => {
    expect(
      extractAuditEntity("agenda_instagram_export", {
        locale: "de",
        scale: "m",
        ip: "1.2.3.4",
      }),
    ).toEqual({ entity_type: "agenda_items", entity_id: null });
  });

  it("defensively handles non-number agenda_id in agenda_instagram_export", () => {
    expect(
      extractAuditEntity("agenda_instagram_export", {
        agenda_id: "17",
        ip: "1.2.3.4",
      }),
    ).toEqual({ entity_type: "agenda_items", entity_id: null });
  });

  it("maps agenda_layout_update to agenda_items with agenda_id as entity_id", () => {
    expect(
      extractAuditEntity("agenda_layout_update", {
        agenda_id: 42,
        locale: "de",
        image_count: 2,
        ip: "1.2.3.4",
      }),
    ).toEqual({ entity_type: "agenda_items", entity_id: 42 });
  });

  it("maps agenda_layout_reset to agenda_items with agenda_id as entity_id", () => {
    expect(
      extractAuditEntity("agenda_layout_reset", {
        agenda_id: 42,
        locale: "fr",
        image_count: 0,
        ip: "1.2.3.4",
      }),
    ).toEqual({ entity_type: "agenda_items", entity_id: 42 });
  });

  it("defensively handles missing agenda_id in agenda_layout_update", () => {
    expect(
      extractAuditEntity("agenda_layout_update", { ip: "1.2.3.4" }),
    ).toEqual({ entity_type: "agenda_items", entity_id: null });
  });

  it("defensively handles missing agenda_id in agenda_layout_reset", () => {
    expect(
      extractAuditEntity("agenda_layout_reset", { ip: "1.2.3.4" }),
    ).toEqual({ entity_type: "agenda_items", entity_id: null });
  });
});
