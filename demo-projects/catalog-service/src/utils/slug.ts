/**
 * URL-safe slug generation with deduplication and transliteration.
 * Used by products, categories, and any entity requiring human-readable URLs.
 *
 * @example
 * ```ts
 * generateSlug('Wireless Bluetooth Headphones') // => 'wireless-bluetooth-headphones'
 * generateSlug('Café Latte Mug', ['cafe-latte-mug']) // => 'cafe-latte-mug-2'
 * ```
 */

/** Common transliteration mappings for Latin-extended characters */
const TRANSLITERATION_MAP: Record<string, string> = {
  'a': 'a', 'e': 'e', 'i': 'i', 'o': 'o', 'u': 'u',
  'n': 'n', 'c': 'c', 'ss': 'ss', 'ae': 'ae', 'oe': 'oe', 'ue': 'ue',
};

/**
 * Transliterate common accented characters to ASCII equivalents.
 * Handles Latin diacritics used in product names across European languages.
 */
export function transliterate(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x00-\x7F]/g, char => {
      const lower = char.toLowerCase();
      return TRANSLITERATION_MAP[lower] ?? '';
    });
}

/**
 * Generate a URL-safe slug from a title string.
 * Applies transliteration, lowercasing, and character filtering.
 * Consecutive hyphens are collapsed and leading/trailing hyphens are trimmed.
 *
 * @param title - The source string to slugify
 * @param existingSlugs - Optional list of slugs to deduplicate against
 * @returns A unique, URL-safe slug string
 */
export function generateSlug(title: string, existingSlugs: string[] = []): string {
  let slug = transliterate(title)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (slug.length === 0) {
    slug = 'untitled';
  }

  // Truncate to a reasonable URL length
  if (slug.length > 80) {
    slug = slug.substring(0, 80).replace(/-$/, '');
  }

  return deduplicateSlug(slug, existingSlugs);
}

/**
 * Append a numeric suffix if the slug already exists in the provided list.
 * Tries `-2`, `-3`, etc. until a unique slug is found.
 */
export function deduplicateSlug(slug: string, existing: string[]): string {
  if (!existing.includes(slug)) return slug;

  let counter = 2;
  while (existing.includes(`${slug}-${counter}`)) {
    counter++;
  }
  return `${slug}-${counter}`;
}

/**
 * Extract the base slug without any deduplication suffix.
 * Useful for grouping related slugs (e.g., "blue-widget", "blue-widget-2").
 */
export function extractBaseSlug(slug: string): string {
  return slug.replace(/-\d+$/, '');
}
