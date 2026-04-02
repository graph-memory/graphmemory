export type CodeNodeKind =
  | 'file'        // file root (imports + file-level JSDoc)
  | 'function'    // function / arrow function assigned to const
  | 'class'       // class declaration
  | 'method'      // class method
  | 'constructor'  // class constructor
  | 'interface'   // interface declaration
  | 'type'        // type alias
  | 'enum'        // enum declaration
  | 'variable';   // exported const / let / var (non-function)

export type CodeEdgeKind =
  | 'contains'    // file → its declarations, class → its methods
  | 'imports'     // file A imports from file B
  | 'extends'     // class A extends class B
  | 'implements'; // class A implements interface B

export interface CodeNodeAttributes {
  kind: CodeNodeKind;
  fileId: string;          // relative path from codeDir, e.g. "src/lib/graph.ts"
  name: string;            // symbol name, e.g. "updateFile"
  signature: string;       // first line(s) of declaration, e.g. "export function updateFile(...)"
  docComment: string;      // JSDoc comment if present, else ""
  body: string;            // full source text of the declaration (signature + body)
  startLine: number;       // 1-based
  endLine: number;         // 1-based
  isExported: boolean;
  embedding: number[];     // embedded from signature + docComment; [] until filled
  fileEmbedding: number[]; // file-level embedding (only on kind='file' nodes); [] until filled
  mtime: number;           // file mtimeMs at index time
  pendingImports?: string[];  // import targets not yet in graph at index time
  pendingEdges?: Array<{ from: string; toName: string; kind: 'extends' | 'implements' }>;
}

export interface CodeEdgeAttributes {
  kind: CodeEdgeKind;
}

// CodeGraph type alias and createCodeGraph() removed — indexed graphs now use SQLite Store.
