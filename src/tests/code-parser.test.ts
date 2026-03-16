import path from 'path';
import { parseCodeFile, getProject, resetProject } from '@/lib/parsers/code';
import type { ParsedFile } from '@/lib/parsers/code';

const FIXTURES = path.join(__dirname, 'fixtures', 'code');
const MTIME = 1000;

resetProject();
const project = getProject(FIXTURES);

function node(pf: ParsedFile, id: string) {
  return pf.nodes.find(n => n.id === id);
}

function hasEdge(pf: ParsedFile, from: string, to: string, kind: string): boolean {
  return pf.edges.some(e => e.from === from && e.to === to && e.attrs.kind === kind);
}

describe('types.ts', () => {
  const typesPath = path.join(FIXTURES, 'types.ts');
  const types = parseCodeFile(typesPath, FIXTURES, MTIME, project);

  it('fileId is types.ts', () => {
    expect(types.fileId).toBe('types.ts');
  });

  it('mtime is preserved', () => {
    expect(types.mtime).toBe(MTIME);
  });

  it('file node exists', () => {
    expect(node(types, 'types.ts')).toBeDefined();
  });

  it('file node kind is file', () => {
    expect(node(types, 'types.ts')?.attrs.kind).toBe('file');
  });

  it('file node name is types.ts', () => {
    expect(node(types, 'types.ts')?.attrs.name).toBe('types.ts');
  });

  it('file node isExported false', () => {
    expect(node(types, 'types.ts')?.attrs.isExported).toBe(false);
  });

  it('file node docComment contains "Attributes"', () => {
    expect(node(types, 'types.ts')?.attrs.docComment).toContain('Attributes');
  });

  it('NodeAttrs node exists', () => {
    expect(node(types, 'types.ts::NodeAttrs')).toBeDefined();
  });

  it('NodeAttrs kind is interface', () => {
    expect(node(types, 'types.ts::NodeAttrs')?.attrs.kind).toBe('interface');
  });

  it('NodeAttrs isExported true', () => {
    expect(node(types, 'types.ts::NodeAttrs')?.attrs.isExported).toBe(true);
  });

  it('NodeAttrs docComment contains "Attributes"', () => {
    expect(node(types, 'types.ts::NodeAttrs')?.attrs.docComment).toContain('Attributes');
  });

  it('NodeAttrs contains edge from file', () => {
    expect(hasEdge(types, 'types.ts', 'types.ts::NodeAttrs', 'contains')).toBe(true);
  });

  it('NodeId node exists', () => {
    expect(node(types, 'types.ts::NodeId')).toBeDefined();
  });

  it('NodeId kind is type', () => {
    expect(node(types, 'types.ts::NodeId')?.attrs.kind).toBe('type');
  });

  it('NodeId isExported true', () => {
    expect(node(types, 'types.ts::NodeId')?.attrs.isExported).toBe(true);
  });

  it('NodeId contains edge from file', () => {
    expect(hasEdge(types, 'types.ts', 'types.ts::NodeId', 'contains')).toBe(true);
  });

  it('Direction node exists', () => {
    expect(node(types, 'types.ts::Direction')).toBeDefined();
  });

  it('Direction kind is enum', () => {
    expect(node(types, 'types.ts::Direction')?.attrs.kind).toBe('enum');
  });

  it('Direction isExported true', () => {
    expect(node(types, 'types.ts::Direction')?.attrs.isExported).toBe(true);
  });

  it('Direction docComment contains "Direction"', () => {
    expect(node(types, 'types.ts::Direction')?.attrs.docComment).toContain('Direction');
  });

  it('Direction contains edge from file', () => {
    expect(hasEdge(types, 'types.ts', 'types.ts::Direction', 'contains')).toBe(true);
  });

  it('has exactly 3 non-file nodes', () => {
    expect(types.nodes.filter(n => n.attrs.kind !== 'file')).toHaveLength(3);
  });
});

