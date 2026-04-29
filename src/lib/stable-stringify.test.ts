import { describe, expect, it } from "vitest";
import { stableStringify } from "./stable-stringify";

describe("stableStringify", () => {
  it("sorts object keys recursively for nested structures", () => {
    const a = stableStringify({ b: 1, a: { d: 2, c: 3 } });
    const b = stableStringify({ a: { c: 3, d: 2 }, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it("preserves array order and recurses on elements", () => {
    expect(stableStringify([{ b: 2, a: 1 }, { d: 4, c: 3 }])).toBe(
      '[{"a":1,"b":2},{"c":3,"d":4}]',
    );
    expect(stableStringify([3, 1, 2])).toBe("[3,1,2]");
  });

  it("handles primitives (string, number, boolean, null)", () => {
    expect(stableStringify("hi")).toBe('"hi"');
    expect(stableStringify(42)).toBe("42");
    expect(stableStringify(true)).toBe("true");
    expect(stableStringify(false)).toBe("false");
    expect(stableStringify(null)).toBe("null");
  });

  it("normalizes undefined to null (avoids hash-input poisoning)", () => {
    expect(stableStringify(undefined)).toBe("null");
    expect(stableStringify({ a: undefined, b: 1 })).toBe('{"a":null,"b":1}');
  });
});
