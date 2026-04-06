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
// Setup helpers (same pattern as rest-api.test.ts)
// ---------------------------------------------------------------------------

function fakeEmbed(q: string): Promise<number[]> {
  return Promise.resolve(unitVec(q.length % DIM));
}

const TEST_MODEL = { name: 'test', pooling: 'mean' as const, normalize: true, queryPrefix: '', documentPrefix: '' };
const TEST_EMBEDDING = { batchSize: 1, maxChars: 2000, cacheSize: 0 };

function testGraphConfigs(overrides?: Record<string, Partial<{ enabled: boolean; readonly: boolean }>>) {
  return Object.fromEntries(
    ['docs', 'code', 'knowledge', 'tasks', 'files', 'skills'].map(g => [g, {
      enabled: true,
      readonly: false,
      include: g === 'docs' ? '**/*.md' : g === 'code' ? '**/*.ts' : undefined,
      exclude: [],
      model: { ...TEST_MODEL },
      embedding: { ...TEST_EMBEDDING },
      ...overrides?.[g],
    }]),
  ) as any;
}

function createTestProject(graphOverrides?: Record<string, Partial<{ enabled: boolean; readonly: boolean }>>) {
  const dbDir = mkdtempSync(join(tmpdir(), 'rest-err-db-'));
  const dbPath = join(dbDir, 'test.db');
  const projectDir = '/tmp/rest-err-test';

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

  const project: ProjectInstance = {
    id: 'test',
    config: {
      projectDir,
      graphMemory: path.join(projectDir, '.graph-memory'),
      exclude: [],
      chunkDepth: 4,
      maxFileSize: 1048576,
      model: { ...TEST_MODEL },
      embedding: { ...TEST_EMBEDDING },
      graphConfigs: testGraphConfigs(graphOverrides),
      author: { name: '', email: '' },
    },
    scopedStore,
    dbProjectId: dbProject.id,
    storeManager,
    embedFns: {
      docs: embedFnPair(fakeEmbed),
      code: embedFnPair(fakeEmbed),
      knowledge: embedFnPair(fakeEmbed),
      tasks: embedFnPair(fakeEmbed),
      files: embedFnPair(fakeEmbed),
      skills: embedFnPair(fakeEmbed),
    },
    mutationQueue: new PromiseQueue(),
    dirty: false,
  };

  const cleanup = () => {
    store.close();
    rmSync(dbDir, { recursive: true, force: true });
  };

  return { project, cleanup };
}

