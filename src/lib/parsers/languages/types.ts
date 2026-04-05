import type { CodeNodeKind, CodeEdgeKind } from '@/lib/parsers/code-types';

/** A symbol extracted from a source file by a language mapper. */
export interface ExtractedSymbol {
  name: string;
  kind: CodeNodeKind;
  signature: string;
  docComment: string;
  body: string;
  startLine: number;   // 1-based
  endLine: number;      // 1-based
  isExported: boolean;
  /** Child symbols (e.g. methods inside a class). */
  children?: ExtractedSymbol[];
}

/** An edge between two symbols (extends, implements). */
export interface ExtractedEdge {
  fromName: string;
  toName: string;
  kind: CodeEdgeKind;
}

/** A relative import extracted from source code. */
export interface ExtractedImport {
  /** The raw module specifier string, e.g. './foo' or '../bar'. */
  specifier: string;
}

/** Language mapper interface — one per language. */
export interface LanguageMapper {
  /** Extract top-level symbols (with nested children) from a tree-sitter root node. */
  extractSymbols(rootNode: any): ExtractedSymbol[];
  /** Extract extends/implements edges from a tree-sitter root node. */
  extractEdges(rootNode: any): ExtractedEdge[];
  /** Extract relative import specifiers from a tree-sitter root node. */
  extractImports(rootNode: any): ExtractedImport[];
}
