import Parser from 'tree-sitter';
import type { LanguageMapper } from './types';

export { type LanguageMapper, type ExtractedSymbol, type ExtractedEdge, type ExtractedImport } from './types';

interface LanguageEntry {
  /** tree-sitter Language object */
  grammar: any;
  /** Mapper that extracts symbols, edges, imports from the AST */
  mapper: LanguageMapper;
}

/** Map from language name (matching file-lang.ts names) to entry. */
const languages = new Map<string, LanguageEntry>();

/** Shared parser instance — setLanguage() is cheap, no need for one per language. */
let _parser: Parser | undefined;

function getParser(): Parser {
  if (!_parser) _parser = new Parser();
  return _parser;
}

/** Register a language. Called at module load time by each language module. */
export function registerLanguage(name: string, grammar: any, mapper: LanguageMapper): void {
  languages.set(name, { grammar, mapper });
}

/** Get a registered language entry. Returns undefined for unsupported languages. */
export function getLanguageEntry(languageName: string): LanguageEntry | undefined {
  return languages.get(languageName);
}

/** Check if a language is supported. */
export function isLanguageSupported(languageName: string): boolean {
  return languages.has(languageName);
}

/** Parse source code with the appropriate language grammar. Returns root node or null. */
export function parseSource(code: string, languageName: string): any | null {
  const entry = languages.get(languageName);
  if (!entry) return null;

  const parser = getParser();
  parser.setLanguage(entry.grammar);
  const tree = parser.parse(code);
  return tree.rootNode;
}

/** Get the mapper for a language. Returns undefined for unsupported languages. */
export function getMapper(languageName: string): LanguageMapper | undefined {
  return languages.get(languageName)?.mapper;
}

/** List all registered language names. */
export function listLanguages(): string[] {
  return [...languages.keys()];
}
