import {
  createGraph, updateFile, removeFile,
  getFileChunks, getFileMtime, listFiles,
  saveGraph, loadGraph,
} from '@/graphs/docs';
import type { Chunk } from '@/lib/parsers/docs';
import { GRAPH_DATA_VERSION } from '@/lib/defaults';
import fs from 'fs';

const STORE = '/tmp/graph-test-assertions';

const API_MTIME  = 1000;
const AUTH_MTIME = 2000;

const apiChunks: Chunk[] = [
  { id: 'docs/api.md',            fileId: 'docs/api.md', title: 'API Reference', content: 'REST API docs.', level: 1, links: [],               embedding: [], symbols: [] },
  { id: 'docs/api.md::Endpoints', fileId: 'docs/api.md', title: 'Endpoints',     content: 'GET /users.',   level: 2, links: [],               embedding: [], symbols: [] },
];

const authChunks: Chunk[] = [
  { id: 'docs/auth.md',             fileId: 'docs/auth.md', title: 'Auth Guide',  content: 'Intro.',          level: 1, links: ['docs/api.md'], embedding: [], symbols: [] },
  { id: 'docs/auth.md::Overview',   fileId: 'docs/auth.md', title: 'Overview',    content: 'JWT tokens.',     level: 2, links: [],              embedding: [], symbols: [] },
  { id: 'docs/auth.md::Token Flow', fileId: 'docs/auth.md', title: 'Token Flow',  content: 'Access tokens.',  level: 2, links: [],              embedding: [], symbols: [] },
];

