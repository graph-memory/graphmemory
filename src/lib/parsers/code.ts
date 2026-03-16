import path from 'path';
import { Project, SourceFile, Node, SyntaxKind } from 'ts-morph';
import type { CodeNodeAttributes, CodeEdgeAttributes, CodeNodeKind } from '@/graphs/code-types';

export interface ParsedFile {
  fileId: string;
  mtime: number;
  nodes: Array<{ id: string; attrs: CodeNodeAttributes }>;
  edges: Array<{ from: string; to: string; attrs: CodeEdgeAttributes }>;
}

// Shared Project instance — reused across calls to avoid re-parsing tsconfig
let _project: Project | null = null;

export function getProject(codeDir: string, tsconfig?: string): Project {
  if (_project) return _project;

  const tsconfigPath = tsconfig ?? path.join(codeDir, 'tsconfig.json');

  try {
    _project = new Project({
      tsConfigFilePath: tsconfigPath,
      skipAddingFilesFromTsConfig: true, // we add files manually
      skipFileDependencyResolution: false,
    });
  } catch {
    // No tsconfig — use minimal compiler options
    _project = new Project({
      compilerOptions: { allowJs: true, strict: false },
      skipFileDependencyResolution: true,
    });
  }

  return _project;
}

/** Reset the shared project (needed when codeDir changes between calls). */
export function resetProject(): void {
  _project = null;
}

export function parseCodeFile(
  absolutePath: string,
  codeDir: string,
  mtime: number,
  project: Project,
): ParsedFile {
  const fileId = path.relative(codeDir, absolutePath);

  // Add or refresh the source file in the project
  let sourceFile: SourceFile | undefined = project.getSourceFile(absolutePath);
  if (sourceFile) {
    sourceFile.refreshFromFileSystemSync();
  } else {
    sourceFile = project.addSourceFileAtPath(absolutePath);
  }

  const nodes: ParsedFile['nodes'] = [];
  const edges: ParsedFile['edges'] = [];
  const fileNodeId = fileId;

  // --- File root node ---
  const fileDocComment = extractFileDocComment(sourceFile);
  const importSummary = buildImportSummary(sourceFile);
  nodes.push({
    id: fileNodeId,
    attrs: {
      kind: 'file',
      fileId,
      name: path.basename(fileId),
      signature: fileId,
      docComment: fileDocComment,
      body: importSummary,
      startLine: 1,
      endLine: sourceFile.getEndLineNumber(),
      isExported: false,
      embedding: [],
      fileEmbedding: [],
      mtime,
    },
  });

  // --- Top-level declarations ---
  for (const decl of sourceFile.getStatements()) {
    processStatement(decl, fileId, fileNodeId, mtime, nodes, edges);
  }

  // --- Import edges: file → imported file ---
  for (const imp of sourceFile.getImportDeclarations()) {
    const moduleSpecifier = imp.getModuleSpecifierValue();
    if (!isRelative(moduleSpecifier)) continue;

    const resolved = imp.getModuleSpecifierSourceFile();
    if (!resolved) continue;

    const targetAbsolute = resolved.getFilePath();
    if (!targetAbsolute.startsWith(codeDir)) continue;

    const targetFileId = path.relative(codeDir, targetAbsolute);
    const targetNodeId = targetFileId;

    if (targetNodeId !== fileNodeId) {
      edges.push({
        from: fileNodeId,
        to: targetNodeId,
        attrs: { kind: 'imports' },
      });
    }
  }

  return { fileId, mtime, nodes, edges };
}

// ---------------------------------------------------------------------------
// Statement processing
// ---------------------------------------------------------------------------

