import { describe, expect, it } from "vitest";
import { assertMinLengthEnv } from "./env-guards";

describe("assertMinLengthEnv", () => {
  it("T1: throws with name + minLength + purpose when value is undefined", () => {
    expect(() =>
      assertMinLengthEnv("JWT_SECRET", undefined, 32, "JWT sign/verify"),
    ).toThrow(/JWT_SECRET/);
    expect(() =>
      assertMinLengthEnv("JWT_SECRET", undefined, 32, "JWT sign/verify"),
    ).toThrow(/32/);
    expect(() =>
      assertMinLengthEnv("JWT_SECRET", undefined, 32, "JWT sign/verify"),
    ).toThrow(/JWT sign\/verify/);
  });

  it("T2: throws when value is empty string", () => {
    expect(() =>
      assertMinLengthEnv("JWT_SECRET", "", 32, "JWT sign/verify"),
    ).toThrow(/JWT_SECRET/);
  });

  it("T3: throws when value is whitespace-only (trim defeats CI/CD \\n leak)", () => {
    expect(() =>
      assertMinLengthEnv("JWT_SECRET", "   ", 32, "JWT sign/verify"),
    ).toThrow(/JWT_SECRET/);
    expect(() =>
      assertMinLengthEnv("JWT_SECRET", "\n\t  \n", 32, "JWT sign/verify"),
    ).toThrow(/JWT_SECRET/);
  });

  it("T4: throws when trimmed value is below minLength", () => {
    expect(() =>
      assertMinLengthEnv("JWT_SECRET", "a".repeat(31), 32, "JWT sign/verify"),
    ).toThrow(/32/);
    // Trim-aware: surrounding whitespace doesn't count toward length.
    expect(() =>
      assertMinLengthEnv(
        "JWT_SECRET",
        "  " + "a".repeat(30) + "  ",
        32,
        "JWT sign/verify",
      ),
    ).toThrow(/32/);
  });

  it("T5: does NOT throw at boundary (length === minLength)", () => {
    expect(() =>
      assertMinLengthEnv("JWT_SECRET", "a".repeat(32), 32, "JWT sign/verify"),
    ).not.toThrow();
  });

  it("T6: does NOT throw when length > minLength", () => {
    expect(() =>
      assertMinLengthEnv("JWT_SECRET", "a".repeat(64), 32, "JWT sign/verify"),
    ).not.toThrow();
    expect(() =>
      assertMinLengthEnv("X", "a".repeat(100), 16, "DSGVO IP-hashing"),
    ).not.toThrow();
  });
});
