import type { ExtractedSymbol, ExtractedEdge, ExtractedImport, LanguageMapper } from './types';
import { registerLanguage } from './registry';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type TSNode = any; // tree-sitter Node

/** Get the previous named sibling that is a JSDoc comment. */
function getDocComment(node: TSNode): string {
  let prev = node.previousSibling;
  while (prev && prev.type === 'comment' && !prev.text.startsWith('/**')) {
    prev = prev.previousSibling;
  }
  if (prev && prev.type === 'comment' && prev.text.startsWith('/**')) {
    return prev.text.trim();
  }
  return '';
}

/** Build a signature: first line of the node text (truncated to 200 chars). */
function buildSignature(node: TSNode): string {
  const text = node.text ?? '';
  const firstLine = text.split('\n')[0].trim();
  return firstLine.length > 200 ? firstLine.slice(0, 200) + '…' : firstLine;
}

/** Build the full body text for a symbol. Includes JSDoc + node text. */
function buildBody(node: TSNode, docComment: string): string {
  if (docComment) {
    return docComment + '\n' + node.text;
  }
  return node.text ?? '';
}

/** Build a signature that includes the JSDoc first line if present. */
function buildFullSignature(node: TSNode, docComment: string): string {
  if (docComment) {
    const firstDocLine = docComment.split('\n')[0].trim();
    return firstDocLine;
  }
  return buildSignature(node);
}

/** Check if a node is inside an export_statement. */
function isExported(node: TSNode): boolean {
  const parent = node.parent;
  return parent?.type === 'export_statement';
}

/** Get the wrapping export_statement if this node is exported, otherwise return the node itself. */
function getOuterNode(node: TSNode): TSNode {
  const parent = node.parent;
  if (parent?.type === 'export_statement') return parent;
  return node;
}

/** Convert tree-sitter 0-based row to 1-based line number. */
function startLine(node: TSNode): number {
  return (node.startPosition?.row ?? 0) + 1;
}

function endLine(node: TSNode): number {
  return (node.endPosition?.row ?? 0) + 1;
}

// ---------------------------------------------------------------------------
// Symbol extraction
// ---------------------------------------------------------------------------

function extractClassSymbol(node: TSNode): ExtractedSymbol {
  const outer = getOuterNode(node);
  const doc = getDocComment(outer);
  const name = node.childForFieldName('name')?.text ?? '';
  const body = node.childForFieldName('body');

  // Extract methods
  const children: ExtractedSymbol[] = [];
  if (body) {
    for (const member of body.namedChildren) {
      if (member.type === 'method_definition') {
        const methodName = member.childForFieldName('name')?.text ?? '';
        if (!methodName) continue;
        const methodDoc = getDocComment(member);
        children.push({
          name: methodName,
          kind: 'method',
          signature: buildSignature(member),
          docComment: methodDoc,
          body: buildBody(member, methodDoc),
          startLine: startLine(member),
          endLine: endLine(member),
          isExported: false,
        });
      }
    }
  }

  return {
    name,
    kind: 'class',
    signature: buildFullSignature(outer, doc),
    docComment: doc,
    body: buildBody(outer, doc),
    startLine: startLine(outer),
    endLine: endLine(outer),
    isExported: isExported(node),
    children,
  };
}

function extractFunctionSymbol(node: TSNode): ExtractedSymbol {
  const outer = getOuterNode(node);
  const doc = getDocComment(outer);
  const name = node.childForFieldName('name')?.text ?? '';

  return {
    name,
    kind: 'function',
    signature: buildFullSignature(outer, doc),
    docComment: doc,
    body: buildBody(outer, doc),
    startLine: startLine(outer),
    endLine: endLine(outer),
    isExported: isExported(node),
  };
}

function extractInterfaceSymbol(node: TSNode): ExtractedSymbol {
  const outer = getOuterNode(node);
  const doc = getDocComment(outer);
  const name = node.childForFieldName('name')?.text ?? '';

  return {
    name,
    kind: 'interface',
    signature: buildFullSignature(outer, doc),
    docComment: doc,
    body: buildBody(outer, doc),
    startLine: startLine(outer),
    endLine: endLine(outer),
    isExported: isExported(node),
  };
}

function extractTypeAliasSymbol(node: TSNode): ExtractedSymbol {
  const outer = getOuterNode(node);
  const doc = getDocComment(outer);
  const name = node.childForFieldName('name')?.text ?? '';

  return {
    name,
    kind: 'type',
    signature: buildFullSignature(outer, doc),
    docComment: doc,
    body: buildBody(outer, doc),
    startLine: startLine(outer),
    endLine: endLine(outer),
    isExported: isExported(node),
  };
}

