import { describe, expect, test } from "vitest";
import { deriveEnv } from "./runtime-env";

describe("deriveEnv", () => {
  test("staging host → 'staging'", () => {
    expect(deriveEnv("https://staging.alit.hihuydo.com")).toBe("staging");
    expect(deriveEnv("https://staging.example.com/")).toBe("staging");
  });

  test("prod host → 'prod'", () => {
    expect(deriveEnv("https://alit.hihuydo.com")).toBe("prod");
    expect(deriveEnv("https://example.com/path")).toBe("prod");
  });

  test("missing / empty / whitespace → 'prod'", () => {
    expect(deriveEnv(undefined)).toBe("prod");
    expect(deriveEnv("")).toBe("prod");
    expect(deriveEnv("   ")).toBe("prod");
  });

  test("invalid URL → 'prod' (defensive fallback)", () => {
    expect(deriveEnv("not-a-url")).toBe("prod");
    expect(deriveEnv("://malformed")).toBe("prod");
  });

  test("hostname with 'staging' in middle but not prefix → 'prod'", () => {
    // Defensive: only prefix match, not substring
    expect(deriveEnv("https://app-staging-v2.example.com")).toBe("prod");
    expect(deriveEnv("https://mystaging.example.com")).toBe("prod");
  });
});
