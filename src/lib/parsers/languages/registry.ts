import path from 'path';
import type { LanguageMapper } from './types';

export { type LanguageMapper, type ExtractedSymbol, type ExtractedEdge, type ExtractedImport } from './types';

// web-tree-sitter types (loaded lazily)
type WTSLanguage = any;

interface LanguageEntry {
  /** WASM file name, e.g. 'tree-sitter-typescript.wasm' */
  wasmFile: string;
  /** Loaded Language instance (null until loadLanguage is called) */
  language: WTSLanguage | null;
  /** Mapper that extracts symbols, edges, imports from the AST */
  mapper: LanguageMapper;
}

/** Map from language name (matching file-lang.ts names) to entry. */
const languages = new Map<string, LanguageEntry>();

/** WASM directory containing grammar .wasm files */
const WASM_DIR = path.join(
  path.dirname(require.resolve('@vscode/tree-sitter-wasm/package.json')),
  'wasm',
);

let _initPromise: Promise<void> | null = null;

/** web-tree-sitter module (lazy loaded) */
let _wts: any = null;

/** Initialize the WASM parser runtime. Must be called before parsing. */
export async function initParser(): Promise<void> {
  if (_wts) return;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    _wts = require('web-tree-sitter');
    await _wts.Parser.init();
  })();

  return _initPromise;
}

/** Register a language (sync — only stores metadata). */
export function registerLanguage(name: string, wasmFile: string, mapper: LanguageMapper): void {
  languages.set(name, { wasmFile, language: null, mapper });
}

/** Load a language WASM if not already loaded. */
async function loadLanguage(entry: LanguageEntry): Promise<WTSLanguage> {
  if (entry.language) return entry.language;
  await initParser();
  const wasmPath = path.join(WASM_DIR, entry.wasmFile);
  entry.language = await _wts.Language.load(wasmPath);
  return entry.language;
}

/** Check if a language is registered. */
export function isLanguageSupported(languageName: string): boolean {
  return languages.has(languageName);
}

/** Reusable parser per language (avoids WASM memory leak from creating Parser on every call). */
const parsers = new Map<string, any>();

/** Parse source code with the appropriate language grammar. Returns tree (caller must call tree.delete() when done) or null. */
export async function parseSource(code: string, languageName: string): Promise<any | null> {
  const entry = languages.get(languageName);
  if (!entry) return null;

  await initParser();
  const lang = await loadLanguage(entry);
  let parser = parsers.get(languageName);
  if (!parser) {
    parser = new _wts.Parser();
    parser.setLanguage(lang);
    parsers.set(languageName, parser);
  }
  const tree = parser.parse(code);
  return tree ?? null;
}

/** Get the mapper for a language. Returns undefined for unsupported languages. */
export function getMapper(languageName: string): LanguageMapper | undefined {
  return languages.get(languageName)?.mapper;
}

/** List all registered language names. */
export function listLanguages(): string[] {
  return [...languages.keys()];
}