function processStatement(
  node: Node,
  fileId: string,
  parentId: string,
  mtime: number,
  nodes: ParsedFile['nodes'],
  edges: ParsedFile['edges'],
): void {
  // Function declarations
  if (Node.isFunctionDeclaration(node)) {
    const name = node.getName();
    if (!name) return;
    const id = makeId(fileId, name);
    nodes.push({ id, attrs: buildAttrs('function', fileId, name, node, mtime) });
    edges.push({ from: parentId, to: id, attrs: { kind: 'contains' } });
    return;
  }

  // Class declarations
  if (Node.isClassDeclaration(node)) {
    const name = node.getName();
    if (!name) return;
    const id = makeId(fileId, name);
    nodes.push({ id, attrs: buildAttrs('class', fileId, name, node, mtime) });
    edges.push({ from: parentId, to: id, attrs: { kind: 'contains' } });

    // extends
    const base = node.getBaseClass();
    if (base) {
      const baseName = base.getName?.() ?? base.getSymbol()?.getName();
      if (baseName) {
        edges.push({ from: id, to: makeId(fileId, baseName), attrs: { kind: 'extends' } });
      }
    }

    // implements
    for (const impl of node.getImplements()) {
      const implName = impl.getExpression().getText();
      edges.push({ from: id, to: makeId(fileId, implName), attrs: { kind: 'implements' } });
    }

    // Methods
    for (const method of node.getMethods()) {
      const methodName = method.getName();
      const methodId = makeId(fileId, name, methodName);
      nodes.push({ id: methodId, attrs: buildAttrs('method', fileId, methodName, method, mtime) });
      edges.push({ from: id, to: methodId, attrs: { kind: 'contains' } });
    }
    return;
  }

  // Interface declarations
  if (Node.isInterfaceDeclaration(node)) {
    const name = node.getName();
    const id = makeId(fileId, name);
    nodes.push({ id, attrs: buildAttrs('interface', fileId, name, node, mtime) });
    edges.push({ from: parentId, to: id, attrs: { kind: 'contains' } });
    return;
  }

  // Type alias declarations
  if (Node.isTypeAliasDeclaration(node)) {
    const name = node.getName();
    const id = makeId(fileId, name);
    nodes.push({ id, attrs: buildAttrs('type', fileId, name, node, mtime) });
    edges.push({ from: parentId, to: id, attrs: { kind: 'contains' } });
    return;
  }

  // Enum declarations
  if (Node.isEnumDeclaration(node)) {
    const name = node.getName();
    const id = makeId(fileId, name);
    nodes.push({ id, attrs: buildAttrs('enum', fileId, name, node, mtime) });
    edges.push({ from: parentId, to: id, attrs: { kind: 'contains' } });
    return;
  }

  // Variable statements: export const foo = ..., export const bar = () => ...
  if (Node.isVariableStatement(node)) {
    for (const decl of node.getDeclarations()) {
      const name = decl.getName();
      if (typeof name !== 'string') continue;

      const initializer = decl.getInitializer();
      const isArrow =
        initializer?.getKind() === SyntaxKind.ArrowFunction ||
        initializer?.getKind() === SyntaxKind.FunctionExpression;
      const kind: CodeNodeKind = isArrow ? 'function' : 'variable';

      const id = makeId(fileId, name);
      nodes.push({ id, attrs: buildAttrs(kind, fileId, name, node, mtime) });
      edges.push({ from: parentId, to: id, attrs: { kind: 'contains' } });
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeId(fileId: string, ...parts: string[]): string {
  return [fileId, ...parts].join('::');
}

function buildAttrs(
  kind: CodeNodeKind,
  fileId: string,
  name: string,
  node: Node,
  mtime: number,
): CodeNodeAttributes {
  const start = node.getStartLineNumber();
  const end = node.getEndLineNumber();
  const fullText = node.getFullText().trim();

  // Signature = first line (up to opening brace or end of line)
  const firstLine = fullText.split('\n')[0].trim();
  const signature = firstLine.length > 200 ? firstLine.slice(0, 200) + '…' : firstLine;

  // JSDoc = leading comment of the node
  const jsDocs = 'getJsDocs' in node
    ? (node as { getJsDocs(): Array<{ getFullText(): string }> }).getJsDocs()
    : [];
  const docComment = jsDocs.map(d => d.getFullText().trim()).join('\n').trim();

  // isExported
  const isExported = 'isExported' in node
    ? (node as { isExported(): boolean }).isExported()
    : false;

  return {
    kind,
    fileId,
    name,
    signature,
    docComment,
    body: fullText,
    startLine: start,
    endLine: end,
    isExported,
    embedding: [],
    fileEmbedding: [],
    mtime,
  };
}

function extractFileDocComment(sourceFile: SourceFile): string {
  // First statement's leading trivia that looks like a file-level JSDoc
  const firstStatement = sourceFile.getStatements()[0];
  if (!firstStatement) return '';
  const leadingComments = firstStatement.getLeadingCommentRanges();
  return leadingComments
    .map(r => r.getText())
    .filter(t => t.startsWith('/**') || t.startsWith('//'))
    .join('\n')
    .trim();
}

function buildImportSummary(sourceFile: SourceFile): string {
  const imports = sourceFile.getImportDeclarations();
  if (imports.length === 0) return '';
  return imports.map(i => i.getText().trim()).join('\n');
}

function isRelative(moduleSpecifier: string): boolean {
  return moduleSpecifier.startsWith('./') || moduleSpecifier.startsWith('../');
}