describe('graph.ts', () => {
  const graphPath = path.join(FIXTURES, 'graph.ts');
  const graph = parseCodeFile(graphPath, FIXTURES, MTIME, project);

  it('fileId is graph.ts', () => {
    expect(graph.fileId).toBe('graph.ts');
  });

  it('file node exists', () => {
    expect(node(graph, 'graph.ts')).toBeDefined();
  });

  it('file node name is graph.ts', () => {
    expect(node(graph, 'graph.ts')?.attrs.name).toBe('graph.ts');
  });

  it('DEFAULT_WEIGHT node exists', () => {
    expect(node(graph, 'graph.ts::DEFAULT_WEIGHT')).toBeDefined();
  });

  it('DEFAULT_WEIGHT kind is variable', () => {
    expect(node(graph, 'graph.ts::DEFAULT_WEIGHT')?.attrs.kind).toBe('variable');
  });

  it('DEFAULT_WEIGHT isExported true', () => {
    expect(node(graph, 'graph.ts::DEFAULT_WEIGHT')?.attrs.isExported).toBe(true);
  });

  it('DEFAULT_WEIGHT docComment contains "Default"', () => {
    expect(node(graph, 'graph.ts::DEFAULT_WEIGHT')?.attrs.docComment).toContain('Default');
  });

  it('DEFAULT_WEIGHT contains edge', () => {
    expect(hasEdge(graph, 'graph.ts', 'graph.ts::DEFAULT_WEIGHT', 'contains')).toBe(true);
  });

  it('GraphStore node exists', () => {
    expect(node(graph, 'graph.ts::GraphStore')).toBeDefined();
  });

  it('GraphStore kind is class', () => {
    expect(node(graph, 'graph.ts::GraphStore')?.attrs.kind).toBe('class');
  });

  it('GraphStore isExported true', () => {
    expect(node(graph, 'graph.ts::GraphStore')?.attrs.isExported).toBe(true);
  });

  it('GraphStore docComment contains "in-memory"', () => {
    expect(node(graph, 'graph.ts::GraphStore')?.attrs.docComment).toContain('in-memory');
  });

  it('GraphStore contains edge', () => {
    expect(hasEdge(graph, 'graph.ts', 'graph.ts::GraphStore', 'contains')).toBe(true);
  });

  it('GraphStore::set method node exists', () => {
    expect(node(graph, 'graph.ts::GraphStore::set')).toBeDefined();
  });

  it('GraphStore::set kind is method', () => {
    expect(node(graph, 'graph.ts::GraphStore::set')?.attrs.kind).toBe('method');
  });

  it('GraphStore::set docComment contains "Add"', () => {
    expect(node(graph, 'graph.ts::GraphStore::set')?.attrs.docComment).toContain('Add');
  });

  it('GraphStore::set contains edge from class', () => {
    expect(hasEdge(graph, 'graph.ts::GraphStore', 'graph.ts::GraphStore::set', 'contains')).toBe(true);
  });

  it('GraphStore::get method node exists', () => {
    expect(node(graph, 'graph.ts::GraphStore::get')).toBeDefined();
  });

  it('GraphStore::get kind is method', () => {
    expect(node(graph, 'graph.ts::GraphStore::get')?.attrs.kind).toBe('method');
  });

  it('GraphStore::get docComment contains "Retrieve"', () => {
    expect(node(graph, 'graph.ts::GraphStore::get')?.attrs.docComment).toContain('Retrieve');
  });

  it('GraphStore::get contains edge from class', () => {
    expect(hasEdge(graph, 'graph.ts::GraphStore', 'graph.ts::GraphStore::get', 'contains')).toBe(true);
  });

  it('createStore node exists', () => {
    expect(node(graph, 'graph.ts::createStore')).toBeDefined();
  });

  it('createStore kind is function', () => {
    expect(node(graph, 'graph.ts::createStore')?.attrs.kind).toBe('function');
  });

  it('createStore isExported true', () => {
    expect(node(graph, 'graph.ts::createStore')?.attrs.isExported).toBe(true);
  });

  it('createStore docComment contains "Create"', () => {
    expect(node(graph, 'graph.ts::createStore')?.attrs.docComment).toContain('Create');
  });

  it('createStore contains edge', () => {
    expect(hasEdge(graph, 'graph.ts', 'graph.ts::createStore', 'contains')).toBe(true);
  });

  it('internalHelper node exists', () => {
    expect(node(graph, 'graph.ts::internalHelper')).toBeDefined();
  });

  it('internalHelper isExported false', () => {
    expect(node(graph, 'graph.ts::internalHelper')?.attrs.isExported).toBe(false);
  });

  it('internalHelper kind is function', () => {
    expect(node(graph, 'graph.ts::internalHelper')?.attrs.kind).toBe('function');
  });

  it('createStore signature contains "Create" (from JSDoc first line)', () => {
    expect(node(graph, 'graph.ts::createStore')?.attrs.signature).toContain('Create');
  });
});

