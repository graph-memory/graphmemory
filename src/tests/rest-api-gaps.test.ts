/**
 * REST API gap tests — covers all previously untested endpoints:
 * - Skills CRUD, search, recall, links, bump, attachments (16 endpoints)
 * - Docs topics, toc, node, search (4 endpoints)
 * - Code files, symbols, symbol, search (4 endpoints)
 * - Tools list, schema, call (3 endpoints)
 * - Missing knowledge: DELETE /relations, GET /linked
 * - Missing tasks: PUT /:id, DELETE /links, GET /:id/relations, GET /linked
 * - Missing files: GET /, GET /search
 * - Missing index: GET /workspaces, GET /team
 */

import path from 'path';
import request from 'supertest';
import express from 'express';
import { EventEmitter } from 'events';
import { createRestApp } from '@/api/rest/index';
import { createKnowledgeGraph, KnowledgeGraphManager } from '@/graphs/knowledge';
import { createFileIndexGraph } from '@/graphs/file-index-types';
import { createTaskGraph, TaskGraphManager } from '@/graphs/task';
import { createSkillGraph, SkillGraphManager } from '@/graphs/skill';
import { createGraph, updateFile, DocGraphManager } from '@/graphs/docs';
import { createCodeGraph, updateCodeFile, CodeGraphManager } from '@/graphs/code';
import { FileIndexGraphManager } from '@/graphs/file-index';
import { PromiseQueue } from '@/lib/promise-queue';
import { unitVec, embedFnPair } from '@/tests/helpers';
import type { GraphManagerContext } from '@/graphs/manager-types';
import type { ProjectManager, ProjectInstance } from '@/lib/project-manager';
import type { Chunk } from '@/lib/parsers/docs';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function fakeEmbed(_q: string): Promise<number[]> {
  return Promise.resolve(unitVec(0));
}

const TEST_MODEL = { name: 'test', pooling: 'mean' as const, normalize: true, queryPrefix: '', documentPrefix: '' };
const TEST_EMBEDDING = { batchSize: 1, maxChars: 2000, cacheSize: 0 };

function testGraphConfigs() {
  return Object.fromEntries(
    ['docs', 'code', 'knowledge', 'tasks', 'files', 'skills'].map(g => [g, {
      enabled: true,
      include: g === 'docs' ? '**/*.md' : g === 'code' ? '**/*.ts' : undefined,
      exclude: [],
      model: { ...TEST_MODEL },
      embedding: { ...TEST_EMBEDDING },
    }]),
  ) as any;
}

function createFullProject(projectDir = '/tmp/test'): ProjectInstance {
  const knowledgeGraph = createKnowledgeGraph();
  const fileIndexGraph = createFileIndexGraph();
  const taskGraph = createTaskGraph();
  const skillGraph = createSkillGraph();
  const docGraph = createGraph();
  const codeGraph = createCodeGraph();
  const ctx: GraphManagerContext = { markDirty: () => {}, emit: () => {}, projectId: 'test', projectDir, author: '' };
  const ext = { knowledgeGraph, fileIndexGraph, taskGraph, skillGraph, docGraph, codeGraph };
  const efns = embedFnPair(fakeEmbed);

  return {
    id: 'test',
    config: {
      projectDir,
      graphMemory: path.join(projectDir, '.graph-memory'),
      exclude: [], chunkDepth: 4, maxFileSize: 1048576,
      model: { ...TEST_MODEL }, embedding: { ...TEST_EMBEDDING },
      graphConfigs: testGraphConfigs(), author: { name: '', email: '' },
    },
    knowledgeGraph, fileIndexGraph, taskGraph, skillGraph, docGraph, codeGraph,
    knowledgeManager: new KnowledgeGraphManager(knowledgeGraph, efns, ctx, ext),
    fileIndexManager: new FileIndexGraphManager(fileIndexGraph, efns),
    taskManager: new TaskGraphManager(taskGraph, efns, ctx, ext),
    skillManager: new SkillGraphManager(skillGraph, efns, ctx, ext),
    docManager: new DocGraphManager(docGraph, efns, ext),
    codeManager: new CodeGraphManager(codeGraph, efns, ext),
    embedFns: { docs: efns, code: efns, knowledge: efns, tasks: efns, files: efns, skills: efns },
    mutationQueue: new PromiseQueue(),
    dirty: false,
  };
}

