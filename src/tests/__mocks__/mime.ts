// CJS mock for mime@4 (ESM-only package)
// Uses the same IANA-based logic: extension → MIME type lookup

const types: Record<string, string> = {
  'js': 'text/javascript',
  'jsx': 'text/javascript',
  'mjs': 'text/javascript',
  'cjs': 'text/javascript',
  'ts': 'text/typescript',
  'tsx': 'text/typescript',
  'mts': 'text/typescript',
  'cts': 'text/typescript',
  'html': 'text/html',
  'htm': 'text/html',
  'css': 'text/css',
  'json': 'application/json',
  'yaml': 'text/yaml',
  'yml': 'text/yaml',
  'xml': 'application/xml',
  'csv': 'text/csv',
  'md': 'text/markdown',
  'mdx': 'text/markdown',
  'txt': 'text/plain',
  'svg': 'image/svg+xml',
  'png': 'image/png',
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'gif': 'image/gif',
  'webp': 'image/webp',
  'pdf': 'application/pdf',
  'zip': 'application/zip',
  'wasm': 'application/wasm',
  'py': 'text/x-python',
  'sh': 'application/x-sh',
  'go': 'text/x-go',
  'rs': 'text/x-rust',
  'java': 'text/x-java-source',
  'rb': 'text/x-ruby',
  'php': 'text/x-php',
  'sql': 'application/sql',
  'toml': 'application/toml',
  'ini': 'text/plain',
  'env': 'text/plain',
  'map': 'application/json',
};

const mimeModule = {
  getType(extOrPath: string): string | null {
    // Strip leading dot and path components
    const ext = extOrPath.replace(/^.*\./, '').toLowerCase();
    return types[ext] ?? null;
  },
  getExtension(mimeType: string): string | null {
    for (const [ext, mime] of Object.entries(types)) {
      if (mime === mimeType) return ext;
    }
    return null;
  },
  // mime@2 compat (used by superagent)
  define(_map: Record<string, string[]>, _force?: boolean): void {},
  lookup(path: string): string | false {
    const ext = path.replace(/^.*\./, '').toLowerCase();
    return types[ext] ?? false;
  },
};

export default mimeModule;
// Also export as module.exports for CJS consumers (superagent uses require('mime'))
module.exports = mimeModule;