function extractEnumSymbol(node: TSNode): ExtractedSymbol {
  const outer = getOuterNode(node);
  const doc = getDocComment(outer);
  const name = node.childForFieldName('name')?.text ?? '';

  return {
    name,
    kind: 'enum',
    signature: buildFullSignature(outer, doc),
    docComment: doc,
    body: buildBody(outer, doc),
    startLine: startLine(outer),
    endLine: endLine(outer),
    isExported: isExported(node),
  };
}

function extractVariableSymbols(node: TSNode, exported: boolean): ExtractedSymbol[] {
  const outer = exported ? node.parent : node;
  const doc = getDocComment(outer!);
  const symbols: ExtractedSymbol[] = [];

  // Find all variable_declarator children
  for (const child of node.namedChildren) {
    if (child.type === 'variable_declarator') {
      const name = child.childForFieldName('name')?.text ?? '';
      if (!name) continue;

      const value = child.childForFieldName('value');
      const isArrow = value?.type === 'arrow_function' || value?.type === 'function_expression';

      symbols.push({
        name,
        kind: isArrow ? 'function' : 'variable',
        signature: buildFullSignature(outer!, doc),
        docComment: doc,
        body: buildBody(outer!, doc),
        startLine: startLine(outer!),
        endLine: endLine(outer!),
        isExported: exported,
      });
    }
  }

  return symbols;
}

// ---------------------------------------------------------------------------
// Main mapper
// ---------------------------------------------------------------------------

function processTopLevel(node: TSNode): ExtractedSymbol[] {
  switch (node.type) {
    case 'function_declaration': {
      const name = node.childForFieldName('name')?.text;
      if (!name) return [];
      return [extractFunctionSymbol(node)];
    }
    case 'class_declaration': {
      const name = node.childForFieldName('name')?.text;
      if (!name) return [];
      return [extractClassSymbol(node)];
    }
    case 'interface_declaration': {
      return [extractInterfaceSymbol(node)];
    }
    case 'type_alias_declaration': {
      return [extractTypeAliasSymbol(node)];
    }
    case 'enum_declaration': {
      return [extractEnumSymbol(node)];
    }
    case 'lexical_declaration':
    case 'variable_declaration': {
      return extractVariableSymbols(node, isExported(node));
    }
    case 'export_statement': {
      // Unwrap: export_statement wraps the actual declaration
      for (const child of node.namedChildren) {
        if (child.type === 'comment') continue;
        const results = processTopLevel(child);
        if (results.length > 0) return results;
      }
      return [];
    }
    default:
      return [];
  }
}

const typescriptMapper: LanguageMapper = {
  extractSymbols(rootNode: TSNode): ExtractedSymbol[] {
    const symbols: ExtractedSymbol[] = [];
    for (const child of rootNode.children) {
      symbols.push(...processTopLevel(child));
    }
    return symbols;
  },

  extractEdges(rootNode: TSNode): ExtractedEdge[] {
    const edges: ExtractedEdge[] = [];

    function findClasses(node: TSNode): void {
      if (node.type === 'class_declaration') {
        const className = node.childForFieldName('name')?.text;
        if (!className) return;

        // Look for class_heritage
        for (const child of node.namedChildren) {
          if (child.type === 'class_heritage') {
            for (const clause of child.namedChildren) {
              if (clause.type === 'extends_clause') {
                // First named child is the base class
                for (const c of clause.namedChildren) {
                  if (c.type === 'identifier' || c.type === 'type_identifier') {
                    edges.push({ fromName: className, toName: c.text, kind: 'extends' });
                    break;
                  }
                }
              }
              if (clause.type === 'implements_clause') {
                for (const c of clause.namedChildren) {
                  if (c.type === 'type_identifier' || c.type === 'identifier') {
                    edges.push({ fromName: className, toName: c.text, kind: 'implements' });
                  }
                }
              }
            }
          }
        }
      }

      for (const child of node.children) {
        findClasses(child);
      }
    }

    findClasses(rootNode);
    return edges;
  },

  extractImports(rootNode: TSNode): ExtractedImport[] {
    const imports: ExtractedImport[] = [];
    for (const child of rootNode.children) {
      if (child.type === 'import_statement') {
        const source = child.childForFieldName('source');
        if (source) {
          // Remove quotes from string literal
          const specifier = source.text.replace(/^['"]|['"]$/g, '');
          if (specifier.startsWith('./') || specifier.startsWith('../')) {
            imports.push({ specifier });
          }
        }
      }
    }
    return imports;
  },
};

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

let _registered = false;

export function registerTypescript(): void {
  if (_registered) return;
  _registered = true;

  // TypeScript and TSX share the same mapper
  registerLanguage('typescript', 'tree-sitter-typescript.wasm', typescriptMapper);
  registerLanguage('tsx', 'tree-sitter-tsx.wasm', typescriptMapper);

  // JavaScript and JSX use the same mapper (TS is a superset)
  registerLanguage('javascript', 'tree-sitter-javascript.wasm', typescriptMapper);
  registerLanguage('jsx', 'tree-sitter-javascript.wasm', typescriptMapper);
}
