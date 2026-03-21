/**
 * Tests for graph manager functionality gaps:
 * - VersionConflictError (knowledge, task, skill)
 * - resolvePendingLinks (DocGraph)
 * - resolvePendingImports (CodeGraph)
 * - Manager methods: deleteTaskLink, deleteSkillLink, linkSkills, importFromFile (skill)
 * - getNodeUpdatedAt (all 3)
 * - Empty graph search, empty file, combined filters
 * - DocGraph: updateFile([]) early return, BM25 manager wrapper
 * - CodeGraph: circular imports BFS, ambiguous symbol names
 */

import {
  createKnowledgeGraph, createNote, updateNote, KnowledgeGraphManager,
} from '@/graphs/knowledge';
import {
  createTaskGraph, createTask, updateTask, moveTask,
  createTaskRelation, TaskGraphManager,
} from '@/graphs/task';
import {
  createSkillGraph, createSkill, updateSkill, SkillGraphManager,
} from '@/graphs/skill';
import {
  createGraph, updateFile, resolvePendingLinks, removeFile,
  DocGraphManager,
} from '@/graphs/docs';
import {
  createCodeGraph, updateCodeFile, resolvePendingImports, resolvePendingEdges,
} from '@/graphs/code';
import { searchCode } from '@/lib/search/code';
import { VersionConflictError } from '@/graphs/manager-types';
import type { GraphManagerContext } from '@/graphs/manager-types';
import type { Chunk } from '@/lib/parsers/docs';
import { unitVec, DIM, embedFnPair } from '@/tests/helpers';

function makeCtx(): GraphManagerContext {
  return { markDirty: jest.fn(), emit: jest.fn(), projectId: 'test', author: '' };
}

// ---------------------------------------------------------------------------
// VersionConflictError
// ---------------------------------------------------------------------------

