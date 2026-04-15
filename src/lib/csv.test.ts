import { describe, it, expect } from "vitest";
import { toCsv } from "./csv";

const BOM = "\uFEFF";

describe("toCsv", () => {
  it("emits UTF-8 BOM + header + CRLF even when rows are empty", () => {
    const out = toCsv(["A", "B"], []);
    expect(out).toBe(`${BOM}A;B\r\n`);
  });

  it("joins rows with CRLF + trailing CRLF", () => {
    const out = toCsv(["a", "b"], [["1", "2"], ["3", "4"]]);
    expect(out).toBe(`${BOM}a;b\r\n1;2\r\n3;4\r\n`);
  });

  it("quotes cells containing the delimiter", () => {
    const out = toCsv(["x"], [["a;b"]]);
    expect(out).toBe(`${BOM}x\r\n"a;b"\r\n`);
  });

  it("quotes and escapes embedded quotes", () => {
    const out = toCsv(["x"], [[`say "hi"`]]);
    expect(out).toBe(`${BOM}x\r\n"say ""hi"""\r\n`);
  });

  it("quotes cells containing newlines", () => {
    const out = toCsv(["x"], [["line1\nline2"]]);
    expect(out).toBe(`${BOM}x\r\n"line1\nline2"\r\n`);
  });

  it("preserves umlauts as UTF-8 characters", () => {
    const out = toCsv(["name"], [["Müller"]]);
    expect(out).toContain("Müller");
  });

  it("handles null/undefined as empty string", () => {
    const out = toCsv(["a"], [[null], [undefined]]);
    expect(out).toBe(`${BOM}a\r\n\r\n\r\n`);
  });

  it("prefixes formula-leading cells with ' to defuse injection", () => {
    expect(toCsv(["x"], [["=1+1"]])).toBe(`${BOM}x\r\n'=1+1\r\n`);
    expect(toCsv(["x"], [["+CMD()"]])).toBe(`${BOM}x\r\n'+CMD()\r\n`);
    expect(toCsv(["x"], [["-2+3"]])).toBe(`${BOM}x\r\n'-2+3\r\n`);
    expect(toCsv(["x"], [["@SUM()"]])).toBe(`${BOM}x\r\n'@SUM()\r\n`);
  });

  it("neutralises formula when the cell also needs quoting", () => {
    const out = toCsv(["x"], [['=HYPERLINK("a;b")']]);
    expect(out).toBe(`${BOM}x\r\n"'=HYPERLINK(""a;b"")"\r\n`);
  });

  it("leaves safe values untouched even if they contain = later in the string", () => {
    expect(toCsv(["x"], [["foo=bar"]])).toBe(`${BOM}x\r\nfoo=bar\r\n`);
  });
});
