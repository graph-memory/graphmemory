import fs from 'fs';
import {
  createCodeGraph, updateCodeFile, removeCodeFile,
  getFileSymbols, getCodeFileMtime, listCodeFiles,
  saveCodeGraph, loadCodeGraph,
} from '@/graphs/code';
import type { ParsedFile } from '@/lib/parsers/code';
import { GRAPH_DATA_VERSION } from '@/lib/defaults';

const STORE = '/tmp/code-graph-test';

function makeFile(fileId: string, mtime: number, symbols: string[], edges: Array<[string, string, string]> = []): ParsedFile {
  return {
    fileId,
    mtime,
    nodes: [
      {
        id: fileId,
        attrs: {
          kind: 'file', fileId, name: fileId.split('/').pop()!,
          signature: fileId, docComment: '', body: '',
          startLine: 1, endLine: 100, isExported: false,
          embedding: [], fileEmbedding: [], mtime,
        },
      },
      ...symbols.map((sym, i) => ({
        id: `${fileId}::${sym}`,
        attrs: {
          kind: 'function' as const, fileId, name: sym,
          signature: `export function ${sym}()`,
          docComment: `/** ${sym} doc */`,
          body: `function ${sym}() {}`,
          startLine: (i + 1) * 10, endLine: (i + 1) * 10 + 5,
          isExported: true, embedding: [], fileEmbedding: [], mtime,
        },
      })),
    ],
    edges: [
      ...symbols.map(sym => ({
        from: fileId,
        to: `${fileId}::${sym}`,
        attrs: { kind: 'contains' as const },
      })),
      ...edges.map(([from, to, kind]) => ({ from, to, attrs: { kind: kind as 'imports' } })),
    ],
  };
}

const GRAPH_MTIME  = 1000;
const SEARCH_MTIME = 2000;

const graphFile  = makeFile('src/graph.ts',  GRAPH_MTIME,  ['updateFile', 'removeFile']);
const searchFile = makeFile('src/search.ts', SEARCH_MTIME, ['search'],
  [['src/search.ts', 'src/graph.ts', 'imports']]);

