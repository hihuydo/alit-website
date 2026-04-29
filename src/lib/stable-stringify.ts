/** Recursive JSON.stringify with sorted object keys at every level.
 *  Always returns a string — `undefined` and `null` both map to `"null"` so
 *  the output is always valid JSON (avoids template-literal "undefined"
 *  poisoning of hash inputs).
 *
 *  CONTRACT: callers must pass plain JSON-serializable structures (literal
 *  objects, arrays, primitives, null, undefined). Class instances such as
 *  `Date`, `Map`, `Set`, RegExp etc. would be serialized as `{}` because
 *  `Object.keys(new Date())` returns `[]`. If a future hash payload ever
 *  needs to include a `Date`, convert via `.toISOString()` before passing.
 *  Used für content-hashing (deterministisch über Object-Order). */
export function stableStringify(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
    .join(",")}}`;
}