describe('search.ts', () => {
  const searchPath = path.join(FIXTURES, 'search.ts');
  const search = parseCodeFile(searchPath, FIXTURES, MTIME, project);

  it('fileId is search.ts', () => {
    expect(search.fileId).toBe('search.ts');
  });

  it('SearchOptions node exists', () => {
    expect(node(search, 'search.ts::SearchOptions')).toBeDefined();
  });

  it('SearchOptions kind is interface', () => {
    expect(node(search, 'search.ts::SearchOptions')?.attrs.kind).toBe('interface');
  });

  it('SearchOptions isExported true', () => {
    expect(node(search, 'search.ts::SearchOptions')?.attrs.isExported).toBe(true);
  });

  it('SearchOptions contains edge', () => {
    expect(hasEdge(search, 'search.ts', 'search.ts::SearchOptions', 'contains')).toBe(true);
  });

  it('searchNodes node exists', () => {
    expect(node(search, 'search.ts::searchNodes')).toBeDefined();
  });

  it('searchNodes kind is function', () => {
    expect(node(search, 'search.ts::searchNodes')?.attrs.kind).toBe('function');
  });

  it('searchNodes isExported true', () => {
    expect(node(search, 'search.ts::searchNodes')?.attrs.isExported).toBe(true);
  });

  it('searchNodes docComment contains "Search nodes"', () => {
    expect(node(search, 'search.ts::searchNodes')?.attrs.docComment).toContain('Search nodes');
  });

  it('searchNodes docComment contains "weight"', () => {
    expect(node(search, 'search.ts::searchNodes')?.attrs.docComment).toContain('weight');
  });

  it('searchNodes body contains "export function searchNodes"', () => {
    expect(node(search, 'search.ts::searchNodes')?.attrs.body).toContain('export function searchNodes');
  });

  it('searchNodes contains edge', () => {
    expect(hasEdge(search, 'search.ts', 'search.ts::searchNodes', 'contains')).toBe(true);
  });

  it('formatResult node exists', () => {
    expect(node(search, 'search.ts::formatResult')).toBeDefined();
  });

  it('formatResult kind is function (arrow)', () => {
    expect(node(search, 'search.ts::formatResult')?.attrs.kind).toBe('function');
  });

  it('formatResult isExported true', () => {
    expect(node(search, 'search.ts::formatResult')?.attrs.isExported).toBe(true);
  });

  it('formatResult docComment contains "Format"', () => {
    expect(node(search, 'search.ts::formatResult')?.attrs.docComment).toContain('Format');
  });

  it('formatResult contains edge', () => {
    expect(hasEdge(search, 'search.ts', 'search.ts::formatResult', 'contains')).toBe(true);
  });

  it('searchNodes startLine >= 1', () => {
    expect(node(search, 'search.ts::searchNodes')?.attrs.startLine).toBeGreaterThanOrEqual(1);
  });

  it('searchNodes endLine >= startLine', () => {
    const sn = node(search, 'search.ts::searchNodes');
    expect(sn?.attrs.endLine).toBeGreaterThanOrEqual(sn?.attrs.startLine ?? 0);
  });

  it('searchNodes body contains "return []"', () => {
    expect(node(search, 'search.ts::searchNodes')?.attrs.body).toContain('return []');
  });
});