describe('code graph CRUD', () => {
  let graph = createCodeGraph();

  beforeAll(() => {
    if (fs.existsSync(STORE)) fs.rmSync(STORE, { recursive: true });
    // graph.ts must exist before search.ts so imports edge can be created
    updateCodeFile(graph, graphFile);
    updateCodeFile(graph, searchFile);
  });

  afterAll(() => {
    if (fs.existsSync(STORE)) fs.rmSync(STORE, { recursive: true });
  });

  describe('updateCodeFile — initial state', () => {
    it('has 5 nodes total', () => {
      expect(graph.order).toBe(5);
    });

    it('has 4 edges total', () => {
      expect(graph.size).toBe(4);
    });

    it('src/graph.ts node exists', () => {
      expect(graph.hasNode('src/graph.ts')).toBe(true);
    });

    it('src/graph.ts::updateFile node exists', () => {
      expect(graph.hasNode('src/graph.ts::updateFile')).toBe(true);
    });

    it('src/graph.ts::removeFile node exists', () => {
      expect(graph.hasNode('src/graph.ts::removeFile')).toBe(true);
    });

    it('src/search.ts node exists', () => {
      expect(graph.hasNode('src/search.ts')).toBe(true);
    });

    it('src/search.ts::search node exists', () => {
      expect(graph.hasNode('src/search.ts::search')).toBe(true);
    });

    it('contains: graph.ts -> updateFile', () => {
      expect(graph.hasEdge('src/graph.ts', 'src/graph.ts::updateFile')).toBe(true);
    });

    it('contains: graph.ts -> removeFile', () => {
      expect(graph.hasEdge('src/graph.ts', 'src/graph.ts::removeFile')).toBe(true);
    });

    it('contains: search.ts -> search', () => {
      expect(graph.hasEdge('src/search.ts', 'src/search.ts::search')).toBe(true);
    });

    it('imports: search.ts -> graph.ts', () => {
      expect(graph.hasEdge('src/search.ts', 'src/graph.ts')).toBe(true);
    });
  });

  describe('getCodeFileMtime', () => {
    it('graph.ts mtime = GRAPH_MTIME', () => {
      expect(getCodeFileMtime(graph, 'src/graph.ts')).toBe(GRAPH_MTIME);
    });

    it('search.ts mtime = SEARCH_MTIME', () => {
      expect(getCodeFileMtime(graph, 'src/search.ts')).toBe(SEARCH_MTIME);
    });

    it('unknown file mtime = 0', () => {
      expect(getCodeFileMtime(graph, 'src/unknown.ts')).toBe(0);
    });
  });

  describe('listCodeFiles', () => {
    it('returns 2 files', () => {
      const files = listCodeFiles(graph);
      expect(files).toHaveLength(2);
    });

    it('sorted alphabetically: graph < search', () => {
      const files = listCodeFiles(graph);
      expect(files[0].fileId).toBe('src/graph.ts');
    });

    it('graph.ts has 3 symbols', () => {
      const files = listCodeFiles(graph);
      expect(files[0].symbolCount).toBe(3);
    });

    it('search.ts has 2 symbols', () => {
      const files = listCodeFiles(graph);
      expect(files[1].symbolCount).toBe(2);
    });
  });

  describe('getFileSymbols', () => {
    it('graph.ts: 3 symbols', () => {
      const graphSyms = getFileSymbols(graph, 'src/graph.ts');
      expect(graphSyms).toHaveLength(3);
    });

    it('sorted by startLine ascending', () => {
      const graphSyms = getFileSymbols(graph, 'src/graph.ts');
      const sorted = graphSyms.every((s, i) => i === 0 || s.startLine >= graphSyms[i - 1].startLine);
      expect(sorted).toBe(true);
    });

    it('file node is first (startLine=1)', () => {
      const graphSyms = getFileSymbols(graph, 'src/graph.ts');
      expect(graphSyms[0].kind).toBe('file');
    });

    it('updateFile symbol has correct attrs', () => {
      const graphSyms = getFileSymbols(graph, 'src/graph.ts');
      expect(graphSyms.some(s => s.name === 'updateFile' && s.kind === 'function' && s.isExported)).toBe(true);
    });

    it('docComment preserved on symbol', () => {
      const graphSyms = getFileSymbols(graph, 'src/graph.ts');
      expect(graphSyms.find(s => s.name === 'updateFile')?.docComment).toBe('/** updateFile doc */');
    });

    it('getFileSymbols unknown = empty', () => {
      expect(getFileSymbols(graph, 'src/unknown.ts')).toHaveLength(0);
    });
  });

  describe('updateCodeFile re-index', () => {
    beforeAll(() => {
      const graphV2 = makeFile('src/graph.ts', GRAPH_MTIME + 1, ['updateFile', 'addFile']);
      updateCodeFile(graph, graphV2);
    });

    it('after re-index: graph.ts still 3 nodes', () => {
      expect(getFileSymbols(graph, 'src/graph.ts')).toHaveLength(3);
    });

    it('after re-index: addFile exists', () => {
      expect(graph.hasNode('src/graph.ts::addFile')).toBe(true);
    });

    it('after re-index: removeFile removed', () => {
      expect(graph.hasNode('src/graph.ts::removeFile')).toBe(false);
    });

    it('after re-index: mtime updated', () => {
      expect(getCodeFileMtime(graph, 'src/graph.ts')).toBe(GRAPH_MTIME + 1);
    });

    it('after re-index: search.ts unchanged (2)', () => {
      expect(getFileSymbols(graph, 'src/search.ts')).toHaveLength(2);
    });

    it('after re-index: graph.ts::updateFile still has contains edge', () => {
      expect(graph.hasEdge('src/graph.ts', 'src/graph.ts::updateFile')).toBe(true);
    });
  });

  describe('saveCodeGraph / loadCodeGraph', () => {
    beforeAll(() => {
      // Restore original graph.ts for save/load test
      updateCodeFile(graph, graphFile);
    });

    it('reloaded: 5 nodes', () => {
      saveCodeGraph(graph, STORE);
      const graph2 = loadCodeGraph(STORE);
      expect(graph2.order).toBe(5);
    });

    it('reloaded: updateFile node exists', () => {
      const graph2 = loadCodeGraph(STORE);
      expect(graph2.hasNode('src/graph.ts::updateFile')).toBe(true);
    });

    it('reloaded: mtime preserved', () => {
      const graph2 = loadCodeGraph(STORE);
      expect(graph2.getNodeAttribute('src/graph.ts', 'mtime')).toBe(GRAPH_MTIME);
    });

    it('reloaded: contains edge preserved', () => {
      const graph2 = loadCodeGraph(STORE);
      expect(graph2.hasEdge('src/graph.ts', 'src/graph.ts::updateFile')).toBe(true);
    });

    it('loadCodeGraph with no file returns empty', () => {
      const graph3 = loadCodeGraph(STORE + '/nonexistent');
      expect(graph3.order).toBe(0);
    });

    it('discards graph when version mismatches', () => {
      const file = STORE + '/code.json';
      const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
      data.version = 1;
      fs.writeFileSync(file, JSON.stringify(data));
      const graph4 = loadCodeGraph(STORE);
      expect(graph4.order).toBe(0);
    });

    it('saved graph includes GRAPH_DATA_VERSION', () => {
      saveCodeGraph(graph, STORE);
      const file = STORE + '/code.json';
      const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
      expect(data.version).toBe(GRAPH_DATA_VERSION);
    });
  });

  describe('removeCodeFile', () => {
    beforeAll(() => {
      removeCodeFile(graph, 'src/search.ts');
    });

    it('after remove: 3 nodes remain (graph.ts only)', () => {
      expect(graph.order).toBe(3);
    });

    it('after remove: search.ts root gone', () => {
      expect(graph.hasNode('src/search.ts')).toBe(false);
    });

    it('after remove: search.ts::search gone', () => {
      expect(graph.hasNode('src/search.ts::search')).toBe(false);
    });

    it('after remove: graph.ts nodes intact', () => {
      expect(graph.hasNode('src/graph.ts::updateFile')).toBe(true);
    });

    it('after remove: graph.ts contains edges intact', () => {
      expect(graph.hasEdge('src/graph.ts', 'src/graph.ts::updateFile')).toBe(true);
    });

    it('removeCodeFile non-existent is no-op', () => {
      removeCodeFile(graph, 'src/ghost.ts');
      expect(graph.order).toBe(3);
    });
  });
});
