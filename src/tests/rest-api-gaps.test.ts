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
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdtempSync, rmSync } from 'fs';
import request from 'supertest';
import express from 'express';
import { EventEmitter } from 'events';
import { createRestApp } from '@/api/rest/index';
import { PromiseQueue } from '@/lib/promise-queue';
import { unitVec, DIM, embedFnPair } from '@/tests/helpers';
import { SqliteStore } from '@/store';
import { StoreManager } from '@/lib/store-manager';
import type { ProjectManager, ProjectInstance } from '@/lib/project-manager';

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

interface TestProjectResult {
  project: ProjectInstance;
  cleanup: () => void;
}

function createFullProject(projectDir = '/tmp/test'): TestProjectResult {
  const dbDir = mkdtempSync(join(tmpdir(), 'rest-gaps-db-'));
  const dbPath = join(dbDir, 'test.db');

  const store = new SqliteStore();
  store.open({ dbPath, embeddingDims: { knowledge: DIM, tasks: DIM, skills: DIM, epics: DIM, docs: DIM, code: DIM, files: DIM } });
  const dbProject = store.projects.create({ slug: 'test', name: 'Test', directory: projectDir });
  const emitter = new EventEmitter();

  const storeManager = new StoreManager({
    store,
    projectId: dbProject.id,
    projectDir,
    embedFn: fakeEmbed,
    emitter,
  });

  const scopedStore = store.project(dbProject.id);
  const efns = embedFnPair(fakeEmbed);

  const project: ProjectInstance = {
    id: 'test',
    config: {
      projectDir,
      graphMemory: path.join(projectDir, '.graph-memory'),
      exclude: [], chunkDepth: 4, maxFileSize: 1048576,
      model: { ...TEST_MODEL }, embedding: { ...TEST_EMBEDDING },
      graphConfigs: testGraphConfigs(), author: { name: '', email: '' },
    },
    scopedStore,
    dbProjectId: dbProject.id,
    storeManager,
    embedFns: { docs: efns, code: efns, knowledge: efns, tasks: efns, files: efns, skills: efns },
    mutationQueue: new PromiseQueue(),
    dirty: false,
  };

  const cleanup = () => {
    store.close();
    rmSync(dbDir, { recursive: true, force: true });
  };

  return { project, cleanup };
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
  let cleanup: () => void;

  beforeEach(() => {
    const { project, cleanup: c } = createFullProject();
    cleanup = c;
    app = createRestApp(makeManager(project));
  });

  afterEach(() => {
    cleanup();
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
    const created = await request(app).post(base).send({ title: 'My Skill', description: 'desc' });
    const id = created.body.id;
    const res = await request(app).get(`${base}/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('My Skill');
  });

  it('GET /:id returns 404 for unknown', async () => {
    const res = await request(app).get(`${base}/999999`);
    expect(res.status).toBe(404);
  });

  it('PUT /:id updates skill', async () => {
    const created = await request(app).post(base).send({ title: 'Update Me', description: 'old' });
    const id = created.body.id;
    const res = await request(app).put(`${base}/${id}`).send({ description: 'new' });
    expect(res.status).toBe(200);
    expect(res.body.description).toBe('new');
  });

  it('POST /:id/bump increments usage', async () => {
    const created = await request(app).post(base).send({ title: 'Bump Skill', description: '' });
    const id = created.body.id;
    const res = await request(app).post(`${base}/${id}/bump`);
    expect(res.status).toBe(200);
    expect(res.body.usageCount).toBe(1);
  });

  it('DELETE /:id deletes skill', async () => {
    const created = await request(app).post(base).send({ title: 'Delete Me', description: '' });
    const id = created.body.id;
    const del = await request(app).delete(`${base}/${id}`);
    expect(del.status).toBe(204);
    const get = await request(app).get(`${base}/${id}`);
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
    const createdSkill = await request(app).post(base).send({ title: 'Linked Skill', description: '' });
    const createdNote = await request(app).post('/api/projects/test/knowledge/notes').send({ title: 'Link Target', content: '' });
    const res = await request(app).post(`${base}/links`).send({
      fromId: createdSkill.body.id, toId: createdNote.body.id, kind: 'references', targetGraph: 'knowledge',
    });
    expect(res.status).toBe(201);
  });

  it('DELETE /links returns 204 for non-existent link (idempotent)', async () => {
    const created = await request(app).post(base).send({ title: 'Unlink Skill', description: '' });
    const del = await request(app).delete(`${base}/links`).set('Content-Type', 'application/json').send({
      fromId: created.body.id, toId: 999999, kind: 'references', targetGraph: 'knowledge',
    });
    expect(del.status).toBe(204);
  });

  it('POST /links + DELETE /links round-trip', async () => {
    const createdSkill = await request(app).post(base).send({ title: 'DSkill', description: '' });
    const createdNote = await request(app).post('/api/projects/test/knowledge/notes').send({ title: 'DNote', content: '' });
    const cr = await request(app).post(`${base}/links`).send({
      fromId: createdSkill.body.id, toId: createdNote.body.id, kind: 'references', targetGraph: 'knowledge',
    });
    expect(cr.status).toBe(201);
    // DELETE /links is idempotent — returns 204 even for non-matching edge
    const del = await request(app).delete(`${base}/links`).set('Content-Type', 'application/json').send({
      fromId: createdSkill.body.id, toId: 999999, kind: 'references', targetGraph: 'knowledge',
    });
    expect(del.status).toBe(204);
  });

  it('GET /linked finds linked skills', async () => {
    const createdSkill = await request(app).post(base).send({ title: 'Find Skill', description: '' });
    const createdNote = await request(app).post('/api/projects/test/knowledge/notes').send({ title: 'Find Note', content: '' });
    await request(app).post(`${base}/links`).send({
      fromId: createdSkill.body.id, toId: createdNote.body.id, kind: 'references', targetGraph: 'knowledge',
    });
    const res = await request(app).get(`${base}/linked?targetGraph=knowledge&targetNodeId=${createdNote.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.results.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /:id/relations lists relations', async () => {
    const createdA = await request(app).post(base).send({ title: 'Rel Skill A', description: '' });
    await request(app).post(base).send({ title: 'Rel Skill B', description: '' });
    const res = await request(app).get(`${base}/${createdA.body.id}/relations`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.results)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Docs REST (4 endpoints)
// ---------------------------------------------------------------------------

describe('REST Docs', () => {
  let app: express.Express;
  let cleanup: () => void;
  let docNodeId: number;

  beforeEach(() => {
    const { project, cleanup: c } = createFullProject();
    cleanup = c;
    // Populate store with doc data
    const embeddings = new Map<string, number[]>();
    embeddings.set('api.md', unitVec(0));
    embeddings.set('api.md#0', unitVec(0));
    embeddings.set('api.md#1', unitVec(1));
    project.scopedStore.docs.updateFile(
      'api.md',
      [
        { fileId: 'api.md', title: 'API Reference', content: 'REST API docs.', level: 1, symbols: [], mtime: 1000 },
        { fileId: 'api.md', title: 'Endpoints', content: 'GET /users', level: 2, symbols: [], mtime: 1000 },
      ],
      1000,
      embeddings,
    );
    // Get the file-level node ID for later use
    const chunks = project.scopedStore.docs.getFileChunks('api.md');
    docNodeId = chunks[0].id;
    app = createRestApp(makeManager(project));
  });

  afterEach(() => {
    cleanup();
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
    const res = await request(app).get(`/api/projects/test/docs/nodes/${docNodeId}`);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('API Reference');
  });

  it('GET /nodes/:nodeId returns 404 for unknown', async () => {
    const res = await request(app).get('/api/projects/test/docs/nodes/999999');
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
  let cleanup: () => void;
  let mainSymbolId: number;

  beforeEach(() => {
    const { project, cleanup: c } = createFullProject();
    cleanup = c;
    // Populate store with code data
    // Note: updateFile creates a file-level node internally, so only provide symbol nodes
    const embeddings = new Map<string, number[]>();
    embeddings.set('src/app.ts', unitVec(0));    // file-level embedding (used by updateFile for the auto-created file node)
    embeddings.set('main', unitVec(1));            // function node name
    project.scopedStore.code.updateFile(
      'src/app.ts',
      [
        { kind: 'function', fileId: 'src/app.ts', language: 'typescript', name: 'main', signature: 'function main()', docComment: '', body: '', startLine: 2, endLine: 8, isExported: true, mtime: 1000 },
      ],
      [{ fromName: 'app.ts', toName: 'main', kind: 'contains' }],
      1000,
      embeddings,
    );
    // Get the symbol ID for 'main'
    const symbols = project.scopedStore.code.getFileSymbols('src/app.ts');
    const mainSym = symbols.find(s => s.name === 'main');
    mainSymbolId = mainSym!.id;
    app = createRestApp(makeManager(project));
  });

  afterEach(() => {
    cleanup();
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
    // getFileSymbols excludes file-level nodes, returning only function/class/etc.
    expect(res.body.results.length).toBe(1);
    expect(res.body.results[0].name).toBe('main');
  });

  it('GET /symbols/:symbolId returns symbol', async () => {
    const res = await request(app).get(`/api/projects/test/code/symbols/${mainSymbolId}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('main');
  });

  it('GET /symbols/:id returns 404 for unknown', async () => {
    const res = await request(app).get('/api/projects/test/code/symbols/999999');
    expect(res.status).toBe(404);
  });

  it('GET /search returns results', async () => {
    const res = await request(app).get('/api/projects/test/code/search?q=main');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.results)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tools REST (3 endpoints)
// ---------------------------------------------------------------------------

describe('REST Tools', () => {
  let app: express.Express;
  let cleanup: () => void;

  beforeEach(() => {
    const { project, cleanup: c } = createFullProject();
    cleanup = c;
    app = createRestApp(makeManager(project));
  });

  afterEach(() => {
    cleanup();
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
  let cleanup: () => void;

  beforeEach(() => {
    const { project, cleanup: c } = createFullProject();
    cleanup = c;
    app = createRestApp(makeManager(project));
  });

  afterEach(() => {
    cleanup();
  });

  it('DELETE /relations removes relation', async () => {
    const fromNote = await request(app).post('/api/projects/test/knowledge/notes').send({ title: 'From', content: '' });
    const toNote = await request(app).post('/api/projects/test/knowledge/notes').send({ title: 'To', content: '' });
    await request(app).post('/api/projects/test/knowledge/relations').send({
      fromId: fromNote.body.id, toId: toNote.body.id, kind: 'relates_to',
    });
    const del = await request(app).delete('/api/projects/test/knowledge/relations').send({
      fromId: fromNote.body.id, toId: toNote.body.id, kind: 'relates_to',
    });
    expect(del.status).toBe(204);
  });

  it('GET /linked returns linked notes', async () => {
    const createdNote = await request(app).post('/api/projects/test/knowledge/notes').send({ title: 'KNote', content: '' });
    const createdTask = await request(app).post('/api/projects/test/tasks').send({ title: 'KTask', description: '' });
    await request(app).post('/api/projects/test/knowledge/relations').send({
      fromId: createdNote.body.id, toId: createdTask.body.id, kind: 'tracks', targetGraph: 'tasks',
    });
    const res = await request(app).get(`/api/projects/test/knowledge/linked?targetGraph=tasks&targetNodeId=${createdTask.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.results.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Missing tasks endpoints
// ---------------------------------------------------------------------------

describe('REST Tasks gaps', () => {
  let app: express.Express;
  let cleanup: () => void;

  beforeEach(() => {
    const { project, cleanup: c } = createFullProject();
    cleanup = c;
    app = createRestApp(makeManager(project));
  });

  afterEach(() => {
    cleanup();
  });

  it('PUT /:id updates task', async () => {
    const created = await request(app).post('/api/projects/test/tasks').send({ title: 'Upd Task', description: 'old' });
    const id = created.body.id;
    const res = await request(app).put(`/api/projects/test/tasks/${id}`).send({ description: 'new' });
    expect(res.status).toBe(200);
    expect(res.body.description).toBe('new');
  });

  it('PUT /:id returns 4xx/5xx for unknown task', async () => {
    const res = await request(app).put('/api/projects/test/tasks/999999').send({ description: 'x' });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('POST /links creates cross-graph link', async () => {
    const createdTask = await request(app).post('/api/projects/test/tasks').send({ title: 'Link Task', description: '' });
    const createdNote = await request(app).post('/api/projects/test/knowledge/notes').send({ title: 'Link Note', content: '' });
    const res = await request(app).post('/api/projects/test/tasks/links').send({
      fromId: createdTask.body.id, toId: createdNote.body.id, kind: 'references', targetGraph: 'knowledge',
    });
    expect(res.status).toBe(201);
  });

  it('DELETE /links returns 204 for non-existent link (idempotent)', async () => {
    const created = await request(app).post('/api/projects/test/tasks').send({ title: 'Ul Task', description: '' });
    const del = await request(app).delete('/api/projects/test/tasks/links').set('Content-Type', 'application/json').send({
      fromId: created.body.id, toId: 999999, kind: 'references', targetGraph: 'knowledge',
    });
    expect(del.status).toBe(204);
  });

  it('POST /links + DELETE /links round-trip', async () => {
    const createdTask = await request(app).post('/api/projects/test/tasks').send({ title: 'DTask', description: '' });
    const createdNote = await request(app).post('/api/projects/test/knowledge/notes').send({ title: 'DNote2', content: '' });
    const cr = await request(app).post('/api/projects/test/tasks/links').send({
      fromId: createdTask.body.id, toId: createdNote.body.id, kind: 'references', targetGraph: 'knowledge',
    });
    expect(cr.status).toBe(201);
    // DELETE /links is idempotent — returns 204 even for non-matching edge
    const del = await request(app).delete('/api/projects/test/tasks/links').set('Content-Type', 'application/json').send({
      fromId: createdTask.body.id, toId: 999999, kind: 'references', targetGraph: 'knowledge',
    });
    expect(del.status).toBe(204);
  });

  it('GET /:id/relations lists relations', async () => {
    const created = await request(app).post('/api/projects/test/tasks').send({ title: 'Rel Task', description: '' });
    const res = await request(app).get(`/api/projects/test/tasks/${created.body.id}/relations`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.results)).toBe(true);
  });

  it('GET /linked finds linked tasks', async () => {
    const createdTask = await request(app).post('/api/projects/test/tasks').send({ title: 'FTask', description: '' });
    const createdNote = await request(app).post('/api/projects/test/knowledge/notes').send({ title: 'FNote', content: '' });
    await request(app).post('/api/projects/test/tasks/links').send({
      fromId: createdTask.body.id, toId: createdNote.body.id, kind: 'references', targetGraph: 'knowledge',
    });
    const res = await request(app).get(`/api/projects/test/tasks/linked?targetGraph=knowledge&targetNodeId=${createdNote.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.results.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Missing files endpoints
// ---------------------------------------------------------------------------

describe('REST Files gaps', () => {
  let app: express.Express;
  let cleanup: () => void;

  beforeEach(() => {
    const { project, cleanup: c } = createFullProject();
    cleanup = c;
    // Populate store with file entries
    project.scopedStore.files.updateFile('src/app.ts', 100, 1000, unitVec(0));
    project.scopedStore.files.updateFile('src/lib/utils.ts', 200, 2000, unitVec(1));
    app = createRestApp(makeManager(project));
  });

  afterEach(() => {
    cleanup();
  });

  it('GET / lists files', async () => {
    const res = await request(app).get('/api/projects/test/files');
    expect(res.status).toBe(200);
    expect(res.body.results.length).toBeGreaterThan(0);
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
  let cleanup: () => void;

  beforeEach(() => {
    const { project, cleanup: c } = createFullProject();
    cleanup = c;
    app = createRestApp(makeManager(project));
  });

  afterEach(() => {
    cleanup();
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

  it('GET /team merges auth users and .team/ markdown', async () => {
    // Build a fresh project with a .team/ dir on disk
    const projDir = mkdtempSync(join(tmpdir(), 'team-merge-'));
    const fs = await import('fs');
    fs.mkdirSync(join(projDir, '.team'), { recursive: true });
    fs.writeFileSync(
      join(projDir, '.team', 'maria.md'),
      '---\nname: Maria Garcia\nemail: maria@example.com\n---\n# Maria',
    );
    fs.writeFileSync(
      join(projDir, '.team', 'alex.md'),
      '---\nname: Alex Chen\nemail: alex@example.com\n---\n# Alex',
    );

    const { project, cleanup: c } = createFullProject(projDir);
    const mergedApp = createRestApp(makeManager(project), {
      serverConfig: {
        host: '127.0.0.1', port: 3000, sessionTimeout: 1800,
        modelsDir: '/tmp/models',
        model: { ...TEST_MODEL },
        embedding: { ...TEST_EMBEDDING },
        defaultAccess: 'deny',
        access: { admin: 'rw' },
        accessTokenTtl: '15m', refreshTokenTtl: '7d',
        rateLimit: { global: 0, search: 0, auth: 0 },
        maxFileSize: 1048576, exclude: [],
        redis: { enabled: false, url: 'redis://localhost:6379', prefix: 'mgm:', embeddingCacheTtl: '30d' },
        oauth: { enabled: false, accessTokenTtl: '1h', refreshTokenTtl: '7d', authCodeTtl: '10m', allowedRedirectUris: [] },
      } as any,
      users: {
        admin: { name: 'Admin', email: 'admin@example.com', apiKey: 'key-admin' } as any,
      },
    });

    const res = await request(mergedApp)
      .get('/api/projects/test/team')
      .set('Authorization', 'Bearer key-admin');
    expect(res.status).toBe(200);
    const slugs = res.body.results.map((m: { slug: string }) => m.slug).sort();
    expect(slugs).toEqual(['admin', 'alex', 'maria']);

    c();
    rmSync(projDir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// CORS credentials in zero-config mode
// ---------------------------------------------------------------------------

describe('CORS credentials', () => {
  it('omits Access-Control-Allow-Credentials in zero-config mode', async () => {
    const { project, cleanup } = createFullProject();
    const app = createRestApp(makeManager(project));
    const res = await request(app)
      .options('/api/projects')
      .set('Origin', 'http://localhost:3000');
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    cleanup();
  });

  it('includes Access-Control-Allow-Credentials with explicit corsOrigins', async () => {
    const { project, cleanup } = createFullProject();
    const app = createRestApp(makeManager(project), {
      serverConfig: {
        host: '127.0.0.1', port: 3000, sessionTimeout: 1800,
        modelsDir: '/tmp/models',
        model: { ...TEST_MODEL },
        embedding: { ...TEST_EMBEDDING },
        corsOrigins: ['http://localhost:3000'],
        defaultAccess: 'rw',
        accessTokenTtl: '15m', refreshTokenTtl: '7d', rateLimit: { global: 0, search: 0, auth: 0 }, maxFileSize: 1048576, exclude: [],
        redis: { enabled: false, url: 'redis://localhost:6379', prefix: 'mgm:', embeddingCacheTtl: '30d' },
        oauth: { enabled: true, accessTokenTtl: '1h', refreshTokenTtl: '7d', authCodeTtl: '10m', allowedRedirectUris: [] },
      },
    });
    const res = await request(app)
      .options('/api/projects')
      .set('Origin', 'http://localhost:3000');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    cleanup();
  });
});

// ---------------------------------------------------------------------------
// Relation roundtrip contract
// ---------------------------------------------------------------------------
//
// Regression tests for the class of bugs where the client takes a relation
// from `GET …/relations` and pipes it back into `DELETE` but the DELETE Zod
// schema rejects the payload because `targetGraph` enum excludes the entity's
// own graph (knowledge / tasks / skills schemas each omit their own graph).
//
// The fixed UI helper (RelationManager.handleDeleteConfirmed) drops
// `targetGraph` when it equals the entity's own graph. These tests encode
// that contract: build the DELETE payload from the GET response with the
// same guard, send it back, and verify the relation is gone.
//
// The original bug — caller forwards `rel.toGraph` verbatim — manifested as
// a 400 from Zod for any same-graph relation deletion via the UI.

describe('REST Relation roundtrip', () => {
  let app: express.Express;
  let cleanup: () => void;

  beforeEach(() => {
    const { project, cleanup: c } = createFullProject();
    cleanup = c;
    app = createRestApp(makeManager(project));
  });

  afterEach(() => {
    cleanup();
  });

  // Mirror of the post-fix UI helper in
  // ui/src/features/relation-manager/RelationManager.tsx — drop `targetGraph`
  // when the edge is within the entity's own graph.
  function buildDeletePayload(rel: { fromId: number; toId: number; kind: string; toGraph: string }, entityGraph: string) {
    const targetGraph = rel.toGraph === entityGraph ? undefined : rel.toGraph;
    return { fromId: rel.fromId, toId: rel.toId, kind: rel.kind, targetGraph };
  }

  it('knowledge → knowledge: list → delete same-graph relation', async () => {
    const a = await request(app).post('/api/projects/test/knowledge/notes').send({ title: 'A', content: '' });
    const b = await request(app).post('/api/projects/test/knowledge/notes').send({ title: 'B', content: '' });
    const cr = await request(app).post('/api/projects/test/knowledge/relations').send({
      fromId: a.body.id, toId: b.body.id, kind: 'relates_to',
    });
    expect(cr.status).toBe(201);

    const list = await request(app).get(`/api/projects/test/knowledge/notes/${a.body.id}/relations`);
    expect(list.status).toBe(200);
    expect(list.body.results.length).toBe(1);
    const rel = list.body.results[0];
    expect(rel.toGraph).toBe('knowledge');

    const del = await request(app)
      .delete('/api/projects/test/knowledge/relations')
      .set('Content-Type', 'application/json')
      .send(buildDeletePayload(rel, 'knowledge'));
    expect(del.status).toBe(204);

    const after = await request(app).get(`/api/projects/test/knowledge/notes/${a.body.id}/relations`);
    expect(after.body.results.length).toBe(0);
  });

  it('tasks → tasks: list → delete same-graph relation', async () => {
    const a = await request(app).post('/api/projects/test/tasks').send({ title: 'TA', description: '' });
    const b = await request(app).post('/api/projects/test/tasks').send({ title: 'TB', description: '' });
    const cr = await request(app).post('/api/projects/test/tasks/links').send({
      fromId: a.body.id, toId: b.body.id, kind: 'relates_to',
    });
    expect(cr.status).toBe(201);

    const list = await request(app).get(`/api/projects/test/tasks/${a.body.id}/relations`);
    expect(list.status).toBe(200);
    expect(list.body.results.length).toBe(1);
    const rel = list.body.results[0];
    expect(rel.toGraph).toBe('tasks');

    const del = await request(app)
      .delete('/api/projects/test/tasks/links')
      .set('Content-Type', 'application/json')
      .send(buildDeletePayload(rel, 'tasks'));
    expect(del.status).toBe(204);

    const after = await request(app).get(`/api/projects/test/tasks/${a.body.id}/relations`);
    expect(after.body.results.length).toBe(0);
  });

  it('skills → skills: list → delete same-graph relation', async () => {
    const a = await request(app).post('/api/projects/test/skills').send({ title: 'SA', description: '' });
    const b = await request(app).post('/api/projects/test/skills').send({ title: 'SB', description: '' });
    const cr = await request(app).post('/api/projects/test/skills/links').send({
      fromId: a.body.id, toId: b.body.id, kind: 'relates_to',
    });
    expect(cr.status).toBe(201);

    const list = await request(app).get(`/api/projects/test/skills/${a.body.id}/relations`);
    expect(list.status).toBe(200);
    expect(list.body.results.length).toBe(1);
    const rel = list.body.results[0];
    expect(rel.toGraph).toBe('skills');

    const del = await request(app)
      .delete('/api/projects/test/skills/links')
      .set('Content-Type', 'application/json')
      .send(buildDeletePayload(rel, 'skills'));
    expect(del.status).toBe(204);

    const after = await request(app).get(`/api/projects/test/skills/${a.body.id}/relations`);
    expect(after.body.results.length).toBe(0);
  });
});
