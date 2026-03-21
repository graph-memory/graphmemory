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

/** Collapse whitespace and truncate. */
function truncate(text: string, maxLen = 300): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > maxLen ? collapsed.slice(0, maxLen) + '…' : collapsed;
}

/**
 * Build signature by taking everything before the body node.
 * For code (ASCII-dominated), byte offset ≈ char offset.
 * Falls back to first line if no body found.
 */
function buildSignature(outerNode: TSNode, innerNode: TSNode): string {
  const bodyNode = innerNode.childForFieldName('body');
  const text = outerNode.text ?? '';

  if (!bodyNode) {
    // No body (type alias, ambient declaration, etc.) — use full text
    return truncate(text);
  }

  // Slice text from outer start up to body start
  const headerBytes = bodyNode.startIndex - outerNode.startIndex;
  if (headerBytes > 0) {
    return truncate(text.slice(0, headerBytes));
  }
  return truncate(text.split('\n')[0]);
}

/**
 * Build signature for variable declarations.
 * If value is arrow/function, strip the function body.
 */
function buildVariableSignature(outerNode: TSNode, declarator: TSNode): string {
  const value = declarator.childForFieldName('value');
  if (value) {
    const valueBody = value.childForFieldName('body');
    if (valueBody) {
      const fullText = outerNode.text ?? '';
      const bodyOffset = valueBody.startIndex - outerNode.startIndex;
      if (bodyOffset > 0) return truncate(fullText.slice(0, bodyOffset));
    }
  }
  return truncate(outerNode.text ?? '');
}

