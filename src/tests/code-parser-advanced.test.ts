import path from 'path';
import fs from 'fs';
import { parseCodeFile, clearPathMappingsCache } from '@/lib/parsers/code';
import type { ParsedFile } from '@/lib/parsers/code';

const FIXTURES = path.join(__dirname, 'fixtures', 'code');
const MTIME = 1000;

function node(pf: ParsedFile, id: string) {
  return pf.nodes.find(n => n.id === id);
}

function hasEdge(pf: ParsedFile, from: string, to: string, kind: string): boolean {
  return pf.edges.some(e => e.from === from && e.to === to && e.attrs.kind === kind);
}

// ---------------------------------------------------------------------------
// advanced.ts — abstract class, constructor, generics, ambient, nested, etc.
// ---------------------------------------------------------------------------

describe('advanced.ts', () => {
  let pf: ParsedFile;
  beforeAll(async () => { pf = await parseCodeFile(path.join(FIXTURES, 'advanced.ts'), FIXTURES, MTIME); });

  // --- file node ---
  it('fileId is advanced.ts', () => { expect(pf.fileId).toBe('advanced.ts'); });
  it('file node exists', () => { expect(node(pf, 'advanced.ts')).toBeDefined(); });

  // --- let variable (lexical_declaration, no doc comment) ---
  it('counter node exists', () => { expect(node(pf, 'advanced.ts::counter')).toBeDefined(); });
  it('counter kind is variable', () => { expect(node(pf, 'advanced.ts::counter')?.attrs.kind).toBe('variable'); });
  it('counter isExported false', () => { expect(node(pf, 'advanced.ts::counter')?.attrs.isExported).toBe(false); });
  it('counter has no doc comment (regular comments skipped)', () => {
    expect(node(pf, 'advanced.ts::counter')?.attrs.docComment).toBe('');
  });

  // --- abstract class ---
  it('AbstractRepo node exists', () => { expect(node(pf, 'advanced.ts::AbstractRepo')).toBeDefined(); });
  it('AbstractRepo kind is class', () => { expect(node(pf, 'advanced.ts::AbstractRepo')?.attrs.kind).toBe('class'); });
  it('AbstractRepo isExported true', () => { expect(node(pf, 'advanced.ts::AbstractRepo')?.attrs.isExported).toBe(true); });
  it('AbstractRepo docComment', () => { expect(node(pf, 'advanced.ts::AbstractRepo')?.attrs.docComment).toContain('abstract base'); });
  it('AbstractRepo signature contains "abstract class"', () => {
    expect(node(pf, 'advanced.ts::AbstractRepo')?.attrs.signature).toContain('abstract class');
  });

  // --- constructor ---
  it('constructor node exists', () => { expect(node(pf, 'advanced.ts::AbstractRepo::constructor')).toBeDefined(); });
  it('constructor kind is constructor', () => {
    expect(node(pf, 'advanced.ts::AbstractRepo::constructor')?.attrs.kind).toBe('constructor');
  });
  it('constructor contains edge from class', () => {
    expect(hasEdge(pf, 'advanced.ts::AbstractRepo', 'advanced.ts::AbstractRepo::constructor', 'contains')).toBe(true);
  });

  // --- class field (property_definition) ---
  it('store field exists', () => { expect(node(pf, 'advanced.ts::AbstractRepo::store')).toBeDefined(); });
  it('store field kind is variable', () => { expect(node(pf, 'advanced.ts::AbstractRepo::store')?.attrs.kind).toBe('variable'); });
  it('store field signature contains "store"', () => {
    expect(node(pf, 'advanced.ts::AbstractRepo::store')?.attrs.signature).toContain('store');
  });

  // --- abstract method ---
  it('abstract findById exists', () => { expect(node(pf, 'advanced.ts::AbstractRepo::findById')).toBeDefined(); });
  it('abstract findById kind is method', () => {
    expect(node(pf, 'advanced.ts::AbstractRepo::findById')?.attrs.kind).toBe('method');
  });
  it('abstract findById signature', () => {
    expect(node(pf, 'advanced.ts::AbstractRepo::findById')?.attrs.signature).toContain('findById');
  });

  // --- concrete method ---
  it('count method exists', () => { expect(node(pf, 'advanced.ts::AbstractRepo::count')).toBeDefined(); });
  it('count docComment', () => { expect(node(pf, 'advanced.ts::AbstractRepo::count')?.attrs.docComment).toContain('Count'); });

  // --- generic extends + implements ---
  it('ConcreteRepo extends AbstractRepo', () => {
    expect(hasEdge(pf, 'advanced.ts::ConcreteRepo', 'advanced.ts::AbstractRepo', 'extends')).toBe(true);
  });
  it('ConcreteRepo implements Iterable (generic stripped)', () => {
    expect(hasEdge(pf, 'advanced.ts::ConcreteRepo', 'advanced.ts::Iterable', 'implements')).toBe(true);
  });
  it('ConcreteRepo has findById override', () => {
    expect(node(pf, 'advanced.ts::ConcreteRepo::findById')).toBeDefined();
  });

  // --- interface with method_signature ---
  it('Processor interface exists', () => { expect(node(pf, 'advanced.ts::Processor')).toBeDefined(); });
  it('Processor::process is method (method_signature)', () => {
    expect(node(pf, 'advanced.ts::Processor::process')?.attrs.kind).toBe('method');
  });
  it('Processor::reset is method (method_signature)', () => {
    expect(node(pf, 'advanced.ts::Processor::reset')?.attrs.kind).toBe('method');
  });
  it('Processor::name is variable (property_signature)', () => {
    expect(node(pf, 'advanced.ts::Processor::name')?.attrs.kind).toBe('variable');
  });
  it('Processor::process has doc comment', () => {
    expect(node(pf, 'advanced.ts::Processor::process')?.attrs.docComment).toContain('Process');
  });

  // --- arrow function with body ---
  it('transform is function (arrow)', () => { expect(node(pf, 'advanced.ts::transform')?.attrs.kind).toBe('function'); });
  it('transform signature does not include body', () => {
    const sig = node(pf, 'advanced.ts::transform')?.attrs.signature ?? '';
    expect(sig).toContain('=>');
    expect(sig).not.toContain('return');
  });

  // --- nested function ---
  it('pipeline exists', () => { expect(node(pf, 'advanced.ts::pipeline')).toBeDefined(); });
  it('filterValid nested function exists', () => { expect(node(pf, 'advanced.ts::pipeline::filterValid')).toBeDefined(); });
  it('filterValid kind is function', () => { expect(node(pf, 'advanced.ts::pipeline::filterValid')?.attrs.kind).toBe('function'); });
  it('filterValid isExported false', () => { expect(node(pf, 'advanced.ts::pipeline::filterValid')?.attrs.isExported).toBe(false); });
  it('filterValid contains edge from pipeline', () => {
    expect(hasEdge(pf, 'advanced.ts::pipeline', 'advanced.ts::pipeline::filterValid', 'contains')).toBe(true);
  });

  // --- ambient declaration ---
  it('externalFetch exists (declare function)', () => { expect(node(pf, 'advanced.ts::externalFetch')).toBeDefined(); });
  it('externalFetch kind is function', () => { expect(node(pf, 'advanced.ts::externalFetch')?.attrs.kind).toBe('function'); });
  it('externalFetch isExported false', () => { expect(node(pf, 'advanced.ts::externalFetch')?.attrs.isExported).toBe(false); });

  // --- re-export ---
  it('re-export creates imports edge to types.ts', () => {
    const importEdges = pf.edges.filter(e => e.attrs.kind === 'imports' && e.to === 'types.ts');
    expect(importEdges.length).toBeGreaterThanOrEqual(2); // import + re-export
  });

  // --- import edges ---
  it('imports types.ts', () => { expect(hasEdge(pf, 'advanced.ts', 'types.ts', 'imports')).toBe(true); });
  it('imports graph.ts', () => { expect(hasEdge(pf, 'advanced.ts', 'graph.ts', 'imports')).toBe(true); });

  // --- total counts ---
  it('has 18 nodes total', () => { expect(pf.nodes).toHaveLength(18); });
});

