import { describe, it, expect } from "vitest";
import { parseCost } from "./auth";

describe("parseCost", () => {
  it("extracts cost from $2b$ hash", () => {
    expect(parseCost("$2b$10$pRoKtyWlKneUYdzl7S6dU.foloRsLjZkBvLO46mpq8DopewjB51j.")).toBe(10);
  });

  it("extracts cost from $2a$ hash", () => {
    expect(parseCost("$2a$12$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012345678")).toBe(12);
  });

  it("extracts cost from $2y$ hash", () => {
    expect(parseCost("$2y$08$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012345678")).toBe(8);
  });

  it("returns null for argon2 hash (dollar-rich non-bcrypt)", () => {
    expect(parseCost("$argon2i$v=19$m=65536,t=3,p=4$saltsaltsaltsalt$somehashoutput")).toBeNull();
  });

  it("returns null for bcrypt hash with non-digit cost", () => {
    expect(parseCost("$2b$abc$pRoKtyWlKneUYdzl7S6dU.foloRsLjZkBvLO46mpq8DopewjB51j.")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseCost("")).toBeNull();
  });

  it("returns null for 1-digit cost segment", () => {
    expect(parseCost("$2b$1$pRoKtyWlKneUYdzl7S6dU.foloRsLjZkBvLO46mpq8DopewjB51j.")).toBeNull();
  });
});
