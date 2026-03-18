import { getMimeType as lookupMime } from '@/lib/mime';

/** Extension → programming/markup language name. */
export const EXT_TO_LANGUAGE: Record<string, string> = {
  // JavaScript / TypeScript
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',

  // Web
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'sass',
  '.less': 'less',
  '.svg': 'svg',

  // Data / Config
  '.json': 'json',
  '.jsonc': 'json',
  '.json5': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.xml': 'xml',
  '.csv': 'csv',
  '.tsv': 'csv',
  '.ini': 'ini',
  '.env': 'dotenv',

  // Markdown / Docs
  '.md': 'markdown',
  '.mdx': 'markdown',
  '.rst': 'restructuredtext',
  '.txt': 'plaintext',

  // Shell
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  '.fish': 'shell',
  '.ps1': 'powershell',
  '.bat': 'batch',
  '.cmd': 'batch',

  // Python
  '.py': 'python',
  '.pyi': 'python',
  '.pyx': 'python',

  // Ruby
  '.rb': 'ruby',
  '.erb': 'ruby',

  // Go
  '.go': 'go',

  // Rust
  '.rs': 'rust',

  // Java / Kotlin / Scala
  '.java': 'java',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.scala': 'scala',

  // C / C++
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.hxx': 'cpp',

  // C#
  '.cs': 'csharp',

  // Swift / Objective-C
  '.swift': 'swift',
  '.m': 'objectivec',
  '.mm': 'objectivec',

  // PHP
  '.php': 'php',

  // SQL
  '.sql': 'sql',

  // Docker
  '.dockerfile': 'dockerfile',

  // GraphQL
  '.graphql': 'graphql',
  '.gql': 'graphql',

  // Protocol Buffers
  '.proto': 'protobuf',

  // Lua
  '.lua': 'lua',

  // R
  '.r': 'r',
  '.R': 'r',

  // Elixir / Erlang
  '.ex': 'elixir',
  '.exs': 'elixir',
  '.erl': 'erlang',

  // Haskell
  '.hs': 'haskell',

  // Dart
  '.dart': 'dart',

  // Zig
  '.zig': 'zig',
};

/** Look up language from file extension. Returns null if unknown. */
export function getLanguage(ext: string): string | null {
  return EXT_TO_LANGUAGE[ext.toLowerCase()] ?? null;
}

/** Look up MIME type from file extension via `mime` library. Returns null if unknown. */
export function getMimeType(ext: string): string | null {
  return lookupMime(ext);
}
