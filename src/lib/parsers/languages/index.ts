export { registerLanguage, isLanguageSupported, parseSource, getMapper, listLanguages, initParser } from './registry';
export type { LanguageMapper, ExtractedSymbol, ExtractedEdge, ExtractedImport } from './types';
export { registerTypescript } from './typescript';

// Auto-register built-in languages on import
import { registerTypescript } from './typescript';
registerTypescript();
