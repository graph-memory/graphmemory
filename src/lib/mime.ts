import mimeTypes from 'mime-types';

/**
 * Custom MIME overrides for developer-oriented file types.
 * mime-types follows IANA strictly (e.g. .ts → video/mp2t),
 * but for a dev tool we want programming language MIME types.
 */
const DEV_OVERRIDES: Record<string, string> = {
  ts:   'text/typescript',
  tsx:  'text/typescript',
  mts:  'text/typescript',
  cts:  'text/typescript',
  jsx:  'text/javascript',
  mjs:  'text/javascript',
  cjs:  'text/javascript',
  vue:  'text/x-vue',
  svelte: 'text/x-svelte',
  rs:   'text/x-rust',
  go:   'text/x-go',
  rb:   'text/x-ruby',
  py:   'text/x-python',
  php:  'text/x-php',
  java: 'text/x-java-source',
  kt:   'text/x-kotlin',
  swift: 'text/x-swift',
  toml: 'application/toml',
  yaml: 'text/yaml',
  yml:  'text/yaml',
  mdx:  'text/markdown',
};

/**
 * Get MIME type for a file path or extension.
 * Checks dev overrides first, then falls back to mime-types (IANA).
 * Returns null if unknown.
 */
export function getMimeType(pathOrExt: string): string | null {
  const ext = pathOrExt.replace(/^.*\./, '').toLowerCase();
  if (DEV_OVERRIDES[ext]) return DEV_OVERRIDES[ext];
  return mimeTypes.lookup(pathOrExt) || null;
}
