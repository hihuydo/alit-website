import { describe, it, expect } from "vitest";
import { isSafeUrl } from "./url-safety";

describe("isSafeUrl", () => {
  it.each([
    ["/foo/bar", true],
    ["#anchor", true],
    ["mailto:a@b.c", true],
    ["http://example.com", true],
    ["https://example.com/path?x=1", true],
    ["  https://example.com  ", true], // trimmed
    ["HTTPS://example.com", true],      // case-insensitive
  ])("accepts %s", (url, expected) => {
    expect(isSafeUrl(url)).toBe(expected);
  });

  it.each([
    ["javascript:alert(1)"],
    ["JAVASCRIPT:alert(1)"],
    ["data:text/html,<script>alert(1)</script>"],
    ["vbscript:msgbox(1)"],
    ["file:///etc/passwd"],
    ["about:blank"],
    [""],
    ["   "],
  ])("rejects %s", (url) => {
    expect(isSafeUrl(url)).toBe(false);
  });

  it.each([
    [null],
    [undefined],
    [123],
    [{}],
    [[]],
  ])("rejects non-string %p", (url) => {
    expect(isSafeUrl(url)).toBe(false);
  });
});
