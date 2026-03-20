import { parseSource, getMapper, isLanguageSupported } from '@/lib/parsers/languages';

/** Map of common code fence language tags to language names used by the registry. */
const TAG_TO_LANGUAGE: Record<string, string> = {
  ts: 'typescript',
  typescript: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  javascript: 'javascript',
  jsx: 'javascript',
};

/**
 * Extract top-level symbol names from a code block using tree-sitter.
 * Returns [] for unsupported languages or on parse failure.
 */
export async function extractSymbols(code: string, language: string): Promise<string[]> {
  const lang = TAG_TO_LANGUAGE[language.toLowerCase()];
  if (!lang || !isLanguageSupported(lang)) return [];

  try {
    const tree = await parseSource(code, lang);
    if (!tree) return [];

    try {
      const mapper = getMapper(lang)!;
      const symbols = mapper.extractSymbols(tree.rootNode);
      return symbols.map(s => s.name).filter(Boolean);
    } finally {
      tree.delete();
    }
  } catch {
    return [];
  }
}
