export { registerLanguage, getLanguageEntry, isLanguageSupported, parseSource, getMapper, listLanguages } from './registry';
export type { LanguageMapper, ExtractedSymbol, ExtractedEdge, ExtractedImport } from './types';
export { registerTypescript } from './typescript';

// Auto-register built-in languages on import
import { registerTypescript } from './typescript';
registerTypescript();
