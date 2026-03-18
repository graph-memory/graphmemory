import fs from 'fs';
import path from 'path';
import type { CodeNodeAttributes, CodeEdgeAttributes } from '@/graphs/code-types';
import { parseSource, getMapper, isLanguageSupported } from '@/lib/parsers/languages';
import { getLanguage } from '@/graphs/file-lang';

export interface ParsedFile {
  fileId: string;
  mtime: number;
  nodes: Array<{ id: string; attrs: CodeNodeAttributes }>;
  edges: Array<{ from: string; to: string; attrs: CodeEdgeAttributes }>;
}

// ---------------------------------------------------------------------------
// Import resolution — replaces ts-morph's getModuleSpecifierSourceFile()
// ---------------------------------------------------------------------------

const RESOLVE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs'];

/** Resolve a relative import specifier to an absolute file path, or null. */
function resolveRelativeImport(fromFile: string, specifier: string): string | null {
  const dir = path.dirname(fromFile);
  const base = path.resolve(dir, specifier);

  // Exact match (e.g. './foo.ts')
  if (hasFile(base)) return base;

  // Try adding extensions (e.g. './foo' → './foo.ts')
  for (const ext of RESOLVE_EXTENSIONS) {
    const candidate = base + ext;
    if (hasFile(candidate)) return candidate;
  }

  // Try index files (e.g. './foo' → './foo/index.ts')
  for (const ext of RESOLVE_EXTENSIONS) {
    const candidate = path.join(base, 'index' + ext);
    if (hasFile(candidate)) return candidate;
  }

  return null;
}

function hasFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export function parseCodeFile(
  absolutePath: string,
  codeDir: string,
  mtime: number,
): ParsedFile {
  const fileId = path.relative(codeDir, absolutePath);

  // Determine language from file extension
  const ext = path.extname(absolutePath);
  const language = getLanguage(ext);

  if (!language || !isLanguageSupported(language)) {
    // Unsupported language — return file-only node, no symbols
    return {
      fileId,
      mtime,
      nodes: [{
        id: fileId,
        attrs: makeFileAttrs(fileId, '', '', 1, mtime),
      }],
      edges: [],
    };
  }

  const source = fs.readFileSync(absolutePath, 'utf-8');
  const rootNode = parseSource(source, language);

  if (!rootNode) {
    return {
      fileId,
      mtime,
      nodes: [{
        id: fileId,
        attrs: makeFileAttrs(fileId, '', '', 1, mtime),
      }],
      edges: [],
    };
  }

  const mapper = getMapper(language)!;
  const symbols = mapper.extractSymbols(rootNode);
  const edgeInfos = mapper.extractEdges(rootNode);
  const imports = mapper.extractImports(rootNode);

  const nodes: ParsedFile['nodes'] = [];
  const edges: ParsedFile['edges'] = [];
  const fileNodeId = fileId;

  // --- File root node ---
  const fileDocComment = extractFileDocComment(rootNode);
  const importSummary = buildImportSummary(rootNode);
  const lastLine = (rootNode.endPosition?.row ?? 0) + 1;

  nodes.push({
    id: fileNodeId,
    attrs: makeFileAttrs(fileId, fileDocComment, importSummary, lastLine, mtime),
  });

  // --- Symbols ---
  for (const sym of symbols) {
    if (!sym.name) continue;
    const symbolId = makeId(fileId, sym.name);

    nodes.push({
      id: symbolId,
      attrs: {
        kind: sym.kind,
        fileId,
        name: sym.name,
        signature: sym.signature,
        docComment: sym.docComment,
        body: sym.body,
        startLine: sym.startLine,
        endLine: sym.endLine,
        isExported: sym.isExported,
        embedding: [],
        fileEmbedding: [],
        mtime,
      },
    });
    edges.push({ from: fileNodeId, to: symbolId, attrs: { kind: 'contains' } });

    // Child symbols (e.g. methods)
    if (sym.children) {
      for (const child of sym.children) {
        if (!child.name) continue;
        const childId = makeId(fileId, sym.name, child.name);
        nodes.push({
          id: childId,
          attrs: {
            kind: child.kind,
            fileId,
            name: child.name,
            signature: child.signature,
            docComment: child.docComment,
            body: child.body,
            startLine: child.startLine,
            endLine: child.endLine,
            isExported: child.isExported,
            embedding: [],
            fileEmbedding: [],
            mtime,
          },
        });
        edges.push({ from: symbolId, to: childId, attrs: { kind: 'contains' } });
      }
    }
  }

  // --- Extends / implements edges ---
  for (const edge of edgeInfos) {
    const fromId = makeId(fileId, edge.fromName);
    const toId = makeId(fileId, edge.toName);
    edges.push({ from: fromId, to: toId, attrs: { kind: edge.kind } });
  }

  // --- Import edges: file → imported file ---
  for (const imp of imports) {
    const targetAbsolute = resolveRelativeImport(absolutePath, imp.specifier);
    if (!targetAbsolute || !targetAbsolute.startsWith(codeDir)) continue;

    const targetFileId = path.relative(codeDir, targetAbsolute);
    if (targetFileId !== fileNodeId) {
      edges.push({
        from: fileNodeId,
        to: targetFileId,
        attrs: { kind: 'imports' },
      });
    }
  }

  return { fileId, mtime, nodes, edges };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeId(fileId: string, ...parts: string[]): string {
  return [fileId, ...parts].join('::');
}

function makeFileAttrs(
  fileId: string,
  docComment: string,
  importSummary: string,
  lastLine: number,
  mtime: number,
): CodeNodeAttributes {
  return {
    kind: 'file',
    fileId,
    name: path.basename(fileId),
    signature: fileId,
    docComment,
    body: importSummary,
    startLine: 1,
    endLine: lastLine,
    isExported: false,
    embedding: [],
    fileEmbedding: [],
    mtime,
  };
}

/**
 * Extract the file-level doc comment (first JSDoc comment before any declaration).
 */
function extractFileDocComment(rootNode: any): string {
  for (const child of rootNode.children) {
    if (child.type === 'comment' && child.text.startsWith('/**')) {
      return child.text.trim();
    }
    // Stop at first non-comment node
    if (child.type !== 'comment') break;
  }
  return '';
}

/**
 * Build a summary of import statements.
 */
function buildImportSummary(rootNode: any): string {
  const imports: string[] = [];
  for (const child of rootNode.children) {
    if (child.type === 'import_statement') {
      imports.push(child.text.trim());
    }
  }
  return imports.join('\n');
}