describe('VersionConflictError', () => {
  describe('knowledge — updateNote', () => {
    const g = createKnowledgeGraph();
    let id: string;

    beforeAll(() => {
      id = createNote(g, 'Test Note', 'content', ['tag'], unitVec(0));
    });

    it('throws VersionConflictError when expectedVersion mismatches', () => {
      expect(() => updateNote(g, id, { title: 'Updated' }, undefined, '', 999))
        .toThrow(VersionConflictError);
    });

    it('error contains current and expected versions', () => {
      try {
        updateNote(g, id, { title: 'Updated' }, undefined, '', 999);
      } catch (e) {
        expect(e).toBeInstanceOf(VersionConflictError);
        expect((e as VersionConflictError).current).toBe(1);
        expect((e as VersionConflictError).expected).toBe(999);
      }
    });

    it('succeeds when expectedVersion matches', () => {
      const version = g.getNodeAttribute(id, 'version');
      expect(updateNote(g, id, { title: 'Updated' }, undefined, '', version)).toBe(true);
    });

    it('version increments after update', () => {
      const version = g.getNodeAttribute(id, 'version');
      expect(version).toBe(2);
    });
  });

  describe('task — updateTask', () => {
    const g = createTaskGraph();
    let id: string;

    beforeAll(() => {
      id = createTask(g, 'Test Task', 'desc', 'todo', 'medium', [], unitVec(0));
    });

    it('throws VersionConflictError on mismatch', () => {
      expect(() => updateTask(g, id, { title: 'X' }, undefined, '', 999))
        .toThrow(VersionConflictError);
    });

    it('succeeds when version matches', () => {
      const v = g.getNodeAttribute(id, 'version');
      expect(updateTask(g, id, { title: 'Updated Task' }, undefined, '', v)).toBe(true);
    });
  });

  describe('task — moveTask', () => {
    const g = createTaskGraph();
    let id: string;

    beforeAll(() => {
      id = createTask(g, 'Move Task', '', 'todo', 'low', [], unitVec(1));
    });

    it('throws VersionConflictError on mismatch', () => {
      expect(() => moveTask(g, id, 'in_progress', 999))
        .toThrow(VersionConflictError);
    });

    it('succeeds when version matches', () => {
      const v = g.getNodeAttribute(id, 'version');
      expect(moveTask(g, id, 'in_progress', v)).toBe(true);
    });
  });

  describe('skill — updateSkill', () => {
    const g = createSkillGraph();
    let id: string;

    beforeAll(() => {
      id = createSkill(g, 'Test Skill', 'desc', [], [], [], [], [], 'user', 1, unitVec(0));
    });

    it('throws VersionConflictError on mismatch', () => {
      expect(() => updateSkill(g, id, { title: 'X' }, undefined, '', 999))
        .toThrow(VersionConflictError);
    });

    it('succeeds when version matches', () => {
      const v = g.getNodeAttribute(id, 'version');
      expect(updateSkill(g, id, { title: 'Updated Skill' }, undefined, '', v)).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// resolvePendingLinks (DocGraph)
// ---------------------------------------------------------------------------

describe('resolvePendingLinks', () => {
  it('creates edges for targets added after initial index', () => {
    const graph = createGraph();

    // Index auth first — it links to api.md which doesn't exist yet
    const authChunks: Chunk[] = [
      { id: 'auth.md', fileId: 'auth.md', title: 'Auth', content: 'See api.', level: 1, links: ['api.md'], embedding: [], symbols: [] },
    ];
    updateFile(graph, authChunks, 1000);

    // auth.md should NOT have edge to api.md yet
    expect(graph.hasEdge('auth.md', 'api.md')).toBe(false);
    // But should have pendingLinks
    expect(graph.getNodeAttribute('auth.md', 'pendingLinks')).toContain('api.md');

    // Now index api
    const apiChunks: Chunk[] = [
      { id: 'api.md', fileId: 'api.md', title: 'API', content: 'API docs.', level: 1, links: [], embedding: [], symbols: [] },
    ];
    updateFile(graph, apiChunks, 1000);

    // Resolve pending
    const created = resolvePendingLinks(graph);

    expect(created).toBe(1);
    expect(graph.hasEdge('auth.md', 'api.md')).toBe(true);
    // pendingLinks should be cleared
    expect(graph.getNodeAttribute('auth.md', 'pendingLinks')).toBeUndefined();
  });

  it('keeps unresolved targets in pendingLinks', () => {
    const graph = createGraph();

    const chunks: Chunk[] = [
      { id: 'a.md', fileId: 'a.md', title: 'A', content: '', level: 1, links: ['ghost.md'], embedding: [], symbols: [] },
    ];
    updateFile(graph, chunks, 1000);

    const created = resolvePendingLinks(graph);
    expect(created).toBe(0);
    expect(graph.getNodeAttribute('a.md', 'pendingLinks')).toContain('ghost.md');
  });

  it('does not create self-referencing edge', () => {
    const graph = createGraph();

    const chunks: Chunk[] = [
      { id: 'self.md', fileId: 'self.md', title: 'Self', content: '', level: 1, links: ['self.md'], embedding: [], symbols: [] },
    ];
    updateFile(graph, chunks, 1000);

    const created = resolvePendingLinks(graph);
    expect(created).toBe(0);
  });

  it('does not create duplicate edge', () => {
    const graph = createGraph();

    const a: Chunk[] = [{ id: 'x.md', fileId: 'x.md', title: 'X', content: '', level: 1, links: ['y.md'], embedding: [], symbols: [] }];
    const b: Chunk[] = [{ id: 'y.md', fileId: 'y.md', title: 'Y', content: '', level: 1, links: [], embedding: [], symbols: [] }];
    updateFile(graph, b, 1000);
    updateFile(graph, a, 1000);
    // Edge already created during updateFile since y.md existed
    expect(graph.hasEdge('x.md', 'y.md')).toBe(true);

    // resolvePendingLinks should not create a duplicate
    const created = resolvePendingLinks(graph);
    expect(created).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// resolvePendingImports (CodeGraph)
// ---------------------------------------------------------------------------

describe('resolvePendingImports', () => {
  it('creates import edge for target added after initial index', () => {
    const graph = createCodeGraph();

    // File A references B, but B doesn't exist yet
    updateCodeFile(graph, {
      fileId: 'a.ts', mtime: 1000,
      nodes: [
        { id: 'a.ts', attrs: { kind: 'file', fileId: 'a.ts', name: 'a.ts', signature: '', docComment: '', body: '', startLine: 1, endLine: 10, isExported: false, embedding: [], fileEmbedding: [], mtime: 1000, pendingImports: ['b.ts'] } },
      ],
      edges: [],
    });

    expect(graph.hasEdge('a.ts', 'b.ts')).toBe(false);

    // Now add B
    updateCodeFile(graph, {
      fileId: 'b.ts', mtime: 1000,
      nodes: [
        { id: 'b.ts', attrs: { kind: 'file', fileId: 'b.ts', name: 'b.ts', signature: '', docComment: '', body: '', startLine: 1, endLine: 10, isExported: false, embedding: [], fileEmbedding: [], mtime: 1000 } },
      ],
      edges: [],
    });

    const created = resolvePendingImports(graph);
    expect(created).toBe(1);
    expect(graph.getEdgeAttribute(graph.edge('a.ts', 'b.ts')!, 'kind')).toBe('imports');
  });

  it('returns 0 when no pending imports', () => {
    const graph = createCodeGraph();
    expect(resolvePendingImports(graph)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Manager methods: deleteTaskLink, deleteSkillLink, linkSkills
// ---------------------------------------------------------------------------

describe('TaskGraphManager.deleteTaskLink', () => {
  it('deletes internal task link', () => {
    const g = createTaskGraph();
    const ctx = makeCtx();
    const embed = async (_q: string) => unitVec(0);
    const mgr = new TaskGraphManager(g, embedFnPair(embed), ctx, {});

    const t1 = createTask(g, 'Task A', '', 'todo', 'medium', [], unitVec(0));
    const t2 = createTask(g, 'Task B', '', 'todo', 'medium', [], unitVec(1));
    createTaskRelation(g, t1, t2, 'blocks');

    expect(g.hasEdge(t1, t2)).toBe(true);
    const ok = mgr.deleteTaskLink(t1, t2);
    expect(ok).toBe(true);
    expect(g.hasEdge(t1, t2)).toBe(false);
    expect(ctx.markDirty).toHaveBeenCalled();
  });

  it('returns false for non-existent link', () => {
    const g = createTaskGraph();
    const ctx = makeCtx();
    const embed = async (_q: string) => unitVec(0);
    const mgr = new TaskGraphManager(g, embedFnPair(embed), ctx, {});

    const t1 = createTask(g, 'Task X', '', 'todo', 'low', [], unitVec(0));
    const t2 = createTask(g, 'Task Y', '', 'todo', 'low', [], unitVec(1));

    expect(mgr.deleteTaskLink(t1, t2)).toBe(false);
  });
});

describe('SkillGraphManager.linkSkills / deleteSkillLink', () => {
  const g = createSkillGraph();
  const ctx = makeCtx();
  const embed = async (_q: string) => unitVec(0);
  let mgr: SkillGraphManager;
  let s1: string, s2: string;

  beforeAll(() => {
    mgr = new SkillGraphManager(g, embedFnPair(embed), ctx, {});
    s1 = createSkill(g, 'Skill A', '', [], [], [], [], [], 'user', 1, unitVec(0));
    s2 = createSkill(g, 'Skill B', '', [], [], [], [], [], 'user', 1, unitVec(1));
  });

  it('linkSkills creates relation', () => {
    const ok = mgr.linkSkills(s1, s2, 'depends_on');
    expect(ok).toBe(true);
    expect(g.hasEdge(s1, s2)).toBe(true);
    expect(ctx.markDirty).toHaveBeenCalled();
  });

  it('deleteSkillLink removes relation', () => {
    const ok = mgr.deleteSkillLink(s1, s2);
    expect(ok).toBe(true);
    expect(g.hasEdge(s1, s2)).toBe(false);
  });

  it('deleteSkillLink returns false for non-existent', () => {
    expect(mgr.deleteSkillLink(s1, s2)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getNodeUpdatedAt
// ---------------------------------------------------------------------------

describe('getNodeUpdatedAt', () => {
  it('knowledge: returns updatedAt for existing note', () => {
    const g = createKnowledgeGraph();
    const ctx = makeCtx();
    const embed = async (_q: string) => unitVec(0);
    const mgr = new KnowledgeGraphManager(g, embedFnPair(embed), ctx, {});

    const id = createNote(g, 'Test', '', [], unitVec(0));
    const ts = mgr.getNodeUpdatedAt(id);
    expect(ts).toBeGreaterThan(0);
  });

  it('knowledge: returns null for non-existent', () => {
    const g = createKnowledgeGraph();
    const ctx = makeCtx();
    const embed = async (_q: string) => unitVec(0);
    const mgr = new KnowledgeGraphManager(g, embedFnPair(embed), ctx, {});

    expect(mgr.getNodeUpdatedAt('ghost')).toBeNull();
  });

  it('task: returns updatedAt for existing task', () => {
    const g = createTaskGraph();
    const ctx = makeCtx();
    const embed = async (_q: string) => unitVec(0);
    const mgr = new TaskGraphManager(g, embedFnPair(embed), ctx, {});

    const id = createTask(g, 'Task', '', 'todo', 'medium', [], unitVec(0));
    expect(mgr.getNodeUpdatedAt(id)).toBeGreaterThan(0);
  });

  it('task: returns null for non-existent', () => {
    const g = createTaskGraph();
    const ctx = makeCtx();
    const embed = async (_q: string) => unitVec(0);
    const mgr = new TaskGraphManager(g, embedFnPair(embed), ctx, {});

    expect(mgr.getNodeUpdatedAt('ghost')).toBeNull();
  });

  it('skill: returns updatedAt for existing skill', () => {
    const g = createSkillGraph();
    const ctx = makeCtx();
    const embed = async (_q: string) => unitVec(0);
    const mgr = new SkillGraphManager(g, embedFnPair(embed), ctx, {});

    const id = createSkill(g, 'Skill', '', [], [], [], [], [], 'user', 1, unitVec(0));
    expect(mgr.getNodeUpdatedAt(id)).toBeGreaterThan(0);
  });

  it('skill: returns null for non-existent', () => {
    const g = createSkillGraph();
    const ctx = makeCtx();
    const embed = async (_q: string) => unitVec(0);
    const mgr = new SkillGraphManager(g, embedFnPair(embed), ctx, {});

    expect(mgr.getNodeUpdatedAt('ghost')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Empty graph edge cases
// ---------------------------------------------------------------------------

describe('empty graph operations', () => {
  it('DocGraph: updateFile with empty chunks is a no-op', () => {
    const graph = createGraph();
    updateFile(graph, [], 1000);
    expect(graph.order).toBe(0);
  });

  it('DocGraph: removeFile on empty graph is a no-op', () => {
    const graph = createGraph();
    expect(() => removeFile(graph, 'ghost.md')).not.toThrow();
  });

  it('CodeGraph: searchCode on empty graph returns []', () => {
    const graph = createCodeGraph();
    const results = searchCode(graph, unitVec(0), { topK: 5, bfsDepth: 1, searchMode: 'vector' });
    expect(results).toHaveLength(0);
  });

  it('CodeGraph: updateCodeFile with no symbols creates file node only', () => {
    const graph = createCodeGraph();
    updateCodeFile(graph, {
      fileId: 'empty.ts', mtime: 1000,
      nodes: [
        { id: 'empty.ts', attrs: { kind: 'file', fileId: 'empty.ts', name: 'empty.ts', signature: '', docComment: '', body: '', startLine: 1, endLine: 1, isExported: false, embedding: [], fileEmbedding: [], mtime: 1000 } },
      ],
      edges: [],
    });
    expect(graph.order).toBe(1);
    expect(graph.hasNode('empty.ts')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DocGraph BM25 manager wrapper
// ---------------------------------------------------------------------------

describe('DocGraphManager BM25 integration', () => {
  it('search with keyword mode returns BM25 matches', async () => {
    const graph = createGraph();
    const chunks: Chunk[] = [
      { id: 'jwt.md', fileId: 'jwt.md', title: 'JWT Auth', content: 'JSON web tokens for authentication', level: 1, links: [], embedding: unitVec(0), symbols: [] },
      { id: 'jwt.md::Flow', fileId: 'jwt.md', title: 'Flow', content: 'Access token refresh token rotation', level: 2, links: [], embedding: unitVec(1), symbols: [] },
      { id: 'db.md', fileId: 'db.md', title: 'Database', content: 'PostgreSQL setup and migration', level: 1, links: [], embedding: unitVec(2), symbols: [] },
    ];
    updateFile(graph, chunks, 1000);

    const embed = async (_q: string) => unitVec(5); // no vector match
    const mgr = new DocGraphManager(graph, embedFnPair(embed));

    const results = await mgr.search('token authentication', { searchMode: 'keyword', bfsDepth: 0, minScore: 0 });
    expect(results.length).toBeGreaterThan(0);
    // Should find jwt.md (mentions "tokens", "authentication")
    expect(results.some(r => r.fileId === 'jwt.md')).toBe(true);
  });

  it('BM25 index updated after removeFile', async () => {
    const graph = createGraph();
    const chunks: Chunk[] = [
      { id: 'a.md', fileId: 'a.md', title: 'Alpha', content: 'unique-keyword-xyz', level: 1, links: [], embedding: unitVec(0), symbols: [] },
    ];
    updateFile(graph, chunks, 1000);

    const embed = async (_q: string) => unitVec(5);
    const mgr = new DocGraphManager(graph, embedFnPair(embed));

    // Should find it
    let results = await mgr.search('unique-keyword-xyz', { searchMode: 'keyword', bfsDepth: 0, minScore: 0 });
    expect(results.length).toBe(1);

    // Remove file via manager
    mgr.removeFile('a.md');

    // Should NOT find it anymore
    results = await mgr.search('unique-keyword-xyz', { searchMode: 'keyword', bfsDepth: 0, minScore: 0 });
    expect(results.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Circular imports in BFS
// ---------------------------------------------------------------------------

describe('circular imports BFS termination', () => {
  it('BFS terminates with circular import edges', () => {
    const graph = createCodeGraph();

    // A imports B, B imports A
    updateCodeFile(graph, {
      fileId: 'cycA.ts', mtime: 1000,
      nodes: [
        { id: 'cycA.ts', attrs: { kind: 'file', fileId: 'cycA.ts', name: 'cycA.ts', signature: '', docComment: '', body: '', startLine: 1, endLine: 10, isExported: false, embedding: unitVec(0, DIM), fileEmbedding: [], mtime: 1000 } },
        { id: 'cycA.ts::fnA', attrs: { kind: 'function', fileId: 'cycA.ts', name: 'fnA', signature: 'function fnA()', docComment: '', body: '', startLine: 2, endLine: 5, isExported: true, embedding: unitVec(1, DIM), fileEmbedding: [], mtime: 1000 } },
      ],
      edges: [
        { from: 'cycA.ts', to: 'cycA.ts::fnA', attrs: { kind: 'contains' } },
      ],
    });

    updateCodeFile(graph, {
      fileId: 'cycB.ts', mtime: 1000,
      nodes: [
        { id: 'cycB.ts', attrs: { kind: 'file', fileId: 'cycB.ts', name: 'cycB.ts', signature: '', docComment: '', body: '', startLine: 1, endLine: 10, isExported: false, embedding: unitVec(2, DIM), fileEmbedding: [], mtime: 1000 } },
        { id: 'cycB.ts::fnB', attrs: { kind: 'function', fileId: 'cycB.ts', name: 'fnB', signature: 'function fnB()', docComment: '', body: '', startLine: 2, endLine: 5, isExported: true, embedding: unitVec(3, DIM), fileEmbedding: [], mtime: 1000 } },
      ],
      edges: [
        { from: 'cycB.ts', to: 'cycB.ts::fnB', attrs: { kind: 'contains' } },
        { from: 'cycB.ts', to: 'cycA.ts', attrs: { kind: 'imports' } },
      ],
    });

    // Add A → B import edge manually (since B existed when we try)
    graph.addEdgeWithKey('cycA→cycB', 'cycA.ts', 'cycB.ts', { kind: 'imports' });

    // BFS with large depth should NOT hang
    const results = searchCode(graph, unitVec(1, DIM), {
      topK: 1, bfsDepth: 5, minScore: 0, searchMode: 'vector',
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe('cycA.ts::fnA');
  });
});

// ---------------------------------------------------------------------------
// Ambiguous symbol names in resolvePendingEdges
// ---------------------------------------------------------------------------

describe('resolvePendingEdges — ambiguous names', () => {
  it('picks first candidate when multiple classes share the same name', () => {
    const graph = createCodeGraph();

    // Two files, both with class named "Handler"
    updateCodeFile(graph, {
      fileId: 'http.ts', mtime: 1000,
      nodes: [
        { id: 'http.ts', attrs: { kind: 'file', fileId: 'http.ts', name: 'http.ts', signature: '', docComment: '', body: '', startLine: 1, endLine: 10, isExported: false, embedding: [], fileEmbedding: [], mtime: 1000 } },
        { id: 'http.ts::Handler', attrs: { kind: 'class', fileId: 'http.ts', name: 'Handler', signature: 'class Handler', docComment: '', body: '', startLine: 2, endLine: 8, isExported: true, embedding: [], fileEmbedding: [], mtime: 1000 } },
      ],
      edges: [{ from: 'http.ts', to: 'http.ts::Handler', attrs: { kind: 'contains' } }],
    });

    updateCodeFile(graph, {
      fileId: 'ws.ts', mtime: 1000,
      nodes: [
        { id: 'ws.ts', attrs: { kind: 'file', fileId: 'ws.ts', name: 'ws.ts', signature: '', docComment: '', body: '', startLine: 1, endLine: 10, isExported: false, embedding: [], fileEmbedding: [], mtime: 1000 } },
        { id: 'ws.ts::Handler', attrs: { kind: 'class', fileId: 'ws.ts', name: 'Handler', signature: 'class Handler', docComment: '', body: '', startLine: 2, endLine: 8, isExported: true, embedding: [], fileEmbedding: [], mtime: 1000 } },
      ],
      edges: [{ from: 'ws.ts', to: 'ws.ts::Handler', attrs: { kind: 'contains' } }],
    });

    // Third file extends "Handler" — pending edge
    updateCodeFile(graph, {
      fileId: 'app.ts', mtime: 1000,
      nodes: [
        { id: 'app.ts', attrs: { kind: 'file', fileId: 'app.ts', name: 'app.ts', signature: '', docComment: '', body: '', startLine: 1, endLine: 10, isExported: false, embedding: [], fileEmbedding: [], mtime: 1000, pendingEdges: [{ from: 'app.ts::AppHandler', toName: 'Handler', kind: 'extends' }] } },
        { id: 'app.ts::AppHandler', attrs: { kind: 'class', fileId: 'app.ts', name: 'AppHandler', signature: 'class AppHandler extends Handler', docComment: '', body: '', startLine: 2, endLine: 8, isExported: true, embedding: [], fileEmbedding: [], mtime: 1000 } },
      ],
      edges: [{ from: 'app.ts', to: 'app.ts::AppHandler', attrs: { kind: 'contains' } }],
    });

    resolvePendingEdges(graph);

    // Should have extends edge to one of the Handlers (first found)
    const hasExtends = graph.hasEdge('app.ts::AppHandler', 'http.ts::Handler')
      || graph.hasEdge('app.ts::AppHandler', 'ws.ts::Handler');
    expect(hasExtends).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// removeCodeFile cross-edge cleanup
// ---------------------------------------------------------------------------

describe('removeCodeFile cross-edge cleanup', () => {
  it('removes import edges pointing TO the removed file', () => {
    const graph = createCodeGraph();

    updateCodeFile(graph, {
      fileId: 'lib.ts', mtime: 1000,
      nodes: [
        { id: 'lib.ts', attrs: { kind: 'file', fileId: 'lib.ts', name: 'lib.ts', signature: '', docComment: '', body: '', startLine: 1, endLine: 5, isExported: false, embedding: [], fileEmbedding: [], mtime: 1000 } },
      ],
      edges: [],
    });

    updateCodeFile(graph, {
      fileId: 'main.ts', mtime: 1000,
      nodes: [
        { id: 'main.ts', attrs: { kind: 'file', fileId: 'main.ts', name: 'main.ts', signature: '', docComment: '', body: '', startLine: 1, endLine: 5, isExported: false, embedding: [], fileEmbedding: [], mtime: 1000 } },
      ],
      edges: [
        { from: 'main.ts', to: 'lib.ts', attrs: { kind: 'imports' } },
      ],
    });

    expect(graph.hasEdge('main.ts', 'lib.ts')).toBe(true);

    // Remove lib.ts — the import edge from main.ts should also be removed
    const { removeCodeFile } = require('@/graphs/code');
    removeCodeFile(graph, 'lib.ts');

    expect(graph.hasNode('lib.ts')).toBe(false);
    // main.ts still exists but edge is gone (target node removed drops edges)
    expect(graph.hasNode('main.ts')).toBe(true);
  });
});