// ---------------------------------------------------------------------------
// stripJsoncComments — unit tests
// ---------------------------------------------------------------------------

// Access the private function via parseCodeFile + tsconfig
describe('stripJsoncComments (via tsconfig parsing)', () => {
  const tmpDir = path.join(__dirname, 'fixtures', 'code', '_tmp_jsonc');

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    clearPathMappingsCache();
  });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  function writeTsconfig(content: string): void {
    fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), content);
  }

  function writeSource(name: string, code: string): void {
    fs.writeFileSync(path.join(tmpDir, name), code);
  }

  it('handles line comments in tsconfig', async () => {
    writeTsconfig(`{
      // This is a comment
      "compilerOptions": {
        "baseUrl": ".",
        "paths": { "@t/*": ["./*"] }
      }
    }`);
    writeSource('mod.ts', 'import { x } from "@t/other";');
    writeSource('other.ts', 'export const x = 1;');
    const pf = await parseCodeFile(path.join(tmpDir, 'mod.ts'), tmpDir, 1000);
    expect(hasEdge(pf, 'mod.ts', 'other.ts', 'imports')).toBe(true);
  });

  it('handles block comments in tsconfig', async () => {
    writeTsconfig(`{
      /* block comment */
      "compilerOptions": {
        "baseUrl": ".",
        "paths": { "@b/*": ["./*"] }
      }
    }`);
    writeSource('mod2.ts', 'import { y } from "@b/other2";');
    writeSource('other2.ts', 'export const y = 1;');
    const pf = await parseCodeFile(path.join(tmpDir, 'mod2.ts'), tmpDir, 1000);
    expect(hasEdge(pf, 'mod2.ts', 'other2.ts', 'imports')).toBe(true);
  });

  it('preserves strings containing comment-like text', async () => {
    writeTsconfig(`{
      "compilerOptions": {
        "baseUrl": ".",
        "paths": { "@s/*": ["./*"] }
      }
    }`);
    writeSource('mod3.ts', 'import { z } from "@s/target";');
    writeSource('target.ts', 'export const z = "// not a comment";');
    const pf = await parseCodeFile(path.join(tmpDir, 'mod3.ts'), tmpDir, 1000);
    expect(hasEdge(pf, 'mod3.ts', 'target.ts', 'imports')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// tsconfig path alias resolution
// ---------------------------------------------------------------------------

describe('tsconfig path alias resolution', () => {
  beforeEach(() => { clearPathMappingsCache(); });

  it('resolves @lib/* alias from fixture tsconfig', async () => {
    // The fixture tsconfig.json has paths: { "@lib/*": ["./*"] }
    // Create a temp file that uses the alias
    const tmpFile = path.join(FIXTURES, '_alias_test.ts');
    fs.writeFileSync(tmpFile, 'import type { NodeAttrs } from "@lib/types";\n');
    try {
      const pf = await parseCodeFile(tmpFile, FIXTURES, 1000);
      expect(hasEdge(pf, '_alias_test.ts', 'types.ts', 'imports')).toBe(true);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it('skips unresolvable alias imports', async () => {
    const tmpFile = path.join(FIXTURES, '_alias_bad.ts');
    fs.writeFileSync(tmpFile, 'import { x } from "@unknown/module";\n');
    try {
      const pf = await parseCodeFile(tmpFile, FIXTURES, 1000);
      expect(pf.edges.filter(e => e.attrs.kind === 'imports')).toHaveLength(0);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});

// ---------------------------------------------------------------------------
// Unsupported language / edge cases
// ---------------------------------------------------------------------------

describe('unsupported language file', () => {
  it('returns file-only node for .json', async () => {
    const pf = await parseCodeFile(path.join(FIXTURES, 'tsconfig.json'), FIXTURES, 1000);
    expect(pf.nodes).toHaveLength(1);
    expect(pf.nodes[0].attrs.kind).toBe('file');
    expect(pf.edges).toHaveLength(0);
  });

  it('returns file-only node for unknown extension', async () => {
    const tmpFile = path.join(FIXTURES, '_test.py');
    fs.writeFileSync(tmpFile, 'def foo(): pass\n');
    try {
      const pf = await parseCodeFile(tmpFile, FIXTURES, 1000);
      expect(pf.nodes).toHaveLength(1);
      expect(pf.nodes[0].attrs.kind).toBe('file');
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});

// ---------------------------------------------------------------------------
// resolvePendingImports / resolvePendingEdges
// ---------------------------------------------------------------------------

describe('pending edges resolution', () => {
  // This is tested via code graph CRUD
  const { createCodeGraph, updateCodeFile, resolvePendingEdges } = require('@/graphs/code');

  it('resolves cross-file extends after both files indexed', () => {
    const graph = createCodeGraph();

    // File with interface
    updateCodeFile(graph, {
      fileId: 'base.ts', mtime: 1000,
      nodes: [
        { id: 'base.ts', attrs: { kind: 'file', fileId: 'base.ts', name: 'base.ts', signature: '', docComment: '', body: '', startLine: 1, endLine: 10, isExported: false, embedding: [], fileEmbedding: [], mtime: 1000 } },
        { id: 'base.ts::Base', attrs: { kind: 'class', fileId: 'base.ts', name: 'Base', signature: 'class Base', docComment: '', body: '', startLine: 2, endLine: 8, isExported: true, embedding: [], fileEmbedding: [], mtime: 1000 } },
      ],
      edges: [
        { from: 'base.ts', to: 'base.ts::Base', attrs: { kind: 'contains' } },
      ],
    });

    // File that extends Base but Base is in another file
    updateCodeFile(graph, {
      fileId: 'child.ts', mtime: 1000,
      nodes: [
        { id: 'child.ts', attrs: { kind: 'file', fileId: 'child.ts', name: 'child.ts', signature: '', docComment: '', body: '', startLine: 1, endLine: 10, isExported: false, embedding: [], fileEmbedding: [], mtime: 1000, pendingEdges: [{ from: 'child.ts::Child', toName: 'Base', kind: 'extends' }] } },
        { id: 'child.ts::Child', attrs: { kind: 'class', fileId: 'child.ts', name: 'Child', signature: 'class Child extends Base', docComment: '', body: '', startLine: 2, endLine: 8, isExported: true, embedding: [], fileEmbedding: [], mtime: 1000 } },
      ],
      edges: [
        { from: 'child.ts', to: 'child.ts::Child', attrs: { kind: 'contains' } },
      ],
    });

    // Resolve pending edges
    resolvePendingEdges(graph);

    // Now Child should have extends edge to Base
    expect(graph.hasEdge('child.ts::Child', 'base.ts::Base')).toBe(true);
    expect(graph.getEdgeAttribute(graph.edge('child.ts::Child', 'base.ts::Base'), 'kind')).toBe('extends');
  });

  it('does not create self-referencing extends edge', () => {
    const graph = createCodeGraph();

    updateCodeFile(graph, {
      fileId: 'self.ts', mtime: 1000,
      nodes: [
        { id: 'self.ts', attrs: { kind: 'file', fileId: 'self.ts', name: 'self.ts', signature: '', docComment: '', body: '', startLine: 1, endLine: 20, isExported: false, embedding: [], fileEmbedding: [], mtime: 1000, pendingEdges: [{ from: 'self.ts::Foo', toName: 'Foo', kind: 'extends' }] } },
        { id: 'self.ts::Foo', attrs: { kind: 'class', fileId: 'self.ts', name: 'Foo', signature: 'class Foo', docComment: '', body: '', startLine: 2, endLine: 8, isExported: true, embedding: [], fileEmbedding: [], mtime: 1000 } },
      ],
      edges: [{ from: 'self.ts', to: 'self.ts::Foo', attrs: { kind: 'contains' } }],
    });

    resolvePendingEdges(graph);

    // Should NOT create Foo -> Foo edge
    expect(graph.hasEdge('self.ts::Foo', 'self.ts::Foo')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// searchCode — hybrid mode, includeBody
// ---------------------------------------------------------------------------

describe('searchCode advanced', () => {
  const { createCodeGraph, updateCodeFile } = require('@/graphs/code');
  const { searchCode } = require('@/lib/search/code');
  const { BM25Index } = require('@/lib/search/bm25');

  function unitVec(dim: number, axis: number): number[] {
    const v = new Array<number>(dim).fill(0);
    v[axis] = 1;
    return v;
  }

  const DIM = 8;
  let graph: any;
  let bm25: any;

  beforeAll(() => {
    graph = createCodeGraph();
    bm25 = new BM25Index((attrs: any) => `${attrs.name} ${attrs.signature} ${attrs.docComment} ${attrs.body}`);

    const file = {
      fileId: 'app.ts', mtime: 1000,
      nodes: [
        { id: 'app.ts', attrs: { kind: 'file', fileId: 'app.ts', name: 'app.ts', signature: '', docComment: '', body: '', startLine: 1, endLine: 50, isExported: false, embedding: unitVec(DIM, 0), fileEmbedding: [], mtime: 1000 } },
        { id: 'app.ts::handleRequest', attrs: { kind: 'function', fileId: 'app.ts', name: 'handleRequest', signature: 'function handleRequest(req)', docComment: '/** Handle HTTP request */', body: 'function handleRequest(req) { return res; }', startLine: 5, endLine: 20, isExported: true, embedding: unitVec(DIM, 1), fileEmbedding: [], mtime: 1000 } },
        { id: 'app.ts::parseBody', attrs: { kind: 'function', fileId: 'app.ts', name: 'parseBody', signature: 'function parseBody(data)', docComment: '', body: 'function parseBody(data) { return JSON.parse(data); }', startLine: 25, endLine: 35, isExported: true, embedding: unitVec(DIM, 2), fileEmbedding: [], mtime: 1000 } },
      ],
      edges: [
        { from: 'app.ts', to: 'app.ts::handleRequest', attrs: { kind: 'contains' } },
        { from: 'app.ts', to: 'app.ts::parseBody', attrs: { kind: 'contains' } },
      ],
    };

    updateCodeFile(graph, file);

    graph.forEachNode((id: string, attrs: any) => {
      bm25.addDocument(id, attrs);
    });
  });

  it('hybrid mode uses both vector and BM25', () => {
    const results = searchCode(graph, unitVec(DIM, 1), {
      topK: 5, bfsDepth: 0, minScore: 0,
      queryText: 'handle request',
      bm25Index: bm25,
      searchMode: 'hybrid',
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe('app.ts::handleRequest');
  });

  it('keyword-only mode ignores vector similarity', () => {
    const results = searchCode(graph, unitVec(DIM, 7), { // axis 7 = no match
      topK: 5, bfsDepth: 0, minScore: 0,
      queryText: 'parseBody JSON parse',
      bm25Index: bm25,
      searchMode: 'keyword',
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe('app.ts::parseBody');
  });

  it('includeBody returns body field', () => {
    const results = searchCode(graph, unitVec(DIM, 1), {
      topK: 1, bfsDepth: 0, includeBody: true, searchMode: 'vector',
    });
    expect(results[0].body).toBeDefined();
    expect(results[0].body).toContain('handleRequest');
  });

  it('includeBody=false omits body field', () => {
    const results = searchCode(graph, unitVec(DIM, 1), {
      topK: 1, bfsDepth: 0, includeBody: false, searchMode: 'vector',
    });
    expect(results[0].body).toBeUndefined();
  });

  it('BFS follows contains but not reverse imports', () => {
    // Add a second file that imports app.ts
    const file2 = {
      fileId: 'router.ts', mtime: 1000,
      nodes: [
        { id: 'router.ts', attrs: { kind: 'file', fileId: 'router.ts', name: 'router.ts', signature: '', docComment: '', body: '', startLine: 1, endLine: 10, isExported: false, embedding: unitVec(DIM, 3), fileEmbedding: [], mtime: 1000 } },
        { id: 'router.ts::route', attrs: { kind: 'function', fileId: 'router.ts', name: 'route', signature: 'function route()', docComment: '', body: 'function route() {}', startLine: 2, endLine: 8, isExported: true, embedding: unitVec(DIM, 4), fileEmbedding: [], mtime: 1000 } },
      ],
      edges: [
        { from: 'router.ts', to: 'router.ts::route', attrs: { kind: 'contains' } },
        { from: 'router.ts', to: 'app.ts', attrs: { kind: 'imports' } },
      ],
    };
    updateCodeFile(graph, file2);

    // Search for handleRequest with BFS depth=1
    const results = searchCode(graph, unitVec(DIM, 1), {
      topK: 1, bfsDepth: 1, minScore: 0, searchMode: 'vector',
    });
    const ids = results.map((r: any) => r.id);

    // Should contain parent file (outgoing contains)
    expect(ids).toContain('app.ts');
    // Should NOT contain router.ts (reverse imports filtered)
    expect(ids).not.toContain('router.ts');
  });
});

// ---------------------------------------------------------------------------
// Remaining coverage gaps
// ---------------------------------------------------------------------------

describe('multiple implements', () => {
  let pf: ParsedFile;
  beforeAll(async () => {
    const tmpFile = path.join(FIXTURES, '_multi_impl.ts');
    fs.writeFileSync(tmpFile, `
interface Readable { read(): void; }
interface Writable { write(): void; }
interface Closeable { close(): void; }
export class Stream implements Readable, Writable, Closeable {
  read(): void {}
  write(): void {}
  close(): void {}
}
`);
    pf = await parseCodeFile(tmpFile, FIXTURES, MTIME);
    fs.unlinkSync(tmpFile);
  });

  it('creates implements edges to all 3 interfaces', () => {
    expect(hasEdge(pf, '_multi_impl.ts::Stream', '_multi_impl.ts::Readable', 'implements')).toBe(true);
    expect(hasEdge(pf, '_multi_impl.ts::Stream', '_multi_impl.ts::Writable', 'implements')).toBe(true);
    expect(hasEdge(pf, '_multi_impl.ts::Stream', '_multi_impl.ts::Closeable', 'implements')).toBe(true);
  });
});

describe('empty interface and class without members', () => {
  let pf: ParsedFile;
  beforeAll(async () => {
    const tmpFile = path.join(FIXTURES, '_empty_members.ts');
    fs.writeFileSync(tmpFile, `
export interface Empty {}
export class Hollow {}
`);
    pf = await parseCodeFile(tmpFile, FIXTURES, MTIME);
    fs.unlinkSync(tmpFile);
  });

  it('empty interface has no child nodes', () => {
    const children = pf.nodes.filter(n => n.id.startsWith('_empty_members.ts::Empty::'));
    expect(children).toHaveLength(0);
  });

  it('empty class has no child nodes', () => {
    const children = pf.nodes.filter(n => n.id.startsWith('_empty_members.ts::Hollow::'));
    expect(children).toHaveLength(0);
  });

  it('both are extracted as nodes', () => {
    expect(node(pf, '_empty_members.ts::Empty')).toBeDefined();
    expect(node(pf, '_empty_members.ts::Hollow')).toBeDefined();
  });
});

describe('public class field', () => {
  let pf: ParsedFile;
  beforeAll(async () => {
    const tmpFile = path.join(FIXTURES, '_pub_field.ts');
    fs.writeFileSync(tmpFile, `
export class Config {
  public name: string = 'default';
  public version = 1;
}
`);
    pf = await parseCodeFile(tmpFile, FIXTURES, MTIME);
    fs.unlinkSync(tmpFile);
  });

  it('public field name extracted', () => {
    expect(node(pf, '_pub_field.ts::Config::name')).toBeDefined();
  });

  it('public field version extracted', () => {
    expect(node(pf, '_pub_field.ts::Config::version')).toBeDefined();
  });

  it('public fields have kind variable', () => {
    expect(node(pf, '_pub_field.ts::Config::name')?.attrs.kind).toBe('variable');
    expect(node(pf, '_pub_field.ts::Config::version')?.attrs.kind).toBe('variable');
  });
});

describe('parent dir import (../)', () => {
  let pf: ParsedFile;
  const subDir = path.join(FIXTURES, 'sub');

  beforeAll(async () => {
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(path.join(subDir, 'child.ts'), `import type { NodeAttrs } from '../types';\n`);
    pf = await parseCodeFile(path.join(subDir, 'child.ts'), FIXTURES, MTIME);
  });

  afterAll(() => { fs.rmSync(subDir, { recursive: true, force: true }); });

  it('resolves parent dir import to types.ts', () => {
    expect(hasEdge(pf, 'sub/child.ts', 'types.ts', 'imports')).toBe(true);
  });
});

describe('out-of-project import', () => {
  let pf: ParsedFile;
  const subDir = path.join(FIXTURES, 'isolated');

  beforeAll(async () => {
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(path.join(subDir, 'mod.ts'), `import { foo } from '../types';\n`);
    // Parse with subDir as project root — ../types is outside
    clearPathMappingsCache();
    pf = await parseCodeFile(path.join(subDir, 'mod.ts'), subDir, MTIME);
  });

  afterAll(() => { fs.rmSync(subDir, { recursive: true, force: true }); });

  it('skips imports that resolve outside project dir', () => {
    const importEdges = pf.edges.filter(e => e.attrs.kind === 'imports');
    expect(importEdges).toHaveLength(0);
  });
});

describe('self-import skip', () => {
  let pf: ParsedFile;

  beforeAll(async () => {
    const tmpFile = path.join(FIXTURES, '_self.ts');
    fs.writeFileSync(tmpFile, `import { x } from './_self';\nexport const x = 1;\n`);
    pf = await parseCodeFile(tmpFile, FIXTURES, MTIME);
    fs.unlinkSync(tmpFile);
  });

  it('does not create self-referencing import edge', () => {
    const selfEdges = pf.edges.filter(e => e.from === '_self.ts' && e.to === '_self.ts');
    expect(selfEdges).toHaveLength(0);
  });
});

describe('index file resolution', () => {
  const idxDir = path.join(FIXTURES, '_idx_test');
  const utilsDir = path.join(idxDir, 'utils');

  beforeAll(async () => {
    fs.mkdirSync(utilsDir, { recursive: true });
    fs.writeFileSync(path.join(utilsDir, 'index.ts'), 'export const helper = 1;\n');
    fs.writeFileSync(path.join(idxDir, 'main.ts'), `import { helper } from './utils';\n`);
  });

  afterAll(() => { fs.rmSync(idxDir, { recursive: true, force: true }); });

  it('resolves import to utils/index.ts', async () => {
    clearPathMappingsCache();
    const pf = await parseCodeFile(path.join(idxDir, 'main.ts'), idxDir, MTIME);
    expect(hasEdge(pf, 'main.ts', 'utils/index.ts', 'imports')).toBe(true);
  });
});

describe('malformed tsconfig', () => {
  const tmpDir2 = path.join(FIXTURES, '_malformed_cfg');

  beforeAll(() => {
    fs.mkdirSync(tmpDir2, { recursive: true });
    fs.writeFileSync(path.join(tmpDir2, 'tsconfig.json'), '{ not valid json!!!');
    fs.writeFileSync(path.join(tmpDir2, 'a.ts'), `import { x } from '@bad/mod';\nexport const y = 1;\n`);
  });

  afterAll(() => { fs.rmSync(tmpDir2, { recursive: true, force: true }); });

  it('does not crash on malformed tsconfig, just skips alias resolution', async () => {
    clearPathMappingsCache();
    const pf = await parseCodeFile(path.join(tmpDir2, 'a.ts'), tmpDir2, MTIME);
    expect(pf.nodes.length).toBeGreaterThan(0);
    expect(pf.edges.filter(e => e.attrs.kind === 'imports')).toHaveLength(0);
  });
});

describe('stripJsoncComments edge cases', () => {
  const tmpDir3 = path.join(FIXTURES, '_jsonc_edge');

  beforeEach(() => {
    fs.mkdirSync(tmpDir3, { recursive: true });
    clearPathMappingsCache();
  });
  afterEach(() => { fs.rmSync(tmpDir3, { recursive: true, force: true }); });

  it('handles escaped quotes in JSON strings', async () => {
    fs.writeFileSync(path.join(tmpDir3, 'tsconfig.json'), `{
      "compilerOptions": {
        "baseUrl": ".",
        "paths": { "@e/*": ["./*"] }
      }
    }`);
    fs.writeFileSync(path.join(tmpDir3, 'desc.ts'), 'export const desc = "a \\"quoted\\" value";\n');
    fs.writeFileSync(path.join(tmpDir3, 'user.ts'), 'import { desc } from "@e/desc";\n');
    const pf = await parseCodeFile(path.join(tmpDir3, 'user.ts'), tmpDir3, MTIME);
    expect(hasEdge(pf, 'user.ts', 'desc.ts', 'imports')).toBe(true);
  });

  it('handles empty tsconfig gracefully', async () => {
    fs.writeFileSync(path.join(tmpDir3, 'tsconfig.json'), '{}');
    fs.writeFileSync(path.join(tmpDir3, 'solo.ts'), 'export const z = 1;\n');
    const pf = await parseCodeFile(path.join(tmpDir3, 'solo.ts'), tmpDir3, MTIME);
    expect(pf.nodes.length).toBeGreaterThan(0);
  });
});

describe('jsconfig.json fallback', () => {
  const tmpDir4 = path.join(FIXTURES, '_jsconfig');

  beforeAll(() => {
    fs.mkdirSync(tmpDir4, { recursive: true });
    fs.writeFileSync(path.join(tmpDir4, 'jsconfig.json'), JSON.stringify({
      compilerOptions: { baseUrl: '.', paths: { '@js/*': ['./*'] } }
    }));
    fs.writeFileSync(path.join(tmpDir4, 'lib.ts'), 'export const val = 42;\n');
    fs.writeFileSync(path.join(tmpDir4, 'app.ts'), 'import { val } from "@js/lib";\n');
  });
  afterAll(() => { fs.rmSync(tmpDir4, { recursive: true, force: true }); });

  it('resolves aliases from jsconfig.json when no tsconfig.json', async () => {
    clearPathMappingsCache();
    const pf = await parseCodeFile(path.join(tmpDir4, 'app.ts'), tmpDir4, MTIME);
    expect(hasEdge(pf, 'app.ts', 'lib.ts', 'imports')).toBe(true);
  });
});

describe('function_expression in variable', () => {
  let pf: ParsedFile;
  beforeAll(async () => {
    const tmpFile = path.join(FIXTURES, '_fn_expr.ts');
    fs.writeFileSync(tmpFile, `export const handler = function handleReq() { return 1; };\n`);
    pf = await parseCodeFile(tmpFile, FIXTURES, MTIME);
    fs.unlinkSync(tmpFile);
  });

  it('function_expression detected as function kind', () => {
    expect(node(pf, '_fn_expr.ts::handler')?.attrs.kind).toBe('function');
  });

  it('signature does not include body', () => {
    const sig = node(pf, '_fn_expr.ts::handler')?.attrs.signature ?? '';
    expect(sig).not.toContain('return 1');
  });
});