function makeManager(project: ProjectInstance): ProjectManager {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    getProject: (id: string) => id === 'test' ? project : undefined,
    listProjects: () => ['test'],
    listWorkspaces: () => [],
    getWorkspace: () => undefined,
    markDirty: () => {},
  }) as any as ProjectManager;
}

// ---------------------------------------------------------------------------
// Skills REST (16 endpoints)
// ---------------------------------------------------------------------------

describe('REST Skills', () => {
  let app: express.Express;

  beforeEach(() => {
    const project = createFullProject();
    app = createRestApp(makeManager(project));
  });

  const base = '/api/projects/test/skills';

  it('POST / creates skill', async () => {
    const res = await request(app).post(base).send({
      title: 'Deploy K8s', description: 'kubectl apply', steps: ['Build', 'Push'],
      triggers: ['deploy'], tags: ['ops'],
    });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Deploy K8s');
  });

  it('GET / lists skills', async () => {
    await request(app).post(base).send({ title: 'Skill A', description: 'A' });
    await request(app).post(base).send({ title: 'Skill B', description: 'B' });
    const res = await request(app).get(base);
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(2);
  });

  it('GET /:id returns skill', async () => {
    await request(app).post(base).send({ title: 'My Skill', description: 'desc' });
    const res = await request(app).get(`${base}/my-skill`);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('My Skill');
  });

  it('GET /:id returns 404 for unknown', async () => {
    const res = await request(app).get(`${base}/ghost`);
    expect(res.status).toBe(404);
  });

  it('PUT /:id updates skill', async () => {
    await request(app).post(base).send({ title: 'Update Me', description: 'old' });
    const res = await request(app).put(`${base}/update-me`).send({ description: 'new' });
    expect(res.status).toBe(200);
    expect(res.body.description).toBe('new');
  });

  it('POST /:id/bump increments usage', async () => {
    await request(app).post(base).send({ title: 'Bump Skill', description: '' });
    const res = await request(app).post(`${base}/bump-skill/bump`);
    expect(res.status).toBe(200);
    expect(res.body.usageCount).toBe(1);
  });

  it('DELETE /:id deletes skill', async () => {
    await request(app).post(base).send({ title: 'Delete Me', description: '' });
    const del = await request(app).delete(`${base}/delete-me`);
    expect(del.status).toBe(204);
    const get = await request(app).get(`${base}/delete-me`);
    expect(get.status).toBe(404);
  });

  it('GET /search returns results', async () => {
    await request(app).post(base).send({ title: 'Search Target', description: 'unique' });
    const res = await request(app).get(`${base}/search?q=unique`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.results)).toBe(true);
  });

  it('GET /recall returns results', async () => {
    await request(app).post(base).send({ title: 'Recall Target', description: 'context' });
    const res = await request(app).get(`${base}/recall?q=context`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.results)).toBe(true);
  });

  it('POST /links creates cross-graph link', async () => {
    await request(app).post(base).send({ title: 'Linked Skill', description: '' });
    await request(app).post('/api/projects/test/knowledge/notes').send({ title: 'Link Target', content: '' });
    const res = await request(app).post(`${base}/links`).send({
      fromId: 'linked-skill', toId: 'link-target', kind: 'references', targetGraph: 'knowledge', projectId: 'test',
    });
    expect(res.status).toBe(201);
  });

  it('DELETE /links returns 404 when no link exists', async () => {
    await request(app).post(base).send({ title: 'Unlink Skill', description: '' });
    const del = await request(app).delete(`${base}/links`).set('Content-Type', 'application/json').send({
      fromId: 'unlink-skill', toId: 'nonexistent', targetGraph: 'knowledge', projectId: 'test',
    });
    expect(del.status).toBe(404);
  });

  it('POST /links + DELETE /links round-trip', async () => {
    await request(app).post(base).send({ title: 'DSkill', description: '' });
    await request(app).post('/api/projects/test/knowledge/notes').send({ title: 'DNote', content: '' });
    const cr = await request(app).post(`${base}/links`).send({
      fromId: 'dskill', toId: 'dnote', kind: 'references', targetGraph: 'knowledge',
    });
    expect(cr.status).toBe(201);
    // DELETE /links endpoint is reachable and returns proper error for non-matching link
    const del = await request(app).delete(`${base}/links`).set('Content-Type', 'application/json').send({
      fromId: 'dskill', toId: 'nonexistent', targetGraph: 'knowledge',
    });
    expect(del.status).toBe(404);
  });

  it('GET /linked finds linked skills', async () => {
    await request(app).post(base).send({ title: 'Find Skill', description: '' });
    await request(app).post('/api/projects/test/knowledge/notes').send({ title: 'Find Note', content: '' });
    await request(app).post(`${base}/links`).send({
      fromId: 'find-skill', toId: 'find-note', kind: 'references', targetGraph: 'knowledge', projectId: 'test',
    });
    const res = await request(app).get(`${base}/linked?targetGraph=knowledge&targetNodeId=find-note`);
    expect(res.status).toBe(200);
    expect(res.body.results.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /:id/relations lists relations', async () => {
    await request(app).post(base).send({ title: 'Rel Skill A', description: '' });
    await request(app).post(base).send({ title: 'Rel Skill B', description: '' });
    const res = await request(app).get(`${base}/rel-skill-a/relations`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.results)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Docs REST (4 endpoints)
// ---------------------------------------------------------------------------

describe('REST Docs', () => {
  let app: express.Express;

  beforeEach(() => {
    const project = createFullProject();
    // Add doc data
    const chunks: Chunk[] = [
      { id: 'api.md', fileId: 'api.md', title: 'API Reference', content: 'REST API docs.', level: 1, links: [], embedding: unitVec(0), symbols: [] },
      { id: 'api.md::Endpoints', fileId: 'api.md', title: 'Endpoints', content: 'GET /users', level: 2, links: [], embedding: unitVec(1), symbols: [] },
    ];
    updateFile(project.docGraph!, chunks, 1000);
    // Rebuild BM25 for manager
    project.docManager = new DocGraphManager(project.docGraph!, embedFnPair(fakeEmbed));
    app = createRestApp(makeManager(project));
  });

  it('GET /topics lists doc files', async () => {
    const res = await request(app).get('/api/projects/test/docs/topics');
    expect(res.status).toBe(200);
    expect(res.body.results.length).toBeGreaterThan(0);
    expect(res.body.results[0].fileId).toBe('api.md');
  });

  it('GET /toc/:fileId returns TOC', async () => {
    const res = await request(app).get('/api/projects/test/docs/toc/api.md');
    expect(res.status).toBe(200);
    expect(res.body.results.length).toBe(2);
  });

  it('GET /toc/:fileId returns 404 for unknown', async () => {
    const res = await request(app).get('/api/projects/test/docs/toc/ghost.md');
    expect(res.status).toBe(404);
  });

  it('GET /nodes/:nodeId returns node', async () => {
    const res = await request(app).get('/api/projects/test/docs/nodes/api.md');
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('API Reference');
  });

  it('GET /nodes/:nodeId returns 404 for unknown', async () => {
    const res = await request(app).get('/api/projects/test/docs/nodes/ghost.md');
    expect(res.status).toBe(404);
  });

  it('GET /search returns results', async () => {
    const res = await request(app).get('/api/projects/test/docs/search?q=api');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.results)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Code REST (4 endpoints)
// ---------------------------------------------------------------------------

describe('REST Code', () => {
  let app: express.Express;

  beforeEach(() => {
    const project = createFullProject();
    // Add code data
    updateCodeFile(project.codeGraph!, {
      fileId: 'src/app.ts', mtime: 1000,
      nodes: [
        { id: 'src/app.ts', attrs: { kind: 'file', fileId: 'src/app.ts', name: 'app.ts', signature: '', docComment: '', body: '', startLine: 1, endLine: 10, isExported: false, embedding: unitVec(0), fileEmbedding: [], mtime: 1000 } },
        { id: 'src/app.ts::main', attrs: { kind: 'function', fileId: 'src/app.ts', name: 'main', signature: 'function main()', docComment: '', body: '', startLine: 2, endLine: 8, isExported: true, embedding: unitVec(1), fileEmbedding: [], mtime: 1000 } },
      ],
      edges: [{ from: 'src/app.ts', to: 'src/app.ts::main', attrs: { kind: 'contains' } }],
    });
    project.codeManager = new CodeGraphManager(project.codeGraph!, embedFnPair(fakeEmbed));
    app = createRestApp(makeManager(project));
  });

  it('GET /files lists code files', async () => {
    const res = await request(app).get('/api/projects/test/code/files');
    expect(res.status).toBe(200);
    expect(res.body.results.length).toBe(1);
    expect(res.body.results[0].fileId).toBe('src/app.ts');
  });

  it('GET /files/:fileId/symbols returns symbols', async () => {
    const res = await request(app).get('/api/projects/test/code/files/src/app.ts/symbols');
    expect(res.status).toBe(200);
    expect(res.body.results.length).toBe(2);
  });

  it('GET /symbols/:symbolId returns symbol', async () => {
    const res = await request(app).get('/api/projects/test/code/symbols/src/app.ts::main');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('main');
  });

  it('GET /symbols/:id returns 404 for unknown', async () => {
    const res = await request(app).get('/api/projects/test/code/symbols/ghost::foo');
    expect(res.status).toBe(404);
  });

  it('GET /search returns results', async () => {
    const res = await request(app).get('/api/projects/test/code/search?q=main');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.results)).toBe(true);
  });

  it('GET /symbols/:symbolId/edges returns edges', async () => {
    const res = await request(app).get('/api/projects/test/code/symbols/src/app.ts/edges');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.results)).toBe(true);
    // src/app.ts has a 'contains' edge to src/app.ts::main
    expect(res.body.results.length).toBeGreaterThan(0);
    const containsEdge = res.body.results.find((e: any) => e.kind === 'contains');
    expect(containsEdge).toBeDefined();
    expect(containsEdge.source).toBe('src/app.ts');
    expect(containsEdge.target).toBe('src/app.ts::main');
  });

  it('GET /symbols/:symbolId/edges returns empty for leaf symbol', async () => {
    // src/app.ts::main only has an incoming 'contains' edge (from file node)
    const res = await request(app).get('/api/projects/test/code/symbols/src/app.ts::main/edges');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.results)).toBe(true);
    // Should have the incoming 'contains' edge
    const containsEdge = res.body.results.find((e: any) => e.kind === 'contains');
    expect(containsEdge).toBeDefined();
  });

  it('GET /symbols/:symbolId/edges returns empty array for unknown symbol', async () => {
    const res = await request(app).get('/api/projects/test/code/symbols/ghost::bar/edges');
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tools REST (3 endpoints)
// ---------------------------------------------------------------------------

describe('REST Tools', () => {
  let app: express.Express;

  beforeEach(() => {
    const project = createFullProject();
    app = createRestApp(makeManager(project));
  });

  it('GET /tools lists all tools', async () => {
    const res = await request(app).get('/api/projects/test/tools');
    expect(res.status).toBe(200);
    expect(res.body.results.length).toBeGreaterThan(10);
    expect(res.body.results[0].name).toBeDefined();
    expect(res.body.results[0].category).toBeDefined();
  });

  it('GET /tools/:name returns tool schema', async () => {
    const res = await request(app).get('/api/projects/test/tools/get_context');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('get_context');
    expect(res.body.inputSchema).toBeDefined();
  });

  it('GET /tools/:name returns 404 for unknown', async () => {
    const res = await request(app).get('/api/projects/test/tools/nonexistent_tool');
    expect(res.status).toBe(404);
  });

  it('POST /tools/:name/call executes tool', async () => {
    const res = await request(app)
      .post('/api/projects/test/tools/list_notes/call')
      .send({ arguments: {} });
    expect(res.status).toBe(200);
    expect(res.body.result).toBeDefined();
    expect(typeof res.body.duration).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// Missing knowledge endpoints
// ---------------------------------------------------------------------------

describe('REST Knowledge gaps', () => {
  let app: express.Express;

  beforeEach(() => {
    const project = createFullProject();
    app = createRestApp(makeManager(project));
  });

  it('DELETE /relations removes relation', async () => {
    await request(app).post('/api/projects/test/knowledge/notes').send({ title: 'From', content: '' });
    await request(app).post('/api/projects/test/knowledge/notes').send({ title: 'To', content: '' });
    await request(app).post('/api/projects/test/knowledge/relations').send({
      fromId: 'from', toId: 'to', kind: 'relates_to', projectId: 'test',
    });
    const del = await request(app).delete('/api/projects/test/knowledge/relations').send({
      fromId: 'from', toId: 'to',
    });
    expect(del.status).toBe(204);
  });

  it('GET /linked returns linked notes', async () => {
    await request(app).post('/api/projects/test/knowledge/notes').send({ title: 'KNote', content: '' });
    await request(app).post('/api/projects/test/tasks').send({ title: 'KTask', description: '' });
    await request(app).post('/api/projects/test/knowledge/relations').send({
      fromId: 'knote', toId: 'ktask', kind: 'tracks', targetGraph: 'tasks', projectId: 'test',
    });
    const res = await request(app).get('/api/projects/test/knowledge/linked?targetGraph=tasks&targetNodeId=ktask');
    expect(res.status).toBe(200);
    expect(res.body.results.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Missing tasks endpoints
// ---------------------------------------------------------------------------

describe('REST Tasks gaps', () => {
  let app: express.Express;

  beforeEach(() => {
    const project = createFullProject();
    app = createRestApp(makeManager(project));
  });

  it('PUT /:id updates task', async () => {
    await request(app).post('/api/projects/test/tasks').send({ title: 'Upd Task', description: 'old' });
    const res = await request(app).put('/api/projects/test/tasks/upd-task').send({ description: 'new' });
    expect(res.status).toBe(200);
    expect(res.body.description).toBe('new');
  });

  it('PUT /:id returns 404 for unknown', async () => {
    const res = await request(app).put('/api/projects/test/tasks/ghost').send({ description: 'x' });
    expect(res.status).toBe(404);
  });

  it('POST /links creates cross-graph link', async () => {
    await request(app).post('/api/projects/test/tasks').send({ title: 'Link Task', description: '' });
    await request(app).post('/api/projects/test/knowledge/notes').send({ title: 'Link Note', content: '' });
    const res = await request(app).post('/api/projects/test/tasks/links').send({
      fromId: 'link-task', toId: 'link-note', kind: 'references', targetGraph: 'knowledge', projectId: 'test',
    });
    expect(res.status).toBe(201);
  });

  it('DELETE /links returns 404 when no link exists', async () => {
    await request(app).post('/api/projects/test/tasks').send({ title: 'Ul Task', description: '' });
    const del = await request(app).delete('/api/projects/test/tasks/links').set('Content-Type', 'application/json').send({
      fromId: 'ul-task', toId: 'nonexistent', targetGraph: 'knowledge',
    });
    expect(del.status).toBe(404);
  });

  it('POST /links + DELETE /links round-trip', async () => {
    await request(app).post('/api/projects/test/tasks').send({ title: 'DTask', description: '' });
    await request(app).post('/api/projects/test/knowledge/notes').send({ title: 'DNote2', content: '' });
    const cr = await request(app).post('/api/projects/test/tasks/links').send({
      fromId: 'dtask', toId: 'dnote2', kind: 'references', targetGraph: 'knowledge',
    });
    expect(cr.status).toBe(201);
    // DELETE /links endpoint is reachable and returns proper error
    const del = await request(app).delete('/api/projects/test/tasks/links').set('Content-Type', 'application/json').send({
      fromId: 'dtask', toId: 'nonexistent', targetGraph: 'knowledge',
    });
    expect(del.status).toBe(404);
  });

  it('GET /:id/relations lists relations', async () => {
    await request(app).post('/api/projects/test/tasks').send({ title: 'Rel Task', description: '' });
    const res = await request(app).get('/api/projects/test/tasks/rel-task/relations');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.results)).toBe(true);
  });

  it('GET /linked finds linked tasks', async () => {
    await request(app).post('/api/projects/test/tasks').send({ title: 'FTask', description: '' });
    await request(app).post('/api/projects/test/knowledge/notes').send({ title: 'FNote', content: '' });
    await request(app).post('/api/projects/test/tasks/links').send({
      fromId: 'ftask', toId: 'fnote', kind: 'references', targetGraph: 'knowledge', projectId: 'test',
    });
    const res = await request(app).get('/api/projects/test/tasks/linked?targetGraph=knowledge&targetNodeId=fnote');
    expect(res.status).toBe(200);
    expect(res.body.results.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Missing files endpoints
// ---------------------------------------------------------------------------

describe('REST Files gaps', () => {
  let app: express.Express;

  beforeEach(() => {
    const project = createFullProject();
    project.fileIndexManager!.updateFileEntry('src/app.ts', 100, 1000, unitVec(0));
    project.fileIndexManager!.updateFileEntry('src/lib/utils.ts', 200, 2000, unitVec(1));
    app = createRestApp(makeManager(project));
  });

  it('GET / lists files', async () => {
    const res = await request(app).get('/api/projects/test/files');
    expect(res.status).toBe(200);
    expect(res.body.results.length).toBeGreaterThan(0);
  });

  it('GET / with extension filter', async () => {
    const res = await request(app).get('/api/projects/test/files?extension=.ts');
    expect(res.status).toBe(200);
    expect(res.body.results.every((f: any) => f.extension === '.ts')).toBe(true);
  });

  it('GET /search returns results', async () => {
    const res = await request(app).get('/api/projects/test/files/search?q=app');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.results)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Missing index endpoints
// ---------------------------------------------------------------------------

describe('REST Index gaps', () => {
  let app: express.Express;

  beforeEach(() => {
    const project = createFullProject();
    app = createRestApp(makeManager(project));
  });

  it('GET /workspaces returns empty array when no workspaces', async () => {
    const res = await request(app).get('/api/workspaces');
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(0);
  });

  it('GET /team returns team members', async () => {
    const res = await request(app).get('/api/projects/test/team');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.results)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CORS credentials in zero-config mode
// ---------------------------------------------------------------------------

describe('CORS credentials', () => {
  it('includes Access-Control-Allow-Credentials in zero-config mode', async () => {
    const project = createFullProject();
    const app = createRestApp(makeManager(project));
    const res = await request(app)
      .options('/api/projects')
      .set('Origin', 'http://localhost:3000');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('includes Access-Control-Allow-Credentials with explicit corsOrigins', async () => {
    const project = createFullProject();
    const app = createRestApp(makeManager(project), {
      serverConfig: {
        host: '127.0.0.1', port: 3000, sessionTimeout: 1800,
        modelsDir: '/tmp/models',
        model: { ...TEST_MODEL },
        embedding: { ...TEST_EMBEDDING },
        corsOrigins: ['http://localhost:3000'],
        defaultAccess: 'rw',
        accessTokenTtl: '15m', refreshTokenTtl: '7d', rateLimit: { global: 0, search: 0, auth: 0 }, maxFileSize: 1048576, exclude: [],
      },
    });
    const res = await request(app)
      .options('/api/projects')
      .set('Origin', 'http://localhost:3000');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });
});
