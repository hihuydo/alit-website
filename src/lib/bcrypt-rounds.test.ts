import { describe, it, expect } from "vitest";
import {
  parseBcryptRounds,
  BCRYPT_ROUNDS_DEFAULT,
  BCRYPT_ROUNDS_MIN,
  BCRYPT_ROUNDS_MAX,
} from "./bcrypt-rounds";

describe("parseBcryptRounds", () => {
  it("returns default when input is undefined", () => {
    const { rounds, warning } = parseBcryptRounds(undefined);
    expect(rounds).toBe(BCRYPT_ROUNDS_DEFAULT);
    expect(warning).toBeNull();
  });

  it("returns default when input is empty or whitespace", () => {
    expect(parseBcryptRounds("")).toEqual({ rounds: BCRYPT_ROUNDS_DEFAULT, warning: null });
    expect(parseBcryptRounds("   ")).toEqual({ rounds: BCRYPT_ROUNDS_DEFAULT, warning: null });
  });

  it("returns valid integer in range without warning", () => {
    const { rounds, warning } = parseBcryptRounds("12");
    expect(rounds).toBe(12);
    expect(warning).toBeNull();
  });

  it("warns and defaults on non-integer input", () => {
    const { rounds, warning } = parseBcryptRounds("notanumber");
    expect(rounds).toBe(BCRYPT_ROUNDS_DEFAULT);
    expect(warning).toMatch(/not an integer/i);
  });

  it("warns and defaults on fractional input", () => {
    const { rounds, warning } = parseBcryptRounds("10.5");
    expect(rounds).toBe(BCRYPT_ROUNDS_DEFAULT);
    expect(warning).toMatch(/not an integer/i);
  });

  it("clamps below minimum", () => {
    const { rounds, warning } = parseBcryptRounds("3");
    expect(rounds).toBe(BCRYPT_ROUNDS_MIN);
    expect(warning).toMatch(/below minimum/i);
  });

  it("clamps above maximum", () => {
    const { rounds, warning } = parseBcryptRounds("20");
    expect(rounds).toBe(BCRYPT_ROUNDS_MAX);
    expect(warning).toMatch(/exceeds sanity maximum/i);
  });
});
