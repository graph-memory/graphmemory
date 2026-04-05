import fs from 'fs';
import path from 'path';
import type { CodeNodeAttributes, CodeEdgeAttributes } from '@/lib/parsers/code-types';
import { parseSource, getMapper, isLanguageSupported } from '@/lib/parsers/languages';
import { getLanguage } from '@/lib/file-lang';

// Strip line and block comments from JSONC, preserving string contents.
function stripJsoncComments(text: string): string {
  let result = '';
  let i = 0;
  while (i < text.length) {
    // String literal — copy verbatim
    if (text[i] === '"') {
      const start = i++;
      while (i < text.length && text[i] !== '"') {
        if (text[i] === '\\') i++; // skip escaped char
        i++;
      }
      i++; // closing quote
      result += text.slice(start, i);
    // Line comment
    } else if (text[i] === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
    // Block comment
    } else if (text[i] === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i += 2;
    } else {
      result += text[i++];
    }
  }
  return result;
}

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

function hasFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/** Try resolving a base path with extensions and index files. */
function tryResolve(base: string): string | null {
  if (hasFile(base)) return base;
  for (const ext of RESOLVE_EXTENSIONS) {
    if (hasFile(base + ext)) return base + ext;
  }
  for (const ext of RESOLVE_EXTENSIONS) {
    const idx = path.join(base, 'index' + ext);
    if (hasFile(idx)) return idx;
  }
  return null;
}

/** Resolve a relative import specifier to an absolute file path, or null. */
function resolveRelativeImport(fromFile: string, specifier: string): string | null {
  const dir = path.dirname(fromFile);
  return tryResolve(path.resolve(dir, specifier));
}

// ---------------------------------------------------------------------------
// tsconfig path alias resolution
// ---------------------------------------------------------------------------

interface PathMapping {
  prefix: string;  // e.g. "@/" or "@utils/"
  targets: string[]; // absolute directory paths to try
}

/** Cache: directory → parsed path mappings (null = no tsconfig found up to root). */
const _pathMappings = new Map<string, PathMapping[] | null>();

/** Clear cached path mappings (call between projects or on config change). */
export function clearPathMappingsCache(): void { _pathMappings.clear(); }

/**
 * Find the nearest tsconfig.json / jsconfig.json walking up from `dir` to `root`.
 * Cached per directory — each directory remembers its resolved mappings.
 */
function findPathMappings(dir: string, root: string): PathMapping[] | null {
  if (_pathMappings.has(dir)) return _pathMappings.get(dir)!;

  // Try this directory
  const result = _parseTsConfig(dir);
  if (result) {
    _pathMappings.set(dir, result);
    return result;
  }

  // Walk up unless we've reached the project root
  const parent = path.dirname(dir);
  if (dir === root || parent === dir) {
    _pathMappings.set(dir, null);
    return null;
  }

  const parentResult = findPathMappings(parent, root);
  _pathMappings.set(dir, parentResult);
  return parentResult;
}

function _parseTsConfig(dir: string): PathMapping[] | null {
  for (const name of ['tsconfig.json', 'jsconfig.json']) {
    const configPath = path.join(dir, name);
    if (!hasFile(configPath)) continue;

    try {
      // Strip JSONC comments while preserving string contents
      const raw = stripJsoncComments(fs.readFileSync(configPath, 'utf-8'));
      const config = JSON.parse(raw);
      const compilerOptions = config.compilerOptions;
      if (!compilerOptions?.paths) continue;

      const baseUrl = compilerOptions.baseUrl
        ? path.resolve(dir, compilerOptions.baseUrl)
        : dir;

      const mappings: PathMapping[] = [];
      for (const [pattern, targets] of Object.entries<string[]>(compilerOptions.paths)) {
        // Pattern like "@/*" → prefix "@/", or "utils/*" → prefix "utils/"
        const prefix = pattern.endsWith('/*') ? pattern.slice(0, -1) : pattern;
        const resolvedTargets = (targets as string[])
          .map(t => {
            const target = t.endsWith('/*') ? t.slice(0, -1) : t;
            return path.resolve(baseUrl, target);
          });
        mappings.push({ prefix, targets: resolvedTargets });
      }

      if (mappings.length > 0) return mappings;
    } catch {
      // Malformed config — skip
    }
  }
  return null;
}

/** Resolve a path-aliased import (e.g. @/lib/foo) using nearest tsconfig paths. */
function resolveAliasImport(specifier: string, fromFile: string, projectDir: string): string | null {
  const fileDir = path.dirname(fromFile);
  const mappings = findPathMappings(fileDir, projectDir);
  if (!mappings) return null;

  for (const mapping of mappings) {
    if (specifier.startsWith(mapping.prefix)) {
      const rest = specifier.slice(mapping.prefix.length);
      for (const targetDir of mapping.targets) {
        const resolved = tryResolve(path.join(targetDir, rest));
        if (resolved) return resolved;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export async function parseCodeFile(
  absolutePath: string,
  codeDir: string,
  mtime: number,
): Promise<ParsedFile> {
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
  const tree = await parseSource(source, language);

  if (!tree) {
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

  const rootNode = tree.rootNode;
  const mapper = getMapper(language)!;
  let symbols, edgeInfos, imports, fileDocComment, importSummary, lastLine;
  try {
    symbols = mapper.extractSymbols(rootNode);
    edgeInfos = mapper.extractEdges(rootNode);
    imports = mapper.extractImports(rootNode);
    fileDocComment = extractFileDocComment(rootNode);
    importSummary = buildImportSummary(rootNode);
    lastLine = (rootNode.endPosition?.row ?? 0) + 1;
  } finally {
    tree.delete();
  }

  const nodes: ParsedFile['nodes'] = [];
  const edges: ParsedFile['edges'] = [];
  const fileNodeId = fileId;

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
    let targetAbsolute: string | null = null;

    if (imp.specifier.startsWith('./') || imp.specifier.startsWith('../')) {
      // Relative import
      targetAbsolute = resolveRelativeImport(absolutePath, imp.specifier);
    } else {
      // Try path alias resolution (e.g. @/lib/foo, ~/utils)
      targetAbsolute = resolveAliasImport(imp.specifier, absolutePath, codeDir);
    }

    if (!targetAbsolute) continue;
    const targetFileId = path.relative(codeDir, targetAbsolute);
    if (targetFileId.startsWith('..') || path.isAbsolute(targetFileId)) continue;

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
