import { describe, expect, it } from "vitest";
import { getClientIp } from "./client-ip";

describe("getClientIp", () => {
  it("returns X-Real-IP when present", () => {
    const h = new Headers({ "x-real-ip": "203.0.113.7" });
    expect(getClientIp(h)).toBe("203.0.113.7");
  });

  it("ignores X-Forwarded-For when X-Real-IP is absent (no fallback)", () => {
    const h = new Headers({ "x-forwarded-for": "203.0.113.7, 198.51.100.1" });
    expect(getClientIp(h)).toBe("unknown");
  });

  it("returns 'unknown' when both headers are absent", () => {
    const h = new Headers();
    expect(getClientIp(h)).toBe("unknown");
  });
});