describe('docs graph CRUD', () => {
  let graph = createGraph();

  beforeAll(() => {
    if (fs.existsSync(STORE)) fs.rmSync(STORE, { recursive: true });
    // api must be indexed first so auth's link edge can be created
    updateFile(graph, apiChunks, API_MTIME);
    updateFile(graph, authChunks, AUTH_MTIME);
  });

  afterAll(() => {
    if (fs.existsSync(STORE)) fs.rmSync(STORE, { recursive: true });
  });

  describe('updateFile — initial state', () => {
    it('has 5 nodes total (2 api + 3 auth)', () => {
      expect(graph.order).toBe(5);
    });

    it('has 4 edges (1 api-sibling + 2 auth-siblings + 1 link)', () => {
      expect(graph.size).toBe(4);
    });

    it('has sibling edge: api.md -> api.md::Endpoints', () => {
      expect(graph.hasEdge('docs/api.md', 'docs/api.md::Endpoints')).toBe(true);
    });

    it('has sibling edge: auth.md -> auth.md::Overview', () => {
      expect(graph.hasEdge('docs/auth.md', 'docs/auth.md::Overview')).toBe(true);
    });

    it('has sibling edge: auth.md::Overview -> auth.md::Token Flow', () => {
      expect(graph.hasEdge('docs/auth.md::Overview', 'docs/auth.md::Token Flow')).toBe(true);
    });

    it('has link edge: auth.md -> api.md (cross-file)', () => {
      expect(graph.hasEdge('docs/auth.md', 'docs/api.md')).toBe(true);
    });
  });

  describe('getFileMtime', () => {
    it('api.md mtime = API_MTIME', () => {
      expect(getFileMtime(graph, 'docs/api.md')).toBe(API_MTIME);
    });

    it('auth.md mtime = AUTH_MTIME', () => {
      expect(getFileMtime(graph, 'docs/auth.md')).toBe(AUTH_MTIME);
    });

    it('unknown file mtime = 0', () => {
      expect(getFileMtime(graph, 'docs/ghost.md')).toBe(0);
    });
  });

  describe('listFiles', () => {
    it('returns 2 entries', () => {
      const files = listFiles(graph);
      expect(files).toHaveLength(2);
    });

    it('sorted alphabetically: api first', () => {
      const files = listFiles(graph);
      expect(files[0].fileId).toBe('docs/api.md');
    });

    it('api.md title = "API Reference"', () => {
      const files = listFiles(graph);
      expect(files[0].title).toBe('API Reference');
    });

    it('api.md chunks = 2', () => {
      const files = listFiles(graph);
      expect(files[0].chunks).toBe(2);
    });

    it('auth.md chunks = 3', () => {
      const files = listFiles(graph);
      expect(files[1].chunks).toBe(3);
    });

    it('auth.md title = "Auth Guide"', () => {
      const files = listFiles(graph);
      expect(files[1].title).toBe('Auth Guide');
    });
  });

  describe('getFileChunks', () => {
    it('getFileChunks(auth.md) = 3 items', () => {
      const authList = getFileChunks(graph, 'docs/auth.md');
      expect(authList).toHaveLength(3);
    });

    it('all items have fileId = docs/auth.md', () => {
      const authList = getFileChunks(graph, 'docs/auth.md');
      expect(authList.every(c => c.fileId === 'docs/auth.md')).toBe(true);
    });

    it('root chunk has level 1', () => {
      const authList = getFileChunks(graph, 'docs/auth.md');
      expect(authList.find(c => c.id === 'docs/auth.md')?.level).toBe(1);
    });

    it('Overview has level 2', () => {
      const authList = getFileChunks(graph, 'docs/auth.md');
      expect(authList.find(c => c.id === 'docs/auth.md::Overview')?.level).toBe(2);
    });

    it('root content preserved', () => {
      const authList = getFileChunks(graph, 'docs/auth.md');
      expect(authList.find(c => c.id === 'docs/auth.md')?.content).toBe('Intro.');
    });

    it('getFileChunks unknown = empty', () => {
      expect(getFileChunks(graph, 'docs/ghost.md')).toHaveLength(0);
    });
  });

  describe('saveGraph / loadGraph', () => {
    it('reloaded graph has 5 nodes', () => {
      saveGraph(graph, STORE);
      const graph2 = loadGraph(STORE);
      expect(graph2.order).toBe(5);
    });

    it('reloaded graph has 4 edges', () => {
      const graph2 = loadGraph(STORE);
      expect(graph2.size).toBe(4);
    });

    it('reloaded: cross-file edge auth->api', () => {
      const graph2 = loadGraph(STORE);
      expect(graph2.hasEdge('docs/auth.md', 'docs/api.md')).toBe(true);
    });

    it('reloaded: api.md title preserved', () => {
      const graph2 = loadGraph(STORE);
      expect(graph2.getNodeAttribute('docs/api.md', 'title')).toBe('API Reference');
    });

    it('reloaded: mtime preserved', () => {
      const graph2 = loadGraph(STORE);
      expect(graph2.getNodeAttribute('docs/api.md', 'mtime')).toBe(API_MTIME);
    });

    it('loadGraph with no file returns empty graph', () => {
      const graph3 = loadGraph(STORE + '/nonexistent');
      expect(graph3.order).toBe(0);
    });

    it('loadGraph discards graph when version mismatches', () => {
      // Tamper stored version to simulate old data
      const file = STORE + '/docs.json';
      const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
      data.version = 1;
      fs.writeFileSync(file, JSON.stringify(data));
      const graph4 = loadGraph(STORE);
      expect(graph4.order).toBe(0); // discarded, empty graph
    });

    it('loadGraph discards graph when version is missing', () => {
      const file = STORE + '/docs.json';
      const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
      delete data.version;
      fs.writeFileSync(file, JSON.stringify(data));
      const graph5 = loadGraph(STORE);
      expect(graph5.order).toBe(0);
    });

    it('saved graph includes current GRAPH_DATA_VERSION', () => {
      saveGraph(graph, STORE);
      const file = STORE + '/docs.json';
      const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
      expect(data.version).toBe(GRAPH_DATA_VERSION);
    });
  });

  describe('updateFile re-index', () => {
    beforeAll(() => {
      const apiV2: Chunk[] = [
        { id: 'docs/api.md', fileId: 'docs/api.md', title: 'API v2', content: 'New docs.', level: 1, links: [], embedding: [], symbols: [] },
      ];
      updateFile(graph, apiV2, API_MTIME + 1);
    });

    it('after re-index: api.md has 1 chunk', () => {
      expect(getFileChunks(graph, 'docs/api.md')).toHaveLength(1);
    });

    it('after re-index: title updated to "API v2"', () => {
      expect(listFiles(graph).find(f => f.fileId === 'docs/api.md')?.title).toBe('API v2');
    });

    it('after re-index: api.md::Endpoints node removed', () => {
      expect(graph.hasNode('docs/api.md::Endpoints')).toBe(false);
    });

    it('after re-index: mtime updated', () => {
      expect(getFileMtime(graph, 'docs/api.md')).toBe(API_MTIME + 1);
    });

    it('after re-index: auth.md still has 3 chunks', () => {
      expect(getFileChunks(graph, 'docs/auth.md')).toHaveLength(3);
    });
  });

  describe('removeFile', () => {
    beforeAll(() => {
      // Restore clean state
      updateFile(graph, apiChunks, API_MTIME);
      updateFile(graph, authChunks, AUTH_MTIME);
      removeFile(graph, 'docs/auth.md');
    });

    it('after remove: 2 nodes (api only)', () => {
      expect(graph.order).toBe(2);
    });

    it('after remove: auth.md root gone', () => {
      expect(graph.hasNode('docs/auth.md')).toBe(false);
    });

    it('after remove: auth.md::Overview gone', () => {
      expect(graph.hasNode('docs/auth.md::Overview')).toBe(false);
    });

    it('after remove: api.md still present', () => {
      expect(graph.hasNode('docs/api.md')).toBe(true);
    });

    it('after remove: api.md::Endpoints still present', () => {
      expect(graph.hasNode('docs/api.md::Endpoints')).toBe(true);
    });

    it('after remove: api sibling edge still present', () => {
      expect(graph.hasEdge('docs/api.md', 'docs/api.md::Endpoints')).toBe(true);
    });

    it('removeFile non-existent is no-op', () => {
      removeFile(graph, 'docs/ghost.md');
      expect(graph.order).toBe(2);
    });
  });
});