/** Build the full body text for a symbol. Includes JSDoc + node text. */
function buildBody(node: TSNode, docComment: string): string {
  if (docComment) {
    return docComment + '\n' + node.text;
  }
  return node.text ?? '';
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

/**
 * Extract the base type name from a type node, handling generic types.
 * `Foo` → "Foo", `Foo<T>` (generic_type) → "Foo"
 */
function extractTypeName(node: TSNode): string | null {
  if (node.type === 'identifier' || node.type === 'type_identifier') {
    return node.text;
  }
  if (node.type === 'generic_type') {
    const name = node.childForFieldName('name') ?? node.namedChildren?.[0];
    if (name && (name.type === 'identifier' || name.type === 'type_identifier')) {
      return name.text;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Symbol extraction
// ---------------------------------------------------------------------------

/** Extract class members: methods, fields, getters/setters. */
function extractClassMembers(body: TSNode): ExtractedSymbol[] {
  const children: ExtractedSymbol[] = [];
  if (!body) return children;

  for (const member of body.namedChildren) {
    switch (member.type) {
      case 'method_definition':
      case 'abstract_method_definition':
      case 'abstract_method_signature': {
        const methodName = member.childForFieldName('name')?.text ?? '';
        if (!methodName) continue;
        const methodDoc = getDocComment(member);
        children.push({
          name: methodName,
          kind: methodName === 'constructor' ? 'constructor' : 'method',
          signature: buildSignature(member, member),
          docComment: methodDoc,
          body: buildBody(member, methodDoc),
          startLine: startLine(member),
          endLine: endLine(member),
          isExported: false,
        });
        break;
      }
      case 'public_field_definition':
      case 'property_definition': {
        const fieldName = member.childForFieldName('name')?.text ?? '';
        if (!fieldName) continue;
        const fieldDoc = getDocComment(member);
        children.push({
          name: fieldName,
          kind: 'variable',
          signature: truncate(member.text ?? ''),
          docComment: fieldDoc,
          body: buildBody(member, fieldDoc),
          startLine: startLine(member),
          endLine: endLine(member),
          isExported: false,
        });
        break;
      }
    }
  }
  return children;
}

function extractClassSymbol(node: TSNode): ExtractedSymbol {
  const outer = getOuterNode(node);
  const doc = getDocComment(outer);
  const name = node.childForFieldName('name')?.text ?? '';
  const body = node.childForFieldName('body');
  const children = extractClassMembers(body);

  return {
    name,
    kind: 'class',
    signature: buildSignature(outer, node),
    docComment: doc,
    body: buildBody(outer, doc),
    startLine: startLine(outer),
    endLine: endLine(outer),
    isExported: isExported(node),
    children: children.length > 0 ? children : undefined,
  };
}

/** Extract nested named function declarations from a function body (1 level deep). */
function extractNestedFunctions(body: TSNode): ExtractedSymbol[] {
  const nested: ExtractedSymbol[] = [];
  if (!body || body.type !== 'statement_block') return nested;

  for (const stmt of body.namedChildren) {
    if (stmt.type === 'function_declaration') {
      const childName = stmt.childForFieldName('name')?.text;
      if (!childName) continue;
      const childDoc = getDocComment(stmt);
      nested.push({
        name: childName,
        kind: 'function',
        signature: buildSignature(stmt, stmt),
        docComment: childDoc,
        body: buildBody(stmt, childDoc),
        startLine: startLine(stmt),
        endLine: endLine(stmt),
        isExported: false,
      });
    }
  }
  return nested;
}

function extractFunctionSymbol(node: TSNode): ExtractedSymbol {
  const outer = getOuterNode(node);
  const doc = getDocComment(outer);
  const name = node.childForFieldName('name')?.text ?? '';

  const body = node.childForFieldName('body');
  const children = extractNestedFunctions(body);

  return {
    name,
    kind: 'function',
    signature: buildSignature(outer, node),
    docComment: doc,
    body: buildBody(outer, doc),
    startLine: startLine(outer),
    endLine: endLine(outer),
    isExported: isExported(node),
    children: children.length > 0 ? children : undefined,
  };
}

function extractInterfaceSymbol(node: TSNode): ExtractedSymbol {
  const outer = getOuterNode(node);
  const doc = getDocComment(outer);
  const name = node.childForFieldName('name')?.text ?? '';

  // Extract interface members
  const children: ExtractedSymbol[] = [];
  const body = node.childForFieldName('body');
  if (body) {
    for (const member of body.namedChildren) {
      if (member.type === 'property_signature' || member.type === 'method_signature') {
        const memberName = member.childForFieldName('name')?.text ?? '';
        if (!memberName) continue;
        const memberDoc = getDocComment(member);
        children.push({
          name: memberName,
          kind: member.type === 'method_signature' ? 'method' : 'variable',
          signature: truncate(member.text ?? ''),
          docComment: memberDoc,
          body: buildBody(member, memberDoc),
          startLine: startLine(member),
          endLine: endLine(member),
          isExported: false,
        });
      }
    }
  }

  return {
    name,
    kind: 'interface',
    signature: buildSignature(outer, node),
    docComment: doc,
    body: buildBody(outer, doc),
    startLine: startLine(outer),
    endLine: endLine(outer),
    isExported: isExported(node),
    children: children.length > 0 ? children : undefined,
  };
}

function extractTypeAliasSymbol(node: TSNode): ExtractedSymbol {
  const outer = getOuterNode(node);
  const doc = getDocComment(outer);
  const name = node.childForFieldName('name')?.text ?? '';

  return {
    name,
    kind: 'type',
    signature: truncate(outer.text ?? ''),
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
    signature: buildSignature(outer, node),
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

  for (const child of node.namedChildren) {
    if (child.type === 'variable_declarator') {
      const name = child.childForFieldName('name')?.text ?? '';
      if (!name) continue;

      const value = child.childForFieldName('value');
      const isArrow = value?.type === 'arrow_function' || value?.type === 'function_expression';

      // Extract nested named functions from arrow/function body
      let children: ExtractedSymbol[] | undefined;
      if (isArrow && value) {
        const fnBody = value.childForFieldName('body');
        const nested = extractNestedFunctions(fnBody);
        if (nested.length > 0) children = nested;
      }

      symbols.push({
        name,
        kind: isArrow ? 'function' : 'variable',
        signature: buildVariableSignature(outer!, child),
        docComment: doc,
        body: buildBody(outer!, doc),
        startLine: startLine(outer!),
        endLine: endLine(outer!),
        isExported: exported,
        children,
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
    case 'function_declaration':
    case 'function_signature': {
      const name = node.childForFieldName('name')?.text;
      if (!name) return [];
      return [extractFunctionSymbol(node)];
    }
    case 'class_declaration':
    case 'abstract_class_declaration': {
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
    case 'ambient_declaration': {
      // declare function/class/interface/etc — unwrap and process inner declaration
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
      if (node.type === 'class_declaration' || node.type === 'abstract_class_declaration') {
        const className = node.childForFieldName('name')?.text;
        if (!className) return;

        for (const child of node.namedChildren) {
          if (child.type === 'class_heritage') {
            for (const clause of child.namedChildren) {
              if (clause.type === 'extends_clause') {
                for (const c of clause.namedChildren) {
                  const typeName = extractTypeName(c);
                  if (typeName) {
                    edges.push({ fromName: className, toName: typeName, kind: 'extends' });
                    break; // Only one base class
                  }
                }
              }
              if (clause.type === 'implements_clause') {
                for (const c of clause.namedChildren) {
                  const typeName = extractTypeName(c);
                  if (typeName) {
                    edges.push({ fromName: className, toName: typeName, kind: 'implements' });
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
      // import statements
      if (child.type === 'import_statement') {
        const source = child.childForFieldName('source');
        if (source) {
          const specifier = source.text.replace(/^['"]|['"]$/g, '');
          imports.push({ specifier });
        }
      }
      // Re-exports: export { ... } from '...' and export * from '...'
      if (child.type === 'export_statement') {
        const source = child.childForFieldName('source');
        if (source) {
          const specifier = source.text.replace(/^['"]|['"]$/g, '');
          imports.push({ specifier });
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

  registerLanguage('typescript', 'tree-sitter-typescript.wasm', typescriptMapper);
  registerLanguage('tsx', 'tree-sitter-tsx.wasm', typescriptMapper);
  registerLanguage('javascript', 'tree-sitter-javascript.wasm', typescriptMapper);
  registerLanguage('jsx', 'tree-sitter-javascript.wasm', typescriptMapper);
}