describe('import edges', () => {
  const searchPath = path.join(FIXTURES, 'search.ts');
  const search = parseCodeFile(searchPath, FIXTURES, MTIME, project);
  const typesPath = path.join(FIXTURES, 'types.ts');
  const types = parseCodeFile(typesPath, FIXTURES, MTIME, project);
  const graphPath = path.join(FIXTURES, 'graph.ts');
  const graph = parseCodeFile(graphPath, FIXTURES, MTIME, project);

  it('search.ts imports edge -> types.ts', () => {
    expect(hasEdge(search, 'search.ts', 'types.ts', 'imports')).toBe(true);
  });

  it('search.ts imports edge -> graph.ts', () => {
    expect(hasEdge(search, 'search.ts', 'graph.ts', 'imports')).toBe(true);
  });

  it('types.ts has no import edges', () => {
    expect(types.edges.filter(e => e.attrs.kind === 'imports')).toHaveLength(0);
  });

  it('graph.ts imports edge -> types.ts', () => {
    expect(hasEdge(graph, 'graph.ts', 'types.ts', 'imports')).toBe(true);
  });
});

describe('store.ts', () => {
  const storePath = path.join(FIXTURES, 'store.ts');
  const store = parseCodeFile(storePath, FIXTURES, MTIME, project);

  it('fileId is store.ts', () => {
    expect(store.fileId).toBe('store.ts');
  });

  it('Storable node exists', () => {
    expect(node(store, 'store.ts::Storable')).toBeDefined();
  });

  it('Storable kind is interface', () => {
    expect(node(store, 'store.ts::Storable')?.attrs.kind).toBe('interface');
  });

  it('Storable isExported true', () => {
    expect(node(store, 'store.ts::Storable')?.attrs.isExported).toBe(true);
  });

  it('Storable contains edge', () => {
    expect(hasEdge(store, 'store.ts', 'store.ts::Storable', 'contains')).toBe(true);
  });

  it('BaseStore node exists', () => {
    expect(node(store, 'store.ts::BaseStore')).toBeDefined();
  });

  it('BaseStore kind is class', () => {
    expect(node(store, 'store.ts::BaseStore')?.attrs.kind).toBe('class');
  });

  it('BaseStore isExported true', () => {
    expect(node(store, 'store.ts::BaseStore')?.attrs.isExported).toBe(true);
  });

  it('BaseStore contains edge from file', () => {
    expect(hasEdge(store, 'store.ts', 'store.ts::BaseStore', 'contains')).toBe(true);
  });

  it('BaseStore::clear method exists', () => {
    expect(node(store, 'store.ts::BaseStore::clear')).toBeDefined();
  });

  it('BaseStore::clear kind is method', () => {
    expect(node(store, 'store.ts::BaseStore::clear')?.attrs.kind).toBe('method');
  });

  it('BaseStore::clear contains edge from class', () => {
    expect(hasEdge(store, 'store.ts::BaseStore', 'store.ts::BaseStore::clear', 'contains')).toBe(true);
  });

  it('CachedStore node exists', () => {
    expect(node(store, 'store.ts::CachedStore')).toBeDefined();
  });

  it('CachedStore kind is class', () => {
    expect(node(store, 'store.ts::CachedStore')?.attrs.kind).toBe('class');
  });

  it('CachedStore isExported true', () => {
    expect(node(store, 'store.ts::CachedStore')?.attrs.isExported).toBe(true);
  });

  it('CachedStore contains edge from file', () => {
    expect(hasEdge(store, 'store.ts', 'store.ts::CachedStore', 'contains')).toBe(true);
  });

  it('extends edge: CachedStore -> BaseStore', () => {
    expect(hasEdge(store, 'store.ts::CachedStore', 'store.ts::BaseStore', 'extends')).toBe(true);
  });

  it('implements edge: CachedStore -> Storable', () => {
    expect(hasEdge(store, 'store.ts::CachedStore', 'store.ts::Storable', 'implements')).toBe(true);
  });

  it('CachedStore::persist method exists', () => {
    expect(node(store, 'store.ts::CachedStore::persist')).toBeDefined();
  });

  it('CachedStore::persist kind is method', () => {
    expect(node(store, 'store.ts::CachedStore::persist')?.attrs.kind).toBe('method');
  });

  it('CachedStore::persist contains edge from class', () => {
    expect(hasEdge(store, 'store.ts::CachedStore', 'store.ts::CachedStore::persist', 'contains')).toBe(true);
  });
});
