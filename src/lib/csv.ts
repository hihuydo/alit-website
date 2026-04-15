// CSV with DE-locale defaults: UTF-8 BOM + ";" delimiter → Excel opens as
// tabular without an import dialog. Values that start with =/+/-/@/TAB/CR
// are prefixed with "'" to neutralise spreadsheet formula injection, since
// cells originate from public form input.

const BOM = "\uFEFF";
const DELIM = ";";
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

function escapeCell(raw: unknown): string {
  const s = raw == null ? "" : String(raw);
  const neutralised = FORMULA_TRIGGER.test(s) ? `'${s}` : s;
  const needsQuote = /[";\n\r]/.test(neutralised);
  if (!needsQuote) return neutralised;
  return `"${neutralised.replace(/"/g, '""')}"`;
}

export function toCsv(
  headers: readonly string[],
  rows: readonly (readonly unknown[])[],
): string {
  const head = headers.map(escapeCell).join(DELIM);
  const body = rows.map((r) => r.map(escapeCell).join(DELIM)).join("\r\n");
  return BOM + head + "\r\n" + body + (rows.length > 0 ? "\r\n" : "");
}
