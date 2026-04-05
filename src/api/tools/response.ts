/**
 * Shared helper for building MCP tool responses.
 * Use instead of manually constructing `{ content: [{ type: 'text', text: JSON.stringify(...) }] }`.
 */

type Replacer = (key: string, value: unknown) => unknown;

/** Strip null values and empty arrays from JSON output */
export const cleanReplacer: Replacer = (_k, v) =>
  (v === null || (Array.isArray(v) && v.length === 0) ? undefined : v);

/** Strip empty arrays only */
export const stripEmptyArrays: Replacer = (_k, v) =>
  (Array.isArray(v) && v.length === 0 ? undefined : v);

/** Strip null values and empty arrays, but preserve the root object */
export const cleanListReplacer: Replacer = (k, v) =>
  (k !== '' && (v === null || (Array.isArray(v) && v.length === 0)) ? undefined : v);

/** Strip empty arrays only, but preserve the root object */
export const stripEmptyInList: Replacer = (k, v) =>
  (k !== '' && Array.isArray(v) && v.length === 0 ? undefined : v);

/** Strip null values only */
export const stripNulls: Replacer = (_k, v) => (v === null ? undefined : v);

/** Strip undefined and empty arrays */
export const stripUndefinedAndEmpty: Replacer = (_k, v) =>
  (v === undefined || (Array.isArray(v) && v.length === 0) ? undefined : v);

/** Return a JSON text response for an MCP tool */
export function toolJson(data: unknown, replacer?: Replacer) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, replacer, 2) }] };
}

/** Return a plain-text response for an MCP tool */
export function toolText(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

/** Return an error response for an MCP tool */
export function toolError(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true as const };
}
