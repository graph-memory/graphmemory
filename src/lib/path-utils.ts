/**
 * Normalize a file path for embedding: split path separators and dots into spaces.
 * "src/lib/search/code.ts" → "src lib search code ts"
 *
 * This helps embedding models treat path segments as separate tokens
 * rather than one opaque string.
 */
export function normalizePathForEmbed(filePath: string): string {
  return filePath.replace(/[/\\]/g, ' ').replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
}