function createTestManager(project: ProjectInstance): ProjectManager {
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
// Tests
// ---------------------------------------------------------------------------

describe('REST API error responses', () => {
  let app: express.Express;
  let cleanup: () => void;

  beforeEach(() => {
    const { project, cleanup: c } = createTestProject();
    cleanup = c;
    app = createRestApp(createTestManager(project));
  });

  afterEach(() => cleanup());

  // --- 404 for non-existent resources ---

  describe('404 responses', () => {
    it('returns 404 for unknown project', async () => {
      const res = await request(app).get('/api/projects/nonexistent/stats');
      expect(res.status).toBe(404);
    });

    it('returns 404 for non-existent note', async () => {
      const res = await request(app).get('/api/projects/test/knowledge/notes/99999');
      expect(res.status).toBe(404);
    });

    it('returns 404 for non-existent task', async () => {
      const res = await request(app).get('/api/projects/test/tasks/99999');
      expect(res.status).toBe(404);
    });

    it('returns 404 for non-existent skill', async () => {
      const res = await request(app).get('/api/projects/test/skills/99999');
      expect(res.status).toBe(404);
    });

    it('returns 404 for non-existent epic', async () => {
      const res = await request(app).get('/api/projects/test/epics/99999');
      expect(res.status).toBe(404);
    });

    it('returns 404 for unknown route', async () => {
      const res = await request(app).get('/api/projects/test/nonexistent');
      expect(res.status).toBe(404);
    });
  });

  // --- 400 for invalid input ---

  describe('400 responses', () => {
    it('rejects note creation without title', async () => {
      const res = await request(app)
        .post('/api/projects/test/knowledge/notes')
        .send({ content: 'no title' });
      expect(res.status).toBe(400);
    });

    it('rejects task creation without title', async () => {
      const res = await request(app)
        .post('/api/projects/test/tasks')
        .send({ description: 'no title' });
      expect(res.status).toBe(400);
    });

    it('rejects skill creation without title', async () => {
      const res = await request(app)
        .post('/api/projects/test/skills')
        .send({ description: 'no title' });
      expect(res.status).toBe(400);
    });

    it('rejects epic creation without title', async () => {
      const res = await request(app)
        .post('/api/projects/test/epics')
        .send({ description: 'no title' });
      expect(res.status).toBe(400);
    });

    it('rejects update with non-numeric ID', async () => {
      const res = await request(app)
        .put('/api/projects/test/knowledge/notes/abc')
        .send({ title: 'x' });
      // Non-numeric IDs result in NaN → not found or server error
      expect([400, 404, 500]).toContain(res.status);
    });

    it('rejects delete with non-numeric ID', async () => {
      const res = await request(app).delete('/api/projects/test/tasks/abc');
      // Non-numeric IDs result in NaN → not found
      expect([400, 404]).toContain(res.status);
    });
  });

  // --- CRUD operations ---

  describe('successful CRUD', () => {
    it('creates and deletes a note', async () => {
      const created = await request(app)
        .post('/api/projects/test/knowledge/notes')
        .send({ title: 'Temp', content: 'Will delete' });
      expect(created.status).toBe(201);

      const res = await request(app).delete(`/api/projects/test/knowledge/notes/${created.body.id}`);
      expect(res.status).toBe(204);

      const get = await request(app).get(`/api/projects/test/knowledge/notes/${created.body.id}`);
      expect(get.status).toBe(404);
    });

    it('creates and deletes a task', async () => {
      const created = await request(app)
        .post('/api/projects/test/tasks')
        .send({ title: 'Temp task' });
      expect(created.status).toBe(201);

      const res = await request(app).delete(`/api/projects/test/tasks/${created.body.id}`);
      expect(res.status).toBe(204);
    });

    it('creates and updates a note', async () => {
      const created = await request(app)
        .post('/api/projects/test/knowledge/notes')
        .send({ title: 'Original', content: 'Old' });

      const updated = await request(app)
        .put(`/api/projects/test/knowledge/notes/${created.body.id}`)
        .send({ title: 'Updated' });
      expect(updated.status).toBe(200);
      expect(updated.body.title).toBe('Updated');
    });
  });

  // --- Readonly graph enforcement ---

  describe('readonly graph enforcement', () => {
    it('rejects mutations on readonly knowledge graph', async () => {
      const { project: roProject, cleanup: roCleanup } = createTestProject({
        knowledge: { enabled: true, readonly: true },
      });
      const roApp = createRestApp(createTestManager(roProject));

      const res = await request(roApp)
        .post('/api/projects/test/knowledge/notes')
        .send({ title: 'Should fail', content: 'x' });
      expect(res.status).toBe(403);

      roCleanup();
    });

    it('rejects mutations on readonly tasks graph', async () => {
      const { project: roProject, cleanup: roCleanup } = createTestProject({
        tasks: { enabled: true, readonly: true },
      });
      const roApp = createRestApp(createTestManager(roProject));

      const res = await request(roApp)
        .post('/api/projects/test/tasks')
        .send({ title: 'Should fail' });
      expect(res.status).toBe(403);

      roCleanup();
    });
  });

  // --- Search endpoints ---

  describe('search', () => {
    it('returns results for knowledge search', async () => {
      await request(app)
        .post('/api/projects/test/knowledge/notes')
        .send({ title: 'Searchable note', content: 'Find me' });

      const res = await request(app).get('/api/projects/test/knowledge/search?q=Searchable');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.results)).toBe(true);
    });

    it('returns results for task search', async () => {
      await request(app)
        .post('/api/projects/test/tasks')
        .send({ title: 'Searchable task' });

      const res = await request(app).get('/api/projects/test/tasks/search?q=Searchable');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.results)).toBe(true);
    });

    it('returns empty results for no matches', async () => {
      const res = await request(app).get('/api/projects/test/knowledge/search?q=xyznonexistent');
      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(0);
    });
  });

  // --- Task-specific endpoints ---

  describe('task move', () => {
    it('moves task to done', async () => {
      const created = await request(app)
        .post('/api/projects/test/tasks')
        .send({ title: 'Move me' });

      const res = await request(app)
        .post(`/api/projects/test/tasks/${created.body.id}/move`)
        .send({ status: 'done' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('done');
      expect(res.body.completedAt).not.toBeNull();
    });

    it('rejects move with invalid status', async () => {
      const created = await request(app)
        .post('/api/projects/test/tasks')
        .send({ title: 'Bad move' });

      const res = await request(app)
        .post(`/api/projects/test/tasks/${created.body.id}/move`)
        .send({ status: 'invalid_status' });
      expect(res.status).toBe(400);
    });
  });

  // --- Bulk task operations ---

  describe('bulk task operations', () => {
    it('bulk moves tasks', async () => {
      const t1 = await request(app).post('/api/projects/test/tasks').send({ title: 'T1' });
      const t2 = await request(app).post('/api/projects/test/tasks').send({ title: 'T2' });

      const res = await request(app)
        .post('/api/projects/test/tasks/bulk/move')
        .send({ taskIds: [String(t1.body.id), String(t2.body.id)], status: 'done' });
      expect(res.status).toBe(200);
    });

    it('bulk deletes tasks', async () => {
      const t1 = await request(app).post('/api/projects/test/tasks').send({ title: 'D1' });
      const t2 = await request(app).post('/api/projects/test/tasks').send({ title: 'D2' });

      const res = await request(app)
        .post('/api/projects/test/tasks/bulk/delete')
        .send({ taskIds: [String(t1.body.id), String(t2.body.id)] });
      expect(res.status).toBe(200);
    });

    it('rejects bulk move with empty array', async () => {
      const res = await request(app)
        .post('/api/projects/test/tasks/bulk/move')
        .send({ taskIds: [], status: 'done' });
      expect(res.status).toBe(400);
    });
  });
});
